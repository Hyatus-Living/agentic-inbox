const OPENAI_TWOFA_FROM_PATTERN = /^(?:[^@\s]+@(?:tm\d*\.)?openai\.com|tm@openai\.com)$/i;
const OPENAI_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour temporary ChatGPT (?:login|verification) code\b)(?=[\s\S]*\bEnter this temporary verification code to continue\b)(?=[\s\S]*\b\d{6}\b)/i;
const AUTOHOST_TWOFA_FROM_PATTERN = /^no-reply@notice\.autohost\.ai$/i;
const AUTOHOST_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bYour Autohost login verification code\b)(?=[\s\S]*\bPlease verify your login attempt\b)(?=[\s\S]*\bverification code below\b[\s\S]{0,1200}\b\d{6}\b)/i;
const MMT_TWOFA_FROM_PATTERN = /^noreply@go-mmt\.com$/i;
const MMT_TWOFA_TEXT_PATTERN = /(?=[\s\S]*\bOTP\b)(?=[\s\S]*\b(?:one-time passcode|use the below one-time passcode)\b)(?=[\s\S]*\b\d{4,8}\b)/i;

export interface TwofaEmailMatch {
	source: string;
	channel: string;
}

export function getTwofaEmailMatch(fromAddress: string, searchText: string): TwofaEmailMatch | null {
	if (OPENAI_TWOFA_FROM_PATTERN.test(fromAddress) && OPENAI_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "openai", channel: "codex" };
	}
	if (AUTOHOST_TWOFA_FROM_PATTERN.test(fromAddress) && AUTOHOST_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "autohost", channel: "agentic-inbox" };
	}
	if (MMT_TWOFA_FROM_PATTERN.test(fromAddress) && MMT_TWOFA_TEXT_PATTERN.test(searchText)) {
		return { source: "mmt", channel: "agentic-inbox" };
	}
	return null;
}
