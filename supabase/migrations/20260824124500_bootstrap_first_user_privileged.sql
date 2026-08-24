-- Narrow privileged path for first-user bootstrap.
-- Does not weaken client/authenticated profile ACL guardrails.

-- ---------------------------------------------------------------------------
-- 1. Allow ACL field updates only when an explicit transaction-local flag is set
--    by a privileged SECURITY DEFINER bootstrap function (not by clients).
-- ---------------------------------------------------------------------------

create or replace function public.enforce_profile_update_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Set only inside bootstrap_first_platform_user (transaction-local).
  if current_setting('sentracore.bypass_profile_acl', true) = 'on' then
    return new;
  end if;

  if public.is_platform_super_admin() then
    return new;
  end if;

  -- Org managers may change access fields for profiles in their organisation.
  if old.organisation_id is not null
     and public.can_manage_organisation(old.organisation_id) then
    return new;
  end if;

  if new.organisation_id is not null
     and public.can_manage_organisation(new.organisation_id)
     and (
       old.organisation_id is null
       or old.organisation_id = new.organisation_id
     ) then
    return new;
  end if;

  -- Everyone else (including self-service): personal fields only.
  if new.id is distinct from old.id
     or new.organisation_id is distinct from old.organisation_id
     or new.status is distinct from old.status
     or new.created_at is distinct from old.created_at then
    raise exception
      'Access-control fields on profiles cannot be changed by this user'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.enforce_profile_update_guardrails() is
  'Blocks updates to organisation_id/status/id/created_at unless platform super admin, org manager, or privileged bootstrap (sentracore.bypass_profile_acl).';

-- ---------------------------------------------------------------------------
-- 2. Atomic first-user bootstrap (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.bootstrap_first_platform_user(
  p_user_id uuid,
  p_organisation_slug text default 'paychex',
  p_full_name text default null,
  p_first_name text default null,
  p_last_name text default null,
  p_org_role_slug text default 'organisation_owner',
  p_grant_platform_super_admin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linked_count integer;
  v_org public.organisations%rowtype;
  v_profile public.profiles%rowtype;
  v_org_role public.roles%rowtype;
  v_platform_role public.roles%rowtype;
  v_roles text[] := array[]::text[];
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_linked_count
  from public.profiles
  where organisation_id is not null;

  if v_linked_count > 0 then
    raise exception
      'Bootstrap disabled: an organisation-linked profile already exists'
      using errcode = '42501';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = p_user_id;

  if not found then
    raise exception 'Profile % not found (auth trigger may not have run)', p_user_id
      using errcode = 'P0002';
  end if;

  if v_profile.organisation_id is not null then
    raise exception 'Profile % is already organisation-linked', p_user_id
      using errcode = '42501';
  end if;

  select *
  into v_org
  from public.organisations
  where slug = p_organisation_slug;

  if not found then
    raise exception 'Organisation slug % not found', p_organisation_slug
      using errcode = 'P0002';
  end if;

  select *
  into v_org_role
  from public.roles
  where slug = p_org_role_slug
    and status = 'active';

  if not found then
    raise exception 'Role % not found', p_org_role_slug
      using errcode = 'P0002';
  end if;

  if v_org_role.is_platform_role then
    raise exception
      'p_org_role_slug must be an organisation role; use p_grant_platform_super_admin for platform_super_admin'
      using errcode = '22023';
  end if;

  if p_grant_platform_super_admin then
    select *
    into v_platform_role
    from public.roles
    where slug = 'platform_super_admin'
      and status = 'active';

    if not found then
      raise exception 'platform_super_admin role not found'
        using errcode = 'P0002';
    end if;
  end if;

  -- Privilege for this transaction only; never exposed to clients.
  perform set_config('sentracore.bypass_profile_acl', 'on', true);

  update public.profiles
  set
    organisation_id = v_org.id,
    status = 'active',
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
    last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
    updated_at = timezone('utc', now())
  where id = p_user_id;

  insert into public.user_role_assignments (
    profile_id,
    role_id,
    organisation_id,
    department_id
  )
  values (
    p_user_id,
    v_org_role.id,
    v_org.id,
    null
  )
  on conflict do nothing;

  v_roles := array_append(v_roles, v_org_role.slug);

  if p_grant_platform_super_admin then
    insert into public.user_role_assignments (
      profile_id,
      role_id,
      organisation_id,
      department_id
    )
    values (
      p_user_id,
      v_platform_role.id,
      null,
      null
    )
    on conflict do nothing;

    v_roles := array_append(v_roles, 'platform_super_admin');
  end if;

  return jsonb_build_object(
    'userId', p_user_id,
    'organisation', jsonb_build_object(
      'id', v_org.id,
      'slug', v_org.slug,
      'name', v_org.name
    ),
    'roles', to_jsonb(v_roles),
    'status', 'active'
  );
end;
$$;

revoke all on function public.bootstrap_first_platform_user(
  uuid, text, text, text, text, text, boolean
) from public;

revoke all on function public.bootstrap_first_platform_user(
  uuid, text, text, text, text, text, boolean
) from anon, authenticated;

grant execute on function public.bootstrap_first_platform_user(
  uuid, text, text, text, text, text, boolean
) to service_role;

comment on function public.bootstrap_first_platform_user(
  uuid, text, text, text, text, text, boolean
) is
  'One-shot first-user bootstrap: attach profile to org, activate, assign roles. service_role only.';
