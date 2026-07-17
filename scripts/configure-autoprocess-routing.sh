#!/bin/zsh

set -euo pipefail

WORKSPACE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PARENT_WORKSPACE_DIR="$(cd "$WORKSPACE_DIR/.." && pwd)"

for env_file in "$PARENT_WORKSPACE_DIR/.env" "$PARENT_WORKSPACE_DIR/.env.local" "$WORKSPACE_DIR/.env" "$WORKSPACE_DIR/.env.local"; do
  if [[ -f "$env_file" ]]; then
    source "$env_file"
  fi
done

: "${CLOUDFLARE_ACCOUNT_TOKEN:?CLOUDFLARE_ACCOUNT_TOKEN is required}"
: "${ZONE_ID:=8175cd86fb9021a30c0707dd2c9d03b6}"

ADDRESSES=("${(@s:,:)${AGENTIC_INBOX_ROUTING_ADDRESSES:-autoprocess@hyatusliving.com,accounts@hyatusliving.com,lore2@hyatusliving.com}}")
WORKER_NAME="${AGENTIC_INBOX_WORKER_NAME:-${AUTOPROCESS_WORKER_NAME:-hyatusliving-agentic-inbox}}"

for address in "${ADDRESSES[@]}"; do
  echo "Configuring $address -> $WORKER_NAME"

  existing_rule_id="$(
    curl -sS \
      -H "Authorization: Bearer $CLOUDFLARE_ACCOUNT_TOKEN" \
      "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules?per_page=250&page=1" \
      | jq -r --arg address "$address" '
          .result[]
          | select(any(.matchers[]?; .field == "to" and .value == $address))
          | .id
        ' \
      | head -1
  )"

  payload="$(jq -n \
    --arg address "$address" \
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
    continue
  fi

  curl -sS \
    -X POST \
    -H "Authorization: Bearer $CLOUDFLARE_ACCOUNT_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/email/routing/rules" \
    --data "$payload" \
    | jq
done
