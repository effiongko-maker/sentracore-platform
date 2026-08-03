# SentraCore Module Blueprint

> **Single source of truth** for every SentraCore module.  
> Derived from the completed **Users**, **Facilities**, and **Assets** modules.  
> For humans and AI agents. Do not invent architecture. Copy this blueprint.

---

## 1. Architecture Overview

Every module MUST follow this request flow. No shortcuts. No alternate stacks.

```
Google Sheet
    ↓
Repository.gs
    ↓
Service.gs
    ↓
Controller.gs
    ↓
Apps Script Router (doPost)
    ↓
Next.js API Route (`src/app/api/<module>/route.ts`)
    ↓
ApiClient
    ↓
Domain Service (`src/services/<module>/<Module>Service.ts`)
    ↓
React Hook (`use<Module>`)
    ↓
React Components
    ↓
UI
```

**Locked rules**

- Frontend never knows about Google Sheets.
- Browser never calls Apps Script directly.
- Components never call ApiClient or Apps Script.
- Hooks call Domain Services only.
- Domain Services call ApiClient only.
- ApiClient calls Next.js API routes only.
- Next.js API routes proxy to Apps Script via the shared `appsScriptProxy` helper.
- Controllers always return via shared `jsonResponse_()`.

Proven reference modules: **Users**, **Facilities**, **Assets**. Prefer the newer of Facilities/Assets when they differ from Users; otherwise treat Users as the gold standard unless instructed otherwise.

---

## 2. Required Frontend Structure

Every feature module lives under:

```
src/modules/<module>/
  components/
    <Modules>Page.tsx
    <Modules>Toolbar.tsx
    <Modules>Table.tsx
    <Module>RowActions.tsx
    <Module>FormModal.tsx
    View<Module>Modal.tsx
  hooks/
    use<Modules>.ts
  services/
    <Module>Service.ts          # re-export of canonical domain service
  types.ts
  constants.ts
  utils.ts
  index.ts
```

Plus the page route and global service:

```
src/app/<module>/page.tsx
src/services/<module>/<Module>Service.ts
src/app/api/<module>/route.ts
```

### File purposes

| File | Purpose |
|------|---------|
| `types.ts` | Canonical TypeScript models (`Entity`, create/update inputs, list params, modal state). UI and hooks import from here. |
| `constants.ts` | Enumerations, filter options, status badge variants, page size. |
| `utils.ts` | Pure helpers (labelize, initials, form defaults). No network. |
| `index.ts` | Public barrel exports for the module (page, hook, types, constants, service). |
| `hooks/use<Module>.ts` | Client state: loading, error, search, filters, pagination, reload, deactivate. Calls Domain Service only. |
| `services/<Module>Service.ts` | Thin re-export of `@/services/<module>/<Module>Service`. Keeps module imports stable. |
| `components/<Module>Page.tsx` | Page composition: header, toolbar, table, modals, confirm deactivate. |
| `components/<Module>Toolbar.tsx` | Search + filters UI. |
| `components/<Module>Table.tsx` | DataTable columns, loading/empty, pagination wiring, row actions. |
| `components/<Module>RowActions.tsx` | Per-row View / Edit / Deactivate menu. |
| `components/<Module>FormModal.tsx` | Create + Edit form. Calls Domain Service for mutate. |
| `components/View<Module>Modal.tsx` | Read-only detail view. |

---

## 3. Required Apps Script Structure

Place deployable scripts under `apps-script/` (source of truth in repo; paste into the Apps Script project).

| File | Responsibility |
|------|----------------|
| `<Module>Repository.gs` | Reads/writes the Google Sheet only. `getAll`, `getById`, `create`, `update`, `deactivate`. No HTTP. No business rules beyond persistence. Soft-deactivate only — never delete rows. |
| `<Module>Service.gs` | Business logic: validation, filtering, pagination. Talks only to Repository. Returns plain JavaScript objects (never `ContentService` / `TextOutput`). |
| `<Module>Controller.gs` | Action routing via `handle(action, payload)`. Calls Service. **Always returns `jsonResponse_()`** exactly like UsersController. |

### Layer rules

**Repository**
- Reads/writes Google Sheets only.
- Owns sheet name, headers, ID generation, row ↔ object conversion.

**Service**
- Business logic.
- Validation.
- Search / filter / pagination.
- Never talks to the spreadsheet directly.

**Controller**
- Action routing (`getAll` | `getById` | `create` | `update` | `deactivate`).
- Always returns `jsonResponse_(success, message, data)`.
- Never returns plain `{ success, message, data }` objects that bypass `jsonResponse_()` when Users uses that helper.
- Never returns `ContentService` objects from Service layers.

---

## 4. Google Sheet Requirements

- **One sheet per module** (e.g. `Users`, `Facilities`, `Assets`).
- **Row 1 contains headers** — exact names used by the live repository / production sheet.
- **IDs are immutable** after create.
- **Never change column names once published** without a coordinated mapping update.
- Soft delete only: set status to inactive via `deactivate`. Never delete rows.
- Spreadsheet header names may differ from canonical frontend field names.
- **Mapping belongs in the Domain Service (and/or Repository)** — not in React components.
- Seed docs (e.g. `apps-script/<Module>.sheet.seed.md`) document headers and optional sample rows for humans.

---

## 5. Router Requirements

Every module must be registered in the Apps Script `doPost` router.

Request body shape:

```json
{
  "resource": "<module>",
  "action": "getAll" | "getById" | "create" | "update" | "deactivate",
  "payload": {}
}
```

Registration pattern:

```javascript
if (resource === "users") {
  result = UsersController.handle(action, payload);
} else if (resource === "facilities") {
  result = FacilitiesController.handle(action, payload);
} else if (resource === "assets") {
  result = AssetsController.handle(action, payload);
} else {
  result = jsonResponse_(false, "Unknown module: " + resource, null);
  // or equivalent unknown-resource failure via the same helper Users uses
}
```

**Every new module must be added to the router.**  
After code changes: **Deploy → New version** of the Web App. Unpublished edits do not affect the live URL.

> Note: Live deployments may use `resource` or `module` as the routing key. Match whatever Users already uses. Controllers still receive `(action, payload)`.

---

## 6. Next.js Requirements

Every module requires:

```
src/app/api/<module>/route.ts
src/app/<module>/page.tsx
```

### Proxy flow

```
Browser
  ↓
Next.js API Route  (`POST /api/<module>`)
  ↓
Apps Script Web App  (via shared `postToAppsScript` / `appsScriptProxy`)
```

**The browser never communicates directly with Apps Script.**

The API route:
- Accepts JSON `{ resource, action, payload }`.
- Defaults resource/action when body is empty (same as Users/Facilities/Assets).
- Returns JSON with `Cache-Control: no-store`.
- Surfaces proxy failures as `{ success: false, message, data: null }` with status `502`.

The App Router page only renders the module page component (e.g. `<AssetsPage />`).

---

## 7. ApiClient Requirements

`ApiClient` (`src/services/api/ApiClient.ts`):

- Talks **only** to Next.js API routes (`/api/users`, `/api/facilities`, `/api/assets`, …).
- **Never** to Apps Script URLs.
- **Never** to Google Sheets.
- Live modules are registered as `path === "/<module>"` → `fetch("/api/<module>", …)`.
- Sends the envelope `{ resource, action, payload }`.
- Parses JSON safely (reject HTML 404/redirect pages).
- Throws `ApiError` on failure.

When adding a module, extend the live-proxy branch in `ApiClient.post` the same way Users / Facilities / Assets are registered. Do not invent a second HTTP client.

---

## 8. Domain Service Requirements

Every module has:

```
src/services/<module>/<Module>Service.ts
```

Re-exported from:

```
src/modules/<module>/services/<Module>Service.ts
src/services/index.ts
```

### Responsibilities

- Call `apiClient` with the correct path and envelope.
- **Mapping** spreadsheet / remote fields → **canonical frontend model**.
- API contract normalization (array vs paginated `{ data, page, pageSize, total, totalPages }`).
- Soft-deactivate API method (never hard delete from the UI path).

### Must not

- Contain UI logic.
- Import React components.
- Call Apps Script or Sheets.
- Expose Google Sheet header names to hooks/components.

Facilities and Assets demonstrate mapping live sheet headers (e.g. `"Facility Name"`, `"Asset ID"`) into canonical models via `pickField` / `mapRemote*`. Follow that pattern when sheet headers differ from the TypeScript model.

---

## 9. React Hook Requirements

Every module exposes:

```ts
use<Module>()   // e.g. useUsers, useFacilities, useAssets
```

### Responsibilities

- `loading`, `error`
- `search` (debounced) + setters
- filters (status, and module-specific filters)
- `page`, `setPage`, `totalPages`, `total`
- `reload`
- list fetch via Domain Service
- `deactivate<Entity>` (and other CRUD wrappers if needed) by calling Domain Service — **no fetch/ApiClient in the hook**

### Must not

- Implement HTTP.
- Know about Apps Script, Sheets, or spreadsheet headers.
- Own presentation markup (that belongs in components).

---

## 10. Component Requirements

Standard components (mirror Users / Facilities / Assets naming):

| Component | Responsibility |
|-----------|----------------|
| `<Module>Page` | Orchestrates header, toolbar, table, create/edit/view/deactivate modals, toasts. Owns modal state union. |
| `<Module>Toolbar` | Search box + filter selects. Controlled props only. |
| `<Module>Table` | Column definitions, badges, pagination via shared `DataTable`, empty/loading states, wires row actions. |
| `<Module>RowActions` | Dropdown: View, Edit, Deactivate (disable deactivate when already inactive). |
| `<Module>FormModal` | Create + Edit form fields, validation, save via Domain Service, toast on success/error. |
| `View<Module>Modal` | Read-only details from the canonical model; optional Edit CTA. |

Use shared UI primitives already in the app (`PageHeader`, `Button`, `SearchBox`, `DataTable`, `Modal`, `ConfirmDialog`, `EmptyState`, `Badge`, `FormField`, etc.). Do not invent a parallel design system.

---

## 11. Canonical Data Model

**Critical rule: Google Sheet headers are NEVER exposed to the UI.**

```
Spreadsheet fields
        ↓
Repository / Domain Service mapping
        ↓
Canonical frontend model (types.ts)
        ↓
Hook → Components → UI
```

Only canonical models reach React.

Examples (live production sheets may differ from early seed docs):

| Sheet header | Canonical field |
|--------------|-----------------|
| Facility ID | `id` (and `code` if no Code column) |
| Facility Name | `name` |
| Address | `location` |
| Asset ID | `id` + `assetTag` (if no Asset Tag column) |
| Asset Name | `name` |
| Install Date | `purchaseDate` |

Mapping is performed in `src/services/<module>/<Module>Service.ts` (`mapRemote*`). Components render only canonical fields (`facility.name`, `asset.status`, …).

---

## 12. Standard CRUD Actions

Every controller supports:

| Action | Purpose |
|--------|---------|
| `getAll` | List with search/filters/pagination in Service |
| `getById` | Single record by id |
| `create` | Append new row; generate immutable id |
| `update` | Patch fields; bump `updatedAt` when present |
| `deactivate` | Soft-deactivate (status → inactive). Never delete. |

Future modules may extend actions, but must keep these five unless product requirements say otherwise.

Envelope:

```json
{
  "resource": "<module>",
  "action": "getAll",
  "payload": { "page": 1, "pageSize": 8, "search": "", "status": "all" }
}
```

---

## 13. API Contract

This contract must never change.

### Single resource

```json
{
  "success": true,
  "message": "Facility retrieved.",
  "data": { }
}
```

### Collection (paginated)

```json
{
  "success": true,
  "message": "Assets retrieved.",
  "data": {
    "data": [],
    "page": 1,
    "pageSize": 8,
    "total": 0,
    "totalPages": 1
  }
}
```

### Failure

```json
{
  "success": false,
  "message": "…",
  "data": null
}
```

Controllers return this shape through `jsonResponse_()`. Domain Services normalize `data` into `PaginatedResult<T>` or a single entity for the UI.

---

## 14. Development Checklist

Use this for every new module:

### Backend (Apps Script + Sheet)

- [ ] Create Google Sheet (row 1 headers finalized)
- [ ] Create `<Module>Repository.gs`
- [ ] Create `<Module>Service.gs`
- [ ] Create `<Module>Controller.gs` (uses `jsonResponse_()`)
- [ ] Register resource in `doPost` router
- [ ] Deploy Apps Script (**New version** of Web App)
- [ ] Optional: `<Module>.sheet.seed.md` in `apps-script/`

### Frontend (Next.js)

- [ ] Create `src/app/api/<module>/route.ts` (reuse `appsScriptProxy`)
- [ ] Register live path in `ApiClient`
- [ ] Create Domain Service `src/services/<module>/<Module>Service.ts` (including mapping)
- [ ] Export from `src/services/index.ts` (and types barrel if needed)
- [ ] Create `src/modules/<module>/` (types, constants, utils, index)
- [ ] Create Hook `use<Module>`
- [ ] Create Components (Page, Toolbar, Table, RowActions, FormModal, ViewModal)
- [ ] Create `src/app/<module>/page.tsx`
- [ ] Ensure nav already points at `/<module>` (or add consistently)

### Verification

- [ ] Test curl against `/api/<module>` → `success: true`
- [ ] Test browser page load
- [ ] Verify pagination
- [ ] Verify filters
- [ ] Verify search
- [ ] Verify View / Create / Edit / Deactivate
- [ ] Verify mapping (canonical fields populated; no blank table from header mismatch)
- [ ] No console errors
- [ ] No TypeScript errors
- [ ] No hardcoded mock data on the live path

---

## 15. Cursor Rules

Explicit instructions for AI agents working in this repository:

1. **Never invent architecture.** Follow this blueprint and the Users / Facilities / Assets implementations.
2. **Never bypass ApiClient.** Domain Services → ApiClient → `/api/<module>` only.
3. **Never let React talk directly to Apps Script.**
4. **Never let React talk directly to Google Sheets.**
5. **Never let components transform spreadsheet fields.** Mapping belongs in the Domain Service.
6. **Never expose Google Sheet headers to the UI.**
7. **Never redesign folders, rename layers, or introduce alternate patterns** (no tRPC, no direct `fetch` from hooks, no new state libraries for CRUD lists).
8. **Always follow the Users module** unless instructed otherwise; treat **Facilities** and **Assets** as equal reference implementations for the full stack (prefer newer when they differ).
9. **Controllers must return `jsonResponse_()`** like Users — do not return unsupported Apps Script types from `doPost`.
10. **Service.gs returns plain JS data only** — never `ContentService` / `TextOutput`.
11. **Soft-deactivate only** — never delete sheet rows from standard CRUD.
12. **Do not declare MODULE COMPLETE** after generating code. Runtime verification is mandatory (see §16).
13. **Extract shared code only if** the same duplication exists in multiple modules **and** behavior remains identical.
14. **Do not change the API contract** in §13.
15. When sheet headers differ from the canonical model, fix **only the mapping layer** unless explicitly told to change the sheet or UI.

---

## 16. Definition of Done

A module is **COMPLETE** only when all of the following are true:

| Check | Required |
|-------|----------|
| curl to `/api/<module>` succeeds (`success: true`) | ✓ |
| Next.js API returns JSON (not HTML) | ✓ |
| Browser page loads and shows live data | ✓ |
| Search works | ✓ |
| Pagination works | ✓ |
| Filters work | ✓ |
| View works | ✓ |
| Create works | ✓ |
| Edit works | ✓ |
| Deactivate works | ✓ |
| No console errors | ✓ |
| No TypeScript errors | ✓ |
| No hardcoded mock data on the live path | ✓ |
| Mapping produces canonical models (UI fields populated) | ✓ |
| Apps Script deployed as a **new Web App version** | ✓ |

Until then, state explicitly:

**MODULE NOT YET COMPLETE.**

Only after runtime verification succeeds, state:

**MODULE COMPLETE.**

---

## Reference modules

| Module | Frontend | Domain Service | API | Apps Script |
|--------|----------|----------------|-----|-------------|
| Users | `src/modules/users/` | `src/services/users/UserService.ts` | `/api/users` | UsersController / UserService / UserRepository |
| Facilities | `src/modules/facilities/` | `src/services/facilities/FacilityService.ts` | `/api/facilities` | FacilitiesController / FacilityService / FacilityRepository |
| Assets | `src/modules/assets/` | `src/services/assets/AssetService.ts` | `/api/assets` | AssetsController / AssetService / AssetRepository |

Mass-produce new modules by copying these. Consistency is more important than cleverness.
