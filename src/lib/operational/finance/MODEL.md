# Financial domain foundation

Types, persistence mapping, and documentation — see MODEL.md.

## Canonical financial chain

```
Work / Work Order / Job Order  (operational execution — optional context)
            ↓
        CostRecord             (what did this cost us?)
            ↓
      CostSubmission           (what are we claiming?)
            ↓
   Authority / Approval        (what was authorized?)
            ↓
         Payment              (what was received?)
```

**Do not collapse these concepts.**

| Concept | Question it answers |
|---------|---------------------|
| CostRecord | What did this cost us? |
| CostSubmission | What are we claiming (incl. markup)? |
| Approval | What was authorized? |
| Payment | What was received? |

Work, Work Order, and Job Order are **operational execution** references. They are **not** the financial source of truth.

---

## CostRecord

A **CostRecord** represents an actual operational cost incurred or recorded for facility operations.

### Independence

- A CostRecord **may exist without** Work, Work Order, or Job Order.
- A CostRecord **must not** carry submission status, approval status, payment status, markup, reimbursement percentage, or payment received fields.
- Linkage to CostSubmission is via `CostSubmission.costRecordIds` — not embedded lifecycle on CostRecord.

### Examples

| Scenario | Context |
|----------|---------|
| Diesel for a facility | `facilityId` only |
| Cleaning materials | `facilityId` + category; optional `departmentId` |
| Spare part for a Work Order | `facilityId` + `workOrderId` |
| Labour for a Job Order | `facilityId` + `jobOrderId` (when JO exists) |

### Required fields (domain)

- `costId`, `recordedAt`, `facilityId`, `location`, `description`, `category`, `actualAmount`, `reimbursability`, `evidence`, `recordedBy`

### Optional operational context

- `departmentId`, `workId`, `workOrderId`, `jobOrderId`, `budgetedAmount`

**No rule** requires Work/WO/JO. **No rule** forbids multiple contextual references.

`workId` maps to the Work backing store (Maintenance / `MNT-*` ids in the current architecture).

### Facility vs location

| Field | Meaning |
|-------|---------|
| `facilityId` | Structured facility context — selected from the facility catalogue |
| `location` | Operational place within/around the facility (free text), e.g. Generator house, rear service area |

Do not replace `facilityId` with free text. Do not create a location master-data catalogue for CostRecord.

### Actual vs budgeted amount

| Field | Meaning |
|-------|---------|
| `budgetedAmount` | Optional — amount budgeted/planned for this cost when a budget exists |
| `actualAmount` | **Authoritative** incurred/confirmed amount |

Once `actualAmount` is set, it is the sole authoritative monetary value.  
`getAuthoritativeAmount()` returns `actualAmount` only — **never** falls back to `budgetedAmount`.

`budgetedAmount` is **not** an estimate, forecast, quote, claim amount, or reimbursable amount.  
Do not calculate budget-vs-actual variance in CostRecord — that requires a real budget source.

Budgeted amounts are not payable or reimbursable by themselves.

### Reimbursability

Explicit classification only — **never inferred** from category, Work Order, Job Order, amount, facility, or vendor.

| Value | Meaning |
|-------|---------|
| `unknown` | Not yet classified (valid initial state) |
| `reimbursable` | Eligible for future submission path |
| `non_reimbursable` | Contractual / non-claimable |

This replaces the Phase 12 `costClass` + `reimbursementEligible` pair on CostRecord.

### Cost categories

Canonical keys (labels in `COST_CATEGORY_LABELS`):

- Diesel / Fuel · Materials · Spare Parts · Labour · Transportation · Equipment · Consumables · Service · Other

Categories describe **what** was purchased. They are not Work Order, Job Order, NCC, PayChex, or Reimbursement dimensions.

### Supporting / originating evidence

Every CostRecord **requires** evidence with a non-empty `reference`.

Optional evidence fields:

| Domain field | Sheet column (when persisted) |
|--------------|-------------------------------|
| `fileId` | Evidence File ID |
| `fileName` | Evidence File Name |
| `mimeType` | Evidence MIME Type |
| `sizeBytes` | Evidence File Size |
| `fileUrl` | Evidence File URL |
| `evidenceType` | (domain only — not a sheet column) |
| `evidenceDate` | (domain only) |
| `vendorOrSource` | (domain only) |
| `documentReference` | (domain only) |

Receipt and invoice uploads (PDF, JPEG, PNG; max 5 MB) populate the file columns via Apps Script Drive storage on create.

A CostRecord without evidence is **invalid** at the domain layer.

### COST_RECORDS persistence schema (21 columns)

Canonical sheet headers (Apps Script `COST_RECORDS`):

1. Cost ID  
2. Recorded At  
3. Facility ID  
4. Department ID  
5. Location  
6. Work ID  
7. Work Order ID  
8. Job Order ID  
9. Description  
10. Category  
11. Budgeted Amount  
12. Actual Amount  
13. Currency  
14. Reimbursability  
15. Evidence Reference  
16. Evidence File ID  
17. Evidence File Name  
18. Evidence MIME Type  
19. Evidence File Size  
20. Evidence File URL  
21. Recorded By  

Legacy header `Estimated Amount` is read-only at the persistence boundary during migration; it is **not** part of the canonical schema.  
Domain type uses `budgetedAmount` — not `estimatedAmount`.

### What CostRecord does NOT contain

- Markup (`markupAmount`, `markupRatePercent`, …)
- Claim amounts (`submittedAmount`, `approvedAmount`, `receivedAmount`)
- Submission / approval / payment status
- `costSubmissionId` (submission links **to** cost, not embedded on cost)

---

## CostSubmission

A **CostSubmission** represents a reimbursement / claim package: **what costs are we presenting for consideration?**

It references one or more **CostRecords** — it is **not** another CostRecord.

### Core boundary

| Concept | Question |
|---------|----------|
| CostRecord | What did we spend? (`actualAmount` is authoritative) |
| CostSubmission | What are we presenting for reimbursement/claim consideration? |
| Approval | What was authorized? |
| Payment | What was actually received? |

**Do not collapse these.**

### Cost relationship

- A submission **references** CostRecords via `costRecordIds[]`.
- One submission may contain **multiple** CostRecords.
- A CostRecord is **not** assumed to belong to only one submission (cardinality not restricted).
- Cost **selection is explicit** — reimbursable CostRecords are **not** auto-included.

### Identity

- `submissionId` — intended format `SUB-YYYY-NNNNNN` (e.g. `SUB-2026-000001`).
- ID generation belongs to persistence — domain validates format only.

### Lifecycle (submission-owned)

`CostSubmissionLifecycleStatus`:

| Status | Meaning |
|--------|---------|
| `draft` | Being prepared |
| `submitted` | Sent for consideration (includes resubmission after query) |
| `queried` | Returned for clarification |
| `cancelled` | Withdrawn |

Query / resubmission path:

```
draft → submitted → queried → (edit) → submitted
```

**Approval and payment are separate domains.**  
Do **not** encode `approved`, `paid`, or payment receipt on `CostSubmission.status`.

Optional `approvalId` links to Approval — it does not duplicate approval amounts or status.

### Amounts

| Layer | Field | Meaning |
|-------|-------|---------|
| CostRecord | `actualAmount` | Authoritative underlying cost |
| CostSubmission | `claimAmount` | Claim-side amount being presented (optional until finalized) |
| CostSubmission | `markup` | Policy-driven adjustment — **no hard-coded rates** |
| Approval | Work Order client authorisation (Approvals module) — not reimbursement |
| ReimbursementAuthorization | Authorized reimbursement amount for a claim (`authorizedAmount`) |
| ReimbursementAuthorization | Optional `authorityReference` — traceable memo/board ref (not WO `approvalId`) |
| Payment | Received amount (`ReimbursementPayment`) |

**ACTUAL (CostRecord) ≠ CLAIM (CostSubmission) ≠ AUTHORIZED (ReimbursementAuthorization) ≠ RECEIVED (Payment)**  
Work Order Approvals remain a separate domain and must not be treated as reimbursement authorization.  
Do not reuse `CostSubmission.approvalId` for reimbursement authority.

Use `getSubmissionActualCostTotal(costRecords)` to sum underlying actual costs — do not store authoritative actual totals on the submission.

### Reimbursability

`CostRecord.reimbursability` classifies individual costs.  
A CostSubmission does **not** infer or auto-select reimbursable records.

### Evidence vs submission package

| | CostRecord evidence | Submission package |
|--|---------------------|-------------------|
| Question | Why does this cost exist? | What documentation accompanies this claim? |
| Type | `CostEvidence` (required `reference`) | `CostSubmissionPackage` (optional) |

Do not collapse per-cost evidence into the submission package.

### Context (optional)

- `facilityId`, `departmentId` — contextual, not required when costs span facilities
- `periodLabel`, `submissionKind` — extensible; **no hard-coded cadence** (monthly window, 90% completion, etc.)
- Work / WO / JO context may appear on referenced CostRecords or optional `refs`

Job Order is **not required** and has no live persistence.

### What CostSubmission does NOT contain

- Duplicated `actualAmount` as authoritative cost fact
- `approvedAmount`, `receivedAmount`, `paymentOutcome`, `paymentStatus`
- Hard-coded markup percentages (NCC 30%, PayChex rates, etc.)
- Authority role sequences
- Automatic claim / submission / approval transitions

### Deprecated UI pipeline type

`CostSubmissionStatus` (with `approved`, `paid`, etc.) is retained **only** for Finance UI pipeline visualization spanning the full chain. It is **not** the domain lifecycle on `CostSubmission` and **must not** be used as the persistence contract.

### COST_SUBMISSIONS persistence schema (34 columns)

Canonical sheet headers (Apps Script `COST_SUBMISSIONS`):

1. Submission ID  
2. Status (`draft` | `submitted` | `queried` | `cancelled`)  
3. Currency  
4. Cost Record IDs (comma-separated CostRecord references)  
5. Claim Amount  
6. Markup Amount  
7. Markup Rate Percent  
8. No Markup  
9. Facility ID  
10. Department ID  
11. Period Label  
12. Submission Kind  
13. Package Reference  
14. Package Type  
15. Package Date  
16. Package Notes  
17. Ref Issue ID  
18. Ref Request ID  
19. Ref Maintenance ID  
20. Ref Incident ID  
21. Ref Work Order ID  
22. Ref Job Order ID  
23. Ref Facility ID  
24. Ref Contract ID  
25. Execution Kind  
26. Execution ID  
27. Approval ID (relationship link only — no duplicated approval state)  
28. Created At  
29. Created By  
30. Submitted At  
31. Submitted By  
32. Queried At  
33. Query Notes  
34. Notes  

ID format: `SUB-{YYYY}-{NNNNNN}` (generated by persistence on create).

Apps Script resource: `cost-submissions` · Next.js proxy: `/api/cost-submissions`

---

## ContractPaymentRecord (unchanged boundary)

Monthly / periodic contract payment **to** PayChex. Distinct from reimbursement and from CostRecord.

---

## Lifecycle decoupling

| Must not | Because |
|----------|---------|
| Use operational status as reimbursement status | Financial SoT is separate |
| Use payment state to resolve an Issue | Work completed ≠ payment received |
| Use Issue resolution to imply payment received | Operational ≠ financial |

---

## Work Order / Job Order

- **Work Order** — execution instrument; optional `workOrderId` on CostRecord
- **Job Order** — future / unimplemented; `jobOrderId` reserved only
- Finance does **not** decide WO vs JO
- WO/JO is **not** the financial source of truth — CostRecord.actualAmount is

---

## Source of truth (conceptual)

**Operational:** Request · Maintenance · Incident · WorkOrder status  

**Financial:** CostRecord.actualAmount · CostSubmission amounts · ContractPaymentRecord.receivedAmount  

---

## OPEN decisions (unchanged)

- Markup calculation rules  
- Approved amount semantics  
- Approval authority for submissions  
- Payment evidence requirements  
- Contract payment schedule and amount  
- Persistence naming and stores  
- Finance integration with external accounting  

---

## Phase history

- **Phase 12** — initial financial types (CostRecord, CostSubmission, ContractPaymentRecord)
- **Finance domain refinement** — CostRecord semantics tightened: reimbursability, categories, evidence, lifecycle separation, optional execution refs
- **CostRecord persistence** — `COST_RECORDS` sheet via Apps Script (`cost-records` resource); ContractPayment still types-only
- **CostSubmission persistence** — `COST_SUBMISSIONS` sheet via Apps Script (`cost-submissions` resource)
- **Reimbursement payment persistence** — `REIMBURSEMENT_PAYMENTS` sheet via Apps Script (`reimbursement-payments` resource); linked by `submissionId`; never stored on CostRecord or CostSubmission status
- **Reimbursement authorization persistence** — `REIMBURSEMENT_AUTHORIZATIONS` sheet via Apps Script (`reimbursement-authorizations` resource); one authorization per submitted claim; distinct from Work Order Approvals; `authorizedAmount` is the outstanding / fully-reimbursed basis once present; optional `authorityReference` for traceability (not `CostSubmission.approvalId`)
- **CostSubmission persistence** — `COST_SUBMISSIONS` sheet via Apps Script (`cost-submissions` resource)
- **CostRecord semantic correction** — `budgetedAmount` replaces `estimatedAmount`; required `location`; COST_RECORDS schema migration (21 columns incl. evidence file metadata)
- **CostRecord evidence uploads (v0.8.3)** — receipt/invoice files stored in Apps Script Drive; five evidence file columns on sheet
