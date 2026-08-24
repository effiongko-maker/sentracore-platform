# SentraCore Platform Experience Direction

## Commitment

SentraCore is an **operational environment**, not an admin application with modules. The UI must be recognisable as SentraCore before a user reads a word — through mode, density, navigation behaviour, canvas treatment, and interaction grammar.

This document governs implementation. It is not post-hoc documentation.

---

## 1. Product modes

Modes are distinct operational contexts. They are not sidebar labels alone — they change how the shell and canvas behave.

| Mode | ID | Routes | Canvas character |
|------|-----|--------|------------------|
| **Command** | `command` | Home | Wide, calm, orientation-first. Operation viewed from above. |
| **Explore** | `explore` | Facilities, Assets, Users, Master Data | Territorial/reference. Objects have place and identity. |
| **Operate** | `operate` | Requests, Maintenance, Work Orders, Incidents | Flow and consequence. Work moves; urgency has weight. |
| **Understand** | `understand` | Dashboard | Immediate operational state. Situational, not narrative. |
| **Cognitive** | `cognitive` | Intelligence | Separate environment. Organisation's interpretive layer. |
| **Communicate** | `communicate` | Reports | Publication. Document-forward, restrained chrome. |

Mode is derived from route (`navigation.ts` → `productMode`). The shell reads mode and adjusts navigation density, canvas width, chrome visibility, and typography register.

---

## 2. Design principles (non-negotiable)

1. **The operation is the interface** — Operational state is visible in the canvas, not buried in generic components. Counts, severity, and flow are environmental, not badge decoration.

2. **Importance creates scale** — Critical incidents, primary findings, and command-level concerns receive disproportionate visual gravity. Metadata and observations recede.

3. **Context before navigation** — Users know which mode and operational context they are in before interacting with controls. The canvas establishes context; navigation supports it.

4. **The interface breathes when calm** — Empty and steady states use space intentionally. Calm communicates control, not absence of design.

5. **Interaction reveals depth** — Progressive disclosure via focus states, investigation panels, and layer movement. Never show every field at once.

6. **The system feels continuous** — Moving between modules is movement through one world. Shared primitives (`px-*`), not shared page templates.

---

## 3. Shell philosophy

### Conventions we break

| Old convention | Why it fails | Replacement |
|----------------|--------------|-------------|
| Permanent expanded sidebar | Reads as ERP module catalogue | **Icon rail** (resting) + intentional expand (context) |
| TopBar + PageHeader on every page | Duplicate orientation, admin template feel | **Context strip** (mode + identity only); pages own narrative |
| Fixed 1400px content column everywhere | One-size-fits-all admin | **Mode canvas** widths and atmospheres per mode |
| Card as default container | Everything looks like a dashboard widget | **Surfaces with purpose**: field, stream, stage, strip |
| Table as default data experience | Scanning without operational meaning | **Operational streams** where flow matters; tables when density required |
| Modal as default detail | Breaks spatial continuity | **Investigation panel** preserving parent context |
| Intelligence as styled page inside same shell | Cognitive layer feels like a report | **Cognitive mode**: distinct canvas, receded nav, no admin chrome |

### Navigation states

| State | Trigger | Behaviour |
|-------|---------|-----------|
| **Resting** | Default | 56px icon rail. Labels via tooltip. Maximum canvas. |
| **Context** | Rail expand button / mobile drawer | Full labels and mode groups visible. |
| **Focus** | Investigation panel open (future) | Rail stays minimal; canvas splits for depth. |
| **Cognitive** | `/intelligence` route | Rail minimal; warm cognitive canvas; floating identity only. |

Movement between states is purposeful, not decorative. Reduced-motion respected.

---

## 4. Typography roles

| Role | Face | Use |
|------|------|-----|
| **Statement** | Inter, tight tracking, large | Command mode headlines, operational conclusions |
| **Object** | Inter medium | Facility names, incident titles, asset identity |
| **Evidence** | Inter tabular / Newsreader (cognitive only) | Counts, deltas, supporting facts |
| **Control** | Inter | Navigation, buttons, filters |
| **Meta** | Inter small caps / muted | Timestamps, mode labels, section markers |

Newsreader is reserved for the **cognitive layer** only. CRUD modules use the operational type system.

---

## 5. Module experience direction

### Home — Command centre
Answers: *What is happening, and where should I go next?*
- No KPI card wall. Operational threads and next actions.
- Command canvas: full width, statement + lanes.

### Facilities — Operational territory
Answers: *Where is the operation physically?*
- Territory framing before table. Facilities as places, not rows.
- Explore canvas: wider, identity-forward list/stream hybrid.

### Incidents — Active operational events
Answers: *What happened, how serious, what's the state?*
- Operate canvas with environmental severity.
- Investigation preserves list context (panel, not disconnected modal long-term).

### Intelligence — Cognitive layer
Answers: *What does the operation mean?*
- Not a page composition. Environment with field of attention (future phase).
- Shell enters cognitive mode; experience evolves separately from CRUD grammar.

### Reports — Communication
Answers: *What do we share externally?*
- Document column, minimal chrome.

---

## 6. Component policy

Before using Card, Table, PageHeader, or Modal:

> Is this the right representation of the information?

New primitives (`src/components/platform/`):

| Primitive | Role |
|-----------|------|
| `ProductShell` | Root shell with mode-aware nav and canvas |
| `PlatformNav` | Icon rail + context expansion |
| `ModeCanvas` | Mode-specific canvas wrapper |
| `ModeFrame` | Module layout scaffold per mode |
| `ContextStrip` | Minimal mode/identity strip |
| `InvestigationPanel` | Detail without losing parent context |

Superseded (retained until migration complete):

- `AppShell`, `Sidebar`, `TopBar`, `ShellFrame`, `MainCanvas`
- `PageFrame` (experience/) → `ModeFrame`
- Generic `PageHeader` on mode-owned pages

---

## 7. Implementation order

1. Platform CSS (`platform-experience.css`, `px-*`)
2. Shell primitives and mode routing
3. Shell visible across all routes
4. Command (Home), Operate (Incidents), Explore (Facilities) experiences
5. Cognitive layer shell integration (not page redesign)
6. Remaining modules

---

## 8. Acceptance tests

1. **Identity** — Screenshot without labels must not read as generic SaaS admin.
2. **Module distinction** — Home, Incidents, Intelligence visibly different experiences, same platform.
3. **Intelligence** — User feels the system is telling them something; not a large-heading dashboard.
4. **Hierarchy** — Critical issues outweigh observations and metadata visually.
5. **Depth** — Detail exploration feels like going deeper, not a new page.
6. **Restraint** — Premium without gimmicks.
