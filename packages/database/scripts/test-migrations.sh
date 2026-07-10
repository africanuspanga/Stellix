#!/usr/bin/env bash
# Applies the full migration chain against a scratch Postgres (CI or local),
# with minimal Supabase auth/storage stubs, then re-runs the idempotent
# hardening migrations to prove they stay idempotent.
# Usage: DATABASE_URL=postgres://... ./scripts/test-migrations.sh
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set (scratch Postgres, NOT production)." >&2
  exit 1
fi

PSQL=(psql "$DATABASE_URL" -qX -v ON_ERROR_STOP=1)

"${PSQL[@]}" <<'SQL'
-- Supabase environment stubs (roles, auth schema, storage schema)
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1] $$;
SQL

dir="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"
for f in "$dir"/*.sql; do
  echo "── applying $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done

echo "── re-running idempotent hardening migrations"
"${PSQL[@]}" -f "$dir/0018_bank_privacy_scale_integrity.sql"
"${PSQL[@]}" -f "$dir/0019_ai_native_foundation.sql"

echo "All migrations apply cleanly; 0018/0019 idempotent."
