# Assets Google Sheet

**Sheet name:** `Assets`

## Header row (exact)

| id | assetTag | name | category | facility | manufacturer | model | serialNumber | purchaseDate | warrantyExpiry | condition | status | assignedTo | criticality | description | createdAt | updatedAt |

## Seed rows (optional)

| id | assetTag | name | category | facility | manufacturer | model | serialNumber | purchaseDate | warrantyExpiry | condition | status | assignedTo | criticality | description | createdAt | updatedAt |
|----|----------|------|----------|----------|--------------|-------|--------------|--------------|----------------|-----------|--------|------------|-------------|-------------|-----------|-----------|
| AST-0001 | CHL-002 | Chiller Unit #02 | hvac | Lagos HQ | Carrier | 30XA | SN-48291 | 2022-03-15 | 2027-03-15 | good | active | Daniel Mensah | critical | Primary cooling plant | 2024-01-12T09:00:00Z | 2026-08-03T10:00:00Z |
| AST-0002 | UPS-01A | UPS Bank A | power | Lagos HQ | Eaton | 9395 | SN-11022 | 2021-11-02 | 2026-11-02 | excellent | active | Priya Sharma | high | Data hall UPS bank | 2024-03-18T11:30:00Z | 2026-08-03T09:00:00Z |
| AST-0003 | LFT-01A | Passenger Lift 1 | vertical_transport | Accra Hub | Otis | Gen2 | SN-77810 | 2020-06-20 | 2025-06-20 | fair | pending | Daniel Mensah | high | Main lobby lift | 2024-07-21T14:00:00Z | 2026-08-02T16:00:00Z |
| AST-0004 | GEN-W01 | Standby Generator | power | Plant West | Cummins | C1500 | SN-99102 | 2019-09-01 | 2024-09-01 | good | active | Priya Sharma | critical | West plant standby | 2025-01-15T09:45:00Z | 2026-07-28T12:00:00Z |
| AST-0005 | SW-SW01 | Core Switch | it | Docklands Campus | Cisco | C9300 | SN-33401 | 2023-02-10 | 2028-02-10 | excellent | inactive | Sophie Laurent | medium | Campus core switch | 2025-06-30T16:45:00Z | 2026-06-14T09:30:00Z |

## Status values
`active` · `pending` · `inactive` · `suspended`

## Category values
`hvac` · `power` · `electrical` · `mechanical` · `vertical_transport` · `fire_safety` · `it` · `other`

## Condition values
`excellent` · `good` · `fair` · `poor`

## Criticality values
`unassessed` · `low` · `medium` · `high` · `critical`

New assets default to `unassessed` until criticality is set in edit.
