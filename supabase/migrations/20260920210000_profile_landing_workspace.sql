-- Landing workspace: a UX ROUTING PREFERENCE for platform-scope identities.
--   ACCESS BOUNDARY  (access_scope / home_module) = where an identity may operate.
--   LANDING WORKSPACE (landing_workspace)         = where a platform-scope identity prefers to begin.
-- It is NOT authority: it grants no capability, enables no module and never bypasses a gate.
-- NULL (every existing profile) means the normal Platform Home. Module-bound identities always
-- land in their home_module and cannot carry a landing preference.

alter table public.profiles
  add column if not exists landing_workspace text;

alter table public.profiles
  drop constraint if exists profiles_landing_workspace_valid;
alter table public.profiles
  add constraint profiles_landing_workspace_valid check (
    landing_workspace is null
    or landing_workspace in ('command_centre', 'facility_management', 'ecc_operations', 'platform_finance')
  );

alter table public.profiles
  drop constraint if exists profiles_landing_workspace_platform_scope_only;
alter table public.profiles
  add constraint profiles_landing_workspace_platform_scope_only check (
    landing_workspace is null or access_scope = 'platform'
  );

comment on column public.profiles.landing_workspace is
  'Optional landing preference for platform-scope identities: command_centre | facility_management | ecc_operations | platform_finance. NULL = Platform Home. UX routing only — never authority.';

-- A module-bound identity carries no landing preference: switching to module scope clears it.
create or replace function public.profiles_clear_landing_when_module_bound()
returns trigger
language plpgsql
as $$
begin
  if new.access_scope = 'module' then
    new.landing_workspace := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_clear_landing_when_module_bound on public.profiles;
create trigger profiles_clear_landing_when_module_bound
before insert or update on public.profiles
for each row execute function public.profiles_clear_landing_when_module_bound();

-- Control-plane only (no direct JWT edits).
create or replace function public.enforce_profile_update_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('sentracore.bypass_profile_acl', true) = 'on' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.organisation_id is distinct from old.organisation_id
     or new.status is distinct from old.status
     or new.created_at is distinct from old.created_at
     or new.access_scope is distinct from old.access_scope
     or new.home_module is distinct from old.home_module
     or new.landing_workspace is distinct from old.landing_workspace then
    raise exception
      'Access-control fields on profiles can only be changed through the platform IAM control plane'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.platform_iam_set_landing_workspace(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_landing_workspace text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_landing text;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  v_landing := nullif(trim(coalesce(p_landing_workspace, '')), '');
  if v_landing is not null
     and v_landing not in ('command_centre', 'facility_management', 'ecc_operations', 'platform_finance') then
    raise exception 'platform_iam: unsupported landing workspace' using errcode = '22023';
  end if;

  select * into v_target from public.profiles where id = p_target_profile_id;
  if not found then
    raise exception 'platform_iam: target profile not found' using errcode = 'P0002';
  end if;
  if v_target.organisation_id is null then
    raise exception 'platform_iam: profile is not attached to an organisation' using errcode = '22023';
  end if;
  if v_target.access_scope <> 'platform' and v_landing is not null then
    raise exception 'platform_iam: module-bound identities land in their home module and cannot carry a landing workspace'
      using errcode = '22023';
  end if;

  if v_target.landing_workspace is not distinct from v_landing then
    return jsonb_build_object(
      'profileId', v_target.id,
      'organisationId', v_target.organisation_id,
      'landingWorkspace', v_target.landing_workspace,
      'changed', false
    );
  end if;

  perform set_config('sentracore.bypass_profile_acl', 'on', true);
  update public.profiles
  set landing_workspace = v_landing,
      updated_at = timezone('utc', now())
  where id = p_target_profile_id;

  perform public.platform_iam_insert_audit_event(
    v_target.organisation_id,
    p_actor_profile_id,
    'landing_workspace.changed',
    'profile',
    p_target_profile_id::text,
    jsonb_build_object(
      'previousLandingWorkspace', v_target.landing_workspace,
      'landingWorkspace', v_landing
    )
  );

  return jsonb_build_object(
    'profileId', p_target_profile_id,
    'organisationId', v_target.organisation_id,
    'landingWorkspace', v_landing,
    'changed', true
  );
end;
$$;

revoke all on function public.platform_iam_set_landing_workspace(uuid, uuid, text) from public;
revoke all on function public.platform_iam_set_landing_workspace(uuid, uuid, text) from anon, authenticated;
grant execute on function public.platform_iam_set_landing_workspace(uuid, uuid, text) to service_role;
