#!/usr/bin/env bash
# =============================================================================
#  run-migrations.sh — Database Migration Runner
#  Runs pending SQL migrations against the target MySQL database.
#
#  Environment variables:
#    DB_HOST     - MySQL host (default: localhost)
#    DB_PORT     - MySQL port (default: 3306)
#    DB_USER     - MySQL user (default: root)
#    DB_PASSWORD - MySQL password
#    DB_NAME     - Database name (default: financial_scraper)
#
#  Usage:
#    ./scripts/run-migrations.sh              # Uses env vars directly
#    ./scripts/run-migrations.sh status       # Show migration status
#    ./scripts/run-migrations.sh create name  # Create a new migration
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATE_SCRIPT="${SCRIPT_DIR}/migrate.mjs"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
err()  { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; }

if [[ ! -f "$MIGRATE_SCRIPT" ]]; then
  err "Migration script not found: $MIGRATE_SCRIPT"
  exit 1
fi

if [[ ! -d "${SCRIPT_DIR}/migrations" ]]; then
  err "Migrations directory not found: ${SCRIPT_DIR}/migrations"
  exit 1
fi

# Validate required env vars (skip for 'create' command)
if [[ "${1:-}" != "create" ]]; then
  : "${DB_HOST:?Must set DB_HOST}"
  : "${DB_PORT:=3306}"
  : "${DB_USER:=root}"
  : "${DB_PASSWORD:?Must set DB_PASSWORD}"
  : "${DB_NAME:=financial_scraper}"
  export DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
fi

case "${1:-up}" in
  up|down|status)
    log "Running: node scripts/migrate.mjs ${1}"
    node "$MIGRATE_SCRIPT" "$1"
    ;;
  create)
    if [[ -z "${2:-}" ]]; then
      err "Usage: $0 create <migration_name>"
      exit 1
    fi
    log "Creating migration: $2"
    node "$MIGRATE_SCRIPT" create "$2"
    ;;
  *)
    echo "Usage: $0 [up|down|status|create <name>]"
    exit 1
    ;;
esac

log "Done."
