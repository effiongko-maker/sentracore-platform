-- Platform IAM control-plane hardening (Admin Console V1, Phase A).
--
-- Reconnaissance + live policy inspection found that authenticated JWT clients
-- (anon key + own session) could mutate administrative authority DIRECTLY,
-- outside the audited platform_iam_* control plane:
--   * profiles: organisation_id / status  (guardrail trigger passed org managers)
--   * platform_capability_grants: INSERT / DELETE  (org managers)
--   * organisation_modules: ALL  (org managers)
--   * user_role_assignments: INSERT / UPDATE / DELETE  (org managers)
--   * organisations: INSERT / UPDATE / DELETE  (managers / super admin)
-- The application never writes these tables with a user JWT (verified: every
-- write goes through service_role or SECURITY DEFINER RPCs), so closing these
-- paths changes no legitimate behaviour. Reads (SELECT policies) are untouched.
--
-- Also: facility-assignment administration (assign / role / active) becomes
-- part of the platform IAM audit trail, atomically with the mutation.

-- ---------------------------------------------------------------------------
-- 1. Profile access-control fields: only the privileged, transaction-local
--    bypass (set inside SECURITY DEFINER platform_iam_* / bootstrap functions)
--    may change id / organisation_id / status / created_at. No role-based
--    pass-through (org manager, super admin JWT) remains.
-- ---------------------------------------------------------------------------

create or replace function public.enforce_profile_update_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Set only inside SECURITY DEFINER control-plane functions (transaction-local).
  if current_setting('sentracore.bypass_profile_acl', true) = 'on' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.organisation_id is distinct from old.organisation_id
     or new.status is distinct from old.status
     or new.created_at is distinct from old.created_at then
    raise exception
      'Access-control fields on profiles can only be changed through the platform IAM control plane'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_profile_update_guardrails() is
  'Blocks updates to organisation_id/status/id/created_at unless inside a platform IAM / bootstrap control-plane function (sentracore.bypass_profile_acl). No role-based pass-through.';

-- ---------------------------------------------------------------------------
-- 2. Close direct JWT writes to administrative authority tables.
-- ---------------------------------------------------------------------------

drop policy if exists platform_capability_grants_insert on public.platform_capability_grants;
drop policy if exists platform_capability_grants_delete on public.platform_capability_grants;
drop policy if exists organisation_modules_write_managers on public.organisation_modules;
drop policy if exists user_role_assignments_insert on public.user_role_assignments;
drop policy if exists user_role_assignments_update on public.user_role_assignments;
drop policy if exists user_role_assignments_delete on public.user_role_assignments;
drop policy if exists organisations_insert_super_admin on public.organisations;
drop policy if exists organisations_update_managers on public.organisations;
drop policy if exists organisations_delete_super_admin on public.organisations;

revoke insert, update, delete, truncate
  on public.platform_capability_grants,
     public.organisation_modules,
     public.user_role_assignments,
     public.organisations
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Facility-assignment administration is audited (platform_iam_audit_events).
--    Actor = the profile that made the change (created_by / updated_by, always
--    supplied by the FM People service and the offboarding function). Operational
--    role is recorded as context only — it is not authority.
-- ---------------------------------------------------------------------------

create or replace function public.audit_fm_facility_assignment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_action text;
  v_details jsonb;
begin
  if tg_op = 'INSERT' then
    v_actor := new.created_by_profile_id;
    v_action := 'facility_assignment.created';
    v_details := jsonb_build_object(
      'profileId', new.profile_id,
      'facilityId', new.facility_id,
      'operationalRole', new.operational_role,
      'status', new.status
    );
  else
    if new.status is not distinct from old.status
       and new.operational_role is not distinct from old.operational_role
       and new.facility_id is not distinct from old.facility_id then
      return new;
    end if;
    v_actor := new.updated_by_profile_id;
    v_action := case
      when new.status is distinct from old.status and new.status = 'inactive' then 'facility_assignment.deactivated'
      when new.status is distinct from old.status then 'facility_assignment.activated'
      when new.operational_role is distinct from old.operational_role then 'facility_assignment.role_changed'
      else 'facility_assignment.facility_changed'
    end;
    v_details := jsonb_build_object(
      'profileId', new.profile_id,
      'facilityId', new.facility_id,
      'previousFacilityId', old.facility_id,
      'previousOperationalRole', old.operational_role,
      'operationalRole', new.operational_role,
      'previousStatus', old.status,
      'status', new.status
    );
  end if;

  if v_actor is null then
    -- An unattributed change cannot be audited; refuse rather than leave a gap.
    raise exception 'platform_iam: facility assignment changes must name the acting profile'
      using errcode = '23514';
  end if;

  perform public.platform_iam_insert_audit_event(
    new.organisation_id,
    v_actor,
    v_action,
    'fm_facility_assignment',
    new.id::text,
    v_details
  );
  return new;
end;
$$;

revoke all on function public.audit_fm_facility_assignment_change() from public, anon, authenticated;

create trigger fm_facility_assignments_audit
after insert or update on public.fm_facility_assignments
for each row execute function public.audit_fm_facility_assignment_change();

comment on trigger fm_facility_assignments_audit on public.fm_facility_assignments is
  'Every assignment create / role / status / facility change writes a platform_iam_audit_events row (atomic). operational_role is context, not authority.';

comment on table public.platform_iam_audit_events is
  'Append-only platform administration / identity / access audit. Actions: user.invited, profile.attached_to_organisation, profile.activated, profile.suspended, profile.deactivated, module.enabled, module.disabled, capability.granted, capability.revoked, user.offboarded, facility_assignment.created, facility_assignment.activated, facility_assignment.deactivated, facility_assignment.role_changed, facility_assignment.facility_changed.';
