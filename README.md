<div align="center">
  <h1>Agentic Inbox</h1>
  <p><em>A self-hosted email client with an AI agent, running entirely on Cloudflare Workers</em></p>
</div>

Agentic Inbox lets you send, receive, and manage emails through a modern web interface -- all powered by your own Cloudflare account. Incoming emails arrive via [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/), each mailbox is isolated in its own [Durable Object](https://developers.cloudflare.com/durable-objects/) with a SQLite database, and attachments are stored in [R2](https://developers.cloudflare.com/r2/).

An **AI-powered Email Agent** can read your inbox, search conversations, and draft replies -- built with the [Cloudflare Agents SDK](https://developers.cloudflare.com/agents/), OpenAI, and Cloudflare Workers.

![Agentic Inbox screenshot](./demo_app.png)


Read the blog post to learn more about Cloudflare Email Service and how to use it with the Agents SDK, MCP, and from the Wrangler CLI: [Email for Agents](https://blog.cloudflare.com/email-for-agents/).

## How to setup

**Important**: Clicking the 'Deploy to Cloudflare' button is only one part of the setup. You must follow the **After deploying** steps as well. For a full step-by-step guide with screenshots, refer to this comment: 
https://github.com/cloudflare/agentic-inbox/issues/4#issuecomment-4269118513

### To set up

1. Deploy to Cloudflare. The deploy flow will automatically provision R2, Durable Objects, and Workers AI. You'll be prompted for **DOMAINS**, which is the domain (yourdomain.com) you want to receive emails for (email@yourdomain.com).

     [![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agentic-inbox)

2. **Configure Cloudflare Access** -- Enable [one-click Cloudflare Access](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/) on your Worker under Settings > Domains & Routes. The modal will show your `POLICY_AUD` and `TEAM_DOMAIN` values. `TEAM_DOMAIN` can be either your Access team URL or the full `.../cdn-cgi/access/certs` URL. **You must set these as secrets for your Worker.**
3. **Set the OpenAI secret** -- Set `OPENAI_API_KEY` as a Worker secret. The default agent model is controlled by `OPENAI_MODEL`.
4. **Set up Email Routing** -- In the Cloudflare dashboard, go to your domain > Email Routing and create a catch-all rule that forwards to this Worker
5. **Enable Email Service** -- The worker needs the `send_email` binding to send outbound emails. See [Email Service docs](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/)
6. **Create a mailbox** -- Visit your deployed app and create a mailbox for any address on your domain (e.g. `hello@example.com`)

### Troubleshooting Access

1. If you see `Invalid or expired Access token`, that usually means `POLICY_AUD` or `TEAM_DOMAIN` secrets are incorrect.
   * Resolution: [turn Access off and back on for the Worker to get the Access modal again](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then reset your Worker secrets to the latest `POLICY_AUD` and `TEAM_DOMAIN` values shown there.
2. If you see `Cloudflare Access must be configured in production`, this application is intentionally enforcing Cloudflare Access so your inbox is not exposed to anyone on the internet.
   * Resolution: enable Access using [one-click Cloudflare Access for Workers](https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/), then set the `POLICY_AUD` and `TEAM_DOMAIN` Worker secrets from the modal values.

## Features

- **Full email client** — Send and receive emails via Cloudflare Email Routing with a rich text composer, reply/forward threading, folder organization, search, and attachments
- **Per-mailbox isolation** — Each mailbox runs in its own Durable Object with SQLite storage and R2 for attachments
- **Built-in AI agent** — Side panel with 9 email tools for reading, searching, drafting, and sending
- **Auto-draft on new email** — Agent automatically reads inbound emails and generates draft replies, always requiring explicit confirmation before sending
- **Configurable and persistent** — Custom system prompts per mailbox, persistent chat history, streaming markdown responses, and tool call visibility

## Stack

- **Frontend:** React 19, React Router v7, Tailwind CSS, Zustand, TipTap, `@cloudflare/kumo`
- **Backend:** Hono, Cloudflare Workers, Durable Objects (SQLite), R2, Email Routing
- **AI Agent:** Cloudflare Agents SDK (`AIChatAgent`), AI SDK v6, OpenAI (`OPENAI_MODEL`, default `gpt-4.1-mini`), `react-markdown` + `remark-gfm`
- **Auth:** Cloudflare Access JWT validation (required outside local development)

## Getting Started

```bash
npm install
npm run dev
```

### Configuration

1. Set your domain in `wrangler.jsonc`
2. Create an R2 bucket named `agentic-inbox`: `wrangler r2 bucket create agentic-inbox`

### Mailbox aliases

`EMAIL_ADDRESSES` is the list of accepted inbound recipients. `EMAIL_ADDRESS_ALIASES` maps accepted alias addresses into the canonical mailbox where mail is stored:

```jsonc
"EMAIL_ADDRESSES": ["ai@hyatusliving.com", "codex@hyatusliving.com", "claude@hyatusliving.com", "autoprocess@hyatusliving.com"],
"EMAIL_ADDRESS_ALIASES": {
  "codex@hyatusliving.com": "ai@hyatusliving.com",
  "claude@hyatusliving.com": "ai@hyatusliving.com",
  "autoprocess@hyatusliving.com": "ai@hyatusliving.com"
}
```

With this config, mail sent to `codex@hyatusliving.com`, `claude@hyatusliving.com`, or `autoprocess@hyatusliving.com` is stored in the `ai@hyatusliving.com` mailbox while the original `To` recipient remains visible on the email record.

### Autoprocess inbound webhook

Mail sent to `autoprocess@hyatusliving.com` is stored in the `ai@hyatusliving.com` mailbox, placed in the `Auto Process` folder, and posted to the configured webhook as raw `message/rfc822`.

Set the webhook URL as a Worker secret:

```bash
printf '%s' 'https://example.com/webhook' | wrangler secret put AUTOPROCESS_WEBHOOK_URL
```

Then deploy and create the exact Email Routing rule:

```bash
npm run deploy
npm run configure-autoprocess-routing
```

The routing script creates or updates `autoprocess@hyatusliving.com` so Cloudflare sends it to the `hyatusliving-agentic-inbox` Worker.

### Airbnb review removal extraction

Inbound messages whose sender email contains `airbnb.com` and whose subject/body contains either `has been removed at their request` or `We've removed reviews from your account` are sent to the FastAPI Bedrock Simple AI structured endpoint.

The extraction writes a synthetic `X-Hyatus-Structured-Extraction` entry into the stored email source headers with:

- `airbnb_channel_reservation_id`
- `extraction_purpose`
- `review_has_been_removed`

Set the Simple AI key as a Worker secret:

```bash
wrangler secret put SIMPLE_AI_API_KEY
```

`SIMPLE_AI_STRUCTURED_URL` is configured in `wrangler.jsonc` and defaults to `https://fast.gptpricing.com/simple-ai/structured`.

### Review removal forwarding

`CONTENT_FORWARD_RULES` forwards known channel review-removal notices to `autoprocess@hyatusliving.com` for downstream processing:

- Airbnb notices that say the review was removed at/upon guest request, or `We've removed reviews from your account`.
- Expedia / Partner Central notices whose subject/body contains `Guest review removed` or `Customer Review Removal`.

### Content forwarding rules

Inbound messages can be copied to a verified Cloudflare Email Routing destination when their subject, text body, or HTML body matches a JavaScript regular expression. Configure rules in `wrangler.jsonc` under `CONTENT_FORWARD_RULES`:

```jsonc
"CONTENT_FORWARD_RULES": [
  {
    "name": "booking-request",
    "mailboxId": "ai@hyatusliving.com",
    "pattern": "\\b(reservation|booking)\\b",
    "flags": "i",
    "forwardTo": "partnersupport@hyatus.com"
  }
]
```

Each rule applies only to its `mailboxId`. `forwardTo` must be a verified Cloudflare Email Routing destination address.

### Content label rules

Agentic Inbox stores mail in folders rather than separate Gmail-style labels. Inbound messages can be placed into a folder when their recipient, subject, text body, or HTML body matches a JavaScript regular expression. Configure rules in `wrangler.jsonc` under `CONTENT_LABEL_RULES`:

```jsonc
"CONTENT_LABEL_RULES": [
  {
    "name": "booking-folder",
    "mailboxId": "ai@hyatusliving.com",
    "fromPattern": "^noreply@example\\.com$",
    "recipientPattern": "^ai@hyatusliving\\.com$",
    "pattern": "\\b(reservation|booking)\\b",
    "flags": "i",
    "folderId": "booking",
    "folderName": "Booking"
  }
]
```

Each rule applies only to its `mailboxId`. `fromPattern` is optional and matches the parsed sender email address. `recipientPattern` is optional and matches the parsed `To`, `Cc`, or `Bcc` recipients. The first matching rule wins. `folderId` can be a system folder ID such as `inbox`, `archive`, `trash`, or a custom folder ID. Custom folders declared by label rules are created automatically with `folderName` when folders are listed or matching inbound mail arrives.

To apply the configured label rules to existing mail, call:

```bash
curl -X POST "https://codex-inbox.hyatusliving.com/api/v1/mailboxes/ai%40hyatusliving.com/content-labels/backfill"
```

Backfill only applies deployed `CONTENT_LABEL_RULES`; callers cannot submit ad hoc regexes or arbitrary target folders.

### Deploy

```bash
npm run deploy
```

## Prerequisites

- Cloudflare account with a domain
- [Email Routing](https://developers.cloudflare.com/email-routing/) enabled for receiving
- [Email Service](https://developers.cloudflare.com/email-service/) enabled for sending
- `OPENAI_API_KEY` configured as a Worker secret for the agent
- [Workers AI](https://developers.cloudflare.com/workers-ai/) enabled for prompt-injection scanning and draft verification
- [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) configured for deployed/shared environments (required in production)

Any user who passes the shared Cloudflare Access policy can access all mailboxes in this app by design. This includes the MCP server at `/mcp` -- external AI tools (Claude Code, Cursor, etc.) connected via MCP can operate on any mailbox by passing a `mailboxId` parameter. There is no per-mailbox authorization; the Cloudflare Access policy is the single trust boundary.

## Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser    │────>│  Hono Worker     │────>│  MailboxDO      │
│  React SPA   │     │  (API + SSR)     │     │  (SQLite + R2)  │
│  Agent Panel │     │                  │     └─────────────────┘
└──────┬───────┘     │  /agents/* ──────┼────>┌─────────────────┐
       │             │                  │     │  EmailAgent DO  │
       │ WebSocket   │                  │     │  (AIChatAgent)  │
       └─────────────┤                  │     │  9 email tools  │
                     │                  │────>│  OpenAI API     │
                     └──────────────────┘     └─────────────────┘
```

## License

Apache 2.0 -- see [LICENSE](LICENSE).
