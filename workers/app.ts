// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { routeAgentRequest } from "agents";
import { WorkerEntrypoint } from "cloudflare:workers";
import { Hono } from "hono";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createRequestHandler, RouterContextProvider } from "react-router";
import { app as apiApp, receiveEmail } from "./index";
import { AI_MAILBOX } from "./lib/config";
import {
	canAccessMailbox,
	getSuperAdminEmails,
	principalFromAccessPayload,
	type AuthPrincipal,
} from "./lib/authz";
import { EmailMCP } from "./mcp";
import type { Env } from "./types";

export { MailboxDO } from "./durableObject";
export { EmailAgent } from "./agent";
export { EmailMCP } from "./mcp";
export { AuthzDO } from "./lib/authz";

export class EmailIngress extends WorkerEntrypoint<Env> {
	async ingestEmail(message: { from: string; to: string; raw: ArrayBuffer }) {
		return this.#ingest(message, false);
	}

	async ingestAuthenticationEmail(message: { from: string; to: string; raw: ArrayBuffer }) {
		return this.#ingest(message, true);
	}

	async #ingest(message: { from: string; to: string; raw: ArrayBuffer }, requireTwofa: boolean) {
		const raw = message.raw;
		return receiveEmail({
			from: message.from,
			to: message.to,
			headers: new Headers(),
			raw: new Response(raw).body!,
			rawSize: raw.byteLength,
			setReject(reason: string) {
				throw new Error(reason);
			},
			async forward() {
				throw new Error("Internally routed email cannot be forwarded again");
			},
			async reply() {
				throw new Error("Internally routed email cannot be replied to during ingestion");
			},
		}, this.env, this.ctx, AI_MAILBOX, requireTwofa);
	}
}

declare module "react-router" {
	export interface AppLoadContext {
		cloudflare: {
			env: Env;
			ctx: ExecutionContext;
		};
	}
}

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

function getAccessUrls(teamDomain: string) {
	const certsPath = "/cdn-cgi/access/certs";
	const teamUrl = new URL(teamDomain);
	const issuer = teamUrl.origin;
	const certsUrl = teamUrl.pathname.endsWith(certsPath)
		? teamUrl
		: new URL(certsPath, issuer);

	return { issuer, certsUrl };
}

function isLocalRequest(request: Request) {
	const hostname = new URL(request.url).hostname;
	return !request.cf || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

type AppContext = {
	Bindings: Env;
	Variables: {
		principal: AuthPrincipal;
	};
};

function getLocalPrincipal(env: Env): AuthPrincipal {
	const firstAdmin = getSuperAdminEmails(env)[0] ?? "local-dev@hyatus.com";
	const email = firstAdmin.toLowerCase();
	return { type: "human", id: email, email, label: email };
}

function getMcpExecutionContext(ctx: ExecutionContext, principal: AuthPrincipal) {
	const mcpCtx = ctx as ExecutionContext & { props?: Record<string, unknown> };
	mcpCtx.props = { principal };
	return mcpCtx;
}

async function authorizeAgentMailbox(env: Env, principal: AuthPrincipal, request: Request) {
	const url = new URL(request.url);
	const parts = url.pathname.split("/").filter(Boolean);
	if (parts[0] !== "agents" || parts[1] !== "EmailAgent" || !parts[2]) return true;
	const mailboxId = decodeURIComponent(parts[2]).toLowerCase();
	const exists = await env.BUCKET.head(`mailboxes/${mailboxId}.json`);
	if (!exists) return false;
	return canAccessMailbox(env, principal, mailboxId);
}

// Main app that wraps the API and adds React Router fallback
const app = new Hono<AppContext>();

// Cloudflare Access JWT validation middleware (production only)
app.use("*", async (c, next) => {
	// Skip validation in local development only.
	if (import.meta.env.DEV || isLocalRequest(c.req.raw)) {
		c.set("principal", getLocalPrincipal(c.env));
		return next();
	}

	const { POLICY_AUD, TEAM_DOMAIN } = c.env;

	// Fail closed in production if Access is not configured.
	if (!POLICY_AUD || !TEAM_DOMAIN) {
		return c.text(
			"Cloudflare Access must be configured in production. Set POLICY_AUD and TEAM_DOMAIN.",
			500,
		);
	}

	const token = c.req.header("cf-access-jwt-assertion");
	if (!token) {
		return c.text("Missing required CF Access JWT", 403);
	}

	try {
		const { issuer, certsUrl } = getAccessUrls(TEAM_DOMAIN);
		const JWKS = createRemoteJWKSet(certsUrl);
		const { payload } = await jwtVerify(token, JWKS, {
			issuer,
			audience: POLICY_AUD,
		});
		c.set("principal", principalFromAccessPayload(payload as Record<string, unknown>));
	} catch {
		return c.text("Invalid or expired Access token", 403);
	}

	return next();
});

// MCP server endpoint — used by AI coding tools (ProtoAgent, Claude Code, Cursor, etc.)
// Must be before API routes and React Router catch-all
const mcpHandler = EmailMCP.serve("/mcp", { binding: "EMAIL_MCP" });
app.all("/mcp", async (c) => {
	return mcpHandler.fetch(c.req.raw, c.env, getMcpExecutionContext(c.executionCtx as ExecutionContext, c.var.principal));
});
app.all("/mcp/*", async (c) => {
	return mcpHandler.fetch(c.req.raw, c.env, getMcpExecutionContext(c.executionCtx as ExecutionContext, c.var.principal));
});

// Mount the API routes
app.route("/", apiApp);

// Agent WebSocket routing - must be before React Router catch-all
app.all("/agents/*", async (c) => {
	const allowed = await authorizeAgentMailbox(c.env, c.var.principal, c.req.raw);
	if (!allowed) return c.text("Not authorized for mailbox", 403);
	const response = await routeAgentRequest(c.req.raw, c.env, {
		props: { principal: c.var.principal },
	});
	if (response) return response;
	return c.text("Agent not found", 404);
});

// React Router catch-all: serves the SPA for all non-API routes
app.all("*", (c) => {
	return requestHandler(c.req.raw, new RouterContextProvider());
});

// Export the Hono app as the default export with an email handler
export default {
	fetch: app.fetch,
	async email(
		event: ForwardableEmailMessage,
		env: Env,
		ctx: ExecutionContext,
	) {
		try {
			await receiveEmail(event, env, ctx);
		} catch (e) {
			console.error("Failed to process incoming email:", (e as Error).message, (e as Error).stack);
			// Re-throw so Cloudflare's email routing can retry delivery or bounce the message.
			// Swallowing the error would silently drop the email.
			throw e;
		}
	},
};
