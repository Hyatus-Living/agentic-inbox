#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://codex-inbox.hyatusliving.com";
const DEFAULT_MAILBOX = "ai@hyatusliving.com";
const PAGE_LIMIT = 100;

function usage() {
	console.error(`Usage:
  node scripts/agentic-inbox-cli.mjs folders [--mailbox ai@hyatusliving.com]
  node scripts/agentic-inbox-cli.mjs emails [--mailbox ai@hyatusliving.com] [--folder inbox] [--all]
  node scripts/agentic-inbox-cli.mjs search <query> [--mailbox ai@hyatusliving.com] [--folder inbox] [--all]
  node scripts/agentic-inbox-cli.mjs get <email-id> [--mailbox ai@hyatusliving.com]
  node scripts/agentic-inbox-cli.mjs backfill-labels [--mailbox ai@hyatusliving.com] [--recipient codex@hyatusliving.com]

Required environment:
  CF_ACCESS_CLIENT_ID or AGENTIC_INBOX_ACCESS_CLIENT_ID
  CF_ACCESS_CLIENT_SECRET or AGENTIC_INBOX_ACCESS_CLIENT_SECRET

Optional environment:
  AGENTIC_INBOX_BASE_URL defaults to ${DEFAULT_BASE_URL}`);
	process.exit(2);
}

function parseArgs(argv) {
	const [command, ...rest] = argv;
	const opts = {
		command,
		args: [],
		mailbox: DEFAULT_MAILBOX,
		baseUrl: process.env.AGENTIC_INBOX_BASE_URL || DEFAULT_BASE_URL,
		all: false,
	};

	for (let i = 0; i < rest.length; i++) {
		const value = rest[i];
		if (value === "--mailbox") opts.mailbox = rest[++i];
		else if (value === "--folder") opts.folder = rest[++i];
		else if (value === "--recipient") opts.recipient = rest[++i];
		else if (value === "--all") opts.all = true;
		else opts.args.push(value);
	}
	if (!command) usage();
	return opts;
}

function accessHeaders() {
	const clientId = process.env.CF_ACCESS_CLIENT_ID || process.env.AGENTIC_INBOX_ACCESS_CLIENT_ID;
	const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET || process.env.AGENTIC_INBOX_ACCESS_CLIENT_SECRET;
	if (!clientId || !clientSecret) {
		throw new Error("Missing Cloudflare Access service-token env vars.");
	}
	return {
		"CF-Access-Client-Id": clientId,
		"CF-Access-Client-Secret": clientSecret,
	};
}

async function request(opts, path, init = {}) {
	const url = new URL(path, opts.baseUrl);
	const response = await fetch(url, {
		...init,
		headers: {
			...accessHeaders(),
			...(init.body ? { "content-type": "application/json" } : {}),
			...init.headers,
		},
	});
	const text = await response.text();
	const body = text ? JSON.parse(text) : null;
	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText}: ${text}`);
	}
	return body;
}

function mailboxPath(opts, suffix) {
	return `/api/v1/mailboxes/${encodeURIComponent(opts.mailbox)}${suffix}`;
}

async function paged(opts, suffix, params = {}) {
	const all = [];
	let page = 1;
	let totalCount = null;
	while (true) {
		const query = new URLSearchParams({
			...params,
			page: String(page),
			limit: String(PAGE_LIMIT),
			sortColumn: "date",
			sortDirection: "DESC",
		});
		const result = await request(opts, mailboxPath(opts, `${suffix}?${query}`));
		const emails = Array.isArray(result) ? result : result.emails;
		totalCount = Array.isArray(result) ? emails.length : result.totalCount;
		all.push(...emails);
		if (!opts.all || all.length >= totalCount || emails.length === 0) break;
		page++;
	}
	return { emails: all, totalCount };
}

function printJson(value) {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));

	if (opts.command === "folders") {
		printJson(await request(opts, mailboxPath(opts, "/folders")));
		return;
	}

	if (opts.command === "emails") {
		const params = opts.folder ? { folder: opts.folder } : {};
		printJson(await paged(opts, "/emails", params));
		return;
	}

	if (opts.command === "search") {
		const queryText = opts.args.join(" ");
		if (!queryText) usage();
		const params = { query: queryText };
		if (opts.folder) params.folder = opts.folder;
		printJson(await paged(opts, "/search", params));
		return;
	}

	if (opts.command === "get") {
		const id = opts.args[0];
		if (!id) usage();
		printJson(await request(opts, mailboxPath(opts, `/emails/${encodeURIComponent(id)}`)));
		return;
	}

	if (opts.command === "backfill-labels") {
		const query = opts.recipient ? `?recipient=${encodeURIComponent(opts.recipient)}` : "";
		printJson(await request(opts, mailboxPath(opts, `/content-labels/backfill${query}`), { method: "POST" }));
		return;
	}

	usage();
}

main().catch((error) => {
	console.error(error.message);
	process.exit(1);
});
