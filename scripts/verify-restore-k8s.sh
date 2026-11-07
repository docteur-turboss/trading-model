#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Post-restore verification (Kubernetes), issue #322
#  Usage:  bash scripts/verify-restore-k8s.sh [--max-candle-age-hours N]
#          K8S_NAMESPACE=trading-model
#          BACKUP_DIR=/backups BACKUP_AGE_IDENTITY=~/key.txt (optional: run
#          manifest checks)
#
#  Run after restore-k8s.sh. Read-only: it only reads the databases and the
#  SPIRE bundle, it creates nothing. Every check prints OK or KO; exit 1 when
#  any KO.
#    - audit trail: tests/backup/audit-chain.js, `broken` null and count > 0
#    - dead letters (dlq.dlq_entries): count reported
#    - financial_scraper.market_candles: rows > 0, latest timestamp reported
#      (KO older than --max-candle-age-hours when given; after a restore the
#      data is as old as the backup, so there is no default limit)
#    - schema `spire`: tables bundles and registered_entries present
#    - SPIRE trust bundle readable (PEM certificate)
#    - run manifest (BACKUP_DIR, issue #288): the manifest lists size and
#      sha256 per dump, no row counts: nothing to compare, said so.
# =============================================================================

set -euo pipefail

K8S_NAMESPACE="${K8S_NAMESPACE:-trading-model}"
BACKUP_DIR="${BACKUP_DIR:-}"
MAX_CANDLE_AGE_HOURS=""
FAILURES=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-candle-age-hours)
      [[ "${2:-}" =~ ^[0-9]+$ ]] || { echo "--max-candle-age-hours needs an integer"; exit 1; }
      MAX_CANDLE_AGE_HOURS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

ok()   { log "OK $*"; }
fail() { log "KO $*"; FAILURES=$((FAILURES + 1)); }
warn() { log "!! $*"; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=backup-lib.sh
source "${SCRIPT_DIR}/backup-lib.sh"
AUDIT_CHAIN_JS="${AUDIT_CHAIN_JS:-${SCRIPT_DIR}/../tests/backup/audit-chain.js}"

# Field `$2` of the flat JSON object `$1` (no node nor jq needed). Returns 1
# when the field is absent.
json_field() {
  local v
  v="$(printf '%s' "$1" | sed -n "s/.*\"$2\":\(\"[^\"]*\"\|[^,}]*\).*/\1/p")"
  [ -n "$v" ] || return 1
  v="${v#\"}"
  echo "${v%\"}"
}

mongo_eval() {
  local pod
  pod="$(mongo_primary "$1")" || return 1
  kubectl exec -n "${K8S_NAMESPACE}" "$pod" -- mongosh --quiet --eval "$2"
}

MYSQL_POD="$(mysql_primary_pod || true)"
mysql_q() {
  mysql_root_sh "$MYSQL_POD" "mysql --user=root -N -e \"$1\""
}

check_audit() {
  local out raw
  if ! raw="$(mongo_eval mongodb-audit "const AUDIT_DB = 'audit'; $(cat "$AUDIT_CHAIN_JS")" 2>&1)"; then
    fail "audit trail: cannot read the audit replica set"
    return
  fi
  out="$(printf '%s
' "$raw" | tail -1)"
  local broken count
  if ! broken="$(json_field "$out" broken 2>/dev/null)"; then
    fail "audit trail: unreadable result of audit-chain.js: ${out}"
    return
  fi
  count="$(json_field "$out" count)"
  if [ "$broken" != "null" ]; then
    fail "audit trail: chain broken: ${broken}"
  elif [ "$count" -le 0 ]; then
    fail "audit trail: no event (count ${count})"
  else
    ok "audit trail: ${count} events, sequence $(json_field "$out" first)..$(json_field "$out" last), chain intact"
  fi
}

check_dlq() {
  local n
  if n="$(mongo_eval mongodb "print(db.getSiblingDB('dlq').dlq_entries.countDocuments({}))" 2>/dev/null | tail -1)" \
    && [[ "$n" =~ ^[0-9]+$ ]]; then
    ok "dead letters: ${n} in dlq.dlq_entries"
  else
    fail "dead letters: cannot count dlq.dlq_entries"
  fi
}

check_candles() {
  local row rows latest
  if [ -z "$MYSQL_POD" ] || ! row="$(mysql_q "SELECT COUNT(*), IFNULL(DATE_FORMAT(MAX(timestamp), '%Y-%m-%d %H:%i:%s'), 'none'), IFNULL(TIMESTAMPDIFF(HOUR, MAX(timestamp), UTC_TIMESTAMP()), -1) FROM financial_scraper.market_candles" 2>/dev/null)"; then
    fail "market_candles: cannot be read"
    return
  fi
  rows="$(echo "$row" | awk -F'\t' '{print $1}')"
  latest="$(echo "$row" | awk -F'\t' '{print $2}')"
  local age
  age="$(echo "$row" | awk -F'\t' '{print $3}')"
  if ! [[ "$rows" =~ ^[0-9]+$ ]] || ! [[ "$age" =~ ^-?[0-9]+$ ]]; then
    fail "market_candles: unreadable result: ${row}"
  elif [ "$rows" -le 0 ]; then
    fail "market_candles: empty"
  elif [ -n "$MAX_CANDLE_AGE_HOURS" ] && [ "$age" -gt "$MAX_CANDLE_AGE_HOURS" ]; then
    fail "market_candles: ${rows} rows, latest ${latest} UTC is ${age} h old (limit ${MAX_CANDLE_AGE_HOURS} h)"
  else
    ok "market_candles: ${rows} rows, latest ${latest} UTC"
  fi
}

check_spire_schema() {
  local t missing=""
  for t in bundles registered_entries; do
    if [ "$(mysql_q "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='spire' AND table_name='${t}'" 2>/dev/null || echo 0)" != "1" ]; then
      missing="${missing} ${t}"
    fi
  done
  if [ -n "$missing" ]; then
    fail "spire schema: missing table(s):${missing}"
  else
    ok "spire schema: tables bundles and registered_entries present"
  fi
}

check_trust_bundle() {
  local bundle
  if bundle="$(kubectl exec -n "${K8S_NAMESPACE}" deployment/spire-server -c spire-server -- \
    /opt/spire/bin/spire-server bundle show -socketPath /run/spire/server-sockets/api.sock 2>/dev/null)" \
    && echo "$bundle" | grep -q 'BEGIN CERTIFICATE'; then
    ok "SPIRE trust bundle: readable (sha256 $(echo "$bundle" | sha256sum | cut -d' ' -f1 | cut -c1-16))"
  else
    fail "SPIRE trust bundle: not retrievable from spire-server"
  fi
}

check_manifest() {
  local manifest content
  if [ -z "$BACKUP_DIR" ] || [ ! -d "${BACKUP_DIR}/manifests" ]; then
    warn "run manifest: BACKUP_DIR not set or without manifests: no count comparison"
    return
  fi
  manifest="$(manifests_newest_first | head -1)"
  [ -n "$manifest" ] || { warn "run manifest: none found: no count comparison"; return; }
  if ! content="$(open_backup "$manifest" </dev/null 2>/dev/null)"; then
    fail "run manifest: ${manifest} cannot be read (BACKUP_AGE_IDENTITY?)"
    return
  fi
  # No row counts to compare: the #288 manifest holds size and sha256 only.
  # A count comparison returns when a manifest carries counts, with its test.
  warn "run manifest: $(basename "$manifest") records size and sha256 only, no row counts: nothing to compare"
}

log "Post-restore verification (namespace ${K8S_NAMESPACE}, read-only)"
check_audit
check_dlq
check_candles
check_spire_schema
check_trust_bundle
check_manifest

if [ "$FAILURES" -gt 0 ]; then
  log "${FAILURES} check(s) KO"
  exit 1
fi
log "all checks OK"
