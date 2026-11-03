#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Fetch a backup run from the off-site bucket
#  Usage:  bash scripts/fetch-offsite.sh --dest DIR [--timestamp TS]
#            [--components mongodb,mysql,checkpoints,spire] [--dry-run]
#          BACKUP_S3_BUCKET=s3://bucket/prefix AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
#          RCLONE_S3_ENDPOINT / RCLONE_S3_PROVIDER for a non-AWS store
#
#  After the loss of the cluster (and of the backup-data volume), the bucket
#  written by upload_offsite (backup-lib.sh) holds the only copy. This script
#  copies ONE run (all its files share the timestamp TS) into DIR, in the
#  layout restore-k8s.sh reads:
#    mongodb/<TS>/<replica set>.archive.gz.age   (mongodb, mongodb-audit)
#    mysql/financial_scraper_<TS>.sql.gz.age
#    checkpoints/checkpoints_<TS>.tar.gz.age
#    spire/keys_<TS>.json.age
#    manifests/manifest_<TS>.json.age            (run manifest, backup-lib.sh)
#  then: BACKUP_DIR=DIR bash scripts/restore-k8s.sh --timestamp TS
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
COMPONENTS="mongodb,mysql,checkpoints,spire"

usage() {
  sed -n 4,7p "$0" | sed 's/^#  //'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) DEST="${2:-}"; shift 2 ;;
    --timestamp) TIMESTAMP="${2:-}"; shift 2 ;;
    --components) COMPONENTS="${2:-}"; shift 2 ;;
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

# Relative paths (inside the bucket prefix) of component `$1` for run `$2`.
component_files() {
  local label
  case "$1" in
    mongodb) for label in $MONGO_LABELS; do echo "mongodb/$2/${label}.archive.gz.age"; done ;;
    mysql) echo "mysql/financial_scraper_$2.sql.gz.age" ;;
    checkpoints) echo "checkpoints/checkpoints_$2.tar.gz.age" ;;
    spire) echo "spire/keys_$2.json.age" ;;
  esac
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
PARTS=()
IFS=',' read -ra REQUESTED <<<"$COMPONENTS"
for part in "${REQUESTED[@]}"; do
  case "$part" in
    mongodb|mysql|checkpoints|spire) PARTS+=("$part") ;;
    redis) warn "Redis is not backed up: its content is rebuilt by the services" ;;
    *) fail "Unknown component: ${part}"; exit 1 ;;
  esac
done
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
RUNS="$(run_timestamps <<<"$LISTING" || true)"
if [ -z "$RUNS" ]; then
  fail "No backup run in ${BUCKET}"
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
echo "    bash scripts/restore-k8s.sh --timestamp ${SELECTED} --components $(IFS=,; echo "${PARTS[*]}")"
echo "══════════════════════════════════════════════════"
