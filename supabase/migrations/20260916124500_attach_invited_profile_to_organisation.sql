-- Privileged membership attach for invited profiles (organisation membership only).
-- Does NOT grant FM/ECC/Finance capabilities — workspace entry still uses
-- organisation_modules enablement (FM) / capability grants (ECC, Finance, CC).
-- service_role only. Authenticated clients remain under profile ACL guardrails.

create or replace function public.attach_invited_profile_to_organisation(
  p_email text,
  p_organisation_slug text default 'paychex',
  p_full_name text default null,
  p_first_name text default null,
  p_last_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_org public.organisations%rowtype;
  v_user_id uuid;
  v_profile public.profiles%rowtype;
begin
  if v_email = '' then
    raise exception 'p_email is required' using errcode = '22023';
  end if;

  select *
  into v_org
  from public.organisations
  where slug = lower(trim(p_organisation_slug))
    and status = 'active';

  if not found then
    raise exception 'Organisation slug % not found or inactive', p_organisation_slug
      using errcode = 'P0002';
  end if;

  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = v_email
  limit 1;

  if v_user_id is null then
    raise exception 'Auth user % not found', v_email
      using errcode = 'P0002';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Profile % not found', v_user_id
      using errcode = 'P0002';
  end if;

  if v_profile.organisation_id is not null
     and v_profile.organisation_id <> v_org.id then
    raise exception
      'Profile % is already linked to a different organisation',
      v_user_id
      using errcode = '42501';
  end if;

  if v_profile.organisation_id = v_org.id
     and v_profile.status = 'active' then
    return jsonb_build_object(
      'userId', v_user_id,
      'organisationId', v_org.id,
      'organisationSlug', v_org.slug,
      'status', v_profile.status,
      'changed', false
    );
  end if;

  -- Same privileged bypass used by bootstrap_first_platform_user.
  perform set_config('sentracore.bypass_profile_acl', 'on', true);

  update public.profiles
  set
    organisation_id = v_org.id,
    status = 'active',
    full_name = coalesce(nullif(trim(p_full_name), ''), full_name),
    first_name = coalesce(nullif(trim(p_first_name), ''), first_name),
    last_name = coalesce(nullif(trim(p_last_name), ''), last_name),
    updated_at = timezone('utc', now())
  where id = v_user_id;

  return jsonb_build_object(
    'userId', v_user_id,
    'organisationId', v_org.id,
    'organisationSlug', v_org.slug,
    'status', 'active',
    'changed', true
  );
end;
$$;

revoke all on function public.attach_invited_profile_to_organisation(
  text, text, text, text, text
) from public;

revoke all on function public.attach_invited_profile_to_organisation(
  text, text, text, text, text
) from anon, authenticated;

grant execute on function public.attach_invited_profile_to_organisation(
  text, text, text, text, text
) to service_role;

comment on function public.attach_invited_profile_to_organisation(
  text, text, text, text, text
) is
  'Attach an invited auth profile to an organisation (membership only). No module/capability grants. service_role only.';

-- Idempotent repair: PayChex identity that signed up without org attachment.
-- Safe if already linked/active (function returns changed=false).
do $$
begin
  perform public.attach_invited_profile_to_organisation(
    'chiamaka.uzoukwu@paychexng.com',
    'paychex',
    'Chiamaka Uzoukwu',
    'Chiamaka',
    'Uzoukwu'
  );
exception
  when others then
    -- Do not fail migration if this identity is absent in a given environment.
    if sqlstate in ('P0002') then
      raise notice 'attach_invited_profile_to_organisation skipped: %', sqlerrm;
    else
      raise;
    end if;
end;
$$;
