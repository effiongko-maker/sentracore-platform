# WORK_ORDERS Google Sheet

**Sheet name:** `WORK_ORDERS`

## Header row (exact — camelCase matches canonical WorkOrder model)

| id | title | description | type | maintenanceType | source | categoryId | workInstructions | facilityId | assetId | reportedByUserId | incidentId | parentWorkOrderId | assignedToUserId | assignedGroupId | requestedAt | scheduledStartAt | scheduledEndAt | dueAt | status | priority | holdReason | startedAt | completedAt | estimatedHours | actualHours | estimatedCost | actualCost | completionNotes | workPerformed | downtimeMinutes | slaDueAt | requiresApproval | createdAt | updatedAt | createdByUserId | updatedByUserId |

## Notes

- IDs: `WO-0001`, `WO-0002`, …
- `facilityId`, `assetId`, `assignedToUserId`, `reportedByUserId` store canonical IDs only
- Display names are resolved in the frontend via EntityResolver
- `deactivate` sets `status` to `cancelled` — rows are never deleted
