# Apps Script Deployment Checklist

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: npm run apps-script:pack -->

Release: **v0.3.0** — Master Data Phase 1

Use this checklist with `DEPLOYMENT_PACK.md` open. Someone unfamiliar
with the project should be able to deploy from these steps alone.

---

## 0. Prerequisites

- Access to the SentraCore Google Apps Script project (bound to the ops spreadsheet).
- Access to deploy a **new Web App version** (Execute as: Me, Who has access: Anyone).
- Local Next.js app running (`npm run dev`) for smoke tests against `/api/*`.
- Confirm `APPS_SCRIPT_URL` / `NEXT_PUBLIC_API_URL` points at the Web App `/exec` URL.

---

## 1. Files that must be copied into Apps Script

Copy **every** file listed in `DEPLOYMENT_PACK.md` (full source is embedded there).

Current pack file list:

- [ ] `ROUTER.gs`
- [ ] `AssetRepository.gs`
- [ ] `AssetsController.gs`
- [ ] `AssetService.gs`
- [ ] `FacilitiesController.gs`
- [ ] `FacilityRepository.gs`
- [ ] `FacilityService.gs`
- [ ] `IncidentRepository.gs`
- [ ] `IncidentsController.gs`
- [ ] `IncidentService.gs`
- [ ] `MaintenanceController.gs`
- [ ] `MaintenanceRepository.gs`
- [ ] `MaintenanceService.gs`
- [ ] `MasterDataController.gs`
- [ ] `MasterDataRepository.gs`
- [ ] `MasterDataService.gs`
- [ ] `ReportingSnapshotController.gs`
- [ ] `ReportingSnapshotRepository.gs`
- [ ] `ReportingSnapshotService.gs`
- [ ] `ReportingSnapshotTriggers.gs`
- [ ] `SheetFieldUtils.gs`
- [ ] `UserRepository.gs`
- [ ] `UsersController.gs`
- [ ] `UserService.gs`
- [ ] `WorkOrderRepository.gs`
- [ ] `WorkOrdersController.gs`
- [ ] `WorkOrderService.gs`

Especially ensure these reporting-snapshot files exist:

- [ ] `ReportingSnapshotRepository.gs`
- [ ] `ReportingSnapshotService.gs`
- [ ] `ReportingSnapshotController.gs`
- [ ] `ReportingSnapshotTriggers.gs`
- [ ] `UserService.gs`
- [ ] `ROUTER.gs`

> Note: `UserRepository.gs` may already exist only in the deployed Apps Script
> project. Do **not** delete it. Replace `UsersController.gs` and `UserService.gs`
> from this pack when present.

---

## 2. Existing files that must be replaced

For each file that already exists in Apps Script, **replace the entire contents**
(do not merge by hand):

- [ ] Replace `AssetRepository.gs`
- [ ] Replace `AssetsController.gs`
- [ ] Replace `AssetService.gs`
- [ ] Replace `FacilitiesController.gs`
- [ ] Replace `FacilityRepository.gs`
- [ ] Replace `FacilityService.gs`
- [ ] Replace `IncidentRepository.gs`
- [ ] Replace `IncidentsController.gs`
- [ ] Replace `IncidentService.gs`
- [ ] Replace `MaintenanceController.gs`
- [ ] Replace `MaintenanceRepository.gs`
- [ ] Replace `MaintenanceService.gs`
- [ ] Replace `MasterDataController.gs`
- [ ] Replace `MasterDataRepository.gs`
- [ ] Replace `MasterDataService.gs`
- [ ] Replace `ReportingSnapshotController.gs`
- [ ] Replace `ReportingSnapshotRepository.gs`
- [ ] Replace `ReportingSnapshotService.gs`
- [ ] Replace `ReportingSnapshotTriggers.gs`
- [ ] Replace `SheetFieldUtils.gs`
- [ ] Replace `UserRepository.gs`
- [ ] Replace `UsersController.gs`
- [ ] Replace `UserService.gs`
- [ ] Replace `WorkOrderRepository.gs`
- [ ] Replace `WorkOrdersController.gs`
- [ ] Replace `WorkOrderService.gs`
- [ ] Replace `ROUTER.gs` (or the project file that currently holds `doPost` / `jsonResponse_`)

If your project historically kept `doPost` inside `Code.gs`, either:
1. Paste `ROUTER.gs` contents into `Code.gs` and remove duplicate `doPost`/`jsonResponse_`, **or**
2. Add `ROUTER.gs` and delete the old `doPost`/`jsonResponse_` from `Code.gs` so only one definition remains.

---

## 3. Router updates required

- [ ] Ensure `deployment/ROUTER.gs` is deployed as the live router.
- [ ] Confirm `resource === "reporting-snapshot"` routes to `ReportingSnapshotController.handle`.
- [ ] Confirm all module resources are registered:
  - `users`
  - `facilities`
  - `assets`
  - `work-orders`
  - `incidents`
  - `maintenance`
  - `master-data`
  - `reporting-snapshot`
- [ ] Confirm there is exactly one `doPost` and one `jsonResponse_` in the project.

---

## 4. Trigger installation

Trigger installation is not required for this release.

- [ ] In the Apps Script editor, open `ReportingSnapshotTriggers.gs`.
- [ ] Run `installReportingSnapshotTrigger()` once (authorize if prompted).
- [ ] Verify Executions / Triggers shows `rebuildReportingSnapshotScheduled` every 10 minutes.
- [ ] Optional rollback of triggers only: run `removeReportingSnapshotTriggers()`.

---

## 5. Web App deployment

A **new Web App version** is REQUIRED.

- [ ] Deploy → Manage deployments → Edit (pencil) → **New version** → Deploy.
- [ ] Keep the same `/exec` URL unless intentionally rotating credentials.
- [ ] Confirm Next.js env still matches the deployed `/exec` URL.
- [ ] Unpublished editor saves do **not** affect the live Web App URL.

---

## 6. Smoke test commands

With `npm run dev` running:

### Master data health (router lists master-data)

```bash
curl -sS "$APPS_SCRIPT_URL"
```

### Master data list departments

```bash
curl -sS -X POST http://localhost:3000/api/master-data -H 'Content-Type: application/json' -d '{"resource":"master-data","action":"getAll","payload":{"entity":"departments","page":1,"pageSize":10}}'
```

### Master data create department (optional)

```bash
curl -sS -X POST http://localhost:3000/api/master-data -H 'Content-Type: application/json' -d '{"resource":"master-data","action":"create","payload":{"entity":"departments","name":"Facilities","code":"FAC","status":"active"}}'
```

Expected checks:

- [ ] `reporting-snapshot` `getSnapshot` returns `success: true`.
- [ ] `_snapshotMeta.source` is `REPORTING_SNAPSHOT` (or equivalent).
- [ ] Facilities with Status `Active` increment `kpis.activeFacilities`.
- [ ] Assets with Status `Operational` increment `kpis.activeAssets`.
- [ ] `/dashboards` and `/reports` load without blank KPI strips.
- [ ] Creating/updating a facility refreshes snapshot KPIs after reload.

---

## 7. Rollback instructions

If production misbehaves after deploy:

1. **Web App rollback**: Deploy → Manage deployments → create a new version from the previous deployment’s code snapshot (or re-paste the prior pack).
2. **Disable scheduled rebuild**: run `removeReportingSnapshotTriggers()`.
3. **Router fallback**: temporarily route `reporting-snapshot` to return `jsonResponse_(false, "disabled", null)` if the sheet layer is corrupt.
4. **App safety**: Next.js `ReportingService` already falls back to live domain aggregation when the sheet snapshot is missing/corrupt — blank dashboards should not occur if fallback is intact.
5. **Data**: Domain sheets remain system of record. `REPORTING_SNAPSHOT` can be rebuilt with action `rebuild` after fixing code.

```bash
curl -sS -X POST http://localhost:3000/api/reporting-snapshot -H 'Content-Type: application/json' -d '{"resource":"reporting-snapshot","action":"rebuild","payload":{}}'
```

---

## Maintainer policy

- Any change to `apps-script/**/*.gs` **must** run `npm run apps-script:pack` before the task is complete.
- Commit the regenerated `DEPLOYMENT_PACK.md`, `DEPLOYMENT_CHECKLIST.md`, and `VERSION.md` with the `.gs` changes.
- Update `apps-script/deployment/release-meta.json` when cutting a new release.
