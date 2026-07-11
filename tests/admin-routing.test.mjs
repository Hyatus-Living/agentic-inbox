import test from "node:test";
import assert from "node:assert/strict";
import { ADMIN_FORWARD_TO, getAdminForwardRecipient } from "../workers/admin-routing.ts";

test("admin-prefixed hyatusliving recipients forward to Hyatus admin", () => {
	assert.equal(ADMIN_FORWARD_TO, "admin@hyatus.com");
	assert.equal(getAdminForwardRecipient(["adminnh201p@hyatusliving.com"]), "adminnh201p@hyatusliving.com");
});

test("admin prefix matching is case-insensitive", () => {
	assert.equal(getAdminForwardRecipient(["AdminNH201P@HyatusLiving.com"]), "AdminNH201P@HyatusLiving.com");
});

test("non-admin hyatusliving recipients do not forward to admin", () => {
	assert.equal(getAdminForwardRecipient(["ai@hyatusliving.com", "accounts@hyatusliving.com"]), null);
});

test("admin prefix only applies to hyatusliving.com", () => {
	assert.equal(getAdminForwardRecipient(["admin@hyatus.com"]), null);
});
