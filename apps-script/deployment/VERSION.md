Release:
v0.4.3

Title:
Fix Approval submit status transition (awaiting_decision)

Generated:
2026-08-26T03:00:57.301Z

Features
- Canonical Approval statuses: draft → awaiting_decision → approved|rejected
- Submit atomically writes Status=awaiting_decision with submittedAt (no draft fallback)
- Heal rows where submittedAt was set but Status stayed draft

Performance

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

Approvals list:

```bash
curl -sS -X POST http://localhost:3000/api/approvals -H 'Content-Type: application/json' -d '{"resource":"approvals","action":"getAll","payload":{"page":1,"pageSize":5}}'
```

Notes
- CRITICAL: Redeploy ApprovalRepository.gs from the pack. Old mapStatus_ mapped unknown statuses (e.g. awaiting_response) to draft while still writing Submitted At.
- After redeploy, Mark as submitted must return awaiting_decision everywhere.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
