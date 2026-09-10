# REPORTING_SNAPSHOT sheet

Performance optimization layer. Domain sheets remain the system of record.

## Purpose

Pre-aggregated KPIs and summary datasets for Home, Dashboard, and Reports so
clients do not fan out across every domain sheet on each page load.

## Create

1. Deploy `ReportingSnapshotRepository.gs`, `ReportingSnapshotService.gs`,
   `ReportingSnapshotController.gs`, and `ReportingSnapshotTriggers.gs`.
2. Wire the router (see `ROUTER_UPDATE.gs`).
3. Run `installReportingSnapshotTrigger()` once from the Apps Script editor.
4. The sheet `REPORTING_SNAPSHOT` is created automatically on first write.

## Columns

| section | scope | chunk | json | updatedAt | version |

## Sections

- `meta`
- `users`
- `facilities`
- `assets`
- `incidents`
- `maintenance`
- `workOrders`
- `kpis`
- `projections`
- `health`

Large JSON payloads are split across `chunk` rows (Sheets cell size limit).

## Refresh behaviour

- CRUD on a domain module → partial section refresh + derived KPI recompute
- Scheduled trigger every 10 minutes → full rebuild (safety net)
- `getSnapshot` cold miss → full rebuild

## Future

Replace this Sheets-backed cache with a database repository without changing
`DashboardService → ReportingService` application architecture.
