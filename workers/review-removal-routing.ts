export const REVIEW_REMOVAL_TEXT_PATTERNS = [
	"has been removed at their request",
	"been removed at their request",
	"has been removed upon their request",
	"been removed upon their request",
	"we've removed reviews from your account",
	"we’ve removed reviews from your account",
	"guest review removed",
	"customer review removal",
	"review was taken down",
	"review removed",
	"removed review",
	"review has been removed",
	"review was removed",
	"taken down from vrbo",
];

export type ReviewRemovalAttachmentLike = {
	filename?: string | null;
	mimeType?: string | null;
};

export type ReviewRemovalEmailLike = {
	attachments?: ReviewRemovalAttachmentLike[];
};

export function isAttachedEmailMessage(attachment: ReviewRemovalAttachmentLike) {
	const filename = attachment.filename || "";
	const mimetype = attachment.mimeType || "";
	return mimetype === "message/rfc822" || filename.toLowerCase().endsWith(".eml");
}

export function hasAttachedEmailMessages(email: ReviewRemovalEmailLike) {
	return (email.attachments || []).some(isAttachedEmailMessage);
}

export function shouldExtractReviewRemoval(fromAddress: string, searchText: string, allowAutoprocessForward = false) {
	const normalizedText = searchText.toLowerCase();
	const normalizedFrom = fromAddress.toLowerCase();
	const matchesRemovalText = REVIEW_REMOVAL_TEXT_PATTERNS.some((pattern) => normalizedText.includes(pattern));
	if (!matchesRemovalText) return false;
	if (allowAutoprocessForward) return true;
	return [
		"airbnb.com",
		"booking.com",
		"partners.booking.com",
		"mchat.booking.com",
		"expedia.com",
		"expediapartnercentral.com",
		"partnercentral",
		"homeaway.com",
		"rentalsunited.com",
		"vrbo",
	].some((sender) => normalizedFrom.includes(sender));
}

export function shouldUseOuterReviewRemovalCandidate(
	parsedEmail: ReviewRemovalEmailLike,
	fromAddress: string,
	searchText: string,
	isAutoprocessRecipient: boolean,
) {
	if (isAutoprocessRecipient && hasAttachedEmailMessages(parsedEmail)) return false;
	return shouldExtractReviewRemoval(fromAddress, searchText, isAutoprocessRecipient);
}
