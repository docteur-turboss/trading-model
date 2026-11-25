#!/usr/bin/env bash
# scripts/backup-config-check.sh (issue #331) with a stub kubectl: STUB_EXISTING
# lists the resources "present" in the cluster (configmap, secret, and
# secondary: the Secret holds BACKUP_S3_SECONDARY_BUCKET). SECOND is the
# BACKUP_S3_SECONDARY_BUCKET variable (default s2).
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
# kubectl -n NS get <kind> <name> [-o jsonpath=...]: $4 is the kind
case " ${STUB_EXISTING:-} " in *" secondary "*) [ -z "${6:-}" ] || echo s2 ;; esac
case " ${STUB_EXISTING:-} " in *" $4 "*) exit 0 ;; esac
exit 1
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH"

# case <label> <env> <recipients> <bucket> <existing> <expected exit> <expected output>
run() {
	local label="$1" env="$2" rec="$3" bucket="$4" existing="$5" want="$6" pattern="$7" out rc=0
	out=$(BACKUP_AGE_RECIPIENTS="$rec" BACKUP_S3_BUCKET="$bucket" BACKUP_S3_SECONDARY_BUCKET="${SECOND-s2}" STUB_EXISTING="$existing" \
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
SECOND="" run "production, no second bucket: error, exit 1" production "age1x" "b" "" 1 "::error::BACKUP_S3_SECONDARY_BUCKET"
SECOND="" run "production, second bucket in the kept Secret: ok" production "age1x" "" "secret secondary" 0 "✓"
SECOND="" run "production, BACKUP_S3_BUCKET set rewrites the Secret: error" production "age1x" "b" "secret secondary" 1 "::error::BACKUP_S3_SECONDARY_BUCKET"
SECOND="" BACKUP_S3_SECONDARY_CHECK=warn run "production, no second bucket, fallback warn: exit 0" production "age1x" "b" "" 0 "::warning::BACKUP_S3_SECONDARY_CHECK=warn"
SECOND="" run "staging, no second bucket: warning, exit 0" staging "age1x" "b" "" 0 "::warning::BACKUP_S3_SECONDARY_BUCKET"
exit "$FAILED"
