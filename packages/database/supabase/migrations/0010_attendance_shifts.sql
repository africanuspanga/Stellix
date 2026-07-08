-- 0010: Shifts, rostering, attendance (raw events vs processed days),
-- corrections, overtime approval, timesheets v1.

-- ── Shifts ──────────────────────────────────────────────────────────────
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  start_time time not null,
  end_time time not null,               -- < start_time ⇒ crosses midnight
  grace_minutes integer not null default 0,
  unpaid_break_minutes integer not null default 0,
  required_hours numeric(4, 2) not null default 8,
  is_night boolean not null default false,
  overtime_eligible boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

-- ── Roster ──────────────────────────────────────────────────────────────
create table public.roster_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  shift_id uuid not null references public.shifts(id) on delete cascade,
  work_date date not null,
  work_site_id uuid references public.work_sites(id),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, employee_id, work_date)   -- one shift per day (v1)
);
create index roster_assignments_date_idx on public.roster_assignments (tenant_id, work_date);

-- ── Raw attendance events (immutable; corrections add new events) ───────
create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  event_type text not null check (event_type in ('check_in', 'check_out')),
  event_time timestamptz not null,
  method text not null default 'mobile_web' check (method in (
    'mobile_web', 'manual', 'correction', 'api'
  )),
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  accuracy_m numeric(7, 1),
  work_site_id uuid references public.work_sites(id),
  geofence_result text not null default 'unknown' check (geofence_result in (
    'inside', 'outside', 'no_geofence', 'unknown'
  )),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index attendance_events_day_idx
  on public.attendance_events (tenant_id, employee_id, event_time);

-- ── Processed daily attendance (recalculable from events) ───────────────
create table public.attendance_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  shift_id uuid references public.shifts(id),
  first_in timestamptz,
  last_out timestamptz,
  worked_minutes integer not null default 0,
  late_minutes integer not null default 0,
  early_departure_minutes integer not null default 0,
  overtime_minutes integer not null default 0,          -- computed
  overtime_approved_minutes integer not null default 0, -- human-approved
  overtime_approved_by uuid references auth.users(id),
  overtime_approved_at timestamptz,
  status text not null default 'absent' check (status in (
    'present', 'late', 'absent', 'half_day', 'on_leave', 'holiday',
    'rest_day', 'missing_in', 'missing_out'
  )),
  processed_at timestamptz not null default now(),
  unique (tenant_id, employee_id, work_date)
);
create index attendance_days_date_idx on public.attendance_days (tenant_id, work_date);

-- ── Corrections (approved → correction events + reprocess) ──────────────
create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  corrected_in timestamptz,
  corrected_out timestamptz,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_by uuid references auth.users(id),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index attendance_corrections_pending_idx
  on public.attendance_corrections (tenant_id, status) where status = 'pending';

-- ── Timesheets v1 ───────────────────────────────────────────────────────
create table public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  work_date date not null,
  project_id uuid references public.org_projects(id),
  activity text not null,
  hours numeric(4, 2) not null check (hours > 0 and hours <= 24),
  billable boolean not null default false,
  status text not null default 'submitted' check (status in (
    'submitted', 'approved', 'rejected'
  )),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index timesheet_entries_idx on public.timesheet_entries (tenant_id, employee_id, work_date);

-- ── RLS ─────────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array[
    'shifts', 'roster_assignments', 'attendance_events', 'attendance_days',
    'attendance_corrections', 'timesheet_entries'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy tenant_isolation on public.%I for all
         using (tenant_id in (select app.user_tenant_ids()))
         with check (tenant_id in (select app.user_tenant_ids()))', t);
  end loop;
end;
$$;

-- Raw events are immutable: revoke row updates via policy (no update policy
-- means members cannot update; deletes also blocked by dropping FOR ALL).
drop policy tenant_isolation on public.attendance_events;
create policy attendance_events_select on public.attendance_events
  for select using (tenant_id in (select app.user_tenant_ids()));
create policy attendance_events_insert on public.attendance_events
  for insert with check (tenant_id in (select app.user_tenant_ids()));
