-- ECC Operations persistence (Supabase Postgres source of truth).
-- Preserves existing ECC string IDs as primary identifiers.
-- Daily Ops content is immutable; Issues/Requests history is append-only.
-- Junction tables model Daily Ops ↔ Issues / Requests relationships.

-- ---------------------------------------------------------------------------
-- Enable ecc_operations for organisations that have (or should have) the module
-- ---------------------------------------------------------------------------

insert into public.organisation_modules (
  organisation_id,
  module_id,
  status,
  enabled_at,
  configuration
)
select
  o.id,
  m.id,
  'enabled'::public.organisation_module_status,
  timezone('utc', now()),
  '{}'::jsonb
from public.organisations o
cross join public.modules m
where m.slug = 'ecc_operations'
on conflict (organisation_id, module_id) do update
set
  status = 'enabled'::public.organisation_module_status,
  enabled_at = coalesce(
    public.organisation_modules.enabled_at,
    excluded.enabled_at
  );

-- ---------------------------------------------------------------------------
-- Centres (org-scoped; string id preserved e.g. ECC-001)
-- ---------------------------------------------------------------------------

create table public.ecc_centres (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  name text not null,
  facility_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_centres_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_centres_name_nonempty check (char_length(trim(name)) > 0)
);

create index ecc_centres_org_idx on public.ecc_centres (organisation_id);

create trigger ecc_centres_set_updated_at
before update on public.ecc_centres
for each row execute function public.set_updated_at();

comment on table public.ecc_centres is
  'ECC centre identity per organisation. String id preserved for deep links.';

-- ---------------------------------------------------------------------------
-- Daily Ops (immutable content snapshots)
-- ---------------------------------------------------------------------------

create table public.ecc_daily_ops (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  period text not null,
  reporting_date date not null,
  recorded_at timestamptz not null,
  recorded_by_name text not null,
  overall_status text not null,
  centre_operations jsonb not null default '{}'::jsonb,
  call_operations jsonb not null default '{}'::jsonb,
  facility jsonb not null default '{}'::jsonb,
  technical jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  primary key (organisation_id, id),
  constraint ecc_daily_ops_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_daily_ops_period_check
    check (period in ('morning', 'evening', 'ad_hoc')),
  constraint ecc_daily_ops_overall_status_check
    check (
      overall_status in (
        'operational',
        'operational_with_issues',
        'disrupted',
        'down'
      )
    ),
  constraint ecc_daily_ops_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_daily_ops_org_recorded_at_idx
  on public.ecc_daily_ops (organisation_id, recorded_at desc);

create index ecc_daily_ops_org_centre_idx
  on public.ecc_daily_ops (organisation_id, centre_id);

comment on table public.ecc_daily_ops is
  'Immutable Daily Operations snapshots. Links live in junction tables.';

-- Block all updates to daily ops content (immutability).
create or replace function public.ecc_daily_ops_reject_update()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ecc_daily_ops rows are immutable';
end;
$$;

create trigger ecc_daily_ops_immutable
before update on public.ecc_daily_ops
for each row execute function public.ecc_daily_ops_reject_update();

-- ---------------------------------------------------------------------------
-- Issues
-- ---------------------------------------------------------------------------

create table public.ecc_issues (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  occurred_at timestamptz not null,
  classification text not null,
  severity text not null,
  title text not null,
  description text not null default '',
  status text not null,
  reporter_name text not null,
  current_owner_name text,
  resolution_notes text,
  closed_at timestamptz,
  closed_by_name text,
  related_ecc_request_id text,
  source_daily_ops_id text,
  source_daily_ops_section text,
  facility_id text,
  asset_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (organisation_id, id),
  constraint ecc_issues_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_issues_classification_check
    check (classification in ('operational', 'technical')),
  constraint ecc_issues_severity_check
    check (severity in ('low', 'medium', 'high', 'critical')),
  constraint ecc_issues_status_check
    check (
      status in (
        'identified',
        'recorded',
        'assessed',
        'in_treatment',
        'escalated',
        'resolved',
        'closed'
      )
    ),
  constraint ecc_issues_section_check
    check (
      source_daily_ops_section is null
      or source_daily_ops_section in ('centre', 'call', 'facility', 'technical')
    ),
  constraint ecc_issues_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_issues_org_updated_at_idx
  on public.ecc_issues (organisation_id, updated_at desc);

create index ecc_issues_org_centre_idx
  on public.ecc_issues (organisation_id, centre_id);

create index ecc_issues_org_status_idx
  on public.ecc_issues (organisation_id, status);

create unique index ecc_issues_source_section_uidx
  on public.ecc_issues (
    organisation_id,
    source_daily_ops_id,
    source_daily_ops_section
  )
  where source_daily_ops_id is not null
    and source_daily_ops_section is not null;

comment on table public.ecc_issues is
  'ECC Issues. String ids preserved. History is append-only in ecc_issue_history.';

-- ---------------------------------------------------------------------------
-- Issue history (append-only)
-- ---------------------------------------------------------------------------

create table public.ecc_issue_history (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  issue_id text not null,
  at timestamptz not null,
  by_name text not null,
  kind text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_issue_history_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_issue_history_kind_check
    check (
      kind in (
        'status_change',
        'action',
        'escalation',
        'resolution',
        'closure',
        'note'
      )
    ),
  constraint ecc_issue_history_issue_fk
    foreign key (organisation_id, issue_id)
    references public.ecc_issues (organisation_id, id)
    on delete cascade
);

create index ecc_issue_history_issue_at_idx
  on public.ecc_issue_history (organisation_id, issue_id, at asc);

create or replace function public.ecc_issue_history_reject_mutate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ecc_issue_history is append-only';
end;
$$;

create trigger ecc_issue_history_no_update
before update on public.ecc_issue_history
for each row execute function public.ecc_issue_history_reject_mutate();

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------

create table public.ecc_requests (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  title text not null,
  reason text not null default '',
  description text not null default '',
  origin text not null,
  responsibility text not null,
  priority text not null,
  status text not null,
  requesting_manager_name text not null,
  current_owner_name text,
  evidence_notes text,
  resolution_notes text,
  closed_at timestamptz,
  closed_by_name text,
  related_ecc_issue_id text,
  source_daily_ops_id text,
  source_daily_ops_section text,
  facility_id text,
  asset_id text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  primary key (organisation_id, id),
  constraint ecc_requests_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_requests_origin_check
    check (origin in ('operational', 'technical')),
  constraint ecc_requests_responsibility_check
    check (responsibility in ('company', 'client')),
  constraint ecc_requests_priority_check
    check (priority in ('low', 'medium', 'high', 'urgent')),
  constraint ecc_requests_status_check
    check (
      status in (
        'submitted',
        'with_relationship_manager',
        'with_downstream',
        'in_follow_up',
        'resolved',
        'closed',
        'cancelled'
      )
    ),
  constraint ecc_requests_section_check
    check (
      source_daily_ops_section is null
      or source_daily_ops_section in ('centre', 'call', 'facility', 'technical')
    ),
  constraint ecc_requests_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_requests_org_updated_at_idx
  on public.ecc_requests (organisation_id, updated_at desc);

create index ecc_requests_org_centre_idx
  on public.ecc_requests (organisation_id, centre_id);

create index ecc_requests_org_status_idx
  on public.ecc_requests (organisation_id, status);

create unique index ecc_requests_source_section_uidx
  on public.ecc_requests (
    organisation_id,
    source_daily_ops_id,
    source_daily_ops_section
  )
  where source_daily_ops_id is not null
    and source_daily_ops_section is not null;

comment on table public.ecc_requests is
  'ECC Requests. String ids preserved. History is append-only in ecc_request_history.';

-- ---------------------------------------------------------------------------
-- Request history (append-only)
-- ---------------------------------------------------------------------------

create table public.ecc_request_history (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  request_id text not null,
  at timestamptz not null,
  by_name text not null,
  kind text not null,
  from_status text,
  to_status text,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_request_history_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_request_history_kind_check
    check (
      kind in (
        'status_change',
        'action',
        'note',
        'resolution',
        'closure'
      )
    ),
  constraint ecc_request_history_request_fk
    foreign key (organisation_id, request_id)
    references public.ecc_requests (organisation_id, id)
    on delete cascade
);

create index ecc_request_history_request_at_idx
  on public.ecc_request_history (organisation_id, request_id, at asc);

create or replace function public.ecc_request_history_reject_mutate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'ecc_request_history is append-only';
end;
$$;

create trigger ecc_request_history_no_update
before update on public.ecc_request_history
for each row execute function public.ecc_request_history_reject_mutate();

-- ---------------------------------------------------------------------------
-- Junction: Daily Ops ↔ Issues / Requests
-- ---------------------------------------------------------------------------

create table public.ecc_daily_ops_issue_links (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  daily_ops_id text not null,
  issue_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, daily_ops_id, issue_id),
  constraint ecc_daily_ops_issue_links_daily_fk
    foreign key (organisation_id, daily_ops_id)
    references public.ecc_daily_ops (organisation_id, id)
    on delete cascade,
  constraint ecc_daily_ops_issue_links_issue_fk
    foreign key (organisation_id, issue_id)
    references public.ecc_issues (organisation_id, id)
    on delete cascade
);

create index ecc_daily_ops_issue_links_issue_idx
  on public.ecc_daily_ops_issue_links (organisation_id, issue_id);

create table public.ecc_daily_ops_request_links (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  daily_ops_id text not null,
  request_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, daily_ops_id, request_id),
  constraint ecc_daily_ops_request_links_daily_fk
    foreign key (organisation_id, daily_ops_id)
    references public.ecc_daily_ops (organisation_id, id)
    on delete cascade,
  constraint ecc_daily_ops_request_links_request_fk
    foreign key (organisation_id, request_id)
    references public.ecc_requests (organisation_id, id)
    on delete cascade
);

create index ecc_daily_ops_request_links_request_idx
  on public.ecc_daily_ops_request_links (organisation_id, request_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.ecc_centres enable row level security;
alter table public.ecc_daily_ops enable row level security;
alter table public.ecc_issues enable row level security;
alter table public.ecc_issue_history enable row level security;
alter table public.ecc_requests enable row level security;
alter table public.ecc_request_history enable row level security;
alter table public.ecc_daily_ops_issue_links enable row level security;
alter table public.ecc_daily_ops_request_links enable row level security;

-- Centres
create policy ecc_centres_select on public.ecc_centres
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_centres_insert on public.ecc_centres
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_centres_update on public.ecc_centres
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Daily ops: select + insert only (immutable)
create policy ecc_daily_ops_select on public.ecc_daily_ops
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_daily_ops_insert on public.ecc_daily_ops
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Issues
create policy ecc_issues_select on public.ecc_issues
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_issues_insert on public.ecc_issues
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_issues_update on public.ecc_issues
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_issues_delete on public.ecc_issues
for delete to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Issue history: select + insert
create policy ecc_issue_history_select on public.ecc_issue_history
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_issue_history_insert on public.ecc_issue_history
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Requests
create policy ecc_requests_select on public.ecc_requests
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_requests_insert on public.ecc_requests
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_requests_update on public.ecc_requests
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Request history: select + insert
create policy ecc_request_history_select on public.ecc_request_history
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_request_history_insert on public.ecc_request_history
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Junction links
create policy ecc_daily_ops_issue_links_select on public.ecc_daily_ops_issue_links
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_daily_ops_issue_links_insert on public.ecc_daily_ops_issue_links
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_daily_ops_issue_links_delete on public.ecc_daily_ops_issue_links
for delete to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_daily_ops_request_links_select on public.ecc_daily_ops_request_links
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_daily_ops_request_links_insert on public.ecc_daily_ops_request_links
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_daily_ops_request_links_delete on public.ecc_daily_ops_request_links
for delete to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- Grants
grant select, insert, update on table public.ecc_centres to authenticated;
grant select, insert on table public.ecc_daily_ops to authenticated;
grant select, insert, update, delete on table public.ecc_issues to authenticated;
grant select, insert on table public.ecc_issue_history to authenticated;
grant select, insert, update on table public.ecc_requests to authenticated;
grant select, insert on table public.ecc_request_history to authenticated;
grant select, insert, delete on table public.ecc_daily_ops_issue_links to authenticated;
grant select, insert, delete on table public.ecc_daily_ops_request_links to authenticated;

grant all on table public.ecc_centres to service_role;
grant all on table public.ecc_daily_ops to service_role;
grant all on table public.ecc_issues to service_role;
grant all on table public.ecc_issue_history to service_role;
grant all on table public.ecc_requests to service_role;
grant all on table public.ecc_request_history to service_role;
grant all on table public.ecc_daily_ops_issue_links to service_role;
grant all on table public.ecc_daily_ops_request_links to service_role;
