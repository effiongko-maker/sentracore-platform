Release:
v0.3.0

Title:
Master Data Phase 1

Generated:
2026-08-25T23:47:02.605Z

Features
- Master Data module for shared lookup entities: Departments, Buildings, Floors, Rooms, Vendors
- Apps Script MasterDataRepository / MasterDataService / MasterDataController
- ROUTER resource: master-data
- Next.js /api/master-data proxy + MasterDataService + /master-data UI
- Consumers: Maintenance department select; Incident/Occupant location cascading selects
- Core operational modules remain dedicated (Facilities, Users, Assets, Work Orders, Incidents, Maintenance)

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

Master data health (router lists master-data):

```bash
curl -sS "$APPS_SCRIPT_URL"
```

Master data list departments:

```bash
curl -sS -X POST http://localhost:3000/api/master-data -H 'Content-Type: application/json' -d '{"resource":"master-data","action":"getAll","payload":{"entity":"departments","page":1,"pageSize":10}}'
```

Master data create department (optional):

```bash
curl -sS -X POST http://localhost:3000/api/master-data -H 'Content-Type: application/json' -d '{"resource":"master-data","action":"create","payload":{"entity":"departments","name":"Facilities","code":"FAC","status":"active"}}'
```

Notes
- Phase 1 scope only: Departments, Buildings, Floors, Rooms, Vendors.
- Minimum new/replaced Apps Script files: MasterDataRepository.gs, MasterDataService.gs, MasterDataController.gs, ROUTER.gs.
- Sheets are auto-created on first access. No seed-row migration.
- Deploy a new Web App version after pasting. Unpublished editor saves do not go live.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
