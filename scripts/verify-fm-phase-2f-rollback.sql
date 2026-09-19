-- Linked Phase 2F lifecycle/integrity probe. Every write is rolled back.
-- Leaves NO fm_approvals / fm_approval_activities / fm_work_instructions / fm_work rows behind.
begin;

do $$
declare
  v_org uuid;
  v_other_org uuid;
  v_profile uuid;
  v_fac constant uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_work uuid;
  v_wi_a uuid;
  v_wi_b uuid;
  v_apr uuid;
  v_apr_b uuid;
  v_n integer;
begin
  select organisation_id into v_org from public.fm_facilities where id = v_fac;
  if v_org is null then raise exception 'NCC Annex facility missing'; end if;
  select id into v_profile from public.profiles where organisation_id = v_org limit 1;
  if v_profile is null then raise exception 'No profile for probe'; end if;

  -- 0. The opaque Work Instruction approval_ref is gone; requires_approval remains.
  if exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='fm_work_instructions' and column_name='approval_ref') then
    raise exception 'FAIL fm_work_instructions.approval_ref still exists';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='fm_work_instructions' and column_name='requires_approval') then
    raise exception 'FAIL requires_approval was removed';
  end if;

  insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status)
  values (v_org, 'WRK-2099-999999', v_fac, 'probe work', 'manual', 'medium', 'requested') returning id into v_work;
  insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, requires_approval)
  values (v_org, 'WO-2099-999999', 'work_order', v_work, v_fac, 'probe instruction A', true) returning id into v_wi_a;
  insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title)
  values (v_org, 'WO-2099-999998', 'job_order', v_work, v_fac, 'probe instruction B') returning id into v_wi_b;

  -- 1. Defaults. requires_approval is a declared requirement: it does NOT imply an Approval exists.
  select count(*) into v_n from public.fm_approvals where work_instruction_id = v_wi_a;
  if v_n <> 0 then raise exception 'requires_approval implied an Approval record'; end if;
  insert into public.fm_approvals (organisation_id, code, work_instruction_id, title,
    requested_by_profile_id, created_by_profile_id, updated_by_profile_id, approval_amount)
  values (v_org, 'APR-2099-999999', v_wi_a, 'Probe approval', v_profile, v_profile, v_profile, 5000000)
  returning id into v_apr;
  select count(*) into v_n from public.fm_approvals
    where id = v_apr and status = 'draft' and approval_type = 'standard_maintenance';
  if v_n <> 1 then raise exception 'approval defaults wrong'; end if;

  -- 2. ONE Approval per Work Instruction; a different instruction may have its own.
  begin
    insert into public.fm_approvals (organisation_id, code, work_instruction_id, title)
    values (v_org, 'APR-2099-999998', v_wi_a, 'second approval for same instruction');
    raise exception 'FAIL second Approval for one Work Instruction accepted';
  exception when unique_violation then null; end;
  insert into public.fm_approvals (organisation_id, code, work_instruction_id, title)
  values (v_org, 'APR-2099-999997', v_wi_b, 'Approval for B') returning id into v_apr_b;

  -- 3. Relation is a UUID FK: mandatory, real, tenant-safe. (No code matching exists.)
  begin
    insert into public.fm_approvals (organisation_id, code, title)
    values (v_org, 'APR-2099-999996', 'no work instruction');
    raise exception 'FAIL missing work_instruction_id accepted';
  exception when not_null_violation then null; end;
  begin
    insert into public.fm_approvals (organisation_id, code, work_instruction_id, title)
    values (v_org, 'APR-2099-999995', '00000000-0000-4000-8000-000000000097', 'dangling instruction');
    raise exception 'FAIL dangling work instruction accepted';
  exception when foreign_key_violation then null; end;

  -- 4. Value integrity.
  begin
    update public.fm_approvals set status = 'pending' where id = v_apr;
    raise exception 'FAIL bad status accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_approvals set approval_type = 'bribe' where id = v_apr;
    raise exception 'FAIL bad type accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_approvals set approval_amount = -1 where id = v_apr;
    raise exception 'FAIL negative amount accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_approvals set title = '  ' where id = v_apr;
    raise exception 'FAIL blank title accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_approvals set code = 'apr-2099-999997' where id = v_apr;
    raise exception 'FAIL duplicate code accepted';
  exception when unique_violation then null; end;
  begin
    update public.fm_approvals set requested_by_profile_id = '00000000-0000-4000-8000-000000000098' where id = v_apr;
    raise exception 'FAIL bad requester profile accepted';
  exception when foreign_key_violation then null; end;

  -- 5. Lifecycle: submitted needs its date; a decision is complete + attributable.
  begin
    update public.fm_approvals set status = 'awaiting_decision' where id = v_apr;
    raise exception 'FAIL awaiting_decision without submitted_at accepted';
  exception when check_violation then null; end;
  update public.fm_approvals set status = 'awaiting_decision', submitted_at = now(),
    submission_method = 'email', submitted_to = 'NCC' where id = v_apr;
  update public.fm_approvals set last_follow_up_at = now() where id = v_apr;   -- follow-up keeps status

  begin
    update public.fm_approvals set status = 'approved', decision_at = now(), decision_outcome = 'approved' where id = v_apr;
    raise exception 'FAIL decision without a recording profile accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_approvals set status = 'approved', decided_by_profile_id = v_profile,
      decision_outcome = 'approved' where id = v_apr;
    raise exception 'FAIL decision without decision_at accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_approvals set status = 'approved', decided_by_profile_id = v_profile,
      decision_at = now(), decision_outcome = 'rejected' where id = v_apr;
    raise exception 'FAIL approved with a rejected outcome accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_approvals set status = 'rejected', decided_by_profile_id = v_profile,
      decision_at = now(), decision_outcome = 'approved' where id = v_apr;
    raise exception 'FAIL rejected with an approved outcome accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_approvals set decided_by_profile_id = '00000000-0000-4000-8000-000000000098' where id = v_apr;
    raise exception 'FAIL non-profile decision actor accepted';
  exception when foreign_key_violation then null; end;

  update public.fm_approvals set status = 'approved', decided_by_profile_id = v_profile,
    decision_at = now(), decision_outcome = 'partially_approved', approved_amount = 2500000 where id = v_apr;
  update public.fm_approvals set status = 'closed' where id = v_apr;
  update public.fm_approvals set status = 'awaiting_decision', submitted_at = now() where id = v_apr_b;
  update public.fm_approvals set status = 'rejected', decided_by_profile_id = v_profile,
    decision_at = now(), decision_outcome = 'rejected' where id = v_apr_b;
  update public.fm_approvals set status = 'cancelled' where id = v_apr;

  -- 6. Activity: append-only child rows, tenant-safe.
  insert into public.fm_approval_activities (organisation_id, approval_id, action, summary, actor_profile_id, data)
  values (v_org, v_apr, 'approval_submitted', 'submitted', v_profile, '{"method":"email"}'::jsonb);
  begin
    insert into public.fm_approval_activities (organisation_id, approval_id, action, summary)
    values (v_org, v_apr, 'approval_teleported', 'bad action');
    raise exception 'FAIL bad activity action accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_approval_activities (organisation_id, approval_id, action, summary)
    values (v_org, v_apr, 'approval_updated', '   ');
    raise exception 'FAIL blank activity summary accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_approval_activities (organisation_id, approval_id, action, summary, actor_profile_id)
    values (v_org, v_apr, 'approval_updated', 'bad actor', '00000000-0000-4000-8000-000000000098');
    raise exception 'FAIL non-profile activity actor accepted';
  exception when foreign_key_violation then null; end;

  -- 7. Cross-tenant: another organisation cannot reach this tenant's instruction or approval.
  insert into public.organisations (name, slug)
  values ('Rollback probe org', 'rollback-probe-org-2f') returning id into v_other_org;
  begin
    insert into public.fm_approvals (organisation_id, code, work_instruction_id, title)
    values (v_other_org, 'APR-2099-999993', v_wi_a, 'cross-tenant instruction');
    raise exception 'FAIL cross-tenant Work Instruction accepted';
  exception when foreign_key_violation or unique_violation then null; end;
  begin
    insert into public.fm_approval_activities (organisation_id, approval_id, action, summary)
    values (v_other_org, v_apr, 'approval_updated', 'cross-tenant activity');
    raise exception 'FAIL cross-tenant activity accepted';
  exception when foreign_key_violation then null; end;

  -- 8. Facility is INHERITED through Work Instruction -> Work (never stored on the Approval).
  if exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='fm_approvals' and column_name in ('facility_id','asset_id','asset_ref')) then
    raise exception 'FAIL facility/asset persisted on the Approval';
  end if;
  select count(*) into v_n
  from public.fm_approvals a
  join public.fm_work_instructions wi on wi.organisation_id = a.organisation_id and wi.id = a.work_instruction_id
  where a.id = v_apr and wi.facility_id = v_fac;
  if v_n <> 1 then raise exception 'facility derivation through instruction wrong'; end if;

  -- 9. A Work Instruction with an Approval cannot be deleted (restrict); deleting an
  --    Approval removes its activities but never the instruction.
  begin
    delete from public.fm_work_instructions where id = v_wi_a;
    raise exception 'FAIL Work Instruction with Approval deleted';
  exception when foreign_key_violation then null; end;
  delete from public.fm_approvals where id = v_apr;
  select count(*) into v_n from public.fm_approval_activities where approval_id = v_apr;
  if v_n <> 0 then raise exception 'activities not cascaded'; end if;
  select count(*) into v_n from public.fm_work_instructions where id = v_wi_a;
  if v_n <> 1 then raise exception 'instruction lost when approval deleted'; end if;
end;
$$;

rollback;

select jsonb_build_object(
  'fm_approvals_after_rollback', (select count(*)::int from public.fm_approvals),
  'fm_approval_activities_after_rollback', (select count(*)::int from public.fm_approval_activities),
  'fm_work_instructions_after_rollback', (select count(*)::int from public.fm_work_instructions),
  'fm_work_after_rollback', (select count(*)::int from public.fm_work),
  'probe_org_after_rollback', (select count(*)::int from public.organisations where slug = 'rollback-probe-org-2f')
) as after_rollback;
