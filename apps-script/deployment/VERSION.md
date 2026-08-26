Release:
v0.3.3

Title:
Maintenance updatedAt on WO link + list filter rendering

Generated:
2026-08-26T01:24:33.401Z

Features
- Maintenance sheet persists Updated At; list Sort Newest uses updatedAt DESC
- WO create/link/relink/unlink bumps linked Maintenance updatedAt via repository update
- Maintenance actions menu portals correctly; filtered list no longer blanks on page clamp

Performance

Files Changed
- ROUTER.gs
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

Maintenance list newest:

```bash
curl -sS -X POST http://localhost:3000/api/maintenance -H 'Content-Type: application/json' -d '{"resource":"maintenance","action":"getAll","payload":{"page":1,"pageSize":5}}'
```

Notes
- Replace MaintenanceRepository.gs and MaintenanceService.gs from the deployment pack.
- First write after deploy adds an Updated At column if missing.
- Deploy a new Web App version after pasting. Unpublished editor saves do not go live.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
