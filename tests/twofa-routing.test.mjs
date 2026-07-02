import assert from "node:assert/strict";
import test from "node:test";

import { getTwofaEmailMatch } from "../workers/twofa-routing.ts";

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
