-- SentraCore Finance Phase 2A: corporate Financial Accounts + treasury authority.
-- Financial Accounts are company-controlled value stores, not GL accounts.
-- No balances, money movements, payment destinations, or private/user-owned
-- finance ("Batcave") concepts are introduced by this migration.

-- Extend existing legitimate Finance authority. This copies explicit Finance
-- grants; it does not derive authority from Super Admin or role names.
insert into public.finance_capability_grants (
  organisation_id, profile_id, capability
)
select organisation_id, profile_id, 'platform_finance.financial_account.view'
from public.finance_capability_grants
where capability = 'platform_finance.view'
on conflict (profile_id, organisation_id, capability) do nothing;

insert into public.finance_capability_grants (
  organisation_id, profile_id, capability
)
select organisation_id, profile_id, 'platform_finance.financial_account.manage'
from public.finance_capability_grants
where capability = 'platform_finance.manage_setup'
on conflict (profile_id, organisation_id, capability) do nothing;

create table public.finance_financial_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  account_type text not null,
  name text not null,
  institution_name text,
  account_number_last4 text,
  currency text not null default 'NGN',
  control_gl_account_id uuid not null references public.finance_accounts (id) on delete restrict,
  visibility_policy text not null default 'company',
  status text not null default 'active',
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  updated_by_profile_id uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_financial_accounts_type_check
    check (account_type in ('bank', 'cash', 'petty_cash')),
  constraint finance_financial_accounts_name_nonempty
    check (char_length(trim(name)) > 0),
  constraint finance_financial_accounts_institution_nonempty
    check (institution_name is null or char_length(trim(institution_name)) > 0),
  constraint finance_financial_accounts_last4_check
    check (account_number_last4 is null or account_number_last4 ~ '^[0-9]{4}$'),
  constraint finance_financial_accounts_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  constraint finance_financial_accounts_visibility_check
    check (visibility_policy in ('company', 'restricted')),
  constraint finance_financial_accounts_status_check
    check (status in ('active', 'inactive')),
  constraint finance_financial_accounts_company_name_unique
    unique (company_id, name)
);

create index finance_financial_accounts_org_company_idx
  on public.finance_financial_accounts (organisation_id, company_id, status);
create index finance_financial_accounts_control_gl_idx
  on public.finance_financial_accounts (control_gl_account_id);

create trigger finance_financial_accounts_set_updated_at
before update on public.finance_financial_accounts
for each row execute function public.set_updated_at();

create or replace function public.finance_financial_accounts_validate_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  company_org uuid;
  gl_org uuid;
  gl_type text;
  gl_classification text;
  gl_status text;
begin
  select organisation_id into company_org
  from public.finance_companies
  where id = new.company_id;

  if company_org is null then
    raise exception 'finance company % not found', new.company_id;
  end if;

  select organisation_id, account_type, classification, status
    into gl_org, gl_type, gl_classification, gl_status
  from public.finance_accounts
  where id = new.control_gl_account_id;

  if gl_org is null then
    raise exception 'control GL account % not found', new.control_gl_account_id;
  end if;
  if gl_org <> company_org then
    raise exception 'control GL account must belong to the finance company organisation';
  end if;
  if gl_status <> 'active'
    or gl_type <> 'asset'
    or gl_classification is distinct from 'current_asset'
  then
    raise exception 'control GL account must be an active current asset account';
  end if;

  new.organisation_id := company_org;
  new.name := trim(new.name);
  new.institution_name := nullif(trim(new.institution_name), '');
  new.currency := upper(trim(new.currency));
  return new;
end;
$$;

create trigger finance_financial_accounts_validate_scope
before insert or update of company_id, control_gl_account_id, name,
  institution_name, currency, organisation_id
on public.finance_financial_accounts
for each row execute function public.finance_financial_accounts_validate_scope();

comment on table public.finance_financial_accounts is
  'Corporate company-controlled bank/cash/petty-cash stores. Distinct from finance_accounts (GL), payment destinations, money movements, and private user-owned Finance domains. Balances are intentionally absent.';
comment on column public.finance_financial_accounts.account_number_last4 is
  'Display-safe final four digits only. Full financial account numbers are not accepted or stored in Phase 2A.';
comment on column public.finance_financial_accounts.control_gl_account_id is
  'One active current-asset GL control account. This does not create bank-specific COA codes.';

create table public.finance_financial_account_access (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  financial_account_id uuid not null references public.finance_financial_accounts (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_financial_account_access_unique
    unique (financial_account_id, profile_id)
);

create index finance_financial_account_access_profile_idx
  on public.finance_financial_account_access (organisation_id, profile_id);
create index finance_financial_account_access_account_idx
  on public.finance_financial_account_access (financial_account_id);

create or replace function public.finance_financial_account_access_validate_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  account_org uuid;
  target_org uuid;
  creator_org uuid;
begin
  select organisation_id into account_org
  from public.finance_financial_accounts
  where id = new.financial_account_id;

  select organisation_id into target_org
  from public.profiles
  where id = new.profile_id;

  select organisation_id into creator_org
  from public.profiles
  where id = new.created_by_profile_id;

  if account_org is null then
    raise exception 'financial account % not found', new.financial_account_id;
  end if;
  if target_org is distinct from account_org then
    raise exception 'financial account access profile must belong to the account organisation';
  end if;
  if creator_org is distinct from account_org then
    raise exception 'financial account access creator must belong to the account organisation';
  end if;

  new.organisation_id := account_org;
  return new;
end;
$$;

create trigger finance_financial_account_access_validate_scope
before insert or update on public.finance_financial_account_access
for each row execute function public.finance_financial_account_access_validate_scope();

comment on table public.finance_financial_account_access is
  'Explicit profile scope for restricted corporate Financial Accounts. Capabilities define what; company access defines which company; this grant defines which restricted account.';

create or replace function public.can_view_finance_financial_account(
  p_financial_account_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_financial_accounts a
    where a.id = p_financial_account_id
      and public.is_org_member(a.organisation_id)
      and public.has_finance_capability(
        a.organisation_id,
        'platform_finance.financial_account.view'
      )
      and public.has_finance_company_access(a.company_id)
      and (
        a.visibility_policy = 'company'
        or exists (
          select 1
          from public.finance_financial_account_access g
          where g.financial_account_id = a.id
            and g.profile_id = auth.uid()
        )
      )
  );
$$;

revoke all on function public.can_view_finance_financial_account(uuid) from public;
grant execute on function public.can_view_finance_financial_account(uuid) to authenticated;

create or replace function public.finance_financial_accounts_after_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action,
    object_type, object_id, reason, details
  ) values (
    new.organisation_id, new.company_id,
    coalesce(new.updated_by_profile_id, new.created_by_profile_id),
    'finance.financial_account.created', 'financial_account', new.id::text,
    'Corporate financial account created.',
    jsonb_build_object(
      'account_type', new.account_type,
      'visibility_policy', new.visibility_policy,
      'status', new.status
    )
  );

  -- A restricted account creator must not lose access immediately after the
  -- successful create. The explicit grant is created atomically.
  if new.visibility_policy = 'restricted' then
    insert into public.finance_financial_account_access (
      organisation_id, financial_account_id, profile_id, created_by_profile_id
    ) values (
      new.organisation_id, new.id, new.created_by_profile_id,
      new.created_by_profile_id
    )
    on conflict (financial_account_id, profile_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger finance_financial_accounts_after_insert
after insert on public.finance_financial_accounts
for each row execute function public.finance_financial_accounts_after_insert();

create or replace function public.finance_financial_accounts_after_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  event_action text;
  event_reason text;
begin
  if new.visibility_policy = 'restricted'
    and new.visibility_policy is distinct from old.visibility_policy
  then
    insert into public.finance_financial_account_access (
      organisation_id, financial_account_id, profile_id, created_by_profile_id
    ) values (
      new.organisation_id,
      new.id,
      coalesce(new.updated_by_profile_id, new.created_by_profile_id),
      coalesce(new.updated_by_profile_id, new.created_by_profile_id)
    )
    on conflict (financial_account_id, profile_id) do nothing;
  end if;

  if new.status is distinct from old.status then
    event_action := case new.status
      when 'inactive' then 'finance.financial_account.deactivated'
      else 'finance.financial_account.reactivated'
    end;
    event_reason := case new.status
      when 'inactive' then 'Corporate financial account deactivated.'
      else 'Corporate financial account reactivated.'
    end;
  else
    event_action := 'finance.financial_account.updated';
    event_reason := 'Corporate financial account updated.';
  end if;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action,
    object_type, object_id, reason, details
  ) values (
    new.organisation_id, new.company_id,
    coalesce(new.updated_by_profile_id, new.created_by_profile_id),
    event_action, 'financial_account', new.id::text, event_reason,
    jsonb_build_object(
      'account_type', new.account_type,
      'visibility_policy', new.visibility_policy,
      'status', new.status
    )
  );

  return new;
end;
$$;

create trigger finance_financial_accounts_after_update
after update of account_type, name, institution_name, account_number_last4,
  currency, control_gl_account_id, visibility_policy, status
on public.finance_financial_accounts
for each row execute function public.finance_financial_accounts_after_update();

create or replace function public.finance_financial_account_access_after_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  account_company uuid;
begin
  select company_id into account_company
  from public.finance_financial_accounts
  where id = new.financial_account_id;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action,
    object_type, object_id, reason, details
  ) values (
    new.organisation_id, account_company, new.created_by_profile_id,
    'finance.financial_account.access_granted',
    'financial_account', new.financial_account_id::text,
    'Restricted corporate financial account access granted.',
    jsonb_build_object('grantee_profile_id', new.profile_id)
  );
  return new;
end;
$$;

create trigger finance_financial_account_access_after_insert
after insert on public.finance_financial_account_access
for each row execute function public.finance_financial_account_access_after_insert();

create or replace function public.finance_revoke_financial_account_access(
  p_financial_account_id uuid,
  p_profile_id uuid,
  p_actor_profile_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row public.finance_financial_accounts%rowtype;
begin
  select * into account_row
  from public.finance_financial_accounts
  where id = p_financial_account_id;

  if not found then
    raise exception 'financial account not found';
  end if;
  if not exists (
    select 1 from public.finance_capability_grants
    where organisation_id = account_row.organisation_id
      and profile_id = p_actor_profile_id
      and capability = 'platform_finance.financial_account.manage'
  ) or not exists (
    select 1 from public.finance_company_access
    where company_id = account_row.company_id
      and profile_id = p_actor_profile_id
  ) then
    raise exception 'financial account access revoke is not authorised';
  end if;
  if account_row.visibility_policy = 'restricted'
    and not exists (
      select 1 from public.finance_financial_account_access
      where financial_account_id = account_row.id
        and profile_id = p_actor_profile_id
    )
  then
    raise exception 'financial account not found';
  end if;
  if p_profile_id = p_actor_profile_id then
    raise exception 'cannot revoke your own restricted account access';
  end if;

  if exists (
    select 1 from public.finance_financial_account_access
    where financial_account_id = account_row.id
      and profile_id = p_profile_id
  ) then
    insert into public.finance_audit_events (
      organisation_id, company_id, actor_profile_id, action,
      object_type, object_id, reason, details
    ) values (
      account_row.organisation_id, account_row.company_id, p_actor_profile_id,
      'finance.financial_account.access_revoked',
      'financial_account', account_row.id::text,
      'Restricted corporate financial account access revoked.',
      jsonb_build_object('revoked_profile_id', p_profile_id)
    );

    delete from public.finance_financial_account_access
    where financial_account_id = account_row.id
      and profile_id = p_profile_id;
  end if;
end;
$$;

revoke all on function public.finance_revoke_financial_account_access(uuid, uuid, uuid) from public;
grant execute on function public.finance_revoke_financial_account_access(uuid, uuid, uuid) to service_role;

alter table public.finance_financial_accounts enable row level security;
alter table public.finance_financial_account_access enable row level security;

create policy finance_financial_accounts_select
on public.finance_financial_accounts
for select to authenticated
using (public.can_view_finance_financial_account(id));

create policy finance_financial_accounts_insert
on public.finance_financial_accounts
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(
    organisation_id,
    'platform_finance.financial_account.manage'
  )
  and public.has_finance_company_access(company_id)
  and created_by_profile_id = auth.uid()
);

create policy finance_financial_accounts_update
on public.finance_financial_accounts
for update to authenticated
using (
  public.can_view_finance_financial_account(id)
  and public.has_finance_capability(
    organisation_id,
    'platform_finance.financial_account.manage'
  )
)
with check (
  public.can_view_finance_financial_account(id)
  and public.has_finance_capability(
    organisation_id,
    'platform_finance.financial_account.manage'
  )
  and updated_by_profile_id = auth.uid()
);

create policy finance_financial_account_access_select
on public.finance_financial_account_access
for select to authenticated
using (
  public.can_view_finance_financial_account(financial_account_id)
);

create policy finance_financial_account_access_insert
on public.finance_financial_account_access
for insert to authenticated
with check (
  public.can_view_finance_financial_account(financial_account_id)
  and public.has_finance_capability(
    organisation_id,
    'platform_finance.financial_account.manage'
  )
);

-- Restricted-account audit events inherit the account's existence boundary.
drop policy if exists finance_audit_events_select on public.finance_audit_events;
create policy finance_audit_events_select on public.finance_audit_events
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    company_id is null
    or public.has_finance_company_access(company_id)
  )
  and (
    object_type <> 'financial_account'
    or case
      when object_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then public.can_view_finance_financial_account(object_id::uuid)
      else false
    end
  )
);

grant select, insert, update on table public.finance_financial_accounts to authenticated;
grant select, insert on table public.finance_financial_account_access to authenticated;
grant all on table public.finance_financial_accounts to service_role;
grant all on table public.finance_financial_account_access to service_role;
