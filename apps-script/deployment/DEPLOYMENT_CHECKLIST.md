# Apps Script Deployment Checklist

<!-- GENERATED FILE — do not edit by hand. -->
<!-- Regenerate with: npm run apps-script:pack -->

Release: **v0.8.6.20** — Command Centre versioned FM aggregate contracts

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
- [ ] `ROUTER.gs`
- [ ] `ApprovalRepository.gs`
- [ ] `AssetRepository.gs`
- [ ] `ConsumablesUpdateRepository.gs`
- [ ] `CostRecordRepository.gs`
- [ ] `CostSubmissionRepository.gs`
- [ ] `DeepCleaningLogRepository.gs`
- [ ] `DieselUsageRepository.gs`
- [ ] `EnergyReadingRepository.gs`
- [ ] `FacilityRepository.gs`
- [ ] `FumigationLogRepository.gs`
- [ ] `GeneratorLogRepository.gs`
- [ ] `IncidentRepository.gs`
- [ ] `MaintenanceRepository.gs`
- [ ] `MasterDataRepository.gs`
- [ ] `ReimbursementAuthorizationRepository.gs`
- [ ] `ReimbursementPaymentRepository.gs`
- [ ] `ReportingSnapshotRepository.gs`
- [ ] `RequestRepository.gs`
- [ ] `UserRepository.gs`
- [ ] `WasteLogRepository.gs`
- [ ] `WorkOrderRepository.gs`
- [ ] `ApprovalService.gs`
- [ ] `AssetService.gs`
- [ ] `CatalogCacheService.gs`
- [ ] `CommandCentreFmSummaryService.gs`
- [ ] `ConsumablesUpdateService.gs`
- [ ] `CostRecordService.gs`
- [ ] `CostSubmissionService.gs`
- [ ] `DeepCleaningLogService.gs`
- [ ] `DieselUsageService.gs`
- [ ] `EnergyReadingService.gs`
- [ ] `FacilityService.gs`
- [ ] `FumigationLogService.gs`
- [ ] `GeneratorLogService.gs`
- [ ] `IncidentService.gs`
- [ ] `MaintenanceService.gs`
- [ ] `MasterDataService.gs`
- [ ] `OperationalWorkloadService.gs`
- [ ] `ReimbursementAuthorizationService.gs`
- [ ] `ReimbursementPaymentService.gs`
- [ ] `ReportingSnapshotService.gs`
- [ ] `RequestService.gs`
- [ ] `RequestTreatmentService.gs`
- [ ] `UserService.gs`
- [ ] `WasteLogService.gs`
- [ ] `WorkOrderMaintenanceMutationService.gs`
- [ ] `WorkOrderService.gs`
- [ ] `ApprovalsController.gs`
- [ ] `AssetsController.gs`
- [ ] `CommandCentreFmSummaryController.gs`
- [ ] `ConsumablesUpdateController.gs`
- [ ] `CostRecordsController.gs`
- [ ] `CostSubmissionsController.gs`
- [ ] `DeepCleaningLogController.gs`
- [ ] `DieselUsageController.gs`
- [ ] `EnergyReadingController.gs`
- [ ] `FacilitiesController.gs`
- [ ] `FumigationLogController.gs`
- [ ] `GeneratorLogController.gs`
- [ ] `IncidentsController.gs`
- [ ] `MaintenanceController.gs`
- [ ] `MasterDataController.gs`
- [ ] `OperationalWorkloadController.gs`
- [ ] `ReimbursementAuthorizationsController.gs`
- [ ] `ReimbursementPaymentsController.gs`
- [ ] `ReportingSnapshotController.gs`
- [ ] `RequestsController.gs`
- [ ] `UsersController.gs`
- [ ] `WasteLogController.gs`
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

CRITICAL — generator-log requires **all three** files (ROUTER alone is not enough):

- [ ] `GeneratorLogRepository.gs`
- [ ] `GeneratorLogService.gs`
- [ ] `GeneratorLogController.gs`

> Live symptom if Controller is missing: `GeneratorLogController is not defined`.
> If the file does not exist in the Apps Script project, **create** it (File → New), then paste from `DEPLOYMENT_PACK.md`. Replacing is only possible after the file exists.
> Confirm `var GeneratorLogController`, `var GeneratorLogService`, and `var GeneratorLogRepository` are defined.

CRITICAL — diesel-usage requires **all three** files (Controller alone is not enough):

- [ ] `DieselUsageRepository.gs`
- [ ] `DieselUsageService.gs`
- [ ] `DieselUsageController.gs`

> Live symptom if Service is missing: `DieselUsageService is not defined`.
> Confirm `DieselUsageService.gs` and `DieselUsageRepository.gs` exist even when the Controller already routes.

CRITICAL — Operational Registers write path: after pasting any OR triad, cut a **new Web App version**. Unpublished editor saves do not fix live create.

> Verify with: `npm run verify-operational-registers-write`

> Note: `UserRepository.gs` may already exist only in the deployed Apps Script
> project. Do **not** delete it. Replace `UsersController.gs` and `UserService.gs`
> from this pack when present.

---

## 2. Create missing files, then replace contents

For each file below: **create** it in Apps Script if it does not exist, then
**replace the entire contents** from `DEPLOYMENT_PACK.md` (do not merge by hand).
Router updates without creating new Controller/Service/Repository files cause
live errors such as `GeneratorLogController is not defined`.

- [ ] Create or replace `ApprovalRepository.gs`
- [ ] Create or replace `AssetRepository.gs`
- [ ] Create or replace `ConsumablesUpdateRepository.gs`
- [ ] Create or replace `CostRecordRepository.gs`
- [ ] Create or replace `CostSubmissionRepository.gs`
- [ ] Create or replace `DeepCleaningLogRepository.gs`
- [ ] Create or replace `DieselUsageRepository.gs`
- [ ] Create or replace `EnergyReadingRepository.gs`
- [ ] Create or replace `FacilityRepository.gs`
- [ ] Create or replace `FumigationLogRepository.gs`
- [ ] Create or replace `GeneratorLogRepository.gs`
- [ ] Create or replace `IncidentRepository.gs`
- [ ] Create or replace `MaintenanceRepository.gs`
- [ ] Create or replace `MasterDataRepository.gs`
- [ ] Create or replace `ReimbursementAuthorizationRepository.gs`
- [ ] Create or replace `ReimbursementPaymentRepository.gs`
- [ ] Create or replace `ReportingSnapshotRepository.gs`
- [ ] Create or replace `RequestRepository.gs`
- [ ] Create or replace `UserRepository.gs`
- [ ] Create or replace `WasteLogRepository.gs`
- [ ] Create or replace `WorkOrderRepository.gs`
- [ ] Create or replace `ApprovalService.gs`
- [ ] Create or replace `AssetService.gs`
- [ ] Create or replace `CatalogCacheService.gs`
- [ ] Create or replace `CommandCentreFmSummaryService.gs`
- [ ] Create or replace `ConsumablesUpdateService.gs`
- [ ] Create or replace `CostRecordService.gs`
- [ ] Create or replace `CostSubmissionService.gs`
- [ ] Create or replace `DeepCleaningLogService.gs`
- [ ] Create or replace `DieselUsageService.gs`
- [ ] Create or replace `EnergyReadingService.gs`
- [ ] Create or replace `FacilityService.gs`
- [ ] Create or replace `FumigationLogService.gs`
- [ ] Create or replace `GeneratorLogService.gs`
- [ ] Create or replace `IncidentService.gs`
- [ ] Create or replace `MaintenanceService.gs`
- [ ] Create or replace `MasterDataService.gs`
- [ ] Create or replace `OperationalWorkloadService.gs`
- [ ] Create or replace `ReimbursementAuthorizationService.gs`
- [ ] Create or replace `ReimbursementPaymentService.gs`
- [ ] Create or replace `ReportingSnapshotService.gs`
- [ ] Create or replace `RequestService.gs`
- [ ] Create or replace `RequestTreatmentService.gs`
- [ ] Create or replace `UserService.gs`
- [ ] Create or replace `WasteLogService.gs`
- [ ] Create or replace `WorkOrderMaintenanceMutationService.gs`
- [ ] Create or replace `WorkOrderService.gs`
- [ ] Create or replace `ApprovalsController.gs`
- [ ] Create or replace `AssetsController.gs`
- [ ] Create or replace `CommandCentreFmSummaryController.gs`
- [ ] Create or replace `ConsumablesUpdateController.gs`
- [ ] Create or replace `CostRecordsController.gs`
- [ ] Create or replace `CostSubmissionsController.gs`
- [ ] Create or replace `DeepCleaningLogController.gs`
- [ ] Create or replace `DieselUsageController.gs`
- [ ] Create or replace `EnergyReadingController.gs`
- [ ] Create or replace `FacilitiesController.gs`
- [ ] Create or replace `FumigationLogController.gs`
- [ ] Create or replace `GeneratorLogController.gs`
- [ ] Create or replace `IncidentsController.gs`
- [ ] Create or replace `MaintenanceController.gs`
- [ ] Create or replace `MasterDataController.gs`
- [ ] Create or replace `OperationalWorkloadController.gs`
- [ ] Create or replace `ReimbursementAuthorizationsController.gs`
- [ ] Create or replace `ReimbursementPaymentsController.gs`
- [ ] Create or replace `ReportingSnapshotController.gs`
- [ ] Create or replace `RequestsController.gs`
- [ ] Create or replace `UsersController.gs`
- [ ] Create or replace `WasteLogController.gs`
- [ ] Create or replace `WorkOrdersController.gs`
- [ ] Create or replace `OperationalListAudit.gs`
- [ ] Create or replace `OperationalRegisterCache.gs`
- [ ] Create or replace `ReportingSnapshotTriggers.gs`
- [ ] Create or replace `RequestTreatmentLinkSpike.gs`
- [ ] Create or replace `RequestTreatmentMutationSpike.gs`
- [ ] Create or replace `SheetFieldUtils.gs`
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

### Typecheck

```bash
npm run typecheck
```

### Command Centre FM aggregate golden contract

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-command-centre-fm-aggregate-contract.mts
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
