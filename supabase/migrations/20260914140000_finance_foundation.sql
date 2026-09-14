-- Platform Finance foundation (Phase 1).
-- Organisation (customer/group) → finance_companies (legal entities).
-- Does NOT overload ecc_finance_* or FM Sheets finance.
-- Journal is accounting SoT for posted events; FT is the economic event.

-- ---------------------------------------------------------------------------
-- Module registry: platform_finance
-- ---------------------------------------------------------------------------

insert into public.modules (name, slug, description, icon, status)
values (
  'Platform Finance',
  'platform_finance',
  'Organisation-wide multi-company financial operations and accounting.',
  'wallet',
  'active'
)
on conflict (slug) do update
set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  status = excluded.status,
  updated_at = timezone('utc', now());

-- Enable for PayChex Group (API/module gate). Product workspace remains in_development.
insert into public.organisation_modules (
  organisation_id,
  module_id,
  status,
  enabled_at,
  configuration
)
select
  o.id,
  m.id,
  'enabled'::public.organisation_module_status,
  timezone('utc', now()),
  jsonb_build_object('phase', 'foundation')
from public.organisations o
join public.modules m on m.slug = 'platform_finance'
where o.slug = 'paychex'
on conflict (organisation_id, module_id) do update
set
  status = excluded.status,
  enabled_at = coalesce(public.organisation_modules.enabled_at, excluded.enabled_at),
  configuration = excluded.configuration,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Companies (legal entities under an organisation)
-- ---------------------------------------------------------------------------

create table public.finance_companies (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  name text not null,
  status public.entity_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_companies_code_format
    check (code ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  constraint finance_companies_name_nonempty
    check (char_length(trim(name)) > 0),
  constraint finance_companies_org_code_unique unique (organisation_id, code),
  constraint finance_companies_org_name_unique unique (organisation_id, name)
);

create index finance_companies_org_idx
  on public.finance_companies (organisation_id, status);

create trigger finance_companies_set_updated_at
before update on public.finance_companies
for each row execute function public.set_updated_at();

comment on table public.finance_companies is
  'Finance legal entities under a SentraCore organisation (group). Not organisations themselves.';

-- Seed initial companies under PayChex Group (idempotent on org+code)
insert into public.finance_companies (organisation_id, code, name, status)
select
  o.id,
  v.code,
  v.name,
  'active'::public.entity_status
from public.organisations o
cross join (
  values
    ('PAYCHEX', 'PayChex'),
    ('FORNIDO', 'Fornido'),
    ('TRIVNET', 'Trivnet'),
    ('DIAMOND_HEIRS', 'Diamond Heirs'),
    ('INOVATIVA', 'Inovativa'),
    ('ICEPYRAMID', 'IcePyramid'),
    ('FAMILY_DEPOT', 'Family Depot'),
    ('KAFAKUWO', 'Kafakuwo'),
    ('LECOLLECTIF', 'LeCollectIF'),
    ('NOUVELTECH', 'NouvelTech'),
    ('REIDACCESS', 'Reidaccess'),
    ('TELEMIX', 'Telemix')
) as v(code, name)
where o.slug = 'paychex'
on conflict (organisation_id, code) do update
set
  name = excluded.name,
  status = excluded.status,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Company access grants (independent of capabilities)
-- ---------------------------------------------------------------------------

create table public.finance_company_access (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_company_access_unique unique (profile_id, company_id)
);

create index finance_company_access_profile_idx
  on public.finance_company_access (profile_id);
create index finance_company_access_company_idx
  on public.finance_company_access (company_id);
create index finance_company_access_org_idx
  on public.finance_company_access (organisation_id, profile_id);

create or replace function public.finance_company_access_align_org()
returns trigger
language plpgsql
as $$
declare
  company_org uuid;
begin
  select organisation_id into company_org
  from public.finance_companies
  where id = new.company_id;

  if company_org is null then
    raise exception 'finance company % not found', new.company_id;
  end if;

  new.organisation_id := company_org;
  return new;
end;
$$;

create trigger finance_company_access_align_org
before insert or update on public.finance_company_access
for each row execute function public.finance_company_access_align_org();

comment on table public.finance_company_access is
  'Which profiles may access which Finance companies. Separate from platform_finance.* capabilities.';

-- ---------------------------------------------------------------------------
-- Capability grants (platform_finance.* — not FM finance.*)
-- ---------------------------------------------------------------------------

create table public.finance_capability_grants (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  capability text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_capability_grants_capability_format
    check (capability ~ '^platform_finance\.[a-z0-9_]+$'),
  constraint finance_capability_grants_unique
    unique (profile_id, organisation_id, capability)
);

create index finance_capability_grants_profile_idx
  on public.finance_capability_grants (profile_id, organisation_id);

comment on table public.finance_capability_grants is
  'Explicit Platform Finance capability grants. Never derived from FM finance.* or executive role name.';

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------

create or replace function public.has_finance_company_access(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_company_access a
    where a.company_id = p_company_id
      and a.profile_id = auth.uid()
  );
$$;

create or replace function public.has_finance_capability(
  p_organisation_id uuid,
  p_capability text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.finance_capability_grants g
    where g.organisation_id = p_organisation_id
      and g.profile_id = auth.uid()
      and g.capability = p_capability
  );
$$;

revoke all on function public.has_finance_company_access(uuid) from public;
revoke all on function public.has_finance_capability(uuid, text) from public;
grant execute on function public.has_finance_company_access(uuid) to authenticated;
grant execute on function public.has_finance_capability(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Chart of Accounts (organisation-level; postings are company-scoped)
-- ---------------------------------------------------------------------------

create table public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  name text not null,
  account_type text not null,
  classification text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_accounts_code_nonempty check (char_length(trim(code)) > 0),
  constraint finance_accounts_name_nonempty check (char_length(trim(name)) > 0),
  constraint finance_accounts_type_check
    check (
      account_type in (
        'asset',
        'liability',
        'equity',
        'revenue',
        'expense'
      )
    ),
  constraint finance_accounts_status_check
    check (status in ('active', 'inactive')),
  constraint finance_accounts_org_code_unique unique (organisation_id, code)
);

create index finance_accounts_org_status_idx
  on public.finance_accounts (organisation_id, status);

create trigger finance_accounts_set_updated_at
before update on public.finance_accounts
for each row execute function public.set_updated_at();

comment on table public.finance_accounts is
  'Organisation Chart of Accounts. Shared across companies; Journal lines always post in a company book.';

-- Minimal structural COA for foundation testing (not a full Nigerian chart)
insert into public.finance_accounts (
  organisation_id, code, name, account_type, classification, status
)
select
  o.id,
  v.code,
  v.name,
  v.account_type,
  v.classification,
  'active'
from public.organisations o
cross join (
  values
    ('1000', 'Cash', 'asset', 'current_asset'),
    ('2000', 'Accounts Payable', 'liability', 'current_liability'),
    ('3000', 'Equity', 'equity', 'equity'),
    ('4000', 'Revenue', 'revenue', 'operating_revenue'),
    ('5000', 'Operating Expense', 'expense', 'operating_expense')
) as v(code, name, account_type, classification)
where o.slug = 'paychex'
on conflict (organisation_id, code) do update
set
  name = excluded.name,
  account_type = excluded.account_type,
  classification = excluded.classification,
  status = excluded.status,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Accounting periods (company-owned; no reopen in v1)
-- ---------------------------------------------------------------------------

create table public.finance_periods (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete cascade,
  year int not null,
  month int not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open',
  closed_at timestamptz,
  closed_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_periods_month_check check (month between 1 and 12),
  constraint finance_periods_year_check check (year between 2000 and 2100),
  constraint finance_periods_range_check check (start_date <= end_date),
  constraint finance_periods_status_check check (status in ('open', 'closed')),
  constraint finance_periods_closed_fields_check
    check (
      (status = 'open' and closed_at is null and closed_by_profile_id is null)
      or (status = 'closed' and closed_at is not null)
    ),
  constraint finance_periods_company_year_month_unique unique (company_id, year, month)
);

create index finance_periods_company_status_idx
  on public.finance_periods (company_id, status);

create trigger finance_periods_set_updated_at
before update on public.finance_periods
for each row execute function public.set_updated_at();

create or replace function public.finance_periods_align_org()
returns trigger
language plpgsql
as $$
declare
  company_org uuid;
begin
  select organisation_id into company_org
  from public.finance_companies
  where id = new.company_id;

  if company_org is null then
    raise exception 'finance company % not found', new.company_id;
  end if;

  new.organisation_id := company_org;
  return new;
end;
$$;

create trigger finance_periods_align_org
before insert or update of company_id on public.finance_periods
for each row execute function public.finance_periods_align_org();

-- Reject reopen and casual mutation of closed periods
create or replace function public.finance_periods_enforce_closed_immutability()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'closed' then
    if new.status = 'open' then
      raise exception 'finance period reopen is not allowed in v1';
    end if;
    if new.start_date is distinct from old.start_date
      or new.end_date is distinct from old.end_date
      or new.year is distinct from old.year
      or new.month is distinct from old.month
      or new.company_id is distinct from old.company_id
    then
      raise exception 'closed finance periods are immutable';
    end if;
  end if;
  return new;
end;
$$;

create trigger finance_periods_enforce_closed_immutability
before update on public.finance_periods
for each row execute function public.finance_periods_enforce_closed_immutability();

comment on table public.finance_periods is
  'Company accounting periods. Closed periods are immutable; no reopen in v1.';

-- ---------------------------------------------------------------------------
-- Financial transactions (economic events — NOT the Journal)
-- ---------------------------------------------------------------------------

create table public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  reference text not null,
  transaction_date date not null,
  transaction_type text not null,
  description text not null,
  amount numeric(18, 2),
  currency text not null default 'NGN',
  status text not null default 'draft',
  source_type text,
  source_id text,
  metadata jsonb not null default '{}'::jsonb,
  journal_entry_id uuid,
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  posted_at timestamptz,
  posted_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_transactions_reference_nonempty
    check (char_length(trim(reference)) > 0),
  constraint finance_transactions_description_nonempty
    check (char_length(trim(description)) > 0),
  constraint finance_transactions_currency_nonempty
    check (char_length(trim(currency)) > 0),
  constraint finance_transactions_amount_check
    check (amount is null or amount >= 0),
  constraint finance_transactions_type_check
    check (
      transaction_type in (
        'foundation',
        'adjustment',
        'reversal',
        'expense',
        'payment',
        'receipt',
        'transfer',
        'other'
      )
    ),
  constraint finance_transactions_status_check
    check (status in ('draft', 'posted', 'voided')),
  constraint finance_transactions_company_reference_unique unique (company_id, reference)
);

create index finance_transactions_company_date_idx
  on public.finance_transactions (company_id, transaction_date desc, created_at desc);
create index finance_transactions_org_status_idx
  on public.finance_transactions (organisation_id, status);
create unique index finance_transactions_journal_uidx
  on public.finance_transactions (journal_entry_id)
  where journal_entry_id is not null;

create trigger finance_transactions_set_updated_at
before update on public.finance_transactions
for each row execute function public.set_updated_at();

create or replace function public.finance_transactions_align_org()
returns trigger
language plpgsql
as $$
declare
  company_org uuid;
begin
  select organisation_id into company_org
  from public.finance_companies
  where id = new.company_id;

  if company_org is null then
    raise exception 'finance company % not found', new.company_id;
  end if;

  new.organisation_id := company_org;
  return new;
end;
$$;

create trigger finance_transactions_align_org
before insert or update of company_id on public.finance_transactions
for each row execute function public.finance_transactions_align_org();

comment on table public.finance_transactions is
  'Economic / business financial events. Distinct from Journal accounting postings.';

-- ---------------------------------------------------------------------------
-- Journal (accounting source of truth when posted)
-- ---------------------------------------------------------------------------

create table public.finance_journal_entries (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  period_id uuid not null references public.finance_periods (id) on delete restrict,
  transaction_id uuid not null references public.finance_transactions (id) on delete restrict,
  entry_date date not null,
  reference text not null,
  description text not null,
  status text not null default 'posted',
  posted_at timestamptz not null default timezone('utc', now()),
  posted_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_journal_entries_status_check
    check (status in ('draft', 'posted')),
  constraint finance_journal_entries_reference_nonempty
    check (char_length(trim(reference)) > 0),
  constraint finance_journal_entries_description_nonempty
    check (char_length(trim(description)) > 0),
  constraint finance_journal_entries_transaction_unique unique (transaction_id)
);

create index finance_journal_entries_company_period_idx
  on public.finance_journal_entries (company_id, period_id, entry_date desc);
create index finance_journal_entries_org_posted_idx
  on public.finance_journal_entries (organisation_id, posted_at desc);

comment on table public.finance_journal_entries is
  'Accounting Journal headers. Posted entries are immutable. One entry per FinancialTransaction.';

create table public.finance_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.finance_journal_entries (id) on delete restrict,
  account_id uuid not null references public.finance_accounts (id) on delete restrict,
  line_no int not null,
  description text,
  debit numeric(18, 2) not null default 0,
  credit numeric(18, 2) not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_journal_lines_line_no_positive check (line_no > 0),
  constraint finance_journal_lines_amounts_nonnegative
    check (debit >= 0 and credit >= 0),
  constraint finance_journal_lines_xor_debit_credit
    check (
      (debit > 0 and credit = 0)
      or (credit > 0 and debit = 0)
    ),
  constraint finance_journal_lines_entry_line_unique unique (journal_entry_id, line_no)
);

create index finance_journal_lines_entry_idx
  on public.finance_journal_lines (journal_entry_id);
create index finance_journal_lines_account_idx
  on public.finance_journal_lines (account_id);

comment on table public.finance_journal_lines is
  'Journal debit/credit lines. Exactly one of debit or credit must be positive.';

-- FK from transactions.journal_entry_id after journal table exists
alter table public.finance_transactions
  add constraint finance_transactions_journal_fk
  foreign key (journal_entry_id)
  references public.finance_journal_entries (id)
  on delete restrict;

-- Posted journal immutability
-- Entry INSERT (including status=posted) is allowed for the posting engine.
-- Entry UPDATE/DELETE when status=posted is rejected.
-- Line INSERT is allowed when creating a posted entry (posting inserts header then lines).
-- Line UPDATE/DELETE is rejected when the parent entry is posted.
create or replace function public.finance_journal_entries_reject_posted_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'posted' then
    raise exception 'posted journal entries cannot be deleted';
  end if;
  if tg_op = 'UPDATE' and old.status = 'posted' then
    raise exception 'posted journal entries cannot be updated';
  end if;
  return coalesce(new, old);
end;
$$;

create or replace function public.finance_journal_lines_reject_posted_mutation()
returns trigger
language plpgsql
as $$
declare
  entry_status text;
begin
  -- INSERT is intentionally not wired to this trigger (posting engine).
  if tg_op not in ('UPDATE', 'DELETE') then
    return coalesce(new, old);
  end if;

  select status into entry_status
  from public.finance_journal_entries
  where id = coalesce(new.journal_entry_id, old.journal_entry_id);

  if entry_status = 'posted' then
    raise exception 'posted journal lines cannot be updated or deleted';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger finance_journal_entries_no_posted_update
before update on public.finance_journal_entries
for each row execute function public.finance_journal_entries_reject_posted_mutation();

create trigger finance_journal_entries_no_posted_delete
before delete on public.finance_journal_entries
for each row execute function public.finance_journal_entries_reject_posted_mutation();

-- UPDATE/DELETE only — INSERT remains allowed so posting can attach lines to a posted entry.
create trigger finance_journal_lines_no_posted_mutate
before update or delete on public.finance_journal_lines
for each row execute function public.finance_journal_lines_reject_posted_mutation();

-- ---------------------------------------------------------------------------
-- Finance audit (append-only; profile IDs)
-- ---------------------------------------------------------------------------

create table public.finance_audit_events (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid references public.finance_companies (id) on delete set null,
  actor_profile_id uuid not null references public.profiles (id) on delete restrict,
  action text not null,
  object_type text not null,
  object_id text not null,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_audit_events_action_nonempty
    check (char_length(trim(action)) > 0),
  constraint finance_audit_events_object_type_nonempty
    check (char_length(trim(object_type)) > 0),
  constraint finance_audit_events_object_id_nonempty
    check (char_length(trim(object_id)) > 0)
);

create index finance_audit_events_org_created_idx
  on public.finance_audit_events (organisation_id, created_at desc);
create index finance_audit_events_company_created_idx
  on public.finance_audit_events (company_id, created_at desc)
  where company_id is not null;
create index finance_audit_events_object_idx
  on public.finance_audit_events (object_type, object_id, created_at desc);

create or replace function public.finance_audit_events_reject_mutate()
returns trigger
language plpgsql
as $$
begin
  raise exception 'finance_audit_events is append-only';
end;
$$;

create trigger finance_audit_events_no_update
before update on public.finance_audit_events
for each row execute function public.finance_audit_events_reject_mutate();

create trigger finance_audit_events_no_delete
before delete on public.finance_audit_events
for each row execute function public.finance_audit_events_reject_mutate();

comment on table public.finance_audit_events is
  'Platform Finance audit trail. Append-only; actor is profiles.id.';

-- ---------------------------------------------------------------------------
-- Derived reporting views (Journal is SoT — no duplicate balance tables)
-- ---------------------------------------------------------------------------

create or replace view public.finance_general_ledger_v
with (security_invoker = true)
as
select
  e.organisation_id,
  e.company_id,
  e.period_id,
  e.id as journal_entry_id,
  e.transaction_id,
  e.entry_date,
  e.reference as entry_reference,
  e.description as entry_description,
  e.posted_at,
  l.id as journal_line_id,
  l.line_no,
  l.account_id,
  a.code as account_code,
  a.name as account_name,
  a.account_type,
  l.description as line_description,
  l.debit,
  l.credit
from public.finance_journal_entries e
join public.finance_journal_lines l on l.journal_entry_id = e.id
join public.finance_accounts a on a.id = l.account_id
where e.status = 'posted';

create or replace view public.finance_trial_balance_v
with (security_invoker = true)
as
select
  organisation_id,
  company_id,
  period_id,
  account_id,
  account_code,
  account_name,
  account_type,
  sum(debit) as total_debit,
  sum(credit) as total_credit,
  sum(debit) - sum(credit) as net_debit
from public.finance_general_ledger_v
group by
  organisation_id,
  company_id,
  period_id,
  account_id,
  account_code,
  account_name,
  account_type;

comment on view public.finance_general_ledger_v is
  'Derived General Ledger from posted Journal lines.';
comment on view public.finance_trial_balance_v is
  'Derived Trial Balance from posted Journal lines.';
