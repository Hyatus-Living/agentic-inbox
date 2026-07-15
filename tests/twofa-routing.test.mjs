import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
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

test("Disney+ one-time passcodes forwarded by Accounts are 2FA candidates", () => {
	const searchText = [
		"Your one-time passcode for Disney+",
		"Use this one-time passcode to finish signing in.",
		"123456",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("accounts@hyatus.com", searchText, ["ai@hyatusliving.com"]),
		{ source: "disney", channel: "agentic-inbox" },
	);
});

test("Disney login alerts without a passcode are not 2FA candidates", () => {
	assert.equal(
		getTwofaEmailMatch("accounts@hyatus.com", "We noticed a new login to Disney+"),
		null,
	);
});

test("Stripe Link verification links are 2FA candidates", () => {
	const searchText = [
		"Verify your email",
		"Confirm it’s you",
		"To confirm it’s you, please verify your email address.",
		"https://app.link.com/verify/example",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("notifications@link.com", searchText),
		{ source: "stripe-link", channel: "agentic-inbox" },
	);
});

test("Keycafe account-confirmation links override the ordinary Keycafe route", () => {
	const searchText = [
		"Action Required: Please Confirm Your Email Address",
		"Confirm your email address to finish creating your account.",
		"https://www.keycafe.com/register/verifyRegistration?t=example-token",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("noreply@keycafe.com", searchText),
		{ source: "keycafe", channel: "agentic-inbox" },
	);
});

test("igloohome spaced one-time passcodes are 2FA candidates", () => {
	const searchText = [
		"Your One-Time Passcode from igloohome",
		"Please enter the One-Time Passcode (OTP) below on igloohome App",
		"137 143",
		"It will be valid for 5 minutes",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("noreply@igloohome.co", searchText, ["igloohome@hyatusliving.com"]),
		{ source: "igloohome", channel: "agentic-inbox" },
	);
});

test("Claude magic links are both two-fa and SMS candidates", () => {
	const searchText = [
		"Secure link to log in to Claude.ai",
		"Sign in to Claude.ai",
		"https://claude.ai/magic-link#example",
	].join("\n");
	const sender = "no-reply-example@mail.anthropic.com";
	const recipients = ["claude@hyatusliving.com"];

	assert.deepEqual(
		getTwofaEmailMatch(sender, searchText, recipients),
		{ source: "claude", channel: "agentic-inbox" },
	);
	assert.equal(getClaudeLoginSmsMatch(sender, recipients, searchText)?.service, "Claude");
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

test("direct Roku activation emails to unit recipients are 2FA candidates", () => {
	const searchText = [
		"Roku | Activate your device",
		"Please activate your device",
		"https://click.web.roku.com/CL0/https:%2F%2Fmy.roku.com%2Flink%2Fmail%2Fl2tzQ46DU/1/example",
		"Activate Device",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("noreply@roku.com", searchText, ["ev554ma@hyatusliving.com"]),
		{ source: "roku", channel: "agentic-inbox" },
	);
});

test("Accounts-forwarded Roku activation emails remain 2FA candidates for any recipient", () => {
	const searchText = [
		"Roku | Activate your device",
		"Please activate your device",
		"https://click.web.roku.com/CL0/https:%2F%2Fmy.roku.com%2Flink%2Fmail%2Fl2tzQ46DU/1/example",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("accounts@hyatus.com", searchText, ["purchases@hyatusliving.com"]),
		{ source: "roku", channel: "agentic-inbox" },
	);
});

test("direct Roku sign-in codes to unit recipients are 2FA candidates", () => {
	const searchText = [
		"Roku | Signing in on July 14, 2026 5:12 PM EDT?",
		"Signing in?",
		"Are you trying to sign in to your Roku account? We want to make sure it’s you.",
		"Enter the following code to finish signing in:",
		"123456",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("noreply@roku.com", searchText, ["the-lore@hyatusliving.com"]),
		{ source: "roku", channel: "agentic-inbox" },
	);
});

test("Accounts-forwarded Roku sign-in codes remain 2FA candidates", () => {
	const searchText = [
		"Roku | Signing in on July 14, 2026 5:12 PM EDT?",
		"Are you trying to sign in to your Roku account?",
		"Enter the following code to finish signing in:",
		"123456",
	].join("\n");

	assert.deepEqual(
		getTwofaEmailMatch("accounts@hyatus.com", searchText, ["ai@hyatusliving.com"]),
		{ source: "roku", channel: "agentic-inbox" },
	);
});

test("incomplete Roku sign-in notices are not 2FA candidates", () => {
	const searchText = [
		"Roku | Signing in on July 14, 2026 5:12 PM EDT?",
		"Are you trying to sign in to your Roku account?",
		"Contact Roku support if this was not you.",
	].join("\n");

	assert.equal(
		getTwofaEmailMatch("noreply@roku.com", searchText, ["the-lore@hyatusliving.com"]),
		null,
	);
});

test("large non-auth Roku messages do not trigger a pathological regex scan", () => {
	const searchText = `Roku account update\n${"x".repeat(50_000)}`;
	const startedAt = performance.now();

	assert.equal(
		getTwofaEmailMatch("noreply@roku.com", searchText, ["the-lore@hyatusliving.com"]),
		null,
	);
	assert.ok(performance.now() - startedAt < 250);
});

test("Roku activation text from another sender is not a 2FA candidate", () => {
	const searchText = [
		"Roku | Activate your device",
		"Please activate your device",
		"https://click.web.roku.com/CL0/https:%2F%2Fmy.roku.com%2Flink%2Fmail%2Fl2tzQ46DU/1/example",
	].join("\n");

	assert.equal(
		getTwofaEmailMatch("attacker@example.com", searchText, ["ev554ma@hyatusliving.com"]),
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
