Release:
v0.7.4

Title:
Phase 2.8 production linkTreatment (Link only)

Generated:
2026-09-01T08:11:28.630Z

Features
- Production requests/linkTreatment consolidated Link Maintenance/Incident
- State-based Link idempotency (sourceRequestId + appendUnique)
- Create Treatment path unchanged

Performance
- Link from Request: 6 Apps Script calls → 1

Files Changed
- ROUTER.gs
- ApprovalRepository.gs
- ApprovalsController.gs
- ApprovalService.gs
- AssetRepository.gs
- AssetsController.gs
- AssetService.gs
- CatalogCacheService.gs
- FacilitiesController.gs
- FacilityRepository.gs
- FacilityService.gs
- IncidentRepository.gs
- IncidentsController.gs
- IncidentService.gs
- MaintenanceController.gs
- MaintenanceRepository.gs
- MaintenanceService.gs
- MasterDataController.gs
- MasterDataRepository.gs
- MasterDataService.gs
- OperationalListAudit.gs
- OperationalRegisterCache.gs
- ReportingSnapshotController.gs
- ReportingSnapshotRepository.gs
- ReportingSnapshotService.gs
- ReportingSnapshotTriggers.gs
- RequestRepository.gs
- RequestsController.gs
- RequestService.gs
- RequestTreatmentLinkSpike.gs
- RequestTreatmentMutationSpike.gs
- RequestTreatmentService.gs
- SheetFieldUtils.gs
- UserRepository.gs
- UsersController.gs
- UserService.gs
- WorkOrderRepository.gs
- WorkOrdersController.gs
- WorkOrderService.gs

Deployment Required
YES

Trigger Required
NO

Apps Script Redeploy
YES

Smoke Tests

Phase 2.8 browser link treatment:

```bash
node scripts/verify-phase28-link-treatment.cjs
```

Phase 2.6 browser create treatment:

```bash
node scripts/verify-phase26-create-treatment.cjs
```

Notes
- Deploy RequestTreatmentService.gs (includes linkTreatment) + RequestsController.gs.
- RequestTreatmentLinkSpike.gs is a thin alias only.
- Do not modify Link search or Create Treatment.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
