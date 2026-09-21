-- Platform Finance as a module-bound home workspace (additive widening; no data change).
--
-- Module-bound identities may now be bound to Platform Finance. The home workspace is an access BOUNDARY and a
-- default destination — it grants NO capability and NO company access. Platform Finance authority remains the
-- explicit platform_finance.* grants (finance_capability_grants) plus finance_company_access, unchanged.
--
-- Valid module homes after this migration: facility_management | ecc_operations | platform_finance.
-- Command Centre is a platform-scope landing workspace; Admin Console and Batcave are authority-derived — none of
-- these is ever a module-bound home.
-- Source of truth in code: src/lib/access/workspaceRegistry.ts (verified against this constraint by
-- scripts/verify-home-workspaces.mts).

alter table public.profiles
  drop constraint if exists profiles_access_scope_valid;
alter table public.profiles
  add constraint profiles_access_scope_valid check (
    (access_scope = 'platform' and home_module is null)
    or (access_scope = 'module' and home_module in ('facility_management', 'ecc_operations', 'platform_finance'))
  );

comment on column public.profiles.home_module is
  'Required (facility_management | ecc_operations | platform_finance) when access_scope = module; NULL for platform scope. A boundary and default destination, never authority.';

create or replace function public.platform_iam_set_access_scope(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_access_scope text,
  p_home_module text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_home text;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  if p_access_scope not in ('platform', 'module') then
    raise exception 'platform_iam: access scope must be platform or module' using errcode = '22023';
  end if;

  v_home := nullif(trim(coalesce(p_home_module, '')), '');

  if p_access_scope = 'module' then
    if v_home is null or v_home not in ('facility_management', 'ecc_operations', 'platform_finance') then
      raise exception 'platform_iam: a module-bound identity requires a supported home module' using errcode = '22023';
    end if;
  elsif v_home is not null then
    raise exception 'platform_iam: platform scope must not carry a home module' using errcode = '22023';
  end if;

  select * into v_target from public.profiles where id = p_target_profile_id;
  if not found then
    raise exception 'platform_iam: target profile not found' using errcode = 'P0002';
  end if;
  if v_target.organisation_id is null then
    raise exception 'platform_iam: profile is not attached to an organisation' using errcode = '22023';
  end if;

  -- Super Admin is platform administration authority and is never module-bound.
  if p_access_scope = 'module' and exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id
    where ura.profile_id = p_target_profile_id
      and r.slug = 'platform_super_admin'
      and r.status = 'active'
  ) then
    raise exception 'platform_iam: a Platform Super Admin cannot be module-bound' using errcode = '42501';
  end if;

  if v_target.access_scope = p_access_scope and v_target.home_module is not distinct from v_home then
    return jsonb_build_object(
      'profileId', v_target.id,
      'organisationId', v_target.organisation_id,
      'accessScope', v_target.access_scope,
      'homeModule', v_target.home_module,
      'changed', false
    );
  end if;

  perform set_config('sentracore.bypass_profile_acl', 'on', true);
  update public.profiles
  set access_scope = p_access_scope,
      home_module = v_home,
      updated_at = timezone('utc', now())
  where id = p_target_profile_id;

  perform public.platform_iam_insert_audit_event(
    v_target.organisation_id,
    p_actor_profile_id,
    'access_scope.changed',
    'profile',
    p_target_profile_id::text,
    jsonb_build_object(
      'previousAccessScope', v_target.access_scope,
      'previousHomeModule', v_target.home_module,
      'accessScope', p_access_scope,
      'homeModule', v_home
    )
  );

  return jsonb_build_object(
    'profileId', p_target_profile_id,
    'organisationId', v_target.organisation_id,
    'accessScope', p_access_scope,
    'homeModule', v_home,
    'changed', true
  );
end;
$$;

revoke all on function public.platform_iam_set_access_scope(uuid, uuid, text, text) from public;
revoke all on function public.platform_iam_set_access_scope(uuid, uuid, text, text) from anon, authenticated;
grant execute on function public.platform_iam_set_access_scope(uuid, uuid, text, text) to service_role;
