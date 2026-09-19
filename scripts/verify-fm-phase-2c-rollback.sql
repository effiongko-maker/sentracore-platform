-- Linked Phase 2C lifecycle/integrity probe. Every write is rolled back.
-- Leaves NO fm_requests / fm_request_incident_links / fm_work rows behind.
begin;

do $$
declare
  v_org uuid;
  v_other_org uuid;
  v_profile uuid;
  v_fac constant uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_req uuid;
  v_req2 uuid;
  v_n integer;
begin
  select organisation_id into v_org from public.fm_facilities where id = v_fac;
  if v_org is null then raise exception 'NCC Annex facility missing'; end if;
  select id into v_profile from public.profiles where organisation_id = v_org limit 1;
  if v_profile is null then raise exception 'No profile for probe'; end if;

  -- 1. Anonymous portal intake: no profile columns, defaults applied.
  insert into public.fm_requests (organisation_id, code, facility_id, title, request_type,
    reporter_name, reporter_contact)
  values (v_org, 'REQ-2099-999999', v_fac, 'Rollback probe (anonymous)', 'maintenance',
    'Occupant', 'occupant@example.com')
  returning id into v_req;
  select count(*) into v_n from public.fm_requests
    where id = v_req and status = 'submitted' and created_by_profile_id is null;
  if v_n <> 1 then raise exception 'anonymous intake defaults wrong'; end if;

  -- 2. Staff-created with real profile actors.
  insert into public.fm_requests (organisation_id, code, facility_id, title, status,
    reported_by_profile_id, created_by_profile_id, updated_by_profile_id)
  values (v_org, 'REQ-2099-999998', v_fac, 'Rollback probe (staff)', 'under_review',
    v_profile, v_profile, v_profile)
  returning id into v_req2;

  -- 3. Lifecycle: every status is accepted; updated_at trigger fires.
  update public.fm_requests set status = 'being_treated' where id = v_req;
  update public.fm_requests set status = 'resolved' where id = v_req;
  update public.fm_requests set status = 'closed' where id = v_req;
  update public.fm_requests set status = 'cancelled' where id = v_req;

  -- 4. Integrity: each of these MUST be rejected.
  begin
    insert into public.fm_requests (organisation_id, code, facility_id, title)
    values (v_org, 'REQ-2099-999997', '00000000-0000-4000-8000-000000000099', 'bad facility');
    raise exception 'FAIL bad facility accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.fm_requests (organisation_id, code, facility_id, title, created_by_profile_id)
    values (v_org, 'REQ-2099-999996', v_fac, 'bad profile', '00000000-0000-4000-8000-000000000098');
    raise exception 'FAIL bad profile accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.fm_requests (organisation_id, code, facility_id, title, status)
    values (v_org, 'REQ-2099-999995', v_fac, 'bad status', 'open');
    raise exception 'FAIL bad status accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_requests (organisation_id, code, facility_id, title, request_type)
    values (v_org, 'REQ-2099-999994', v_fac, 'bad type', 'asset');
    raise exception 'FAIL bad type accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_requests (organisation_id, code, facility_id, title)
    values (v_org, 'REQ-2099-999993', v_fac, '   ');
    raise exception 'FAIL blank title accepted';
  exception when check_violation then null; end;

  begin
    insert into public.fm_requests (organisation_id, code, facility_id, title)
    values (v_org, 'req-2099-999999', v_fac, 'duplicate code (case-insensitive)');
    raise exception 'FAIL duplicate code accepted';
  exception when unique_violation then null; end;

  -- 5. Cross-tenant: a second organisation cannot reach this tenant's facility
  --    or requests.
  insert into public.organisations (name, slug)
  values ('Rollback probe org', 'rollback-probe-org-2c') returning id into v_other_org;

  begin
    insert into public.fm_requests (organisation_id, code, facility_id, title)
    values (v_other_org, 'REQ-2099-999992', v_fac, 'cross-tenant facility');
    raise exception 'FAIL cross-tenant facility accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.fm_request_incident_links (organisation_id, request_id, incident_ref)
    values (v_other_org, v_req, 'INC-PROBE-X');
    raise exception 'FAIL cross-tenant incident link accepted';
  exception when foreign_key_violation then null; end;

  -- 6. Incident links (transitional): one Incident belongs to at most one Request.
  insert into public.fm_request_incident_links (organisation_id, request_id, incident_ref, linked_by_profile_id)
  values (v_org, v_req, 'INC-PROBE-1', v_profile);

  begin
    insert into public.fm_request_incident_links (organisation_id, request_id, incident_ref)
    values (v_org, v_req2, 'inc-probe-1');
    raise exception 'FAIL incident linked to two requests';
  exception when unique_violation then null; end;

  -- 7. Work provenance FK: Work may cite only a real same-tenant Request.
  insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status,
    source_request_id, created_by_profile_id, updated_by_profile_id)
  values (v_org, 'WRK-2099-999999', v_fac, 'Rollback probe Work', 'request', 'medium', 'requested',
    v_req, v_profile, v_profile);

  begin
    insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status,
      source_request_id)
    values (v_org, 'WRK-2099-999998', v_fac, 'Dangling provenance', 'request', 'medium', 'requested',
      '00000000-0000-4000-8000-000000000097');
    raise exception 'FAIL dangling source_request_id accepted';
  exception when foreign_key_violation then null; end;

  begin
    insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status,
      source_request_id)
    values (v_other_org, 'WRK-2099-999997', v_fac, 'Cross-tenant provenance', 'request', 'medium',
      'requested', v_req);
    raise exception 'FAIL cross-tenant Work provenance accepted';
  exception when foreign_key_violation then null; end;

  -- 8. Derivation reads: Work links to this Request come from fm_work, not a column.
  select count(*) into v_n from public.fm_work where source_request_id = v_req;
  if v_n <> 1 then raise exception 'Work provenance derivation wrong: %', v_n; end if;

  -- 9. Deleting a Request cascades links and detaches (never deletes) Work.
  delete from public.fm_requests where id = v_req;
  select count(*) into v_n from public.fm_request_incident_links where request_id = v_req;
  if v_n <> 0 then raise exception 'links not cascaded'; end if;
  select count(*) into v_n from public.fm_work
    where code = 'WRK-2099-999999' and source_request_id is null;
  if v_n <> 1 then raise exception 'Work not detached (or deleted) on request delete'; end if;
end;
$$;

rollback;

select jsonb_build_object(
  'fm_requests_after_rollback', (select count(*)::int from public.fm_requests),
  'fm_request_incident_links_after_rollback', (select count(*)::int from public.fm_request_incident_links),
  'fm_work_after_rollback', (select count(*)::int from public.fm_work),
  'probe_org_after_rollback', (select count(*)::int from public.organisations where slug = 'rollback-probe-org-2c')
) as after_rollback;
