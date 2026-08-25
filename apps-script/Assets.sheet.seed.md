# Assets Google Sheet

**Sheet name:** `Assets`

## Preferred header row (display names)

| Asset ID | Asset Number | Asset Name | Category | Facility ID | Manufacturer | Model | Serial Number | Install Date | Warranty Expiry | Condition | Status | Assigned To | Criticality | Description | Created At | Updated At |

CamelCase headers (`id`, `assetTag`, `name`, `facility`, …) are also accepted.

## Canonical API fields

| Sheet header | API field |
|---|---|
| Asset ID / id | `id` |
| Asset Number / Asset Tag | `assetTag` |
| Asset Name / name | `name` |
| Category | `category` |
| Facility ID | `facilityId` (+ mirrored as `facility`) |
| Manufacturer | `manufacturer` |
| Model | `model` |
| Serial Number | `serialNumber` |
| Install Date / Purchase Date | `purchaseDate` |
| Warranty Expiry | `warrantyExpiry` |
| Condition | `condition` |
| Status | `status` |
| Assigned To / OEM ID | `assignedTo` |
| Criticality | `criticality` |
| Description | `description` |
| Created At | `createdAt` |
| Updated At | `updatedAt` |

**Important:** Facility ID resolution must never write into Manufacturer / Model / Serial Number. Reads and writes are by header name only.

## Status values
`active` · `pending` · `inactive` · `suspended`

## Category values
`hvac` · `power` · `electrical` · `mechanical` · `vertical_transport` · `fire_safety` · `it` · `other`

## Condition values
`excellent` · `good` · `fair` · `poor`

## Criticality values
`unassessed` · `low` · `medium` · `high` · `critical`

New assets default to `unassessed` until criticality is set in edit.
