-- Multi-facility Work scope — additive only.
--
-- fm_work.facility_id remains NOT NULL (existing architecture requirement; unchanged, no data rewritten). For
-- genuinely multi-facility historical work (e.g. "CSIRT/Annex" diesel supply, generator servicing), this table
-- is the authoritative record of EVERY facility the Work covers, including the one already in facility_id.
-- Never used to split or duplicate commercial value — that stays on the single Work/Cost row.

create table public.fm_work_facilities (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  work_id uuid not null,
  facility_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint fm_work_facilities_work_fk
    foreign key (organisation_id, work_id)
    references public.fm_work (organisation_id, id) on delete cascade,
  constraint fm_work_facilities_facility_fk
    foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict
);

create unique index fm_work_facilities_uidx
  on public.fm_work_facilities (organisation_id, work_id, facility_id);
create index fm_work_facilities_facility_idx
  on public.fm_work_facilities (organisation_id, facility_id);

comment on table public.fm_work_facilities is
  'Additional facilities a Work genuinely covers, beyond fm_work.facility_id (which remains the required, structurally-primary facility). Never implies split cost/commercial value.';

alter table public.fm_work_facilities enable row level security;
revoke all on table public.fm_work_facilities from public, anon, authenticated;
grant all on table public.fm_work_facilities to service_role;
