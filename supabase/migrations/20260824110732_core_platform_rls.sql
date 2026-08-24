-- Row Level Security for SentraCore core platform tables.
-- Helpers are SECURITY DEFINER + fixed search_path to avoid RLS recursion.

-- ---------------------------------------------------------------------------
-- Access helper functions
-- ---------------------------------------------------------------------------

create or replace function public.is_platform_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id
    where ura.profile_id = auth.uid()
      and r.slug = 'platform_super_admin'
      and r.status = 'active'
      and ura.organisation_id is null
  );
$$;

create or replace function public.is_org_member(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_organisation_id is not null
    and (
      public.is_platform_super_admin()
      or exists (
        select 1
        from public.profiles p
        where p.id = auth.uid()
          and p.organisation_id = p_organisation_id
      )
      or exists (
        select 1
        from public.user_role_assignments ura
        where ura.profile_id = auth.uid()
          and ura.organisation_id = p_organisation_id
      )
    );
$$;

create or replace function public.has_org_role(
  p_organisation_id uuid,
  p_role_slugs text[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_platform_super_admin()
    or exists (
      select 1
      from public.user_role_assignments ura
      join public.roles r on r.id = ura.role_id
      where ura.profile_id = auth.uid()
        and ura.organisation_id = p_organisation_id
        and r.slug = any (p_role_slugs)
        and r.status = 'active'
    );
$$;

create or replace function public.can_manage_organisation(p_organisation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_org_role(
    p_organisation_id,
    array['organisation_owner', 'executive']::text[]
  );
$$;

create or replace function public.can_access_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.departments d
    where d.id = p_department_id
      and (
        public.is_platform_super_admin()
        or public.is_org_member(d.organisation_id)
      )
  );
$$;

revoke all on function public.is_platform_super_admin() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
revoke all on function public.can_manage_organisation(uuid) from public;
revoke all on function public.can_access_department(uuid) from public;

grant execute on function public.is_platform_super_admin() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.can_manage_organisation(uuid) to authenticated;
grant execute on function public.can_access_department(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

alter table public.organisations enable row level security;
alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.modules enable row level security;
alter table public.organisation_modules enable row level security;

-- ---------------------------------------------------------------------------
-- organisations
-- ---------------------------------------------------------------------------

create policy organisations_select_member
on public.organisations
for select
to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(id)
);

create policy organisations_insert_super_admin
on public.organisations
for insert
to authenticated
with check (public.is_platform_super_admin());

create policy organisations_update_managers
on public.organisations
for update
to authenticated
using (
  public.is_platform_super_admin()
  or public.can_manage_organisation(id)
)
with check (
  public.is_platform_super_admin()
  or public.can_manage_organisation(id)
);

create policy organisations_delete_super_admin
on public.organisations
for delete
to authenticated
using (public.is_platform_super_admin());

-- ---------------------------------------------------------------------------
-- departments
-- ---------------------------------------------------------------------------

create policy departments_select_org_member
on public.departments
for select
to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy departments_insert_org_managers
on public.departments
for insert
to authenticated
with check (
  public.is_platform_super_admin()
  or public.can_manage_organisation(organisation_id)
);

create policy departments_update_org_managers
on public.departments
for update
to authenticated
using (
  public.is_platform_super_admin()
  or public.can_manage_organisation(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.can_manage_organisation(organisation_id)
);

create policy departments_delete_org_managers
on public.departments
for delete
to authenticated
using (
  public.is_platform_super_admin()
  or public.can_manage_organisation(organisation_id)
);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select_self_or_org
on public.profiles
for select
to authenticated
using (
  public.is_platform_super_admin()
  or id = auth.uid()
  or (
    organisation_id is not null
    and public.is_org_member(organisation_id)
  )
);

-- Self-service updates: row must be own profile.
-- Access-control columns are frozen by enforce_profile_update_guardrails().
create policy profiles_update_self
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Org owners / executives / platform super admins may manage profiles in scope
-- (including organisation_id and status).
create policy profiles_update_org_managers
on public.profiles
for update
to authenticated
using (
  public.is_platform_super_admin()
  or (
    organisation_id is not null
    and public.can_manage_organisation(organisation_id)
  )
)
with check (
  public.is_platform_super_admin()
  or (
    organisation_id is not null
    and public.can_manage_organisation(organisation_id)
  )
);

-- Prevent non-privileged users from changing access-control fields.
create or replace function public.enforce_profile_update_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
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

  -- Everyone else (including self-service): personal fields only
  -- (first_name, last_name, full_name, avatar_url, job_title).
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

create trigger profiles_enforce_update_guardrails
before update on public.profiles
for each row
execute function public.enforce_profile_update_guardrails();

comment on function public.enforce_profile_update_guardrails() is
  'Blocks updates to organisation_id/status/id unless platform super admin or org manager.';

-- Inserts come from the auth trigger (security definer) / service role.
-- No direct authenticated insert policy.

-- ---------------------------------------------------------------------------
-- roles (global catalog — readable by authenticated users)
-- ---------------------------------------------------------------------------

create policy roles_select_authenticated
on public.roles
for select
to authenticated
using (status = 'active' or public.is_platform_super_admin());

create policy roles_write_super_admin
on public.roles
for all
to authenticated
using (public.is_platform_super_admin())
with check (public.is_platform_super_admin());

-- ---------------------------------------------------------------------------
-- user_role_assignments
-- ---------------------------------------------------------------------------

create policy user_role_assignments_select
on public.user_role_assignments
for select
to authenticated
using (
  public.is_platform_super_admin()
  or profile_id = auth.uid()
  or (
    organisation_id is not null
    and public.can_manage_organisation(organisation_id)
  )
);

create policy user_role_assignments_insert
on public.user_role_assignments
for insert
to authenticated
with check (
  public.is_platform_super_admin()
  or (
    organisation_id is not null
    and public.can_manage_organisation(organisation_id)
  )
);

create policy user_role_assignments_update
on public.user_role_assignments
for update
to authenticated
using (
  public.is_platform_super_admin()
  or (
    organisation_id is not null
    and public.can_manage_organisation(organisation_id)
  )
)
with check (
  public.is_platform_super_admin()
  or (
    organisation_id is not null
    and public.can_manage_organisation(organisation_id)
  )
);

create policy user_role_assignments_delete
on public.user_role_assignments
for delete
to authenticated
using (
  public.is_platform_super_admin()
  or (
    organisation_id is not null
    and public.can_manage_organisation(organisation_id)
  )
);

-- ---------------------------------------------------------------------------
-- modules (platform registry)
-- ---------------------------------------------------------------------------

create policy modules_select_authenticated
on public.modules
for select
to authenticated
using (status = 'active' or public.is_platform_super_admin());

create policy modules_write_super_admin
on public.modules
for all
to authenticated
using (public.is_platform_super_admin())
with check (public.is_platform_super_admin());

-- ---------------------------------------------------------------------------
-- organisation_modules
-- ---------------------------------------------------------------------------

create policy organisation_modules_select_member
on public.organisation_modules
for select
to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy organisation_modules_write_managers
on public.organisation_modules
for all
to authenticated
using (
  public.is_platform_super_admin()
  or public.can_manage_organisation(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.can_manage_organisation(organisation_id)
);

-- ---------------------------------------------------------------------------
-- Table grants (RLS still applies for authenticated)
-- ---------------------------------------------------------------------------

grant usage on schema public to postgres, anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public
  to authenticated, service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;

alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
