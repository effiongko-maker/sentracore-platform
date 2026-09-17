-- Durable organisation-scoped bridge from authenticated profiles to external
-- operational identities. Identity linkage is not an authority grant.

create table public.operational_identity_links (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  identity_domain text not null,
  external_identity_id text not null,
  status text not null default 'active',
  linked_by_profile_id uuid references public.profiles (id) on delete set null,
  linked_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint operational_identity_links_domain
    check (identity_domain in ('facility_management')),
  constraint operational_identity_links_status
    check (status in ('active', 'inactive')),
  constraint operational_identity_links_external_id
    check (
      identity_domain <> 'facility_management'
      or external_identity_id ~ '^USR-[0-9]{4,}$'
    ),
  constraint operational_identity_links_profile_unique
    unique (organisation_id, profile_id, identity_domain),
  constraint operational_identity_links_external_unique
    unique (organisation_id, identity_domain, external_identity_id)
);

create index operational_identity_links_profile_idx
  on public.operational_identity_links (profile_id, organisation_id, identity_domain);

comment on table public.operational_identity_links is
  'Identity-only bridge from a platform profile to an external operational identity. Never grants module access, roles, or capabilities.';

alter table public.operational_identity_links enable row level security;

create policy operational_identity_links_select on public.operational_identity_links
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    profile_id = auth.uid()
    or public.is_platform_super_admin()
    or public.can_manage_organisation(organisation_id)
  )
);

grant select on table public.operational_identity_links to authenticated;
grant all on table public.operational_identity_links to service_role;

create or replace function public.provision_operational_identity_link(
  p_profile_id uuid,
  p_organisation_id uuid,
  p_identity_domain text,
  p_external_identity_id text,
  p_linked_by_profile_id uuid default null,
  p_status text default 'active'
)
returns public.operational_identity_links
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.operational_identity_links%rowtype;
begin
  if p_identity_domain <> 'facility_management' then
    raise exception 'Unsupported identity domain: %', p_identity_domain using errcode = '22023';
  end if;
  if trim(p_external_identity_id) !~ '^USR-[0-9]{4,}$' then
    raise exception 'Invalid Facility Management identity: %', p_external_identity_id using errcode = '22023';
  end if;
  if p_status not in ('active', 'inactive') then
    raise exception 'Invalid identity link status: %', p_status using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile_id and p.organisation_id = p_organisation_id
  ) then
    raise exception 'Profile is not attached to the requested organisation' using errcode = '42501';
  end if;
  if p_linked_by_profile_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = p_linked_by_profile_id
      and p.organisation_id = p_organisation_id
  ) then
    raise exception 'Linking profile is not eligible for the requested organisation' using errcode = '42501';
  end if;

  insert into public.operational_identity_links (
    organisation_id, profile_id, identity_domain, external_identity_id,
    status, linked_by_profile_id
  ) values (
    p_organisation_id, p_profile_id, p_identity_domain,
    upper(trim(p_external_identity_id)), p_status, p_linked_by_profile_id
  )
  on conflict (organisation_id, profile_id, identity_domain)
  do update set
    external_identity_id = excluded.external_identity_id,
    status = excluded.status,
    linked_by_profile_id = excluded.linked_by_profile_id,
    linked_at = case
      when public.operational_identity_links.external_identity_id <> excluded.external_identity_id
        then timezone('utc', now())
      else public.operational_identity_links.linked_at
    end,
    updated_at = timezone('utc', now())
  returning * into v_link;

  return v_link;
end;
$$;

revoke all on function public.provision_operational_identity_link(
  uuid, uuid, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.provision_operational_identity_link(
  uuid, uuid, text, text, uuid, text
) to service_role;

comment on function public.provision_operational_identity_link(
  uuid, uuid, text, text, uuid, text
) is 'Service-role provisioning for operational identity links. Does not grant authorization.';
