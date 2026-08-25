# Assets Google Sheet

**Sheet name:** `Assets`

## Header row (columns A:N — exact order)

| Asset ID | Facility | Asset Name | Category | Manufacturer | Model | Serial Number | Install Date | Warranty Expiry | OEM ID | Condition | Status | Assigned To | Criticality |

## Canonical API fields

| Sheet header | API field |
|---|---|
| Asset ID | `id` |
| Facility | `facility` (display name as stored — not resolved to an ID) |
| Asset Name | `name` |
| Category | `category` |
| Manufacturer | `manufacturer` |
| Model | `model` |
| Serial Number | `serialNumber` |
| Install Date | `installDate` |
| Warranty Expiry | `warrantyExpiry` |
| OEM ID | `oemId` |
| Condition | `condition` |
| Status | `status` |
| Assigned To | `assignedTo` |
| Criticality | `criticality` |

Reads and writes use **exact header names only** — never column position.

## Status values
`active` · `pending` · `inactive` · `suspended`

## Category values
`hvac` · `power` · `electrical` · `mechanical` · `vertical_transport` · `fire_safety` · `it` · `other`

## Condition values
`excellent` · `good` · `fair` · `poor`

## Criticality values
`unassessed` · `low` · `medium` · `high` · `critical`

New assets default to `unassessed` criticality until assessed in edit.
