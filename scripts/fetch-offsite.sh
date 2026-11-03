#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Fetch a backup run from the off-site bucket
#  Usage:  bash scripts/fetch-offsite.sh --dest DIR [--timestamp TS] [--tier T] [--pitr] [--dry-run]
#            [--components mongodb,mongodb-audit,mysql,checkpoints,spire]
#          BACKUP_S3_BUCKET=s3://bucket/prefix AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
#          RCLONE_S3_ENDPOINT / RCLONE_S3_PROVIDER for a non-AWS store
#
#  After the loss of the cluster (and of the backup-data volume), the bucket
#  written by upload_offsite (backup-lib.sh) holds the only copy. This script
#  copies ONE run (all its files share the timestamp TS) into DIR, in the
#  layout restore-k8s.sh reads:
#    mongodb/<TS>/<replica set>.archive.gz.age   (mongodb, mongodb-audit)
#      component `mongodb`: both replica sets; `mongodb-audit`: the audit one
#    mysql/financial_scraper_<TS>.sql.gz.age
#    checkpoints/checkpoints_<TS>.tar.gz.age
#    spire/keys_<TS>.json.age
#    manifests/manifest_<TS>.json.age            (run manifest, backup-lib.sh)
#  then: BACKUP_DIR=DIR bash scripts/restore-k8s.sh --timestamp TS
#
#  Off-site tiers (BACKUP_OFFSITE_LAYOUT=tiered, ADR-0032): the bucket holds
#  `daily/`, `weekly/` and `monthly/`, each in the layout above. --tier picks
#  one (default: daily when the bucket is tiered, else the bucket root, also
#  reachable with --tier flat). weekly/ and monthly/ only hold the audit
#  trail, the MySQL dump and the manifests: fetch them with
#  --components mongodb-audit,mysql (mongodb-audit alone: the audit replica
#  set only, without the operational one, which is never promoted).
#
#  --pitr (point-in-time recovery, ADR-0031): the run must also hold its
#  starting points (`mongodb/<TS>/<replica set>.pitr.age`,
#  `mysql/financial_scraper_<TS>.pitr.age`), and the binlog / oplog archives
#  that can follow it are fetched too (`mysql/binlog/<server>/` archived at or
#  after TS, `mongodb/oplog/<replica set>/` ending at or after TS), then:
#  BACKUP_DIR=DIR bash scripts/restore-k8s.sh --until <instant>
#  Only the daily tier holds starting points and archives (ADR-0032).
#
#  Run selection: --timestamp TS, or else the newest run holding every file of
#  the requested components and its run manifest. upload_offsite only copies
#  the dumps that succeeded (write_dump renames a dump only once it is whole),
#  so a run missing a file had a failed dump: it is skipped (and refused with
#  --timestamp). The manifest is fetched with the run: restore-k8s.sh checks
#  every file against it (size, sha256). It is encrypted, so it is not read
#  here. A run taken before manifests is only fetched with --timestamp (and
#  restored without checksum). Only `*.age` files are fetched: nothing is
#  decrypted, no plaintext is written. DIR must hold no file, so that runs are
#  never mixed. Exits 1 when the bucket is unreachable or empty, or when no
#  run is complete for the requested components.
# =============================================================================

set -euo pipefail

DEST=""
TIMESTAMP=""
DRY_RUN=false
PITR=false
COMPONENTS="mongodb,mysql,checkpoints,spire"
TIER=""

usage() {
  sed -n 4,7p "$0" | sed 's/^#  //'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST="${2:-}"; shift 2 ;;
    --timestamp) TIMESTAMP="${2:-}"; shift 2 ;;
    --components) COMPONENTS="${2:-}"; shift 2 ;;
    --tier) TIER="${2:-}"; shift 2 ;;
    --pitr) PITR=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { log "✓ $*"; }
fail() { log "✗ $*"; }
warn() { log "⚠ $*"; }

# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

# Replica sets dumped by backup-k8s.sh, one archive each.
MONGO_LABELS="mongodb mongodb-audit"
TS_PATTERN='[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}'

# Replica sets of component `$1`: `mongodb` is both, `mongodb-audit` the
# audit trail alone (the only one in the weekly and monthly tiers, ADR-0032).
mongo_labels() {
  if [ "$1" = mongodb-audit ]; then echo mongodb-audit; else echo "$MONGO_LABELS"; fi
}

# Relative paths (inside the bucket prefix) of component `$1` for run `$2`,
# with its PITR starting points when --pitr.
component_files() {
  local label
  case "$1" in
    mongodb|mongodb-audit)
      for label in $(mongo_labels "$1"); do
        echo "mongodb/$2/${label}.archive.gz.age"
        ! $PITR || echo "mongodb/$2/${label}.pitr.age"
      done
      ;;
    mysql)
      echo "mysql/financial_scraper_$2.sql.gz.age"
      ! $PITR || echo "mysql/financial_scraper_$2.pitr.age"
      ;;
    checkpoints) echo "checkpoints/checkpoints_$2.tar.gz.age" ;;
    spire) echo "spire/keys_$2.json.age" ;;
  esac
}

# Binlog / oplog archives of LISTING that can follow run `$1` (--pitr):
# binlogs archived at or after the run (the dump's binlog was still open
# when it started), oplog archives ending at or after it (the starting point
# is read once the run has started). restore-k8s.sh --until picks the chain.
pitr_archives() {
  local part file stamp end since
  since="$(stamp_epoch "$1")"
  for part in "${PARTS[@]}"; do
    case "$part" in
      mysql)
        grep -E "^mysql/binlog/[^/]+/[^/]+_${TS_PATTERN}\.gz\.age$" <<<"$LISTING" | while read -r file; do
          stamp="$(grep -oE "${TS_PATTERN}\.gz\.age$" <<<"$file")"
          [[ "${stamp%.gz.age}" < "$1" ]] || echo "$file"
        done
        ;;
      mongodb|mongodb-audit)
        local labels
        labels="$(mongo_labels "$part" | tr ' ' '|')"
        grep -E "^mongodb/oplog/(${labels})/[0-9]+\.[0-9]+_[0-9]+\.[0-9]+\.bson\.gz\.age$" <<<"$LISTING" | while read -r file; do
          end="${file##*_}"
          end="${end%%.*}"
          [ "$end" -lt "$since" ] || echo "$file"
        done
        ;;
    esac
  done
}

# Run manifest of run `$1` (backup-lib.sh, write_manifest).
manifest_file() {
  echo "manifests/manifest_$1.json.age"
}

# Timestamps of the runs present in the listing on stdin, oldest first.
run_timestamps() {
  grep -oE "^(mongodb/${TS_PATTERN}/|mysql/financial_scraper_${TS_PATTERN}|checkpoints/checkpoints_${TS_PATTERN}|spire/keys_${TS_PATTERN}|manifests/manifest_${TS_PATTERN})" |
    grep -oE "$TS_PATTERN" | sort -u
}

# Files of run `$1` missing from LISTING for the requested components, run
# manifest included.
missing_files() {
  local part file
  for part in "${PARTS[@]}"; do
    while read -r file; do
      grep -qxF "$file" <<<"$LISTING" || echo "$file"
    done < <(component_files "$part" "$1")
  done
  file="$(manifest_file "$1")"
  grep -qxF "$file" <<<"$LISTING" || echo "$file"
}

# Dumps of run `$1` missing from LISTING (manifest left out).
missing_dumps() {
  missing_files "$1" | grep -vxF "$(manifest_file "$1")" || true
}

if [ -z "$DEST" ] && ! $DRY_RUN; then
  fail "--dest is required: the directory to fetch the run into"
  exit 1
fi
if [ -n "$TIMESTAMP" ] && ! [[ "$TIMESTAMP" =~ ^${TS_PATTERN}$ ]]; then
  fail "--timestamp ${TIMESTAMP} is not a backup timestamp (YYYY-MM-DD_HHMMSS)"
  exit 1
fi
case "$TIER" in
  ""|flat|daily|weekly|monthly) ;;
  *) fail "--tier must be daily, weekly, monthly or flat, not '${TIER}'"; exit 1 ;;
esac
PARTS=()
IFS=',' read -ra REQUESTED <<<"$COMPONENTS"
for part in "${REQUESTED[@]}"; do
  case "$part" in
    mongodb|mongodb-audit|mysql|checkpoints|spire) PARTS+=("$part") ;;
    redis) warn "Redis is not backed up: its content is rebuilt by the services" ;;
    *) fail "Unknown component: ${part}"; exit 1 ;;
  esac
done
# mongodb already holds the audit replica set.
if [[ " ${PARTS[*]} " == *" mongodb "* ]]; then
  KEPT=()
  for part in "${PARTS[@]}"; do [ "$part" = mongodb-audit ] || KEPT+=("$part"); done
  PARTS=("${KEPT[@]}")
fi
if [ "${#PARTS[@]}" -eq 0 ]; then
  fail "No component to fetch"
  exit 1
fi

BUCKET="${BACKUP_S3_BUCKET:-}"
if [ -z "$BUCKET" ]; then
  fail "BACKUP_S3_BUCKET is not set: the off-site bucket to fetch from (s3://bucket/prefix)"
  exit 1
fi
if ! command -v rclone >/dev/null; then
  fail "rclone is not installed"
  exit 1
fi
# Same remote and credentials as upload_offsite (backup-lib.sh).
REMOTE="$(offsite_remote "$BUCKET")"
export RCLONE_S3_ENV_AUTH=true

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Fetch Off-site Backup"
echo "  Bucket: ${BUCKET}"
echo "  Timestamp: ${TIMESTAMP:-latest complete run}"
echo "  Components: ${PARTS[*]}"
echo "  Destination: ${DEST:-(dry run)}"
echo "══════════════════════════════════════════════════"
echo ""

if [ -n "$DEST" ] && [ -d "$DEST" ] && [ -n "$(find "$DEST" -type f -print -quit)" ]; then
  fail "${DEST} already holds files: fetch into an empty directory so that runs are never mixed"
  exit 1
fi

log "Listing ${BUCKET}..."
LISTING=""
if ! LISTING="$(rclone lsf -R --files-only "$REMOTE")"; then
  fail "Cannot list ${BUCKET}: unreachable, wrong credentials (AWS_*) or RCLONE_S3_ENDPOINT, or no such bucket or prefix"
  exit 1
fi
# Only encrypted files ever leave the cluster (upload_offsite).
LISTING="$(grep -E '\.age$' <<<"$LISTING" || true)"
# Tiered bucket (upload_offsite, BACKUP_OFFSITE_LAYOUT=tiered): one tier only.
if [ -z "$TIER" ]; then
  TIER=flat
  grep -q '^daily/' <<<"$LISTING" && TIER=daily
fi
if [ "$TIER" != flat ]; then
  log "Tier ${TIER}/"
  LISTING="$(sed -n "s|^${TIER}/||p" <<<"$LISTING")"
  REMOTE="$(offsite_remote "${BUCKET%/}/${TIER}")"
fi
RUNS="$(run_timestamps <<<"$LISTING" || true)"
if [ -z "$RUNS" ]; then
  if [ "$TIER" = flat ]; then
    fail "No backup run in ${BUCKET}"
  else
    fail "No backup run in ${BUCKET%/}/${TIER}"
  fi
  exit 1
fi

SELECTED=""
while read -r ts; do
  missing="$(missing_files "$ts")"
  if [ -z "$missing" ]; then
    log "  run ${ts}: complete"
  else
    log "  run ${ts}: incomplete, missing $(tr '\n' ' ' <<<"$missing")"
  fi
  if [ -n "$TIMESTAMP" ]; then
    # Explicit run: one taken before manifests is still accepted.
    [ "$ts" = "$TIMESTAMP" ] && [ -z "$(missing_dumps "$ts")" ] && SELECTED="$ts"
  elif [ -z "$missing" ]; then
    # Oldest first: the last complete run wins.
    SELECTED="$ts"
  fi
done <<<"$RUNS"

if [ -n "$TIMESTAMP" ] && [ -z "$SELECTED" ]; then
  if grep -qxF "$TIMESTAMP" <<<"$RUNS"; then
    fail "Run ${TIMESTAMP} is incomplete for ${PARTS[*]}: missing $(missing_dumps "$TIMESTAMP" | tr '\n' ' ')"
  else
    fail "No run ${TIMESTAMP} in ${BUCKET}"
  fi
  exit 1
fi
if [ -z "$SELECTED" ]; then
  fail "No complete run (every dump and its run manifest) in ${BUCKET} for ${PARTS[*]}; a run taken before manifests is fetched with --timestamp"
  case "$TIER" in
    weekly|monthly) warn "The ${TIER} tier only holds the audit trail and the MySQL dump (no PITR starting point): try --components mongodb-audit,mysql without --pitr" ;;
  esac
  exit 1
fi

FILES=()
for part in "${PARTS[@]}"; do
  while read -r file; do FILES+=("$file"); done < <(component_files "$part" "$SELECTED")
done
if grep -qxF "$(manifest_file "$SELECTED")" <<<"$LISTING"; then
  FILES+=("$(manifest_file "$SELECTED")")
else
  warn "Run ${SELECTED} has no run manifest (taken before manifests): restore-k8s.sh restores it without checksum"
fi
ok "Selected run ${SELECTED} (${#FILES[@]} file(s))"
if $PITR; then
  ARCHIVES=0
  while read -r file; do
    [ -n "$file" ] || continue
    FILES+=("$file")
    ARCHIVES=$((ARCHIVES + 1))
  done < <(pitr_archives "$SELECTED")
  if [ "$ARCHIVES" -eq 0 ]; then
    warn "No binlog or oplog archive after run ${SELECTED}: restore-k8s.sh --until can only reach the dump itself"
  else
    ok "${ARCHIVES} binlog / oplog archive(s) after run ${SELECTED}"
  fi
fi

if $DRY_RUN; then
  for file in "${FILES[@]}"; do warn "[DRY-RUN] Would fetch ${file}"; done
  exit 0
fi

mkdir -p "$DEST"
LIST="$(mktemp)"
trap 'rm -f "$LIST"' EXIT
printf '%s\n' "${FILES[@]}" >"$LIST"
started=$SECONDS
log "Fetching ${#FILES[@]} file(s) into ${DEST}..."
if ! rclone copy --s3-no-check-bucket --files-from "$LIST" "$REMOTE" "$DEST"; then
  fail "Fetch from ${BUCKET} failed"
  exit 1
fi
for file in "${FILES[@]}"; do
  if [ ! -s "${DEST}/${file}" ]; then
    fail "${file} is missing or empty after the fetch"
    exit 1
  fi
done

echo ""
ok "Run ${SELECTED} fetched in $((SECONDS - started)) s ($(du -sh "$DEST" | cut -f1))"
echo "══════════════════════════════════════════════════"
echo "  Restore it (MySQL before SPIRE, writers stopped):"
echo "  BACKUP_DIR=${DEST} BACKUP_AGE_IDENTITY=<key file> \\"
if $PITR; then
  echo "    bash scripts/restore-k8s.sh --until <instant, UTC> --components $(IFS=,; echo "${PARTS[*]}")"
else
  echo "    bash scripts/restore-k8s.sh --timestamp ${SELECTED} --components $(IFS=,; echo "${PARTS[*]}")"
fi
echo "══════════════════════════════════════════════════"
