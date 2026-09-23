-- FM Job Order route — the client Approval precedes the Job Order.
--
-- Job Order route (fm_work.commercial_route = 'job_order'):
--   Issue → Request Approval → Approval Granted → Job Order Issued → Execute
-- The Approval is the client's decision on the proposed Work, so it must be able to belong to the Work while no
-- Job Order (Work Instruction) exists yet. Additive only:
--
--   fm_approvals.work_id                 the Work the client decision is for (nullable; one Approval per Work).
--   fm_work_instructions.client_reference the client's own reference for the issued Job Order, recorded as supplied.
--
-- Existing rows are not touched: no backfill, no default. The 27 imported source-register Approvals keep
-- work_instruction_id = NULL and work_id = NULL (the source establishes no Work). The provenance requirement for an
-- Approval with neither relationship is unchanged.

alter table public.fm_approvals
  add column if not exists work_id uuid;

alter table public.fm_approvals
  drop constraint if exists fm_approvals_work_fk;
alter table public.fm_approvals
  add constraint fm_approvals_work_fk
    foreign key (organisation_id, work_id)
    references public.fm_work (organisation_id, id)
    on delete restrict;

-- One client Approval per Work (mirrors one per Work Instruction; revisions update the existing Approval).
create unique index if not exists fm_approvals_org_work_uidx
  on public.fm_approvals (organisation_id, work_id)
  where work_id is not null;

comment on column public.fm_approvals.work_id is
  'Work the client decision is for (Job Order route: the Approval exists before any Job Order). NULL for Approvals raised against a Work Instruction and for provenance-backed source-register Approvals. Only Job Order-route Work (commercial_route = job_order).';

create or replace function public.fm_approvals_source_register_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_route text;
  v_instruction_work uuid;
begin
  if tg_op = 'UPDATE' and new.source_note is distinct from old.source_note then
    raise exception 'fm_approvals.source_note is source evidence and cannot be changed' using errcode = '23514';
  end if;

  -- An Approval with neither a Work nor a Work Instruction, without a type, or with a source note is only valid as a
  -- provenance-backed source-register import.
  if (new.work_instruction_id is null and new.work_id is null) or new.approval_type is null or new.source_note is not null then
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

  if new.work_id is not null and (tg_op = 'INSERT' or new.work_id is distinct from old.work_id) then
    select w.commercial_route into v_route
    from public.fm_work w
    where w.organisation_id = new.organisation_id and w.id = new.work_id;
    if v_route is distinct from 'job_order' then
      raise exception 'fm_approvals: a Work-level client Approval is only for Job Order-route Work' using errcode = '23514';
    end if;
  end if;

  if new.work_id is not null and new.work_instruction_id is not null then
    select i.work_id into v_instruction_work
    from public.fm_work_instructions i
    where i.organisation_id = new.organisation_id and i.id = new.work_instruction_id;
    if v_instruction_work is distinct from new.work_id then
      raise exception 'fm_approvals: the Work Instruction must belong to the Approval''s Work' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

alter table public.fm_work_instructions
  add column if not exists client_reference text;

comment on column public.fm_work_instructions.client_reference is
  'The client''s own reference for an issued Job Order, recorded exactly as supplied. Never generated or derived (an Approval never fabricates it).';
