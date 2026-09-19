-- Linked Phase 2E lifecycle/integrity probe. Every write is rolled back.
-- Leaves NO fm_work_instructions / fm_work / fm_incidents / fm_facilities rows behind.
begin;

do $$
declare
  v_org uuid;
  v_other_org uuid;
  v_profile uuid;
  v_module uuid;
  v_event uuid;
  v_fac constant uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_fac2 uuid;
  v_inc uuid;
  v_work uuid;
  v_wi_a uuid;
  v_wi_b uuid;
  v_child uuid;
  v_n integer;
begin
  select organisation_id into v_org from public.fm_facilities where id = v_fac;
  if v_org is null then raise exception 'NCC Annex facility missing'; end if;
  select id into v_profile from public.profiles where organisation_id = v_org limit 1;
  if v_profile is null then raise exception 'No profile for probe'; end if;
  select id into v_module from public.modules where slug = 'facility_management';

  -- 0. Opaque Work Order ref on Incident is gone.
  if exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='fm_incidents' and column_name='work_order_ref') then
    raise exception 'FAIL fm_incidents.work_order_ref still exists';
  end if;

  insert into public.fm_incidents (organisation_id, code, facility_id, title)
  values (v_org, 'INC-2099-999999', v_fac, 'probe incident') returning id into v_inc;
  insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status,
    incident_id, requires_work_instruction)
  values (v_org, 'WRK-2099-999999', v_fac, 'probe work', 'incident', 'medium', 'requested', v_inc, true)
  returning id into v_work;

  -- 1. ONE register, BOTH order types, independent of cost:
  --    a tiny-cost Job Order and a huge-cost Work Order are both valid.
  insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id,
    title, estimated_cost, created_by_profile_id, updated_by_profile_id)
  values (v_org, 'WO-2099-999999', 'job_order', v_work, v_fac, 'Cheap job order', 10,
    v_profile, v_profile) returning id into v_wi_a;
  insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id,
    title, estimated_cost)
  values (v_org, 'WO-2099-999998', 'work_order', v_work, v_fac, 'Expensive work order', 25000000)
  returning id into v_wi_b;
  select count(*) into v_n from public.fm_work_instructions
    where (id = v_wi_a and order_type = 'job_order' and estimated_cost < 1000000)
       or (id = v_wi_b and order_type = 'work_order' and estimated_cost >= 1000000);
  if v_n <> 2 then raise exception 'order_type is not independent of cost'; end if;
  -- Changing the cost never changes the order type.
  update public.fm_work_instructions set estimated_cost = 99999999 where id = v_wi_a;
  select count(*) into v_n from public.fm_work_instructions where id = v_wi_a and order_type = 'job_order';
  if v_n <> 1 then raise exception 'cost change altered order_type'; end if;

  -- Defaults.
  select count(*) into v_n from public.fm_work_instructions
    where id = v_wi_b and status = 'open' and priority = 'medium' and work_category = 'corrective'
      and requires_approval = false;
  if v_n <> 1 then raise exception 'instruction defaults wrong'; end if;

  -- 2. order_type is explicit and mandatory.
  begin
    insert into public.fm_work_instructions (organisation_id, code, work_id, facility_id, title)
    values (v_org, 'WO-2099-999997', v_work, v_fac, 'no order type');
    raise exception 'FAIL missing order_type accepted';
  exception when not_null_violation then null; end;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title)
    values (v_org, 'WO-2099-999996', 'undetermined', v_work, v_fac, 'bad order type');
    raise exception 'FAIL undetermined order_type accepted';
  exception when check_violation then null; end;

  -- 3. Instructions belong to Work (mandatory, tenant-safe).
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, facility_id, title)
    values (v_org, 'WO-2099-999995', 'work_order', v_fac, 'no work');
    raise exception 'FAIL missing work_id accepted';
  exception when not_null_violation then null; end;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title)
    values (v_org, 'WO-2099-999994', 'work_order', '00000000-0000-4000-8000-000000000097', v_fac, 'dangling work');
    raise exception 'FAIL dangling work accepted';
  exception when foreign_key_violation then null; end;

  -- 4. Facility is INHERITED from Work: it cannot differ, and follows a Work move.
  insert into public.fm_facilities (organisation_id, code, name, status)
  values (v_org, 'FAC-PROBE-2E', 'Probe facility 2E', 'active') returning id into v_fac2;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title)
    values (v_org, 'WO-2099-999993', 'work_order', v_work, v_fac2, 'facility differs from work');
    raise exception 'FAIL instruction facility differing from Work accepted';
  exception when foreign_key_violation then null; end;
  update public.fm_work set facility_id = v_fac2 where id = v_work;
  select count(*) into v_n from public.fm_work_instructions where work_id = v_work and facility_id = v_fac2;
  if v_n <> 2 then raise exception 'facility did not cascade from Work: %', v_n; end if;

  -- 5. Value integrity: each of these MUST be rejected.
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, status)
    values (v_org, 'WO-2099-999992', 'work_order', v_work, v_fac2, 'bad status', 'pending');
    raise exception 'FAIL bad status accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, priority)
    values (v_org, 'WO-2099-999991', 'work_order', v_work, v_fac2, 'bad priority', 'urgent');
    raise exception 'FAIL bad priority accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, work_category)
    values (v_org, 'WO-2099-999990', 'work_order', v_work, v_fac2, 'bad category', 'demolition');
    raise exception 'FAIL bad category accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, estimated_cost)
    values (v_org, 'WO-2099-999989', 'work_order', v_work, v_fac2, 'negative cost', -1);
    raise exception 'FAIL negative estimated cost accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title)
    values (v_org, 'WO-2099-999988', 'work_order', v_work, v_fac2, '  ');
    raise exception 'FAIL blank title accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title)
    values (v_org, 'wo-2099-999999', 'work_order', v_work, v_fac2, 'duplicate code');
    raise exception 'FAIL duplicate code accepted';
  exception when unique_violation then null; end;
  begin
    update public.fm_work_instructions set status = 'completed', completed_at = null where id = v_wi_b;
    raise exception 'FAIL completed without timestamp accepted';
  exception when check_violation then null; end;
  begin
    update public.fm_work_instructions set parent_instruction_id = id where id = v_wi_b;
    raise exception 'FAIL own parent accepted';
  exception when check_violation then null; end;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title,
      assigned_to_profile_id)
    values (v_org, 'WO-2099-999987', 'work_order', v_work, v_fac2, 'bad assignee',
      '00000000-0000-4000-8000-000000000098');
    raise exception 'FAIL bad assignee accepted';
  exception when foreign_key_violation then null; end;

  -- 6. Lifecycle with real profile assignee.
  update public.fm_work_instructions set status = 'assigned', assigned_to_profile_id = v_profile where id = v_wi_b;
  update public.fm_work_instructions set status = 'in_progress', started_at = now() where id = v_wi_b;
  update public.fm_work_instructions set status = 'on_hold', hold_reason = 'parts' where id = v_wi_b;
  update public.fm_work_instructions set status = 'completed', completed_at = now() where id = v_wi_b;
  update public.fm_work_instructions set status = 'closed' where id = v_wi_b;

  -- 7. Cross-tenant: a second organisation cannot reach this tenant's Work.
  insert into public.organisations (name, slug)
  values ('Rollback probe org', 'rollback-probe-org-2e') returning id into v_other_org;
  begin
    insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title)
    values (v_other_org, 'WO-2099-999986', 'work_order', v_work, v_fac2, 'cross-tenant work');
    raise exception 'FAIL cross-tenant Work accepted';
  exception when foreign_key_violation then null; end;
  insert into public.operational_events (organisation_id, module_id, event_type, entity_type, entity_id)
  values (v_other_org, v_module, 'facility.work_order_created', 'work_order', 'probe-2e') returning id into v_event;
  begin
    update public.fm_work_instructions set operational_event_id = v_event where id = v_wi_a;
    raise exception 'FAIL cross-tenant operational event accepted';
  exception when check_violation then null; end;

  -- 8. Relations are derived: Incident -> Work -> Work Instruction (no arrays).
  select count(*) into v_n
  from public.fm_work_instructions wi
  join public.fm_work w on w.organisation_id = wi.organisation_id and w.id = wi.work_id
  where w.incident_id = v_inc;
  if v_n <> 2 then raise exception 'Incident->Work->Instruction derivation wrong: %', v_n; end if;

  -- 9. Parent (self FK) detaches, never destroys.
  insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title,
    parent_instruction_id)
  values (v_org, 'WO-2099-999985', 'work_order', v_work, v_fac2, 'child instruction', v_wi_a)
  returning id into v_child;
  delete from public.fm_work_instructions where id = v_wi_a;
  select count(*) into v_n from public.fm_work_instructions where id = v_child and parent_instruction_id is null;
  if v_n <> 1 then raise exception 'child instruction not detached on parent delete'; end if;

  -- 10. A Work that still has instructions cannot be deleted (restrict).
  begin
    delete from public.fm_work where id = v_work;
    raise exception 'FAIL Work with instructions deleted';
  exception when foreign_key_violation then null; end;
end;
$$;

rollback;

select jsonb_build_object(
  'fm_work_instructions_after_rollback', (select count(*)::int from public.fm_work_instructions),
  'fm_work_after_rollback', (select count(*)::int from public.fm_work),
  'fm_incidents_after_rollback', (select count(*)::int from public.fm_incidents),
  'fm_requests_after_rollback', (select count(*)::int from public.fm_requests),
  'probe_facility_after_rollback', (select count(*)::int from public.fm_facilities where code = 'FAC-PROBE-2E'),
  'probe_org_after_rollback', (select count(*)::int from public.organisations where slug = 'rollback-probe-org-2e'),
  'probe_events_after_rollback', (select count(*)::int from public.operational_events where entity_id = 'probe-2e')
) as after_rollback;
