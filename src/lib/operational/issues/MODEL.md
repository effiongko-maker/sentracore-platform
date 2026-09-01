# Issue operational model (Phase 15)

Issue is the universal operational concept: **something that has happened or requires attention**.

**Decided:** There is **no** operational Maintenance-vs-Incident distinction.

```
ISSUE → TREAT → WORK → EXECUTION (optional) → OUTCOME → COST / PAYMENT
```

| Stage | Meaning | Authoritative store |
|-------|---------|---------------------|
| **Issue** | Something that needs attention | Application lens only — **not** persisted |
| **Work** | What we are doing about it | **Maintenance sheet** (Phase 15 compatibility backing) |
| **Execution** | Formal instrument when required | Work Order today; Job Order **future** |
| **Outcome** | Resulting state of the Issue | **Derived** from Work / Request / legacy Incident |
| **Cost / Payment** | Financial flows | Phase 12 foundation |
| **Incident** | Legacy compatibility domain | Incidents sheet — readable; not a new FM category |

See also: `../work/MODEL.md`.


---

## Mental model (operator)

Something happens / needs attention  
→ it is logged  
→ someone determines what needs to be done  
→ treatment/work happens  
→ formal execution may be required  
→ evidence/completion is recorded  
→ cost/payment may follow (future)

Examples (all Issues): leaking toilet, AC not cooling, elevator fault, generator servicing, repair/replacement, cleaning/fumigation, larger facility project, fire or other significant event.

---

## Existing sources of truth

| Origin | Authoritative status |
|--------|----------------------|
| Staff Submit Request | `Request.status` (Track Request) |
| FM Log Issue → Maintenance root | `Maintenance.status` |
| Existing Incident record as root | `Incident.status` |
| Work Order | `WorkOrder.status` |

Issue status is always **derived** from the root record for that composition.

---

## Issue identity (implementation roots)

These are composition identities — **not** different kinds of operational problems:

| Entry | Root SoT | Issue id |
|-------|----------|----------|
| Staff Submit Request | Request.status | `issue:request:{REQ-*}` |
| FM Log Issue (Maintenance root) | Maintenance.status | `issue:maintenance:{MNT-*}` |
| FM Log Issue / existing Incident root | Incident.status | `issue:incident:{INC-*}` |

Do **not** invent a Request for FM entry. Do **not** persist Issue.

---

## Treatment

Treatment = activity/capability under an Issue.

```
Issue
  └── treatments[]
        ├── maintenance          (valid existing implementation)
        └── incident_handling    (only where an Incident record exists)
```

- **Maintenance** may represent corrective, preventive, routine, or other facility work — including treatment that resolves an Issue without a Work Order. It is **not** “the other half” of Incident.
- **Incident handling** is a **specialised operational capability used where required**. Do not assume every significant event must become an Incident. Do not force ordinary problems into Incident. Do not invent new Incident behaviour in this phase.
- Do **not** treat Work Order as a treatment type. Work Order is **Execution**.

Multi-treatment is allowed (e.g. Incident handling + Maintenance + Work Order execution).  
**OPEN:** multi-root status precedence when both Maintenance and Incident exist without a Request — retain root-authoritative behaviour; do not invent a new algorithm silently.

---

## Execution

```
Issue → optional execution → Work Order
```

- Job Order = **not implemented** (future EVC/HQ + Procurement). Do not collapse into WO.
- Approval gates are **not** introduced in this phase.
- Conceptual authorities (Phase 6): Annex Director · HQ/EVC · Client/NCC · Procurement — documentation only.

---

## Outcome

`deriveIssueOutcome()` mirrors derived Issue status. No second resolution engine. No required “Resolve” action solely because Issue has an outcome.

Terminal behaviour remains on existing lifecycles:

- Request → existing request auto-resolution  
- Maintenance → existing maintenance completion  
- Incident → existing incident resolution  

---

## FM Log Issue

`Issues → Log Issue`

- Operator describes **what needs attention** (no Maintenance-vs-Incident taxonomy required)
- Default treatment path → Maintenance root → `issue:maintenance:{MNT-*}`
- Optional specialised investigation → Incident handling root → `issue:incident:{INC-*}`
- **No Request** invented. **No Issue sheet.**
- **Phase 9:** user-facing create returns after root create + Issue composition. Operational event emission, Intelligence consumers, and `operationalEventId` stamp run via Next.js `after()` (non-blocking). Client inserts the returned Issue view without a full Requests/Maintenance/Incidents refetch.

Primary Issue action is **Treat** (routes into the existing treatment capability for that Issue).

---

## Cost / Payment (Phase 12 foundation)

Three commercial flows — see `../finance/MODEL.md`:

1. **Non-reimbursable cost** — PayChex contractual burden (`CostRecord`, `non_reimbursable`)
2. **Reimbursable cost** — actual → markup → submitted → approval → payment (`CostSubmission`)
3. **Contract payment** — monthly payment owed to PayChex (`ContractPaymentRecord`)

**ACTUAL ≠ SUBMITTED ≠ APPROVED ≠ RECEIVED**

Financial SoT is independent of Request / Maintenance / Incident / WorkOrder / Issue status.

No Finance UI or persistence in Phase 12.

---

## OPEN product decisions

- Exact treatment-selection UX refinements (beyond default Log Issue + optional investigation)
- Whether Maintenance / Incidents should eventually leave primary navigation  
- Multi-root status when both MNT+INC without Request  
- Multi-treatment presentation  
- Mandatory WO triggers  
- Full JO approval sequence  
- Financial workflow / payment entity naming  

**Decided (do not reopen):** Issue is the universal object; FM does not operate via Maintenance-vs-Incident taxonomy; Treat is the primary action; Maintenance and Incident handling are capabilities; Work Order is execution; Issues is the primary workspace.

Phase 13 aligns operational UX with that decided model. Financial domain remains Phase 12 foundation (types/docs only).
