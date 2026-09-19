-- Linked Phase 2H lifecycle/integrity probe. Every write is rolled back.
-- Leaves NO fm_assets / fm_facilities / fm_work / fm_work_instructions / fm_incidents rows behind.
begin;

do $$
declare
  v_org uuid;
  v_other_org uuid;
  v_fac constant uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_fac2 uuid;
  v_profile uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_work uuid;
  v_inc uuid;
  v_wi uuid;
  v_n integer;
begin
  select organisation_id into v_org from public.fm_facilities where id = v_fac;
  if v_org is null then raise exception 'NCC Annex facility missing'; end if;
  select id into v_profile from public.profiles where organisation_id = v_org limit 1;
  if v_profile is null then raise exception 'No profile for probe'; end if;
  insert into public.fm_facilities (organisation_id, code, name) values (v_org, 'FAC-2099-999', 'Probe facility') returning id into v_fac2;

  -- 1. Defaults + valid create; the Sheet's free-text columns do not exist.
  insert into public.fm_assets (organisation_id, code, facility_id, name, assigned_to_profile_id, created_by_profile_id)
  values (v_org, 'AST-2099-999999', v_fac, 'Probe pump', v_profile, v_profile) returning id into v_a1;
  select count(*) into v_n from public.fm_assets
   where id = v_a1 and category = 'other' and condition = 'good' and status = 'pending' and criticality = 'unassessed';
  if v_n <> 1 then raise exception 'FAIL asset defaults'; end if;
  insert into public.fm_assets (organisation_id, code, facility_id, name) values (v_org, 'AST-2099-999998', v_fac2, 'Probe other-facility asset') returning id into v_a2;

  -- 2. Value / lifecycle integrity.
  begin update public.fm_assets set name = '  ' where id = v_a1; raise exception 'FAIL blank name accepted';
  exception when check_violation then null; end;
  begin update public.fm_assets set category = 'plumbing' where id = v_a1; raise exception 'FAIL bad category accepted';
  exception when check_violation then null; end;
  begin update public.fm_assets set status = 'retired' where id = v_a1; raise exception 'FAIL bad status accepted';
  exception when check_violation then null; end;
  begin update public.fm_assets set condition = 'broken' where id = v_a1; raise exception 'FAIL bad condition accepted';
  exception when check_violation then null; end;
  begin update public.fm_assets set criticality = 'extreme' where id = v_a1; raise exception 'FAIL bad criticality accepted';
  exception when check_violation then null; end;
  begin update public.fm_assets set code = 'ast-2099-999998' where id = v_a1; raise exception 'FAIL duplicate code accepted';
  exception when unique_violation then null; end;
  begin update public.fm_assets set facility_id = '00000000-0000-4000-8000-000000000097' where id = v_a1; raise exception 'FAIL dangling facility accepted';
  exception when foreign_key_violation then null; end;
  begin update public.fm_assets set assigned_to_profile_id = '00000000-0000-4000-8000-000000000098' where id = v_a1; raise exception 'FAIL bad assignee accepted';
  exception when foreign_key_violation then null; end;
  begin insert into public.fm_assets (organisation_id, code, facility_id, name) values (v_org, 'AST-2099-999997', null, 'no facility'); raise exception 'FAIL facility-less asset accepted';
  exception when not_null_violation then null; end;
  update public.fm_assets set status = 'inactive' where id = v_a1;   -- soft-deactivation is a status change
  update public.fm_assets set status = 'active' where id = v_a1;

  -- 3. Operational relationships: UUID FK, optional, facility-consistent.
  insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status, asset_id)
  values (v_org, 'WRK-2099-999999', v_fac, 'probe work', 'manual', 'medium', 'requested', v_a1) returning id into v_work;
  insert into public.fm_incidents (organisation_id, code, facility_id, title, asset_id)
  values (v_org, 'INC-2099-999999', v_fac, 'probe incident', v_a1) returning id into v_inc;
  insert into public.fm_work_instructions (organisation_id, code, order_type, work_id, facility_id, title, asset_id)
  values (v_org, 'WO-2099-999999', 'work_order', v_work, v_fac, 'probe instruction', v_a1) returning id into v_wi;
  insert into public.fm_incidents (organisation_id, code, facility_id, title) values (v_org, 'INC-2099-999998', v_fac, 'incident without asset');  -- asset optional

  begin
    insert into public.fm_incidents (organisation_id, code, facility_id, title, asset_id)
    values (v_org, 'INC-2099-999997', v_fac, 'asset from another facility', v_a2);
    raise exception 'FAIL incident accepted an asset from another facility';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.fm_work (organisation_id, code, facility_id, title, source, priority, status, asset_id)
    values (v_org, 'WRK-2099-999998', v_fac, 'work with foreign-facility asset', 'manual', 'medium', 'requested', v_a2);
    raise exception 'FAIL work accepted an asset from another facility';
  exception when foreign_key_violation then null; end;
  begin
    update public.fm_work_instructions set asset_id = v_a2 where id = v_wi;
    raise exception 'FAIL work instruction accepted an asset from another facility';
  exception when foreign_key_violation then null; end;
  begin
    update public.fm_incidents set asset_id = '00000000-0000-4000-8000-000000000096' where id = v_inc;
    raise exception 'FAIL dangling asset accepted';
  exception when foreign_key_violation then null; end;
  begin
    update public.fm_assets set facility_id = v_fac2 where id = v_a1;
    raise exception 'FAIL asset facility moved while records in another facility reference it';
  exception when foreign_key_violation then null; end;
  begin
    delete from public.fm_assets where id = v_a1;
    raise exception 'FAIL referenced asset deleted';
  exception when foreign_key_violation then null; end;

  -- 4. Cross-tenant: a second organisation cannot reference this tenant's asset.
  select id into v_other_org from public.organisations where id <> v_org limit 1;
  if v_other_org is not null then
    begin
      insert into public.fm_assets (organisation_id, code, facility_id, name) values (v_other_org, 'AST-2099-999990', v_fac, 'cross-tenant facility');
      raise exception 'FAIL cross-tenant facility accepted';
    exception when foreign_key_violation then null; end;
  end if;

  -- 5. Opaque refs are gone; nothing stores a code as a relationship.
  if exists (select 1 from information_schema.columns where table_schema='public' and column_name='asset_ref'
             and table_name in ('fm_incidents','fm_work','fm_work_instructions')) then
    raise exception 'FAIL asset_ref still exists';
  end if;
end;
$$;

rollback;

select
  (select count(*) from public.fm_assets where code like '%-2099-%') as leftover_assets,
  (select count(*) from public.fm_facilities where code like '%-2099-%') as leftover_facilities,
  (select count(*) from public.fm_work where code like '%-2099-%') as leftover_work,
  (select count(*) from public.fm_incidents where code like '%-2099-%') as leftover_incidents,
  (select count(*) from public.fm_work_instructions where code like '%-2099-%') as leftover_wi;
