#!/usr/bin/env bash
# Deploy event to Slack (issue #435). Everything arrives through env, never argv:
#   SLACK (webhook, secret), EVENT (started|succeeded|failed|rolled-back),
#   DEPLOY_ENV, VERSION, SHA, RUN_URL.
# No webhook: notice, exit 0. Delivery failure: warning, exit 0 (an event never fails a deploy).
set -uo pipefail
[ -n "${SLACK:-}" ] || { echo "::notice::No Slack webhook: deploy event not sent"; exit 0; }
case "${EVENT:-}" in
  started) msg="Deploy started:" ;;
  succeeded) msg="Deploy succeeded:" ;;
  failed) msg="Deploy FAILED:" ;;
  rolled-back) msg="Deploy FAILED, rolled back:" ;;
  *) echo "::error::unknown EVENT '${EVENT:-}'"; exit 1 ;;
esac
body="$(jq -nc --arg text "$msg ${DEPLOY_ENV:-} ${VERSION:-} (${SHA:-}) ${RUN_URL:-}" '{text:$text}')" || exit 1
# Webhook is a secret: curl output discarded, URL read from env only.
curl -sS -o /dev/null --fail -X POST -H 'Content-type: application/json' \
  --data "$body" "$SLACK" >/dev/null 2>&1 \
  || echo "::warning::Deploy event not delivered"
