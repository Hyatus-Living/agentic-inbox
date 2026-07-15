import assert from "node:assert/strict";
import test from "node:test";

import {
	getContentLabelRules,
	LUXER_PARCEL_SEARCH_PATTERN_SOURCE,
	isLuxerParcelEmail,
} from "../workers/lib/config.ts";

test("only recognized Luxer package subjects match the parcel route", () => {
	for (const subject of [
		"You've got a package.",
		"Your package misses you",
		"Don't forget to pick up your package.",
		"Your Package is still waiting",
		"Please pick up your package",
		"Your package is being returned to the sender",
	]) {
		assert.equal(isLuxerParcelEmail("support@luxerone.com", subject), true);
	}
});

test("Luxer marketing and lookalike senders do not match the parcel route", () => {
	assert.equal(isLuxerParcelEmail("marketing@outreach.luxerone.com", "Download the Luxer One App Today!"), false);
	assert.equal(isLuxerParcelEmail("attacker@example.com", "You've got a package."), false);
	assert.equal(isLuxerParcelEmail("support@luxerone.com", "Welcome to Luxer One"), false);
	assert.equal(isLuxerParcelEmail("support@luxerone.com", "Unexpected package subject"), false);
});

test("Luxer parcel mail receives the static Parcel folder rule", () => {
	const rule = getContentLabelRules({}).find((candidate) => candidate.name === "luxer-one-parcel");
	assert.deepEqual(rule, {
		name: "luxer-one-parcel",
		mailboxId: "ai@hyatusliving.com",
		fromPattern: "^support@luxerone\\.com$",
		pattern: LUXER_PARCEL_SEARCH_PATTERN_SOURCE,
		folderId: "parcel",
		folderName: "Parcel",
	});
});
