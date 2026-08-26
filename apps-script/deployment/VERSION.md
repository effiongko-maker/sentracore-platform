Release:
v0.4.5

Title:
Data-access stabilization — catalogs, coalescing, WO strict persistence

Generated:
2026-08-26T14:36:19.073Z

Features
- Lightweight User/Asset catalogs skip workload fan-out for toolbars/modals/labels
- Shared in-flight coalescing + 60s catalog TTL with mutation invalidation
- Operational list in-flight dedupe; workload derive 30s TTL
- WorkOrderRepository ensures Facility/Asset/Assigned To/Reported By; strict writes
- ROUTER error classification (validation/timeout/transient/exception)

Performance
- Home uses fetchUsersCatalog instead of enriched fetchAllUsers
- Reporting domain fallback uses listUsersCatalog/listAssetsCatalog
- WO create/update reuse loaded sheet values within one Apps Script request

Files Changed
- ROUTER.gs
- ApprovalRepository.gs
- ApprovalsController.gs
- ApprovalService.gs
- AssetRepository.gs
- AssetsController.gs
- AssetService.gs
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
- ReportingSnapshotController.gs
- ReportingSnapshotRepository.gs
- ReportingSnapshotService.gs
- ReportingSnapshotTriggers.gs
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

Work orders list:

```bash
curl -sS -X POST http://localhost:3000/api/work-orders -H 'Content-Type: application/json' -d '{"resource":"work-orders","action":"getAll","payload":{"page":1,"pageSize":5}}'
```

Notes
- CRITICAL: Redeploy SheetFieldUtils.gs, WorkOrderRepository.gs, and ROUTER.gs from the pack.
- Strict persistence remains: missing relationship headers fail loudly instead of silent drop.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
