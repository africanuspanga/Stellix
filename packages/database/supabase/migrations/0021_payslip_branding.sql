-- 0021: Per-company payslip branding — logo, template and colours. Each tenant
-- picks one of four templates and its two brand colours, and uploads a logo, so
-- payslips carry the employer's identity, not Stellix's.
--
-- Colours are validated as 6-digit hex both here and in the app, because they
-- are interpolated into inline CSS on the payslip — a check constraint keeps
-- anything but a colour out.
--
-- Idempotent: safe to re-run. Apply after 0001–0020.

create table if not exists public.payslip_branding (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  template text not null default 'modern'
    check (template in ('classic', 'modern', 'minimal', 'bold')),
  brand_color text not null default '#0F172A'
    check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text not null default '#2563EB'
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,                       -- object path in the tenant-branding bucket
  footer_note text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at before update on public.payslip_branding
  for each row execute function app.set_updated_at();

alter table public.payslip_branding enable row level security;

-- Members read (needed to render an employee's own payslip); tenant admins
-- (settings.tenant.manage) configure it.
drop policy if exists payslip_branding_read on public.payslip_branding;
create policy payslip_branding_read on public.payslip_branding for select using (
  tenant_id in (select app.user_tenant_ids())
);
drop policy if exists payslip_branding_write on public.payslip_branding;
create policy payslip_branding_write on public.payslip_branding for all
  using (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'settings.tenant.manage')
  )
  with check (
    tenant_id in (select app.user_tenant_ids())
    and app.user_has_permission(tenant_id, 'settings.tenant.manage')
  );

-- ── Logo storage (public bucket — logos are non-sensitive brand assets) ──
insert into storage.buckets (id, name, public)
values ('tenant-branding', 'tenant-branding', true)
on conflict (id) do nothing;

-- Object paths start with the tenant id. Public read (rendering); writes/deletes
-- require settings.tenant.manage in that tenant.
drop policy if exists "branding read" on storage.objects;
create policy "branding read" on storage.objects for select
  using (bucket_id = 'tenant-branding');

drop policy if exists "branding insert" on storage.objects;
create policy "branding insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tenant-branding'
    and app.user_has_permission((storage.foldername(name))[1]::uuid, 'settings.tenant.manage')
  );

drop policy if exists "branding update" on storage.objects;
create policy "branding update" on storage.objects for update to authenticated
  using (
    bucket_id = 'tenant-branding'
    and app.user_has_permission((storage.foldername(name))[1]::uuid, 'settings.tenant.manage')
  );

drop policy if exists "branding delete" on storage.objects;
create policy "branding delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'tenant-branding'
    and app.user_has_permission((storage.foldername(name))[1]::uuid, 'settings.tenant.manage')
  );
