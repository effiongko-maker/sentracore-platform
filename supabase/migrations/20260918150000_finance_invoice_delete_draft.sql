-- Draft-only sales invoice hard delete.
-- Does not change issue, posting, receivable, or receipt RPCs.
-- Issued invoices remain non-deletable. Under Review must return to draft first.

create or replace function public.finance_invoices_reject_issued_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' and old.status is distinct from 'draft' then
    raise exception 'finance invoice: only draft invoices can be deleted';
  end if;
  if tg_op = 'UPDATE' and old.status = 'issued' then
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

create or replace function public.finance_invoice_delete_draft(
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

  if not public.finance_payable_actor_has_capability(
    v_inv.organisation_id, p_actor_profile_id, 'platform_finance.invoice.create'
  ) then
    raise exception 'finance invoice: missing create authority';
  end if;
  if not public.finance_payable_actor_has_company_access(p_actor_profile_id, v_inv.company_id) then
    raise exception 'finance invoice: no company access';
  end if;

  if v_inv.status = 'issued' then
    raise exception 'finance invoice: issued invoices cannot be deleted';
  end if;
  if v_inv.status is distinct from 'draft' then
    raise exception 'finance invoice: only draft invoices can be deleted';
  end if;
  if v_inv.finance_transaction_id is not null
     or exists (
       select 1
       from public.finance_transactions t
       where t.source_type = 'invoice'
         and t.source_id = v_inv.id::text
     )
     or exists (
       select 1
       from public.finance_receivables r
       where r.invoice_id = v_inv.id
     )
  then
    raise exception 'finance invoice: draft with accounting records cannot be deleted';
  end if;

  insert into public.finance_audit_events (
    organisation_id, company_id, actor_profile_id, action, object_type, object_id, details
  ) values (
    v_inv.organisation_id, v_inv.company_id, p_actor_profile_id,
    'finance.invoice.deleted', 'finance_invoice', v_inv.id::text,
    jsonb_build_object('reference', v_inv.reference, 'status', v_inv.status)
  );

  delete from public.finance_invoices where id = v_inv.id;
  return v_inv.id;
end;
$$;

revoke all on function public.finance_invoice_delete_draft(uuid, uuid) from public;
revoke all on function public.finance_invoice_delete_draft(uuid, uuid) from anon, authenticated;
grant execute on function public.finance_invoice_delete_draft(uuid, uuid) to service_role;
