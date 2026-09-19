# Facility Management runtime architecture — invariants

These are standing rules, not history. They exist so nobody reconnects FM to Sheets by accident.

## Persistence

- **Facility Management persistence is Supabase / Postgres.** Every FM domain (facilities and location,
  people and assignments, requests, incidents, work, work instructions, approvals, costs and claims,
  reimbursements, assets, vendors, operational logs) is stored in `fm_*` tables and reached through a
  server-only service (`browser → /api/* route → capability gate → server-only service → Supabase`).
- **Apps Script and Google Sheets are not an FM runtime source.** No FM route, service, hook or job may
  read or write a Sheet. There is no Apps Script transport in `src/`.
- The historical Apps Script source (`apps-script/`, the root `*.js`/`*.gs` files, `apps-script-before-clasp-pull/`)
  remains **for reference only** until it is archived or deleted. Do not extend it; do not build on it.
- **No new FM feature may use Sheets as operational persistence.** New persistence is a Supabase migration,
  applied with the linked `db query --file` procedure and repaired individually — never `db push --linked`.
- `db push --linked` is never used.

## Identity

- **Actors are profile UUIDs** (`profiles.id` = `auth.users.id`). There is no `USR-*` operational identity.
- **Relational identity is the canonical domain UUID.** Tenant-safe composite FKs
  `(organisation_id, id)` enforce tenancy and, where the product requires it, facility consistency.
- **Display codes are not relational identity.** `INC-…`, `WO-…`, `AST-…` and similar are org-scoped
  references for people. They may be accepted as *input* and resolved inside the tenant at the server
  boundary; they are never stored as a foreign key and never matched by name.
- Facility identity is the facility UUID. Names and legacy codes are display only.

## Authority

- **Explicit capability grants are runtime authority** (`platform_capability_grants`, administered only
  through the audited platform IAM control plane). There is no role → capability table in runtime.
- Operating role, job title and facility assignment are **descriptive context**, not permission.
- Super Admin carries platform-administration authority only (`users.view`, `users.manage`,
  `platform.admin_override`). It grants no `ops.*`, `finance.*`, `approvals.manage`, `requests.view` or
  `fm.authorize_protected`.
- Protected actions require their base capability **and** the protected-action authority
  (Facility Manager step-up or System Administrator override). Override never replaces the base capability.
- `operational_identity_links` is a legacy compatibility bridge shown in the Admin Console; it is not an
  authorization source and no FM runtime path reads it.

## Reliability

- **Zero is data. Failure is not zero.** A healthy empty source may produce zero. A failed source must
  surface as unavailable or degraded and must never be rendered as zero, "clear" or "caught up".
- A Supabase source that fails is never replaced by Sheet data.

## Intelligence authority

Intelligence is a synthesis layer, not a source of operational reality. `operational_events`,
`action_runs` and `recommendation_decisions` describe history and analysis; they never establish
what exists.

- An event contributes to live Intelligence only if its `entity_id` is a canonical UUID that resolves,
  in the same organisation, to an existing `fm_*` record (`src/lib/intelligence/authority/`). Display
  codes are never identity; unresolved events stay in the ledger but are logically excluded.
- Facility, asset and relationship references in the analysed projection are re-derived from the
  authoritative row (display codes are emitted from that row), or dropped.
- Headline figures count distinct authoritative records, never raw ledger rows. "Active sites" are
  authoritative facilities represented by reconciled activity.
- `status.authority` states what the analysis is grounded in: `live`, `no_activity`,
  `history_insufficient` or `unavailable`. The UI may only claim "live" for `live`; an unreadable
  authoritative source is `unavailable`, never zero.
- Verification: `scripts/verify-intelligence-authority.mts` (in-memory) and
  `scripts/verify-intelligence-authority-live-read.mts` (read-only, linked DB).
