// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const folders = sqliteTable("folders", {
	id: text("id").primaryKey(),
	name: text("name").notNull().unique(),
	is_deletable: integer("is_deletable").notNull().default(1),
});

export const emails = sqliteTable("emails", {
	id: text("id").primaryKey(),
	folder_id: text("folder_id")
		.notNull()
		.references(() => folders.id, { onDelete: "cascade" }),
	subject: text("subject"),
	sender: text("sender"),
	recipient: text("recipient"),
	cc: text("cc"),
	bcc: text("bcc"),
	date: text("date"),
	read: integer("read").default(0),
	starred: integer("starred").default(0),
	body: text("body"),
	in_reply_to: text("in_reply_to"),
	email_references: text("email_references"),
	thread_id: text("thread_id"),
	message_id: text("message_id"),
	raw_headers: text("raw_headers"),
});

export const attachments = sqliteTable("attachments", {
	id: text("id").primaryKey(),
	email_id: text("email_id")
		.notNull()
		.references(() => emails.id, { onDelete: "cascade" }),
	filename: text("filename").notNull(),
	mimetype: text("mimetype").notNull(),
	size: integer("size").notNull(),
	content_id: text("content_id"),
	disposition: text("disposition"),
});

export const emailMessageDedup = sqliteTable("email_message_dedup", {
	message_id: text("message_id").primaryKey(),
	email_id: text("email_id").notNull(),
});

export const twofaDeliveries = sqliteTable("twofa_deliveries", {
	email_id: text("email_id").primaryKey(),
	message_id: text("message_id").notNull().unique(),
	payload: text("payload").notNull(),
	status: text("status").notNull().default("pending"),
	attempts: integer("attempts").notNull().default(0),
	next_attempt_at: integer("next_attempt_at").notNull(),
	last_error: text("last_error"),
	delivered_at: text("delivered_at"),
	created_at: text("created_at").notNull(),
	updated_at: text("updated_at").notNull(),
});
