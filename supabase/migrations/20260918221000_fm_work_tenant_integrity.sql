-- Phase 2B follow-up: keep every Work profile and event within its tenant.
-- fm_work is empty at cutover; these constraints add no data migration.

alter table public.fm_work
  drop constraint fm_work_created_by_profile_id_fkey,
  drop constraint fm_work_updated_by_profile_id_fkey;

alter table public.fm_work
  add constraint fm_work_created_by_profile_org_fk
    foreign key (organisation_id, created_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (created_by_profile_id),
  add constraint fm_work_updated_by_profile_org_fk
    foreign key (organisation_id, updated_by_profile_id)
    references public.profiles (organisation_id, id)
    on delete set null (updated_by_profile_id);

create or replace function public.validate_fm_work_event_organisation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.operational_event_id is not null and not exists (
    select 1 from public.operational_events e
    where e.id = new.operational_event_id
      and e.organisation_id = new.organisation_id
  ) then
    raise exception 'Work operational event must belong to the same organisation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger fm_work_event_organisation_guard
before insert or update of operational_event_id, organisation_id on public.fm_work
for each row execute function public.validate_fm_work_event_organisation();
