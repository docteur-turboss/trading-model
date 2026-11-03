#!/usr/bin/env bash
# scripts/backup-config-check.sh (issue #331) with a stub kubectl: STUB_EXISTING
# lists the resources "present" in the cluster (configmap, secret).
#   bash tests/backup/backup-config-check.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECK="$ROOT/scripts/backup-config-check.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
# kubectl -n NS get <kind> <name>: $4 is the kind
case " ${STUB_EXISTING:-} " in *" $4 "*) exit 0 ;; esac
exit 1
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH"

# case <label> <env> <recipients> <bucket> <existing> <expected exit> <expected output>
run() {
	local label="$1" env="$2" rec="$3" bucket="$4" existing="$5" want="$6" pattern="$7" out rc=0
	out=$(BACKUP_AGE_RECIPIENTS="$rec" BACKUP_S3_BUCKET="$bucket" STUB_EXISTING="$existing" \
		bash "$CHECK" --environment "$env" --namespace ns 2>&1) || rc=$?
	if [ "$rc" = "$want" ] && grep -q -- "$pattern" <<<"$out"; then
		echo "  ✓ $label"
	else
		echo "  ✗ $label (exit $rc, want $want): $out"
		FAILED=1
	fi
}

echo "backup-config-check.sh"
run "production, nothing anywhere: errors, exit 1" production "" "" "" 1 "::error::BACKUP_AGE_RECIPIENTS"
run "production, nothing: off-site error too" production "" "" "" 1 "::error::BACKUP_S3_BUCKET"
run "production, no bucket nor Secret only" production "age1x" "" "configmap" 1 "::error::BACKUP_S3_BUCKET"
run "production, existing ConfigMap and Secret: ok" production "" "" "configmap secret" 0 "✓"
run "production, variables set: ok" production "age1x" "b" "" 0 "✓"
run "staging, nothing: warnings, exit 0" staging "" "" "" 0 "::warning::BACKUP_S3_BUCKET"
run "staging, no key: warning" staging "" "b" "" 0 "::warning::BACKUP_AGE_RECIPIENTS"
exit "$FAILED"
