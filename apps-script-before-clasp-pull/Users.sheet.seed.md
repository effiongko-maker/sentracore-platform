# USERS Google Sheet

**Sheet name:** `USERS` (legacy alias: `Users`)

## Header row (exact order)

| User ID | Full Name | Email | Role | Specialization | Facility Assigned | Current Workload | Phone | Status | Date Added |

## Canonical API fields

| Sheet header | API field |
|---|---|
| User ID | `id` |
| Full Name | `name` |
| Email | `email` |
| Role | `role` (stored as written — e.g. CEO, Facility Manager) |
| Specialization | `specialization` |
| Facility Assigned | `facility` (display name or "-" when none) |
| Current Workload | `activeWorkOrders` (derived; "-" in sheet = 0) |
| Phone | `phone` |
| Status | `status` |
| Date Added | `createdAt` / `lastActive` |

Reads and writes use **exact header names only** — never column position.

## Status values (sheet display)
`Active` · `Pending` · `Inactive` · `Suspended`

Blank status cells are preserved as empty — not defaulted to Pending.
