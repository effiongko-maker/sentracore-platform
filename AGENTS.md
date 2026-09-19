<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:fm-runtime-invariants -->
# Facility Management runtime invariants

FM persistence is **Supabase/Postgres**. Apps Script / Google Sheets are **not** an FM runtime source and must
not be reconnected. Actors are profile UUIDs, relational identity is the domain UUID, display codes are never
relational identity, and explicit capability grants are runtime authority. Zero is data; failure is not zero.
Full rules: `docs/fm-runtime-architecture.md`.
<!-- END:fm-runtime-invariants -->

<!-- BEGIN:apps-script-deployment-rules -->
# Apps Script deployment pack (historical source only)

The Apps Script source is retained for reference only; it is not an FM runtime dependency. If you must touch
`apps-script/**/*.gs` (for example to archive it), `apps-script/deployment/` remains the source of truth for deploys:

Whenever any `apps-script/**/*.gs` file changes:
1. Update `apps-script/deployment/release-meta.json` if release notes/flags change.
2. Run `npm run apps-script:pack`.
3. Commit the regenerated `DEPLOYMENT_PACK.md`, `DEPLOYMENT_CHECKLIST.md`, and `VERSION.md`.

Optional local git hook: `git config core.hooksPath .githooks`
<!-- END:apps-script-deployment-rules -->

<!-- BEGIN:cross-service-schema-contract -->
# Cross-service schema contract verification

Whenever a new service projects, consolidates, caches, or transforms data owned by another domain:

SOURCE DATA → NEW SERVICE PROJECTION → API RESPONSE → FRONTEND MAPPING

must be tested end-to-end. Do not assume same table = same field names = same object shape.

Live read-only smokes prove the projected shapes against the linked database, for example
`scripts/verify-fm-assets-live-read.mts` and `scripts/verify-fm-logs-live-read.mts`
(run with `NODE_PATH=<dir containing an empty server-only/ stub>`).
<!-- END:cross-service-schema-contract -->
