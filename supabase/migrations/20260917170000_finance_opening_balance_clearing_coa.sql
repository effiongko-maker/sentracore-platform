-- Phase 2E: dedicated transitional Opening Balance Clearing GL (PayChex COA addition).
--
-- PURPOSE:
-- Temporary cutover control account used while SentraCore begins with cash/bank
-- opening positions before a complete Opening Trial Balance is migrated.
--
-- This is NOT permanent economic classification for owner capital or retained
-- earnings. Do not treat it as 3000 or 3010. Future full opening TB migration
-- may retire or reclassify this transitional control account.
--
-- Code 3020 is the next free equity-series code after 3010. Existing 60
-- authoritative PayChex accounts are not renumbered or altered.

insert into public.finance_accounts (
  organisation_id, code, name, account_type, classification, status
)
select
  o.id,
  '3020',
  'Opening Balance Clearing',
  'equity',
  'equity',
  'active'
from public.organisations o
where exists (
  select 1
  from public.finance_accounts a
  where a.organisation_id = o.id
    and a.code = '1060'
)
on conflict (organisation_id, code) do update
set
  name = excluded.name,
  account_type = excluded.account_type,
  classification = excluded.classification,
  status = 'active',
  updated_at = timezone('utc', now());

comment on column public.finance_accounts.classification is
  'Source grouping label. Phase 2E code 3020 Opening Balance Clearing uses equity '
  'account_type as a transitional cutover control — not permanent owner equity.';
