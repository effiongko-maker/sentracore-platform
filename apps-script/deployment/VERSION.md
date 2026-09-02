Release:
v0.8.5.1

Title:
Reimbursement payment service deploy recovery

Generated:
2026-09-02T21:41:47.754Z

Features
- REIMBURSEMENT_PAYMENTS sheet with 11-column canonical schema
- Reimbursement payment domain: getAll, getById, create, update against CostSubmission
- reimbursement-payments Apps Script resource + Next.js /api/reimbursement-payments proxy
- CostSubmission lifecycle transition guards: draft→submitted→queried→submitted
- Payment never stored on CostRecord or CostSubmission status
- Pack/checklist orders Repository → Service → Controller and calls out the payment triad

Performance
- Same list/pagination pattern as cost-submissions — single sheet read per getAll
- Payments filtered by submissionId without joining CostRecord amounts

Files Changed
- ROUTER.gs
- ApprovalRepository.gs
- AssetRepository.gs
- CostRecordRepository.gs
- CostSubmissionRepository.gs
- FacilityRepository.gs
- IncidentRepository.gs
- MaintenanceRepository.gs
- MasterDataRepository.gs
- ReimbursementPaymentRepository.gs
- ReportingSnapshotRepository.gs
- RequestRepository.gs
- UserRepository.gs
- WorkOrderRepository.gs
- ApprovalService.gs
- AssetService.gs
- CatalogCacheService.gs
- CostRecordService.gs
- CostSubmissionService.gs
- FacilityService.gs
- IncidentService.gs
- MaintenanceService.gs
- MasterDataService.gs
- OperationalWorkloadService.gs
- ReimbursementPaymentService.gs
- ReportingSnapshotService.gs
- RequestService.gs
- RequestTreatmentService.gs
- UserService.gs
- WorkOrderMaintenanceMutationService.gs
- WorkOrderService.gs
- ApprovalsController.gs
- AssetsController.gs
- CostRecordsController.gs
- CostSubmissionsController.gs
- FacilitiesController.gs
- IncidentsController.gs
- MaintenanceController.gs
- MasterDataController.gs
- OperationalWorkloadController.gs
- ReimbursementPaymentsController.gs
- ReportingSnapshotController.gs
- RequestsController.gs
- UsersController.gs
- WorkOrdersController.gs
- OperationalListAudit.gs
- OperationalRegisterCache.gs
- ReportingSnapshotTriggers.gs
- RequestTreatmentLinkSpike.gs
- RequestTreatmentMutationSpike.gs
- SheetFieldUtils.gs

Deployment Required
YES

Trigger Required
NO

Apps Script Redeploy
YES

Smoke Tests

Financial domain foundation:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-financial-domain-foundation.mts
```

Finance reimbursement payment:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-finance-reimbursement-payment.mts
```

Notes
- MANUAL DEPLOYMENT REQUIRED: Add/replace ReimbursementPaymentService.gs from this pack (likely omitted in the partial v0.8.5 paste). Also confirm Repository + Controller + ROUTER.
- Service definition is unchanged — still `var ReimbursementPaymentService = (function () { ... })();`, same pattern as CostSubmissionService.
- File load order does not cause this ReferenceError for IIFE modules; missing file does.
- REIMBURSEMENT_PAYMENTS sheet is auto-created on first access — does not modify COST_RECORDS or COST_SUBMISSIONS schemas.
- Partial payments are supported via multiple payment rows per submission; outstanding = claim − sum(received).
- Reimbursed on Cost workflow only when linked submission claim is fully paid.

Deployment semantics
- `deploymentRequired`: Pack intent: a new Web App deploy is required to apply this source release when cutting from the repo. Not a live deployment status flag.
- `appsScriptRedeploy`: Required — live project recognises reimbursement-payments but is missing ReimbursementPaymentService.gs (ReferenceError at runtime).

Live verification (read-only audit)
- Method: Partial live probe — ROUTER + Controller present; Service global missing
- resourceLive: no
- Notes:
  - Observed live error: ReimbursementPaymentService is not defined.
  - Root cause: ReimbursementPaymentService.gs was not present/loaded in the Apps Script project (source/pack already define it correctly).
  - Redeploy must include ReimbursementPaymentRepository.gs, ReimbursementPaymentService.gs, and ReimbursementPaymentsController.gs, then a new Web App version.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
