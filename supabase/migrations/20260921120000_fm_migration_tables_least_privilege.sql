-- FM migration tables — least privilege for service_role.
--
-- 20260921100000 intended `grant select, insert` to service_role on these three tables, but Supabase's default
-- privileges for the public schema ALSO grant service_role UPDATE, DELETE, TRUNCATE, REFERENCES and TRIGGER on
-- every new table. The append-only triggers on fm_migration_batches / fm_migration_provenance block row UPDATE and
-- DELETE, but a row trigger does not fire for TRUNCATE, and fm_consumables_register_entries has no such trigger.
--
-- Required privileges (verified against the code): nothing under src/ touches these tables; the controlled importer
-- connects as the database owner over a direct connection. service_role therefore keeps only what the approved design
-- granted: SELECT (readers / reconciliation) and INSERT (append-only ledger and historical evidence).
--
-- This migration changes privileges only. It does not touch RLS, triggers, constraints, data or any other object.

revoke update, delete, truncate, references, trigger
  on table public.fm_migration_batches, public.fm_migration_provenance, public.fm_consumables_register_entries
  from service_role;

-- Idempotent restatement of the intended grants.
grant select, insert
  on table public.fm_migration_batches, public.fm_migration_provenance, public.fm_consumables_register_entries
  to service_role;
