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
│  │  ├─ state/             ← signal stores/services (Vault, Theme, Toast, ImageSlot)
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
stores directly (exception: `ui-image-slot`/`ui-toast`, which exist to render
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
| Button | `ui-button` | `variant: 'primary' \| 'ghost' \| 'danger'`, `size: 'md' \| 'sm'`, `block`, `disabled`, `type` — content-projected label |
| Field | `ui-field` | `label` (required) — wraps any control with the mono uppercase label |
| Text input | `ui-text-input` | `value` (model), `placeholder`, `type`, `variant: 'panel' \| 'subtle'`; outputs `keydown`, `blurred` |
| Textarea | `ui-textarea` | `value` (model), `rows`, `placeholder` |
| Select | `ui-select` | `value` (model), `options: SelectOption[]`, `disabled`; add class `compact` for dense rows |
| Chip | `ui-chip` | `selected`, `onPath`, `dashed`, `small`, `count` — content-projected label; attach `(click)` at usage site |
| Card | `ui-card` | `interactive` (hover affordance), `dashed` — the panel surface |
| Badge | `ui-badge` | `tone: 'good' \| 'warn' \| 'accent' \| 'neutral'`; helpers `conditionTone()` / `conditionLabel()` map item state → badge |
| Toggle | `ui-toggle` | `on` (model) — rendered as `role="switch"` |
| Tabs | `ui-tabs` | `tabs: TabDef[]`, `active` (model, required) |
| Avatar | `ui-avatar` | `initials` (required), `size: 'sm' \| 'md' \| 'lg'` |
| Avatar stack | `ui-avatar-stack` | `members: Member[]` (shows first 4, overlapped) |
| Progress | `ui-progress` | `pct` (required, 0–100) |
| Section label | `ui-section-label` | content-projected mono uppercase micro-heading |
| Dropdown | `ui-dropdown` | `width`; project trigger via `[ddTrigger]`, panel via `[ddPanel]`; call `close()` from panel handlers |
| Image slot | `ui-image-slot` | `slotId` (required), `placeholder` — click/drop to fill, persists via `ImageSlotService` |
| Toast | `ui-toast` | none — global outlet in the shell, driven by `ToastService.flash()` |
| Money pipe | `\| money` | formats numbers as `$1,234` |

**Adding a component:** put it in `shared/ui/<name>/<name>.ts`, consume tokens
only, export it from the barrel, and document it in this table. If two pages
style the same raw element the same way, that's the signal to promote it here.

## 5. Data layer — mocked now, backend-ready

- `VaultApi` (abstract class = DI token) defines the full backend contract:
  collections CRUD, item upsert/delete, store listings + import, tenant
  members, profile. All methods return `Observable`s.
- `MockVaultApi` implements it with seed data (`core/api/seed-data.ts`),
  ~120 ms simulated latency, deep-copied responses (no shared references with
  "server" state), and `localStorage` persistence.
- The provider is wired in `app.config.ts`:
  ```ts
  { provide: VaultApi, useExisting: MockVaultApi }
  ```
  **Connecting the real .NET backend** = implement `HttpVaultApi` against the
  same contract and change this one line. No store, page, or component
  changes.
- `VaultStore` (`core/state/vault.store.ts`) is the single client-side state
  holder: private writable signals, public `asReadonly()` views, `computed()`
  aggregates, and async mutation methods that call the API first and update
  local state from the response.

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
