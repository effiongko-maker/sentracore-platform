-- Phase 2F-A: Sales Invoices + Invoice Lines + recognition accounting.
-- ONE Invoice → ONE FT → ONE compound JE via existing finance_post_transaction.
-- No Receivable domain. No Receipt. No tax engine. No NRS.
-- Business ISSUED ≠ external fiscal clearance.

-- Capabilities
insert into public.finance_capability_grants (organisation_id, profile_id, capability)
select organisation_id, profile_id, 'platform_finance.invoice.view'
from public.finance_capability_grants
where capability = 'platform_finance.view'
on conflict (profile_id, organisation_id, capability) do nothing;

insert into public.finance_capability_grants (organisation_id, profile_id, capability)
select organisation_id, profile_id, 'platform_finance.invoice.create'
from public.finance_capability_grants
where capability = 'platform_finance.create_transaction'
on conflict (profile_id, organisation_id, capability) do nothing;

insert into public.finance_capability_grants (organisation_id, profile_id, capability)
select organisation_id, profile_id, 'platform_finance.invoice.review'
from public.finance_capability_grants
where capability = 'platform_finance.create_transaction'
on conflict (profile_id, organisation_id, capability) do nothing;

insert into public.finance_capability_grants (organisation_id, profile_id, capability)
select organisation_id, profile_id, 'platform_finance.invoice.issue'
from public.finance_capability_grants
where capability = 'platform_finance.post'
on conflict (profile_id, organisation_id, capability) do nothing;

-- Allow invoice actors to read counterparties
drop policy if exists organisation_counterparties_select on public.organisation_counterparties;
create policy organisation_counterparties_select on public.organisation_counterparties
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.counterparty.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.create')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.review')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.issue')
  )
);

drop policy if exists organisation_counterparty_roles_select on public.organisation_counterparty_roles;
create policy organisation_counterparty_roles_select on public.organisation_counterparty_roles
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.counterparty.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.counterparty.manage')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.create')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.review')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.issue')
  )
);

create table public.finance_invoices (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  company_id uuid not null references public.finance_companies (id) on delete restrict,
  reference text not null,
  counterparty_id uuid not null references public.organisation_counterparties (id) on delete restrict,
  invoice_date date not null,
  due_date date not null,
  currency text not null default 'NGN',
  description text,
  status text not null default 'draft',
  total_amount numeric(18, 2) not null default 0,
  -- Historical snapshot frozen at issue (not live master)
  counterparty_display_name text,
  counterparty_legal_name text,
  counterparty_tax_registration_id text,
  finance_transaction_id uuid references public.finance_transactions (id) on delete restrict,
  created_by_profile_id uuid not null references public.profiles (id) on delete restrict,
  reviewed_by_profile_id uuid references public.profiles (id) on delete set null,
  issued_by_profile_id uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  issued_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint finance_invoices_reference_nonempty
    check (char_length(trim(reference)) > 0),
  constraint finance_invoices_currency_check
    check (char_length(trim(currency)) = 3),
  constraint finance_invoices_status_check
    check (status in ('draft', 'under_review', 'issued')),
  constraint finance_invoices_amount_nonnegative
    check (total_amount >= 0 and total_amount = round(total_amount, 2)),
  constraint finance_invoices_due_on_or_after_invoice
    check (due_date >= invoice_date),
  constraint finance_invoices_issued_complete_check
    check (
      status <> 'issued'
      or (
        finance_transaction_id is not null
        and counterparty_display_name is not null
        and char_length(trim(counterparty_display_name)) > 0
        and total_amount > 0
        and issued_at is not null
        and issued_by_profile_id is not null
      )
    ),
  constraint finance_invoices_company_reference_unique unique (company_id, reference)
);

create index finance_invoices_org_company_status_idx
  on public.finance_invoices (organisation_id, company_id, status);
create index finance_invoices_counterparty_idx
  on public.finance_invoices (counterparty_id);
create unique index finance_invoices_ft_uidx
  on public.finance_invoices (finance_transaction_id)
  where finance_transaction_id is not null;

create trigger finance_invoices_set_updated_at
before update on public.finance_invoices
for each row execute function public.set_updated_at();

create or replace function public.finance_invoices_align_org()
returns trigger
language plpgsql
as $$
declare
  v_org uuid;
begin
  select organisation_id into v_org from public.finance_companies where id = new.company_id;
  if v_org is null then
    raise exception 'finance invoice: company not found';
  end if;
  new.organisation_id := v_org;
  return new;
end;
$$;

create trigger finance_invoices_align_org
before insert or update of company_id on public.finance_invoices
for each row execute function public.finance_invoices_align_org();

create or replace function public.finance_invoices_reject_issued_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status = 'issued' then
    raise exception 'finance invoice: issued invoices cannot be deleted';
  end if;
  if tg_op = 'UPDATE' and old.status = 'issued' then
    -- allow only no-op updates that do not change business fields (immutability)
    if old.company_id is distinct from new.company_id
      or old.reference is distinct from new.reference
      or old.counterparty_id is distinct from new.counterparty_id
      or old.invoice_date is distinct from new.invoice_date
      or old.due_date is distinct from new.due_date
      or old.currency is distinct from new.currency
      or old.description is distinct from new.description
      or old.total_amount is distinct from new.total_amount
      or old.counterparty_display_name is distinct from new.counterparty_display_name
      or old.counterparty_legal_name is distinct from new.counterparty_legal_name
      or old.counterparty_tax_registration_id is distinct from new.counterparty_tax_registration_id
      or old.finance_transaction_id is distinct from new.finance_transaction_id
      or old.status is distinct from new.status
    then
      raise exception 'finance invoice: issued invoices are immutable';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger finance_invoices_reject_issued_mutation
before update or delete on public.finance_invoices
for each row execute function public.finance_invoices_reject_issued_mutation();

comment on table public.finance_invoices is
  'Sales invoices (2F-A). ISSUED = business document + accounting recognition. Not NRS clearance. No Receivable subledger yet.';

create table public.finance_invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  invoice_id uuid not null references public.finance_invoices (id) on delete cascade,
  line_no int not null,
  description text not null,
  quantity numeric(18, 4) not null,
  unit_price numeric(18, 2) not null,
  line_amount numeric(18, 2) not null,
  revenue_gl_account_id uuid not null references public.finance_accounts (id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  constraint finance_invoice_lines_line_no_positive check (line_no > 0),
  constraint finance_invoice_lines_description_nonempty
    check (char_length(trim(description)) > 0),
  constraint finance_invoice_lines_quantity_positive check (quantity > 0),
  constraint finance_invoice_lines_unit_price_nonnegative
    check (unit_price >= 0 and unit_price = round(unit_price, 2)),
  constraint finance_invoice_lines_amount_positive
    check (line_amount > 0 and line_amount = round(line_amount, 2)),
  constraint finance_invoice_lines_invoice_line_unique unique (invoice_id, line_no)
);

create index finance_invoice_lines_invoice_idx
  on public.finance_invoice_lines (invoice_id);
create index finance_invoice_lines_revenue_gl_idx
  on public.finance_invoice_lines (revenue_gl_account_id);

create or replace function public.finance_invoice_lines_align_and_guard()
returns trigger
language plpgsql
as $$
declare
  v_inv public.finance_invoices%rowtype;
  v_account public.finance_accounts%rowtype;
  v_expected numeric(18, 2);
begin
  select * into v_inv from public.finance_invoices where id = new.invoice_id;
  if not found then
    raise exception 'finance invoice line: invoice not found';
  end if;
  if v_inv.status = 'issued' then
    raise exception 'finance invoice line: issued invoice lines are immutable';
  end if;
  if tg_op = 'UPDATE' and v_inv.status = 'under_review' then
    raise exception 'finance invoice line: under_review invoice lines are frozen';
  end if;
  if tg_op = 'INSERT' and v_inv.status = 'under_review' then
    raise exception 'finance invoice line: under_review invoice lines are frozen';
  end if;

  new.organisation_id := v_inv.organisation_id;
  v_expected := round(new.quantity * new.unit_price, 2);
  if new.line_amount is distinct from v_expected then
    raise exception 'finance invoice line: line_amount must equal round(quantity * unit_price, 2)';
  end if;

  select * into v_account from public.finance_accounts where id = new.revenue_gl_account_id;
  if not found
     or v_account.organisation_id <> v_inv.organisation_id
     or v_account.status <> 'active'
     or v_account.account_type <> 'revenue'
     or v_account.code !~ '^[0-9]{4}$'
     or v_account.code::int < 4000
     or v_account.code::int > 4040
  then
    raise exception 'finance invoice line: revenue GL is unavailable';
  end if;

  return new;
end;
$$;

create trigger finance_invoice_lines_align_and_guard
before insert or update on public.finance_invoice_lines
for each row execute function public.finance_invoice_lines_align_and_guard();

create or replace function public.finance_invoice_lines_reject_issued_delete()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from public.finance_invoices where id = old.invoice_id;
  if v_status in ('issued', 'under_review') then
    raise exception 'finance invoice line: cannot delete lines on % invoices', v_status;
  end if;
  return old;
end;
$$;

create trigger finance_invoice_lines_reject_issued_delete
before delete on public.finance_invoice_lines
for each row execute function public.finance_invoice_lines_reject_issued_delete();

-- One recognition FT per Invoice
create unique index finance_transactions_invoice_source_uidx
  on public.finance_transactions (source_id)
  where source_type = 'invoice' and source_id is not null;

-- Helpers
create or replace function public.finance_invoice_ar_control_account_id(p_organisation_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.finance_accounts
  where organisation_id = p_organisation_id
    and code = '1070'
    and account_type = 'asset'
    and classification = 'current_asset'
    and status = 'active';
  if v_id is null then
    raise exception 'finance invoice: Trade AR (1070) is unavailable';
  end if;
  return v_id;
end;
$$;

create or replace function public.finance_invoice_recompute_total(p_invoice_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric(18, 2);
begin
  select coalesce(round(sum(line_amount), 2), 0) into v_total
  from public.finance_invoice_lines
  where invoice_id = p_invoice_id;

  update public.finance_invoices
  set total_amount = v_total
  where id = p_invoice_id
    and status in ('draft', 'under_review');

  return v_total;
end;
$$;

revoke all on function public.finance_invoice_ar_control_account_id(uuid) from public;
revoke all on function public.finance_invoice_ar_control_account_id(uuid) from anon, authenticated;
grant execute on function public.finance_invoice_ar_control_account_id(uuid) to service_role;

revoke all on function public.finance_invoice_recompute_total(uuid) from public;
revoke all on function public.finance_invoice_recompute_total(uuid) from anon, authenticated;
grant execute on function public.finance_invoice_recompute_total(uuid) to service_role;

-- Atomic draft create/update primitives. Business authority is always an
-- explicit capability grant; platform super-admin status is not consulted.
create or replace function public.finance_invoice_replace_draft_lines(
  p_invoice_id uuid,
  p_lines jsonb
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.finance_invoices%rowtype;
  v_line jsonb;
  v_count int := 0;
begin
  select * into v_inv from public.finance_invoices where id = p_invoice_id for update;
  if not found then raise exception 'finance invoice: not found'; end if;
  if v_inv.status <> 'draft' then raise exception 'finance invoice: only drafts can be edited'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 1 then
    raise exception 'finance invoice: at least one line is required';
  end if;

  delete from public.finance_invoice_lines where invoice_id = p_invoice_id;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_count := v_count + 1;
    insert into public.finance_invoice_lines (
      organisation_id, invoice_id, line_no, description, quantity,
      unit_price, line_amount, revenue_gl_account_id
    ) values (
      v_inv.organisation_id, p_invoice_id, v_count, trim(v_line->>'description'),
      (v_line->>'quantity')::numeric, (v_line->>'unit_price')::numeric,
      (v_line->>'line_amount')::numeric, (v_line->>'revenue_gl_account_id')::uuid
    );
  end loop;
  return public.finance_invoice_recompute_total(p_invoice_id);
end;
$$;

create or replace function public.finance_invoice_create_draft(
  p_actor_profile_id uuid,
  p_organisation_id uuid,
  p_company_id uuid,
  p_reference text,
  p_counterparty_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_currency text,
  p_description text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.finance_payable_actor_has_capability(
    p_organisation_id, p_actor_profile_id, 'platform_finance.invoice.create'
  ) then raise exception 'finance invoice: missing create authority'; end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, p_company_id) then
    raise exception 'finance invoice: no company access';
  end if;
  if not exists (
    select 1 from public.organisation_counterparties c
    join public.organisation_counterparty_roles r on r.counterparty_id = c.id and r.role = 'customer'
    where c.id = p_counterparty_id and c.organisation_id = p_organisation_id and c.status = 'active'
  ) then raise exception 'finance invoice: active customer counterparty required'; end if;

  insert into public.finance_invoices (
    organisation_id, company_id, reference, counterparty_id, invoice_date,
    due_date, currency, description, status, created_by_profile_id
  ) values (
    p_organisation_id, p_company_id, trim(p_reference), p_counterparty_id,
    p_invoice_date, p_due_date, upper(trim(p_currency)), nullif(trim(p_description), ''),
    'draft', p_actor_profile_id
  ) returning id into v_id;
  perform public.finance_invoice_replace_draft_lines(v_id, p_lines);
  return v_id;
end;
$$;

create or replace function public.finance_invoice_update_draft(
  p_actor_profile_id uuid,
  p_invoice_id uuid,
  p_counterparty_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_currency text,
  p_description text,
  p_lines jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.finance_invoices%rowtype;
begin
  select * into v_inv from public.finance_invoices where id = p_invoice_id for update;
  if not found then raise exception 'finance invoice: not found'; end if;
  if v_inv.status <> 'draft' then raise exception 'finance invoice: only drafts can be edited'; end if;
  if not public.finance_payable_actor_has_capability(
    v_inv.organisation_id, p_actor_profile_id, 'platform_finance.invoice.create'
  ) then raise exception 'finance invoice: missing create authority'; end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_inv.company_id) then
    raise exception 'finance invoice: no company access';
  end if;
  if not exists (
    select 1 from public.organisation_counterparties c
    join public.organisation_counterparty_roles r on r.counterparty_id = c.id and r.role = 'customer'
    where c.id = p_counterparty_id and c.organisation_id = v_inv.organisation_id and c.status = 'active'
  ) then raise exception 'finance invoice: active customer counterparty required'; end if;

  update public.finance_invoices set
    counterparty_id = p_counterparty_id,
    invoice_date = p_invoice_date,
    due_date = p_due_date,
    currency = upper(trim(p_currency)),
    description = nullif(trim(p_description), '')
  where id = p_invoice_id;
  if p_lines is not null then
    perform public.finance_invoice_replace_draft_lines(p_invoice_id, p_lines);
  end if;
  return p_invoice_id;
end;
$$;

revoke all on function public.finance_invoice_replace_draft_lines(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.finance_invoice_create_draft(uuid, uuid, uuid, text, uuid, date, date, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.finance_invoice_update_draft(uuid, uuid, uuid, date, date, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.finance_invoice_replace_draft_lines(uuid, jsonb) to service_role;
grant execute on function public.finance_invoice_create_draft(uuid, uuid, uuid, text, uuid, date, date, text, text, jsonb) to service_role;
grant execute on function public.finance_invoice_update_draft(uuid, uuid, uuid, date, date, text, text, jsonb) to service_role;

-- Submit / return
create or replace function public.finance_invoice_submit_for_review(
  p_actor_profile_id uuid,
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.finance_invoices%rowtype;
  v_total numeric(18, 2);
  v_lines int;
begin
  select * into v_inv from public.finance_invoices where id = p_invoice_id for update;
  if not found then raise exception 'finance invoice: not found'; end if;
  if v_inv.status <> 'draft' then raise exception 'finance invoice: only draft can be submitted'; end if;

  if not public.finance_payable_actor_has_capability(
    v_inv.organisation_id, p_actor_profile_id, 'platform_finance.invoice.create'
  ) and not public.finance_payable_actor_has_capability(
    v_inv.organisation_id, p_actor_profile_id, 'platform_finance.invoice.review'
  ) then
    raise exception 'finance invoice: missing submit authority';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_inv.company_id) then
    raise exception 'finance invoice: no company access';
  end if;

  select count(*) into v_lines from public.finance_invoice_lines where invoice_id = v_inv.id;
  if v_lines < 1 then raise exception 'finance invoice: at least one line is required'; end if;
  v_total := public.finance_invoice_recompute_total(v_inv.id);
  if v_total <= 0 then raise exception 'finance invoice: total must be greater than zero'; end if;

  update public.finance_invoices
  set status = 'under_review',
      reviewed_by_profile_id = p_actor_profile_id,
      reviewed_at = timezone('utc', now()),
      total_amount = v_total
  where id = v_inv.id;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action, object_type, object_id, details
  ) values (
    v_inv.organisation_id, v_inv.company_id, p_actor_profile_id,
    'finance.invoice.submitted', 'finance_invoice', v_inv.id::text,
    jsonb_build_object('total_amount', v_total)
  );

  return v_inv.id;
end;
$$;

create or replace function public.finance_invoice_return_to_draft(
  p_actor_profile_id uuid,
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.finance_invoices%rowtype;
begin
  select * into v_inv from public.finance_invoices where id = p_invoice_id for update;
  if not found then raise exception 'finance invoice: not found'; end if;
  if v_inv.status <> 'under_review' then raise exception 'finance invoice: only under_review can return to draft'; end if;

  if not public.finance_payable_actor_has_capability(
    v_inv.organisation_id, p_actor_profile_id, 'platform_finance.invoice.review'
  ) and not public.finance_payable_actor_has_capability(
    v_inv.organisation_id, p_actor_profile_id, 'platform_finance.invoice.create'
  ) then
    raise exception 'finance invoice: missing return-to-draft authority';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_inv.company_id) then
    raise exception 'finance invoice: no company access';
  end if;

  update public.finance_invoices
  set status = 'draft',
      reviewed_by_profile_id = null,
      reviewed_at = null
  where id = v_inv.id;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action, object_type, object_id
  ) values (
    v_inv.organisation_id, v_inv.company_id, p_actor_profile_id,
    'finance.invoice.returned_to_draft', 'finance_invoice', v_inv.id::text
  );

  return v_inv.id;
end;
$$;

-- Atomic issue + post
create or replace function public.finance_invoice_issue_and_post(
  p_actor_profile_id uuid,
  p_invoice_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.finance_invoices%rowtype;
  v_cp public.organisation_counterparties%rowtype;
  v_ft_id uuid;
  v_je_id uuid;
  v_ar uuid;
  v_total numeric(18, 2);
  v_lines jsonb := '[]'::jsonb;
  v_period uuid;
  r record;
begin
  select * into v_inv from public.finance_invoices where id = p_invoice_id for update;
  if not found then raise exception 'finance invoice: not found'; end if;

  if v_inv.status = 'issued' then
    return v_inv.id;
  end if;
  if v_inv.status <> 'under_review' then
    raise exception 'finance invoice: only under_review invoices can be issued';
  end if;

  if not public.finance_payable_actor_has_capability(
    v_inv.organisation_id, p_actor_profile_id, 'platform_finance.invoice.issue'
  ) then
    raise exception 'finance invoice: missing issue authority';
  end if;
  if not public.finance_payable_actor_has_capability(
    v_inv.organisation_id, p_actor_profile_id, 'platform_finance.post'
  ) then
    raise exception 'finance invoice: missing post authority';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_inv.company_id) then
    raise exception 'finance invoice: no company access';
  end if;

  select * into v_cp from public.organisation_counterparties where id = v_inv.counterparty_id;
  if not found or v_cp.organisation_id <> v_inv.organisation_id then
    raise exception 'finance invoice: counterparty unavailable';
  end if;
  if v_cp.status <> 'active' then
    raise exception 'finance invoice: counterparty is inactive';
  end if;
  if not exists (
    select 1 from public.organisation_counterparty_roles
    where counterparty_id = v_cp.id and role = 'customer'
  ) then
    raise exception 'finance invoice: counterparty is not a customer';
  end if;

  v_total := public.finance_invoice_recompute_total(v_inv.id);
  if v_total <= 0 then raise exception 'finance invoice: total must be greater than zero'; end if;

  v_ar := public.finance_invoice_ar_control_account_id(v_inv.organisation_id);

  -- Build aggregated revenue credits
  for r in
    select l.revenue_gl_account_id as account_id,
           a.code,
           a.name,
           a.status,
           a.account_type,
           a.organisation_id,
           round(sum(l.line_amount), 2) as credit_amount
    from public.finance_invoice_lines l
    join public.finance_accounts a on a.id = l.revenue_gl_account_id
    where l.invoice_id = v_inv.id
    group by l.revenue_gl_account_id, a.code, a.name, a.status, a.account_type, a.organisation_id
    order by a.code
  loop
    if r.organisation_id <> v_inv.organisation_id
       or r.status <> 'active'
       or r.account_type <> 'revenue'
       or r.code !~ '^[0-9]{4}$'
       or r.code::int < 4000
       or r.code::int > 4040
    then
      raise exception 'finance invoice: revenue GL % is unavailable', r.code;
    end if;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account_id', r.account_id,
      'debit', 0,
      'credit', r.credit_amount,
      'description', 'Invoice ' || v_inv.reference || ' — ' || r.code
    ));
  end loop;

  if jsonb_array_length(v_lines) < 1 then
    raise exception 'finance invoice: no revenue lines to post';
  end if;

  -- Debit AR first
  v_lines := jsonb_build_array(jsonb_build_object(
    'account_id', v_ar,
    'debit', v_total,
    'credit', 0,
    'description', 'Invoice ' || v_inv.reference || ' — Trade AR'
  )) || v_lines;

  -- Period must be open covering invoice_date
  select id into v_period
  from public.finance_periods
  where company_id = v_inv.company_id
    and status = 'open'
    and start_date <= v_inv.invoice_date
    and end_date >= v_inv.invoice_date
  order by start_date desc
  limit 1;
  if v_period is null then
    raise exception 'finance invoice: no open accounting period covers the invoice date';
  end if;

  -- Get or create draft FT
  select id into v_ft_id
  from public.finance_transactions
  where source_type = 'invoice' and source_id = v_inv.id::text;
  if v_ft_id is null then
    insert into public.finance_transactions (
      organisation_id, company_id, reference, transaction_date,
      transaction_type, description, amount, currency, status,
      source_type, source_id, metadata, created_by_profile_id
    ) values (
      v_inv.organisation_id, v_inv.company_id, v_inv.reference, v_inv.invoice_date,
      'other',
      coalesce(nullif(trim(v_inv.description), ''), 'Sales invoice ' || v_inv.reference),
      v_total, v_inv.currency, 'draft',
      'invoice', v_inv.id::text,
      jsonb_build_object('channel', 'platform_finance.invoice_recognition'),
      p_actor_profile_id
    )
    on conflict (source_id) where source_type = 'invoice' and source_id is not null
    do nothing
    returning id into v_ft_id;
    if v_ft_id is null then
      select id into strict v_ft_id
      from public.finance_transactions
      where source_type = 'invoice' and source_id = v_inv.id::text;
    end if;
  else
    update public.finance_transactions
    set amount = v_total,
        transaction_date = v_inv.invoice_date,
        currency = v_inv.currency,
        description = coalesce(nullif(trim(v_inv.description), ''), 'Sales invoice ' || v_inv.reference),
        updated_at = timezone('utc', now())
    where id = v_ft_id and status = 'draft';
  end if;

  -- Post through existing engine
  v_je_id := public.finance_post_transaction(
    v_ft_id,
    p_actor_profile_id,
    v_lines,
    v_period,
    'Sales invoice issued and recognised.'
  );

  update public.finance_invoices
  set
    status = 'issued',
    total_amount = v_total,
    counterparty_display_name = v_cp.display_name,
    counterparty_legal_name = v_cp.legal_name,
    counterparty_tax_registration_id = v_cp.tax_registration_id,
    finance_transaction_id = v_ft_id,
    issued_by_profile_id = p_actor_profile_id,
    issued_at = timezone('utc', now())
  where id = v_inv.id
    and status = 'under_review';

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action, object_type, object_id, details
  ) values (
    v_inv.organisation_id, v_inv.company_id, p_actor_profile_id,
    'finance.invoice.issued', 'finance_invoice', v_inv.id::text,
    jsonb_build_object(
      'finance_transaction_id', v_ft_id,
      'journal_entry_id', v_je_id,
      'total_amount', v_total
    )
  );

  return v_inv.id;
end;
$$;

revoke all on function public.finance_invoice_submit_for_review(uuid, uuid) from public;
revoke all on function public.finance_invoice_submit_for_review(uuid, uuid) from anon, authenticated;
grant execute on function public.finance_invoice_submit_for_review(uuid, uuid) to service_role;

revoke all on function public.finance_invoice_return_to_draft(uuid, uuid) from public;
revoke all on function public.finance_invoice_return_to_draft(uuid, uuid) from anon, authenticated;
grant execute on function public.finance_invoice_return_to_draft(uuid, uuid) to service_role;

revoke all on function public.finance_invoice_issue_and_post(uuid, uuid) from public;
revoke all on function public.finance_invoice_issue_and_post(uuid, uuid) from anon, authenticated;
grant execute on function public.finance_invoice_issue_and_post(uuid, uuid) to service_role;

-- RLS
alter table public.finance_invoices enable row level security;
alter table public.finance_invoice_lines enable row level security;

create policy finance_invoices_select on public.finance_invoices
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.invoice.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.create')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.review')
    or public.has_finance_capability(organisation_id, 'platform_finance.invoice.issue')
  )
);

create policy finance_invoices_insert on public.finance_invoices
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.invoice.create')
  and created_by_profile_id = auth.uid()
  and status = 'draft'
);

create policy finance_invoices_update on public.finance_invoices
for update to authenticated
using (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.invoice.create')
  and status = 'draft'
)
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_company_access(company_id)
  and status = 'draft'
);

create policy finance_invoice_lines_select on public.finance_invoice_lines
for select to authenticated
using (
  exists (
    select 1 from public.finance_invoices i
    where i.id = invoice_id
      and public.is_org_member(i.organisation_id)
      and public.has_finance_company_access(i.company_id)
      and (
        public.has_finance_capability(i.organisation_id, 'platform_finance.invoice.view')
        or public.has_finance_capability(i.organisation_id, 'platform_finance.invoice.create')
        or public.has_finance_capability(i.organisation_id, 'platform_finance.invoice.review')
        or public.has_finance_capability(i.organisation_id, 'platform_finance.invoice.issue')
      )
  )
);

create policy finance_invoice_lines_insert on public.finance_invoice_lines
for insert to authenticated
with check (
  exists (
    select 1 from public.finance_invoices i
    where i.id = invoice_id
      and i.status = 'draft'
      and public.is_org_member(i.organisation_id)
      and public.has_finance_company_access(i.company_id)
      and public.has_finance_capability(i.organisation_id, 'platform_finance.invoice.create')
  )
);

create policy finance_invoice_lines_update on public.finance_invoice_lines
for update to authenticated
using (
  exists (
    select 1 from public.finance_invoices i
    where i.id = invoice_id
      and i.status = 'draft'
      and public.is_org_member(i.organisation_id)
      and public.has_finance_company_access(i.company_id)
      and public.has_finance_capability(i.organisation_id, 'platform_finance.invoice.create')
  )
)
with check (
  exists (
    select 1 from public.finance_invoices i
    where i.id = invoice_id
      and i.status = 'draft'
      and public.is_org_member(i.organisation_id)
      and public.has_finance_company_access(i.company_id)
      and public.has_finance_capability(i.organisation_id, 'platform_finance.invoice.create')
  )
);

create policy finance_invoice_lines_delete on public.finance_invoice_lines
for delete to authenticated
using (
  exists (
    select 1 from public.finance_invoices i
    where i.id = invoice_id
      and i.status = 'draft'
      and public.is_org_member(i.organisation_id)
      and public.has_finance_company_access(i.company_id)
      and public.has_finance_capability(i.organisation_id, 'platform_finance.invoice.create')
  )
);

grant select, insert, update on table public.finance_invoices to authenticated;
grant select, insert, update, delete on table public.finance_invoice_lines to authenticated;
grant all on table public.finance_invoices to service_role;
grant all on table public.finance_invoice_lines to service_role;
