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
