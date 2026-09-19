-- Linked Phase 2B smoke. All writes are rolled back.
begin;

do $$
declare
  v_org uuid;
  v_profile uuid;
  v_count integer;
begin
  select organisation_id into v_org
  from public.fm_facilities
  where id = 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0';
  if v_org is null then raise exception 'NCC Annex facility missing'; end if;

  select id into v_profile from public.profiles
  where organisation_id = v_org limit 1;
  if v_profile is null then raise exception 'No profile for rollback probe'; end if;

  insert into public.fm_work (
    organisation_id, code, facility_id, title, source, priority, status,
    created_by_profile_id, updated_by_profile_id
  ) values (
    v_org, 'WRK-2099-999999', 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0',
    'Rollback probe', 'manual', 'medium', 'requested', v_profile, v_profile
  );

  select count(*) into v_count from public.fm_work
  where code = 'WRK-2099-999999';
  if v_count <> 1 then raise exception 'Work insert probe failed'; end if;

  begin
    insert into public.fm_work (
      organisation_id, code, facility_id, title, source, priority, status,
      assigned_to_profile_id
    ) values (
      v_org, 'WRK-2099-999998', 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0',
      'Invalid assignee probe', 'manual', 'medium', 'requested',
      '00000000-0000-4000-8000-000000000098'
    );
    raise exception 'Cross-tenant assignee accepted';
  exception when foreign_key_violation then null;
  end;
end;
$$;

rollback;

select count(*)::int as fm_work_count_after_rollback from public.fm_work;
