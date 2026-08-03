# SentraCore Module Generator

## Purpose

Every SentraCore module must be generated using a repeatable manufacturing process.

This generator exists to eliminate architectural drift and ensure every module is built the same way — as if the same engineer produced Users, Facilities, and Assets.

**This is an implementation playbook for AI agents.**  
Architecture authority remains `MODULE_BLUEPRINT.md`. If anything here conflicts with the blueprint, **stop and follow the blueprint**.

Before any code: silently re-read `MODULE_BLUEPRINT.md` and compare against Users, Facilities, and Assets.

---

# Phase 1 — Planning

Before writing code:

1. **Analyse existing completed modules**  
   Inspect `src/modules/users`, `src/modules/facilities`, `src/modules/assets`, matching domain services, API routes, and `apps-script/*` files. Prefer the newer of Facilities/Assets when they differ from Users.

2. **Classify the module**
   - **Master Data** — long-lived entities (Users, Facilities, Assets)
   - **Transactional** — work items / events with lifecycle
   - **Reporting** — read-heavy aggregations (still use the same stack; extend actions only if required)
   - **Utility** — supporting lookups / helpers

3. **Define the canonical frontend model**  
   Fields in `types.ts` that React will consume. Never use spreadsheet header strings as model keys.

4. **Determine the Google Sheet columns**  
   Sheet name + row-1 headers. Document whether headers match the canonical model or require Domain Service mapping.

5. **Identify relationships with existing modules**  
   e.g. Assets → Facilities, Work Orders → Users/Assets. Prefer existing IDs/names already used in the platform.

6. **Produce an implementation plan**  
   List files to create/modify, sheet headers, router registration, mapping rules, and verification commands. Do not invent new layers.

---

# Phase 2 — Backend

Generate under `apps-script/`:

| File | Pattern |
|------|---------|
| `<Module>Repository.gs` | Sheets persistence only |
| `<Module>Service.gs` | Business logic |
| `<Module>Controller.gs` | Action routing |

Mirror Facilities/Assets naming (`FacilityRepository` / `FacilitiesController`, etc.).

### Repository

- Google Sheets only
- `getAll`, `getById`, `create`, `update`, `deactivate`
- Owns sheet name, headers, ID generation, row ↔ object conversion
- Soft-deactivate only — never delete rows
- **No HTTP. No `jsonResponse_`. No ContentService.**

> Per `MODULE_BLUEPRINT.md`: search, filter, and pagination belong in **Service.gs**, not Repository.

### Service

- Business logic
- Validation
- Calculations (when needed)
- Search / filtering / pagination
- Talks only to Repository
- Returns **plain JavaScript objects** only (never `TextOutput` / `ContentService`)

### Controller

- Expose only `handle(action, payload)`
- Support:
  - `getAll`
  - `getById`
  - `create`
  - `update`
  - `deactivate`
- **Always return `jsonResponse_(success, message, data)`** — same helper as UsersController
- Never return raw `{ success, message, data }` if Users uses `jsonResponse_()`
- Never return ContentService objects from Service

---

# Phase 3 — Apps Script Integration

1. Update the Apps Script `doPost` router.
2. Register the module:

```javascript
} else if (resource === "<module>") {
  result = <Modules>Controller.handle(action, payload);
}
```

3. Match the routing key Users already uses (`resource` or `module`).
4. Document required deployment:
   - Paste Repository / Service / Controller into the Apps Script project
   - Create/ensure the Google Sheet with correct headers
   - Save project
   - **Deploy → Manage deployments → New version** (or new deployment)
   - Confirm Web App URL still matches `.env.local` (`APPS_SCRIPT_URL` / `NEXT_PUBLIC_API_URL`)

Unpublished editor code does not affect the live URL. **Never skip deployment.**

Update `apps-script/ROUTER_UPDATE.gs` in-repo to document the new branch. Optionally add `<Module>.sheet.seed.md`.

---

# Phase 4 — Next.js

Generate:

```
src/app/api/<module>/route.ts
src/app/<module>/page.tsx
```

### API route

- Copy `src/app/api/facilities/route.ts` / `src/app/api/assets/route.ts` pattern exactly
- Use shared `postToAppsScript` from `@/services/api/appsScriptProxy`
- Default envelope: `{ resource: "<module>", action: "getAll" }`
- Return JSON + `Cache-Control: no-store`
- On proxy failure: `{ success: false, message, data: null }` with status `502`

### Flow

```
Browser → Next.js API Route → Apps Script
```

**Browser must never communicate directly with Apps Script.**

### ApiClient

Extend the live-proxy branch in `src/services/api/ApiClient.ts`:

```ts
path === "/<module>" → { endpoint: "/api/<module>", resource: "<module>" }
```

Do not invent a second HTTP client.

---

# Phase 5 — Frontend

Generate the module using the **same folder structure as Users / Facilities / Assets**:

```
src/modules/<module>/
  types.ts
  constants.ts
  utils.ts
  index.ts
  services/<Module>Service.ts          # re-export
  hooks/use<Module>.ts
  components/
    <Modules>Page.tsx
    <Modules>Toolbar.tsx
    <Modules>Table.tsx
    <Module>RowActions.tsx
    <Module>FormModal.tsx
    View<Module>Modal.tsx

src/services/<module>/<Module>Service.ts   # canonical domain service
src/app/<module>/page.tsx
```

Also update:

- `src/services/index.ts`
- Types barrel (`src/types/…`) if the platform already re-exports sibling modules that way
- Navigation only if `/<module>` is missing (prefer existing nav entries)

### Layer duties (do not blur)

| Layer | Duty |
|-------|------|
| Domain Service | ApiClient + mapping + contract normalization |
| Hook | loading, search, filters, pagination, reload, deactivate wrappers |
| Components | presentation only — shared UI primitives |
| Page route | render `<Module>Page />` |

Components must not call ApiClient or Apps Script.  
Hooks must not implement HTTP.

---

# Phase 6 — Mapping

**Never expose spreadsheet headers to the UI.**

```
Spreadsheet fields
        ↓
Domain Service mapRemote* / pickField
        ↓
Canonical frontend model (types.ts)
        ↓
Hook → Components → UI
```

Only canonical models reach React.

When live headers differ from the model (as with Facilities and Assets):

- Fix **only** `src/services/<module>/<Module>Service.ts` mapping
- Do not change React components to read `"Asset Name"` etc.
- Do not change Apps Script unless explicitly instructed

---

# Phase 7 — Verification

Automatically produce all of the following in the Completion Report.

### curl command

```bash
curl -sS -X POST 'http://localhost:3000/api/<module>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "resource": "<module>",
    "action": "getAll",
    "payload": { "page": 1, "pageSize": 8 }
  }'
```

Expected: JSON with `"success": true` and paginated `data` per blueprint §13.

### Apps Script deployment checklist

- [ ] Repository / Service / Controller pasted into Apps Script project
- [ ] Sheet exists with correct headers
- [ ] Router branch registered
- [ ] New Web App version deployed
- [ ] Env URL points at the deployed web app

### Browser checklist

- [ ] Page loads
- [ ] Data loads (canonical fields populated)
- [ ] Search works
- [ ] Filters work
- [ ] Pagination works
- [ ] View / Create / Edit / Deactivate work
- [ ] No console errors

### Definition of Done checklist

Copy from `MODULE_BLUEPRINT.md` §16. A module is **never complete** until every item passes.

Until then: **MODULE NOT YET COMPLETE.**  
Only after runtime verification: **MODULE COMPLETE.**

---

# Completion Report

Every generated module must end with this report:

## Files Created

(list)

## Files Modified

(list)

## Apps Script Files

(list)

## Google Sheet Required

- Sheet name
- Header row (exact)

## Router Changes

- Exact `resource` / controller registration snippet

## Deployment Steps

1. …
2. Deploy new Web App version
3. …

## Testing Steps

1. curl command + expected JSON shape
2. Browser checks
3. Mapping check (no blank critical columns)

## Remaining Manual Work

Explicit list. If any item remains: **MODULE NOT YET COMPLETE.**

---

# Rules

1. **Never invent architecture.** Follow `MODULE_BLUEPRINT.md`.
2. **Never skip deployment steps.**
3. **Never skip Apps Script** (Repository + Service + Controller + router).
4. **Never expose spreadsheet headers** to React.
5. **Never modify shared architecture** unless explicitly instructed.
6. **Always compare against Users, Facilities, and Assets** before generating code.
7. **Always finish with Runtime Verification.**
8. Prefer extending existing shared utilities (`appsScriptProxy`, `DataTable`, `Modal`, etc.) over new patterns.
9. Do not duplicate logic that already exists elsewhere when extraction is allowed by the blueprint.
10. Maintain backwards compatibility unless a breaking change is explicitly requested.
11. If a request conflicts with `MODULE_BLUEPRINT.md`, explain the conflict and wait.
12. Soft-deactivate only — never delete sheet rows from standard CRUD.
13. Controllers always use `jsonResponse_()`.
14. A module is **never complete** until runtime verification succeeds.
