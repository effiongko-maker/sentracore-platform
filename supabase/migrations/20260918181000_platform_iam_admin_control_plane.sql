-- Platform administration / IAM control plane.
-- Distinct from finance_audit_events and ecc_audit_events.
-- Mutations are service_role SECURITY DEFINER; authenticated cannot forge events.
-- Super Admin is administration authority only — these functions never grant
-- Finance / ECC / Command Centre / company / restricted-FA access automatically.

-- ---------------------------------------------------------------------------
-- Audit substrate
-- ---------------------------------------------------------------------------

create table public.platform_iam_audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid references public.organisations (id) on delete restrict,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  object_type text not null,
  object_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint platform_iam_audit_events_action_nonempty
    check (char_length(trim(action)) > 0),
  constraint platform_iam_audit_events_object_type_nonempty
    check (char_length(trim(object_type)) > 0),
  constraint platform_iam_audit_events_object_id_nonempty
    check (char_length(trim(object_id)) > 0)
);

create index platform_iam_audit_events_org_created_idx
  on public.platform_iam_audit_events (organisation_id, created_at desc);

create index platform_iam_audit_events_actor_created_idx
  on public.platform_iam_audit_events (actor_profile_id, created_at desc);

create index platform_iam_audit_events_object_idx
  on public.platform_iam_audit_events (object_type, object_id, created_at desc);

create or replace function public.platform_iam_audit_events_reject_mutate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform_iam_audit_events is append-only';
end;
$$;

create trigger platform_iam_audit_events_no_update
before update on public.platform_iam_audit_events
for each row execute function public.platform_iam_audit_events_reject_mutate();

create trigger platform_iam_audit_events_no_delete
before delete on public.platform_iam_audit_events
for each row execute function public.platform_iam_audit_events_reject_mutate();

revoke all on function public.platform_iam_audit_events_reject_mutate() from public, anon, authenticated;

comment on table public.platform_iam_audit_events is
  'Append-only platform administration / identity / access audit. Not a Finance or ECC operational log. Actions include user.invited, profile.attached_to_organisation, profile.activated, profile.suspended, profile.deactivated, module.enabled, module.disabled, capability.granted, capability.revoked, user.offboarded.';

alter table public.platform_iam_audit_events enable row level security;

create policy platform_iam_audit_events_select_super_admin
on public.platform_iam_audit_events
for select to authenticated
using (public.is_platform_super_admin());

grant select on table public.platform_iam_audit_events to authenticated;
grant all on table public.platform_iam_audit_events to service_role;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public.platform_iam_require_super_admin_actor(
  p_actor_profile_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_actor_profile_id is null then
    raise exception 'platform_iam: actor is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_actor_profile_id
      and p.status = 'active'
  ) then
    raise exception 'platform_iam: actor profile is not active' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id
    where ura.profile_id = p_actor_profile_id
      and r.slug = 'platform_super_admin'
      and r.status = 'active'
      and ura.organisation_id is null
  ) then
    raise exception 'platform_iam: actor is not platform_super_admin' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.platform_iam_require_super_admin_actor(uuid) from public;
revoke all on function public.platform_iam_require_super_admin_actor(uuid) from anon, authenticated;
grant execute on function public.platform_iam_require_super_admin_actor(uuid) to service_role;

create or replace function public.platform_iam_insert_audit_event(
  p_organisation_id uuid,
  p_actor_profile_id uuid,
  p_action text,
  p_object_type text,
  p_object_id text,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.platform_iam_audit_events (
    organisation_id,
    actor_profile_id,
    action,
    object_type,
    object_id,
    details
  ) values (
    p_organisation_id,
    p_actor_profile_id,
    trim(p_action),
    trim(p_object_type),
    trim(p_object_id),
    coalesce(p_details, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.platform_iam_insert_audit_event(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function public.platform_iam_insert_audit_event(uuid, uuid, text, text, text, jsonb) from anon, authenticated;
grant execute on function public.platform_iam_insert_audit_event(uuid, uuid, text, text, text, jsonb) to service_role;

create or replace function public.platform_iam_profile_status_is_allowed(
  p_from public.profile_status,
  p_to public.profile_status
)
returns boolean
language sql
immutable
as $$
  select
    case
      when p_from is null or p_to is null then false
      when p_from = p_to then true
      when p_to = 'invited' then false
      when p_from = 'invited' and p_to in ('inactive', 'suspended') then true
      when p_from = 'active' and p_to in ('inactive', 'suspended') then true
      when p_from = 'suspended' and p_to in ('active', 'inactive') then true
      when p_from = 'inactive' and p_to in ('active', 'suspended') then true
      else false
    end;
$$;

revoke all on function public.platform_iam_profile_status_is_allowed(public.profile_status, public.profile_status) from public, anon;
grant execute on function public.platform_iam_profile_status_is_allowed(public.profile_status, public.profile_status) to authenticated, service_role;

create or replace function public.platform_iam_is_allowed_platform_capability(
  p_capability text
)
returns boolean
language sql
immutable
as $$
  select p_capability in (
    'platform.ecc_operations.view',
    'platform.command_centre.view',
    'platform.command_centre.decide'
  );
$$;

revoke all on function public.platform_iam_is_allowed_platform_capability(text) from public, anon;
grant execute on function public.platform_iam_is_allowed_platform_capability(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Profile status
-- ---------------------------------------------------------------------------

create or replace function public.platform_iam_set_profile_status(
  p_actor_profile_id uuid,
  p_target_profile_id uuid,
  p_status public.profile_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_action text;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  if p_target_profile_id is null then
    raise exception 'platform_iam: target profile is required' using errcode = '22023';
  end if;

  select * into v_target
  from public.profiles
  where id = p_target_profile_id;

  if not found then
    raise exception 'platform_iam: target profile not found' using errcode = 'P0002';
  end if;

  if not public.platform_iam_profile_status_is_allowed(v_target.status, p_status) then
    raise exception 'platform_iam: status transition % → % is not allowed',
      v_target.status, p_status
      using errcode = '22023';
  end if;

  if v_target.status = p_status then
    return jsonb_build_object(
      'profileId', v_target.id,
      'organisationId', v_target.organisation_id,
      'status', v_target.status,
      'previousStatus', v_target.status,
      'changed', false
    );
  end if;

  perform set_config('sentracore.bypass_profile_acl', 'on', true);

  update public.profiles
  set
    status = p_status,
    updated_at = timezone('utc', now())
  where id = p_target_profile_id;

  v_action := case p_status
    when 'active' then 'profile.activated'
    when 'suspended' then 'profile.suspended'
    when 'inactive' then 'profile.deactivated'
    else 'profile.status_changed'
  end;

  perform public.platform_iam_insert_audit_event(
    v_target.organisation_id,
    p_actor_profile_id,
    v_action,
    'profile',
    p_target_profile_id::text,
    jsonb_build_object(
      'previousStatus', v_target.status,
      'status', p_status
    )
  );

  return jsonb_build_object(
    'profileId', p_target_profile_id,
    'organisationId', v_target.organisation_id,
    'status', p_status,
    'previousStatus', v_target.status,
    'changed', true
  );
end;
$$;

revoke all on function public.platform_iam_set_profile_status(uuid, uuid, public.profile_status) from public;
revoke all on function public.platform_iam_set_profile_status(uuid, uuid, public.profile_status) from anon, authenticated;
grant execute on function public.platform_iam_set_profile_status(uuid, uuid, public.profile_status) to service_role;

-- ---------------------------------------------------------------------------
-- Organisation module enablement (does not grant user capabilities)
-- ---------------------------------------------------------------------------

create or replace function public.platform_iam_set_organisation_module(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_module_slug text,
  p_status public.organisation_module_status
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org public.organisations%rowtype;
  v_module public.modules%rowtype;
  v_existing public.organisation_modules%rowtype;
  v_action text;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  if p_status not in ('enabled', 'disabled') then
    raise exception 'platform_iam: module status must be enabled or disabled' using errcode = '22023';
  end if;

  if lower(trim(p_module_slug)) = 'command_centre' then
    raise exception 'platform_iam: Command Centre is grant-only and is not an organisation module'
      using errcode = '22023';
  end if;

  select * into v_org
  from public.organisations
  where id = p_organisation_id;

  if not found then
    raise exception 'platform_iam: organisation not found' using errcode = 'P0002';
  end if;

  if v_org.status <> 'active' then
    raise exception 'platform_iam: organisation is not active' using errcode = '42501';
  end if;

  select * into v_module
  from public.modules
  where slug = lower(trim(p_module_slug))
    and status = 'active';

  if not found then
    raise exception 'platform_iam: unknown or inactive module %', p_module_slug
      using errcode = '22023';
  end if;

  select * into v_existing
  from public.organisation_modules
  where organisation_id = p_organisation_id
    and module_id = v_module.id;

  if found and v_existing.status = p_status then
    return jsonb_build_object(
      'organisationId', p_organisation_id,
      'moduleSlug', v_module.slug,
      'status', p_status,
      'changed', false
    );
  end if;

  insert into public.organisation_modules (
    organisation_id,
    module_id,
    status,
    enabled_at,
    configuration
  ) values (
    p_organisation_id,
    v_module.id,
    p_status,
    case when p_status = 'enabled' then timezone('utc', now()) else null end,
    '{}'::jsonb
  )
  on conflict (organisation_id, module_id)
  do update set
    status = excluded.status,
    enabled_at = case
      when excluded.status = 'enabled'
        then coalesce(public.organisation_modules.enabled_at, timezone('utc', now()))
      else public.organisation_modules.enabled_at
    end,
    updated_at = timezone('utc', now());

  v_action := case p_status
    when 'enabled' then 'module.enabled'
    else 'module.disabled'
  end;

  perform public.platform_iam_insert_audit_event(
    p_organisation_id,
    p_actor_profile_id,
    v_action,
    'organisation_module',
    v_module.slug,
    jsonb_build_object(
      'moduleSlug', v_module.slug,
      'status', p_status
    )
  );

  return jsonb_build_object(
    'organisationId', p_organisation_id,
    'moduleSlug', v_module.slug,
    'status', p_status,
    'changed', true
  );
end;
$$;

revoke all on function public.platform_iam_set_organisation_module(uuid, uuid, text, public.organisation_module_status) from public;
revoke all on function public.platform_iam_set_organisation_module(uuid, uuid, text, public.organisation_module_status) from anon, authenticated;
grant execute on function public.platform_iam_set_organisation_module(uuid, uuid, text, public.organisation_module_status) to service_role;

-- ---------------------------------------------------------------------------
-- Platform capability grants (ECC / Command Centre only — not Finance)
-- ---------------------------------------------------------------------------

create or replace function public.platform_iam_grant_platform_capability(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_target_profile_id uuid,
  p_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_inserted int := 0;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  if not public.platform_iam_is_allowed_platform_capability(p_capability) then
    raise exception 'platform_iam: capability % is not administrable here', p_capability
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.organisations o
    where o.id = p_organisation_id and o.status = 'active'
  ) then
    raise exception 'platform_iam: organisation not found or inactive' using errcode = 'P0002';
  end if;

  select * into v_target
  from public.profiles
  where id = p_target_profile_id;

  if not found then
    raise exception 'platform_iam: target profile not found' using errcode = 'P0002';
  end if;

  if v_target.organisation_id is distinct from p_organisation_id then
    raise exception 'platform_iam: profile is not attached to the requested organisation'
      using errcode = '42501';
  end if;

  insert into public.platform_capability_grants (
    organisation_id,
    profile_id,
    capability
  ) values (
    p_organisation_id,
    p_target_profile_id,
    p_capability
  )
  on conflict (profile_id, organisation_id, capability) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    perform public.platform_iam_insert_audit_event(
      p_organisation_id,
      p_actor_profile_id,
      'capability.granted',
      'platform_capability',
      p_capability,
      jsonb_build_object(
        'profileId', p_target_profile_id,
        'capability', p_capability,
        'changed', true
      )
    );
  end if;

  return jsonb_build_object(
    'organisationId', p_organisation_id,
    'profileId', p_target_profile_id,
    'capability', p_capability,
    'changed', v_inserted > 0
  );
end;
$$;

revoke all on function public.platform_iam_grant_platform_capability(uuid, uuid, uuid, text) from public;
revoke all on function public.platform_iam_grant_platform_capability(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.platform_iam_grant_platform_capability(uuid, uuid, uuid, text) to service_role;

create or replace function public.platform_iam_revoke_platform_capability(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_target_profile_id uuid,
  p_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted int := 0;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  if not public.platform_iam_is_allowed_platform_capability(p_capability) then
    raise exception 'platform_iam: capability % is not administrable here', p_capability
      using errcode = '22023';
  end if;

  delete from public.platform_capability_grants
  where organisation_id = p_organisation_id
    and profile_id = p_target_profile_id
    and capability = p_capability;

  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    perform public.platform_iam_insert_audit_event(
      p_organisation_id,
      p_actor_profile_id,
      'capability.revoked',
      'platform_capability',
      p_capability,
      jsonb_build_object(
        'profileId', p_target_profile_id,
        'capability', p_capability,
        'changed', true
      )
    );
  end if;

  return jsonb_build_object(
    'organisationId', p_organisation_id,
    'profileId', p_target_profile_id,
    'capability', p_capability,
    'changed', v_deleted > 0
  );
end;
$$;

revoke all on function public.platform_iam_revoke_platform_capability(uuid, uuid, uuid, text) from public;
revoke all on function public.platform_iam_revoke_platform_capability(uuid, uuid, uuid, text) from anon, authenticated;
grant execute on function public.platform_iam_revoke_platform_capability(uuid, uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Non-destructive offboarding (DB authority only; Auth/People are external)
-- ---------------------------------------------------------------------------

create or replace function public.platform_iam_offboard_profile(
  p_actor_profile_id uuid,
  p_target_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.profiles%rowtype;
  v_finance_caps int := 0;
  v_platform_caps int := 0;
  v_company_access int := 0;
  v_fa_access int := 0;
  v_links int := 0;
begin
  perform public.platform_iam_require_super_admin_actor(p_actor_profile_id);

  if p_target_profile_id = p_actor_profile_id then
    raise exception 'platform_iam: cannot offboard the acting Super Admin' using errcode = '42501';
  end if;

  select * into v_target
  from public.profiles
  where id = p_target_profile_id;

  if not found then
    raise exception 'platform_iam: target profile not found' using errcode = 'P0002';
  end if;

  delete from public.finance_capability_grants
  where profile_id = p_target_profile_id;
  get diagnostics v_finance_caps = row_count;

  delete from public.platform_capability_grants
  where profile_id = p_target_profile_id;
  get diagnostics v_platform_caps = row_count;

  delete from public.finance_company_access
  where profile_id = p_target_profile_id;
  get diagnostics v_company_access = row_count;

  delete from public.finance_financial_account_access
  where profile_id = p_target_profile_id;
  get diagnostics v_fa_access = row_count;

  update public.operational_identity_links
  set
    status = 'inactive',
    updated_at = timezone('utc', now())
  where profile_id = p_target_profile_id
    and status = 'active';
  get diagnostics v_links = row_count;

  perform set_config('sentracore.bypass_profile_acl', 'on', true);

  update public.profiles
  set
    status = 'inactive',
    updated_at = timezone('utc', now())
  where id = p_target_profile_id
    and status is distinct from 'inactive';

  perform public.platform_iam_insert_audit_event(
    v_target.organisation_id,
    p_actor_profile_id,
    'user.offboarded',
    'profile',
    p_target_profile_id::text,
    jsonb_build_object(
      'previousStatus', v_target.status,
      'status', 'inactive',
      'revoked', jsonb_build_object(
        'financeCapabilityGrants', v_finance_caps,
        'platformCapabilityGrants', v_platform_caps,
        'financeCompanyAccess', v_company_access,
        'financeFinancialAccountAccess', v_fa_access,
        'operationalIdentityLinksInactivated', v_links
      )
    )
  );

  return jsonb_build_object(
    'profileId', p_target_profile_id,
    'organisationId', v_target.organisation_id,
    'previousStatus', v_target.status,
    'status', 'inactive',
    'platformAccessRevoked', true,
    'revoked', jsonb_build_object(
      'financeCapabilityGrants', v_finance_caps,
      'platformCapabilityGrants', v_platform_caps,
      'financeCompanyAccess', v_company_access,
      'financeFinancialAccountAccess', v_fa_access,
      'operationalIdentityLinksInactivated', v_links
    )
  );
end;
$$;

revoke all on function public.platform_iam_offboard_profile(uuid, uuid) from public;
revoke all on function public.platform_iam_offboard_profile(uuid, uuid) from anon, authenticated;
grant execute on function public.platform_iam_offboard_profile(uuid, uuid) to service_role;

comment on function public.platform_iam_offboard_profile(uuid, uuid) is
  'Revoke future platform authority without deleting auth users, profiles, or historical business records. Does not ban Auth or deactivate FM People (external).';
