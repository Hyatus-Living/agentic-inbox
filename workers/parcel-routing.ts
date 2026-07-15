export const LUXER_PARCEL_FROM_PATTERN_SOURCE = "^support@luxerone\\.com$";
export const LUXER_PARCEL_CONTENT_PATTERN_SOURCE =
	"(?=[\\s\\S]*\\bENTER ACCESS CODE\\b)(?=[\\s\\S]*\\bLuxer One package room\\b)";

const luxerParcelFromPattern = new RegExp(LUXER_PARCEL_FROM_PATTERN_SOURCE, "i");
const luxerParcelContentPattern = new RegExp(LUXER_PARCEL_CONTENT_PATTERN_SOURCE, "i");

export function isLuxerParcelEmail(fromAddress: string, searchText: string) {
	return luxerParcelFromPattern.test(fromAddress) && luxerParcelContentPattern.test(searchText);
}

export function buildParcelPendingPayload(emailBody: string, context: {
	sourceEmailId: string;
	sourceAgenticEmailId: string;
	sourceMailbox: string;
	fromAddress: string;
	fromName: string;
	toAddress: string;
	subject: string;
	receivedAt: string;
}) {
	return {
		source_email_id: context.sourceEmailId,
		source_agentic_email_id: context.sourceAgenticEmailId,
		source_mailbox: context.sourceMailbox,
		from_address: context.fromAddress,
		from_name: context.fromName,
		to_address: context.toAddress,
		subject: context.subject,
		body: emailBody,
		received_at: context.receivedAt,
	};
}
