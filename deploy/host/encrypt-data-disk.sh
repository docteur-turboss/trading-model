#!/usr/bin/env bash
# Encrypts a dedicated data disk with LUKS2 and binds it with Clevis to Tang
# servers and/or the TPM2 chip, so the host unlocks it at boot without a
# passphrase while the disk alone (stolen, snapshotted, resold by the hosting
# provider) stays unreadable. Mount it where the stack keeps its data:
#   k3s:     /var/lib/rancher (PVs of local-path, the datastore holding the
#            Secrets, container images)
#   compose: /var/lib/docker  (named volumes)
#
#   sudo deploy/host/encrypt-data-disk.sh --device /dev/sdb --mount /var/lib/rancher \
#     --tang 'http://10.0.0.5:7500#<thumbprint>' [--tang URL#THP ...] [--tpm2] \
#     [--threshold N] [--service k3s] [--migrate] --wipe
#
# --device     disk or partition to encrypt: EVERYTHING ON IT IS ERASED
# --mount      mount point of the encrypted filesystem
# --tang       Tang server URL; `#<thumbprint>` pins its signing key (printed
#              by deploy/host/tang-server.sh). Without it the key is trusted on
#              first use. Repeatable
# --tpm2       also accept the local TPM2 chip
# --threshold  number of pins needed to unlock (default 1: any Tang server or
#              the TPM). 2 with --tpm2 and one Tang = this machine AND the
#              Tang server, i.e. neither the disk nor the network alone
# --service    systemd unit that must only start once the disk is mounted
#              (k3s, k3s-agent, docker). Repeatable
# --migrate    the mount point already holds data: stop the services, copy it
#              onto the encrypted disk and keep the original as
#              <mount>.pre-encryption-<date> (delete it once checked)
# --name       device-mapper name (default tmdata)
# --recovery-key-out  where the recovery passphrase is written (default
#              /root/luks-recovery-<name>.key): move it OFF the machine
# --wipe       mandatory confirmation that --device may be erased
#
# Needs: cryptsetup, clevis, clevis-luks, clevis-systemd, curl, jose, rsync
# (Debian/Ubuntu: apt-get install cryptsetup clevis clevis-luks clevis-systemd
# clevis-tpm2 curl jose rsync).
set -euo pipefail

DEVICE=""
MOUNT=""
NAME="tmdata"
THRESHOLD=1
TPM2=false
MIGRATE=false
WIPE=false
RECOVERY_KEY=""
TANGS=()
SERVICES=()

log() { echo "[encrypt-data-disk] $*"; }
die() {
	echo "[encrypt-data-disk] ERROR: $*" >&2
	exit 1
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--device) DEVICE="$2"; shift 2 ;;
	--mount) MOUNT="${2%/}"; shift 2 ;;
	--name) NAME="$2"; shift 2 ;;
	--tang) TANGS+=("$2"); shift 2 ;;
	--tpm2) TPM2=true; shift ;;
	--threshold) THRESHOLD="$2"; shift 2 ;;
	--service) SERVICES+=("$2"); shift 2 ;;
	--migrate) MIGRATE=true; shift ;;
	--recovery-key-out) RECOVERY_KEY="$2"; shift 2 ;;
	--wipe) WIPE=true; shift ;;
	*) die "unknown option: $1 (see the header of $0)" ;;
	esac
done
RECOVERY_KEY="${RECOVERY_KEY:-/root/luks-recovery-${NAME}.key}"

has_systemd() { [ -d /run/systemd/system ]; }

# ── Checks: nothing is modified before all of them pass ─────────────────────

[ "$(id -u)" -eq 0 ] || die "run as root"
[ -n "$DEVICE" ] && [ -n "$MOUNT" ] || die "--device and --mount are required"
[ -b "$DEVICE" ] || die "$DEVICE is not a block device"
$WIPE || die "--wipe is required: every byte of $DEVICE is erased"
for tool in cryptsetup clevis jose curl lsblk findmnt mkfs.ext4 blkid; do
	command -v "$tool" >/dev/null || die "missing tool: $tool"
done
$MIGRATE && { command -v rsync >/dev/null || die "missing tool: rsync"; }

pins=${#TANGS[@]}
$TPM2 && pins=$((pins + 1))
[ "$pins" -gt 0 ] || die "give at least one --tang or --tpm2"
[ "$THRESHOLD" -ge 1 ] && [ "$THRESHOLD" -le "$pins" ] ||
	die "--threshold must be between 1 and the number of pins ($pins)"

if lsblk -nro MOUNTPOINT "$DEVICE" | grep -q .; then
	die "$DEVICE (or one of its partitions) is mounted"
fi
[ -e "/dev/mapper/$NAME" ] && die "/dev/mapper/$NAME already exists"
if findmnt -rno TARGET "$MOUNT" >/dev/null 2>&1; then
	die "$MOUNT is already a mount point"
fi
if [ -d "$MOUNT" ] && [ -n "$(ls -A "$MOUNT")" ] && ! $MIGRATE; then
	die "$MOUNT is not empty: pass --migrate to move its content onto the encrypted disk"
fi
# The data must not be copied back onto the very disk being erased.
if [ -d "$MOUNT" ]; then
	parent_disk="$(findmnt -no SOURCE -T "$MOUNT")"
	if lsblk -nro PATH "$DEVICE" | grep -qx "$parent_disk"; then
		die "$MOUNT currently lives on $DEVICE"
	fi
fi

# Clevis sss policy: {"t": N, "pins": {"tang": [{"url", "thp"}...], "tpm2": {}}}
tang_pins=()
for entry in "${TANGS[@]}"; do
	url="${entry%%#*}"
	thp=""
	[[ "$entry" == *"#"* ]] && thp="${entry#*#}"
	curl -sf --max-time 10 "$url/adv" >/dev/null || die "Tang server unreachable: $url/adv"
	if [ -n "$thp" ]; then
		# Checked before the disk is erased: Tang serves /adv/<thp> only for its own keys.
		curl -sf --max-time 10 "$url/adv/$thp" >/dev/null ||
			die "$url has no signing key with thumbprint $thp"
		tang_pins+=("$(printf '{"url":"%s","thp":"%s"}' "$url" "$thp")")
	else
		log "WARNING: no thumbprint for $url, its key is trusted on first use"
		tang_pins+=("$(printf '{"url":"%s"}' "$url")")
	fi
done
pin_entries=()
[ "${#tang_pins[@]}" -gt 0 ] && pin_entries+=("\"tang\":[$(IFS=,; echo "${tang_pins[*]}")]")
$TPM2 && pin_entries+=('"tpm2":{}')
sss_config="$(printf '{"t":%d,"pins":{%s}}' "$THRESHOLD" "$(IFS=,; echo "${pin_entries[*]}")")"
log "Clevis policy: $sss_config"

# ── Encrypt ─────────────────────────────────────────────────────────────────

umask 077
log "generating the recovery passphrase in $RECOVERY_KEY"
mkdir -p "$(dirname "$RECOVERY_KEY")"
head -c 48 /dev/urandom | base64 | tr -d '\n' >"$RECOVERY_KEY"

log "formatting $DEVICE as LUKS2 (aes-xts-plain64, argon2id)"
cryptsetup luksFormat --type luks2 --batch-mode --cipher aes-xts-plain64 \
	--key-size 512 --pbkdf argon2id --key-file "$RECOVERY_KEY" "$DEVICE"
uuid="$(cryptsetup luksUUID "$DEVICE")"

log "binding Clevis (sss, threshold $THRESHOLD)"
clevis luks bind -y -k "$RECOVERY_KEY" -d "$DEVICE" sss "$sss_config"

# Proves the boot path: the volume opens through Clevis alone, no passphrase.
log "unlocking through Clevis to check the binding"
clevis luks unlock -d "$DEVICE" -n "$NAME"
mkfs.ext4 -q -L "$NAME" "/dev/mapper/$NAME"

# ── Move the data in, mount ─────────────────────────────────────────────────

previous=""
if $MIGRATE && [ -d "$MOUNT" ] && [ -n "$(ls -A "$MOUNT")" ]; then
	if has_systemd; then
		for svc in "${SERVICES[@]}"; do
			log "stopping $svc"
			systemctl stop "$svc"
		done
	fi
	previous="${MOUNT}.pre-encryption-$(date +%Y%m%d%H%M%S)"
	log "moving $MOUNT to $previous"
	mv "$MOUNT" "$previous"
fi
mkdir -p "$MOUNT"
mount "/dev/mapper/$NAME" "$MOUNT"
if [ -n "$previous" ]; then
	log "copying the data onto the encrypted disk"
	rsync -aHAX --numeric-ids "$previous/" "$MOUNT/"
	chmod --reference="$previous" "$MOUNT"
	chown --reference="$previous" "$MOUNT"
fi

# ── Boot configuration ──────────────────────────────────────────────────────
# _netdev: unlocked once the network is up, so the Tang servers are reachable
# (clevis-luks-askpass answers the passphrase prompt). nofail: a failed unlock
# must not block the boot (SSH stays available); RequiresMountsFor keeps the
# services down instead of letting them start on an empty directory.

touch /etc/crypttab
sed -i "/^${NAME}[[:space:]]/d" /etc/crypttab
echo "${NAME} UUID=${uuid} none luks,_netdev" >>/etc/crypttab
sed -i "\#^/dev/mapper/${NAME}[[:space:]]#d" /etc/fstab
echo "/dev/mapper/${NAME} ${MOUNT} ext4 defaults,_netdev,nofail 0 2" >>/etc/fstab

if has_systemd; then
	systemctl enable clevis-luks-askpass.path
	for svc in "${SERVICES[@]}"; do
		dropin="/etc/systemd/system/${svc}.service.d"
		mkdir -p "$dropin"
		printf '[Unit]\nRequiresMountsFor=%s\n' "$MOUNT" >"$dropin/10-encrypted-data.conf"
	done
	systemctl daemon-reload
	for svc in "${SERVICES[@]}"; do
		systemctl start "$svc" || log "WARNING: $svc did not start, check it"
	done
else
	log "no systemd: crypttab/fstab written, enable clevis-luks-askpass.path yourself"
fi

log "done: $DEVICE (LUKS UUID $uuid) unlocked as /dev/mapper/$NAME, mounted on $MOUNT"
log "recovery passphrase: $RECOVERY_KEY: copy it to a password manager or offline, then delete it here"
[ -n "$previous" ] &&
	log "plaintext copy kept in $previous: delete it once the services run (it is NOT encrypted)"
log "check with: deploy/host/check-encryption.sh $MOUNT"
