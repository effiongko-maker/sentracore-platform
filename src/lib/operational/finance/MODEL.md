# Financial domain foundation (Phase 12)

Types and documentation only. **No Finance UI, sheets, tables, payment processing, or approval engines.**

## Three distinct commercial flows

The FM contract produces three materially different financial flows. Do **not** collapse them into one generic Expense.

### A. Contractual / non-reimbursable cost

Costs PayChex is contractually responsible for (e.g. lift servicing, generator servicing labour covered by the FM contract).

- Represented as a **CostRecord** with `costClass: "non_reimbursable"`
- Track actual amount spent and financial impact
- **Not** submitted to NCC as reimbursement merely because they occurred

### B. NCC-reimbursable / client-funded cost

Costs incurred for the facility that NCC agrees to reimburse (e.g. diesel, approved consumables, fumigation materials, approved projects).

```
ACTUAL COST → MARKUP → SUBMITTED AMOUNT → APPROVAL / SUBMISSION → PAYMENT RECEIVED
```

Critical rule:

| Field | Meaning |
|-------|---------|
| **actualAmount** | What PayChex actually spent |
| **markupAmount** / rate | Commercial markup where applicable |
| **submittedAmount** | What PayChex presents to NCC |
| **approvedAmount** | What NCC approved (may differ from submitted) |
| **receivedAmount** | What was paid |

**ACTUAL ≠ SUBMITTED ≠ APPROVED ≠ RECEIVED**

Never overwrite actual with submitted. Never use submitted as the accounting cost.

### C. Monthly contract payment

Recurring contractual payment owed **to** PayChex under the FM contract.

- Represented as **ContractPaymentRecord**
- **Not** a reimbursement expense
- Conceptual lifecycle (not implemented): Expected → Due → Submitted/Invoiced → Approved/Processing → Received → Outstanding/Overdue

Exact schedule (often reported around the 10th–15th) and amount are **OPEN** — do not hard-code.

---

## Conceptual model

```
FINANCIAL RECORD (conceptual grouping — not necessarily a persisted entity)
├── CostRecord
│   ├── non_reimbursable
│   └── reimbursable
│        └── CostSubmission
│             ├── actualAmount
│             ├── markup (amount and/or rate)
│             ├── submittedAmount
│             ├── submission / approval state
│             └── payment outcome (received / outstanding)
│
└── ContractPaymentRecord
     ├── contract period
     ├── expected / submitted / received amounts
     └── payment state
```

---

## Operational linkage

Intended chain (optional at each step):

```
ISSUE → TREATMENT → EXECUTION → OUTCOME → COST
```

and independently:

```
COST → REIMBURSABLE? → COST SUBMISSION → APPROVAL → PAYMENT
```

and separately:

```
CONTRACT → MONTHLY PAYMENT → RECEIVED / OUTSTANDING
```

One Issue / treatment may produce **multiple CostRecords** with different classes  
(e.g. generator labour = non-reimbursable; oil/filter = reimbursable).

Optional references only (never invent fake links):

- Issue · Request · Maintenance · Incident · Work Order · Job Order (future)

---

## Lifecycle decoupling

| Must not | Because |
|----------|---------|
| Use Maintenance/WorkOrder/Issue status as reimbursement status | Financial SoT is separate |
| Use reimbursement/payment state to resolve an Issue | Work completed ≠ payment received |
| Use Issue resolution to imply payment received | Operational ≠ financial |

---

## Authorities (conceptual — no gates in Phase 12)

| Role | Meaning |
|------|---------|
| Annex Director | Internal / local authority |
| HQ/EVC | Escalated organisational authority |
| Client/NCC | External client / reimbursement authority |
| Procurement | Job Order issuing function |

Existing Client/NCC **APR** is **not** the universal financial approval object and is **not** the same as payment status.

---

## Work Order / Job Order

- Work Order = execution instrument (may be referenced by cost)
- Job Order = future / unimplemented (reference reserved only)
- Finance does **not** decide WO vs JO
- No ₦1m threshold

---

## Source of truth (conceptual)

**Operational:** Request.status · Maintenance.status · Incident.status · WorkOrder.status  

**Issue:** derived lens only  

**Financial:** CostRecord.actualAmount · CostSubmission.submittedAmount / approvedAmount / receivedAmount · ContractPaymentRecord.receivedAmount  

---

## Intelligence readiness (future — not implemented)

The model should eventually support questions such as: spend totals, contractual vs reimbursable, submitted/approved/outstanding, markup, monthly contract receivables, costs by Issue/facility.

Do **not** change Intelligence in Phase 12.

---

## OPEN decisions

- Exact reimbursement categories  
- Markup calculation rules (%, fixed, none — policy not implemented)  
- Approved amount semantics  
- Approval authority for submissions  
- Payment evidence requirements  
- Contract payment schedule and amount  
- Exact entity / persistence naming  
- Whether non-reimbursable costs need budgeting / variance tracking  
- Whether Finance integrates with Beacon / existing accounting structures  
