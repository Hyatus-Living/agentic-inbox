import assert from "node:assert/strict";
import test from "node:test";

import {
	shouldExtractReviewRemoval,
	shouldUseOuterReviewRemovalCandidate,
} from "../workers/review-removal-routing.ts";

test("direct Airbnb removal notices are review-removal candidates", () => {
	assert.equal(
		shouldUseOuterReviewRemovalCandidate(
			{},
			"automated@airbnb.com",
			"The review for HMABC12345 has been removed at their request.",
			false,
		),
		true,
	);
});

test("autoprocess bundle text is ignored when attached emails are present", () => {
	assert.equal(
		shouldUseOuterReviewRemovalCandidate(
			{ attachments: [{ filename: "bundle.eml", mimeType: "message/rfc822" }] },
			"reservations@hyatus.com",
			[
				"The review for HMREMOVED1 has been removed at their request.",
				"Privacy warning for HMWKX8XNH8. This notification is not a review removal.",
			].join("\n"),
			true,
		),
		false,
	);
});

test("attached non-removal emails do not pass the per-email filter", () => {
	assert.equal(
		shouldExtractReviewRemoval(
			"support@airbnb.com",
			"Potential privacy intrusion warning during reservation HMWKX8XNH8.",
			true,
		),
		false,
	);
});

test("attached removal emails still pass the per-email filter", () => {
	assert.equal(
		shouldExtractReviewRemoval(
			"support@airbnb.com",
			"The review written for you regarding HMJKJCZ83A has been removed at their request.",
			true,
		),
		true,
	);
});
