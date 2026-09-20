# ECC Operations runtime (V1, single centre)

- **Persistence:** Supabase `ecc_*` tables only; every access is server-mediated (service role) and organisation
  scoped. Direct authenticated (JWT) writes to `ecc_*` tables are closed; reads stay behind
  `has_ecc_operations_access`.
- **Authority (explicit grants, no role or Super Admin inference):** `platform.ecc_operations.view` enters the
  workspace and reads. Each write needs its own grant **in addition to view**: `.create` (Daily Ops, Issues,
  Requests), `.edit` (progress/follow-up/links), `.manage_people` (roster, shifts, attendance),
  `.manage_finance` (ECC budget/commitments/transactions), `.delete` (hard-delete Issues). The action→capability
  map is `server/eccActionAuthority.ts`; unknown actions fail closed.
- **Actors:** new records and history carry the authenticated profile UUID and its display name, stamped
  server-side. Typed names and browser "acting as" state are never identity. `ecc_people` is an ECC roster, not
  platform profiles.
- **Present tense:** a shift is current only inside its `starts_at`→`ends_at` window; open attendance is "on duty"
  only when it reconciles to that shift (`domain/shiftWindow.ts`). Historical rows are never mutated.
- **Browser storage is not domain state.** The legacy localStorage import is retired.
- **Single centre:** `ECC-001` only for this V1. `centreId` is preserved everywhere; no selection, switching or
  user-to-centre assignment exists yet.
- **Reporting vs Intelligence:** reports state recorded facts; Intelligence-derived analysis and recommendations
  are labelled as such in preview and Word.
- Verification: `scripts/verify-ecc-readiness.mts`.
