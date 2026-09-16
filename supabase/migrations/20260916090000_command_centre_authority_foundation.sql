-- Command Centre authority foundation
-- Explicit platform.command_centre.* grants — NOT Super Admin, NOT Finance capabilities.
-- Domain actions (e.g. platform_finance.request.approve) remain separately authorised.

create table public.platform_capability_grants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  capability text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint platform_capability_grants_capability_format
    check (capability ~ '^platform\.command_centre(\.[a-z0-9_]+)+$'),
  constraint platform_capability_grants_unique
    unique (profile_id, organisation_id, capability)
);

create index platform_capability_grants_profile_idx
  on public.platform_capability_grants (profile_id, organisation_id);

comment on table public.platform_capability_grants is
  'Explicit platform-scoped capability grants (Command Centre). Never derived from Super Admin, FM executive role, or Finance capabilities. Does not grant finance_company_access.';

create or replace function public.has_platform_capability(
  p_organisation_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_capability_grants g
    where g.organisation_id = p_organisation_id
      and g.profile_id = auth.uid()
      and g.capability = p_capability
  );
$$;

revoke all on function public.has_platform_capability(uuid, text) from public;
grant execute on function public.has_platform_capability(uuid, text) to authenticated;

alter table public.platform_capability_grants enable row level security;

create policy platform_capability_grants_select on public.platform_capability_grants
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    profile_id = auth.uid()
    or public.is_platform_super_admin()
    or public.can_manage_organisation(organisation_id)
  )
);

create policy platform_capability_grants_insert on public.platform_capability_grants
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and (
    public.is_platform_super_admin()
    or public.can_manage_organisation(organisation_id)
  )
);

create policy platform_capability_grants_delete on public.platform_capability_grants
for delete to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.is_platform_super_admin()
    or public.can_manage_organisation(organisation_id)
  )
);

grant select, insert, delete on table public.platform_capability_grants to authenticated;
grant all on table public.platform_capability_grants to service_role;
