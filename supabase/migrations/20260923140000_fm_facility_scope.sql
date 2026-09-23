-- FM facility scope — WHERE an identity may operate inside Facility Management (capabilities decide WHAT it may do).
--
--   assigned (default) : the facilities of its ACTIVE fm_facility_assignments (plus facility-less FM records in
--                        "All facilities");
--   all                : an explicit organisation-wide facility scope — every active facility plus facility-less FM
--                        records — without assigning the person to each facility individually.
--
-- A sibling of the existing access boundary (access_scope / home_module): a control-plane-only profile field, changed
-- solely through an audited IAM function, never derived from a role, title or capability. Existing profiles default
-- to 'assigned', so nobody's visibility widens by this migration.

alter table public.profiles
  add column if not exists fm_facility_scope text not null default 'assigned';

alter table public.profiles
  drop constraint if exists profiles_fm_facility_scope_valid;
alter table public.profiles
  add constraint profiles_fm_facility_scope_valid check (fm_facility_scope in ('assigned', 'all'));

comment on column public.profiles.fm_facility_scope is
  'assigned | all. FM facility scope (WHERE): assigned = active facility assignments; all = every active facility. Grants no capability. Control-plane only.';

-- Control-plane only (same guard as the other access-boundary fields).
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
     or new.landing_workspace is distinct from old.landing_workspace
     or new.fm_facility_scope is distinct from old.fm_facility_scope then
    raise exception
      'Access-control fields on profiles can only be changed through the platform IAM control plane'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Canonical audited mutation (same authority as the access boundary: platform Super Admin).
create or replace function public.platform_iam_set_fm_facility_scope(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_fm_facility_scope text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  if p_fm_facility_scope not in ('assigned', 'all') then
    raise exception 'platform_iam: FM facility scope must be assigned or all' using errcode = '22023';
  end if;

  select * into v_target from public.profiles where id = p_target_profile_id;
  if not found then
    raise exception 'platform_iam: target profile not found' using errcode = 'P0002';
  end if;
  if v_target.organisation_id is null then
    raise exception 'platform_iam: profile is not attached to an organisation' using errcode = '22023';
  end if;

  if v_target.fm_facility_scope = p_fm_facility_scope then
    return jsonb_build_object(
      'profileId', v_target.id,
      'organisationId', v_target.organisation_id,
      'fmFacilityScope', v_target.fm_facility_scope,
      'changed', false
    );
  end if;

  perform set_config('sentracore.bypass_profile_acl', 'on', true);
  update public.profiles
  set fm_facility_scope = p_fm_facility_scope,
      updated_at = timezone('utc', now())
  where id = p_target_profile_id;

  perform public.platform_iam_insert_audit_event(
    v_target.organisation_id,
    p_actor_profile_id,
    'fm_facility_scope.changed',
    'profile',
    p_target_profile_id::text,
    jsonb_build_object(
      'previousFmFacilityScope', v_target.fm_facility_scope,
      'fmFacilityScope', p_fm_facility_scope
    )
  );

  return jsonb_build_object(
    'profileId', p_target_profile_id,
    'organisationId', v_target.organisation_id,
    'fmFacilityScope', p_fm_facility_scope,
    'changed', true
  );
end;
$$;

revoke all on function public.platform_iam_set_fm_facility_scope(uuid, uuid, text) from public;
revoke all on function public.platform_iam_set_fm_facility_scope(uuid, uuid, text) from anon, authenticated;
grant execute on function public.platform_iam_set_fm_facility_scope(uuid, uuid, text) to service_role;
