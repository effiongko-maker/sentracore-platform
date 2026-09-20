-- 1. Module-bound platform identities (access scope) — an ACCESS-SCOPE concept, not employment status.
--      access_scope = 'platform' : normal platform participation (home_module must be NULL)
--      access_scope = 'module'   : authenticated identity whose operational experience is one home module
--    Module-bound scope is an UPPER BOUNDARY; capabilities still decide actions inside the module.
--    Existing profiles default to 'platform' (no behaviour change). No job-role or capability inference.
-- 2. ECC Issue hard-delete: allow the append-only history to be removed ONLY as a cascade of its parent Issue.

-- ---------------------------------------------------------------------------
-- 1a. Columns + constraint
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists access_scope text not null default 'platform',
  add column if not exists home_module text;

alter table public.profiles
  drop constraint if exists profiles_access_scope_valid;
alter table public.profiles
  add constraint profiles_access_scope_valid check (
    (access_scope = 'platform' and home_module is null)
    or (access_scope = 'module' and home_module in ('facility_management', 'ecc_operations'))
  );

comment on column public.profiles.access_scope is
  'platform | module. Module-bound identities are restricted to home_module regardless of any capability grant. Not employment status; not derived from operational role.';
comment on column public.profiles.home_module is
  'Required (facility_management | ecc_operations) when access_scope = module; NULL for platform scope.';

-- ---------------------------------------------------------------------------
-- 1b. Access-scope fields are control-plane only (no direct JWT edits)
-- ---------------------------------------------------------------------------

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
     or new.home_module is distinct from old.home_module then
    raise exception
      'Access-control fields on profiles can only be changed through the platform IAM control plane'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1c. Canonical audited mutation
-- ---------------------------------------------------------------------------

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
    if v_home is null or v_home not in ('facility_management', 'ecc_operations') then
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

-- Invariant from the other side: a module-bound profile can never be given Super Admin.
create or replace function public.enforce_super_admin_not_module_bound()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.roles r where r.id = new.role_id and r.slug = 'platform_super_admin'
  ) and exists (
    select 1 from public.profiles p where p.id = new.profile_id and p.access_scope = 'module'
  ) then
    raise exception 'a module-bound profile cannot hold the platform_super_admin role' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists user_role_assignments_super_admin_not_module_bound on public.user_role_assignments;
create trigger user_role_assignments_super_admin_not_module_bound
  before insert or update of role_id, profile_id on public.user_role_assignments
  for each row execute function public.enforce_super_admin_not_module_bound();

-- ---------------------------------------------------------------------------
-- 2. ECC Issue hard-delete vs append-only history
--    The cascade from ecc_issues → ecc_issue_history fired the append-only trigger, so deleting any
--    Issue that has history always failed. Direct history deletes and every update stay blocked; only a
--    delete that runs as a CASCADE of its parent (trigger depth > 1) is permitted.
-- ---------------------------------------------------------------------------

create or replace function public.ecc_issue_history_reject_mutate()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'ecc_issue_history is append-only';
end;
$$;
