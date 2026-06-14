// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Context } from "hono";
import type { MailboxContext } from "../lib/mailbox";

type AppContext = Context<MailboxContext>;

export async function handleReplyEmail(c: AppContext) {
	return c.json({ error: "Outbound email is disabled for this inbound-only Hyatus deployment." }, 403);
}

export async function handleForwardEmail(c: AppContext) {
	return c.json({ error: "Outbound email is disabled for this inbound-only Hyatus deployment." }, 403);
}
