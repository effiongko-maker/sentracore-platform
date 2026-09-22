-- Platform Finance — Historical Commercial Facts foundation.
--
-- Preserves pre-SentraCore™ client commercial facts (submitted/authorised/received amounts, payment status,
-- payment datetime, commercial reference, source counterparty text) WITHOUT pretending SentraCore™ participated in
-- the original transaction. Deliberately NOT modelled as finance_invoices / finance_receivables / finance_receipts /
-- finance_transactions / finance_requests: none of those can be populated without fabricating a workflow (draft →
-- review → issue → post, a company, a bank account, a counterparty relationship, or a GL posting) that these
-- historical rows never went through. This is a dedicated, explicitly historical entity — the same architectural
-- move fm_work / fm_cost_records already made for FM facts (record_origin), applied here to Platform Finance.
--
-- Foundation only: schema + authority. No rows are imported by this migration.

create table public.platform_finance_historical_commercial_facts (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,

  -- This table exists ONLY to hold historical facts — record_origin is fixed and immutable (trigger below), the
  -- same defensive pattern used for fm_work / fm_cost_records, so a future consumer can never mistake a row here
  -- for anything SentraCore™ itself transacted.
  record_origin text not null default 'migrated_historical',

  -- Always known: the source transaction's own description text.
  description text not null,

  -- Independently evidenced, nullable financial facts. Never defaulted, never derived from one another here —
  -- the read-time spread (submitted/authorised − execution cost) is computed by the read model, never stored.
  submitted_amount numeric(18, 2),
  authorised_amount numeric(18, 2),
  amount_received numeric(18, 2),
  currency text not null default 'NGN',

  -- The source's OWN status text, verbatim (e.g. "Paid", "Pending", "JUST Requested") — never SentraCore™ workflow
  -- status, and never conflated with it.
  source_payment_status text,

  -- Parsed payment datetime plus the raw source text preserved verbatim (the source column is free text, not a
  -- formatted Excel datetime cell — see the reconciliation this migration follows from).
  payment_datetime timestamptz,
  payment_datetime_source_text text,

  -- Free text only: a commercial/order reference (e.g. a TRV letter reference, invoice number, order S/N) and the
  -- source's own counterparty text. Deliberately NOT a foreign key to organisation_counterparties — no counterparty
  -- relationship is asserted; only the text as the source wrote it.
  commercial_reference text,
  source_counterparty_text text,

  -- Optional link to FM Work / Work Instruction — populated ONLY where an already-governed CERTAIN relationship
  -- exists (i.e. the same source row already carries fm_migration_provenance to that Work/WI). Never inferred here.
  fm_work_id uuid,
  fm_work_instruction_id uuid,

  created_by_profile_id uuid references public.profiles (id) on delete set null,
  updated_by_profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  constraint pfhcf_org_id_unique unique (organisation_id, id),
  constraint pfhcf_code_nonempty check (char_length(trim(code)) > 0),
  constraint pfhcf_description_nonempty check (char_length(trim(description)) > 0),
  constraint pfhcf_record_origin_check check (record_origin = 'migrated_historical'),
  constraint pfhcf_currency_check check (char_length(trim(currency)) = 3),
  constraint pfhcf_submitted_amount_check
    check (submitted_amount is null or (submitted_amount > 0 and submitted_amount = round(submitted_amount, 2))),
  constraint pfhcf_authorised_amount_check
    check (authorised_amount is null or (authorised_amount > 0 and authorised_amount = round(authorised_amount, 2))),
  constraint pfhcf_amount_received_check
    check (amount_received is null or (amount_received > 0 and amount_received = round(amount_received, 2))),
  constraint pfhcf_work_fk
    foreign key (organisation_id, fm_work_id) references public.fm_work (organisation_id, id) on delete restrict,
  constraint pfhcf_work_instruction_fk
    foreign key (organisation_id, fm_work_instruction_id) references public.fm_work_instructions (organisation_id, id) on delete restrict
);

create unique index pfhcf_org_code_uidx on public.platform_finance_historical_commercial_facts (organisation_id, lower(code));
create index pfhcf_org_idx on public.platform_finance_historical_commercial_facts (organisation_id);
create index pfhcf_work_idx on public.platform_finance_historical_commercial_facts (organisation_id, fm_work_id) where fm_work_id is not null;
create index pfhcf_work_instruction_idx on public.platform_finance_historical_commercial_facts (organisation_id, fm_work_instruction_id) where fm_work_instruction_id is not null;

create trigger pfhcf_set_updated_at
before update on public.platform_finance_historical_commercial_facts
for each row execute function public.set_updated_at();

-- record_origin is immutable — the same generic trigger function fm_work / fm_cost_records already use (it has no
-- FM-specific logic: it only compares old.record_origin to new.record_origin on whatever table fires it).
create trigger pfhcf_record_origin_immutable
before update on public.platform_finance_historical_commercial_facts
for each row execute function public.fm_prevent_record_origin_change();

comment on table public.platform_finance_historical_commercial_facts is
  'Historical (pre-SentraCore™) client commercial facts, preserved without fabricating the native Finance workflow. Not finance_invoices/receivables/receipts/transactions/requests. record_origin is fixed to migrated_historical and immutable. This foundation ships with NO update path: the existing protected-action mechanism (authorizeProtectedAction) is coupled to the FM OperatingAccess/AccessCapability resolver, not to platform_finance.* capabilities, so it has no appropriate pattern to reuse here. Correcting an imported fact requires a superseding, provenance-governed migration (the same discipline fm_migration_provenance already enforces for imports), never an ad-hoc row edit.';
comment on column public.platform_finance_historical_commercial_facts.payment_datetime_source_text is
  'The source cell verbatim (e.g. "14:57 May 23, 2025") — the source stores this as free text, not a formatted Excel datetime; preserved alongside the parsed payment_datetime.';
comment on column public.platform_finance_historical_commercial_facts.fm_work_id is
  'Populated only when an existing governed fm_migration_provenance relationship already ties the SAME source row to this Work — never inferred by this table.';

alter table public.platform_finance_historical_commercial_facts enable row level security;

create policy pfhcf_select on public.platform_finance_historical_commercial_facts
for select to authenticated
using (
  public.is_org_member(organisation_id)
  and (
    public.has_finance_capability(organisation_id, 'platform_finance.historical.view')
    or public.has_finance_capability(organisation_id, 'platform_finance.historical.manage')
  )
);

create policy pfhcf_insert on public.platform_finance_historical_commercial_facts
for insert to authenticated
with check (
  public.is_org_member(organisation_id)
  and public.has_finance_capability(organisation_id, 'platform_finance.historical.manage')
);

-- No update policy and no delete policy: this foundation has no correction mechanism (see table comment). Every
-- row is historical by definition — insert (import) and select are the only application-facing operations. The
-- record_origin-immutability trigger above still applies as defense-in-depth for any future service_role path.

grant select, insert on table public.platform_finance_historical_commercial_facts to authenticated;
grant all on table public.platform_finance_historical_commercial_facts to service_role;

-- Migration provenance: reuse the EXISTING governed provenance ledger — additive only. No existing row, target, or
-- other constraint on fm_migration_provenance changes.
alter table public.fm_migration_provenance
  drop constraint fm_migration_provenance_target_check;
alter table public.fm_migration_provenance
  add constraint fm_migration_provenance_target_check
    check (target_table in (
      'fm_requests', 'fm_incidents', 'fm_assets', 'fm_work', 'fm_work_instructions',
      'fm_generator_logs', 'fm_diesel_usage', 'fm_consumables_items', 'fm_consumables_register_entries',
      'fm_buildings', 'fm_floors', 'fm_rooms', 'fm_departments', 'fm_cost_records',
      'platform_finance_historical_commercial_facts'
    ));

-- New Platform Finance capabilities (additive to the existing format-checked capability namespace).
comment on table public.finance_capability_grants is
  'Explicit Platform Finance capability grants. Never derived from FM finance.* or executive role name. Includes platform_finance.historical.view / platform_finance.historical.manage for the historical-commercial-facts foundation.';
