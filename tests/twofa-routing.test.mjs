import assert from "node:assert/strict";
import test from "node:test";

import { getClaudeLoginSmsMatch, getTwofaEmailMatch } from "../workers/twofa-routing.ts";

test("Autohost login verification emails are 2FA candidates", () => {
	const searchText = [
		"Login code for Autohost",
		"Your Autohost login verification code",
		"Please verify your login attempt",
		"Hi Hyatus,",
		"please use the verification code below:",
		"123456",
		"Login Request Details",
		"Location: New York, US",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("no-reply@notice.autohost.ai", searchText),
		{ source: "autohost", channel: "agentic-inbox" },
	);
});

test("Autohost non-code emails are not 2FA candidates", () => {
	const searchText = [
		"Autohost account update",
		"Hi Hyatus,",
		"Your Autohost settings were changed.",
	].join("\n");

	assert.equal(getTwofaEmailMatch("no-reply@notice.autohost.ai", searchText), null);
});

test("Autohost login text from the wrong sender is not a 2FA candidate", () => {
	const searchText = [
		"Login code for Autohost",
		"Your Autohost login verification code",
		"Please verify your login attempt",
		"please use the verification code below:",
		"123456",
	].join("\n");

	assert.equal(getTwofaEmailMatch("attacker@example.com", searchText), null);
});

test("MMT one-time passcode emails are 2FA candidates", () => {
	const searchText = [
		"OTP to login into your Connect account",
		"Dear Valued Partner,",
		"You have initiated a request to login.",
		"To proceed, kindly use the below one-time passcode",
		"123456",
		"Your OTP will expire in: 5 minutes.",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("noreply@go-mmt.com", searchText),
		{ source: "mmt", channel: "agentic-inbox" },
	);
});

test("MMT non-OTP emails are not 2FA candidates", () => {
	const searchText = [
		"Booking update",
		"Dear Valued Partner,",
		"Your reservation report is ready.",
	].join("\n");

	assert.equal(getTwofaEmailMatch("noreply@go-mmt.com", searchText), null);
});

test("GitHub device verification emails are 2FA candidates", () => {
	const searchText = [
		"[GitHub] Please verify your device",
		"A sign in attempt requires further verification because we did not recognize your device.",
		"To complete the sign in, enter the verification code on the unrecognized device.",
		"Verification code: 123456",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("noreply@github.com", searchText, ["ai@hyatusliving.com", "codex@hyatus.com"]),
		{ source: "github", channel: "agentic-inbox" },
	);
});

test("GitHub-looking text from another sender is not a 2FA candidate", () => {
	const searchText = [
		"[GitHub] Please verify your device",
		"A sign in attempt requires further verification because we did not recognize your device.",
		"Verification code: 123456",
	].join("\n");

	assert.equal(getTwofaEmailMatch("attacker@example.com", searchText), null);
});

test("forwarded Starlink verification codes are 2FA candidates", () => {
	const searchText = [
		"Your Starlink verification code",
		"Use code 123456 to verify your identity with Starlink.",
		"For security reasons, it will expire in 15 minutes.",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("accounts@hyatus.com", searchText, ["ai@hyatusliving.com", "accounts@hyatus.com"]),
		{ source: "starlink", channel: "agentic-inbox" },
	);
});

test("Bilt verification codes are 2FA candidates", () => {
	const searchText = [
		"Bilt Verification Code",
		"Your one-time passcode is 12345",
		"You recently requested a verification code for your account.",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("no-reply@otp2.bilt.com", searchText),
		{ source: "bilt", channel: "agentic-inbox" },
	);
});

test("RentCafe login OTP emails are 2FA candidates", () => {
	const searchText = [
		"OTP for login",
		"123456 is your one-time password (OTP) for login.",
		"It is valid for 10 minutes.",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("no-reply@rentcafe.com", searchText),
		{ source: "rentcafe", channel: "agentic-inbox" },
	);
});

test("package-room access codes are not treated as 2FA", () => {
	const searchText = [
		"Your package misses you",
		"Enter access code 123456 at the Luxer One screen to open the package room.",
	].join("\n");

	assert.equal(getTwofaEmailMatch("support@luxerone.com", searchText), null);
});

test("OpenAI login code emails still match the existing 2FA route", () => {
	const searchText = [
		"Your temporary ChatGPT login code",
		"Enter this temporary verification code to continue",
		"123456",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("noreply@tm.openai.com", searchText),
		{ source: "openai", channel: "codex" },
	);
});

test("OpenAI password reset code emails are 2FA candidates", () => {
	const searchText = [
		"Your temporary ChatGPT password reset code",
		"Enter this temporary verification code to continue:",
		"305126",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("noreply@tm.openai.com", searchText, ["codex4@hyatusliving.com"]),
		{ source: "openai", channel: "codex" },
	);
});

test("Forwarded OpenAI login code emails from accounts are 2FA candidates", () => {
	const searchText = [
		"Your temporary ChatGPT login code",
		"Enter this temporary verification code to continue:",
		"690165",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("accounts@hyatus.com", searchText, ["ai@hyatusliving.com", "accounts@hyatus.com"]),
		{ source: "openai", channel: "codex" },
	);
});

test("FOREWARN login code emails are 2FA candidates", () => {
	const searchText = [
		"FOREWARN Login Code",
		"FOREWARN login code:",
		"Please enter the following code:",
		"449042",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("do-not-reply@forewarn.com", searchText, ["ai@hyatusliving.com"]),
		{ source: "forewarn", channel: "agentic-inbox" },
	);
});

test("Hulu one-time passcode emails are 2FA candidates", () => {
	const searchText = [
		"Your one-time passcode for Hulu",
		"Use this passcode to verify the email address associated with your MyDisney account.",
		"It will expire in 5 minutes.",
		"678057",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("accounts-noreply@messaging.hulu.com", searchText, ["ai@hyatusliving.com"]),
		{ source: "hulu", channel: "agentic-inbox" },
	);
});

test("Hyatus Living verification passcode emails are 2FA candidates", () => {
	const searchText = [
		"Hyatus Living verification passcode",
		"Use the passcode 645987 to sign in to your Hyatus Living account.",
		"This passcode expires in 10 minutes and can only be used once.",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("reservations@hyatus.com", searchText, ["ai@hyatusliving.com", "accounts@hyatus.com"]),
		{ source: "hyatus-living", channel: "agentic-inbox" },
	);
});

test("Slack confirmation code emails are 2FA candidates", () => {
	const searchText = [
		"Slack confirmation code: YWV-YVV",
		"Confirm your email address.",
		"Here’s your confirmation code.",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("no-reply-nhmlvluykgssc4lcs3cghrgg@slack.com", searchText, ["codex@hyatusliving.com"]),
		{ source: "slack", channel: "agentic-inbox" },
	);
});

test("Roku activation emails to AI/account recipients are 2FA candidates", () => {
	const searchText = [
		"Roku | Activate your device",
		"Please activate your device",
		"https://click.web.roku.com/CL0/https:%2F%2Fmy.roku.com%2Flink%2Fmail%2Fl2tzQ46DU/1/example",
		"Activate Device",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("accounts@hyatus.com", searchText, ["ai@hyatusliving.com", "accounts@hyatus.co"]),
		{ source: "roku", channel: "agentic-inbox" },
	);
});

test("Roku activation emails to unrelated recipients are not 2FA candidates", () => {
	const searchText = [
		"Roku | Activate your device",
		"Please activate your device",
		"https://click.web.roku.com/CL0/https:%2F%2Fmy.roku.com%2Flink%2Fmail%2Fl2tzQ46DU/1/example",
	].join("\n");

	assert.equal(
		getTwofaEmailMatch("accounts@hyatus.com", searchText, ["purchases@hyatusliving.com"]),
		null,
	);
});

test("Claude login links for claude@hyatusliving.com are SMS candidates", () => {
	const searchText = [
		"Secure link to log in to Claude.ai | 2026-07-08 11:12:09",
		"Sign in to Claude.ai",
		"https://claude.ai/magic-link?client=desktop_app#token:recipient",
	].join("\n");

	assert.deepEqual(
		getClaudeLoginSmsMatch("no-reply-whzxq237vkachqaeahx1wa@mail.anthropic.com", ["claude@hyatusliving.com"], searchText),
		{
			service: "Claude",
			recipient: "claude@hyatusliving.com",
			link: "https://claude.ai/magic-link?client=desktop_app#token:recipient",
		},
	);
});

test("Claude login links for other recipients are not SMS candidates", () => {
	const searchText = [
		"Secure link to log in to Claude.ai | 2026-07-08 11:12:09",
		"Sign in to Claude.ai",
		"https://claude.ai/magic-link?client=desktop_app#token:recipient",
	].join("\n");

	assert.equal(
		getClaudeLoginSmsMatch("no-reply-whzxq237vkachqaeahx1wa@mail.anthropic.com", ["ai@hyatusliving.com"], searchText),
		null,
	);
});

test("Claude login text from the wrong sender is not an SMS candidate", () => {
	const searchText = [
		"Secure link to log in to Claude.ai | 2026-07-08 11:12:09",
		"Sign in to Claude.ai",
		"https://claude.ai/magic-link?client=desktop_app#token:recipient",
	].join("\n");

	assert.equal(
		getClaudeLoginSmsMatch("attacker@example.com", ["claude@hyatusliving.com"], searchText),
		null,
	);
});
