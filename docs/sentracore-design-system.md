# SentraCore Design System

> The visual operating language for SentraCore.  
> Canonical reference for all future UI work.  
> Established: 2026-08-25 · Implementation tokens: `src/styles/sentracore-os.css`

**Related documents**

| Document | Role |
|----------|------|
| [Experience architecture](./sentracore-experience-architecture.md) | Operating layers, shell, IA |
| [Visual language (legacy notes)](./sentracore-visual-language.md) | Superseded by this document for visual decisions |
| [Intelligence direction](./intelligence-experience-direction.md) | Briefing-mode product intent |

**Hard rule for this phase:** establish the system. Do not redesign pages against it yet. Migrate module by module using the map at the end.

---

## 0. Product principle

SentraCore is an **operating system for the organisation**, not an ERP.

| Traditional enterprise software | SentraCore |
|--------------------------------|------------|
| Where do I manage this data? | What is happening? |
| Which module owns this record? | What needs to happen? |
| Fill out the form | What do I need to understand? |
| Navigate the catalogue | What can I do next? |

That distinction governs visual hierarchy, navigation, interaction, and page design.

The product must feel:

- **operational** — built for daily organisational work
- **intelligent** — surfaces meaning, not just records
- **calm** — quiet by default; urgency earned
- **precise** — deliberate proportion and alignment
- **premium** — restraint, not decoration
- **contemporary** — current, not nostalgic or “gov portal”
- **trustworthy** — serious enough for enterprise deployment
- **human** — clear enough that people want to use it

Ambition: an interface language for **operations software after traditional ERP** — not a nicer ERP.

### Reject

- Generic SaaS dashboards
- Tailwind component-library aesthetics as the product look
- Excessive cards and rounded rectangles
- Borders around everything
- Rainbow enterprise colouring
- Decorative gradients
- Visual noise / equal competition for attention
- Old-school dense ERP as the only density model

### Prefer

1. **Operational hierarchy** — attention → activity → change → next action → investigation
2. **Calm by default** — intensity is earned by state
3. **Canvas as surface** — the page itself structures content
4. **Hierarchy before chrome** — type, space, alignment, rhythm, subtle surfaces, thin rules — before cards, borders, shadows, colour
5. **Information has weight** — critical / important / supporting / metadata are not peers

---

## 1. Design philosophy (decision rules)

Before styling anything, answer:

| Question | System answer |
|----------|----------------|
| Should this be a card? | §4 Surface language |
| How large is this title? | §2 Typography |
| Can this be red? | §3 Semantic colour |
| How dense is this table? | §5 Density |
| How should this page behave? | §9 Page archetypes |
| Does this belong in the sidebar? | §7 Navigation |
| Should this feel like Intelligence? | §10 Product modes |
| Is this an action or navigation? | §6 Component language |

If you cannot answer from this document, the system is incomplete — extend the document, do not invent one-off styles.

---

## 2. Typography

### Roles (do not collapse these)

| Role | Used for | Character |
|------|----------|-----------|
| **Interface** | Navigation, tables, forms, actions, registers, labels | Highly legible, compact, neutral, excellent at small sizes |
| **Operational** | Page titles, section headings, important metrics, major statements | Authoritative without becoming decorative |
| **Intelligence** | Briefing opening, focal findings, editorial compositions | Editorial / distinctive — **mode privilege**, not default product type |

**Family (current product)**

- Interface + Operational: **Inter** (`--font-inter` / `--os-font`)
- Intelligence: Inter for structure; display treatment is **compositional** (size, tracking, weight, spatial hierarchy) — not a return to serif editorial as the default OS face. If a dedicated Intelligence display face is reintroduced later, it must be scoped to `ix-*` only.

### Type scale

Every size has a job. Do not invent intermediate sizes in components.

| Token | Size | Weight | Line height | Tracking | Usage |
|-------|------|--------|-------------|----------|-------|
| `display-xl` | 40–48px (`clamp`) | 600 | 0.95–1.05 | −0.04em | Operational signal number (Home critical count) |
| `display-lg` | 32–40px | 600 | 1.1 | −0.03em | Page titles on relaxed archetypes (Reports, Home statement fallback) |
| `display-md` | 28–34px | 600 | 1.12 | −0.025em | Module page titles (standard density) |
| `heading-xl` | 20px | 600 | 1.25 | −0.02em | Major section / featured report titles |
| `heading-lg` | 18px | 600 | 1.3 | −0.015em | Section titles (“Next actions”, “Operational picture”) |
| `heading-md` | 16–17px | 600 | 1.35 | −0.015em | Card / object titles, row primary labels |
| `heading-sm` | 14–15px | 600 | 1.35 | −0.01em | Compact object titles, dense lists |
| `body-lg` | 15–16px | 400 | 1.55 | 0 | Page ledes, intro copy |
| `body-md` | 14px | 400 | 1.5 | 0 | Default body, table cells |
| `body-sm` | 13px | 400–500 | 1.45 | 0 | Secondary descriptions, supporting copy |
| `label-lg` | 12px | 600 | 1.3 | 0.06–0.1em | Uppercase micro-sections when needed (“INCLUDES”) |
| `label-md` | 11px | 600 | 1.3 | 0.08–0.14em | Column headers, process rail labels |
| `label-sm` | 10–11px | 500–600 | 1.3 | 0.02em | Status chips as text, faint labels |
| `micro` | 10–11px | 500 | 1.4 | 0–0.02em | Metadata, timestamps, format strings |

**CSS tokens:** `--os-text-display-xl` … `--os-text-micro` (aliases to the live scale in `sentracore-os.css`). Prefer these names in new work; existing `--os-type-*` remain supported.

### Hierarchy rules

- One **dominant** signal per viewport when the archetype is Home / attention-led.
- Page title must not compete with critical operational numbers.
- Metadata must recede (`body-sm` / `micro` + muted ink).
- Do not enlarge type to “feel premium.” Premium comes from proportion and restraint.

---

## 3. Colour system

SentraCore is **not** a colourful SaaS product. Colour communicates **operational meaning**.

### Environments

| Environment | Token | Value (foundation) | Role |
|-------------|-------|-------------------|------|
| Operating canvas | `--os-canvas` / `--os-canvas-architectural` | `#F5F6F8` | Workspace atmosphere — cool neutral, not sterile pure white, not warm beige editorial |
| Surface | `--os-surface` | `#FFFFFF` | Content resting on canvas |
| Elevated | `--os-surface-elevated` | `#FFFFFF` + restrained shadow | Dialogs, palettes, floating panels |
| Selected | `--os-surface-selected` | soft ink wash / accent-soft mix | Chosen objects, active rows |
| Interactive hover | `--os-surface-interactive` | very light cool wash | Hover confirmation |
| Navigation (compass) | `--os-nav-bg` | `#0E1520` | Architectural ink spine |
| Intelligence canvas | `--os-canvas-intelligence` / `--ix-canvas` | `#F3F4F6` | Distinct briefing atmosphere, still SentraCore family |

Do not invent five barely distinguishable greys. Each level has a purpose.

### Ink (text)

| Token | Value | Use |
|-------|-------|-----|
| `--os-ink` | `#121A24` | Primary text |
| `--os-ink-soft` | `#243041` | Strong secondary |
| `--os-ink-secondary` | `#475467` | Supporting |
| `--os-ink-muted` | `#667085` | Secondary copy |
| `--os-ink-faint` | `#98A2B3` | Metadata, placeholders |
| `--os-ink-disabled` | `#D0D5DD` | Disabled |

On dark navigation: `--os-ink-on-dark`, `--os-ink-on-dark-muted`, `--os-ink-on-dark-faint`.

### Accent (reserved)

| Token | Value | Use |
|-------|-------|-----|
| `--os-accent` | `#2563EB` | Focus, active nav indicator, rare primary CTA |
| `--os-accent-soft` | `#F0F5FF` | Soft selected / hover wash |
| `--os-accent-ink` | `#1D4ED8` | Accent text / icons |

Accent is **not** decoration for every card.

### Semantic colours

Each semantic colour has four roles: **ink**, **soft**, **border**, **strong**.

| Meaning | When to use | Ink | Soft | Notes |
|---------|-------------|-----|------|-------|
| **Critical** | Genuine urgency requiring intervention | `#8F2D35` | `#FAF4F4` | Oxblood — not bright web red |
| **Warning / attention** | Elevated risk, needs watch | `#9A6700` | `#FAF6EB` | Bronze / muted amber |
| **Success** | Meaningful healthy / complete state | `#0F6B45` | `#EEF8F2` | Deep operational green |
| **Info** | Neutral informational emphasis | `#2563EB` soft use | `#F0F5FF` | Same family as accent; keep rare |
| **Neutral** | Default state | ink / muted | canvas | Most of the UI |

**Rules**

- Red means urgent. Not “this card is special.”
- Do not rainbow-code modules.
- Status in tables: text + optional dot / soft fill — not neon pills.

Public aliases (`--sc-danger`, `--sc-warning`, `--sc-success`, …) map to these tokens for Tailwind / legacy components.

---

## 4. Surface language

**Default answer is not a card.**

### Canvas content

Use when information lives in page hierarchy; sections distinguished by spacing and type.

Examples: Home next actions, recent activity, continuous workflows, registry toolbars above tables.

### Tonal grouping

Use when related content needs subtle grouping without elevation — soft background shift or a single thin rule.

### Cards / report objects

Reserve for:

- Distinct independently actionable objects
- Summary units that must be scanned as a set
- Content that requires visual isolation

Cards must not be the default layout answer. Prefer near-invisible borders, hierarchy, and hover lift over thick outlined rectangles.

### Elevated surfaces

Dialogs, command palette, detail drawers, investigation panels, floating focus.

### Borders

Structural only: containment, division, selection, state.

Avoid outlining every chip, icon, and block. If removing a border does not hurt understanding, remove it.

### Radius

Architectural, not bubbly:

| Token | Value | Use |
|-------|-------|-----|
| `--os-radius-sm` | 4px | Controls, nav items, report objects |
| `--os-radius-md` | 6px | Panels, tables |
| `--os-radius-lg` | 8px | Rare larger containers |
| Full pill | Avoid for metadata | Avatars only when needed |

### Shadow

None by default. Elevated / hover only, extremely restrained (`--os-shadow-focused`).

---

## 5. Spacing and density

### Spacing scale (strict)

| Token | px |
|-------|-----|
| `--os-space-1` | 4 |
| `--os-space-2` | 8 |
| `--os-space-3` | 12 |
| `--os-space-4` | 16 |
| `--os-space-5` | 20 |
| `--os-space-6` | 24 |
| `--os-space-8` | 32 |
| `--os-space-10` | 40 |
| `--os-space-12` | 48 |
| `--os-space-16` | 64 |
| `--os-space-20` | 80 |

Do not use arbitrary gaps (e.g. `13px`, `22px`). Compose from the scale.

### Density modes

Apply via wrapper class on the page / region:

| Mode | Class | Used for | Character |
|------|-------|----------|-----------|
| **Relaxed** | `.os-density-relaxed` | Home, Intelligence, Reports, executive views | Larger titles, more section pause, generous object padding |
| **Standard** | `.os-density-standard` | Forms, detail pages, general workspaces | Balanced |
| **Dense** | `.os-density-dense` | Registers, finance-ready tables, admin | Compact rows, tighter padding, still legible |

Enterprise software must **support** density without looking crowded everywhere. Do not force enormous whitespace on registers.

Density tokens (row height, cell padding, section gap) live under `--os-density-*` and are set by the mode classes.

---

## 6. Component language

### Buttons

Four intents only:

| Intent | Visual | When |
|--------|--------|------|
| **Primary** | Accent fill | One main forward action per region |
| **Secondary** | Outline / ink soft | Alternate actions |
| **Tertiary / text** | Ghost / text | Low emphasis, inline |
| **Destructive** | Critical fill or critical text | Irreversible / harmful |

Do not ship six competing button styles. Legacy `soft` / duplicate fills should converge over time.

### Actions vs navigation vs metadata

| Thing | Looks like |
|-------|------------|
| Primary create / submit | Button |
| Navigate to a record / path | Row / link — **not** a fat button |
| Output formats (DOCX · PDF) | Metadata text |
| Includes / tags | Checkmarks, dots, quiet text — **not** outlined pills |
| Keyboard shortcuts | Quiet kbd treatment |

### Icons

Lucide (current). Restrained stroke. Optically balanced. Prefer bare or soft circular wash — **not** every icon in a bordered square.

### Inputs

Professional tools: clear border, quiet background, elegant focus ring (accent, 1–2px). Not decorative oversized controls.

### Tables (critical)

| Concern | Rule |
|---------|------|
| Surface | `.sc-table-surface` / future `.os-table` — white on canvas, thin rule |
| Header | `label-md`, muted ink, subtle header wash |
| Row height | Driven by density mode |
| Hover | Soft interactive wash |
| Selection | Inset accent or ink edge + selected surface |
| Status | Semantic text / dot; avoid rainbow pills |
| Actions | Icon or text tertiary; reveal on hover where dense |
| Sticky | Header sticky in tall registers |

Finance and operations registers must feel as considered as Home.

---

## 7. Navigation as architecture

Navigation represents the **organisation’s operating model**, not a page catalogue.

### Current product labels (preserve)

```
Home

INTELLIGENCE
  Intelligence · Dashboard · Reports

ORGANISATION
  Facilities · Assets · People · Master Data

WORK
  Requests · Maintenance · Work Orders

OPERATIONS
  Incidents
```

Do not casually rename modules for aesthetics.

### Conceptual domains (internal model)

| Domain | Question | Current label |
|--------|----------|---------------|
| Begin | Where does the operator start? | Home |
| Understand | How is the organisation interpreted? | Intelligence group |
| Organise | What does the org consist of? | Organisation |
| Act | What needs to happen? | Work |
| Execute | What is being performed / disrupted? | Operations (+ work execution modules) |
| Learn | What can we improve from? | Future Insights (not yet in sidebar) |

### Navigation layers

1. **Primary** — Organisational Compass (sidebar)
2. **Domain grouping** — section labels (quiet, uppercase, tracked)
3. **Contextual** — modules under active domain
4. **Breadcrumbs / command context** — top bar orientation
5. **Page-local** — tabs, steppers, in-page anchors
6. **Command / search** — global palette
7. **Temporary modes** — Intelligence chrome, modals, drawers

Active item: restrained surface + brighter text + thin left accent — **not** a large rounded grey pill.

---

## 8. Command layer

SentraCore should feel like an OS. Command is a first-class concept.

### Intended model (document now; implement progressively)

| Verb | Example |
|------|---------|
| Search | Find a work order |
| Navigate | Go to Facility 001 |
| Create | Create an incident |
| Open | Open latest maintenance request |
| Ask | Ask what changed this week *(future)* |

Current implementation: command bar + palette with navigate / create stubs. **Do not fake Ask.** Extend honestly.

The command field should feel like a **precision instrument** — quiet until needed.

---

## 9. Page archetypes

New pages start from an archetype — never from a blank Tailwind layout.

### Home (Command)

- **Purpose:** Orient the operator
- **Answers:** Attention? Active? Next?
- **Density:** Relaxed
- **Header:** Operational statement / signal hierarchy
- **Surfaces:** Canvas content; avoid card grids
- **Interaction:** Whole-row paths, subtle cues

### Operational Dashboard

- **Purpose:** Live state of a domain
- **Density:** Standard
- **Header:** Title + short lede + optional as-of
- **Surfaces:** Metrics as instrument strips where possible; cards only for true objects
- **Avoid:** KPI sticker explosion

### Intelligence (mode)

- **Purpose:** Enter a briefing environment
- **Density:** Relaxed / compositional
- **Header / chrome:** Dedicated Intelligence chrome allowed
- **Surfaces:** Spatial composition, progressive disclosure
- **Not:** Analytics card wall

### Registry

- **Purpose:** Find, filter, manage many objects
- **Examples:** Assets, Facilities, Work orders, People
- **Density:** Dense (or standard with dense table)
- **Header:** Title, filters, primary create
- **Surfaces:** Table as primary; filters tonal, not card stacks

### Detail

- **Purpose:** Understand and act on one object
- **Density:** Standard
- **Header:** Object title + status + primary actions
- **Surfaces:** Sections via rules/spacing; elevated for investigations

### Workflow

- **Purpose:** Multi-step process (e.g. Reports)
- **Density:** Relaxed–standard
- **Header:** Title + process rail
- **Surfaces:** Steps as rail; objects editorial; soft panels for forms

### Reporting

- **Purpose:** Define, generate, consume outputs
- **Density:** Relaxed
- **Surfaces:** Report objects, not catalogue cards
- **Not:** Intelligence typography mode

### Finance (future)

- **Purpose:** Position and decisions
- **Density:** Dense tables + standard summaries
- **Surfaces:** Instrument metrics + precise registers
- **Colour:** Semantic only for variance / risk

### Settings / configuration

- **Purpose:** Configure the OS
- **Density:** Standard
- **Tone:** Clearly non-operational — quieter, structural
- **Avoid:** Looking like a work queue

---

## 10. Intelligence as a product mode

```
SENTRACORE CORE SYSTEM
        │
        ├── Operational workspace  (os- / sc-)
        │
        ├── Intelligence mode      (ix-)
        │
        └── Future specialised modes
```

Intelligence is **entering an operational briefing**, not another admin page.

Allowed: distinct canvas, editorial composition, progressive disclosure, dedicated chrome.  
Required: still SentraCore ink, semantic colour, calm authority — not a separate product brand.

Operational modules must **not** copy Intelligence’s briefing aesthetic.

---

## 11. Motion

Feel responsive, not animated.

| Token | Value | Use |
|-------|-------|-----|
| `--os-duration-fast` | 120ms | Micro colour / border |
| `--os-duration-base` | 160ms | Hover, selection (default) |
| `--os-duration-slow` | 220ms | Panels, drawers |
| `--os-ease` / `--os-ease-out` | ease / ease-out | Default curves |

Principles:

- Hover confirms interactivity (1px lift max where appropriate)
- No bounce, no large scale transforms
- Panels feel attached to their opener
- Honour `prefers-reduced-motion`

---

## 12. Token architecture (implementation)

### Single source of truth

`src/styles/sentracore-os.css` → `:root` OS tokens (`--os-*`)

### Alias layers (do not fork values)

| Layer | Prefix | Role |
|-------|--------|------|
| OS foundation | `--os-*` | Canonical |
| Product / Tailwind bridge | `--sc-*` in `globals.css` | Legacy + `@theme` |
| Intelligence mode | `--ix-*` | Mode-scoped overrides |
| Reports experience | `--rp-*` | Archetype-scoped, maps to OS |

**Do not** add a fourth competing palette. New work reads `--os-*` (or documented aliases).

### Legacy

`platform-experience.css` (`px-*`) is **superseded** and not imported. Do not revive it.

### CSS class namespaces

| Prefix | Scope |
|--------|-------|
| `os-` | Shell, compass, command bar, shared patterns |
| `ix-` | Intelligence experience |
| `rp-` | Reports publishing archetype |
| `sc-` | Shared utilities (e.g. table surface) bridging to OS |

---

## 13. Decision checklist (design language)

Copy into PR reviews for UI work:

- [ ] Archetype identified
- [ ] Density mode appropriate
- [ ] Type tokens used (no one-off sizes)
- [ ] Colour is semantic or structural — not decorative
- [ ] Surface choice justified (canvas / tonal / card / elevated)
- [ ] Borders structural only
- [ ] Actions ≠ navigation ≠ metadata
- [ ] Motion ≤ 200ms, ease-out
- [ ] Intelligence rules only if in Intelligence mode
- [ ] Sidebar / routes / data logic untouched unless intentionally scoped

---

## 14. Product migration map

Do **not** implement these migrations in the foundation phase. Use as the roadmap for coherent redesign passes.

| Area | Current state | Desired archetype | Change later | Preserve |
|------|---------------|-------------------|--------------|----------|
| **Home** | FOUNDATION ESTABLISHED — Command surface, industrial hierarchy | Home (Command) | Micro-consistency with tokens; avoid regression to cards | Signal hierarchy, next actions as paths, operational picture strip, recent activity |
| **Intelligence** | FOUNDATION ESTABLISHED — Distinct briefing mode | Intelligence | Align leftover warm/editorial leftovers to `ix-*` + OS ink; protect mode privilege | Briefing composition, progressive disclosure, chrome |
| **Dashboard** | Partial — still closer to admin widgets | Operational Dashboard | Reduce card grid; instrument metrics; standard header | Live operational data, route |
| **Reports** | FOUNDATION ADVANCED — publishing surface (`rp-`) | Workflow + Reporting | Token-align `rp-*` fully to `--os-*`; second-pass density | Wizard flow, report types, generation logic |
| **Facilities** | Registry with legacy card/table chrome | Registry | Density mode, table language, quieter filters | CRUD, data, permissions |
| **Assets** | Registry | Registry | Same as Facilities | Asset model, actions |
| **People** | Registry | Registry | Same; clarify “People” vs Users labelling in IA docs only when intentional | Auth, roles |
| **Master Data** | Registry / admin | Registry (dense) | Dense tables, configuration tone | Reference data integrity |
| **Requests** | Workflow / act entry | Workflow + Detail | Align with Work domain patterns | Request types, routing |
| **Maintenance** | Execute register | Registry + Detail | Table density, status language | Maintenance lifecycle |
| **Work Orders** | Execute register | Registry + Detail | Same | WO lifecycle |
| **Incidents** | Execute register + intelligence panel | Registry + Detail (+ Intelligence embed) | Quiet register; keep incident intelligence as embedded understanding, not a second product | Incident ops + recommendation decisions |

### Suggested migration order (future)

1. Shared primitives (Button, inputs, table density) against tokens  
2. Registry archetype template (Facilities → Assets → Work Orders → Maintenance → Incidents → People)  
3. Dashboard → Operational Dashboard  
4. Detail / modal consistency  
5. Finance (when introduced) from Finance archetype from day one  

---

## 15. Quality bar

The foundation succeeds when we can answer **yes**:

> Could we build a completely new SentraCore module six months from now and know exactly how it should behave visually?

Not merely: “Do today’s pages look better?”

SentraCore should make visible that an organisation can:

**understand → organise → act → execute → learn**

through one coherent operating language.
