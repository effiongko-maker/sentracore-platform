-- Platform Finance — live client receivables that did NOT originate from a SentraCore™-issued invoice.
--
-- Platform Finance is the system of record for money the client owes PayChex. Until now a receivable could only
-- be derived from an issued, GL-recognised finance_invoice. Live client requests billed OUTSIDE SentraCore™ (the
-- NCC "Pending Payments" register: job payment requests and contract instalments already sent to the client)
-- must become actionable receivables WITHOUT fabricating a SentraCore™ invoice, journal, FM claim or authorisation.
--
-- Additive and minimal:
--   * origin_type: 'invoice' (default — existing behaviour byte-for-byte), 'client_request', 'contract_instalment'.
--   * Non-invoice receivables are OFF-LEDGER: invoice_id / invoice_reference / invoice_date are NULL (never
--     misused), no journal is created, and they are admitted ONLY with governed migration provenance.
--   * Source facts are carried in their own columns: client_reference (the source's own invoice/request number),
--     submitted_on, description, source_location (client processing point) and source_update (latest note) —
--     verbatim, immutable (the existing no-update/no-delete triggers still apply to every receivable).
--   * historical_fact_id: optional, unique link to the immutable Platform Finance historical commercial fact that
--     evidences the same obligation. The fact is referenced, never copied or mutated.
--   * Settlement stays the existing finance_receipts + finance_receipt_allocations mechanism (unchanged).

alter table public.finance_receivables
  add column origin_type text not null default 'invoice',
  add column client_reference text,
  add column submitted_on date,
  add column description text,
  add column source_location text,
  add column source_update text,
  add column historical_fact_id uuid;

alter table public.finance_receivables alter column invoice_id drop not null;
alter table public.finance_receivables alter column invoice_reference drop not null;
alter table public.finance_receivables alter column invoice_date drop not null;
alter table public.finance_receivables alter column due_date drop not null;

alter table public.finance_receivables
  add constraint finance_receivables_origin_type_check
    check (origin_type in ('invoice', 'client_request', 'contract_instalment')),
  -- Invoice-origin receivables keep every invoice field required (as before); non-invoice ones never carry them.
  add constraint finance_receivables_invoice_origin_shape check (
    (origin_type = 'invoice'
      and invoice_id is not null and invoice_reference is not null and invoice_date is not null and due_date is not null
      and client_reference is null and submitted_on is null and historical_fact_id is null)
    or
    (origin_type <> 'invoice'
      and invoice_id is null and invoice_reference is null and invoice_date is null
      and client_reference is not null and char_length(trim(client_reference)) > 0
      and submitted_on is not null
      and description is not null and char_length(trim(description)) > 0)
  ),
  add constraint finance_receivables_historical_fact_unique unique (historical_fact_id),
  add constraint finance_receivables_historical_fact_fk
    foreign key (organisation_id, historical_fact_id)
    references public.platform_finance_historical_commercial_facts (organisation_id, id) on delete restrict;

comment on column public.finance_receivables.origin_type is
  'invoice = derived from an issued SentraCore™ invoice (GL-recognised). client_request / contract_instalment = live client billing made outside SentraCore™, off-ledger, provenance-backed.';
comment on column public.finance_receivables.client_reference is
  'Non-invoice origin only: the source''s own invoice/request number, verbatim. Not a SentraCore™ invoice reference.';
comment on column public.finance_receivables.historical_fact_id is
  'Optional link to the immutable historical commercial fact evidencing the same obligation. Referenced, never copied.';

-- Source validation: the invoice branch is the existing rule, unchanged. Non-invoice receivables are admitted only
-- with migration provenance written first (deterministic id), and take their counterparty snapshot from the master.
create or replace function public.finance_receivable_validate_source()
returns trigger language plpgsql set search_path = public as $$
declare
  v_invoice public.finance_invoices%rowtype;
  v_counterparty public.organisation_counterparties%rowtype;
begin
  if new.origin_type = 'invoice' then
    select * into v_invoice from public.finance_invoices where id = new.invoice_id;
    if not found or v_invoice.status <> 'issued' then
      raise exception 'finance receivable: source invoice must be issued';
    end if;
    if v_invoice.finance_transaction_id is null or not exists (
      select 1 from public.finance_transactions t
      where t.id = v_invoice.finance_transaction_id
        and t.organisation_id = v_invoice.organisation_id
        and t.company_id = v_invoice.company_id
        and t.source_type = 'invoice'
        and t.source_id = v_invoice.id::text
        and t.status = 'posted'
        and t.journal_entry_id is not null
    ) then
      raise exception 'finance receivable: source invoice recognition is missing';
    end if;
    new.organisation_id := v_invoice.organisation_id;
    new.company_id := v_invoice.company_id;
    new.counterparty_id := v_invoice.counterparty_id;
    new.invoice_reference := v_invoice.reference;
    new.invoice_date := v_invoice.invoice_date;
    new.due_date := v_invoice.due_date;
    new.currency := v_invoice.currency;
    new.original_amount := v_invoice.total_amount;
    new.counterparty_display_name := v_invoice.counterparty_display_name;
    new.counterparty_legal_name := v_invoice.counterparty_legal_name;
    new.counterparty_tax_registration_id := v_invoice.counterparty_tax_registration_id;
    return new;
  end if;

  if not exists (
    select 1 from public.fm_migration_provenance p
    where p.organisation_id = new.organisation_id
      and p.target_table = 'finance_receivables'
      and p.target_id = new.id
  ) then
    raise exception 'finance receivable: a non-invoice receivable requires migration provenance';
  end if;
  if not exists (
    select 1 from public.finance_companies c where c.id = new.company_id and c.organisation_id = new.organisation_id
  ) then
    raise exception 'finance receivable: company is not in this organisation';
  end if;
  select * into v_counterparty from public.organisation_counterparties
  where id = new.counterparty_id and organisation_id = new.organisation_id;
  if not found or v_counterparty.status <> 'active' then
    raise exception 'finance receivable: counterparty is unavailable';
  end if;
  new.counterparty_display_name := v_counterparty.display_name;
  new.counterparty_legal_name := v_counterparty.legal_name;
  new.counterparty_tax_registration_id := v_counterparty.tax_registration_id;
  return new;
end;
$$;

-- Off-ledger receivables have no GL recognition, so a receipt allocated to one must never be POSTED (that would
-- credit AR that was never debited). Confirming such a receipt remains allowed — confirmation settles it.
create or replace function public.finance_receipt_reject_off_ledger_post()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'posted' and old.status is distinct from 'posted' and exists (
    select 1 from public.finance_receipt_allocations a
    join public.finance_receivables r on r.id = a.receivable_id
    where a.receipt_id = new.id and r.origin_type <> 'invoice'
  ) then
    raise exception 'finance receipt: allocated to an off-ledger receivable; it settles on confirmation and cannot be posted';
  end if;
  return new;
end;
$$;

create trigger finance_receipt_reject_off_ledger_post
before update of status on public.finance_receipts
for each row execute function public.finance_receipt_reject_off_ledger_post();

alter table public.fm_migration_provenance
  drop constraint fm_migration_provenance_target_check;
alter table public.fm_migration_provenance
  add constraint fm_migration_provenance_target_check
    check (target_table in (
      'fm_requests', 'fm_incidents', 'fm_assets', 'fm_work', 'fm_work_instructions',
      'fm_generator_logs', 'fm_diesel_usage', 'fm_consumables_items', 'fm_consumables_register_entries',
      'fm_buildings', 'fm_floors', 'fm_rooms', 'fm_departments', 'fm_cost_records',
      'platform_finance_historical_commercial_facts', 'fm_facilities', 'fm_work_facilities',
      'fm_approvals', 'finance_receivables'
    ));

comment on table public.finance_receivables is
  'Immutable AR subledger obligations. origin_type=invoice: derived once from issued invoices. Other origins: live client billing made outside SentraCore™, off-ledger, provenance-backed. Outstanding is derived from receipt allocations.';
