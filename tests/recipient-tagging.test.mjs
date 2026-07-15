import assert from "node:assert/strict";
import test from "node:test";

import { getButterflyEmailTags } from "../workers/butterfly-routing.ts";
import { getRecipientEmailTags } from "../workers/recipient-tagging.ts";

test("recipient tags group forwarded plus-address variants", () => {
	assert.deepEqual(
		getRecipientEmailTags("ai@hyatusliving.com", [
			"ai@hyatusliving.com",
			"accounts+hcv2@hyatus.co",
			"accounts+signatureapi@hyatus.com",
			"purchases+lindsay@hyatus.com",
		]),
		["Accounts", "Purchases"],
	);
});

test("configured aliases become readable recipient tags", () => {
	assert.deepEqual(
		getRecipientEmailTags("ai@hyatusliving.com", [
			"accounts@hyatusliving.com",
			"claude@hyatusliving.com",
			"codex1@hyatusliving.com",
			"the-lore@hyatusliving.com",
		]),
		["Accounts", "Claude", "Codex 1", "The Lore"],
	);
});

test("direct AI, external, and unit-style recipients do not create recipient tags", () => {
	assert.deepEqual(
		getRecipientEmailTags("ai@hyatusliving.com", [
			"ai@hyatusliving.com",
			"guest@example.com",
			"SA5413L@hyatusliving.com",
		]),
		[],
	);
});

test("ordinary Butterfly notifications keep only the Butterfly tag", () => {
	const recipients = ["SA3301L@hyatusliving.com"];
	assert.deepEqual(
		[
			...getRecipientEmailTags("ai@hyatusliving.com", recipients),
			...getButterflyEmailTags("notifications@butterflymx.com", recipients, false),
		],
		["Butterfly"],
	);
});

test("Butterfly activation emails keep the service and unit tags", () => {
	const recipients = ["SA3201L@hyatusliving.com"];
	assert.deepEqual(
		[
			...getRecipientEmailTags("ai@hyatusliving.com", recipients),
			...getButterflyEmailTags("registration@butterflymx.com", recipients, true),
		],
		["Butterfly", "SA3201L"],
	);
});
