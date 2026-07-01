#!/usr/bin/env bash
# Secret cleanup script — removes committed secrets from git history.
# Run BEFORE making the repo public or sharing with untrusted parties.
#
# Usage: bash scripts/git-secret-cleanup.sh
#
# WARNING: This rewrites git history. All team members must re-clone afterwards.
# Coordinate with the team before running.

set -euo pipefail

echo "=== Secret Cleanup — Removing committed secrets from git history ==="
echo ""
echo "This will rewrite git history to remove:"
echo "  1. certs/server-key.pem (TLS private key committed accidentally)"
echo "  2. .env file (contains MYSQL_ROOT_PASSWORD and other config)"
echo ""
echo "AFTER running this:"
echo "  - Regenerate ALL TLS certificates: bash scripts/generate-certs.sh"
echo "  - Revoke any CA certs that were signed with the exposed key"
echo "  - All team members must: git clone (fresh), NOT git pull"
echo "  - Rotate any secrets that were in the .env file"
echo ""

# Step 1: Ensure the files are in .gitignore first
echo "Step 1: Verifying .gitignore entries..."
if ! grep -q "^certs/" .gitignore 2>/dev/null; then
  echo "certs/" >> .gitignore
  echo "  Added 'certs/' to .gitignore"
fi
if ! grep -q "^\\.env$" .gitignore 2>/dev/null; then
  echo ".env" >> .gitignore
  echo "  Added '.env' to .gitignore"
fi

# Step 2: Remove files from git tracking (but keep on disk)
echo ""
echo "Step 2: Removing files from git tracking..."
git rm --cached certs/server-key.pem 2>/dev/null || echo "  server-key.pem already untracked"
git rm --cached certs/server-key.pem 2>/dev/null || true
git rm --cached .env 2>/dev/null || echo "  .env already untracked"

# Step 3: Verify no other .pem files are committed
echo ""
echo "Step 3: Checking for other committed secret files..."
echo "  Run: git log --all --full-history -- '**/*-key.pem'"
echo "  Run: git log --all --full-history -- '**/*.pem' | head -20"

# Step 4: Instructions for full history rewrite (must be done manually)
echo ""
echo "=== MANUAL STEPS REQUIRED ==="
echo ""
echo "Step 4: Remove from git history using BFG Repo-Cleaner:"
echo "  java -jar bfg.jar --delete-files server-key.pem --delete-files .env ."
echo "  git reflog expire --expire=now --all"
echo "  git gc --prune=now --aggressive"
echo ""
echo "  OR using git filter-branch (slower):"
echo "  git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch certs/server-key.pem .env' --prune-empty --tag-name-filter cat -- --all"
echo ""
echo "Step 5: Regenerate all certificates:"
echo "  bash scripts/generate-certs.sh"
echo ""
echo "Step 6: Force push the cleaned history:"
echo "  git push origin --force --all"
echo "  git push origin --force --tags"
echo ""
echo "Step 7: Rotate all secrets that were exposed:"
echo "  - CA root key (if it was in certs/)"
echo "  - MYSQL_ROOT_PASSWORD (if it was in .env)"
echo "  - All HMAC secrets and admin tokens"
echo ""
echo "=== Cleanup preparation complete ==="
