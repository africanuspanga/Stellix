-- 0006: Seed the global permission catalogue (blueprint: six-pillar permission
-- model). Roles are per-tenant and created at tenant provisioning; this is the
-- platform-wide catalogue they draw from.
-- NOTE: already applied to the linked project on 2026-07-08.

insert into public.permissions (key, pillar, description, is_sensitive) values
  -- People
  ('people.employee.read',        'people',     'View employee records', false),
  ('people.employee.write',       'people',     'Create and update employee records', false),
  ('people.employee.self',        'people',     'View own employee record', false),
  ('people.position.manage',      'people',     'Manage positions and org structure', false),
  ('people.action.approve',       'people',     'Approve employment actions', true),
  ('people.relations.manage',     'people',     'Access employee-relations cases (restricted)', true),
  -- Time
  ('time.attendance.read',        'time',       'View attendance', false),
  ('time.attendance.manage',      'time',       'Correct and process attendance', false),
  ('time.leave.request',          'time',       'Request own leave', false),
  ('time.leave.approve',          'time',       'Approve leave requests', false),
  ('time.roster.manage',          'time',       'Build and publish rosters', false),
  -- Payroll
  ('payroll.run.read',            'payroll',    'View payroll runs', true),
  ('payroll.run.prepare',         'payroll',    'Prepare and calculate payroll', true),
  ('payroll.run.approve',         'payroll',    'Approve payroll runs (human-only)', true),
  ('payroll.payment.release',     'payroll',    'Release salary payments (human-only)', true),
  ('payroll.compensation.manage', 'payroll',    'Manage salaries and pay components', true),
  ('payroll.loan.manage',         'payroll',    'Manage loans and advances', true),
  -- Compliance
  ('compliance.dashboard.read',   'compliance', 'View compliance dashboard', false),
  ('compliance.filing.manage',    'compliance', 'Manage statutory filings', true),
  ('compliance.rule.manage',      'compliance', 'Manage compliance packs and rules', true),
  -- Employee Experience
  ('experience.desk.agent',       'experience', 'Work HR service-desk requests', false),
  ('experience.desk.request',     'experience', 'Raise HR service-desk requests', false),
  ('experience.announcement.manage', 'experience', 'Publish announcements', false),
  -- AI
  ('ai.assistant.use',            'ai',         'Use AI assistants (level: read)', false),
  ('ai.assistant.draft',          'ai',         'Use AI drafting (level: draft)', false),
  -- Settings / administration
  ('settings.tenant.manage',      'people',     'Manage tenant settings', true),
  ('settings.roles.manage',       'people',     'Manage roles and permissions', true),
  ('settings.users.manage',       'people',     'Invite and manage users', true)
on conflict (key) do nothing;
