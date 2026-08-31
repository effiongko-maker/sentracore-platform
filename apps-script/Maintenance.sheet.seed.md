# Maintenance Google Sheet (source of truth)

The live Maintenance sheet is **not redesigned**.  
`MaintenanceRepository.gs` discovers the sheet and maps headers to the frozen canonical model.

Sheet name candidates: `Maintenance`, `MAINTENANCE`, `Maintenances`  
Or first sheet whose row 1 contains `Maintenance ID`.

## Live headers (exact)

| Maintenance ID | Event ID | Facility ID | Asset ID | Requester | Department | Priority | Description | Assigned To | Date Requested | Date Completed | Status |

## Header → canonical mapping

| Sheet header | Canonical |
|--------------|-----------|
| Maintenance ID | `id` |
| Event ID | `eventId` |
| Facility ID | `facilityId` |
| Asset ID | `assetId` |
| Requester | `reportedByUserId` |
| Department | `department` |
| Priority | `priority` |
| Description | `description` and `title` |
| Assigned To | `assignedToUserId` |
| Date Requested | `reportedAt` |
| Date Completed | `completedAt` |
| Status | `status` (`open`/`new` → `requested`) |
| Completion Notes | `completionNotes` (added on write if missing) |

## Defaults (not on sheet)

- `type` = `corrective`
- `source` = `manual`
- `createdAt` = `reportedAt`
- `updatedAt` = `completedAt || reportedAt`

## Soft-deactivate

`deactivate` → `Status = cancelled`. Rows are never deleted.
