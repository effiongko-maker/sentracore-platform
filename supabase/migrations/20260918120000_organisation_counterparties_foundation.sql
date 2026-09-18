-- Phase 2F-A: organisational Counterparty foundation (not Finance-only CRM).
-- Minimal identity for invoicing; future customer+vendor roles without duplicate identities.
-- No FM vendor migration. No tax engine. Tax registration id is optional identity only.

create table public.organisation_counterparties (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  display_name text not null,
  legal_name text,
  party_kind text not null default 'organisation',
  tax_registration_id text,
  status text not null default 'active',
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  updated_by_profile_id uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint organisation_counterparties_display_name_nonempty
    check (char_length(trim(display_name)) > 0),
  constraint organisation_counterparties_party_kind_check
    check (party_kind in ('organisation', 'person')),
  constraint organisation_counterparties_status_check
    check (status in ('active', 'inactive')),
  constraint organisation_counterparties_org_display_unique
    unique (organisation_id, display_name)
);

create index organisation_counterparties_org_status_idx
  on public.organisation_counterparties (organisation_id, status);

create trigger organisation_counterparties_set_updated_at
before update on public.organisation_counterparties
for each row execute function public.set_updated_at();

comment on table public.organisation_counterparties is
  'Organisation-scoped counterparty master. Consumed by Finance (and later other modules). '
  'Not a Platform-Finance-only customer table. tax_registration_id is optional identity — not a tax engine.';

create table public.organisation_counterparty_roles (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  counterparty_id uuid not null references public.organisation_counterparties (id) on delete cascade,
  role text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint organisation_counterparty_roles_role_check
    check (role in ('customer', 'vendor', 'related_party')),
  constraint organisation_counterparty_roles_unique
    unique (counterparty_id, role)
);

create index organisation_counterparty_roles_org_role_idx
  on public.organisation_counterparty_roles (organisation_id, role);

create or replace function public.organisation_counterparty_roles_align_org()
returns trigger
language plpgsql
as $$
declare
  v_org uuid;
begin
  select organisation_id into v_org
  from public.organisation_counterparties
  where id = new.counterparty_id;
  if v_org is null then
    raise exception 'counterparty role: counterparty not found';
  end if;
  new.organisation_id := v_org;
  return new;
end;
$$;

create trigger organisation_counterparty_roles_align_org
before insert or update of counterparty_id on public.organisation_counterparty_roles
for each row execute function public.organisation_counterparty_roles_align_org();

-- Atomic server primitives. Capability grants are explicit: platform super-admin
-- status does not confer business authority.
create or replace function public.organisation_counterparty_create(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_display_name text,
  p_legal_name text,
  p_party_kind text,
  p_tax_registration_id text,
  p_status text,
  p_roles text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role text;
begin
  if not public.finance_payable_actor_has_capability(
    p_organisation_id, p_actor_profile_id, 'platform_finance.counterparty.manage'
  ) then
    raise exception 'counterparty: missing manage authority';
  end if;
  if coalesce(array_length(p_roles, 1), 0) < 1 then
    raise exception 'counterparty: at least one role is required';
  end if;

  insert into public.organisation_counterparties (
    organisation_id, display_name, legal_name, party_kind,
    tax_registration_id, status, created_by_profile_id, updated_by_profile_id
  ) values (
    p_organisation_id, trim(p_display_name), nullif(trim(p_legal_name), ''),
    p_party_kind, nullif(trim(p_tax_registration_id), ''), p_status,
    p_actor_profile_id, p_actor_profile_id
  ) returning id into v_id;

  foreach v_role in array p_roles loop
    insert into public.organisation_counterparty_roles (
      organisation_id, counterparty_id, role
    ) values (p_organisation_id, v_id, v_role);
  end loop;
  return v_id;
end;
$$;

create or replace function public.organisation_counterparty_update(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_counterparty_id uuid,
  p_display_name text,
  p_legal_name text,
  p_party_kind text,
  p_tax_registration_id text,
  p_status text,
  p_roles text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if not public.finance_payable_actor_has_capability(
    p_organisation_id, p_actor_profile_id, 'platform_finance.counterparty.manage'
  ) then
    raise exception 'counterparty: missing manage authority';
  end if;
  if coalesce(array_length(p_roles, 1), 0) < 1 then
    raise exception 'counterparty: at least one role is required';
  end if;

  update public.organisation_counterparties set
    display_name = trim(p_display_name),
    legal_name = nullif(trim(p_legal_name), ''),
    party_kind = p_party_kind,
    tax_registration_id = nullif(trim(p_tax_registration_id), ''),
    status = p_status,
    updated_by_profile_id = p_actor_profile_id
  where id = p_counterparty_id and organisation_id = p_organisation_id;
  if not found then raise exception 'counterparty: not found'; end if;

  delete from public.organisation_counterparty_roles
  where counterparty_id = p_counterparty_id;
  foreach v_role in array p_roles loop
    insert into public.organisation_counterparty_roles (
      organisation_id, counterparty_id, role
    ) values (p_organisation_id, p_counterparty_id, v_role);
  end loop;
  return p_counterparty_id;
end;
$$;

revoke all on function public.organisation_counterparty_create(uuid, uuid, text, text, text, text, text, text[]) from public, anon, authenticated;
revoke all on function public.organisation_counterparty_update(uuid, uuid, uuid, text, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.organisation_counterparty_create(uuid, uuid, text, text, text, text, text, text[]) to service_role;
grant execute on function public.organisation_counterparty_update(uuid, uuid, uuid, text, text, text, text, text, text[]) to service_role;

-- Capabilities
insert into public.finance_capability_grants (organisation_id, profile_id, capability)
select organisation_id, profile_id, 'platform_finance.counterparty.view'
from public.finance_capability_grants
where capability = 'platform_finance.view'
on conflict (profile_id, organisation_id, capability) do nothing;

insert into public.finance_capability_grants (organisation_id, profile_id, capability)
select organisation_id, profile_id, 'platform_finance.counterparty.manage'
from public.finance_capability_grants
where capability = 'platform_finance.manage_setup'
on conflict (profile_id, organisation_id, capability) do nothing;

alter table public.organisation_counterparties enable row level security;
alter table public.organisation_counterparty_roles enable row level security;

create policy organisation_counterparties_select on public.organisation_counterparties
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.counterparty.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
  )
);

create policy organisation_counterparties_insert on public.organisation_counterparties
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
  and created_by_profile_id = auth.uid()
);

create policy organisation_counterparties_update on public.organisation_counterparties
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
)
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
);

create policy organisation_counterparty_roles_select on public.organisation_counterparty_roles
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.counterparty.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
  )
);

create policy organisation_counterparty_roles_insert on public.organisation_counterparty_roles
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
);

create policy organisation_counterparty_roles_delete on public.organisation_counterparty_roles
for delete to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
);

grant select, insert, update on table public.organisation_counterparties to authenticated;
grant select, insert, delete on table public.organisation_counterparty_roles to authenticated;
grant all on table public.organisation_counterparties to service_role;
grant all on table public.organisation_counterparty_roles to service_role;
