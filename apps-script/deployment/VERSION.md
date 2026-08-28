Release:
v0.7.0

Title:
Phase 2 Request Treatment (REQ → MNT/INC)

Generated:
2026-08-27T14:56:26.910Z

Features
- Create Maintenance / Incident from Request with bidirectional sourceRequestId links
- Link existing Maintenance / Incident with ownership conflict rejection
- Resolve / Cancel Request via server actions
- Request detail Treatment hub + derived downstream Work Orders
- API proxy blocks client status/relationship mutation bypass

Performance
- Link search uses paginated facility-scoped getAll (pageSize 200 server filter)
- Request detail loads linked children by id (N small)

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
NO

Smoke Tests

Request treatment persistence contract:

```bash
node scripts/smoke-request-treatment-contract.cjs
```

Location catalog Facility contract:

```bash
node scripts/smoke-location-catalog-contract.cjs
```

UI treatment hub:

```bash
Open /requests → View → Create Maintenance → assert MNT.sourceRequestId and REQ.maintenanceIds
```

Notes
- Auth boundary: authenticated session + facility_management module (no facility_manager role yet).
- Do not invent REQ → WO treatment path.
- Apps Script unchanged for Phase 2 — orchestration is Next.js.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
