#!/usr/bin/env bash
# Disaster drill of the SealedSecrets controller keys (issue #328), on kind:
#   1. cluster A: Sealed Secrets controller v0.27.1, a test secret sealed with
#      kubeseal and applied, decrypted by the controller;
#   2. scripts/backup-sealed-secrets-key.sh: keys encrypted with age and copied
#      to an S3 bucket (`rclone serve s3` in the backup-tools image);
#   3. cluster A deleted, cluster B created: new cluster, new controller, its
#      own new key. The same SealedSecret is applied: it must NOT decrypt
#      (control: the drill would pass without the backup otherwise);
#   4. scripts/restore-sealed-secrets-key.sh fetches the keys from the bucket,
#      applies them and restarts the controller;
#   5. the SealedSecret decrypts to the original value.
# The backup and restore scripts run in the backup-tools image (kubectl, age,
# rclone, as the CronJobs) on the `kind` Docker network, with the internal
# kubeconfig of the cluster.
#
#   bash tests/k8s/sealed-secrets-key-drill.sh
#
# Environment: KIND (binary, default `kind`), KUBESEAL (default `kubeseal`,
# v0.27.1), KIND_CLUSTER (default sealed-secrets-drill), BACKUP_TOOLS_IMAGE
# (default backup-tools, built from deploy/backup when missing). Needs docker,
# kubectl, age, curl. The cluster, the S3 container and the work directory are
# always removed on exit (KEEP_CLUSTER=1 keeps the cluster).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
if command -v cygpath >/dev/null; then ROOT="$(cygpath -m "$ROOT")"; fi
KIND="${KIND:-kind}"
KUBESEAL="${KUBESEAL:-kubeseal}"
CLUSTER="${KIND_CLUSTER:-sealed-secrets-drill}"
IMAGE="${BACKUP_TOOLS_IMAGE:-backup-tools}"
S3="${CLUSTER}-s3"
K="kubectl --context kind-${CLUSTER}"
# docs/deployment/sealed-secrets.md installs this release.
CONTROLLER_URL="https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.27.1/controller.yaml"
CONTROLLER_SHA256="f0616f1c05e331855162f4a214ddd2b49cb52979a5837dd4bda2b8fcac8fb2da"
KEY_LABEL="sealedsecrets.bitnami.com/sealed-secrets-key"
WORK="$(mktemp -d)"
if command -v cygpath >/dev/null; then WORK="$(cygpath -m "$WORK")"; fi

log() { echo "[sealed-secrets-drill] $*"; }
die() {
	log "FAILED: $*"
	exit 1
}

cleanup() {
	docker rm -f "$S3" >/dev/null 2>&1 || true
	[ "${KEEP_CLUSTER:-0}" = 1 ] || "$KIND" delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
	rm -rf "$WORK"
}
trap cleanup EXIT

# Polls `$2` (a shell command) every 3s until it succeeds or `$1` seconds pass.
wait_for() {
	local timeout="$1" check="$2" waited=0
	until eval "$check" >/dev/null 2>&1; do
		[ "$waited" -lt "$timeout" ] || return 1
		sleep 3
		waited=$((waited + 3))
	done
}

new_cluster() {
	"$KIND" delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
	"$KIND" create cluster --name "$CLUSTER" --wait 120s
	# Reached from the containers on the `kind` network, mode 644: the
	# backup-tools user (1001) reads it. A throwaway cluster's credentials.
	"$KIND" get kubeconfig --internal --name "$CLUSTER" >"$WORK/kubeconfig"
	chmod 644 "$WORK/kubeconfig"
}

install_controller() {
	$K apply -f "$WORK/controller.yaml" >/dev/null
	$K -n kube-system rollout status deployment sealed-secrets-controller --timeout=180s
	wait_for 60 "[ -n \"\$($K -n kube-system get secret -l $KEY_LABEL -o name)\" ]" ||
		die "the controller created no key"
}

# tools <script> <args...>: runs a repository script in the backup-tools image.
tools() {
	MSYS_NO_PATHCONV=1 docker run --rm --network kind \
		-v "$ROOT:/repo:ro" -v "$WORK:/work" -e KUBECONFIG=/work/kubeconfig \
		-e BACKUP_AGE_RECIPIENTS="$RECIPIENT" -e BACKUP_S3_BUCKET=s3://drill/backups \
		-e AWS_ACCESS_KEY_ID=drill -e AWS_SECRET_ACCESS_KEY=drill-secret-key -e AWS_REGION=us-east-1 \
		-e RCLONE_S3_ENDPOINT="http://${S3}:8080" -e RCLONE_S3_PROVIDER=Other \
		"$IMAGE" bash "/repo/scripts/$1" "${@:2}"
}

secret_value() {
	$K -n drill get secret drill-secret -o jsonpath='{.data.value}' 2>/dev/null | base64 -d
}

log "controller manifest v0.27.1 (sha256 pinned)"
curl -fsSLo "$WORK/controller.yaml" "$CONTROLLER_URL"
echo "${CONTROLLER_SHA256}  $WORK/controller.yaml" | sha256sum -c - >/dev/null || die "controller.yaml checksum mismatch"
"$KUBESEAL" --version | grep -q '0\.27\.1' || die "kubeseal is not v0.27.1"
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -q -t "$IMAGE" "$ROOT/deploy/backup"
age-keygen -o "$WORK/key.txt" 2>/dev/null
chmod 644 "$WORK/key.txt"
RECIPIENT="$(sed -n 's/^# public key: //p' "$WORK/key.txt")"
VALUE="drill-$(date +%s)-$RANDOM"

log "1. cluster A: controller, test secret sealed and decrypted"
new_cluster
install_controller
$K create namespace drill >/dev/null
$K -n drill create secret generic drill-secret --from-literal=value="$VALUE" --dry-run=client -o yaml |
	"$KUBESEAL" --context "kind-${CLUSTER}" --format yaml >"$WORK/sealed.yaml"
grep -q '^kind: SealedSecret$' "$WORK/sealed.yaml" || die "kubeseal produced no SealedSecret"
$K apply -f "$WORK/sealed.yaml" >/dev/null
wait_for 60 "[ \"\$(secret_value)\" = \"$VALUE\" ]" || die "cluster A did not decrypt the SealedSecret"
KEYS_A="$($K -n kube-system get secret -l "$KEY_LABEL" -o name | sort)"
log "   decrypted; keys: $(tr '\n' ' ' <<<"$KEYS_A")"

log "2. keys backed up off-site"
docker rm -f "$S3" >/dev/null 2>&1 || true
docker run -d --name "$S3" --network kind --entrypoint sh "$IMAGE" -c \
	'mkdir -p /tmp/s3/drill && exec rclone serve s3 --addr 0.0.0.0:8080 --auth-key drill,drill-secret-key /tmp/s3' >/dev/null
sleep 3
tools backup-sealed-secrets-key.sh || die "backup-sealed-secrets-key.sh failed"
docker exec "$S3" sh -c 'ls /tmp/s3/drill/backups/sealed-secrets-key/' | grep -qE '^sealed-secrets-key_.*\.yaml\.age$' ||
	die "no encrypted key file in the bucket"
docker exec "$S3" sh -c 'grep -rl "BEGIN RSA PRIVATE KEY\|tls.key" /tmp/s3' && die "plaintext key in the bucket"

log "3. cluster A lost; cluster B with a new controller does not decrypt the SealedSecret"
new_cluster
install_controller
$K create namespace drill >/dev/null
$K apply -f "$WORK/sealed.yaml" >/dev/null
sleep 20
[ -z "$(secret_value)" ] || die "cluster B decrypted the SealedSecret without the restored keys: the drill proves nothing"
log "   not decrypted, as expected"

log "4. keys restored from the bucket"
tools restore-sealed-secrets-key.sh --identity /work/key.txt || die "restore-sealed-secrets-key.sh failed"
KEYS_B="$($K -n kube-system get secret -l "$KEY_LABEL" -o name | sort)"
while read -r key; do
	grep -qxF "$key" <<<"$KEYS_B" || die "key ${key} of cluster A missing in cluster B"
done <<<"$KEYS_A"

log "5. the SealedSecret of cluster A decrypts in cluster B"
# The controller retries a SealedSecret it failed to unseal; re-applying it
# makes it immediate.
$K -n drill annotate sealedsecret drill-secret drill/retry="$(date +%s)" --overwrite >/dev/null
wait_for 90 "[ \"\$(secret_value)\" = \"$VALUE\" ]" || {
	$K -n kube-system logs deployment/sealed-secrets-controller --tail=30 || true
	die "cluster B did not decrypt the SealedSecret after the restore"
}
log "PASSED: SealedSecret sealed in cluster A decrypted in cluster B after the key restore"
