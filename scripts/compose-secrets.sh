#!/usr/bin/env bash
# Decrypts the compose secrets (age) to OUT and refuses, before any deploy change, a file that does not
# decrypt or lacks a variable docker-compose.yml requires (${VAR:?...}). Never prints a value (ADR-0086).
#   compose-secrets.sh <secrets.env.age> <age identity file> <docker-compose.yml> <out>
set -euo pipefail
enc=$1 identity=$2 compose=$3 out=$4
umask 077
fail() { rm -f "$out"; echo "::error::$1" >&2; exit 1; }
command -v age >/dev/null || fail "age is not installed on the runner"
age -d -i "$identity" -o "$out" "$enc" 2>/dev/null || fail "$enc does not decrypt with the host identity"
missing=""
for v in $(grep -oE '\$\{[A-Z0-9_]+:\?' "$compose" | tr -d '${:?' | sort -u); do
	grep -qE "^$v=." "$out" || missing="$missing $v"
done
[ -z "$missing" ] || fail "secrets.env.age lacks:$missing"
