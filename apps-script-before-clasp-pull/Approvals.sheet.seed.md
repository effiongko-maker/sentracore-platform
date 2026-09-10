# Approvals sheet seed

Sheet names accepted: `Approvals`, `APPROVALS`, `Approval Requests`

## Canonical status lifecycle

| Status | Meaning |
|--------|---------|
| `draft` | Package created; not yet sent (Mark as submitted available) |
| `awaiting_decision` | Submitted to client; awaiting response |
| `approved` / `rejected` | Decision recorded |
| `returned` | Returned for clarification |
| `cancelled` / `expired` / `closed` | Terminal / inactive |

### Legacy aliases (normalized on read/write)

- `generated`, `awaiting_submission` → `draft`
- `submitted`, `awaiting_response` → `awaiting_decision`

### Invariant

If `Submitted At` is set, status must not remain `draft`. Repository heals this on read/update.

## Follow-up

Activity only — does not change Status.
