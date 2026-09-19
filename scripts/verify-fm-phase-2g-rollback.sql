-- Linked Phase 2G lifecycle/integrity probe. Every write is rolled back.
-- Leaves NO fm_cost_* / fm_reimbursement_* / fm_work / fm_work_instructions rows behind.
begin;

do $$
declare
  v_org uuid;
  v_fac constant uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_fac2 uuid;
  v_profile uuid;
  v_work uuid;
  v_wi uuid;
  v_work2 uuid;
  v_c1 uuid;
  v_c2 uuid;
  v_sub uuid;
  v_sub2 uuid;
  v_auth uuid;
  v_n integer;
begin
  select organisation_id into v_org from public.fm_facilities where id = v_fac;
  if v_org is null then raise exception 'NCC Annex facility missing'; end if;
  select id into v_profile from public.profiles where organisation_id = v_org limit 1;
  if v_profile is null then raise exception 'No profile for probe'; end if;
  select id into v_fac2 from public.fm_facilities where organisation_id = v_org and id <> v_fac limit 1;

  insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status)
  values (v_org, 'WRK-2099-999999', v_fac, 'probe work', 'manual', 'medium', 'requested') returning id into v_work;
  insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, estimated_cost, actual_cost)
  values (v_org, 'WO-2099-999999', 'work_order', v_work, v_fac, 'probe instruction', 100, 200) returning id into v_wi;

  -- 1. Cost Record: valid, defaults; WI cost fields do not drive the cost record.
  insert into public.fm_cost_records (organisation_id, code, facility_id, location, description, category, actual_amount, evidence_reference,
    work_id, work_instruction_id, recorded_by_profile_id)
  values (v_org, 'COST-2099-999999', v_fac, 'Plant room', 'probe cost', 'materials', 0, 'INV-1', v_work, v_wi, v_profile)
  returning id into v_c1;   -- zero is valid data
  select count(*) into v_n from public.fm_cost_records where id = v_c1 and currency = 'NGN' and reimbursability = 'unknown';
  if v_n <> 1 then raise exception 'FAIL cost defaults'; end if;
  insert into public.fm_cost_records (organisation_id, code, facility_id, location, description, category, actual_amount, evidence_reference)
  values (v_org, 'COST-2099-999998', v_fac, 'Plant room', 'unlinked cost', 'other', 500, 'INV-2') returning id into v_c2;  -- WI/Work optional

  -- 2. Value / relation integrity.
  begin
    update public.fm_cost_records set actual_amount = -1 where id = v_c1;
    raise exception 'FAIL negative amount accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_cost_records set category = 'bribes' where id = v_c1;
    raise exception 'FAIL bad category accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_cost_records set reimbursability = 'maybe' where id = v_c1;
    raise exception 'FAIL bad reimbursability accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_cost_records set evidence_reference = '  ' where id = v_c1;
    raise exception 'FAIL blank evidence accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_cost_records set code = 'cost-2099-999998' where id = v_c1;
    raise exception 'FAIL duplicate code accepted';
  exception when unique_violation then null; end;
  begin
    update public.fm_cost_records set work_instruction_id = '00000000-0000-4000-8000-000000000097' where id = v_c1;
    raise exception 'FAIL dangling work instruction accepted';
  exception when foreign_key_violation then null; end;
  begin
    update public.fm_cost_records set recorded_by_profile_id = '00000000-0000-4000-8000-000000000098' where id = v_c1;
    raise exception 'FAIL bad actor profile accepted';
  exception when foreign_key_violation then null; end;
  if v_fac2 is not null then
    begin
      update public.fm_cost_records set facility_id = v_fac2 where id = v_c1;
      raise exception 'FAIL cost facility diverged from its Work / Work Instruction';
    exception when foreign_key_violation then null; end;
  end if;

  -- 3. Claim: submitted needs a date + actor; items are relational (no arrays).
  insert into public.fm_cost_submissions (organisation_id, code, status, claim_amount, created_by_profile_id)
  values (v_org, 'SUB-2099-999999', 'draft', 500, v_profile) returning id into v_sub;
  begin
    update public.fm_cost_submissions set status = 'submitted' where id = v_sub;
    raise exception 'FAIL submitted without date/actor accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_cost_submissions set status = 'queried', submitted_at = now(), submitted_by_profile_id = v_profile where id = v_sub;
    raise exception 'FAIL queried without queried_at accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_cost_submissions set status = 'paid' where id = v_sub;
    raise exception 'FAIL bad status accepted';
  exception when check_violation then null; end;
  insert into public.fm_cost_submission_items (organisation_id, submission_id, cost_record_id) values (v_org, v_sub, v_c2);
  begin
    insert into public.fm_cost_submission_items (organisation_id, submission_id, cost_record_id) values (v_org, v_sub, v_c2);
    raise exception 'FAIL duplicate claim item accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.fm_cost_submission_items (organisation_id, submission_id, cost_record_id)
    values (v_org, v_sub, '00000000-0000-4000-8000-000000000096');
    raise exception 'FAIL dangling claim cost accepted';
  exception when foreign_key_violation then null; end;
  begin
    delete from public.fm_cost_records where id = v_c2;
    raise exception 'FAIL claimed cost record deleted';
  exception when foreign_key_violation then null; end;

  -- 4. Authorization only for a submitted claim; one per claim; separate from payment.
  begin
    insert into public.fm_reimbursement_authorizations (organisation_id, code, submission_id, authorized_amount, authorized_by_profile_id, authority_reference)
    values (v_org, 'AUTH-2099-999999', v_sub, 500, v_profile, 'REF');
    raise exception 'FAIL draft claim authorized';
  exception when check_violation then null; end;
  update public.fm_cost_submissions set status = 'submitted', submitted_at = now(), submitted_by_profile_id = v_profile where id = v_sub;
  begin
    insert into public.fm_reimbursement_payments (organisation_id, code, submission_id, received_amount, recorded_by_profile_id)
    values (v_org, 'PAY-2099-999999', v_sub, 10, v_profile);
    raise exception 'FAIL payment without authorization accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_reimbursement_authorizations (organisation_id, code, submission_id, authorized_amount, authorized_by_profile_id, authority_reference)
    values (v_org, 'AUTH-2099-999998', v_sub, 0, v_profile, 'REF');
    raise exception 'FAIL zero authorized amount accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_reimbursement_authorizations (organisation_id, code, submission_id, authorized_amount, authorized_by_profile_id, authority_reference)
    values (v_org, 'AUTH-2099-999997', v_sub, 500, v_profile, '  ');
    raise exception 'FAIL blank authority reference accepted';
  exception when check_violation then null; end;
  insert into public.fm_reimbursement_authorizations (organisation_id, code, submission_id, authorized_amount, authorized_by_profile_id, authority_reference)
  values (v_org, 'AUTH-2099-999999', v_sub, 500, v_profile, 'REF') returning id into v_auth;
  begin
    insert into public.fm_reimbursement_authorizations (organisation_id, code, submission_id, authorized_amount, authorized_by_profile_id, authority_reference)
    values (v_org, 'AUTH-2099-999996', v_sub, 100, v_profile, 'REF');
    raise exception 'FAIL second authorization for one claim accepted';
  exception when unique_violation then null; end;

  -- 5. Payments: cumulative <= authorized; no overpayment; positive only.
  insert into public.fm_reimbursement_payments (organisation_id, code, submission_id, received_amount, recorded_by_profile_id)
  values (v_org, 'PAY-2099-999999', v_sub, 300, v_profile);
  begin
    insert into public.fm_reimbursement_payments (organisation_id, code, submission_id, received_amount, recorded_by_profile_id)
    values (v_org, 'PAY-2099-999998', v_sub, 300, v_profile);
    raise exception 'FAIL overpayment accepted';
  exception when check_violation then null; end;
  insert into public.fm_reimbursement_payments (organisation_id, code, submission_id, received_amount, recorded_by_profile_id)
  values (v_org, 'PAY-2099-999997', v_sub, 200, v_profile);    -- exactly reaches the ceiling
  begin
    insert into public.fm_reimbursement_payments (organisation_id, code, submission_id, received_amount)
    values (v_org, 'PAY-2099-999996', v_sub, 0);
    raise exception 'FAIL zero payment accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_reimbursement_payments set received_amount = 400 where code = 'PAY-2099-999999';
    raise exception 'FAIL payment correction past ceiling accepted';
  exception when check_violation then null; end;

  -- 6. Cross-tenant references rejected (composite FKs), when a second organisation exists.
  declare v_other uuid;
  begin
    select id into v_other from public.organisations where id <> v_org limit 1;
    if v_other is not null then
      begin
        insert into public.fm_cost_submission_items (organisation_id, submission_id, cost_record_id)
        values (v_other, v_sub, v_c1);
        raise exception 'FAIL cross-tenant claim item accepted';
      exception when foreign_key_violation then null; end;
      begin
        insert into public.fm_cost_records (organisation_id, code, facility_id, location, description, category, actual_amount, evidence_reference)
        values (v_other, 'COST-2099-999990', v_fac, 'x', 'x', 'other', 1, 'x');
        raise exception 'FAIL cross-tenant facility accepted';
      exception when foreign_key_violation then null; end;
    end if;
  end;

  -- 7. Claim/cost lock is derived from status, not stored: the cost has no lock column.
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='fm_cost_records'
             and column_name in ('locked','submission_id','is_locked')) then
    raise exception 'FAIL competing lock/relationship column on cost records';
  end if;
  -- WI cost fields untouched by any cost write.
  select count(*) into v_n from public.fm_work_instructions where id = v_wi and estimated_cost = 100 and actual_cost = 200;
  if v_n <> 1 then raise exception 'FAIL Work Instruction cost fields were altered'; end if;
end;
$$;

rollback;

select
  (select count(*) from public.fm_cost_records where code like '%-2099-%') as leftover_costs,
  (select count(*) from public.fm_cost_submissions where code like '%-2099-%') as leftover_submissions,
  (select count(*) from public.fm_reimbursement_authorizations where code like '%-2099-%') as leftover_authorizations,
  (select count(*) from public.fm_reimbursement_payments where code like '%-2099-%') as leftover_payments,
  (select count(*) from public.fm_work where code like '%-2099-%') as leftover_work,
  (select count(*) from public.fm_work_instructions where code like '%-2099-%') as leftover_wi;
