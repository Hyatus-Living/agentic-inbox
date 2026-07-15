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
	recipientPattern?: string;
	pattern: string;
	flags?: string;
	folderId: string;
	folderName?: string;
};

export const LUXER_PARCEL_FROM_PATTERN_SOURCE = "^support@luxerone\\.com$";
export const LUXER_PARCEL_SUBJECT_PATTERN_SOURCE =
	"^(?:You've got a package\\.|Your package misses you|Don't forget to pick up your package\\.|Your Package is still waiting|Please pick up your package|Your package is being returned to the sender)$";
export const LUXER_PARCEL_SEARCH_PATTERN_SOURCE =
	LUXER_PARCEL_SUBJECT_PATTERN_SOURCE.slice(0, -1) + "\\r?\\n";

const luxerParcelFromPattern = new RegExp(LUXER_PARCEL_FROM_PATTERN_SOURCE, "i");
const luxerParcelSubjectPattern = new RegExp(LUXER_PARCEL_SUBJECT_PATTERN_SOURCE, "i");

export function isLuxerParcelEmail(fromAddress: string, subject: string) {
	return luxerParcelFromPattern.test(fromAddress) && luxerParcelSubjectPattern.test(subject.trim());
}

const STATIC_CONTENT_LABEL_RULES: ContentLabelRule[] = [
	{
		name: "luxer-one-parcel",
		mailboxId: AI_MAILBOX,
		fromPattern: LUXER_PARCEL_FROM_PATTERN_SOURCE,
		pattern: LUXER_PARCEL_SEARCH_PATTERN_SOURCE,
		folderId: "parcel",
		folderName: "Parcel",
	},
];

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

// Alias domains funnel ALL of their mail into a single managed catch-all mailbox
// (ALIAS_DOMAIN_MAILBOX). Any recipient at an alias domain — regardless of local
// part — is delivered to that one mailbox; nothing is forwarded or dropped. This
// keeps the alias domains fully decoupled from the canonical domain's routing.
export function getAliasDomains(env: { ALIAS_DOMAINS?: unknown }): string[] {
	const raw = env.ALIAS_DOMAINS;
	if (Array.isArray(raw)) return raw.map((d) => String(d).toLowerCase());
	if (typeof raw === "string") {
		const trimmed = raw.trim();
		if (!trimmed) return [];
		if (trimmed.startsWith("[")) {
			return (JSON.parse(trimmed) as string[]).map((d) => d.toLowerCase());
		}
		return trimmed.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
	}
	return [];
}

export function getAliasDomainMailbox(env: { ALIAS_DOMAIN_MAILBOX?: unknown }): string {
	const raw = env.ALIAS_DOMAIN_MAILBOX;
	return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function domainOf(address: string): string {
	const at = address.lastIndexOf("@");
	return at >= 0 ? address.slice(at + 1) : "";
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
	env: { EMAIL_ADDRESSES?: unknown; EMAIL_ADDRESS_ALIASES?: unknown; ALIAS_DOMAINS?: unknown; ALIAS_DOMAIN_MAILBOX?: unknown },
	recipients: string[],
): { recipientAddress: string; mailboxId: string } | undefined {
	const aliases = getEmailAddressAliases(env);
	const acceptedAddresses = new Set([
		...getConfiguredEmailAddresses(env),
		...Object.keys(aliases),
	]);
	const lowered = recipients.map((addr) => addr.toLowerCase());

	// 1) An explicitly configured address (canonical-domain mailbox or per-address alias).
	const direct = lowered.find((addr) => acceptedAddresses.has(addr));
	if (direct) return { recipientAddress: direct, mailboxId: aliases[direct] ?? direct };

	// 2) Any recipient at an alias domain -> the shared catch-all mailbox (all local parts).
	const aliasDomains = getAliasDomains(env);
	const aliasMailbox = getAliasDomainMailbox(env);
	if (aliasMailbox && aliasDomains.length) {
		const aliasHit = lowered.find((addr) => aliasDomains.includes(domainOf(addr)));
		if (aliasHit) return { recipientAddress: aliasHit, mailboxId: aliasMailbox };
	}

	return undefined;
}

export function getContentForwardRules(env: { CONTENT_FORWARD_RULES?: unknown }): ContentForwardRule[] {
	const raw = env.CONTENT_FORWARD_RULES;
	if (!raw) return [];
	if (typeof raw === "string") return JSON.parse(raw) as ContentForwardRule[];
	return raw as ContentForwardRule[];
}

export function getContentLabelRules(env: { CONTENT_LABEL_RULES?: unknown }): ContentLabelRule[] {
	const raw = env.CONTENT_LABEL_RULES;
	const configured = !raw
		? []
		: typeof raw === "string"
			? JSON.parse(raw) as ContentLabelRule[]
			: raw as ContentLabelRule[];
	return [...configured, ...STATIC_CONTENT_LABEL_RULES];
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
