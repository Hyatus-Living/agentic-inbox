const HYATUS_RECIPIENT_DOMAINS = new Set([
	"hyatus.com",
	"hyatus.co",
	"hyatusliving.com",
]);
const UNIT_INTERNAL_NAME_PATTERN = /^[a-z]{2,4}\d+[a-z]{1,4}$/i;

function recipientTagName(address: string) {
	const normalized = address.trim().toLowerCase();
	const at = normalized.lastIndexOf("@");
	if (at <= 0) return null;
	const domain = normalized.slice(at + 1);
	if (!HYATUS_RECIPIENT_DOMAINS.has(domain)) return null;

	const baseLocalPart = normalized.slice(0, at).split("+")[0];
	if (!baseLocalPart || UNIT_INTERNAL_NAME_PATTERN.test(baseLocalPart)) return null;
	return baseLocalPart
		.split(/[-_.]+/)
		.filter(Boolean)
		.map((part) => part.replace(/^([a-z]+)(\d+)$/i, "$1 $2"))
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export function getRecipientEmailTags(mailboxId: string, recipients: string[]) {
	const canonicalMailbox = mailboxId.trim().toLowerCase();
	return [...new Set(recipients.flatMap((recipient) => {
		if (recipient.trim().toLowerCase() === canonicalMailbox) return [];
		const tag = recipientTagName(recipient);
		return tag ? [tag] : [];
	}))];
}
