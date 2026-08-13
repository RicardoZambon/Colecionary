# Frontend Standards — Vault (Collection Control)

Canonical reference for how the Angular frontend in [`frontend/`](../frontend)
is built and how it must evolve. If a change conflicts with this document,
either the change is wrong or this document must be updated in the same PR.

- **Stack:** Angular 21 · TypeScript (strict) · SCSS · Vitest
- **Design source of truth:** claude.ai/design project *Collection Control*
  (`27631083-1c42-43e2-8868-174dd8aa138b`), mirrored 1:1 by the reference
  prototype in [`prototype/`](../prototype)

---

## 1. Architecture

```
frontend/src/
├─ styles/
│  ├─ _themes.scss          ← ALL design tokens (7 themes, CSS custom properties)
│  └─ _mixins.scss          ← shared SCSS building blocks (panel, mono-label, stripes…)
├─ app/
│  ├─ core/                 ← framework-level, no UI
│  │  ├─ models/            ← typed domain model (one file per entity + barrel)
│  │  ├─ api/               ← backend contract + mock implementation + seed data
│  │  ├─ state/             ← signal stores/services (Vault, Theme, Toast, ImageFocus)
│  │  └─ utils/             ← pure functions (unit-tested)
│  ├─ shared/
│  │  ├─ ui/                ← THE component library (see §4)
│  │  └─ pipes/             ← presentation pipes (money)
│  ├─ layout/               ← shell, topbar, sidebar
│  ├─ features/             ← routed pages, lazy-loaded, one folder per feature
│  ├─ app.routes.ts
│  └─ app.config.ts         ← DI wiring (VaultApi provider lives here)
```

**Dependency direction:** `features → shared → core`. `core` imports nothing
from `shared` or `features`. `shared/ui` components never talk to the API or
stores directly (exception: `ui-image-focus`/`ui-toast`, which exist to render
a core service's state).

## 2. Non-negotiable rules

1. **Design tokens only.** Every color, font, radius, border width, and shadow
   comes from the CSS custom properties in `styles/_themes.scss`
   (`--bg`, `--panel`, `--accent`, `--radius`, `--font-display`, …).
   Components and pages never hardcode visual values. A new theme or a
   rebrand touches exactly one file.
2. **One source of truth for elements.** Interactive elements (buttons,
   inputs, selects, chips, toggles, tabs, …) are always the `shared/ui`
   components — never restyled raw HTML in a page. If a page needs a variant
   that doesn't exist, add the variant to the component (new `input()`),
   don't fork the styling locally. One-off *non-reusable* inline editors
   (e.g. the "new group" pill input) may be page-local but must still consume
   tokens.
3. **All data goes through `VaultApi`** (`core/api/vault-api.ts`), an abstract
   class used as the DI token. Pages/stores never know whether the backend is
   mocked. See §5.
4. **Signals everywhere.** The app is zoneless. State lives in signal stores
   (`core/state`); components are `changeDetection: OnPush`, expose
   `computed()` view models, and use `input()` / `model()` / `output()`.
   No `Zone.js`-dependent patterns, no manual `detectChanges`.
5. **URL is state.** Anything the user would want restored on refresh,
   back-navigation, or a shared link lives in the route: selected group is
   `?g=<groupId>`, settings tabs are `?tab=<id>`, entity ids are path params
   (`/c/:collectionId/items/:itemId`). Route/query params bind to component
   inputs via `withComponentInputBinding()`. Navigations within a collection
   preserve `?g=` (`queryParamsHandling: 'preserve'`).
6. **Lazy routes.** Every routed page is `loadComponent`. Keep the initial
   bundle lean.
7. **Accessibility.** Real `<a>`/`<button>` elements for anything clickable,
   `role`/`aria-*` where semantics need it (`switch`, `tablist`, `progressbar`),
   and a visible `:focus-visible` outline (defined globally). Status is never
   color-only — badges pair color with text.
8. **Copy and formatting.** USD values render through the `money` pipe
   (`$4,200`). Micro-headings use `ui-section-label` / the `mono-label` mixin
   (uppercase is applied by CSS, not typed in copy).

## 3. Theming

- A theme is a set of CSS custom properties scoped to
  `[data-theme='<id>']` in `styles/_themes.scss`. The default (Paperwhite)
  is defined on `:root`.
- `ThemeService` (`core/state/theme.service.ts`) owns the active theme:
  applies `data-theme` on `<html>`, persists to `localStorage`, and exposes
  the theme catalog (`ThemeDef` in `core/models/theme.model.ts` — id, name,
  description, swatches) that drives the Settings cards and topbar menu.
- **Adding a theme:** add one block to `_themes.scss` + one `ThemeDef` entry
  in `core/api/seed-data.ts` + the id to `ThemeId`. Nothing else.

Current themes: `devlight` (Paperwhite, default), `devdark` (Graphite),
`terminal` (Phosphor), `arcade` (Arcade), `hud` (Starship), `paper` (Zine),
`synth` (Synthwave).

## 4. Component library (`shared/ui`)

Standalone, `OnPush`, single-file components with inline templates/styles.
Selectors are prefixed `ui-`; layout/page components use `app-`.
All are exported from `shared/ui/index.ts`.

| Component | Selector | API (inputs / models / outputs) |
| --- | --- | --- |
| Button | `ui-button` | `variant: 'primary' \| 'ghost' \| 'danger'`, `size: 'md' \| 'sm'`, `block`, `disabled`, `type`, `ariaLabel` (required when the label is a bare glyph; also becomes the tooltip) — content-projected label |
| Field | `ui-field` | `label` (required) — wraps any control with the mono uppercase label |
| Text input | `ui-text-input` | `value` (model), `placeholder`, `type`, `variant: 'panel' \| 'subtle'`; outputs `keydown`, `blurred` |
| Textarea | `ui-textarea` | `value` (model), `rows`, `placeholder` |
| Select | `ui-select` | `value` (model), `options: SelectOption[]`, `disabled`; add class `compact` for dense rows |
| Chip | `ui-chip` | `selected`, `onPath`, `dashed`, `small`, `count` — content-projected label; attach `(click)` at usage site |
| Card | `ui-card` | `interactive` (hover affordance), `dashed` — the panel surface |
| Badge | `ui-badge` | `tone: 'good' \| 'warn' \| 'accent' \| 'neutral'`; helpers `conditionTone(condition)` for one copy, `itemTone(item)` / `itemBadgeLabel(item)` for an item ("WANTED", "MINT", "MINT ×3") |
| Toggle | `ui-toggle` | `on` (model) — rendered as `role="switch"` |
| Tabs | `ui-tabs` | `tabs: TabDef[]`, `active` (model, required) |
| Avatar | `ui-avatar` | `initials` (required), `size: 'sm' \| 'md' \| 'lg'` |
| Avatar stack | `ui-avatar-stack` | `members: Member[]` (shows first 4, overlapped) |
| Progress | `ui-progress` | `pct` (required, 0–100) |
| Reorder | `ui-reorder` | `label` (names the item for screen readers), `first`, `last`; output `moved(-1 | 1)` — the keyboard half of a drag-to-reorder list, absolutely positioned over a `position: relative` parent |
| Section label | `ui-section-label` | content-projected mono uppercase micro-heading |
| Dropdown | `ui-dropdown` | `width`; project trigger via `[ddTrigger]`, panel via `[ddPanel]`; call `close()` from panel handlers |
| Image slot | `ui-image-slot` | `src`, `focal` (CSS `background-position`), `placeholder`, `reframable`; outputs `fileSelected(File)`, `reframeRequested()` — presentational; pages upload via `ImagesApi` and persist ids on the DTO |
| Image focus | `ui-image-focus` | none — global outlet in the shell, driven by `ImageFocusService`; the focal-point editor (drag or arrow keys, live previews of every surface) |
| Toast | `ui-toast` | none — global outlet in the shell, driven by `ToastService.flash()` |
| Money pipe | `\| money` | formats numbers as `$1,234` |

**Adding a component:** put it in `shared/ui/<name>/<name>.ts`, consume tokens
only, export it from the barrel, and document it in this table. If two pages
style the same raw element the same way, that's the signal to promote it here.

## 5. Data layer

- `VaultApi` (abstract class = DI token) defines the full backend contract:
  collections CRUD, item upsert/delete, store listings + import, tenant
  members, profile. All methods return `Observable`s.
- **`HttpVaultApi` is the only implementation** (wired in `app.config.ts`),
  talking to the .NET API in `backend/` (`environment.apiBaseUrl`). It unwraps
  ProblemDetails errors into plain `Error`s so toast paths keep working.
  There is no mocked data in the frontend — demo data lives in the backend
  seeder (`backend/src/Vault.Infrastructure/Persistence/Seeding/`).
- **Images** go through `ImagesApi` (`core/api/images-api.ts`): authenticated
  multipart upload returning an id; reads are plain `<img>`-compatible URLs
  (`/api/images/{id}`). `ui-image-slot` is presentational — it renders `src`
  and emits the picked file; pages own upload + persistence (photo ids travel
  on the item/collection DTOs).
- **Framing is a focal point, never a crop.** Every surface renders images with
  `background-size: cover`, so *which* part shows is decided by one property:
  `background-position`. An image carries `focal: {x, y}` (0–1, on the image row
  — framing is a property of the photograph, so one adjustment fixes the card,
  the gallery and the banner at once). `ImageFocusService`
  (`core/state/image-focus.service.ts`) loads every focal point once at startup
  and exposes `position(id)`; pages bind that, and never compute a percentage
  inline — `core/utils/focal.util.ts` owns the conversion (`focalToPosition`,
  `clampFocal`, `focalFromPoint`), the same way `sort.util.ts` owns comparison.
  **Null means "never framed"** and renders centred; keep the null, it is what
  distinguishes an untouched image from one deliberately centred. The bytes are
  never modified, so an image id — and its `immutable`-cached URL — stays valid
  after reframing, and the edit is reversible. Uploads go through
  `ImageFocusService.uploadAndFrame(file)`, which offers the editor once and is
  skippable; `frame(id)` reopens it later.
- **Export** goes through `ExportApi` (`core/api/export-api.ts`), which fetches
  `/api/export` as a `Blob` and hands it to a download anchor. Like `ImagesApi`
  it sits beside `VaultApi` rather than on it, because it deals in a binary
  payload rather than the DTO graph the abstract contract describes. The archive
  is assembled by the backend — image bytes aren't reachable from the browser as
  data, so a client-built export could only ever omit the pictures.
- **Auth** (`core/auth/`): `AuthService` (signal store; JWT session in
  `localStorage('vault.auth')`), a functional interceptor that attaches the
  bearer token and logs out on mid-session 401s, and `authGuard` protecting
  every routed page except `/login`.
- `VaultStore` (`core/state/vault.store.ts`) is the single client-side state
  holder: private writable signals, public `asReadonly()` views, `computed()`
  aggregates, and async mutation methods that call the API first and update
  local state from the response.
- **Items own their copies, and ownership is derived.** An `Item` is the
  catalogue entry (name, year, photos, `value` = per-unit reference estimate)
  and carries `copies: ItemCopy[]`; each copy has its own `condition`, `price`
  paid, optional `value` override, `acquiredOn`, `status`
  (`Keep`/`ForTrade`/`ForSale`) and `notes`. There is **no `owned` flag and no
  item-level `condition`/`price`** — an item with at least one copy is owned,
  one with none is on the wantlist. Never re-derive that inline: use the pure
  helpers in `core/utils/copies.util.ts` (`isOwned`, `bestCondition`,
  `copyValue`, `ownedValue`, `paidTotal`, `sortValue`, `newCopy`,
  `syncWantedTag`). A copy's `value` is `null` when it inherits the item's —
  keep the null, it distinguishes "inherited" from "overridden".
- **Groups declare typed fields and their own ordering.** A `GroupNode` carries
  `fields: GroupField[]` (`{ name, type: 'text' | 'number' | 'date' }`) and
  `sort: GroupSort | null` (`{ by, direction }`). `by` is a built-in key
  (`manual`, `added`, `name`, `value`, `year`) or `field:<field name>`; `null`
  means "inherit". Values still live on the item as `custom: CustomFieldValue[]`
  strings — the type belongs to the declaration, not the value, so retyping a
  field never rewrites item data. Both are inherited down the tree, with
  different rules: `fieldsFor()` merges every ancestor's fields (a redeclared
  name overrides the type, keeping the ancestor's position) while `sortFor()`
  takes only the nearest ancestor that sets one. Never compare items inline —
  `core/utils/sort.util.ts` owns it (`sortItems`, `sortChoices`, `sortLabel`,
  `applyManualOrder`, `moveInList`). Text fields compare through a numeric-aware
  `Intl.Collator`, so `1 · 2 · 10 · 12A` orders correctly even when the field is
  free text, and items with no value always sink to the bottom in either
  direction. `manual` ordering is simply the array order of `collection.items`,
  which the API persists by index — there is no `sortOrder` on the item DTO.

## 6. Testing & verification

- Pure logic (e.g. `core/utils/groups.util.ts`) gets Vitest specs next to the
  source (`*.spec.ts`). Run with `npm test`.
- Before merging UI work: `npm run build` must pass with zero errors and the
  affected flows must be exercised in the browser (`npm start`), including at
  least one dark theme — token regressions usually only show up there.
- Bundle budgets are enforced in `angular.json` (initial ≤ 500 kB warning,
  component styles ≤ 6 kB warning).

## 7. Known deliberate deviations from the design file

| Where | Design file | Implementation | Why |
| --- | --- | --- | --- |
| Store card, already added | Clickable button that toasts "Already in your vault" | Disabled "✓ In your vault" button | Disabled state is clearer and prevents a no-op action |
| Sidebar footer | `● synced · v0.1 prototype` | `● synced · v0.1 mock API` | Reflects reality |
| Item delete / Export JSON | Decorative in the design | Fully wired | The app is functional, not a mockup |
| Backup count | Hardcoded "25 items" | Computed live | Same |

## 8. Brand governance (unresolved)

The app currently ships the *Collection Control* design's own "Vault" visual
language (indigo accent `#5453C4`, 7 themes). The Colecionary brand manual
([`design-tokens.md`](design-tokens.md), [`design-system.md`](design-system.md))
defines a different palette (Vault Purple `#7C5CFF`, Colecionary Night
`#101827`, dark-first). Reconciling the two requires a formal identity review;
mechanically it is a one-file change in `styles/_themes.scss`.
