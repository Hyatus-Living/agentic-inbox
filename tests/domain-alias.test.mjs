import assert from "node:assert/strict";
import test from "node:test";

import {
	getAliasDomains,
	getAliasDomainMailbox,
	resolveMailboxForRecipients,
} from "../workers/lib/config.ts";

const env = {
	DOMAINS: "hyatusliving.com",
	ALIAS_DOMAINS: ["hyatusstays.com", "hyatus.org"],
	ALIAS_DOMAIN_MAILBOX: "catch-all@hyatusliving.com",
	EMAIL_ADDRESSES: [
		"ai@hyatusliving.com",
		"catch-all@hyatusliving.com",
		"accounts@hyatusliving.com",
	],
	EMAIL_ADDRESS_ALIASES: {
		"codex1@hyatusliving.com": "ai@hyatusliving.com",
	},
};

test("getAliasDomains parses array and comma-string forms", () => {
	assert.deepEqual(getAliasDomains(env), ["hyatusstays.com", "hyatus.org"]);
	assert.deepEqual(getAliasDomains({ ALIAS_DOMAINS: "Hyatusstays.com, hyatus.org" }), ["hyatusstays.com", "hyatus.org"]);
	assert.deepEqual(getAliasDomains({}), []);
});

test("getAliasDomainMailbox is normalized", () => {
	assert.equal(getAliasDomainMailbox(env), "catch-all@hyatusliving.com");
	assert.equal(getAliasDomainMailbox({ ALIAS_DOMAIN_MAILBOX: " Catch-All@Hyatusliving.com " }), "catch-all@hyatusliving.com");
	assert.equal(getAliasDomainMailbox({}), "");
});

test("any local part at an alias domain lands in the catch-all mailbox", () => {
	assert.deepEqual(
		resolveMailboxForRecipients(env, ["info@hyatusstays.com"]),
		{ recipientAddress: "info@hyatusstays.com", mailboxId: "catch-all@hyatusliving.com" },
	);
	assert.equal(resolveMailboxForRecipients(env, ["anythingatall@hyatus.org"])?.mailboxId, "catch-all@hyatusliving.com");
});

test("even a name matching a canonical AI address, at an alias domain, goes to catch-all", () => {
	// The point of a catch-all: alias-domain mail is NOT special-cased per local part.
	assert.equal(resolveMailboxForRecipients(env, ["ai@hyatus.org"])?.mailboxId, "catch-all@hyatusliving.com");
});

test("canonical hyatusliving.com recipients are unchanged (no regression)", () => {
	assert.equal(resolveMailboxForRecipients(env, ["ai@hyatusliving.com"])?.mailboxId, "ai@hyatusliving.com");
	// per-address alias still resolves to its canonical mailbox
	assert.equal(resolveMailboxForRecipients(env, ["codex1@hyatusliving.com"])?.mailboxId, "ai@hyatusliving.com");
	assert.equal(resolveMailboxForRecipients(env, ["accounts@hyatusliving.com"])?.mailboxId, "accounts@hyatusliving.com");
});

test("a configured recipient wins even when an alias-domain recipient is also present", () => {
	const r = resolveMailboxForRecipients(env, ["ai@hyatusliving.com", "x@hyatusstays.com"]);
	assert.equal(r?.mailboxId, "ai@hyatusliving.com");
});

test("a non-alias external domain is ignored", () => {
	assert.equal(resolveMailboxForRecipients(env, ["someone@gmail.com"]), undefined);
});

test("no ALIAS_DOMAIN_MAILBOX configured -> alias-domain mail is not resolved (fails safe)", () => {
	const noMailbox = { ...env, ALIAS_DOMAIN_MAILBOX: undefined };
	assert.equal(resolveMailboxForRecipients(noMailbox, ["info@hyatusstays.com"]), undefined);
	// canonical still works
	assert.equal(resolveMailboxForRecipients(noMailbox, ["ai@hyatusliving.com"])?.mailboxId, "ai@hyatusliving.com");
});
