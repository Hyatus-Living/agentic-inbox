import assert from "node:assert/strict";
import test from "node:test";

import { getContentLabelRules } from "../workers/lib/config.ts";
import { buildParcelPendingPayload, isLuxerParcelEmail } from "../workers/parcel-routing.ts";

const luxerPackageText = [
	"You've got a package.",
	"ENTER ACCESS CODE 438296",
	"Go to the Luxer One package room in your building.",
].join("\n");

test("Luxer package notifications match the parcel route", () => {
	assert.equal(isLuxerParcelEmail("support@luxerone.com", luxerPackageText), true);
});

test("Luxer marketing and lookalike senders do not match the parcel route", () => {
	assert.equal(isLuxerParcelEmail("marketing@outreach.luxerone.com", "Download the Luxer One App Today!"), false);
	assert.equal(isLuxerParcelEmail("attacker@example.com", luxerPackageText), false);
	assert.equal(isLuxerParcelEmail("support@luxerone.com", "Welcome to Luxer One"), false);
});

test("Luxer parcel mail receives the static Parcel folder rule", () => {
	const rule = getContentLabelRules({}).find((candidate) => candidate.name === "luxer-one-parcel");
	assert.deepEqual(rule, {
		name: "luxer-one-parcel",
		mailboxId: "ai@hyatusliving.com",
		fromPattern: "^support@luxerone\\.com$",
		pattern: "(?=[\\s\\S]*\\bENTER ACCESS CODE\\b)(?=[\\s\\S]*\\bLuxer One package room\\b)",
		folderId: "parcel",
		folderName: "Parcel",
	});
});

test("parcel webhook payload preserves the unit recipient and stable source id", () => {
	assert.deepEqual(buildParcelPendingPayload("package body", {
		sourceEmailId: "luxer-message-1",
		sourceAgenticEmailId: "agentic-1",
		sourceMailbox: "ai@hyatusliving.com",
		fromAddress: "support@luxerone.com",
		fromName: "Luxer One",
		toAddress: "so2009mi@hyatusliving.com",
		subject: "You've got a package.",
		receivedAt: "2026-07-14T18:09:00.000Z",
	}), {
		source_email_id: "luxer-message-1",
		source_agentic_email_id: "agentic-1",
		source_mailbox: "ai@hyatusliving.com",
		from_address: "support@luxerone.com",
		from_name: "Luxer One",
		to_address: "so2009mi@hyatusliving.com",
		subject: "You've got a package.",
		body: "package body",
		received_at: "2026-07-14T18:09:00.000Z",
	});
});
