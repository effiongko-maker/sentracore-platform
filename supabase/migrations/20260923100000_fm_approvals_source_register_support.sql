-- FM Approvals — support for LIVE client approval requests brought in from the external source register
-- ("Pending Approval" sheet). These are active Approvals (awaiting_decision), not archive records: after import
-- they are progressed natively (Follow-up / Record Decision) like any other Approval.
--
-- The source establishes no Work Order and no approval type for these requests, so both become nullable —
-- but ONLY for rows whose origin is proven by governed migration provenance (fm_migration_provenance,
-- target_table = 'fm_approvals'). Migration is provenance, not a business status: no origin column is added.
-- Native Approvals are unaffected: the domain still requires a Work Instruction and defaults the type, and
-- the guard below rejects any non-provenance row that lacks either.
--
-- Provenance must be written BEFORE the Approval row (its target_id is the deterministic Approval UUID and
-- carries no FK), so the guard can verify it on insert.

alter table public.fm_approvals alter column work_instruction_id drop not null;
alter table public.fm_approvals alter column approval_type drop not null;

-- Verbatim source evidence (e.g. "EXECUTED, NO JOB ORDER"). Never a status, never reinterpreted, never edited.
alter table public.fm_approvals add column source_note text;

comment on column public.fm_approvals.work_instruction_id is
  'Work Instruction the Approval is raised against. NULL only for provenance-backed source-register Approvals whose source establishes no Work Order (enforced by fm_approvals_source_register_guard).';
comment on column public.fm_approvals.approval_type is
  'Approval type. NULL only for provenance-backed source-register Approvals whose source establishes no type (never a placeholder).';
comment on column public.fm_approvals.source_note is
  'Verbatim note from the source register (evidence only). Set solely by a provenance-backed import; immutable thereafter.';

create or replace function public.fm_approvals_source_register_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.source_note is distinct from old.source_note then
    raise exception 'fm_approvals.source_note is source evidence and cannot be changed' using errcode = '23514';
  end if;

  if new.work_instruction_id is null or new.approval_type is null or new.source_note is not null then
    if not exists (
      select 1
      from public.fm_migration_provenance p
      where p.organisation_id = new.organisation_id
        and p.target_table = 'fm_approvals'
        and p.target_id = new.id
    ) then
      raise exception 'fm_approvals: a missing Work Instruction / approval type or a source note requires migration provenance'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger fm_approvals_source_register_guard
before insert or update on public.fm_approvals
for each row execute function public.fm_approvals_source_register_guard();

alter table public.fm_migration_provenance
  drop constraint fm_migration_provenance_target_check;
alter table public.fm_migration_provenance
  add constraint fm_migration_provenance_target_check
    check (target_table in (
      'fm_requests', 'fm_incidents', 'fm_assets', 'fm_work', 'fm_work_instructions',
      'fm_generator_logs', 'fm_diesel_usage', 'fm_consumables_items', 'fm_consumables_register_entries',
      'fm_buildings', 'fm_floors', 'fm_rooms', 'fm_departments', 'fm_cost_records',
      'platform_finance_historical_commercial_facts', 'fm_facilities', 'fm_work_facilities',
      'fm_approvals'
    ));
