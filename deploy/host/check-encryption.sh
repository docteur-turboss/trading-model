#!/usr/bin/env bash
# Checks that the directories holding the stack's data sit on an encrypted
# (dm-crypt/LUKS) device, and that swap does not leak memory pages in clear.
#
#   deploy/host/check-encryption.sh [path ...]
#
# Default paths: those of /var/lib/rancher (k3s) and /var/lib/docker (compose)
# that exist. Exit status 1 when a path is not encrypted.
set -euo pipefail

paths=("$@")
if [ "${#paths[@]}" -eq 0 ]; then
	for candidate in /var/lib/rancher /var/lib/docker; do
		[ -d "$candidate" ] && paths+=("$candidate")
	done
fi
[ "${#paths[@]}" -gt 0 ] || { echo "no path to check" >&2; exit 1; }

# A device is encrypted when one of the devices it is built on is a crypt
# mapping (lsblk -s walks down from the filesystem to the disk).
is_encrypted() {
	lsblk -snro TYPE "$1" 2>/dev/null | grep -qx crypt
}

status=0
for path in "${paths[@]}"; do
	source="$(findmnt -no SOURCE -T "$path")"
	if is_encrypted "$source"; then
		echo "OK        $path on $source"
		backing="$(lsblk -snro PATH,TYPE "$source" | awk '$2 == "crypt" {getline; print $1; exit}')"
		if [ -n "$backing" ] && command -v clevis >/dev/null && [ "$(id -u)" -eq 0 ]; then
			clevis luks list -d "$backing" 2>/dev/null | sed 's/^/          clevis /' || true
		fi
	else
		echo "CLEAR     $path on $source"
		status=1
	fi
done

while read -r swap; do
	[ -z "$swap" ] && continue
	if is_encrypted "$swap"; then
		echo "OK        swap $swap"
	else
		echo "CLEAR     swap $swap (memory pages, keys included, reach the disk in clear)"
		status=1
	fi
done < <(swapon --noheadings --show=NAME 2>/dev/null || true)

exit "$status"
