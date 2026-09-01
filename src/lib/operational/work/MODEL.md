# Work domain (Phase 15–16)

## Model

```
ISSUE → TREAT → WORK → EXECUTION (optional) → OUTCOME → COST / PAYMENT
```

| Concept | Meaning | Persistence |
|---------|---------|-------------|
| **Issue** | Something needs attention | Composed lens — **no** Issue sheet |
| **Work** | What we are doing about it | **Maintenance sheet** (compatibility backing) |
| **Execution** | Formal scoped work | Work Order sheet |
| **Incident** | Legacy domain | Incidents sheet — readable; not a new FM category |

There is **no** operational Maintenance-vs-Incident distinction.

## Work / WIP surface (Phase 16)

Canonical operator route: **`/work`**

- List, search, filters, pagination (10/page)
- Detail with Issue / Request / Work Order context
- Treat / complete via existing Maintenance completion semantics
- Deep link: `workHref(id)` → `/work?id=…`
- Compatibility: `/maintenance` remains reachable

## Work lifecycle (physical = Maintenance.status)

| Status | Operator label | Conceptual meaning |
|--------|----------------|-------------------|
| requested | Awaiting action | work identified |
| triaged | Assessed | work assessed |
| scheduled | Scheduled | work scheduled |
| in_progress | In progress | work underway |
| on_hold | On hold | work paused |
| completed | Completed | work completed |
| cancelled | Cancelled | work cancelled |

`Maintenance.status` remains the physical SoT. No second Work status store. No Work sheet.

## FM Log Issue

Log Issue → create Work (via Maintenance orchestrator) → compose Issue → return view.

Does **not** create Incident. Does **not** invent Request. Phase 9 deferred side effects unchanged.

## Request

Staff → Request → Issue → Treat → Work.

Existing Incident-linked Requests remain compatible (legacy terminal: Incident `resolved`).

## Incident deprecation boundary

- Stop new Incident creation from normal Log Issue / Work flows.
- Keep sheet, APIs, historical UI, Intelligence consumers.
- No data migration in this phase.

## Navigation

Issues · **Work / WIP** · Work Orders · Maintenance (compatibility) · Incidents (legacy/historical)
