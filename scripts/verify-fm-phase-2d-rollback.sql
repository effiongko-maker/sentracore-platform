-- Linked Phase 2D lifecycle/integrity probe. Every write is rolled back.
-- Leaves NO fm_incidents / fm_requests / fm_work rows behind.
begin;

do $$
declare
  v_org uuid;
  v_other_org uuid;
  v_profile uuid;
  v_module uuid;
  v_event uuid;
  v_fac constant uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_req uuid;
  v_inc uuid;
  v_child uuid;
  v_n integer;
begin
  select organisation_id into v_org from public.fm_facilities where id = v_fac;
  if v_org is null then raise exception 'NCC Annex facility missing'; end if;
  select id into v_profile from public.profiles where organisation_id = v_org limit 1;
  if v_profile is null then raise exception 'No profile for probe'; end if;
  select id into v_module from public.modules where slug = 'facility_management';

  -- 0. The Phase 2C bridge is retired; Work provenance is an FK, not opaque text.
  if to_regclass('public.fm_request_incident_links') is not null then
    raise exception 'FAIL bridge table still exists';
  end if;
  if exists (select 1 from information_schema.columns where table_schema='public'
             and table_name='fm_work' and column_name='incident_ref') then
    raise exception 'FAIL fm_work.incident_ref still exists';
  end if;

  -- 1. Defaults + real profile actors.
  insert into public.fm_incidents (organisation_id, code, facility_id, title,
    reported_by_profile_id, assigned_to_profile_id, created_by_profile_id, updated_by_profile_id)
  values (v_org, 'INC-2099-999999', v_fac, 'Rollback probe incident',
    v_profile, v_profile, v_profile, v_profile)
  returning id into v_inc;
  select count(*) into v_n from public.fm_incidents
    where id = v_inc and status = 'reported' and severity = 'medium'
      and incident_type = 'other' and source = 'manual'
      and is_emergency = false and requires_work_instruction = false;
  if v_n <> 1 then raise exception 'incident defaults wrong'; end if;

  -- 2. Lifecycle: terminal statuses carry their timestamp.
  update public.fm_incidents set status = 'triaged' where id = v_inc;
  update public.fm_incidents set status = 'investigating' where id = v_inc;
  update public.fm_incidents set status = 'contained', contained_at = now() where id = v_inc;
  update public.fm_incidents set status = 'resolved', resolved_at = now(),
    resolution_notes = 'probe' where id = v_inc;
  update public.fm_incidents set status = 'closed', closed_at = now() where id = v_inc;
  update public.fm_incidents set status = 'cancelled' where id = v_inc;

  -- 3. Integrity: each of these MUST be rejected.
  begin
    update public.fm_incidents set status = 'resolved', resolved_at = null where id = v_inc;
    raise exception 'FAIL resolved without timestamp accepted';
  exception when check_violation then null; end;

  begin
    update public.fm_incidents set status = 'closed', closed_at = null where id = v_inc;
    raise exception 'FAIL closed without timestamp accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title)
    values (v_org, 'INC-2099-999998', '00000000-0000-4000-8000-000000000099', 'bad facility');
    raise exception 'FAIL bad facility accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, assigned_to_profile_id)
    values (v_org, 'INC-2099-999997', v_fac, 'bad assignee', '00000000-0000-4000-8000-000000000098');
    raise exception 'FAIL bad assignee accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, status)
    values (v_org, 'INC-2099-999996', v_fac, 'bad status', 'open');
    raise exception 'FAIL bad status accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, severity)
    values (v_org, 'INC-2099-999995', v_fac, 'bad severity', 'urgent');
    raise exception 'FAIL bad severity accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, incident_type)
    values (v_org, 'INC-2099-999994', v_fac, 'bad type', 'fire');
    raise exception 'FAIL bad type accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, reported_via)
    values (v_org, 'INC-2099-999993', v_fac, 'bad channel', 'pigeon');
    raise exception 'FAIL bad channel accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, people_affected)
    values (v_org, 'INC-2099-999992', v_fac, 'negative people', -1);
    raise exception 'FAIL negative people accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title)
    values (v_org, 'INC-2099-999991', v_fac, '   ');
    raise exception 'FAIL blank title accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title)
    values (v_org, 'inc-2099-999999', v_fac, 'duplicate code (case-insensitive)');
    raise exception 'FAIL duplicate code accepted';
  exception when unique_violation then null; end;

  begin
    update public.fm_incidents set parent_incident_id = id where id = v_inc;
    raise exception 'FAIL own parent accepted';
  exception when check_violation then null; end;

  -- 4. Cross-tenant: a second organisation cannot reach this tenant's data.
  insert into public.organisations (name, slug)
  values ('Rollback probe org', 'rollback-probe-org-2d') returning id into v_other_org;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title)
    values (v_other_org, 'INC-2099-999990', v_fac, 'cross-tenant facility');
    raise exception 'FAIL cross-tenant facility accepted';
  exception when foreign_key_violation then null; end;

  insert into public.fm_requests (organisation_id, code, facility_id, title)
  values (v_org, 'REQ-2099-999999', v_fac, 'Rollback probe request') returning id into v_req;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, source_request_id)
    values (v_other_org, 'INC-2099-999989', v_fac, 'cross-tenant request', v_req);
    raise exception 'FAIL cross-tenant request accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, parent_incident_id)
    values (v_other_org, 'INC-2099-999988', v_fac, 'cross-tenant parent', v_inc);
    raise exception 'FAIL cross-tenant parent accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status, incident_id)
    values (v_other_org, 'WRK-2099-999990', v_fac, 'cross-tenant work provenance', 'incident', 'medium', 'requested', v_inc);
    raise exception 'FAIL cross-tenant Work provenance accepted';
  exception when foreign_key_violation then null; end;

  -- Operational event must belong to the same organisation.
  insert into public.operational_events (organisation_id, module_id, event_type, entity_type, entity_id)
  values (v_other_org, v_module, 'facility.incident_reported', 'incident', 'probe') returning id into v_event;
  begin
    update public.fm_incidents set operational_event_id = v_event where id = v_inc;
    raise exception 'FAIL cross-tenant operational event accepted';
  exception when check_violation then null; end;

  -- 5. Relationships (no arrays): Request -> Incident, Incident -> Work, parent.
  update public.fm_incidents set status = 'reported', source_request_id = v_req where id = v_inc;
  insert into public.fm_incidents (organisation_id, code, facility_id, title, parent_incident_id)
  values (v_org, 'INC-2099-999987', v_fac, 'child incident', v_inc) returning id into v_child;

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, source_request_id)
    values (v_org, 'INC-2099-999986', v_fac, 'dangling request', '00000000-0000-4000-8000-000000000097');
    raise exception 'FAIL dangling source_request_id accepted';
  exception when foreign_key_violation then null; end;

  insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status,
    source_request_id, incident_id, created_by_profile_id, updated_by_profile_id)
  values (v_org, 'WRK-2099-999999', v_fac, 'Rollback probe Work', 'incident', 'medium', 'requested',
    v_req, v_inc, v_profile, v_profile);

  begin
    insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status, incident_id)
    values (v_org, 'WRK-2099-999998', v_fac, 'Dangling incident provenance', 'incident', 'medium', 'requested',
      '00000000-0000-4000-8000-000000000096');
    raise exception 'FAIL dangling incident_id accepted';
  exception when foreign_key_violation then null; end;

  select count(*) into v_n from public.fm_incidents where source_request_id = v_req;
  if v_n <> 1 then raise exception 'Request->Incident derivation wrong: %', v_n; end if;
  select count(*) into v_n from public.fm_work where incident_id = v_inc;
  if v_n <> 1 then raise exception 'Incident->Work derivation wrong: %', v_n; end if;

  -- 6. Detach, never destroy: deleting a parent record nulls the pointer.
  delete from public.fm_requests where id = v_req;
  select count(*) into v_n from public.fm_incidents where id = v_inc and source_request_id is null;
  if v_n <> 1 then raise exception 'Incident not detached (or deleted) on request delete'; end if;

  delete from public.fm_incidents where id = v_inc;
  select count(*) into v_n from public.fm_work where code = 'WRK-2099-999999' and incident_id is null;
  if v_n <> 1 then raise exception 'Work not detached (or deleted) on incident delete'; end if;
  select count(*) into v_n from public.fm_incidents where id = v_child and parent_incident_id is null;
  if v_n <> 1 then raise exception 'Child incident not detached on parent delete'; end if;
end;
$$;

rollback;

select jsonb_build_object(
  'fm_incidents_after_rollback', (select count(*)::int from public.fm_incidents),
  'fm_requests_after_rollback', (select count(*)::int from public.fm_requests),
  'fm_work_after_rollback', (select count(*)::int from public.fm_work),
  'probe_org_after_rollback', (select count(*)::int from public.organisations where slug = 'rollback-probe-org-2d'),
  'probe_events_after_rollback', (select count(*)::int from public.operational_events where entity_id = 'probe')
) as after_rollback;
