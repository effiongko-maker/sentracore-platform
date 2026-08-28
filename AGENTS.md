<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:apps-script-deployment-rules -->
# Apps Script deployment pack

`apps-script/deployment/` is the single source of truth for Google Apps Script deploys.

Whenever any `apps-script/**/*.gs` file changes:
1. Update `apps-script/deployment/release-meta.json` if release notes/flags change.
2. Run `npm run apps-script:pack`.
3. Commit the regenerated `DEPLOYMENT_PACK.md`, `DEPLOYMENT_CHECKLIST.md`, and `VERSION.md`.

Never require the user to ask for individual `.gs` dumps — point them at the deployment pack.
Optional local git hook: `git config core.hooksPath .githooks`
<!-- END:apps-script-deployment-rules -->

<!-- BEGIN:cross-service-schema-contract -->
# Cross-service schema contract verification

Whenever a new service projects, consolidates, caches, or transforms data owned by another domain:

SOURCE DATA → NEW SERVICE PROJECTION → API RESPONSE → FRONTEND MAPPING

must be tested end-to-end. Do not assume same spreadsheet = same field names = same object shape.

Permanent smoke for location catalog Facility aliases:

`node scripts/smoke-location-catalog-contract.cjs`

Asserts: if `facilities/getAll` total > 0 then `getLocationCatalog.facilities.length > 0`, matching IDs present, and live `FAC-0001` / `NCC Annex`.
<!-- END:cross-service-schema-contract -->
