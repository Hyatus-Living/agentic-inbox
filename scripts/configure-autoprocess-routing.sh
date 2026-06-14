#!/bin/zsh

set -euo pipefail

WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$WORKSPACE_DIR/.env" ]]; then
  source "$WORKSPACE_DIR/.env"
fi

if [[ -f "$WORKSPACE_DIR/.env.local" ]]; then
  source "$WORKSPACE_DIR/.env.local"
fi

: "${CLOUDFLARE_ACCOUNT_TOKEN:?CLOUDFLARE_ACCOUNT_TOKEN is required}"
: "${ZONE_ID:=8175cd86fb9021a30c0707dd2c9d03b6}"

ADDRESS="${AUTOPROCESS_ADDRESS:-autoprocess@hyatusliving.com}"
WORKER_NAME="${AUTOPROCESS_WORKER_NAME:-hyatusliving-agentic-inbox}"

existing_rule_id="$(
  curl -sS \
    -H "Authorization: Bearer $CLOUDFLARE_ACCOUNT_TOKEN" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules?per_page=250&page=1" \
    | jq -r --arg address "$ADDRESS" '
        .result[]
        | select(any(.matchers[]?; .field == "to" and .value == $address))
        | .id
      ' \
    | head -1
)"

payload="$(jq -n \
  --arg address "$ADDRESS" \
  --arg worker "$WORKER_NAME" \
  '{
    matchers: [
      {
        type: "literal",
        field: "to",
        value: $address
      }
    ],
    actions: [
      {
        type: "worker",
        value: [$worker]
      }
    ],
    enabled: true
  }'
)"

if [[ -n "$existing_rule_id" ]]; then
  curl -sS \
    -X PUT \
    -H "Authorization: Bearer $CLOUDFLARE_ACCOUNT_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules/$existing_rule_id" \
    --data "$payload" \
    | jq
  exit 0
fi

curl -sS \
  -X POST \
  -H "Authorization: Bearer $CLOUDFLARE_ACCOUNT_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
  --data "$payload" \
  | jq
