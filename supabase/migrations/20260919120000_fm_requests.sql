-- FM Phase 2C — Requests foundation (empty operational register).
-- Durable product noun: Request (intake). Table: fm_requests.
-- Issues are NOT persisted: they remain a derived operational view.
-- Compatibility API remains /api/requests. Server-mediated only (service role).
-- Does NOT migrate Sheet Request rows. Does NOT seed Requests.
-- Actor identity: profiles.id. Anonymous portal intake leaves profile columns null.
-- Work provenance: fm_work.source_request_id -> fm_requests (replaces opaque ref).
-- No child-ID arrays are stored: Work links derive from fm_work.source_request_id.
-- Incident links are a transitional opaque mapping until the Incident cutover.

-- ---------------------------------------------------------------------------
-- fm_requests
-- ---------------------------------------------------------------------------

create table public.fm_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  facility_id uuid not null,
  title text not null,
  description text,
  location_detail text,
  request_type text,
  status text not null default 'submitted',
  occurred_at timestamptz not null default timezone('utc', now()),
  reporter_name text,
  reporter_contact text,
  reported_by_profile_id uuid,
  created_by_profile_id uuid,
  updated_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint fm_requests_org_id_unique unique (organisation_id, id),
  constraint fm_requests_title_nonempty check (char_length(trim(title)) > 0),
  constraint fm_requests_code_nonempty check (char_length(trim(code)) > 0),
  constraint fm_requests_type_check
    check (request_type is null or request_type in ('maintenance', 'incident')),
  constraint fm_requests_status_check
    check (
      status in (
        'submitted',
        'under_review',
        'being_treated',
        'resolved',
        'closed',
        'cancelled'
      )
    ),
  constraint fm_requests_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id)
    on delete restrict,
  constraint fm_requests_reported_by_profile_fk
    foreign key (organisation_id, reported_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (reported_by_profile_id),
  constraint fm_requests_created_by_profile_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (created_by_profile_id),
  constraint fm_requests_updated_by_profile_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (updated_by_profile_id)
);

create unique index fm_requests_org_code_uidx
  on public.fm_requests (organisation_id, lower(code));

create index fm_requests_org_status_idx
  on public.fm_requests (organisation_id, status);

create index fm_requests_org_facility_idx
  on public.fm_requests (organisation_id, facility_id);

create index fm_requests_org_created_at_idx
  on public.fm_requests (organisation_id, created_at desc);

create trigger fm_requests_set_updated_at
before update on public.fm_requests
for each row execute function public.set_updated_at();

comment on table public.fm_requests is
  'Canonical FM Request (intake) register. UUID is authoritative. code is the org-scoped display reference (REQ-YYYY-######). No seed rows. Sheet Requests are frozen legacy. Issues are derived, not stored.';

comment on column public.fm_requests.code is
  'Organisation-scoped display reference. Generated on create. Immutable after create. May coincide with frozen Sheet-era REQ-* strings; those are not identities here.';

comment on column public.fm_requests.reported_by_profile_id is
  'Platform profile UUID when the reporter is a signed-in person. Null for anonymous portal intake — use reporter_name / reporter_contact.';

comment on column public.fm_requests.created_by_profile_id is
  'Profile that created the Request. Null means anonymous occupant-portal intake.';

-- ---------------------------------------------------------------------------
-- fm_request_incident_links — TRANSITIONAL
-- Incident remains a legacy Sheet domain. incident_ref is an opaque Sheet id,
-- NOT a foreign key. Drop this table when Incidents migrate.
-- ---------------------------------------------------------------------------

create table public.fm_request_incident_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  request_id uuid not null,
  incident_ref text not null,
  linked_by_profile_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_request_incident_links_incident_ref_nonempty
    check (char_length(trim(incident_ref)) > 0),
  constraint fm_request_incident_links_request_fk
    foreign key (organisation_id, request_id)
    references public.fm_requests (organisation_id, id)
    on delete cascade,
  constraint fm_request_incident_links_linked_by_fk
    foreign key (organisation_id, linked_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (linked_by_profile_id)
);

-- One Incident belongs to at most one Request.
create unique index fm_request_incident_links_org_incident_uidx
  on public.fm_request_incident_links (organisation_id, lower(incident_ref));

create index fm_request_incident_links_request_idx
  on public.fm_request_incident_links (organisation_id, request_id);

comment on table public.fm_request_incident_links is
  'TRANSITIONAL Request-to-Incident mapping. incident_ref is an opaque legacy Sheet id (not an FK). Remove at Incident cutover.';

-- ---------------------------------------------------------------------------
-- Work provenance: fm_work.source_request_id replaces opaque source_request_ref.
-- fm_work is empty at cutover; guard refuses to drop data.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from public.fm_work where source_request_ref is not null
  ) then
    raise exception 'fm_work.source_request_ref holds data; refusing to drop';
  end if;
end;
$$;

alter table public.fm_work
  add column source_request_id uuid;

alter table public.fm_work
  add constraint fm_work_source_request_fk
    foreign key (organisation_id, source_request_id)
    references public.fm_requests (organisation_id, id)
    on delete set null (source_request_id);

create index fm_work_org_source_request_idx
  on public.fm_work (organisation_id, source_request_id)
  where source_request_id is not null;

alter table public.fm_work
  drop column source_request_ref;

comment on column public.fm_work.source_request_id is
  'Request that this Work was created from or linked to. Tenant-safe FK to fm_requests. Request maintenanceIds are derived from this column — never stored on the Request.';

-- ---------------------------------------------------------------------------
-- RLS — fail closed. No JWT table grants. No Super Admin bypass.
-- ---------------------------------------------------------------------------

alter table public.fm_requests enable row level security;
alter table public.fm_request_incident_links enable row level security;

revoke all on table public.fm_requests from public, anon, authenticated;
revoke all on table public.fm_request_incident_links from public, anon, authenticated;
grant all on table public.fm_requests to service_role;
grant all on table public.fm_request_incident_links to service_role;
