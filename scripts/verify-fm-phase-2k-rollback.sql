-- Linked Phase 2K integrity probe. Every write is rolled back; leaves NO log rows behind.
begin;

do $$
declare
  v_org uuid;
  v_other_org uuid;
  v_fac constant uuid := 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  v_fac_other uuid;
  v_profile uuid;
  v_item uuid;
  v_item2 uuid;
  v_n integer;
  v_val numeric;
begin
  select organisation_id into v_org from public.fm_facilities where id = v_fac;
  select id into v_profile from public.profiles where organisation_id = v_org limit 1;
  select id into v_other_org from public.organisations where id <> v_org limit 1;
  insert into public.fm_facilities (organisation_id, code, name) values (v_org, 'FAC-2099-K', 'Probe facility K') returning id into v_fac_other;
  if v_org is null or v_profile is null then raise exception 'probe prerequisites missing'; end if;

  -- 1. Generator: hours DERIVED (2h), cannot be supplied; ended < started → 0.
  insert into public.fm_generator_logs (organisation_id, code, log_date, generator, started_at, ended_at, fuel_used, created_by_profile_id)
    values (v_org, 'GENLOG-2099-000001', '2099-01-01', 'Gen A', '2099-01-01T08:00:00Z', '2099-01-01T10:00:00Z', 3.25, v_profile);
  select hours into v_val from public.fm_generator_logs where code = 'GENLOG-2099-000001';
  if v_val <> 2.00 then raise exception 'FAIL generator hours derivation (%)', v_val; end if;
  begin
    insert into public.fm_generator_logs (organisation_id, code, log_date, generator, started_at, ended_at, hours, fuel_used)
      values (v_org, 'GENLOG-2099-000002', '2099-01-01', 'Gen A', now(), now(), 99, 1);
    raise exception 'FAIL supplied hours accepted';
  exception when generated_always then null; end;
  insert into public.fm_generator_logs (organisation_id, code, log_date, generator, started_at, ended_at, fuel_used)
    values (v_org, 'GENLOG-2099-000003', '2099-01-01', 'Gen A', '2099-01-01T10:00:00Z', '2099-01-01T08:00:00Z', 1);
  select hours into v_val from public.fm_generator_logs where code = 'GENLOG-2099-000003';
  if v_val <> 0 then raise exception 'FAIL negative duration must give 0 hours'; end if;
  begin insert into public.fm_generator_logs (organisation_id, code, log_date, generator, started_at, ended_at, fuel_used) values (v_org, 'GENLOG-2099-000001', '2099-01-01', 'G', now(), now(), 1);
    raise exception 'FAIL duplicate code accepted'; exception when unique_violation then null; end;
  begin insert into public.fm_generator_logs (organisation_id, code, log_date, generator, started_at, ended_at, fuel_used) values (v_org, 'GENLOG-2099-000009', '2099-01-01', '  ', now(), now(), 1);
    raise exception 'FAIL blank generator accepted'; exception when check_violation then null; end;

  -- 2. Diesel: consumption DERIVED = opening + added − closing; facility tenant-safe; negatives are data.
  insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, added, closing_level)
    values (v_org, 'DSLU-2099-000001', '2099-01-01', v_fac, 'GEN-1', 100, 20, 90);
  select consumption into v_val from public.fm_diesel_usage where code = 'DSLU-2099-000001';
  if v_val <> 30 then raise exception 'FAIL diesel consumption (%)', v_val; end if;
  insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, closing_level)
    values (v_org, 'DSLU-2099-000002', '2099-01-01', v_fac, 'GEN-1', 50, 60);  -- added defaults to 0 → −10 (flagged by the product, still valid data)
  select consumption into v_val from public.fm_diesel_usage where code = 'DSLU-2099-000002';
  if v_val <> -10 then raise exception 'FAIL negative consumption must be preserved'; end if;
  begin insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, closing_level) values (v_org, 'DSLU-2099-000003', '2099-01-01', '00000000-0000-4000-8000-000000000097', 'G', 1, 1);
    raise exception 'FAIL dangling facility accepted'; exception when foreign_key_violation then null; end;
  if v_other_org is not null then
    begin insert into public.fm_diesel_usage (organisation_id, code, log_date, facility_id, generator_ref, opening_level, closing_level) values (v_other_org, 'DSLU-2099-000004', '2099-01-01', v_fac, 'G', 1, 1);
      raise exception 'FAIL cross-tenant facility accepted'; exception when foreign_key_violation then null; end;
    begin insert into public.fm_waste_logs (organisation_id, code, log_date, facility_id, waste_type, quantity, unit, disposal_method, created_by_profile_id) values (v_other_org, 'WLOG-2099-000009', '2099-01-01', v_fac, 'x', 1, 'kg', 'y', v_profile);
      raise exception 'FAIL cross-tenant actor/facility accepted'; exception when foreign_key_violation then null; end;
  end if;

  -- 3. Energy / waste / fumigation / deep cleaning: required fields, free-text vendor & status, no vendor FK.
  insert into public.fm_energy_readings (organisation_id, code, log_date, meter, reading) values (v_org, 'ENRG-2099-000001', '2099-01-01', 'M-1', 100.5);
  begin insert into public.fm_energy_readings (organisation_id, code, log_date, meter, reading) values (v_org, 'ENRG-2099-000002', '2099-01-01', ' ', 1);
    raise exception 'FAIL blank meter accepted'; exception when check_violation then null; end;
  insert into public.fm_waste_logs (organisation_id, code, log_date, facility_id, waste_type, quantity, unit, disposal_method) values (v_org, 'WLOG-2099-000001', '2099-01-01', v_fac, 'General', 1.5, 'bags', 'Incineration');
  begin insert into public.fm_waste_logs (organisation_id, code, log_date, facility_id, waste_type, quantity, unit, disposal_method) values (v_org, 'WLOG-2099-000002', '2099-01-01', v_fac, 'General', 1, '', 'x');
    raise exception 'FAIL blank unit accepted'; exception when check_violation then null; end;
  insert into public.fm_fumigation_logs (organisation_id, code, log_date, facility_id, area_treated, pest_type, vendor_name, next_due_date) values (v_org, 'FLOG-2099-000001', '2099-01-01', v_fac, 'Kitchen', 'Rodent', 'Some Pest Co', '2099-02-01');
  begin insert into public.fm_fumigation_logs (organisation_id, code, log_date, facility_id, area_treated, pest_type, vendor_name, next_due_date) values (v_org, 'FLOG-2099-000002', '2099-01-01', v_fac, 'K', 'R', ' ', '2099-02-01');
    raise exception 'FAIL blank vendor accepted'; exception when check_violation then null; end;
  insert into public.fm_deep_cleaning_logs (organisation_id, code, log_date, facility_id, area, vendor_team, status) values (v_org, 'DCLOG-2099-000001', '2099-01-01', v_fac, 'Lobby', 'Clean Team', 'Any free text');
  begin insert into public.fm_deep_cleaning_logs (organisation_id, code, log_date, facility_id, area, vendor_team, status) values (v_org, 'DCLOG-2099-000002', '2099-01-01', v_fac, 'L', 'T', '');
    raise exception 'FAIL blank status accepted'; exception when check_violation then null; end;

  -- 4. Consumables: closing DERIVED; per-facility item identity; update facility must equal item facility.
  insert into public.fm_consumables_items (organisation_id, code, facility_id, name) values (v_org, 'ITEM-2099-000001', v_fac, 'Soap') returning id into v_item;
  begin insert into public.fm_consumables_items (organisation_id, code, facility_id, name) values (v_org, 'ITEM-2099-000002', v_fac, 'SOAP');
    raise exception 'FAIL duplicate item name in one facility accepted'; exception when unique_violation then null; end;
  insert into public.fm_consumables_items (organisation_id, code, facility_id, name) values (v_org, 'ITEM-2099-000003', v_fac_other, 'Soap') returning id into v_item2;  -- same name, other facility: distinct identity
  insert into public.fm_consumables_updates (organisation_id, code, log_date, facility_id, item_id, opening, received, issued, reorder_level) values (v_org, 'CNUP-2099-000001', '2099-01-01', v_fac, v_item, 10, 5, 2, 3);
  select closing into v_val from public.fm_consumables_updates where code = 'CNUP-2099-000001';
  if v_val <> 13 then raise exception 'FAIL closing derivation (%)', v_val; end if;
  begin insert into public.fm_consumables_updates (organisation_id, code, log_date, facility_id, item_id, opening, issued) values (v_org, 'CNUP-2099-000002', '2099-01-01', v_fac_other, v_item, 1, 1);
    raise exception 'FAIL update facility differing from its item accepted'; exception when foreign_key_violation then null; end;
  begin insert into public.fm_consumables_updates (organisation_id, code, log_date, facility_id, item_id, opening, closing, issued) values (v_org, 'CNUP-2099-000003', '2099-01-01', v_fac, v_item, 1, 99, 1);
    raise exception 'FAIL supplied closing accepted'; exception when generated_always then null; end;
  begin delete from public.fm_consumables_items where id = v_item; raise exception 'FAIL item with updates deleted'; exception when foreign_key_violation then null; end;

  -- 5. Actors are tenant-safe profile UUIDs.
  begin update public.fm_waste_logs set updated_by_profile_id = '00000000-0000-4000-8000-000000000098' where code = 'WLOG-2099-000001';
    raise exception 'FAIL bad actor accepted'; exception when foreign_key_violation then null; end;

  -- 6. No vendor / Platform Finance coupling; generator & energy carry no facility column.
  select count(*) into v_n from pg_constraint where contype = 'f' and confrelid = 'public.fm_vendors'::regclass;
  if v_n <> 0 then raise exception 'FAIL a log references fm_vendors'; end if;
end;
$$;

rollback;

select
  (select count(*) from public.fm_generator_logs) + (select count(*) from public.fm_energy_readings) + (select count(*) from public.fm_diesel_usage)
  + (select count(*) from public.fm_waste_logs) + (select count(*) from public.fm_fumigation_logs) + (select count(*) from public.fm_deep_cleaning_logs)
  + (select count(*) from public.fm_consumables_updates) + (select count(*) from public.fm_consumables_items) as log_rows_now,
  (select count(*) from public.fm_facilities where code like '%2099%') as leftover_facilities;
