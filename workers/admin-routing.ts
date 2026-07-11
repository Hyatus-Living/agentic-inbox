const ADMIN_PREFIX_DOMAIN = "hyatusliving.com";
export const ADMIN_FORWARD_TO = "admin@hyatus.com";

export function getAdminForwardRecipient(recipients: string[]) {
	return recipients.find((recipient) => {
		const [localPart, domain] = recipient.toLowerCase().split("@");
		return domain === ADMIN_PREFIX_DOMAIN && localPart.startsWith("admin");
	}) ?? null;
}
