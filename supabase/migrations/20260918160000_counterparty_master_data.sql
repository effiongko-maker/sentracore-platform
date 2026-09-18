-- Extend the organisation-wide Counterparty master without changing Finance document snapshots.
alter table public.organisation_counterparties
  add column contact_person text,
  add column email text,
  add column phone text,
  add column address_line_1 text,
  add column address_line_2 text,
  add column city text,
  add column state_region text,
  add column country text;

drop function if exists public.organisation_counterparty_create(uuid, uuid, text, text, text, text, text, text[]);
drop function if exists public.organisation_counterparty_update(uuid, uuid, uuid, text, text, text, text, text, text[]);

create function public.organisation_counterparty_create(
  p_actor_profile_id uuid, p_organisation_id uuid, p_display_name text,
  p_legal_name text, p_party_kind text, p_tax_registration_id text,
  p_contact_person text, p_email text, p_phone text, p_address_line_1 text,
  p_address_line_2 text, p_city text, p_state_region text, p_country text,
  p_status text, p_roles text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_role text; v_email text := nullif(trim(p_email), '');
begin
  if not public.finance_payable_actor_has_capability(p_organisation_id,p_actor_profile_id,'platform_finance.counterparty.manage') then raise exception 'counterparty: missing manage authority'; end if;
  if coalesce(array_length(p_roles,1),0)<1 then raise exception 'counterparty: at least one role is required'; end if;
  if v_email is not null and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'counterparty: invalid email address'; end if;
  insert into public.organisation_counterparties(
    organisation_id,display_name,legal_name,party_kind,tax_registration_id,
    contact_person,email,phone,address_line_1,address_line_2,city,state_region,country,
    status,created_by_profile_id,updated_by_profile_id
  ) values (
    p_organisation_id,trim(p_display_name),nullif(trim(p_legal_name),''),p_party_kind,nullif(trim(p_tax_registration_id),''),
    nullif(trim(p_contact_person),''),v_email,nullif(trim(p_phone),''),nullif(trim(p_address_line_1),''),
    nullif(trim(p_address_line_2),''),nullif(trim(p_city),''),nullif(trim(p_state_region),''),nullif(trim(p_country),''),
    p_status,p_actor_profile_id,p_actor_profile_id
  ) returning id into v_id;
  foreach v_role in array p_roles loop
    insert into public.organisation_counterparty_roles(organisation_id,counterparty_id,role) values(p_organisation_id,v_id,v_role);
  end loop;
  return v_id;
end; $$;

create function public.organisation_counterparty_update(
  p_actor_profile_id uuid, p_organisation_id uuid, p_counterparty_id uuid,
  p_display_name text, p_legal_name text, p_party_kind text, p_tax_registration_id text,
  p_contact_person text, p_email text, p_phone text, p_address_line_1 text,
  p_address_line_2 text, p_city text, p_state_region text, p_country text,
  p_status text, p_roles text[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_role text; v_email text := nullif(trim(p_email), '');
begin
  if not public.finance_payable_actor_has_capability(p_organisation_id,p_actor_profile_id,'platform_finance.counterparty.manage') then raise exception 'counterparty: missing manage authority'; end if;
  if coalesce(array_length(p_roles,1),0)<1 then raise exception 'counterparty: at least one role is required'; end if;
  if v_email is not null and v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then raise exception 'counterparty: invalid email address'; end if;
  update public.organisation_counterparties set
    display_name=trim(p_display_name),legal_name=nullif(trim(p_legal_name),''),party_kind=p_party_kind,
    tax_registration_id=nullif(trim(p_tax_registration_id),''),contact_person=nullif(trim(p_contact_person),''),
    email=v_email,phone=nullif(trim(p_phone),''),address_line_1=nullif(trim(p_address_line_1),''),
    address_line_2=nullif(trim(p_address_line_2),''),city=nullif(trim(p_city),''),
    state_region=nullif(trim(p_state_region),''),country=nullif(trim(p_country),''),
    status=p_status,updated_by_profile_id=p_actor_profile_id
  where id=p_counterparty_id and organisation_id=p_organisation_id;
  if not found then raise exception 'counterparty: not found'; end if;
  delete from public.organisation_counterparty_roles where counterparty_id=p_counterparty_id;
  foreach v_role in array p_roles loop
    insert into public.organisation_counterparty_roles(organisation_id,counterparty_id,role) values(p_organisation_id,p_counterparty_id,v_role);
  end loop;
  return p_counterparty_id;
end; $$;

revoke all on function public.organisation_counterparty_create(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text[]) from public,anon,authenticated;
revoke all on function public.organisation_counterparty_update(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text[]) from public,anon,authenticated;
grant execute on function public.organisation_counterparty_create(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text[]) to service_role;
grant execute on function public.organisation_counterparty_update(uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,text,text[]) to service_role;
