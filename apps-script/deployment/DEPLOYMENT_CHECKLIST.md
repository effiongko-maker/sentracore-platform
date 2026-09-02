# Apps Script Deployment Checklist

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: npm run apps-script:pack -->

Release: **v0.8.5.1** — Reimbursement payment service deploy recovery

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
- [ ] `ApprovalRepository.gs`
- [ ] `AssetRepository.gs`
- [ ] `CostRecordRepository.gs`
- [ ] `CostSubmissionRepository.gs`
- [ ] `FacilityRepository.gs`
- [ ] `IncidentRepository.gs`
- [ ] `MaintenanceRepository.gs`
- [ ] `MasterDataRepository.gs`
- [ ] `ReimbursementPaymentRepository.gs`
- [ ] `ReportingSnapshotRepository.gs`
- [ ] `RequestRepository.gs`
- [ ] `UserRepository.gs`
- [ ] `WorkOrderRepository.gs`
- [ ] `ApprovalService.gs`
- [ ] `AssetService.gs`
- [ ] `CatalogCacheService.gs`
- [ ] `CostRecordService.gs`
- [ ] `CostSubmissionService.gs`
- [ ] `FacilityService.gs`
- [ ] `IncidentService.gs`
- [ ] `MaintenanceService.gs`
- [ ] `MasterDataService.gs`
- [ ] `OperationalWorkloadService.gs`
- [ ] `ReimbursementPaymentService.gs`
- [ ] `ReportingSnapshotService.gs`
- [ ] `RequestService.gs`
- [ ] `RequestTreatmentService.gs`
- [ ] `UserService.gs`
- [ ] `WorkOrderMaintenanceMutationService.gs`
- [ ] `WorkOrderService.gs`
- [ ] `ApprovalsController.gs`
- [ ] `AssetsController.gs`
- [ ] `CostRecordsController.gs`
- [ ] `CostSubmissionsController.gs`
- [ ] `FacilitiesController.gs`
- [ ] `IncidentsController.gs`
- [ ] `MaintenanceController.gs`
- [ ] `MasterDataController.gs`
- [ ] `OperationalWorkloadController.gs`
- [ ] `ReimbursementPaymentsController.gs`
- [ ] `ReportingSnapshotController.gs`
- [ ] `RequestsController.gs`
- [ ] `UsersController.gs`
- [ ] `WorkOrdersController.gs`
- [ ] `OperationalListAudit.gs`
- [ ] `OperationalRegisterCache.gs`
- [ ] `ReportingSnapshotTriggers.gs`
- [ ] `RequestTreatmentLinkSpike.gs`
- [ ] `RequestTreatmentMutationSpike.gs`
- [ ] `SheetFieldUtils.gs`

Especially ensure these reporting-snapshot files exist:

- [ ] `ReportingSnapshotRepository.gs`
- [ ] `ReportingSnapshotService.gs`
- [ ] `ReportingSnapshotController.gs`
- [ ] `ReportingSnapshotTriggers.gs`
- [ ] `UserService.gs`
- [ ] `ROUTER.gs`

CRITICAL — reimbursement-payments requires **all three** files (Controller alone is not enough):

- [ ] `ReimbursementPaymentRepository.gs`
- [ ] `ReimbursementPaymentService.gs`
- [ ] `ReimbursementPaymentsController.gs`

> Live symptom if Service is missing: `ReimbursementPaymentService is not defined`.
> Confirm in the Apps Script project file list that `ReimbursementPaymentService.gs` exists and defines `var ReimbursementPaymentService`.

> Note: `UserRepository.gs` may already exist only in the deployed Apps Script
> project. Do **not** delete it. Replace `UsersController.gs` and `UserService.gs`
> from this pack when present.

---

## 2. Existing files that must be replaced

For each file that already exists in Apps Script, **replace the entire contents**
(do not merge by hand):

- [ ] Replace `ApprovalRepository.gs`
- [ ] Replace `AssetRepository.gs`
- [ ] Replace `CostRecordRepository.gs`
- [ ] Replace `CostSubmissionRepository.gs`
- [ ] Replace `FacilityRepository.gs`
- [ ] Replace `IncidentRepository.gs`
- [ ] Replace `MaintenanceRepository.gs`
- [ ] Replace `MasterDataRepository.gs`
- [ ] Replace `ReimbursementPaymentRepository.gs`
- [ ] Replace `ReportingSnapshotRepository.gs`
- [ ] Replace `RequestRepository.gs`
- [ ] Replace `UserRepository.gs`
- [ ] Replace `WorkOrderRepository.gs`
- [ ] Replace `ApprovalService.gs`
- [ ] Replace `AssetService.gs`
- [ ] Replace `CatalogCacheService.gs`
- [ ] Replace `CostRecordService.gs`
- [ ] Replace `CostSubmissionService.gs`
- [ ] Replace `FacilityService.gs`
- [ ] Replace `IncidentService.gs`
- [ ] Replace `MaintenanceService.gs`
- [ ] Replace `MasterDataService.gs`
- [ ] Replace `OperationalWorkloadService.gs`
- [ ] Replace `ReimbursementPaymentService.gs`
- [ ] Replace `ReportingSnapshotService.gs`
- [ ] Replace `RequestService.gs`
- [ ] Replace `RequestTreatmentService.gs`
- [ ] Replace `UserService.gs`
- [ ] Replace `WorkOrderMaintenanceMutationService.gs`
- [ ] Replace `WorkOrderService.gs`
- [ ] Replace `ApprovalsController.gs`
- [ ] Replace `AssetsController.gs`
- [ ] Replace `CostRecordsController.gs`
- [ ] Replace `CostSubmissionsController.gs`
- [ ] Replace `FacilitiesController.gs`
- [ ] Replace `IncidentsController.gs`
- [ ] Replace `MaintenanceController.gs`
- [ ] Replace `MasterDataController.gs`
- [ ] Replace `OperationalWorkloadController.gs`
- [ ] Replace `ReimbursementPaymentsController.gs`
- [ ] Replace `ReportingSnapshotController.gs`
- [ ] Replace `RequestsController.gs`
- [ ] Replace `UsersController.gs`
- [ ] Replace `WorkOrdersController.gs`
- [ ] Replace `OperationalListAudit.gs`
- [ ] Replace `OperationalRegisterCache.gs`
- [ ] Replace `ReportingSnapshotTriggers.gs`
- [ ] Replace `RequestTreatmentLinkSpike.gs`
- [ ] Replace `RequestTreatmentMutationSpike.gs`
- [ ] Replace `SheetFieldUtils.gs`
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

### Financial domain foundation

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-financial-domain-foundation.mts
```

### Finance reimbursement payment

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-finance-reimbursement-payment.mts
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
