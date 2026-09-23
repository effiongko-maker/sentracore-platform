-- FM Client Payments — the broader FM concept for amounts FM has requested from the client and is awaiting /
-- recording receipt of. The existing claim table (fm_cost_submissions) already carried submission_kind for exactly
-- this purpose (its UI suggestions were "Monthly contractual", "Job / completion-based", "Ad hoc reimbursement");
-- it is FORMALISED here as the controlled discriminator rather than adding a parallel column:
--
--   reimbursement_claim  — recovery of eligible recorded costs. EVERY existing control is unchanged: >= 1 cost to
--                          submit (domain), client authorization required before a receipt, receipts capped at the
--                          authorized amount, protected edit/revise/correct actions.
--   payment_request      — a job/work payment request billed to the client. No costs, no authorization.
--   contract_instalment  — a contract instalment billed to the client. No costs, no authorization.
--
-- For payment_request / contract_instalment a submitted request must state its requested amount (claim_amount);
-- receipts use the existing fm_reimbursement_payments (partial receipts supported) capped at that amount.
-- Settlement state (awaiting / partially received / received) is DERIVED from receipts — never stored.
--
-- Imported live source records carry no invented actor: submitted_by_profile_id may be NULL only when governed
-- migration provenance exists for the row (written first). source_note is the source's own UPDATE text —
-- provenance-only and immutable. client_location is the client's current processing point (operational, editable).
-- All claim tables hold 0 rows at the time of this migration.

-- ---------------------------------------------------------------------------
-- submission_kind: controlled, immutable discriminator
-- ---------------------------------------------------------------------------
update public.fm_cost_submissions set submission_kind = 'reimbursement_claim'
where submission_kind is null or submission_kind not in ('reimbursement_claim', 'payment_request', 'contract_instalment');

alter table public.fm_cost_submissions alter column submission_kind set default 'reimbursement_claim';
alter table public.fm_cost_submissions alter column submission_kind set not null;
alter table public.fm_cost_submissions
  add constraint fm_cost_submissions_kind_check
    check (submission_kind in ('reimbursement_claim', 'payment_request', 'contract_instalment')),
  -- A submitted payment request / instalment must state what was requested.
  add constraint fm_cost_submissions_requested_amount_required
    check (
      submission_kind = 'reimbursement_claim'
      or status not in ('submitted', 'queried')
      or (claim_amount is not null and claim_amount > 0)
    );

comment on column public.fm_cost_submissions.submission_kind is
  'Client payment type: reimbursement_claim (cost recovery; authorization required) | payment_request | contract_instalment. Immutable.';

-- ---------------------------------------------------------------------------
-- Source fields for the live register
-- ---------------------------------------------------------------------------
alter table public.fm_cost_submissions
  add column description text,
  add column client_location text,
  add column source_note text;

-- A submitted payment request / instalment must say what was requested (claims describe themselves by their costs).
alter table public.fm_cost_submissions
  add constraint fm_cost_submissions_description_required
    check (
      submission_kind = 'reimbursement_claim'
      or status not in ('submitted', 'queried')
      or (description is not null and char_length(trim(description)) > 0)
    );

comment on column public.fm_cost_submissions.description is
  'What was requested from the client (payment requests / contract instalments).';

comment on column public.fm_cost_submissions.client_location is
  'Client''s current processing point for this request (operational; may be updated as it moves).';
comment on column public.fm_cost_submissions.source_note is
  'Verbatim note from the source register (evidence only). Set solely by a provenance-backed import; immutable.';

-- submitted_at stays required once submitted; submitted_by is required unless the row is provenance-backed.
alter table public.fm_cost_submissions drop constraint fm_cost_submissions_submitted_complete;
alter table public.fm_cost_submissions
  add constraint fm_cost_submissions_submitted_complete
    check (status not in ('submitted', 'queried') or submitted_at is not null);

create or replace function public.fm_cost_submissions_client_payment_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.submission_kind is distinct from old.submission_kind then
      raise exception 'fm_cost_submissions.submission_kind is immutable' using errcode = '23514';
    end if;
    if new.source_note is distinct from old.source_note then
      raise exception 'fm_cost_submissions.source_note is source evidence and cannot be changed' using errcode = '23514';
    end if;
  end if;

  if (new.status in ('submitted', 'queried') and new.submitted_by_profile_id is null) or new.source_note is not null then
    if not exists (
      select 1 from public.fm_migration_provenance p
      where p.organisation_id = new.organisation_id
        and p.target_table = 'fm_cost_submissions'
        and p.target_id = new.id
    ) then
      raise exception 'fm_cost_submissions: a submitted request without a submitting profile, or a source note, requires migration provenance'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger fm_cost_submissions_client_payment_guard
before insert or update on public.fm_cost_submissions
for each row execute function public.fm_cost_submissions_client_payment_guard();

-- ---------------------------------------------------------------------------
-- Cost items and authorizations belong to reimbursement claims only
-- ---------------------------------------------------------------------------
create or replace function public.fm_cost_submission_items_claim_only()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.fm_cost_submissions s
    where s.organisation_id = new.organisation_id and s.id = new.submission_id
      and s.submission_kind = 'reimbursement_claim'
  ) then
    raise exception 'Cost records can only be linked to reimbursement claims' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger fm_cost_submission_items_claim_only
before insert or update on public.fm_cost_submission_items
for each row execute function public.fm_cost_submission_items_claim_only();

create or replace function public.validate_fm_authorization_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.fm_cost_submissions s
    where s.organisation_id = new.organisation_id and s.id = new.submission_id and s.status = 'submitted'
  ) then
    raise exception 'Only submitted claims can be authorized' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.fm_cost_submissions s
    where s.organisation_id = new.organisation_id and s.id = new.submission_id and s.submission_kind = 'reimbursement_claim'
  ) then
    raise exception 'Reimbursement authorization applies to reimbursement claims only' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Receipts: claims unchanged (authorization required, capped at authorized); other client payments capped at the
-- requested amount, no authorization. Partial receipts supported for all.
-- ---------------------------------------------------------------------------
create or replace function public.validate_fm_reimbursement_payment()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_kind text;
  v_requested numeric;
  v_cap numeric;
  v_paid numeric;
begin
  select s.status, s.submission_kind, s.claim_amount into v_status, v_kind, v_requested
    from public.fm_cost_submissions s
   where s.organisation_id = new.organisation_id and s.id = new.submission_id
   for update;
  if v_status is null or v_status not in ('submitted', 'queried') then
    raise exception 'Payments can only be recorded against submitted or queried claims'
      using errcode = '23514';
  end if;

  if v_kind = 'reimbursement_claim' then
    select a.authorized_amount into v_cap from public.fm_reimbursement_authorizations a
     where a.organisation_id = new.organisation_id and a.submission_id = new.submission_id
     for update;
    if v_cap is null then
      raise exception 'A reimbursement authorization is required before recording a payment'
        using errcode = '23514';
    end if;
  else
    v_cap := v_requested;
    if v_cap is null then
      raise exception 'The client payment has no requested amount' using errcode = '23514';
    end if;
  end if;

  select coalesce(sum(p.received_amount), 0) into v_paid from public.fm_reimbursement_payments p
   where p.organisation_id = new.organisation_id and p.submission_id = new.submission_id and p.id <> new.id;
  if v_paid + new.received_amount > v_cap then
    raise exception 'Payment exceeds outstanding authorized amount (outstanding %, attempted %)',
      greatest(v_cap - v_paid, 0), new.received_amount
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provenance target
-- ---------------------------------------------------------------------------
alter table public.fm_migration_provenance
  drop constraint fm_migration_provenance_target_check;
alter table public.fm_migration_provenance
  add constraint fm_migration_provenance_target_check
    check (target_table in (
      'fm_requests', 'fm_incidents', 'fm_assets', 'fm_work', 'fm_work_instructions',
      'fm_generator_logs', 'fm_diesel_usage', 'fm_consumables_items', 'fm_consumables_register_entries',
      'fm_buildings', 'fm_floors', 'fm_rooms', 'fm_departments', 'fm_cost_records',
      'platform_finance_historical_commercial_facts', 'fm_facilities', 'fm_work_facilities',
      'fm_approvals', 'finance_receivables', 'fm_cost_submissions'
    ));

comment on table public.fm_cost_submissions is
  'FM Client Payments: amounts FM has requested from the client (reimbursement claims, payment requests, contract instalments). Settlement derives from fm_reimbursement_payments.';
