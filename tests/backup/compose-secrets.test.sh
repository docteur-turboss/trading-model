#!/usr/bin/env bash
# scripts/compose-secrets.sh with real age: good file accepted, corrupt / missing key / wrong identity
# refused with no plaintext left.   bash tests/backup/compose-secrets.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
# shellcheck source=test-lib.sh
source "$ROOT/tests/backup/test-lib.sh"
cd "$WORK"
age-keygen -o id.txt 2>/dev/null; age-keygen -o other.txt 2>/dev/null
pub=$(age-keygen -y id.txt)
printf 'services:\n  a:\n    environment:\n      X: ${A_PASS:?set A}\n      Y: ${B_PASS:?set B}\n' >compose.yml
run() { bash "$ROOT/scripts/compose-secrets.sh" "$1" "${2:-id.txt}" compose.yml out.env 2>/dev/null; }
expect_refused() { if run "$@"; then failed "$1 accepted"; elif [ -e out.env ]; then failed "plaintext left"; else pass "$1 refused"; fi; }

printf 'A_PASS=a\nB_PASS=b\n' | age -r "$pub" -o good.age
run good.age && grep -q '^B_PASS=b$' out.env && pass "good file decrypted" || failed "good file refused"
rm -f out.env
printf 'A_PASS=a\n' | age -r "$pub" -o missing.age; expect_refused missing.age
printf 'A_PASS=\nB_PASS=b\n' | age -r "$pub" -o empty.age; expect_refused empty.age
echo garbage >corrupt.age; expect_refused corrupt.age
expect_refused good.age other.txt
exit $FAILED
