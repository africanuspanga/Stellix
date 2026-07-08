-- 0007: Document engine v1 — employee documents metadata + private storage
-- bucket with tenant-scoped access (path convention: tenantId/employeeId/file).

create table public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  category text not null default 'other' check (category in (
    'contract', 'id_document', 'certificate', 'cv', 'letter', 'permit', 'other'
  )),
  name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  expiry_date date,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index employee_documents_employee_idx
  on public.employee_documents (tenant_id, employee_id);
create index employee_documents_expiry_idx
  on public.employee_documents (tenant_id, expiry_date) where expiry_date is not null;

alter table public.employee_documents enable row level security;
create policy tenant_isolation on public.employee_documents for all
  using (tenant_id in (select app.user_tenant_ids()))
  with check (tenant_id in (select app.user_tenant_ids()));

-- ── Storage bucket (private) ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;

-- Object paths start with the tenant id; membership gates every operation.
create policy "employee docs read" on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1]::uuid in (select app.user_tenant_ids())
  );
create policy "employee docs insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1]::uuid in (select app.user_tenant_ids())
  );
create policy "employee docs delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-documents'
    and (storage.foldername(name))[1]::uuid in (select app.user_tenant_ids())
  );
