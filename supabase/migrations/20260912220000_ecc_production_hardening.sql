-- ECC production hardening: immutability + uniqueness (safe additive migration).

-- ---------------------------------------------------------------------------
-- Issue / request history: block DELETE (match audit append-only)
-- ---------------------------------------------------------------------------

create trigger ecc_issue_history_no_delete
before delete on public.ecc_issue_history
for each row execute function public.ecc_issue_history_reject_mutate();

create trigger ecc_request_history_no_delete
before delete on public.ecc_request_history
for each row execute function public.ecc_request_history_reject_mutate();

-- ---------------------------------------------------------------------------
-- Daily ops: at most one morning/evening submission per centre per reporting date
-- (ad_hoc remains unconstrained)
-- ---------------------------------------------------------------------------

create unique index ecc_daily_ops_period_day_uidx
  on public.ecc_daily_ops (
    organisation_id,
    centre_id,
    period,
    reporting_date
  )
  where period in ('morning', 'evening');

-- ---------------------------------------------------------------------------
-- Finance: preserve core fields; allow status (and budget supersede) updates only
-- ---------------------------------------------------------------------------

create or replace function public.ecc_finance_transactions_protect_core()
returns trigger
language plpgsql
as $$
begin
  if
    new.amount is distinct from old.amount
    or new.description is distinct from old.description
    or new.category is distinct from old.category
    or new.transaction_date is distinct from old.transaction_date
    or new.reference is distinct from old.reference
    or new.currency is distinct from old.currency
    or new.recorded_by is distinct from old.recorded_by
    or new.centre_id is distinct from old.centre_id
  then
    raise exception 'ecc_finance_transactions core fields are immutable';
  end if;
  return new;
end;
$$;

create trigger ecc_finance_transactions_protect_core
before update on public.ecc_finance_transactions
for each row execute function public.ecc_finance_transactions_protect_core();

create or replace function public.ecc_finance_commitments_protect_core()
returns trigger
language plpgsql
as $$
begin
  if
    new.expected_amount is distinct from old.expected_amount
    or new.description is distinct from old.description
    or new.category is distinct from old.category
    or new.currency is distinct from old.currency
    or new.recorded_by is distinct from old.recorded_by
    or new.centre_id is distinct from old.centre_id
  then
    raise exception 'ecc_finance_commitments core fields are immutable';
  end if;
  return new;
end;
$$;

create trigger ecc_finance_commitments_protect_core
before update on public.ecc_finance_commitments
for each row execute function public.ecc_finance_commitments_protect_core();

create or replace function public.ecc_finance_budgets_protect_core()
returns trigger
language plpgsql
as $$
begin
  if
    new.amount is distinct from old.amount
    or new.period_label is distinct from old.period_label
    or new.currency is distinct from old.currency
    or new.centre_id is distinct from old.centre_id
    or new.created_by is distinct from old.created_by
  then
    raise exception 'ecc_finance_budgets core fields are immutable; supersede instead';
  end if;
  return new;
end;
$$;

create trigger ecc_finance_budgets_protect_core
before update on public.ecc_finance_budgets
for each row execute function public.ecc_finance_budgets_protect_core();

-- ---------------------------------------------------------------------------
-- Revoke destructive authenticated grants (API uses service role)
-- Direct browser JWT cannot delete operational ECC rows.
-- ---------------------------------------------------------------------------

revoke delete on table public.ecc_issues from authenticated;
revoke delete on table public.ecc_people from authenticated;
revoke delete on table public.ecc_shifts from authenticated;
revoke delete on table public.ecc_shift_assignments from authenticated;
revoke delete on table public.ecc_daily_ops_issue_links from authenticated;
revoke delete on table public.ecc_daily_ops_request_links from authenticated;
