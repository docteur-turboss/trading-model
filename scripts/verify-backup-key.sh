#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Prove that an age private key decrypts the real backups
#  Usage:  bash scripts/verify-backup-key.sh --identity KEY_FILE [--dir DIR | --offsite]
#            [--timestamp TS] [--tier T] [--components mongodb,mongodb-audit,mysql,checkpoints,spire]
#          --offsite: BACKUP_S3_BUCKET + AWS_* (+ RCLONE_S3_*), as scripts/fetch-offsite.sh
#
#  An age file does not name the keys it is encrypted for: only decrypting it
#  proves that a key still opens the backups (issue #327). The escrow key is
#  checked weekly by .github/workflows/backup-key-check.yml (ADR-0034), the
#  operator key by hand on the schedule of
#  docs/deployment/ENCRYPTION_AT_REST.md ("Key custody"); keep its output.
#
#  Source of the run:
#    --offsite (default)  fetches one run from the off-site bucket with
#                         scripts/fetch-offsite.sh (newest complete run, or
#                         --timestamp / --tier) into a temporary directory,
#                         removed on exit. Only `*.age` files are fetched
#    --dir DIR            a run already on disk, in the layout of BACKUP_DIR
#                         (newest run manifest of DIR, or --timestamp)
#  For that run, it decrypts the run manifest, then every requested component
#  listed in it, whole, into sha256sum: no plaintext ever reaches the disk.
#  A component passes when it decrypts with KEY_FILE and its size and
#  plaintext sha256 match the manifest. Exit 1 when a single component is
#  missing from the run or fails; 0 only when all of them pass. The report
#  names the run (timestamp and UTC date), the key's public key and each
#  component's result.
#
#  KEY_FILE is a file path, never the key itself: a key given as an argument
#  would show in `ps`. Keep it on a tmpfs or an encrypted volume, mode 600
#  (the script warns when group or others can read it), and delete it after
#  the check. Needs age (and rclone for --offsite).
# =============================================================================

set -euo pipefail

IDENTITY=""
DIR=""
OFFSITE=false
TIMESTAMP=""
TIER=""
COMPONENTS="mongodb,mongodb-audit,mysql,checkpoints,spire"

usage() {
	sed -n 4,6p "$0" | sed 's/^#  //'
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--identity) IDENTITY="${2:-}"; shift 2 ;;
	--dir) DIR="${2:-}"; shift 2 ;;
	--offsite) OFFSITE=true; shift ;;
	--timestamp) TIMESTAMP="${2:-}"; shift 2 ;;
	--tier) TIER="${2:-}"; shift 2 ;;
	--components) COMPONENTS="${2:-}"; shift 2 ;;
	-h | --help) usage; exit 0 ;;
	*) echo "Unknown option: $1"; usage; exit 1 ;;
	esac
done

log() { echo "[$(date +%H:%M:%S)] $*"; }
ok() { log "✓ $*"; }
fail() { log "✗ $*"; }
warn() { log "⚠ $*"; }

# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

if [ -z "$IDENTITY" ]; then
	fail "--identity is required: the age private key file to verify"
	exit 1
fi
if [ ! -f "$IDENTITY" ] || [ ! -r "$IDENTITY" ]; then
	fail "--identity ${IDENTITY} is not a readable file"
	exit 1
fi
if [ -n "$DIR" ] && $OFFSITE; then
	fail "--dir and --offsite are exclusive"
	exit 1
fi
[ -n "$DIR" ] || OFFSITE=true
if ! command -v age >/dev/null || ! command -v age-keygen >/dev/null; then
	fail "age is not installed"
	exit 1
fi
if [ -n "$TIMESTAMP" ] && ! [[ "$TIMESTAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$ ]]; then
	fail "--timestamp ${TIMESTAMP} is not a backup timestamp (YYYY-MM-DD_HHMMSS)"
	exit 1
fi
PARTS=()
IFS=',' read -ra REQUESTED <<<"$COMPONENTS"
for part in "${REQUESTED[@]}"; do
	case "$part" in
	mongodb | mongodb-audit | mysql | checkpoints | spire) PARTS+=("$part") ;;
	*) fail "Unknown component: ${part}"; exit 1 ;;
	esac
done
if [ "${#PARTS[@]}" -eq 0 ]; then
	fail "No component to verify"
	exit 1
fi

# Group or others able to read the private key: the check still runs.
mode="$(stat -c %a "$IDENTITY" 2>/dev/null || true)"
if [[ "$mode" =~ ^[0-7]+$ ]] && [ "${mode: -2}" != 00 ]; then
	warn "${IDENTITY} is readable by group or others (mode ${mode}): chmod 600 it"
fi
if ! PUBLIC_KEY="$(age-keygen -y "$IDENTITY" 2>/dev/null)"; then
	fail "${IDENTITY} is not an age identity file (age-keygen -y cannot read it)"
	exit 1
fi
export BACKUP_AGE_IDENTITY="$IDENTITY"

if $OFFSITE; then
	DIR="$(mktemp -d)"
	trap 'rm -rf "$DIR"' EXIT
	# fetch-offsite.sh component `mongodb` already holds `mongodb-audit`.
	fetch_args=(--dest "$DIR" --components "$(IFS=,; echo "${PARTS[*]}")")
	[ -z "$TIMESTAMP" ] || fetch_args+=(--timestamp "$TIMESTAMP")
	[ -z "$TIER" ] || fetch_args+=(--tier "$TIER")
	if ! bash "$(dirname "$0")/fetch-offsite.sh" "${fetch_args[@]}"; then
		fail "Cannot fetch a run from the off-site bucket: nothing verified"
		exit 1
	fi
fi
if [ ! -d "$DIR" ]; then
	fail "${DIR} is not a directory"
	exit 1
fi
BACKUP_DIR="$DIR"

# The run: --timestamp, or else the newest run manifest of DIR.
if [ -n "$TIMESTAMP" ]; then
	MANIFEST="$(manifest_of "$TIMESTAMP")"
else
	MANIFEST="$(manifests_newest_first | head -1)"
fi
if [ -z "$MANIFEST" ]; then
	fail "No run manifest${TIMESTAMP:+ for run ${TIMESTAMP}} in ${DIR}/manifests: nothing to verify"
	exit 1
fi
RUN="${MANIFEST##*/manifest_}"
RUN="${RUN%%.json*}"
RUN_DATE="$(date -u -d "@$(stamp_epoch "$RUN")" '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || echo "$RUN")"

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Backup Key Verification"
echo "  Key: ${PUBLIC_KEY}"
echo "  Run: ${RUN} (${RUN_DATE})"
echo "  Components: ${PARTS[*]}"
echo "══════════════════════════════════════════════════"
echo ""

FAILURES=0
RESULTS=()

# The manifest is sealed for the same recipients as the dumps: a key that
# cannot open it cannot open them either.
case "$MANIFEST" in
*.age) ;;
*)
	fail "Run ${RUN} is not encrypted (${MANIFEST}): there is no key to verify"
	exit 1
	;;
esac
if ! open_backup "$MANIFEST" </dev/null >/dev/null 2>&1; then
	fail "The run manifest $(basename "$MANIFEST") does not decrypt with ${PUBLIC_KEY}"
	exit 1
fi
ok "Run manifest decrypted"

for part in "${PARTS[@]}"; do
	if ! read_manifest_entry "$part" "$MANIFEST"; then
		RESULTS+=("FAIL ${part}: run manifest unreadable")
		FAILURES=$((FAILURES + 1))
		continue
	fi
	if [ -z "$MANIFEST_ENTRY" ]; then
		fail "${part}: absent from run ${RUN} (its dump failed)"
		RESULTS+=("FAIL ${part}: absent from the run manifest")
		FAILURES=$((FAILURES + 1))
		continue
	fi
	read -r path size sha <<<"$MANIFEST_ENTRY"
	file="${DIR}/${path}"
	if [ ! -f "$file" ]; then
		fail "${part}: ${path} is missing"
		RESULTS+=("FAIL ${part}: ${path} missing")
		FAILURES=$((FAILURES + 1))
		continue
	fi
	case "$file" in
	*.age) ;;
	*)
		fail "${part}: ${path} is not encrypted"
		RESULTS+=("FAIL ${part}: ${path} not encrypted")
		FAILURES=$((FAILURES + 1))
		continue
		;;
	esac
	# Whole file into sha256sum (pipefail: age's own status counts).
	if ! actual="$(age -d -i "$IDENTITY" "$file" | sha256sum | cut -d' ' -f1)"; then
		fail "${part}: ${path} does not decrypt with ${PUBLIC_KEY}"
		RESULTS+=("FAIL ${part}: ${path} does not decrypt with this key")
		FAILURES=$((FAILURES + 1))
		continue
	fi
	actual_size="$(file_size "$file")"
	if [ "$actual_size" != "$size" ] || [ "$actual" != "$sha" ]; then
		fail "${part}: ${path} decrypts but differs from the run manifest (${actual_size} bytes, sha256 ${actual})"
		RESULTS+=("FAIL ${part}: ${path} differs from the run manifest")
		FAILURES=$((FAILURES + 1))
		continue
	fi
	ok "${part}: ${path} decrypted, sha256 verified"
	RESULTS+=("OK   ${part}: ${path} (${size} bytes)")
done

echo ""
echo "══════════════════════════════════════════════════"
echo "  Verified at: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "  Key: ${PUBLIC_KEY}"
echo "  Run: ${RUN} (${RUN_DATE})"
for result in "${RESULTS[@]}"; do echo "  ${result}"; done
if [ "$FAILURES" -eq 0 ]; then
	echo "  Result: PASS (${#PARTS[@]} component(s) decrypted)"
else
	echo "  Result: FAIL (${FAILURES} of ${#PARTS[@]} component(s))"
fi
echo "══════════════════════════════════════════════════"
[ "$FAILURES" -eq 0 ]
