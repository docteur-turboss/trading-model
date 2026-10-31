#!/usr/bin/env bash
# Installs a Tang server: the network key that lets the data disks encrypted
# by encrypt-data-disk.sh unlock at boot. Tang stores no secret about the
# clients: it only proves the disk sits on the expected network. Run it on a
# DIFFERENT machine from the data (smallest VPS, Raspberry Pi, home PC), and
# expose its port only to the data hosts (firewall or VPN such as WireGuard).
#
#   sudo deploy/host/tang-server.sh [--port 7500]
#
# Prints the thumbprint to pass as `--tang http://<host>:<port>#<thumbprint>`.
# Debian/Ubuntu/Raspberry Pi OS (apt); elsewhere install the `tang` package
# and enable `tangd.socket` the same way.
set -euo pipefail

PORT=7500
while [[ $# -gt 0 ]]; do
	case "$1" in
	--port) PORT="$2"; shift 2 ;;
	*) echo "unknown option: $1" >&2; exit 1 ;;
	esac
done

[ "$(id -u)" -eq 0 ] || { echo "run as root" >&2; exit 1; }

apt-get update -q
apt-get install -y -q tang jose curl

# tangd is socket-activated: only the listening port is configured.
mkdir -p /etc/systemd/system/tangd.socket.d
printf '[Socket]\nListenStream=\nListenStream=%s\n' "$PORT" \
	>/etc/systemd/system/tangd.socket.d/10-port.conf
systemctl daemon-reload
systemctl enable tangd.socket
systemctl restart tangd.socket

# The keys are generated on the first request when the directory is empty.
adv="$(curl -sf --retry 5 --retry-connrefused "http://localhost:${PORT}/adv")"
thp="$(echo "$adv" | jose fmt -j- -g payload -y -o- | jose jwk use -i- -r -u verify -o- | jose jwk thp -i-)"

echo "Tang listens on :${PORT}"
echo "thumbprint: ${thp}"
echo "data hosts: --tang 'http://<this host>:${PORT}#${thp}'"
