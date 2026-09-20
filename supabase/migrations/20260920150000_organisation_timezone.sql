-- Organisation timezone: authoritative IANA timezone at organisation level.
--
-- Migration compatibility only: the single existing organisation (PayChex) is set to
-- Africa/Lagos. There is NO column default — every future organisation must state its
-- timezone explicitly (NOT NULL), so an unknown timezone can never be inherited.
-- Unknown timezone is not UTC and is never assumed.

alter table public.organisations
  add column if not exists timezone text;

update public.organisations
set timezone = 'Africa/Lagos'
where slug = 'paychex'
  and timezone is null;

do $$
begin
  if exists (select 1 from public.organisations where timezone is null) then
    raise exception 'organisations without a timezone remain; set an explicit IANA timezone before applying NOT NULL';
  end if;
end $$;

alter table public.organisations
  alter column timezone set not null;

alter table public.organisations
  drop constraint if exists organisations_timezone_nonempty;
alter table public.organisations
  add constraint organisations_timezone_nonempty check (char_length(trim(timezone)) > 0);

-- Validate against the database's IANA timezone catalogue (no hand-maintained list).
create or replace function public.enforce_organisation_timezone()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'organisations.timezone must be a valid IANA timezone identifier (got %)', new.timezone
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists organisations_timezone_valid on public.organisations;
create trigger organisations_timezone_valid
  before insert or update of timezone on public.organisations
  for each row execute function public.enforce_organisation_timezone();

comment on column public.organisations.timezone is
  'Authoritative IANA timezone for the organisation''s operational calendar (e.g. Africa/Lagos). Required; no default.';
