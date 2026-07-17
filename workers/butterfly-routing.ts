const BUTTERFLY_FROM_PATTERN = /@(?:[^@\s]+\.)?butterflymx\.com$/i;
const UNIT_INTERNAL_NAME_RECIPIENT_PATTERN = /^([a-z]{2,4}\d+[a-z]{1,4})@hyatusliving\.com$/i;

export const BUTTERFLY_TAG = "Butterfly";

export function isButterflyEmail(fromAddress: string) {
	return BUTTERFLY_FROM_PATTERN.test(fromAddress);
}

export function getButterflyEmailTags(
	fromAddress: string,
	recipients: string[],
	isActivation: boolean,
) {
	if (!isButterflyEmail(fromAddress)) return [];
	if (!isActivation) return [BUTTERFLY_TAG];

	const unitTags = recipients.flatMap((recipient) => {
		const match = recipient.trim().match(UNIT_INTERNAL_NAME_RECIPIENT_PATTERN);
		return match ? [match[1].toUpperCase()] : [];
	});

	return [...new Set([BUTTERFLY_TAG, ...unitTags])];
}
