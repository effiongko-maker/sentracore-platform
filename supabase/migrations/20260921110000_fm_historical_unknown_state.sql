-- FM historical unknown state (LOCAL — not applied to any remote database in this phase).
--
-- Removes the last schema-forced FALSE FACTS from the historical migration: a migrated historical Incident whose
-- source states no status / severity, and a migrated historical Work / Work Instruction whose source states no
-- priority, must be representable as UNKNOWN rather than as `reported` / `medium`.
--
-- Same boundary philosophy as 20260921100000: every relaxation is gated on record_origin = 'migrated_historical'.
-- Rows created through the product keep the default record_origin = 'operational' and therefore keep every
-- existing validation. `unknown` is never a product-selectable value.

-- ---------------------------------------------------------------------------
-- 1. fm_incidents: add the explicit historical-origin discriminator (incidents had none)
-- ---------------------------------------------------------------------------

alter table public.fm_incidents
  add column record_origin text not null default 'operational';

alter table public.fm_incidents
  add constraint fm_incidents_record_origin_check
    check (record_origin in ('operational', 'migrated_historical'));

create trigger fm_incidents_record_origin_immutable
before update on public.fm_incidents
for each row execute function public.fm_prevent_record_origin_change();

comment on column public.fm_incidents.record_origin is
  'operational (default; strict validation) | migrated_historical (explicit migration: status / severity may be unknown). Immutable.';

alter table public.fm_incidents drop constraint fm_incidents_status_check;
alter table public.fm_incidents
  add constraint fm_incidents_status_check
    check (status in ('reported', 'triaged', 'investigating', 'contained', 'resolved', 'closed', 'cancelled', 'unknown'));

alter table public.fm_incidents
  add constraint fm_incidents_unknown_status_historical_only
    check (status <> 'unknown' or record_origin = 'migrated_historical');

alter table public.fm_incidents drop constraint fm_incidents_severity_check;
alter table public.fm_incidents
  add constraint fm_incidents_severity_check
    check (severity in ('low', 'medium', 'high', 'critical', 'unknown'));

alter table public.fm_incidents
  add constraint fm_incidents_unknown_severity_historical_only
    check (severity <> 'unknown' or record_origin = 'migrated_historical');

comment on column public.fm_incidents.status is
  'unknown = historical record whose lifecycle is not stated by the source. It is NOT reported/open and NOT resolved.';
comment on column public.fm_incidents.severity is
  'unknown = historical record whose severity is not stated by the source. It is NOT medium.';

-- ---------------------------------------------------------------------------
-- 2. fm_work: unknown priority, historical only (record_origin already exists)
-- ---------------------------------------------------------------------------

alter table public.fm_work drop constraint fm_work_priority_check;
alter table public.fm_work
  add constraint fm_work_priority_check
    check (priority in ('low', 'medium', 'high', 'critical', 'unknown'));

alter table public.fm_work
  add constraint fm_work_unknown_priority_historical_only
    check (priority <> 'unknown' or record_origin = 'migrated_historical');

comment on column public.fm_work.priority is
  'unknown = historical record whose priority is not stated by the source. It is NOT medium.';

-- ---------------------------------------------------------------------------
-- 3. fm_work_instructions: unknown priority, historical only
-- ---------------------------------------------------------------------------

alter table public.fm_work_instructions drop constraint fm_work_instructions_priority_check;
alter table public.fm_work_instructions
  add constraint fm_work_instructions_priority_check
    check (priority in ('low', 'medium', 'high', 'critical', 'unknown'));

alter table public.fm_work_instructions
  add constraint fm_work_instructions_unknown_priority_historical_only
    check (priority <> 'unknown' or record_origin = 'migrated_historical');

comment on column public.fm_work_instructions.priority is
  'unknown = historical record whose priority is not stated by the source. It is NOT medium.';
