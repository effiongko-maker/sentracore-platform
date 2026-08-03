# Incidents Google Sheet (source of truth)

The live Incidents/Events sheet is **not redesigned**.  
`IncidentRepository.gs` discovers the sheet and maps headers via aliases.

## Discovery

Sheet name candidates: `Incidents`, `Events`, `Incident Log`, `INCIDENTS`  
Or first sheet whose row 1 contains `Incident ID` or `Event ID`.

## Header → canonical mapping (aliases)

| Sheet header aliases | Canonical field |
|----------------------|-----------------|
| Incident ID, Event ID, Event Id, ID | `id` |
| Title, Incident Title, Description | `title` |
| Description, Details | `description` |
| Type, Incident Type | `type` (default `other`) |
| Facility ID, Facility | `facilityId` |
| Asset ID, Asset | `assetId` |
| Severity | `severity` (default `medium`) |
| Status | `status` (`open` → `reported`) |
| Assigned To, Assigned To User ID | `assignedToUserId` |
| Reported By, Reported By User ID | `reportedByUserId` |
| Reported At, Date Reported, Date Opened | `reportedAt` |
| Work Order ID, Work Order | `workOrderId` |
| Location, Location Detail | `locationDetail` |
| Requires Work Order | `requiresWorkOrder` |
| Reported Via, Channel | `reportedVia` |
| Resolved At, Date Resolved | `resolvedAt` |
| Closed At, Date Closed | `closedAt` |

## Defaults applied in repository

- `source` = `manual`
- `createdAt` = `reportedAt`
- `updatedAt` = closed/resolved/reportedAt
- `requiresWorkOrder` inferred from presence of Work Order ID when column absent
- `requiresWorkOrder = false` clears `workOrderId`
