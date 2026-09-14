-- ECC Finance — operational financial tracking for a centre.
-- Organisation-scoped + centre-scoped. Not the organisation-wide Finance module.
-- History is preserved: no destructive budget overwrites; supersede instead.

-- ---------------------------------------------------------------------------
-- Categories / statuses (text + check constraints)
-- ---------------------------------------------------------------------------

-- Operational budgets (append new active row; prior active → superseded)
create table public.ecc_finance_budgets (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  period_label text not null,
  amount numeric(18, 2) not null,
  currency text not null default 'NGN',
  status text not null default 'active',
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_finance_budgets_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_finance_budgets_period_nonempty check (char_length(trim(period_label)) > 0),
  constraint ecc_finance_budgets_amount_check check (amount >= 0),
  constraint ecc_finance_budgets_currency_nonempty check (char_length(trim(currency)) > 0),
  constraint ecc_finance_budgets_created_by_nonempty check (char_length(trim(created_by)) > 0),
  constraint ecc_finance_budgets_status_check
    check (status in ('active', 'superseded', 'closed')),
  constraint ecc_finance_budgets_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_finance_budgets_org_centre_idx
  on public.ecc_finance_budgets (organisation_id, centre_id, created_at desc);

create unique index ecc_finance_budgets_one_active_uidx
  on public.ecc_finance_budgets (organisation_id, centre_id)
  where status = 'active';

create trigger ecc_finance_budgets_set_updated_at
before update on public.ecc_finance_budgets
for each row execute function public.set_updated_at();

comment on table public.ecc_finance_budgets is
  'ECC operational budgets. At most one active budget per centre; history via superseded rows.';

-- Financial transactions (append-only; status may update)
create table public.ecc_finance_transactions (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  transaction_date date not null,
  reference text,
  description text not null,
  category text not null,
  amount numeric(18, 2) not null,
  currency text not null default 'NGN',
  status text not null,
  recorded_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_finance_transactions_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_finance_transactions_desc_nonempty check (char_length(trim(description)) > 0),
  constraint ecc_finance_transactions_amount_check check (amount >= 0),
  constraint ecc_finance_transactions_currency_nonempty check (char_length(trim(currency)) > 0),
  constraint ecc_finance_transactions_recorded_by_nonempty check (char_length(trim(recorded_by)) > 0),
  constraint ecc_finance_transactions_category_check
    check (
      category in (
        'facilities',
        'utilities',
        'connectivity_technical',
        'staffing_operations',
        'maintenance',
        'other'
      )
    ),
  constraint ecc_finance_transactions_status_check
    check (
      status in ('recorded', 'pending', 'settled', 'cancelled')
    ),
  constraint ecc_finance_transactions_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_finance_transactions_org_centre_date_idx
  on public.ecc_finance_transactions (
    organisation_id,
    centre_id,
    transaction_date desc,
    created_at desc
  );

create trigger ecc_finance_transactions_set_updated_at
before update on public.ecc_finance_transactions
for each row execute function public.set_updated_at();

comment on table public.ecc_finance_transactions is
  'ECC operational financial transactions for a centre.';

-- Commitments (append-only; status may update)
create table public.ecc_finance_commitments (
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  id text not null,
  centre_id text not null,
  description text not null,
  category text not null,
  expected_amount numeric(18, 2) not null,
  currency text not null default 'NGN',
  due_date date,
  status text not null,
  recorded_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (organisation_id, id),
  constraint ecc_finance_commitments_id_nonempty check (char_length(trim(id)) > 0),
  constraint ecc_finance_commitments_desc_nonempty check (char_length(trim(description)) > 0),
  constraint ecc_finance_commitments_amount_check check (expected_amount >= 0),
  constraint ecc_finance_commitments_currency_nonempty check (char_length(trim(currency)) > 0),
  constraint ecc_finance_commitments_recorded_by_nonempty check (char_length(trim(recorded_by)) > 0),
  constraint ecc_finance_commitments_category_check
    check (
      category in (
        'facilities',
        'utilities',
        'connectivity_technical',
        'staffing_operations',
        'maintenance',
        'other'
      )
    ),
  constraint ecc_finance_commitments_status_check
    check (
      status in ('pending', 'approved', 'due', 'settled', 'cancelled')
    ),
  constraint ecc_finance_commitments_centre_fk
    foreign key (organisation_id, centre_id)
    references public.ecc_centres (organisation_id, id)
);

create index ecc_finance_commitments_org_centre_idx
  on public.ecc_finance_commitments (organisation_id, centre_id, created_at desc);

create index ecc_finance_commitments_org_status_idx
  on public.ecc_finance_commitments (organisation_id, centre_id, status);

create trigger ecc_finance_commitments_set_updated_at
before update on public.ecc_finance_commitments
for each row execute function public.set_updated_at();

comment on table public.ecc_finance_commitments is
  'ECC operational commitments (approved/expected spend not yet settled).';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.ecc_finance_budgets enable row level security;
alter table public.ecc_finance_transactions enable row level security;
alter table public.ecc_finance_commitments enable row level security;

create policy ecc_finance_budgets_select on public.ecc_finance_budgets
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_finance_budgets_insert on public.ecc_finance_budgets
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_finance_budgets_update on public.ecc_finance_budgets
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_finance_transactions_select on public.ecc_finance_transactions
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_finance_transactions_insert on public.ecc_finance_transactions
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_finance_transactions_update on public.ecc_finance_transactions
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_finance_commitments_select on public.ecc_finance_commitments
for select to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_finance_commitments_insert on public.ecc_finance_commitments
for insert to authenticated
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

create policy ecc_finance_commitments_update on public.ecc_finance_commitments
for update to authenticated
using (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
)
with check (
  public.is_platform_super_admin()
  or public.is_org_member(organisation_id)
);

-- History-preserving: no delete grants for authenticated clients.
grant select, insert, update on public.ecc_finance_budgets to authenticated;
grant select, insert, update on public.ecc_finance_transactions to authenticated;
grant select, insert, update on public.ecc_finance_commitments to authenticated;

grant all on public.ecc_finance_budgets to service_role;
grant all on public.ecc_finance_transactions to service_role;
grant all on public.ecc_finance_commitments to service_role;
