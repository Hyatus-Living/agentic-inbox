// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import PostalMime from "postal-mime";
import { z } from "zod";
import { storeAttachments, type StoredAttachment } from "./lib/attachments";
import {
	listCanonicalMailboxes,
} from "./lib/email-helpers";
import { Folders } from "../shared/folders";
import type { Env } from "./types";
import { requireMailbox, type MailboxContext } from "./lib/mailbox";
import {
	filterVisibleMailboxes,
	getAuthzStub,
	isSuperAdmin,
	type AuthPrincipal,
	type GrantRole,
	type PrincipalType,
} from "./lib/authz";
import {
	defaultMailboxSettings,
	getConfiguredEmailAddresses,
	getEmailAddressAliases,
	getConfiguredMailboxIds,
	getContentForwardRules,
	getContentLabelRules,
	isAutoDraftEnabled,
	isInboundOnly,
	resolveMailboxForRecipients,
	type ContentLabelRule,
} from "./lib/config";
import {
	hasAttachedEmailMessages,
	shouldExtractReviewRemoval,
	shouldUseOuterReviewRemovalCandidate,
} from "./review-removal-routing";
import { getClaudeLoginSmsMatch, getTwofaEmailMatch } from "./twofa-routing";

type AppContext = Context<MailboxContext>;

// -- Request body schemas (kept for validation) ---------------------

const CreateMailboxBody = z.object({
	email: z.string().email(),
	name: z.string().min(1),
	settings: z.record(z.any()).optional(), // unvalidated — agentSystemPrompt goes straight to AI
});

const DraftBody = z.object({
	to: z.string().optional(),
	cc: z.string().optional(),
	bcc: z.string().optional(),
	subject: z.string().optional(),
	body: z.string(),
	in_reply_to: z.string().optional(),
	thread_id: z.string().optional(),
	draft_id: z.string().optional(),
});

const GrantBody = z.object({
	principalType: z.enum(["human", "service_token"]),
	principalId: z.string().min(1),
	role: z.enum(["viewer", "service_agent"]).optional(),
	label: z.string().optional(),
});

const SuperAdminBody = z.object({
	email: z.string().email(),
	label: z.string().optional(),
});

// -- Helpers --------------------------------------------------------

function outboundDisabled(c: AppContext) {
	return c.json({ error: "Outbound email is disabled for this inbound-only Hyatus deployment." }, 403);
}

function currentPrincipal(c: AppContext): AuthPrincipal {
	const principal = c.var.principal;
	if (!principal) throw new Error("Cloudflare Access principal missing");
	return principal;
}

async function currentUserIsSuperAdmin(c: AppContext) {
	return isSuperAdmin(c.env, currentPrincipal(c));
}

async function requireSuperAdmin(c: AppContext) {
	if (!(await currentUserIsSuperAdmin(c))) return c.json({ error: "Super admin access required" }, 403);
	return null;
}

function normalizeGrantInput(input: z.infer<typeof GrantBody>, mailboxId: string) {
	const principalType = input.principalType as PrincipalType;
	const principalId = principalType === "human"
		? input.principalId.trim().toLowerCase()
		: input.principalId.trim();
	if (principalType === "human" && !principalId.endsWith("@hyatus.com")) {
		throw new Error("Human grants must use a @hyatus.com Google Workspace account");
	}
	const role = (input.role ?? (principalType === "service_token" ? "service_agent" : "viewer")) as GrantRole;
	return {
		mailboxId: mailboxId.toLowerCase(),
		principalType,
		principalId,
		role,
		label: input.label?.trim() || undefined,
	};
}

function slugify(text: string) { // can return "" for non-alphanumeric input
	return text.toString().toLowerCase()
		.replace(/\s+/g, "-").replace(/[^\w-]+/g, "")
		.replace(/--+/g, "-").replace(/^-+/, "").replace(/-+$/, "");
}

function intQuery(c: AppContext, key: string): number | undefined {
	const v = c.req.query(key);
	if (!v) return undefined;
	const n = Number(v);
	return Number.isNaN(n) ? undefined : n;
}

function boolQuery(c: AppContext, key: string): boolean | undefined {
	const v = c.req.query(key);
	if (v === undefined || v === "") return undefined;
	return v === "true" || v === "1";
}

// -- App & middleware -----------------------------------------------

const app = new Hono<MailboxContext>();
app.use("/api/*", cors({
	origin: (origin) => {
		// Same-origin requests have no Origin header — allow them.
		if (!origin) return origin;
		// In development, allow localhost for Vite dev server.
		try {
			const url = new URL(origin);
			if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
		} catch { /* invalid origin */ }
		// Block all other cross-origin requests. The app is served from the
		// same origin as the API, so legitimate browser requests never send
		// an Origin header. Returning undefined omits Access-Control-Allow-Origin.
		return undefined;
	},
}));
app.use("/api/v1/mailboxes/:mailboxId", requireMailbox);
app.use("/api/v1/mailboxes/:mailboxId/*", requireMailbox);

// -- Config ---------------------------------------------------------

app.get("/api/v1/config", async (c) => {
	const domainsRaw = c.env.DOMAINS || "";
	const domains = domainsRaw.split(",").map((d) => d.trim()).filter(Boolean);
	const emailAddresses = getConfiguredMailboxIds(c.env);
	const emailAddressAliases = getEmailAddressAliases(c.env);
	const isAdmin = await currentUserIsSuperAdmin(c);
	return c.json({
		domains,
		emailAddresses: isAdmin ? emailAddresses : [],
		emailAddressAliases,
		inboundOnly: isInboundOnly(c.env),
		autoDraftEnabled: isAutoDraftEnabled(c.env),
	});
});

app.get("/api/v1/me", async (c) => {
	const principal = currentPrincipal(c);
	const allMailboxes = await listCanonicalMailboxes(c.env);
	const visibleMailboxes = await filterVisibleMailboxes(c.env, principal, allMailboxes.map((m) => ({ ...m, name: m.id })));
	return c.json({
		principal,
		isSuperAdmin: await isSuperAdmin(c.env, principal),
		visibleMailboxes: visibleMailboxes.map((mailbox) => mailbox.id),
	});
});

// -- Admin ----------------------------------------------------------

app.use("/api/v1/admin/*", async (c, next) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	await next();
});

app.get("/api/v1/admin/principals", async (c) => {
	return c.json(await getAuthzStub(c.env).listPrincipals());
});

app.get("/api/v1/admin/super-admins", async (c) => {
	return c.json(await getAuthzStub(c.env).listSuperAdmins());
});

app.put("/api/v1/admin/super-admins", async (c) => {
	const parsed = SuperAdminBody.parse(await c.req.json());
	if (!parsed.email.trim().toLowerCase().endsWith("@hyatus.com")) {
		return c.json({ error: "Super admins must use a @hyatus.com Google Workspace account" }, 400);
	}
	return c.json(await getAuthzStub(c.env).upsertSuperAdmin(parsed.email, parsed.label));
});

app.delete("/api/v1/admin/super-admins/:email", async (c) => {
	return c.json(await getAuthzStub(c.env).deleteSuperAdmin(decodeURIComponent(c.req.param("email")!)));
});

app.get("/api/v1/admin/mailboxes/:mailboxId/grants", async (c) => {
	const mailboxId = c.req.param("mailboxId")!.toLowerCase();
	const mailbox = await c.env.BUCKET.head(`mailboxes/${mailboxId}.json`);
	if (!mailbox) return c.json({ error: "Not found" }, 404);
	return c.json(await getAuthzStub(c.env).listGrants(mailboxId));
});

app.put("/api/v1/admin/mailboxes/:mailboxId/grants", async (c) => {
	const mailboxId = c.req.param("mailboxId")!.toLowerCase();
	const mailbox = await c.env.BUCKET.head(`mailboxes/${mailboxId}.json`);
	if (!mailbox) return c.json({ error: "Not found" }, 404);
	const parsed = GrantBody.parse(await c.req.json());
	if (parsed.principalType === "human" && !parsed.principalId.trim().toLowerCase().endsWith("@hyatus.com")) {
		return c.json({ error: "Human grants must use a @hyatus.com Google Workspace account" }, 400);
	}
	const grant = normalizeGrantInput(parsed, mailboxId);
	return c.json(await getAuthzStub(c.env).upsertGrant(grant));
});

app.delete("/api/v1/admin/mailboxes/:mailboxId/grants/:principalId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!.toLowerCase();
	const principalId = decodeURIComponent(c.req.param("principalId")!);
	const mailbox = await c.env.BUCKET.head(`mailboxes/${mailboxId}.json`);
	if (!mailbox) return c.json({ error: "Not found" }, 404);
	return c.json(await getAuthzStub(c.env).deleteGrant(mailboxId, principalId));
});

// -- Mailboxes ------------------------------------------------------

app.get("/api/v1/mailboxes", async (c) => {
	const allMailboxes = await listCanonicalMailboxes(c.env);
	const visibleMailboxes = await filterVisibleMailboxes(c.env, currentPrincipal(c), allMailboxes.map((m) => ({ ...m, name: m.id })));
	return c.json(visibleMailboxes);
});

app.post("/api/v1/mailboxes", async (c) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	const { name, settings, email: rawEmail } = CreateMailboxBody.parse(await c.req.json());
	const email = rawEmail.toLowerCase();
	const allowedMailboxes = getConfiguredMailboxIds(c.env);
	if (allowedMailboxes.length > 0 && !allowedMailboxes.includes(email)) {
		return c.json({ error: "Mailbox creation is restricted to configured EMAIL_ADDRESSES" }, 403);
	}
	const key = `mailboxes/${email}.json`;
	if (await c.env.BUCKET.head(key)) return c.json({ error: "Mailbox already exists" }, 409);
	const finalSettings = { ...defaultMailboxSettings(email), fromName: name, ...settings };
	await c.env.BUCKET.put(key, JSON.stringify(finalSettings));
	const stub = c.env.MAILBOX.get(c.env.MAILBOX.idFromName(email));
	await stub.getFolders();
	return c.json({ id: email, email, name, settings: finalSettings }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId", async (c) => {
	const mailboxId = c.req.param("mailboxId")!;
	const obj = await c.env.BUCKET.get(`mailboxes/${mailboxId}.json`);
	if (!obj) return c.json({ error: "Not found" }, 404);
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings: await obj.json() });
});

app.put("/api/v1/mailboxes/:mailboxId", async (c) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	const mailboxId = c.req.param("mailboxId")!;
	const { settings } = (await c.req.json()) as { settings: Record<string, unknown> };
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.put(key, JSON.stringify(settings));
	return c.json({ id: mailboxId, name: mailboxId, email: mailboxId, settings });
});

app.delete("/api/v1/mailboxes/:mailboxId", async (c) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	const mailboxId = c.req.param("mailboxId")!;
	const key = `mailboxes/${mailboxId}.json`;
	if (!(await c.env.BUCKET.head(key))) return c.json({ error: "Not found" }, 404);
	await c.env.BUCKET.delete(key); // TODO: also delete DO data and R2 attachment blobs
	return c.body(null, 204);
});

// -- Emails ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	const folder = c.req.query("folder");
	const thread_id = c.req.query("thread_id");
	const threaded = boolQuery(c, "threaded");
	const page = intQuery(c, "page");
	const limit = intQuery(c, "limit");
	const sortColumn = c.req.query("sortColumn") as any;
	const sortDirection = c.req.query("sortDirection") as "ASC" | "DESC" | undefined;
	const stub = c.var.mailboxStub;

	if (threaded && folder) {
		const emails = await (stub as any).getThreadedEmails({ folder, page, limit });
		const totalCount = await (stub as any).countThreadedEmails(folder);
		return c.json({ emails, totalCount });
	}
	const emails = await stub.getEmails({ folder, thread_id, page, limit, sortColumn, sortDirection });
	if (folder) {
		const totalCount = await stub.countEmails({ folder, thread_id });
		return c.json({ emails, totalCount });
	}
	return c.json(emails);
});

app.post("/api/v1/mailboxes/:mailboxId/emails", async (c: AppContext) => {
	return outboundDisabled(c);
});

app.post("/api/v1/mailboxes/:mailboxId/drafts", async (c: AppContext) => {
	if (isInboundOnly(c.env)) return outboundDisabled(c);
	const mailboxId = c.req.param("mailboxId")!;
	const { to, cc, bcc, subject, body, in_reply_to, thread_id, draft_id } = DraftBody.parse(await c.req.json());
	const stub = c.var.mailboxStub;
	if (draft_id) await stub.deleteEmail(draft_id); // not atomic — create-then-delete would be safer
	const messageId = crypto.randomUUID();
	const now = new Date().toISOString();
	await stub.createEmail(Folders.DRAFT, {
		id: messageId, subject: subject || "", sender: mailboxId.toLowerCase(),
		recipient: (to || "").toLowerCase(), cc: cc?.toLowerCase() || null, bcc: bcc?.toLowerCase() || null,
		date: now, body, in_reply_to: in_reply_to || null, email_references: null,
		thread_id: thread_id || in_reply_to || messageId,
	}, []);
	return c.json({ id: messageId, status: "draft", subject: subject || "", recipient: to || "", date: now }, 201);
});

app.get("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const email = await c.var.mailboxStub.getEmail(c.req.param("id")!);
	if (!email) return c.json({ error: "Email not found" }, 404);
	return new Response(JSON.stringify(email), {
		headers: { "Content-Type": "application/json" },
	});
});

app.put("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const { read, starred } = (await c.req.json()) as { read?: boolean; starred?: boolean };
	const email = await c.var.mailboxStub.updateEmail(c.req.param("id")!, { read, starred });
	return email ? c.json(email) : c.json({ error: "Email not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/emails/:id", async (c: AppContext) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	const id = c.req.param("id")!;
	const attachments = await c.var.mailboxStub.deleteEmail(id);
	if (attachments === null) return c.json({ error: "Not found" }, 404);
	if (attachments.length > 0) await c.env.BUCKET.delete(attachments.map((att: any) => `attachments/${id}/${att.id}/${att.filename}`));
	return c.body(null, 204);
});

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/move", async (c: AppContext) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	const { folderId } = (await c.req.json()) as { folderId: string };
	const success = await c.var.mailboxStub.moveEmail(c.req.param("id")!, folderId);
	return success ? c.json({ status: "moved" }) : c.json({ error: "Folder not found" }, 400);
});

// -- Threads --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/threads/:threadId", async (c: AppContext) => {
	return c.json(await (c.var.mailboxStub as any).getThreadEmails(c.req.param("threadId")!));
});

app.post("/api/v1/mailboxes/:mailboxId/threads/:threadId/read", async (c: AppContext) => {
	await c.var.mailboxStub.markThreadRead(c.req.param("threadId")!);
	return c.json({ status: "marked_read" });
});

// -- Reply / Forward ------------------------------------------------

app.post("/api/v1/mailboxes/:mailboxId/emails/:id/reply", outboundDisabled);
app.post("/api/v1/mailboxes/:mailboxId/emails/:id/forward", outboundDisabled);

app.post("/api/v1/mailboxes/:mailboxId/content-labels/backfill", async (c: AppContext) => {
	const mailboxId = c.req.param("mailboxId")!.toLowerCase();
	const rules = getContentLabelRules(c.env).filter((rule) => rule.mailboxId.toLowerCase() === mailboxId);
	const stub = c.var.mailboxStub as unknown as {
		backfillContentLabels: (rules: ContentLabelRule[]) => Promise<unknown>;
	};
	return c.json(await stub.backfillContentLabels(rules));
});

// -- Folders --------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	await ensureContentLabelFolders(c.var.mailboxStub, c.env, c.req.param("mailboxId")!.toLowerCase());
	return c.json(await c.var.mailboxStub.getFolders());
});

app.post("/api/v1/mailboxes/:mailboxId/folders", async (c: AppContext) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	const { name } = (await c.req.json()) as { name: string };
	const slug = slugify(name);
	if (!slug) return c.json({ error: "Folder name must contain alphanumeric characters" }, 400);
	const f = await c.var.mailboxStub.createFolder(slug, name);
	return f ? c.json(f, 201) : c.json({ error: "Folder with this name already exists" }, 409);
});

app.put("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	const { name } = (await c.req.json()) as { name: string };
	const f = await c.var.mailboxStub.updateFolder(c.req.param("id")!, name);
	return f ? c.json(f) : c.json({ error: "Folder not found" }, 404);
});

app.delete("/api/v1/mailboxes/:mailboxId/folders/:id", async (c: AppContext) => {
	const denied = await requireSuperAdmin(c);
	if (denied) return denied;
	const ok = await c.var.mailboxStub.deleteFolder(c.req.param("id")!);
	return ok ? c.body(null, 204) : c.json({ error: "Folder not found or cannot be deleted" }, 400);
});

// -- Search ---------------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/search", async (c: AppContext) => {
	const searchOpts: Record<string, unknown> = {
		query: c.req.query("query") || "", folder: c.req.query("folder"), from: c.req.query("from"),
		to: c.req.query("to"), subject: c.req.query("subject"), date_start: c.req.query("date_start"),
		date_end: c.req.query("date_end"), is_read: boolQuery(c, "is_read"),
		is_starred: boolQuery(c, "is_starred"), has_attachment: boolQuery(c, "has_attachment"),
	};
	const stub = c.var.mailboxStub as any;
	const emails = await stub.searchEmails({ ...searchOpts, page: intQuery(c, "page"), limit: intQuery(c, "limit") });
	const totalCount = await stub.countSearchResults(searchOpts);
	return c.json({ emails, totalCount });
});

// -- Attachments ----------------------------------------------------

app.get("/api/v1/mailboxes/:mailboxId/emails/:emailId/attachments/:attachmentId", async (c: AppContext) => {
	const emailId = c.req.param("emailId")!;
	const attachmentId = c.req.param("attachmentId")!;
	const attachment = await c.var.mailboxStub.getAttachment(attachmentId);
	if (!attachment) return c.json({ error: "Attachment not found" }, 404);
	const obj = await c.env.BUCKET.get(`attachments/${emailId}/${attachmentId}/${attachment.filename}`);
	if (!obj) return c.json({ error: "Attachment file not found" }, 404);
	const headers = new Headers();
	headers.set("Content-Type", attachment.mimetype);
	const sanitized = attachment.filename.replace(/[\x00-\x1f"\\]/g, "_");
	headers.set("Content-Disposition", `attachment; filename="${sanitized}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`);
	return new Response(obj.body, { headers });
});

// -- Receive inbound email ------------------------------------------

const MAX_EMAIL_SIZE = 25 * 1024 * 1024;
const AUTOPROCESS_RECIPIENT = "autoprocess@hyatusliving.com";
const SIMPLE_AI_STRUCTURED_URL = "https://fast.gptpricing.com/simple-ai/structured";

interface ReviewRemovalExtraction {
	channel: string;
	channel_reservation_id: string;
	review_reference: string;
	extraction_purpose: string;
	review_has_been_removed: boolean;
}

interface ReviewRemovalContext {
	messageId: string;
	fromAddress: string;
	toAddress: string;
	mailboxId: string;
	subject: string;
	attachmentFilename?: string;
}

interface ReviewRemovalCandidate {
	emailText: string;
	context: ReviewRemovalContext;
}

interface KeycafeStatusExtraction {
	building_name: string;
	keycafe_status: "online" | "offline" | "unknown";
	issue_type: string;
	status_text: string;
	extraction_purpose: string;
}

interface KeycafeStatusContext {
	messageId: string;
	fromAddress: string;
	toAddress: string;
	mailboxId: string;
	subject: string;
}

type ParsedEmailAttachment = {
	filename?: string | null;
	mimeType?: string | null;
	content: ArrayBuffer | Uint8Array | string;
};

type ParsedEmailLike = {
	subject?: string;
	text?: string;
	html?: string;
	from?: { address?: string };
	attachments?: ParsedEmailAttachment[];
};

async function streamToArrayBuffer(stream: ReadableStream, streamSize: number) {
	if (streamSize > MAX_EMAIL_SIZE) throw new Error(`Email too large: ${streamSize} bytes exceeds ${MAX_EMAIL_SIZE} byte limit`);
	if (streamSize <= 0) throw new Error(`Invalid stream size: ${streamSize}`);
	const result = new Uint8Array(streamSize);
	let bytesRead = 0;
	const reader = stream.getReader();
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (bytesRead + value.length > streamSize) { reader.cancel(); throw new Error(`Stream exceeds declared size`); }
		result.set(value, bytesRead);
		bytesRead += value.length;
	}
	return result;
}

async function forwardMatchingContentRules(message: ForwardableEmailMessage, env: Env, mailboxId: string, searchText: string) {
	const rules = getContentForwardRules(env).filter((rule) => rule.mailboxId.toLowerCase() === mailboxId);
	const forwardedDestinations = new Set<string>();
	for (const rule of rules) {
		if (!new RegExp(rule.pattern, rule.flags ?? "i").test(searchText)) continue;
		const forwardTo = rule.forwardTo.toLowerCase();
		if (forwardedDestinations.has(forwardTo)) continue;
		const headers = new Headers();
		headers.set("X-Hyatus-Forward-Rule", rule.name);
		headers.set("X-Hyatus-Forward-Source-Mailbox", mailboxId);
		await message.forward(rule.forwardTo, headers);
		forwardedDestinations.add(forwardTo);
		console.log(`Forwarded ${mailboxId} email by content rule ${rule.name} to ${rule.forwardTo}`);
	}
}

function findContentLabelRule(env: Env, mailboxId: string, fromAddress: string, recipientText: string, searchText: string) {
	const rules = getContentLabelRules(env).filter((rule) => rule.mailboxId.toLowerCase() === mailboxId);
	return rules.find((rule) => {
		const flags = rule.flags ?? "i";
		if (rule.fromPattern && !new RegExp(rule.fromPattern, flags).test(fromAddress)) return false;
		if (rule.recipientPattern && !new RegExp(rule.recipientPattern, flags).test(recipientText)) return false;
		return new RegExp(rule.pattern, flags).test(searchText);
	});
}

type ContentLabelFolderStub = {
	createFolder: (id: string, name: string) => Promise<unknown>;
	updateFolder: (id: string, name: string) => Promise<unknown>;
};

async function ensureContentLabelFolderName(stub: ContentLabelFolderStub, rule: ContentLabelRule) {
	const name = rule.folderName ?? rule.folderId;
	const created = await stub.createFolder(rule.folderId, name);
	if (!created) await stub.updateFolder(rule.folderId, name);
}

async function ensureContentLabelFolders(stub: ContentLabelFolderStub, env: Env, mailboxId: string) {
	const rules = getContentLabelRules(env).filter((rule) => rule.mailboxId.toLowerCase() === mailboxId);
	for (const rule of rules) {
		await ensureContentLabelFolderName(stub, rule);
	}
}

async function ensureContentLabelFolder(stub: ContentLabelFolderStub, rule: ContentLabelRule | undefined) {
	if (!rule) return;
	await ensureContentLabelFolderName(stub, rule);
}

async function postAutoprocessWebhook(env: Env, rawEmail: Uint8Array, context: {
	messageId: string;
	fromAddress: string;
	toAddress: string;
	mailboxId: string;
	subject: string;
}) {
	if (!env.AUTOPROCESS_WEBHOOK_URL) throw new Error("AUTOPROCESS_WEBHOOK_URL is required for autoprocess mail");
	const response = await fetch(env.AUTOPROCESS_WEBHOOK_URL, {
		method: "POST",
		headers: {
			"Content-Type": "message/rfc822",
			"X-Hyatus-Inbox-Trigger": "autoprocess",
			"X-Hyatus-Message-Id": context.messageId,
			"X-Hyatus-Source-Mailbox": context.mailboxId,
			"X-Hyatus-Recipient": context.toAddress,
			"X-Hyatus-From": context.fromAddress,
			"X-Hyatus-Subject": context.subject,
		},
		body: rawEmail.slice().buffer,
	});
	if (!response.ok) throw new Error(`Autoprocess webhook failed with status ${response.status}`);
}

function appendStructuredExtractionHeader(rawHeaders: string, name: string, extraction: unknown) {
	const headerName = "X-Hyatus-Structured-Extraction";
	const headerValue = JSON.stringify(Array.isArray(extraction) ? { name, extractions: extraction } : { name, ...(extraction as Record<string, unknown>) });
	const parsed = JSON.parse(rawHeaders);
	if (Array.isArray(parsed)) return JSON.stringify([...parsed, { key: headerName, value: headerValue }]);
	return JSON.stringify({ ...parsed, [headerName]: headerValue });
}

async function extractReviewRemoval(env: Env, emailText: string) {
	if (!env.SIMPLE_AI_API_KEY) throw new Error("SIMPLE_AI_API_KEY is required for review removal extraction");
	const response = await fetch(env.SIMPLE_AI_STRUCTURED_URL || SIMPLE_AI_STRUCTURED_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": env.SIMPLE_AI_API_KEY,
		},
		body: JSON.stringify({
			provider: "openai",
			model: "gpt-5-nano",
			system_prompt: [
				"You extract structured data from review-removal notification emails for Airbnb, Booking.com, Expedia Partner Central, Vrbo, HomeAway, and Rentals United.",
				"Return only data supported by the email text.",
				"Use channel values airbnb, booking, expedia, vrbo, or unknown.",
				"Extract the booking channel reservation ID or review/reservation reference from the email.",
				"Do not use support case numbers as review references.",
				"For Expedia, do not use hotel IDs, property IDs, listing IDs, or case IDs as review references; use only unique booking, reservation, itinerary, or review references.",
				"If the email confirms a removed review but contains no unique booking, reservation, itinerary, or review reference, return empty strings for channel_reservation_id and review_reference.",
				"If the email has one reservation or review reference, put the same value in channel_reservation_id and review_reference.",
				"Treat account-level Airbnb 'We've removed reviews from your account' notices as review-removal notifications.",
				"The extraction purpose must be review_removal.",
			].join(" "),
			user_prompt: emailText,
			output_schema_json: {
				type: "object",
				properties: {
					channel: {
						type: "string",
						description: "The review channel: airbnb, booking, expedia, vrbo, or unknown.",
					},
					channel_reservation_id: {
						type: "string",
						description: "The channel reservation ID or reservation reference from the email.",
					},
					review_reference: {
						type: "string",
						description: "The best review or reservation reference to map to the reviews table.",
					},
					extraction_purpose: {
						type: "string",
						description: "Always review_removal for this extraction.",
					},
					review_has_been_removed: {
						type: "boolean",
						description: "True when the email says a guest/customer review has been removed, taken down, or removed from the account.",
					},
				},
				required: ["channel", "channel_reservation_id", "review_reference", "extraction_purpose", "review_has_been_removed"],
				additionalProperties: false,
			},
		}),
	});
	if (!response.ok) throw new Error(`Simple AI structured extraction failed with status ${response.status}`);
	const body = await response.json() as { structured_data: ReviewRemovalExtraction };
	return body.structured_data;
}

async function postReviewRemoval(env: Env, extraction: ReviewRemovalExtraction, context: ReviewRemovalContext) {
	if (!extraction.review_has_been_removed) return;
	const reviewReference = extraction.channel_reservation_id || extraction.review_reference;
	if (!reviewReference) throw new Error("Review removal extraction did not include a channel reservation ID or review reference");
	const reviewRemovalUrl = env.REVIEW_REMOVAL_URL || env.AIRBNB_REVIEW_REMOVAL_URL;
	const reviewRemovalApiKey = env.REVIEW_REMOVAL_API_KEY || env.AIRBNB_REVIEW_REMOVAL_API_KEY;
	if (!reviewRemovalUrl) throw new Error("REVIEW_REMOVAL_URL is required for review removal updates");
	if (!reviewRemovalApiKey) throw new Error("REVIEW_REMOVAL_API_KEY is required for review removal updates");
	const response = await fetch(reviewRemovalUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": reviewRemovalApiKey,
		},
		body: JSON.stringify({
			channel: extraction.channel,
			channel_res_id: extraction.channel_reservation_id || extraction.review_reference,
			review_reference: extraction.review_reference || extraction.channel_reservation_id,
			extraction_purpose: extraction.extraction_purpose,
			source_email_id: context.messageId,
			source_mailbox: context.mailboxId,
			source_recipient: context.toAddress,
			source_from: context.fromAddress,
			source_subject: context.subject,
			source_attachment_filename: context.attachmentFilename,
		}),
	});
	if (!response.ok) throw new Error(`Review removal update failed with status ${response.status}`);
}

async function extractAndStoreReviewRemoval(
	stub: { setEmailRawHeaders: (id: string, rawHeaders: string) => Promise<unknown> },
	env: Env,
	emailId: string,
	rawHeaders: string,
	candidates: ReviewRemovalCandidate[],
) {
	const extractions: ReviewRemovalExtraction[] = [];
	const postedReviewReferences = new Set<string>();
	for (const candidate of candidates) {
		const extraction = await extractReviewRemoval(env, candidate.emailText);
		if (!extraction.review_has_been_removed) continue;
		const reviewReference = extraction.channel_reservation_id || extraction.review_reference;
		if (!reviewReference) {
			console.warn(`Skipping review removal without channel reservation ID or review reference for email ${emailId}`);
			continue;
		}
		if (postedReviewReferences.has(reviewReference)) continue;
		await postReviewRemoval(env, extraction, candidate.context);
		postedReviewReferences.add(reviewReference);
		extractions.push(extraction);
	}
	if (!extractions.length) return;
	await stub.setEmailRawHeaders(emailId, appendStructuredExtractionHeader(rawHeaders, "review-removal", extractions.length === 1 ? extractions[0] : extractions));
	console.log(`Stored ${extractions.length} review removal extraction(s) for email ${emailId}`);
}

function shouldExtractKeycafeStatus(fromAddress: string, searchText: string) {
	const normalizedText = searchText.toLowerCase();
	const fromKeycafe = fromAddress.toLowerCase().includes("keycafe.com")
		|| normalizedText.includes("noreply@keycafe.com")
		|| normalizedText.includes("from: keycafe");
	if (!fromKeycafe) return false;
	return [
		"is currently experiencing the following issue",
		"active issue status",
		"cabinet offline",
		"has been resolved",
		"no longer experiencing any issues",
		"back to active status",
		"is experiencing an issue",
	].some((pattern) => normalizedText.includes(pattern));
}

async function extractKeycafeStatus(env: Env, emailText: string) {
	if (!env.SIMPLE_AI_API_KEY) throw new Error("SIMPLE_AI_API_KEY is required for Keycafe status extraction");
	const response = await fetch(env.SIMPLE_AI_STRUCTURED_URL || SIMPLE_AI_STRUCTURED_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": env.SIMPLE_AI_API_KEY,
		},
		body: JSON.stringify({
			provider: "openai",
			model: "gpt-5-nano",
			system_prompt: [
				"You extract structured data from Keycafe SmartBox status notification emails.",
				"Return only data supported by the email text.",
				"Extract the building or location name from the notification subject or body.",
				"Use keycafe_status offline when the email says the location is experiencing an issue, has Cabinet Offline, or is in Active Issue status.",
				"Use keycafe_status online when the email says the issue has been resolved, is no longer experiencing issues, or is back to Active status.",
				"The extraction purpose must be keycafe_status.",
			].join(" "),
			user_prompt: emailText,
			output_schema_json: {
				type: "object",
				properties: {
					building_name: {
						type: "string",
						description: "The building or Keycafe location name from the notification.",
					},
					keycafe_status: {
						type: "string",
						enum: ["online", "offline", "unknown"],
						description: "online for resolved/back to Active; offline for active issue/cabinet offline.",
					},
					issue_type: {
						type: "string",
						description: "The specific issue type, such as Cabinet Offline, or an empty string when resolved/online.",
					},
					status_text: {
						type: "string",
						description: "Short human-readable status phrase supported by the email.",
					},
					extraction_purpose: {
						type: "string",
						description: "Always keycafe_status for this extraction.",
					},
				},
				required: ["building_name", "keycafe_status", "issue_type", "status_text", "extraction_purpose"],
				additionalProperties: false,
			},
		}),
	});
	if (!response.ok) throw new Error(`Simple AI Keycafe status extraction failed with status ${response.status}`);
	const body = await response.json() as { structured_data: KeycafeStatusExtraction };
	return body.structured_data;
}

async function postKeycafeStatusUpdate(env: Env, extraction: KeycafeStatusExtraction, context: KeycafeStatusContext) {
	if (!env.KEYCAFE_STATUS_UPDATE_URL) return { posted: false, reason: "KEYCAFE_STATUS_UPDATE_URL not configured" };
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (env.KEYCAFE_STATUS_UPDATE_API_KEY) headers["x-api-key"] = env.KEYCAFE_STATUS_UPDATE_API_KEY;
	const response = await fetch(env.KEYCAFE_STATUS_UPDATE_URL, {
		method: "POST",
		headers,
		body: JSON.stringify({
			building_name: extraction.building_name,
			keycafe_status: extraction.keycafe_status,
			issue_type: extraction.issue_type,
			status_text: extraction.status_text,
			extraction_purpose: extraction.extraction_purpose,
			source_email_id: context.messageId,
			source_mailbox: context.mailboxId,
			source_recipient: context.toAddress,
			source_from: context.fromAddress,
			source_subject: context.subject,
		}),
	});
	if (!response.ok) throw new Error(`Keycafe status update failed with status ${response.status}`);
	return { posted: true };
}

async function extractAndStoreKeycafeStatus(
	stub: { setEmailRawHeaders: (id: string, rawHeaders: string) => Promise<unknown> },
	env: Env,
	emailId: string,
	rawHeaders: string,
	emailText: string,
	context: KeycafeStatusContext,
) {
	const extraction = await extractKeycafeStatus(env, emailText);
	if (!extraction.building_name || extraction.keycafe_status === "unknown") {
		console.warn(`Skipping Keycafe status update without building/status for email ${emailId}`);
		return;
	}
	const postResult = await postKeycafeStatusUpdate(env, extraction, context);
	await stub.setEmailRawHeaders(emailId, appendStructuredExtractionHeader(rawHeaders, "keycafe-status", { ...extraction, post_result: postResult }));
	console.log(`Stored Keycafe status extraction for email ${emailId}: ${extraction.building_name} ${extraction.keycafe_status}`);
}

async function postTwofaEmail(env: Env, emailText: string, context: {
	messageId: string;
	fromAddress: string;
	toAddress: string;
	mailboxId: string;
	subject: string;
	source: string;
	channel: string;
}) {
	if (!env.TWOFA_POST_URL) throw new Error("TWOFA_POST_URL is required for 2FA email processing");
	if (!env.TWOFA_API_KEY) throw new Error("TWOFA_API_KEY is required for 2FA email processing");
	const response = await fetch(env.TWOFA_POST_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": env.TWOFA_API_KEY,
		},
		body: JSON.stringify({
			email_body: emailText,
			email_received_at_epoch: Math.floor(Date.now() / 1000),
			source: context.source,
			channel: context.channel,
			subject: context.subject,
			context: `Forwarded from ${context.mailboxId} 2FA email ${context.messageId}`,
			requester_email: context.toAddress,
			source_email_id: context.messageId,
			source_mailbox: context.mailboxId,
			source_recipient: context.toAddress,
			source_from: context.fromAddress,
			source_subject: context.subject,
		}),
	});
	if (!response.ok) throw new Error(`2FA post failed with status ${response.status}`);
}

async function postTwofaSms(env: Env, payload: {
	service: string;
	recipient: string;
	link: string;
	messageId: string;
	receivedAt: string;
}) {
	if (!env.TWOFA_SMS_WEBHOOK_URL) throw new Error("TWOFA_SMS_WEBHOOK_URL is required for 2FA SMS processing");
	if (!env.TWOFA_SMS_WEBHOOK_KEY) throw new Error("TWOFA_SMS_WEBHOOK_KEY is required for 2FA SMS processing");
	const response = await fetch(env.TWOFA_SMS_WEBHOOK_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"x-api-key": env.TWOFA_SMS_WEBHOOK_KEY,
		},
		body: JSON.stringify({
			service: payload.service,
			recipient: payload.recipient,
			link: payload.link,
			receivedAt: payload.receivedAt,
			sourceEmailId: payload.messageId,
		}),
	});
	if (!response.ok) throw new Error(`2FA SMS webhook failed with status ${response.status}`);
}

function emailSearchText(email: { subject?: string; text?: string; html?: string }) {
	return [
		email.subject || "",
		email.text || "",
		email.html || "",
	].join("\n");
}

function attachmentBytes(content: ArrayBuffer | Uint8Array | string) {
	if (typeof content === "string") return new TextEncoder().encode(content);
	return content instanceof Uint8Array ? content : new Uint8Array(content);
}

async function getAutoprocessAttachmentCandidates(
	parsedEmail: ParsedEmailLike,
	outerContext: ReviewRemovalContext,
) {
	const candidates: ReviewRemovalCandidate[] = [];
	for (const attachment of parsedEmail.attachments || []) {
		const filename = attachment.filename || "attached-email.eml";
		const mimetype = attachment.mimeType || "";
		if (mimetype !== "message/rfc822" && !filename.toLowerCase().endsWith(".eml")) continue;
		const attachedEmail = await new PostalMime().parse(attachmentBytes(attachment.content));
		const searchText = emailSearchText(attachedEmail);
		const fromAddress = (attachedEmail.from?.address || "").toLowerCase();
		if (!shouldExtractReviewRemoval(fromAddress, searchText, true)) continue;
		candidates.push({
			emailText: searchText,
			context: {
				...outerContext,
				fromAddress,
				subject: attachedEmail.subject || "",
				attachmentFilename: filename,
			},
		});
	}
	return candidates;
}

async function receiveEmail(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
	const rawEmail = await streamToArrayBuffer(message.raw, message.rawSize);
	const parsedEmail = await new PostalMime().parse(rawEmail);

	const envelopeRecipient = message.to.toLowerCase();

	const allowedAddresses = getConfiguredEmailAddresses(env);
	const parsedToRecipients = (parsedEmail.to || []).map((t) => t.address?.toLowerCase()).filter(Boolean) as string[];
	const allRecipients = [...new Set([envelopeRecipient, ...parsedToRecipients].filter(Boolean))];
	if (!allRecipients.length) throw new Error("received email with empty to");
	const ccRecipients = (parsedEmail.cc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];
	const bccRecipients = (parsedEmail.bcc || []).map((e) => e.address?.toLowerCase()).filter(Boolean) as string[];

	const mailboxResolution = allowedAddresses.length > 0
		? resolveMailboxForRecipients(env, allRecipients)
		: { recipientAddress: allRecipients[0], mailboxId: allRecipients[0] };
	if (!mailboxResolution?.mailboxId) {
		console.log(`Ignoring email: no recipient matches EMAIL_ADDRESSES.`);
		return;
	}
	const mailboxId = mailboxResolution.mailboxId;

	const forwardingSearchText = emailSearchText(parsedEmail);
	const fromAddress = (parsedEmail.from?.address || "").toLowerCase();
	ctx.waitUntil(forwardMatchingContentRules(message, env, mailboxId, forwardingSearchText));
	const recipientSearchText = [...allRecipients, ...ccRecipients, ...bccRecipients].join("\n");
	const labelRule = findContentLabelRule(env, mailboxId, fromAddress, recipientSearchText, forwardingSearchText);
	if (labelRule) console.log(`Labeling ${mailboxId} email by content rule ${labelRule.name} into folder ${labelRule.folderId}`);
	const destinationFolder = labelRule?.folderId ?? Folders.INBOX;

	const messageId = crypto.randomUUID();
	const mailboxKey = `mailboxes/${mailboxId}.json`;
	if (!(await env.BUCKET.head(mailboxKey))) {
		if (!getConfiguredMailboxIds(env).includes(mailboxId)) { console.log(`Ignoring email for ${mailboxId}: mailbox does not exist`); return; }
		await env.BUCKET.put(mailboxKey, JSON.stringify(defaultMailboxSettings(mailboxId)));
		const initStub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
		await initStub.getFolders();
		console.log(`Auto-created configured mailbox ${mailboxId}`);
	}

	const stub = env.MAILBOX.get(env.MAILBOX.idFromName(mailboxId));
	await ensureContentLabelFolder(stub, labelRule);

	const attachmentData: StoredAttachment[] = [];
	if (parsedEmail.attachments) {
		for (const att of parsedEmail.attachments) {
			const attId = crypto.randomUUID();
			const filename = (att.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
			await env.BUCKET.put(`attachments/${messageId}/${attId}/${filename}`, att.content);
			attachmentData.push({ id: attId, email_id: messageId, filename, mimetype: att.mimeType,
				size: typeof att.content === "string" ? att.content.length : att.content.byteLength,
				content_id: att.contentId || null, disposition: att.disposition || "attachment" });
		}
	}

	const extractMsgId = (s: string) => { const m = s.match(/<([^>]+)>/); return m ? m[1] : s.trim().split(/\s+/)[0]; };
	const inReplyTo = parsedEmail.inReplyTo ? extractMsgId(parsedEmail.inReplyTo) : null;
	const emailReferences = parsedEmail.references ? parsedEmail.references.split(/\s+/).filter(Boolean).map(extractMsgId) : [];
	let threadId = emailReferences[0] || inReplyTo || messageId;

	if (!inReplyTo && emailReferences.length === 0) {
		const subjectThread = await (stub as any).findThreadBySubject(parsedEmail.subject || "", parsedEmail.from?.address || undefined);
		if (subjectThread) threadId = subjectThread;
	}

	const originalMessageId = parsedEmail.messageId ? extractMsgId(parsedEmail.messageId) : null;
	const rawHeaders = JSON.stringify(parsedEmail.headers);

	await stub.createEmail(destinationFolder, {
		id: messageId, subject: parsedEmail.subject || "",
		sender: fromAddress, recipient: allRecipients.join(", "),
		cc: ccRecipients.join(", ") || null, bcc: bccRecipients.join(", ") || null,
		date: new Date().toISOString(), // uses receive time, not the email's Date header
		body: parsedEmail.html || parsedEmail.text || "",
		in_reply_to: inReplyTo, email_references: emailReferences.length > 0 ? JSON.stringify(emailReferences) : null,
		thread_id: threadId, message_id: originalMessageId, raw_headers: rawHeaders,
	}, attachmentData);

	if (allRecipients.includes(AUTOPROCESS_RECIPIENT)) {
		ctx.waitUntil(postAutoprocessWebhook(env, rawEmail, {
			messageId,
			fromAddress,
			toAddress: AUTOPROCESS_RECIPIENT,
			mailboxId,
			subject: parsedEmail.subject || "",
		}).catch((e) => console.error("Autoprocess webhook failed:", (e as Error).message)));
	}

	const baseReviewRemovalContext = {
		messageId,
		fromAddress,
		toAddress: AUTOPROCESS_RECIPIENT,
		mailboxId,
		subject: parsedEmail.subject || "",
	};
	const isAutoprocessRecipient = allRecipients.includes(AUTOPROCESS_RECIPIENT);
	const reviewRemovalCandidates: ReviewRemovalCandidate[] = [];
	if (shouldUseOuterReviewRemovalCandidate(parsedEmail, fromAddress, forwardingSearchText, isAutoprocessRecipient)) {
		reviewRemovalCandidates.push({
			emailText: forwardingSearchText,
			context: baseReviewRemovalContext,
		});
	}
	if (isAutoprocessRecipient && hasAttachedEmailMessages(parsedEmail)) {
		reviewRemovalCandidates.push(...await getAutoprocessAttachmentCandidates(parsedEmail, baseReviewRemovalContext));
	}
	if (reviewRemovalCandidates.length) {
		ctx.waitUntil(extractAndStoreReviewRemoval(
			stub,
			env,
			messageId,
			rawHeaders,
			reviewRemovalCandidates,
		).catch((e) => console.error("Review removal extraction failed:", (e as Error).message)));
	}

	if (shouldExtractKeycafeStatus(fromAddress, forwardingSearchText)) {
		ctx.waitUntil(extractAndStoreKeycafeStatus(
			stub,
			env,
			messageId,
			rawHeaders,
			forwardingSearchText,
			{
				messageId,
				fromAddress,
				toAddress: allRecipients.join(", "),
				mailboxId,
				subject: parsedEmail.subject || "",
			},
		).catch((e) => console.error("Keycafe status extraction failed:", (e as Error).message)));
	}

	const twofaEmailMatch = getTwofaEmailMatch(fromAddress, forwardingSearchText, allRecipients);
	if (twofaEmailMatch) {
		ctx.waitUntil(postTwofaEmail(env, parsedEmail.html || parsedEmail.text || forwardingSearchText, {
			messageId,
			fromAddress,
			toAddress: allRecipients.join(", "),
			mailboxId,
			subject: parsedEmail.subject || "",
			source: twofaEmailMatch.source,
			channel: twofaEmailMatch.channel,
		}).catch((e) => console.error("2FA post failed:", (e as Error).message)));
	}

	const claudeLoginSmsMatch = getClaudeLoginSmsMatch(fromAddress, allRecipients, forwardingSearchText);
	if (claudeLoginSmsMatch) {
		ctx.waitUntil(postTwofaSms(env, {
			...claudeLoginSmsMatch,
			messageId,
			receivedAt: new Date().toISOString(),
		}).catch((e) => console.error("2FA SMS webhook failed:", (e as Error).message)));
	}

	if (isAutoDraftEnabled(env)) {
		const agentStub = env.EMAIL_AGENT.get(env.EMAIL_AGENT.idFromName(mailboxId));
		ctx.waitUntil(agentStub.fetch(new Request("https://agents/onNewEmail", {
			method: "POST", headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ mailboxId, emailId: messageId, sender: fromAddress, subject: parsedEmail.subject || "", threadId }),
		})).catch((e) => console.error("Auto-draft trigger failed:", (e as Error).message)));
	}
}

export { app, receiveEmail };
