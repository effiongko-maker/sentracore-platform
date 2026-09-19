-- Linked Phase 2J integrity probe. Every write is rolled back; leaves NO fm_vendors rows.
begin;

do $$
declare
  v_org uuid;
  v_other uuid;
  v_profile uuid;
  v_a uuid;
  v_n integer;
begin
  select id into v_org from public.organisations order by created_at limit 1;
  select id into v_profile from public.profiles where organisation_id = v_org limit 1;
  select id into v_other from public.organisations where id <> v_org limit 1;
  if v_org is null or v_profile is null then raise exception 'probe prerequisites missing'; end if;

  -- 1. Valid create with defaults; code/contact optional.
  insert into public.fm_vendors (organisation_id, name, created_by_profile_id) values (v_org, 'Probe Vendor A', v_profile) returning id into v_a;
  select count(*) into v_n from public.fm_vendors where id = v_a and status = 'active' and code is null and category is null;
  if v_n <> 1 then raise exception 'FAIL vendor defaults'; end if;
  insert into public.fm_vendors (organisation_id, name, code, category, contact_name, email, phone, status)
    values (v_org, 'Probe Vendor B', 'PRB-1', 'HVAC', 'Ada', 'ada@example.com', '0800', 'pending');
  insert into public.fm_vendors (organisation_id, name) values (v_org, 'Probe Vendor A');   -- duplicate names are allowed (not a stated rule)

  -- 2. Value / lifecycle integrity.
  begin update public.fm_vendors set name = '  ' where id = v_a; raise exception 'FAIL blank name accepted';
  exception when check_violation then null; end;
  begin update public.fm_vendors set status = 'suspended' where id = v_a; raise exception 'FAIL bad status accepted';
  exception when check_violation then null; end;
  begin update public.fm_vendors set category = 'Plumbers' where id = v_a; raise exception 'FAIL bad category accepted';
  exception when check_violation then null; end;
  begin update public.fm_vendors set code = '  ' where id = v_a; raise exception 'FAIL blank code accepted';
  exception when check_violation then null; end;
  begin insert into public.fm_vendors (organisation_id, name, code) values (v_org, 'Dup code', 'prb-1'); raise exception 'FAIL duplicate code accepted';
  exception when unique_violation then null; end;
  begin update public.fm_vendors set updated_by_profile_id = '00000000-0000-4000-8000-000000000098' where id = v_a; raise exception 'FAIL bad actor accepted';
  exception when foreign_key_violation then null; end;
  update public.fm_vendors set status = 'inactive' where id = v_a;   -- soft-deactivation

  -- 3. Tenant integrity: a profile from another organisation cannot be an actor; the same code may exist in another org.
  if v_other is not null then
    begin
      insert into public.fm_vendors (organisation_id, name, created_by_profile_id) values (v_other, 'Cross-tenant actor', v_profile);
      raise exception 'FAIL cross-tenant actor accepted';
    exception when foreign_key_violation then null; end;
    insert into public.fm_vendors (organisation_id, name, code) values (v_other, 'Other tenant', 'PRB-1');
  end if;

  -- 4. No Platform Finance / counterparty coupling.
  if exists (select 1 from pg_constraint where conrelid = 'public.fm_vendors'::regclass and contype = 'f'
             and confrelid::regclass::text not in ('organisations','profiles')) then
    raise exception 'FAIL fm_vendors references a non-tenant/profile table';
  end if;
end;
$$;

rollback;

select (select count(*) from public.fm_vendors) as vendors_now;
