# Issue operational model (Phase 6)

Issue is the conceptual primary operational object.

```
ISSUE → TREATMENT → EXECUTION → OUTCOME → INTELLIGENCE
```

Persistence remains on existing domains. No Issue sheet/table. No second status store.

## Roles

| Concept | Meaning | Authoritative store |
|---------|---------|---------------------|
| **Issue** | Operational problem requiring attention | Application lens only |
| **Request** | Staff/external intake + Track Request | Request sheet |
| **Treatment** | What FM does about the Issue | Maintenance and/or Incident handling |
| **Maintenance** | Treatment/work activity (ordinary default) | Maintenance sheet |
| **Incident** | Significant event: investigation, containment, escalation | Incident sheet |
| **Work Order** | Formal executable work; Annex approval may apply | Work Order sheet |
| **Job Order** | Future: EVC/HQ approval + Procurement issues JO | **Not implemented** |
| **Client/NCC APR** | Optional commercial package on WO; non-blocking | Approval sheet |
| **Cost submission** | Future: actual → markup → submitted → paid | **Not implemented** |
| **Outcome** | Derived from root/treatment terminals | Derived lens |

## Issue identity / roots

| Entry | Root SoT | Issue id |
|-------|----------|----------|
| Staff Submit Request | Request.status | `issue:request:{REQ-*}` |
| FM ordinary Log Issue | Maintenance.status | `issue:maintenance:{MNT-*}` |
| FM significant Log Issue | Incident.status | `issue:incident:{INC-*}` |

Do **not** fake a Request for FM entry. Log Issue UI is future; compose adapters exist.

## Ordinary vs significant

Ordinary (“AC isn’t cooling”):

`Issue → Treat → Maintenance → (optional Work Order) → Resolve`

Significant event (safety / flood / fire alarm):

`Issue → Treat → Incident investigation/handling → (optional Maintenance / Work Order) → Resolve`

Do **not** route ordinary problems through Incident by default.

## Work Order vs Job Order

| | Work Order | Job Order (future) |
|--|------------|--------------------|
| Purpose | Formal executable work | Distinct execution + procurement instrument |
| Approval (product) | Annex-level may be sufficient where applicable | EVC/HQ chain; Procurement **issues** JO |
| Client/NCC APR | Optional package; **not** HQ/EVC; non-blocking today | Separate from Client APR |
| Status | Implemented (`WO-*`) | **Not implemented — do not collapse into WO** |
| ₦1m rule | **Not adopted** without ops evidence | OPEN |

## Authorities (conceptual only — no gates in Phase 6)

- **Annex Director** — WO path where applicable  
- **HQ/EVC** — Job Order path  
- **Client/NCC** — existing APR package  
- **Procurement** — issues Job Orders  

## Cost submission (contract only)

`actual cost → markup → submitted amount → approval/submission → payment received`

Financial SoT = future cost submission package (references WO/JO). **Not** WO/JO status.

## Action routing

- Treat → Maintenance / Incident (not WO)
- Create work → Work Order only when formal execution is needed (optional)
- Job Order action — not offered yet

## OPEN product decisions

- Exact multi-root status when both MNT+INC without Request  
- Mandatory WO triggers  
- Full JO approval sequence  
- Payment entity naming / markup rules  
- Whether Issue sheet is ever required  
