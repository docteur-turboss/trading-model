#!/usr/bin/env bash
# Backup and restore of the SealedSecrets controller keys (issue #328):
# scripts/backup-sealed-secrets-key.sh and scripts/restore-sealed-secrets-key.sh
# against stub `kubectl` and `rclone` commands (the real loop, with a real
# controller on kind, is tests/k8s/sealed-secrets-key-drill.sh). Checks: the
# keys reach the bucket encrypted for every recipient, no plaintext is ever
# written, exit 1 and nothing in the bucket when no key is found, the export,
# age or the copy fails; the restore picks the newest backup (or
# --timestamp), refuses a wrong key before applying anything, restarts the
# controller, and fails when the keys are not found afterwards.
# Needs bash and age.
#   bash tests/backup/sealed-secrets-key.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP="$ROOT/scripts/backup-sealed-secrets-key.sh"
RESTORE="$ROOT/scripts/restore-sealed-secrets-key.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0

pass() { echo "  ✓ $*"; }
failed() {
	echo "  ✗ $*"
	FAILED=1
}

for k in operator escrow foreign; do
	age-keygen -o "$WORK/$k.txt" 2>/dev/null
	chmod 600 "$WORK/$k.txt"
done
pub() { sed -n 's/^# public key: //p' "$WORK/$1.txt"; }
OPERATOR="$(pub operator)" ESCROW="$(pub escrow)"

# Plaintext marker of the fake private keys: must never be found on disk
# outside the stub cluster.
MARKER="UExBSU5URVhULVBSSVZBVEUtS0VZ"
mkdir -p "$WORK/bin" "$WORK/tmp"

# --- stub kubectl --------------------------------------------------------------
# STUB_KEYS: number of key Secrets the cluster holds; STUB_EXPORT_FAIL=1: the
# export (go-template) fails; STUB_CONTROLLER=1: the controller Deployment
# exists; STUB_LOST=1: the keys vanish after apply. Calls are logged in
# $STUB_STATE/calls, applied manifests in $STUB_STATE/applied.yaml (the stub
# cluster: plaintext there is expected).
cat >"$WORK/bin/kubectl" <<'EOF'
#!/usr/bin/env bash
echo "kubectl $*" >>"$STUB_STATE/calls"
args=" $* "
case "$args" in
*" get secret "*"-o name"*)
	if [ -f "$STUB_STATE/applied.yaml" ] && [ "${STUB_LOST:-0}" != 1 ]; then
		sed -n 's/^    name: /secret\//p' "$STUB_STATE/applied.yaml"
	elif [ ! -f "$STUB_STATE/applied.yaml" ]; then
		for i in $(seq 1 "${STUB_KEYS:-0}"); do echo "secret/sealed-secrets-key$i"; done
	fi
	;;
*" get secret "*"-o go-template="*)
	[ "${STUB_EXPORT_FAIL:-0}" = 1 ] && { echo "error: export" >&2; exit 1; }
	printf 'apiVersion: v1\nkind: List\nitems:\n'
	for i in $(seq 1 "${STUB_KEYS:-0}"); do
		printf -- '- apiVersion: v1\n  kind: Secret\n  type: kubernetes.io/tls\n  metadata:\n    name: sealed-secrets-key%s\n    labels:\n      sealedsecrets.bitnami.com/sealed-secrets-key: "active"\n  data:\n    tls.key: %s%s\n' "$i" "$MARKER" "$i"
	done
	;;
*" get namespace "*) exit 0 ;;
*" apply -f - "*) cat >"$STUB_STATE/applied.yaml" ;;
*" get deployment "*) [ "${STUB_CONTROLLER:-0}" = 1 ] ;;
*" rollout "*) exit 0 ;;
*) echo "stub kubectl: unexpected $*" >&2; exit 1 ;;
esac
EOF
# --- stub rclone: `:s3:<path>` is $STUB_S3/<path> --------------------------------
cat >"$WORK/bin/rclone" <<'EOF'
#!/usr/bin/env bash
[ "${STUB_RCLONE_FAIL:-0}" = 1 ] && { echo "stub rclone: unreachable" >&2; exit 1; }
path() { echo "$STUB_S3/${1#:s3:}"; }
case "$1" in
copy)
	shift
	while [ "$1" != "--files-from" ]; do shift; done
	list="$2" src="$3" dest="$(path "$4")"
	while read -r f; do mkdir -p "$(dirname "$dest/$f")"; cp "$src/$f" "$dest/$f"; done <"$list"
	;;
lsf) d="$(path "${!#}")"; [ -d "$d" ] && ls "$d" ;;
copyto) cp "$(path "$2")" "$3" ;;
*) echo "stub rclone: unexpected $*" >&2; exit 1 ;;
esac
EOF
chmod +x "$WORK/bin/kubectl" "$WORK/bin/rclone"

export PATH="$WORK/bin:$PATH" TMPDIR="$WORK/tmp" MARKER
export BACKUP_S3_BUCKET="s3://bucket/prefix"
export STUB_S3="$WORK/s3"
BUCKET_DIR="$STUB_S3/bucket/prefix/sealed-secrets-key"

# fresh: new stub cluster and empty bucket.
fresh() {
	rm -rf "$STUB_S3" "$WORK/state"
	mkdir -p "$WORK/state"
	export STUB_STATE="$WORK/state"
}
# no_plaintext <name>: the marker is nowhere on disk but in the stub cluster.
no_plaintext() {
	if grep -rqF "$MARKER" "$STUB_S3" "$WORK/tmp" "$WORK/dest" 2>/dev/null; then
		failed "$1: plaintext key written to disk"
	else
		pass "$1: no plaintext on disk"
	fi
}
backup() {
	BACKUP_AGE_RECIPIENTS="${RECIPIENTS-$OPERATOR $ESCROW}" bash "$BACKUP" "$@" >"$WORK/out.log" 2>&1
}
backups() { find "$STUB_S3" -name '*.yaml.age' 2>/dev/null | wc -l | tr -d ' '; }

echo "backup-sealed-secrets-key.sh"
fresh
if STUB_KEYS=3 backup --dest "$WORK/dest"; then
	pass "3 keys: exit 0"
else
	failed "3 keys: exit 1"; cat "$WORK/out.log"
fi
FILE="$(find "$BUCKET_DIR" -name 'sealed-secrets-key_*.yaml.age' 2>/dev/null | head -1)"
if [[ "$(basename "${FILE:-none}")" =~ ^sealed-secrets-key_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.yaml\.age$ ]]; then
	pass "copied to <bucket>/sealed-secrets-key/sealed-secrets-key_<TIMESTAMP>.yaml.age"
else
	failed "no sealed-secrets-key_<TIMESTAMP>.yaml.age in the bucket"
fi
for k in operator escrow; do
	if [ -n "$FILE" ] && [ "$(age -d -i "$WORK/$k.txt" "$FILE" | grep -c "tls.key: ${MARKER}")" -eq 3 ]; then
		pass "the ${k} key decrypts all 3 keys"
	else
		failed "the ${k} key does not decrypt the 3 keys"
	fi
done
[ -n "$FILE" ] && cmp -s "$FILE" "$WORK/dest/$(basename "$FILE")" && pass "--dest keeps the same encrypted file" || failed "--dest copy missing"
no_plaintext "successful backup"
[ -z "$(ls -A "$WORK/tmp")" ] && pass "temporary directory removed" || failed "temporary files left in TMPDIR"
grep -q -- "-n kube-system get secret" "$STUB_STATE/calls" && pass "reads the default controller namespace kube-system" || failed "kube-system not read"
fresh
SEALED_SECRETS_NAMESPACE=sealed-secrets STUB_KEYS=1 backup >/dev/null 2>&1 || true
grep -q -- "-n sealed-secrets get secret" "$STUB_STATE/calls" && pass "SEALED_SECRETS_NAMESPACE picks the namespace" || failed "SEALED_SECRETS_NAMESPACE ignored"

# refused <name> <env...>: the backup exits 1 and leaves no file in the bucket.
refused() {
	local name="$1"
	shift
	fresh
	rm -rf "$WORK/dest"
	if env "$@" bash -c 'BACKUP_AGE_RECIPIENTS="${RECIPIENTS-$0}" bash "$1" --dest "$2"' "$OPERATOR $ESCROW" "$BACKUP" "$WORK/dest" >"$WORK/out.log" 2>&1; then
		failed "${name}: exit 0"
	elif [ "$(backups)" -ne 0 ] || [ -n "$(find "$WORK/dest" -type f 2>/dev/null)" ]; then
		failed "${name}: a file was left"
	else
		pass "${name}: exit 1, nothing written"
	fi
	no_plaintext "$name" >/dev/null
}
refused "no key in the namespace" STUB_KEYS=0
refused "export fails" STUB_KEYS=2 STUB_EXPORT_FAIL=1
refused "no recipient" STUB_KEYS=2 RECIPIENTS=
refused "invalid recipient (age fails)" STUB_KEYS=2 RECIPIENTS=age1notakey
refused "fewer recipients than BACKUP_MIN_RECIPIENTS" STUB_KEYS=2 RECIPIENTS="$OPERATOR" BACKUP_MIN_RECIPIENTS=2
refused "no off-site bucket" STUB_KEYS=2 BACKUP_S3_BUCKET=
fresh
if STUB_KEYS=2 STUB_RCLONE_FAIL=1 backup; then
	failed "off-site copy fails: exit 0"
else
	pass "off-site copy fails: exit 1"
fi
no_plaintext "failed copy"

echo "restore-sealed-secrets-key.sh"
# Two backups: an old one with 1 key, the newest with 2.
fresh
STUB_KEYS=1 backup
OLD="$(basename "$(find "$BUCKET_DIR" -name '*.yaml.age')")"
mv "$BUCKET_DIR/$OLD" "$BUCKET_DIR/sealed-secrets-key_2026-01-01_000000.yaml.age"
STUB_KEYS=2 backup
SAVED_S3="$WORK/s3-saved"
rm -rf "$SAVED_S3"
cp -r "$STUB_S3" "$SAVED_S3"

# restore <args...>: on a new stub cluster with the two backups.
restore() {
	rm -rf "$WORK/state" "$STUB_S3"
	mkdir -p "$WORK/state"
	cp -r "$SAVED_S3" "$STUB_S3"
	bash "$RESTORE" "$@" >"$WORK/out.log" 2>&1
}
applied_keys() { grep -c '^  kind: Secret$' "$STUB_STATE/applied.yaml" 2>/dev/null || echo 0; }

if restore --identity "$WORK/escrow.txt" && [ "$(applied_keys)" -eq 2 ]; then
	pass "newest backup restored (2 keys) with the escrow key"
else
	failed "newest backup not restored"; cat "$WORK/out.log"
fi
no_plaintext "restore" >/dev/null
[ -z "$(ls -A "$WORK/tmp")" ] && pass "restore leaves no temporary file" || failed "restore left temporary files"
grep -q "rollout restart" "$STUB_STATE/calls" && failed "restarted a controller that does not exist" || pass "no controller yet: not restarted"
if restore --identity "$WORK/operator.txt" --timestamp 2026-01-01_000000 && [ "$(applied_keys)" -eq 1 ]; then
	pass "--timestamp restores that backup"
else
	failed "--timestamp ignored"
fi
if STUB_CONTROLLER=1 restore --identity "$WORK/operator.txt" && grep -q "rollout restart deployment sealed-secrets-controller" "$STUB_STATE/calls"; then
	pass "running controller restarted"
else
	failed "running controller not restarted"
fi
if restore --identity "$WORK/foreign.txt" || [ -f "$STUB_STATE/applied.yaml" ]; then
	failed "a key that does not decrypt the backup: accepted or applied"
else
	pass "a key that does not decrypt the backup: exit 1, nothing applied"
fi
if restore --identity "$WORK/operator.txt" --timestamp 2025-01-01_000000; then
	failed "absent --timestamp: exit 0"
else
	pass "absent --timestamp: exit 1"
fi
if STUB_LOST=1 restore --identity "$WORK/operator.txt"; then
	failed "keys missing after apply: exit 0"
else
	pass "keys missing after apply: exit 1"
fi
if BACKUP_S3_BUCKET=s3://bucket/empty restore --identity "$WORK/operator.txt"; then
	failed "empty bucket: exit 0"
else
	pass "empty bucket: exit 1"
fi
NEWEST="$(find "$SAVED_S3" -name '*.yaml.age' | sort | tail -1)"
if restore --identity "$WORK/operator.txt" --file "$NEWEST" && [ "$(applied_keys)" -eq 2 ]; then
	pass "--file restores a local encrypted export"
else
	failed "--file failed"
fi
if restore --identity "$WORK/operator.txt" --file "$NEWEST" --offsite; then
	failed "--file with --offsite: exit 0"
else
	pass "--file with --offsite: exit 1"
fi

if [ "$FAILED" -ne 0 ]; then
	echo "FAILED"
	exit 1
fi
echo "All SealedSecrets key backup tests passed"
