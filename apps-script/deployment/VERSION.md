Release:
v0.7.8

Title:
Phase 32 status transition read elimination

Generated:
2026-09-01T15:13:37.951Z

Features
- Maintenance update returns _previousStatus + buildMarker for single-round-trip status transitions
- Next.js transition path removes pre-update getMaintenance when status changes

Performance
- Status transition: 2 GAS round-trips → 1 (eliminates pre-read when v0.7.8 live)
- Simple field save: unchanged at 1 read + 1 write inside update()

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
- WorkOrderMaintenanceMutationService.gs
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

Phase 32 status transition read elimination:

```bash
npx tsx --tsconfig tsconfig.json scripts/verify-phase32-status-transition-read-elimination.mts
```

Phase 31 browser smoke:

```bash
node scripts/verify-phase31-browser-smoke.cjs
```

Notes
- Deploy MaintenanceRepository.gs and MaintenanceService.gs.
- Live marker: _buildMarker 2026-09-01-phase32-maintenance-update-v1 on update with _returnPreviousStatus.

<!-- GENERATED FILE — do not edit by hand. npm run apps-script:pack -->
