# Intelligence Experience — Design Direction

## Experience concept

Intelligence is not a page inside an admin app. It is a **mode** the user enters to understand what the operation is telling them — a private operational briefing, not a report.

The user steps out of record management into **interpretation**.

## Deliberately abandoned

- Vertical stack of equal sections (Needs attention → Changed → Noticing → Footer)
- Greeting-first opening ("Good evening")
- KPI-style count headers
- Equal-weight priority rows / bordered lists
- Card grids and dashboard widgets
- TopBar title band consuming horizontal attention on Intelligence
- Footer chrome on Intelligence
- Passive scroll-only interaction

## Page hierarchy

1. **Statement** — One dominant operational conclusion (Display type). Synthesised from posture, not a count.
2. **Focal finding** — Single primary issue at disproportionate scale (Briefing + Evidence type).
3. **Orbit** — Remaining findings recede visually; selectable to refocus.
4. **Layer rail** — Spatial navigation between Attention / Change / Patterns (not tabs).
5. **Detail panel** — Progressive disclosure of selected finding (Interface type).
6. **Context strip** — Response behaviour + operational numbers (Evidence type, quietest).

## Interaction model

- Default layer: **Attention** with auto-selected primary finding.
- Layer rail switches compositional mode (each layer has distinct spatial grammar).
- Click orbit item → promotes to focal; detail panel opens.
- Keyboard: `1`/`2`/`3` layers; arrows navigate findings; Enter focuses; Escape clears.
- Movement between layers = moving through understanding, not switching admin tabs.

## Visual language

| Role | Face | Use |
|------|------|-----|
| Display | Newsreader | Operational statement |
| Briefing | Newsreader | Finding titles, focal narrative |
| Interface | Inter | Rail, controls, chrome |
| Evidence | Newsreader tabular | Counts, deltas, metadata |

Surfaces: warm intelligence canvas (`#eceae4`), deep ink, tonal layers (`ix-layer-base`, `ix-layer-raised`, `ix-layer-focal`). Urgency via composition change — not red borders.

## Component architecture

```
IntelligencePage (server)
  └── IntelligenceExperience (client orchestrator)
        ├── BriefingLayerRail
        ├── BriefingStage
        │     ├── BriefingStatement
        │     ├── AttentionComposition | ChangeComposition | PatternsComposition
        │     └── BriefingContextStrip
        └── BriefingDetailPanel
view-model/buildBriefingViewModel.ts (presentation only)
```

## Shell integration

Intelligence mode: quieter sidebar (200px, architectural), no TopBar/footer, floating identity chrome, full-bleed stage.
