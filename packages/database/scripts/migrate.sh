#!/usr/bin/env bash
# Applies all migrations in order against SUPABASE_DB_URL.
# Usage: SUPABASE_DB_URL=postgres://... ./scripts/migrate.sh
set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL is not set. Paste the Supabase connection string first." >&2
  exit 1
fi

dir="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"
for f in "$dir"/*.sql; do
  echo "── applying $(basename "$f")"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "All migrations applied."
