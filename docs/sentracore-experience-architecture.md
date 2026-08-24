# SentraCore Experience Architecture

> The operating environment of an organisation — not a collection of modules behind a sidebar.

> **Visual decisions:** use [`sentracore-design-system.md`](./sentracore-design-system.md) as the governing visual system. This document remains the IA / shell / layer reference.

This document governs all experience implementation. Backend, intelligence engine, routes, permissions, and business logic are preserved. Everything about how the product is *experienced* is defined here.

---

## 1. Product philosophy

### Mental model

```
UNDERSTAND → DECIDE → ACT → EXECUTE → LEARN
```

Traditional ERP begins with the database: *"Which module do I need?"*

SentraCore begins with the organisation:

- What is happening?
- What needs my attention?
- What do I need to do?
- Where do I go next?

The platform is a **living operational system**. Users move through **operating layers**, not module silos.

### What SentraCore is not

- A sidebar catalogue of CRUD modules
- A dashboard with cards and KPI spam
- Intelligence as a styled page inside generic admin chrome
- Cards as the default container for information

### What SentraCore is

- An organisational operating environment
- A command surface at entry (Home)
- Layer-aware navigation with contextual modules
- Intelligence as the organisation speaking
- Modules as distinct operational grammars within one visual world

---

## 2. Operating layers (information architecture)

Five persistent layers form the **Organisational Compass**. Home (`/`) is the **Command Surface** — entry orientation, not a layer.

| Layer | ID | Question | Modules (current) | Future scale |
|-------|-----|----------|-------------------|--------------|
| **Understand** | `understand` | What is happening? | Intelligence, Dashboard, Reports | Trends, alerts, cross-functional insights |
| **Organise** | `organise` | What does the org consist of? | Facilities, Assets, People, Master Data | Teams, departments, org entities |
| **Act** | `act` | What needs to happen? | Requests | Approvals, recommendations, tasks, workflows |
| **Execute** | `execute` | What is being done? | Incidents, Maintenance, Work Orders | Projects, procurement, finance workflows |
| **Learn** | `learn` | What did we learn? | *(placeholders)* Outcomes, Trends | Predictive learning, decision history |

Routes remain unchanged. Layer assignment is navigational and contextual, not a routing rewrite.

---

## 3. Navigation philosophy

### Two-level model

**Level 1 — Organisational Compass** (persistent, ~240px desktop)

- Architectural spine in INK
- Shows all five layers with distinct visual identity
- Active layer reads as *entering a context*, not selecting a menu item
- Attention signals on layers/modules when relevant (future)
- **Not** a collapsed icon rail — discoverability is mandatory on desktop

**Level 2 — Contextual modules**

- When a layer is active, its modules appear beneath it
- Only one layer expanded at a time (accordion within compass)
- Home / Command is always reachable at the compass crown

### Mobile

- Compass becomes a full-height sheet
- Bottom bar for Command + active layer + quick command
- Detail views use sheets, not full page breaks

---

## 4. Command Surface (Home)

Home answers: **What should I know, decide, or do next?**

Built from real workspace data — no fabricated intelligence.

| Zone | Purpose | Data source |
|------|---------|-------------|
| **Organisational state** | One concise operational statement | Derived from open incidents, maintenance, work orders in WorkspaceService |
| **Active threads** | Ongoing operational narratives to continue | Activity feed + schedule + non-empty work queues |
| **Next actions** | Verbs, not module shortcuts | Quick actions as action rows |
| **My work** | Personal workload — shown only when non-empty | myWork summaries with count > 0 |
| **Organisational pulse** | Compact activity/risk/workload glance | Derived pulse metrics from same snapshot |

Empty data must not dominate. Zero-state recedes; signal dominates.

---

## 5. Visual philosophy

**Calm · Precise · Confident · Editorial · Technical · Spacious-but-not-empty · Premium-not-luxury · Futuristic-not-gimmicky**

Synthesised identity — not a copy of Linear, Apple, Stripe, Notion, or Bloomberg.

Hierarchy through **scale, ink weight, surface depth, and density** — not decoration.

---

## 6. Colour system

### INK — structural frame

```
--os-ink-900: #101A24   (primary nav, structural)
--os-ink-800: #152432   (nav elevated)
--os-ink-700: #1B2D3D   (nav hover, borders on dark)
```

Deep blue-black. Not pure black.

### CANVAS — layered surfaces

```
--os-canvas-architectural: #E8EAED   (app background — cool mineral grey)
--os-canvas-operational:   #F0F1F3   (module canvas)
--os-canvas-raised:        #F7F8F9   (contained content)
--os-canvas-focused:       #FFFFFF   (focus/detail — used sparingly)
--os-canvas-overlay:       #FFFFFF   (panels, command palette)
```

No sterile white app background. Depth from contrast, borders, subtle shadow, density — not rounded card spam.

### ACCENT — system energy

```
--os-accent:       #2563EB   (cobalt — active, intelligence, system action)
--os-accent-soft:  #EFF6FF
--os-accent-muted: #93C5FD
```

Used sparingly against INK architecture.

### Semantic

```
--os-critical: #991B1B / soft #FEF2F2
--os-high:     #B45309 / soft #FFFBEB
--os-positive: #166534 / soft #F0FDF4
--os-info:     var(--os-accent)
```

Never rainbow. Semantic colour communicates.

---

## 7. Typography

| Role | Face | Use |
|------|------|-----|
| **Display** | Newsreader (`--font-display`) | Organisational statements, Intelligence conclusions — sparingly |
| **Interface** | Inter (`--font-inter`) | Navigation, tables, forms, metadata, operational UI |
| **Numerical** | Inter tabular-nums | Counts, signals — intentional size, always contextual |

Type scale (interface):

- Display statement: clamp(1.75rem, 3.5vw, 2.5rem), Newsreader, -0.02em
- Module title: 1.375rem, semibold, -0.02em
- Body: 0.875rem / 1.55
- Meta: 0.6875rem, uppercase tracking, muted

---

## 8. Spacing & elevation

Spacing base: **4px grid**. Primary rhythm: 8, 12, 16, 24, 32, 48.

| Token | Value | Use |
|-------|-------|-----|
| `--os-space-1` | 4px | Tight inline |
| `--os-space-2` | 8px | Row padding |
| `--os-space-3` | 12px | Component gap |
| `--os-space-4` | 16px | Section gap |
| `--os-space-6` | 24px | Module sections |
| `--os-space-8` | 32px | Major zones |

Elevation:

- **Flat** — rows on canvas (default)
- **Raised** — stream surfaces, panels (`0 1px 2px rgba(16,26,36,0.06)`)
- **Focused** — command palette, detail sheets (`0 8px 32px rgba(16,26,36,0.12)`)

---

## 9. Presentation patterns (not cards)

| Pattern | When | CSS prefix |
|---------|------|------------|
| **Surface** | Containment required | `os-surface` |
| **Row** | Scanning, comparing | `os-row` |
| **Thread** | Ongoing narrative | `os-thread` |
| **Statement** | Conclusion, orientation | `os-statement` |
| **Composition** | Related information group | `os-composition` |
| **Panel** | Contextual side detail | `os-panel` |
| **Stream** | Operational data flow (tables) | `os-stream` |

Before any bordered rectangle: *Does this information need a container?*

---

## 10. Global command layer

Replaces generic TopBar. Fixed height ~52px. Contains:

1. **Organisational context** — org name, active layer + module
2. **Global command** — `⌘K` search/navigate/create affordance
3. **Personal context** — user identity
4. **System state** — alerts slot (when relevant)

Light, translucent — does not compete with module content.

---

## 11. Command palette (`⌘K`)

Platform-wide keyboard-native interaction.

Phase 1 actions (real, not fake):

- Navigate to all enabled modules
- Create: Report incident, Request maintenance (via routes)
- Go to Intelligence, Home, Dashboard

Implemented with `cmdk` pattern or lightweight custom — no mock AI.

---

## 12. Intelligence in the operating system

Intelligence engine, read model, deduplication, thresholds — **untouched**.

Presentation:

- Lives in **Understand** layer navigation
- Canvas uses shared INK/CANVAS/ACCENT tokens (warm operational variant allowed)
- Newsreader for conclusions; Inter for evidence
- Spatial layer model preserved: focal finding, orbit, movement, patterns, detail panel
- Must feel like *entering the intelligence layer of the same OS* — not a separate art project

Visual bridge: compass stays INK; intelligence canvas shifts to warm mineral (`--os-canvas-intelligence: #E6E3DC`) while accent, typography roles, and command bar remain SentraCore.

---

## 13. Module operational grammars

Each module rejects `title + button + card + table` as default.

| Module | Grammar |
|--------|---------|
| Facilities | Territorial — location count, spatial rows, facility as place |
| Assets | Entity — identity, condition, location context in rows |
| Incidents | Case file — severity signal, environmental header, stream |
| Maintenance | Flow — workload signal, progression |
| Work Orders | Execution — momentum, responsibility |
| Requests | Queue — incoming, waiting, blocked |
| People | Responsibility — role, team, involvement |
| Reports | Publication — editorial width, document flow |
| Dashboard | Situational — pulse metrics, scan density |

Shared primitives; distinct composition.

---

## 14. Motion

Restrained. Purpose only:

- Layer context change (opacity + translate 8px, 180ms)
- Detail panel enter (slide, 200ms)
- Command palette (scale 0.98→1, 150ms)

`prefers-reduced-motion`: instant transitions.

No bounce, no decorative animation.

---

## 15. Responsive

| Breakpoint | Behaviour |
|------------|-----------|
| Desktop ≥1280 | Full compass + command bar + workspace |
| Tablet 768–1279 | Compass sheet; adaptive canvas widths |
| Mobile <768 | Bottom nav + command sheet; no wide tables |

---

## 16. Platform scale path

Layer taxonomy absorbs future domains without navigation rewrites:

- **Finance** → Execute (workflows) + Understand (reporting)
- **HR** → Organise (people) + Act (approvals)
- **Projects** → Execute
- **Procurement** → Act + Execute

New modules slot into layer module lists. Compass architecture holds.

---

## 17. Implementation map (codebase)

| Phase | Deliverable | Key files |
|-------|-------------|-----------|
| 1 | This document + tokens | `docs/`, `src/styles/sentracore-os.css` |
| 2 | Shell rebuild | `OrganisationalCompass`, `GlobalCommandBar`, `CommandPalette`, `ProductShell` |
| 3 | Command Surface | `CommandSurface`, `WorkspacePage`, `WorkspaceService` pulse fields |
| 4 | Intelligence DNA bridge | `intelligence-experience.css` token alignment |
| 5–8 | Module grammars | Module pages via `os-*` patterns |

### Superseded

- Icon rail `PlatformNav` (56px resting model)
- `ContextStrip` as primary chrome
- `PageHeader` on module pages
- `px-*` partial system → absorbed into `os-*`
- Old `Sidebar`, `TopBar`, `AppShell` layout tree

### Preserved

- All routes under `src/app/(app)/`
- Intelligence engine + `OrganisationIntelligence`
- Services, actions, Supabase, APIs
- `IntelligenceExperience` interaction model (layer rail, focal, detail)

---

## 18. Acceptance

1. Screenshot without labels ≠ generic SaaS admin
2. Home, Incidents, Intelligence = three distinct experiences, one platform
3. Navigation communicates operating layer without reading module names
4. `⌘K` opens useful real actions
5. Critical issues outweigh metadata visually
6. User reaction target: *"Why doesn't enterprise software normally feel like this?"*
