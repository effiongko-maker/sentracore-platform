-- Phase 2F-B: issued Invoice -> authoritative Receivable subledger.
-- Non-posting: invoice issue already recognised Dr 1070 / Cr Revenue.

create table public.finance_receivables (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete restrict,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  invoice_id uuid not null references public.finance_invoices (id) on delete restrict,
  counterparty_id uuid not null references public.organisation_counterparties (id) on delete restrict,
  invoice_reference text not null,
  invoice_date date not null,
  due_date date not null,
  currency text not null,
  original_amount numeric(18, 2) not null,
  counterparty_display_name text not null,
  counterparty_legal_name text,
  counterparty_tax_registration_id text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_receivables_invoice_unique unique (invoice_id),
  constraint finance_receivables_amount_positive check (original_amount > 0),
  constraint finance_receivables_reference_nonempty check (char_length(trim(invoice_reference)) > 0),
  constraint finance_receivables_counterparty_name_nonempty check (char_length(trim(counterparty_display_name)) > 0)
);

create index finance_receivables_org_company_due_idx
  on public.finance_receivables (organisation_id, company_id, due_date);
create index finance_receivables_counterparty_idx on public.finance_receivables (counterparty_id);

create or replace function public.finance_receivable_validate_source()
returns trigger language plpgsql set search_path = public as $$
declare v_invoice public.finance_invoices%rowtype;
begin
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
end;
$$;

create trigger finance_receivable_validate_source before insert on public.finance_receivables
for each row execute function public.finance_receivable_validate_source();

create or replace function public.finance_receivable_reject_mutation()
returns trigger language plpgsql as $$
begin raise exception 'finance receivable: receivables are immutable'; end;
$$;
create trigger finance_receivable_no_update before update on public.finance_receivables
for each row execute function public.finance_receivable_reject_mutation();
create trigger finance_receivable_no_delete before delete on public.finance_receivables
for each row execute function public.finance_receivable_reject_mutation();

create or replace function public.finance_invoice_ensure_receivable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status is distinct from 'issued') then
    insert into public.finance_receivables (invoice_id) values (new.id)
    on conflict (invoice_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger finance_invoice_ensure_receivable
after insert or update of status on public.finance_invoices
for each row execute function public.finance_invoice_ensure_receivable();

-- Idempotent backfill. No invoice, FT, JE, or JL is mutated or created.
insert into public.finance_receivables (invoice_id)
select id from public.finance_invoices where status = 'issued'
on conflict (invoice_id) do nothing;

insert into public.finance_capability_grants (organisation_id, profile_id, capability)
select organisation_id, profile_id, 'platform_finance.receivable.view'
from public.finance_capability_grants where capability = 'platform_finance.invoice.view'
on conflict (profile_id, organisation_id, capability) do nothing;

alter table public.finance_receivables enable row level security;
create policy finance_receivables_select on public.finance_receivables
for select to authenticated using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.receivable.view')
);
grant select on table public.finance_receivables to authenticated;
grant all on table public.finance_receivables to service_role;

comment on table public.finance_receivables is
  'Immutable AR subledger obligations derived once from issued invoices. In 2F-B outstanding equals original_amount.';
