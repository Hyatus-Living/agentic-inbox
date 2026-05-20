// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

export const AI_MAILBOX = "ai@hyatusliving.com";

export type ContentForwardRule = {
	name: string;
	mailboxId: string;
	pattern: string;
	flags?: string;
	forwardTo: string;
};

export type ContentLabelRule = {
	name: string;
	mailboxId: string;
	fromPattern?: string;
	pattern: string;
	flags?: string;
	folderId: string;
	folderName?: string;
};

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

export function getEmailAddressAliases(env: { EMAIL_ADDRESS_ALIASES?: unknown }): Record<string, string> {
	const raw = env.EMAIL_ADDRESS_ALIASES;
	if (!raw) return {};
	const parsed = typeof raw === "string" ? JSON.parse(raw) as Record<string, string> : raw as Record<string, string>;
	return Object.fromEntries(
		Object.entries(parsed).map(([alias, mailboxId]) => [
			alias.toLowerCase(),
			String(mailboxId).toLowerCase(),
		]),
	);
}

export function getConfiguredMailboxIds(env: { EMAIL_ADDRESSES?: unknown; EMAIL_ADDRESS_ALIASES?: unknown }): string[] {
	const aliases = getEmailAddressAliases(env);
	const aliasAddresses = new Set(Object.keys(aliases));
	return [
		...new Set([
			...getConfiguredEmailAddresses(env).filter((addr) => !aliasAddresses.has(addr)),
			...Object.values(aliases),
		]),
	];
}

export function resolveMailboxForRecipients(
	env: { EMAIL_ADDRESSES?: unknown; EMAIL_ADDRESS_ALIASES?: unknown },
	recipients: string[],
): { recipientAddress: string; mailboxId: string } | undefined {
	const aliases = getEmailAddressAliases(env);
	const acceptedAddresses = new Set([
		...getConfiguredEmailAddresses(env),
		...Object.keys(aliases),
	]);
	const recipientAddress = recipients.map((addr) => addr.toLowerCase()).find((addr) => acceptedAddresses.has(addr));
	if (!recipientAddress) return undefined;
	return { recipientAddress, mailboxId: aliases[recipientAddress] ?? recipientAddress };
}

export function getContentForwardRules(env: { CONTENT_FORWARD_RULES?: unknown }): ContentForwardRule[] {
	const raw = env.CONTENT_FORWARD_RULES;
	if (!raw) return [];
	if (typeof raw === "string") return JSON.parse(raw) as ContentForwardRule[];
	return raw as ContentForwardRule[];
}

export function getContentLabelRules(env: { CONTENT_LABEL_RULES?: unknown }): ContentLabelRule[] {
	const raw = env.CONTENT_LABEL_RULES;
	if (!raw) return [];
	if (typeof raw === "string") return JSON.parse(raw) as ContentLabelRule[];
	return raw as ContentLabelRule[];
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
