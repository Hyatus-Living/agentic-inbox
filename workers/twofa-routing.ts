const OPENAI_TWOFA_FROM_PATTERN = /^(?:[^@\s]+@(?:tm\d*\.)?openai\.com|tm@openai\.com|accounts@hyatus\.com)$/i;
const OPENAI_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour temporary (?:ChatGPT|OpenAI) (?:login|verification|password reset) code\b)(?=[\s\S]*\bEnter this temporary verification code to continue\b)(?=[\s\S]*\b\d{6}\b)/i;
const AUTOHOST_TWOFA_FROM_PATTERN = /^no-reply@notice\.autohost\.ai$/i;
const AUTOHOST_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour Autohost login verification code\b)(?=[\s\S]*\bPlease verify your login attempt\b)(?=[\s\S]*\bverification code below\b[\s\S]{0,1200}\b\d{6}\b)/i;
const MMT_TWOFA_FROM_PATTERN = /^noreply@go-mmt\.com$/i;
const MMT_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bOTP\b)(?=[\s\S]*\b(?:one-time passcode|use the below one-time passcode)\b)(?=[\s\S]*\b\d{4,8}\b)/i;
const GITHUB_TWOFA_FROM_PATTERN = /^noreply@github\.com$/i;
const GITHUB_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\[GitHub\] Please verify your device)(?=[\s\S]*\bA sign in attempt requires further verification\b)(?=[\s\S]*\bwe did not recognize your device\b)(?=[\s\S]*\bVerification code:\s*\d{6}\b)/i;
const STARLINK_TWOFA_FROM_PATTERN = /^(?:no-reply@starlink\.com|accounts@hyatus\.com)$/i;
const STARLINK_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour Starlink verification code\b)(?=[\s\S]*\bUse code\s+\d{6}\s+to verify your identity with Starlink\b)(?=[\s\S]*\bexpire in 15 minutes\b)/i;
const BILT_TWOFA_FROM_PATTERN = /^no-reply@otp2\.bilt\.com$/i;
const BILT_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bBilt Verification Code\b)(?=[\s\S]*\bYour one-time passcode is\s+\d{4,8}\b)(?=[\s\S]*\brequested a verification code for your account\b)/i;
const RENTCAFE_TWOFA_FROM_PATTERN = /^no-reply@rentcafe\.com$/i;
const RENTCAFE_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bOTP for login\b)(?=[\s\S]*\b\d{4,8}\s+is your one-time password \(OTP\) for login\b)(?=[\s\S]*\bvalid for 10 minutes\b)/i;
const FOREWARN_TWOFA_FROM_PATTERN = /^do-not-reply@forewarn\.com$/i;
const FOREWARN_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bFOREWARN Login Code\b)(?=[\s\S]*\bFOREWARN login code\b)(?=[\s\S]*\benter the following code\b)(?=[\s\S]*\b\d{6}\b)/i;
const HULU_TWOFA_FROM_PATTERN = /^accounts-noreply@messaging\.hulu\.com$/i;
const HULU_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour one-time passcode for Hulu\b)(?=[\s\S]*\bUse this passcode to verify\b)(?=[\s\S]*\bexpire in 5 minutes\b)(?=[\s\S]*\b\d{6}\b)/i;
const HYATUS_LIVING_TWOFA_FROM_PATTERN = /^reservations@hyatus\.com$/i;
const HYATUS_LIVING_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bHyatus Living verification passcode\b)(?=[\s\S]*\bUse the passcode\b)(?=[\s\S]*\bto sign in to your Hyatus Living account\b)(?=[\s\S]*\b\d{6}\b)/i;
const ROKU_TWOFA_FROM_PATTERN = /^(?:noreply@roku\.com|accounts@hyatus\.com)$/i;
const ROKU_ACTIVATION_TWOFA_TEXT_PATTERN = /^(?=[\s\S]*\bRoku \| Activate your device\b)(?=[\s\S]*\bactivate your device\b)(?=[\s\S]*my\.roku\.com(?:\/|%2F)link(?:\/|%2F)mail\b)/i;
const ROKU_SIGN_IN_TWOFA_TEXT_PATTERN = /^(?=[\s\S]*\bRoku \| Signing in on [^\r\n?]{1,120}\?)(?=[\s\S]*\bAre you trying to sign in to your Roku account\?)(?=[\s\S]*\bEnter the following code to finish signing in:)(?=[\s\S]*\b\d{6}\b)/i;
const SLACK_TWOFA_FROM_PATTERN = /^no-reply(?:-[a-z0-9]+)?@slack\.com$/i;
const SLACK_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bSlack confirmation code:\s*[A-Z0-9-]+\b)(?=[\s\S]*\bConfirm your email address\b)/i;
const DISNEY_TWOFA_FROM_PATTERN = /^(?:accounts@hyatus\.com|[^@\s]+@(?:[a-z0-9-]+\.)*disneyplus\.com)$/i;
const DISNEY_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour one-time passcode for Disney\+)(?=[\s\S]*\bone-time passcode\b)(?=[\s\S]*\b\d{6}\b)/i;
const STRIPE_LINK_TWOFA_FROM_PATTERN = /^(?:notifications@link\.com|accounts@hyatus\.com)$/i;
const STRIPE_LINK_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bVerify your email\b)(?=[\s\S]*\bConfirm it(?:'|’)?s you\b)(?=[\s\S]*\bverify your email address\b)(?=[\s\S]*https:\/\/(?:app\.)?link\.com\/)/i;
const KEYCAFE_CONFIRM_TWOFA_FROM_PATTERN = /^noreply@keycafe\.com$/i;
const KEYCAFE_CONFIRM_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bAction Required:\s*Please Confirm Your Email Address\b)(?=[\s\S]*https:\/\/(?:www\.)?keycafe\.com\/register\/verifyRegistration\?t=)/i;
const IGLOOHOME_TWOFA_FROM_PATTERN = /^noreply@igloohome\.co$/i;
const IGLOOHOME_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour One-Time Passcode from igloohome\b)(?=[\s\S]*\bPlease enter the One-Time Passcode \(OTP\) below\b)(?=[\s\S]*\b(?:\d{6}|\d{3}\s+\d{3})\b)/i;
const CLAUDE_LOGIN_RECIPIENT = "claude@hyatusliving.com";
const CLAUDE_LOGIN_FROM_PATTERN = /^no-reply(?:-[a-z0-9-]+)?@(?:[a-z0-9-]+\.)*anthropic\.com$/i;
const CLAUDE_LOGIN_TEXT_PATTERN = /(?=[\s\S]*\bSecure link to log in to Claude\.ai\b)(?=[\s\S]*\bSign in to Claude\.ai\b)(?=[\s\S]*\bclaude\.ai\/magic-link\b)/i;
const CLAUDE_LOGIN_LINK_PATTERN = /https:\/\/claude\.ai\/magic-link[^\s"'<>]+/i;

export interface TwofaEmailMatch {
	source: string;
	channel: string;
}

export function getTwofaEmailMatch(fromAddress: string, searchText: string, _recipients: string[] = []): TwofaEmailMatch | null {
	if (OPENAI_TWOFA_FROM_PATTERN.test(fromAddress) && OPENAI_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "openai", channel: "codex" };
	}
	if (AUTOHOST_TWOFA_FROM_PATTERN.test(fromAddress) && AUTOHOST_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "autohost", channel: "agentic-inbox" };
	}
	if (MMT_TWOFA_FROM_PATTERN.test(fromAddress) && MMT_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "mmt", channel: "agentic-inbox" };
	}
	if (GITHUB_TWOFA_FROM_PATTERN.test(fromAddress) && GITHUB_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "github", channel: "agentic-inbox" };
	}
	if (STARLINK_TWOFA_FROM_PATTERN.test(fromAddress) && STARLINK_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "starlink", channel: "agentic-inbox" };
	}
	if (BILT_TWOFA_FROM_PATTERN.test(fromAddress) && BILT_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "bilt", channel: "agentic-inbox" };
	}
	if (RENTCAFE_TWOFA_FROM_PATTERN.test(fromAddress) && RENTCAFE_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "rentcafe", channel: "agentic-inbox" };
	}
	if (FOREWARN_TWOFA_FROM_PATTERN.test(fromAddress) && FOREWARN_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "forewarn", channel: "agentic-inbox" };
	}
	if (HULU_TWOFA_FROM_PATTERN.test(fromAddress) && HULU_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "hulu", channel: "agentic-inbox" };
	}
	if (HYATUS_LIVING_TWOFA_FROM_PATTERN.test(fromAddress) && HYATUS_LIVING_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "hyatus-living", channel: "agentic-inbox" };
	}
	if (
		ROKU_TWOFA_FROM_PATTERN.test(fromAddress)
		&& (ROKU_ACTIVATION_TWOFA_TEXT_PATTERN.test(searchText) || ROKU_SIGN_IN_TWOFA_TEXT_PATTERN.test(searchText))
	) {
		return { source: "roku", channel: "agentic-inbox" };
	}
	if (SLACK_TWOFA_FROM_PATTERN.test(fromAddress) && SLACK_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "slack", channel: "agentic-inbox" };
	}
	if (DISNEY_TWOFA_FROM_PATTERN.test(fromAddress) && DISNEY_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "disney", channel: "agentic-inbox" };
	}
	if (STRIPE_LINK_TWOFA_FROM_PATTERN.test(fromAddress) && STRIPE_LINK_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "stripe-link", channel: "agentic-inbox" };
	}
	if (KEYCAFE_CONFIRM_TWOFA_FROM_PATTERN.test(fromAddress) && KEYCAFE_CONFIRM_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "keycafe", channel: "agentic-inbox" };
	}
	if (IGLOOHOME_TWOFA_FROM_PATTERN.test(fromAddress) && IGLOOHOME_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "igloohome", channel: "agentic-inbox" };
	}
	if (
		CLAUDE_LOGIN_FROM_PATTERN.test(fromAddress)
		&& CLAUDE_LOGIN_TEXT_PATTERN.test(searchText)
		&& _recipients.map((recipient) => recipient.toLowerCase()).includes(CLAUDE_LOGIN_RECIPIENT)
	) {
		return { source: "claude", channel: "agentic-inbox" };
	}
	return null;
}

export interface ClaudeLoginSmsMatch {
	service: "Claude";
	recipient: typeof CLAUDE_LOGIN_RECIPIENT;
	link: string;
}

export function getClaudeLoginSmsMatch(fromAddress: string, recipients: string[], searchText: string): ClaudeLoginSmsMatch | null {
	if (!recipients.map((recipient) => recipient.toLowerCase()).includes(CLAUDE_LOGIN_RECIPIENT)) return null;
	if (!CLAUDE_LOGIN_FROM_PATTERN.test(fromAddress)) return null;
	if (!CLAUDE_LOGIN_TEXT_PATTERN.test(searchText)) return null;
	const linkMatch = searchText.match(CLAUDE_LOGIN_LINK_PATTERN);
	if (!linkMatch) return null;
	return {
		service: "Claude",
		recipient: CLAUDE_LOGIN_RECIPIENT,
		link: linkMatch[0].replace(/&amp;/g, "&"),
	};
}
