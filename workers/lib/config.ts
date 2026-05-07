// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export const CODEX_MAILBOX = "codex@hyatusliving.com";

export function getConfiguredEmailAddresses(env: { EMAIL_ADDRESSES?: unknown }): string[] {
	const raw = env.EMAIL_ADDRESSES;
	if (Array.isArray(raw)) return raw.map((addr) => String(addr).toLowerCase());
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed) return [];
		if (trimmed.startsWith("[")) {
			return (JSON.parse(trimmed) as string[]).map((addr) => addr.toLowerCase());
		}
		return trimmed.split(",").map((addr) => addr.trim().toLowerCase()).filter(Boolean);
	}
	return [];
}

export function isInboundOnly(env: { INBOUND_ONLY?: string }) {
	return env.INBOUND_ONLY !== "false";
}

export function isAutoDraftEnabled(env: { AUTO_DRAFT_ENABLED?: string; INBOUND_ONLY?: string }) {
	return !isInboundOnly(env) && env.AUTO_DRAFT_ENABLED === "true";
}

export function defaultMailboxSettings(email: string) {
	const localPart = email.split("@")[0] || email;
	return {
		fromName: localPart,
		forwarding: { enabled: false, email: "" },
		signature: { enabled: false, text: "" },
		autoReply: { enabled: false, subject: "", message: "" },
	};
}
