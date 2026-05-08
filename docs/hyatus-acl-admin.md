# Hyatus Agentic Inbox ACL Admin

This deployment uses Cloudflare Access for authentication and app-level ACLs for mailbox authorization.

## Authentication

- Humans log in through the Cloudflare Access Google Workspace identity provider.
- Agents use Cloudflare Access service-token headers:
  - `CF-Access-Client-Id`
  - `CF-Access-Client-Secret`
- The app reads the validated Access JWT:
  - Google Workspace users are identified by JWT `email`.
  - Service tokens are identified by JWT `common_name`.

## Super Admin

The bootstrap super admin is configured in `wrangler.jsonc`:

```json
"SUPER_ADMIN_EMAILS": ["michaelort@hyatus.com"]
```

Super admins can open `/admin` in the inbox UI and manage mailbox grants.

## Mailbox Grants

Mailbox access defaults to deny.

Each grant maps one principal to one mailbox:

- Human principal: a direct `@hyatus.com` Google Workspace email address.
- Service-token principal: the Cloudflare Access service-token client ID ending in `.access`.
- Role:
  - `viewer` for human read access.
  - `service_agent` for MCP/API agent access.

The app enforces grants on:

- `/api/v1/mailboxes`
- `/api/v1/mailboxes/:mailboxId/*`
- `/agents/EmailAgent/:mailboxId/*`
- `/mcp` tools

## Admin UI

Use `https://codex-inbox.hyatusliving.com/admin`.

1. Select the mailbox, for example `codex@hyatusliving.com`.
2. Select `Google user` or `Service token`.
3. Enter the principal:
   - `user@hyatus.com`
   - `client-id.access`
4. Select the role.
5. Click `Add`.

Removing a grant immediately blocks new API, UI, Agent, and MCP requests for that mailbox. Existing long-lived MCP or Agent connections should be restarted after access changes.

## Current Bootstrap Grant

`codex@hyatusliving.com` is bootstrapped with the Codex Access service-token client ID so existing agent access continues after deployment.

## Authorization Rules

- Super admins can see every mailbox and manage settings, folders, grants, mailbox creation, mailbox deletion, email deletion, and email moves.
- Granted humans can list/read/search assigned mailboxes, read threads and attachments, and mark mail read/starred.
- Granted service tokens can list/read/search assigned mailboxes through API/MCP.
- Outbound send/reply/forward remains disabled.
