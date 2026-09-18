begin;

do $$
declare
  v_org uuid;
  v_company uuid;
  v_actor uuid;
  v_period uuid;
  v_rev1 uuid;
  v_rev2 uuid;
  v_cp uuid;
  v_invoice uuid;
  v_ft uuid;
  v_je uuid;
  v_receivable uuid;
  v_count int;
  v_before_ft int;
  v_before_je int;
  v_before_jl int;
begin
  if exists (
    select 1 from public.finance_invoices i
    left join public.finance_receivables r on r.invoice_id = i.id
    where i.status = 'issued'
    group by i.id having count(r.id) <> 1
  ) then raise exception '2F-B: issued invoice backfill invariant failed'; end if;

  select c.organisation_id, c.id into v_org, v_company
  from public.finance_companies c where c.status = 'active' order by c.created_at limit 1;
  select id into v_actor from public.profiles where organisation_id = v_org order by created_at limit 1;
  insert into public.finance_company_access (organisation_id, company_id, profile_id)
  values (v_org, v_company, v_actor) on conflict do nothing;
  insert into public.finance_capability_grants (organisation_id, profile_id, capability)
  select v_org, v_actor, capability from unnest(array[
    'platform_finance.counterparty.manage','platform_finance.invoice.create',
    'platform_finance.invoice.review','platform_finance.invoice.issue',
    'platform_finance.post','platform_finance.receivable.view'
  ]) capability on conflict do nothing;
  select id into v_period from public.finance_periods
  where company_id = v_company and status = 'open' order by start_date desc limit 1;
  select id into v_rev1 from public.finance_accounts where organisation_id = v_org
    and account_type = 'revenue' and status = 'active' and code::int between 4000 and 4040 order by code limit 1;
  select id into v_rev2 from public.finance_accounts where organisation_id = v_org
    and account_type = 'revenue' and status = 'active' and code::int between 4000 and 4040 and id <> v_rev1 order by code limit 1;

  v_cp := public.organisation_counterparty_create(v_actor, v_org, '2F-B Rollback Customer', '', 'organisation', '', 'active', array['customer']);
  v_invoice := public.finance_invoice_create_draft(
    v_actor, v_org, v_company, 'VERIFY-2FB-ROLLBACK', v_cp,
    (select start_date from public.finance_periods where id = v_period),
    (select start_date from public.finance_periods where id = v_period),
    'NGN', 'Phase 2F-B rollback acceptance',
    jsonb_build_array(
      jsonb_build_object('description','A','quantity',1,'unit_price',100,'line_amount',100,'revenue_gl_account_id',v_rev1),
      jsonb_build_object('description','B','quantity',1,'unit_price',200,'line_amount',200,'revenue_gl_account_id',v_rev2),
      jsonb_build_object('description','C','quantity',1,'unit_price',300,'line_amount',300,'revenue_gl_account_id',v_rev1)
    )
  );
  perform public.finance_invoice_submit_for_review(v_actor, v_invoice);
  perform public.finance_invoice_issue_and_post(v_actor, v_invoice);

  select finance_transaction_id into v_ft from public.finance_invoices where id = v_invoice;
  select journal_entry_id into v_je from public.finance_transactions where id = v_ft;
  select id into v_receivable from public.finance_receivables where invoice_id = v_invoice;
  if v_receivable is null then raise exception '2F-B: issue did not create receivable'; end if;
  select count(*) into v_before_ft from public.finance_transactions where source_type = 'invoice' and source_id = v_invoice::text;
  select count(*) into v_before_je from public.finance_journal_entries where transaction_id = v_ft;
  select count(*) into v_before_jl from public.finance_journal_lines where journal_entry_id = v_je;
  perform public.finance_invoice_issue_and_post(v_actor, v_invoice);
  if (select count(*) from public.finance_receivables where invoice_id = v_invoice) <> 1
    or (select count(*) from public.finance_transactions where source_type = 'invoice' and source_id = v_invoice::text) <> v_before_ft
    or (select count(*) from public.finance_journal_entries where transaction_id = v_ft) <> v_before_je
    or (select count(*) from public.finance_journal_lines where journal_entry_id = v_je) <> v_before_jl
  then raise exception '2F-B: repeated issue duplicated receivable or accounting'; end if;

  begin
    update public.finance_receivables set original_amount = 1 where id = v_receivable;
    raise exception '2F-B: receivable update unexpectedly succeeded';
  exception when others then
    if sqlerrm = '2F-B: receivable update unexpectedly succeeded' then raise; end if;
  end;
  begin
    delete from public.finance_receivables where id = v_receivable;
    raise exception '2F-B: receivable delete unexpectedly succeeded';
  exception when others then
    if sqlerrm = '2F-B: receivable delete unexpectedly succeeded' then raise; end if;
  end;
  select count(*) into v_count from public.finance_journal_lines where journal_entry_id = v_je;
  if v_count <> 3 then raise exception '2F-B: recognition journal shape changed'; end if;
  raise notice 'PHASE2FB_ACCEPTANCE_PASS invoice=% receivable=% ft=% je=%', v_invoice, v_receivable, v_ft, v_je;
end;
$$;

rollback;
