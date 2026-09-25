-- FM Generator Log — Diesel Used is ONE total per site per date for all generators (operator clarification).
--
-- In the source Generator Log, when several generators have readings on a date, "Diesel Used" is the total diesel
-- consumed that date; its placement on one generator's row does NOT attribute it to that generator. SentraCore keeps each
-- generator's own hour-meter readings per row, and treats fuel_used as the date total, carried by at most ONE log of the
-- site and date. NULL stays "not recorded" (never 0).
--
-- Site: FM runs two facilities (NCC Annex, CSIRT), so the total is keyed by facility + date, not organisation + date.
-- The facility is never typed or guessed: it is the facility of the log's governed generator asset (asset_id — the
-- reviewed alias "Gen 1"/"Gen 2" ⇒ 1000KVA (GEN 1)/(GEN 2), registered at FAC-0001 NCC Annex). The composite fk makes a
-- log's facility always equal its asset's facility. A log with no asset (today: operator-entered logs, which name the
-- generator as text) has facility NULL = site not recorded; its date total may not coexist with any other total on
-- that date (guard below), so an unknown site can never double-count a known site's total.
--
-- Live data (checked read-only): 67 logs, all 67 asset-linked to FAC-0001 assets; 34 dates, 0 with more than one total.

alter table public.fm_generator_logs add column facility_id uuid;

alter table public.fm_generator_logs
  add constraint fm_generator_logs_facility_fk foreign key (organisation_id, facility_id)
    references public.fm_facilities (organisation_id, id) on delete restrict,
  add constraint fm_generator_logs_asset_facility_fk foreign key (organisation_id, asset_id, facility_id)
    references public.fm_assets (organisation_id, id, facility_id) on update cascade;

-- Backfill from the governed asset link only (no other evidence is used).
update public.fm_generator_logs g
   set facility_id = a.facility_id
  from public.fm_assets a
 where a.organisation_id = g.organisation_id and a.id = g.asset_id and g.facility_id is null;

alter table public.fm_generator_logs
  add constraint fm_generator_logs_asset_has_facility check (asset_id is null or facility_id is not null);

create unique index fm_generator_logs_one_daily_diesel_total
  on public.fm_generator_logs (organisation_id, facility_id, log_date) nulls not distinct
  where fuel_used is not null;

create function public.fm_generator_logs_unknown_site_diesel_guard() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.fuel_used is not null and exists (
    select 1 from public.fm_generator_logs o
     where o.organisation_id = new.organisation_id and o.log_date = new.log_date and o.fuel_used is not null
       and o.id <> new.id and (o.facility_id is null or new.facility_id is null)
  ) then
    raise exception 'duplicate key value violates unique constraint "fm_generator_logs_one_daily_diesel_total"'
      using errcode = '23505', constraint = 'fm_generator_logs_one_daily_diesel_total',
            detail = 'A diesel total whose site is not recorded cannot coexist with another total on the same date.';
  end if;
  return new;
end $$;

create trigger fm_generator_logs_unknown_site_diesel_guard
  before insert or update of fuel_used, facility_id, log_date on public.fm_generator_logs
  for each row execute function public.fm_generator_logs_unknown_site_diesel_guard();

comment on column public.fm_generator_logs.facility_id is
  'Site of the log = the facility of its generator asset (enforced by fk). NULL = site not recorded (no asset linked).';
comment on column public.fm_generator_logs.fuel_used is
  'Diesel used on log_date by ALL generators of the site (the site''s date total), recorded on at most one log of that site and date — never this generator''s own consumption. NULL = not recorded (never 0).';
