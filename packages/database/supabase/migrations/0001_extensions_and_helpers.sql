-- 0001: Extensions, app schema, and shared helper functions
-- Apply with: psql "$SUPABASE_DB_URL" -f 0001_extensions_and_helpers.sql

create extension if not exists pgcrypto;

-- app.user_tenant_ids() references public.tenant_users, which is created in
-- migration 0002 — skip body validation at definition time.
set check_function_bodies = off;

-- Internal helpers live outside `public` so they are not exposed via PostgREST.
create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- Tenants the current authenticated user belongs to.
-- SECURITY DEFINER so RLS policies can call it without recursing into
-- tenant_users' own policies.
create or replace function app.user_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.tenant_users
  where user_id = auth.uid()
    and is_active
$$;

comment on function app.user_tenant_ids() is
  'Active tenant memberships of auth.uid(). Basis of all tenant-isolation RLS policies.';

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
