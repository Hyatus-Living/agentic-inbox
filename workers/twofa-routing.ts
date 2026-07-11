const OPENAI_TWOFA_FROM_PATTERN = /^(?:[^@\s]+@(?:tm\d*\.)?openai\.com|tm@openai\.com|accounts@hyatus\.com)$/i;
const OPENAI_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour temporary (?:ChatGPT|OpenAI) (?:login|verification|password reset) code\b)(?=[\s\S]*\bEnter this temporary verification code to continue\b)(?=[\s\S]*\b\d{6}\b)/i;
const AUTOHOST_TWOFA_FROM_PATTERN = /^no-reply@notice\.autohost\.ai$/i;
const AUTOHOST_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour Autohost login verification code\b)(?=[\s\S]*\bPlease verify your login attempt\b)(?=[\s\S]*\bverification code below\b[\s\S]{0,1200}\b\d{6}\b)/i;
const MMT_TWOFA_FROM_PATTERN = /^noreply@go-mmt\.com$/i;
const MMT_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bOTP\b)(?=[\s\S]*\b(?:one-time passcode|use the below one-time passcode)\b)(?=[\s\S]*\b\d{4,8}\b)/i;
const FOREWARN_TWOFA_FROM_PATTERN = /^do-not-reply@forewarn\.com$/i;
const FOREWARN_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bFOREWARN Login Code\b)(?=[\s\S]*\bFOREWARN login code\b)(?=[\s\S]*\bTo complete your sign in\b)(?=[\s\S]*\b\d{6}\b)/i;
const HULU_TWOFA_FROM_PATTERN = /^accounts-noreply@messaging\.hulu\.com$/i;
const HULU_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour one-time passcode for Hulu\b)(?=[\s\S]*\bUse this passcode to verify\b)(?=[\s\S]*\bexpire in 5 minutes\b)(?=[\s\S]*\b\d{6}\b)/i;
const HYATUS_LIVING_TWOFA_FROM_PATTERN = /^reservations@hyatus\.com$/i;
const HYATUS_LIVING_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bHyatus Living verification passcode\b)(?=[\s\S]*\bUse the passcode\b)(?=[\s\S]*\bto sign in to your Hyatus Living account\b)(?=[\s\S]*\b\d{6}\b)/i;
const ROKU_TWOFA_FROM_PATTERN = /^accounts@hyatus\.com$/i;
const ROKU_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bRoku \| Activate your device\b)(?=[\s\S]*\bactivate your device\b)(?=[\s\S]*my\.roku\.com(?:\/|%2F)link(?:\/|%2F)mail\b)/i;
const ROKU_TWOFA_RECIPIENTS = new Set(["ai@hyatusliving.com", "accounts@hyatus.co"]);
const SLACK_TWOFA_FROM_PATTERN = /^no-reply(?:-[a-z0-9]+)?@slack\.com$/i;
const SLACK_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bSlack confirmation code:\s*[A-Z0-9-]+\b)(?=[\s\S]*\bConfirm your email address\b)/i;
const CLAUDE_LOGIN_RECIPIENT = "claude@hyatusliving.com";
const CLAUDE_LOGIN_FROM_PATTERN = /^no-reply(?:-[a-z0-9-]+)?@(?:[a-z0-9-]+\.)*anthropic\.com$/i;
const CLAUDE_LOGIN_TEXT_PATTERN = /(?=[\s\S]*\bSecure link to log in to Claude\.ai\b)(?=[\s\S]*\bSign in to Claude\.ai\b)(?=[\s\S]*\bclaude\.ai\/magic-link\b)/i;
const CLAUDE_LOGIN_LINK_PATTERN = /https:\/\/claude\.ai\/magic-link[^\s"'<>]+/i;

export interface TwofaEmailMatch {
	source: string;
	channel: string;
}

function hasAnyRecipient(recipients: string[], allowedRecipients: Set<string>) {
	return recipients.some((recipient) => allowedRecipients.has(recipient.toLowerCase()));
}

export function getTwofaEmailMatch(fromAddress: string, searchText: string, recipients: string[] = []): TwofaEmailMatch | null {
	if (OPENAI_TWOFA_FROM_PATTERN.test(fromAddress) && OPENAI_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "openai", channel: "codex" };
	}
	if (AUTOHOST_TWOFA_FROM_PATTERN.test(fromAddress) && AUTOHOST_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "autohost", channel: "agentic-inbox" };
	}
	if (MMT_TWOFA_FROM_PATTERN.test(fromAddress) && MMT_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "mmt", channel: "agentic-inbox" };
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
	if (ROKU_TWOFA_FROM_PATTERN.test(fromAddress) && hasAnyRecipient(recipients, ROKU_TWOFA_RECIPIENTS) && ROKU_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "roku", channel: "agentic-inbox" };
	}
	if (SLACK_TWOFA_FROM_PATTERN.test(fromAddress) && SLACK_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "slack", channel: "agentic-inbox" };
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
