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
│  └─ _mixins.scss          ← shared SCSS building blocks (panel, mono-label, stripes,
│                             wanted-photo — the grayscale+fade pair every unowned
│                             photograph uses, on the card, the item page and the cover)
├─ app/
│  ├─ core/                 ← framework-level, no UI
│  │  ├─ models/            ← typed domain model (one file per entity + barrel)
│  │  ├─ api/               ← the VaultApi contract + its HTTP implementation
│  │  ├─ i18n/              ← language service, catalog, dictionaries (see §6)
│  │  ├─ state/             ← signal stores/services (Vault, Theme, Toast, ImageFocus)
│  │  └─ utils/             ← pure functions (unit-tested)
│  ├─ shared/
│  │  ├─ ui/                ← THE component library (see §4)
│  │  └─ pipes/             ← presentation pipes (money, t)
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
   `?g=<groupId>`, the chosen view is `?v=`, the item filters and order are
   `?cond=` / `?own=` / `?sort=` + `?dir=`, settings tabs are `?tab=<id>`,
   entity ids are path params (`/c/:collectionId/items/:itemId`). Route/query
   params bind to component inputs via `withComponentInputBinding()`.
   Navigations within a collection preserve the query string
   (`queryParamsHandling: 'preserve'`).
   **Which items are on screen, and in what order, is URL state** — that is
   what lets an open item rebuild the very list the grid showed and offer its
   neighbours, and what makes coming back from an item restore the filters
   instead of clearing them. Two rules keep it honest. A query string is
   untrusted input, so it is parsed in
   `features/collection/browse-params.ts`, where an unknown condition or a
   sort key nobody declared reads as "no filter" rather than filtering
   everything out. And the list itself is derived only by
   `core/utils/browse.util.ts` (`visibleItems`, `neighbours`) — the grid and
   the item page consuming one function is what stops them from disagreeing
   about who comes next; filtering inline in each would drift the first time a
   filter changed. Links that open a group build their params with
   `groupLinkParams`: merging keeps the filters and the view across a group
   change, and the ad-hoc order is deliberately dropped, because every group
   declares its own and a one-off pick has no business outliving the group it
   was made in. Filters and order navigate with `replaceUrl`, so back means
   "where I came from" rather than undoing six chip toggles.
6. **Lazy routes.** Every routed page is `loadComponent`. Keep the initial
   bundle lean.
7. **Accessibility.** Real `<a>`/`<button>` elements for anything clickable,
   `role`/`aria-*` where semantics need it (`switch`, `tablist`, `progressbar`),
   and a visible `:focus-visible` outline (defined globally). Status is never
   color-only — badges pair color with text. An arrow-key shortcut is an
   addition to a real control, never a replacement: the item page's `←`/`→`
   step between items, but each step is also an anchor with an `href`, and the
   shortcut stands down inside a field that needs the caret and inside the
   photo strip, where the arrows move photos instead. A dead end of a sequence
   renders as a `<span>`, not as a link that takes focus and refuses to go
   anywhere.
8. **Copy and formatting.** No user-facing string is written in a component.
   Every one is a key in `core/i18n/messages/` rendered through the `t` pipe
   or `I18nService.t` (see §6). USD values render through the `money` pipe
   (`$4,200` / `$4.200`), dates through `core/utils/date.util.ts`.
   Micro-headings use `ui-section-label` / the `mono-label` mixin — uppercase
   is applied by CSS, never typed in copy, so translators get sentence case.

## 3. Theming

- A theme is a set of CSS custom properties scoped to
  `[data-theme='<id>']` in `styles/_themes.scss`. The default (Paperwhite)
  is defined on `:root`.
- `ThemeService` (`core/state/theme.service.ts`) owns the active theme:
  applies `data-theme` on `<html>`, persists to `localStorage`, and exposes
  the theme catalog (`ThemeDef` in `core/models/theme.model.ts` — id, name,
  `descriptionKey`, swatches) that drives the Settings cards and topbar menu.
  A theme's *name* is a proper noun and stays untranslated; its description is
  a message key.
- **Adding a theme:** add one block to `_themes.scss` + one `ThemeDef` entry
  in `core/state/themes.ts` + the id to `ThemeId` + a
  `theme.<id>.description` key in both dictionaries. Nothing else.

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
| Chip | `ui-chip` | `selected`, `onPath`, `dashed`, `small`, `count`, `link` (router commands), `queryParams` — content-projected label. Renders a `<button>` by default (attach `(click)` at the usage site); with `link` it renders a real `<a>` instead, because a chip that navigates must survive middle-click and a button nested in an anchor is invalid |
| Card | `ui-card` | `interactive` (hover affordance), `dashed` — the panel surface |
| Badge | `ui-badge` | `tone: 'good' \| 'warn' \| 'accent' \| 'neutral'`; helpers `conditionTone(condition)` for one copy, `itemTone(item)` for an item, `conditionLabelKey(condition)` for its message key, and `itemBadgeLabel(item, t)` for the rendered label ("Wanted", "Mint", "Mint ×3" — uppercased by CSS). The `t` argument is `I18nService.t`: the helper is pure and has no injector |
| Toggle | `ui-toggle` | `on` (model) — rendered as `role="switch"` |
| Tabs | `ui-tabs` | `tabs: TabDef[]`, `active` (model, required) |
| Avatar | `ui-avatar` | `initials` (required), `size: 'sm' \| 'md' \| 'lg'` |
| Avatar stack | `ui-avatar-stack` | `members: Member[]` (shows first 4, overlapped) |
| Progress | `ui-progress` | `pct` (required, 0–100, clamped), `secondaryPct` (a dimmer hatched band drawn behind the fill — owned vs catalogued against one denominator), `size: 'sm' \| 'md'`, `label` (→ `aria-label`), `valueText` (→ `aria-valuetext`, e.g. "12 of 120 owned"). Two shades of one hue is a colour-only distinction, so always print the numbers beside the bar |
| Mosaic | `ui-mosaic` | `tiles: MosaicTile[]` (`{ src, position }`, up to 4), `placeholder`, `dim` — a cover built from several photos, `aria-hidden` because the name belongs to the link wrapping it. Presentational: the page resolves ids through `ImagesApi`/`ImageFocusService`, as with `ui-image-slot` |
| Icon | `ui-icon` | `name: 'home' \| 'grid' \| 'gear' \| 'diamond'` (required), `size`, `strokeWidth` — inline Feather-style SVG |
| Reorder | `ui-reorder` | `label` (names the item for screen readers), `first`, `last`; output `moved(-1 | 1)` — the keyboard half of a drag-to-reorder list, absolutely positioned over a `position: relative` parent |
| Section label | `ui-section-label` | content-projected mono uppercase micro-heading |
| Dropdown | `ui-dropdown` | `width`; project trigger via `[ddTrigger]`, panel via `[ddPanel]`; call `close()` from panel handlers |
| Image slot | `ui-image-slot` | `src`, `focal` (CSS `background-position`), `placeholder`, `reframable`; outputs `fileSelected(File)`, `reframeRequested()` — presentational; pages upload via `ImagesApi` and persist ids on the DTO |
| Image focus | `ui-image-focus` | none — global outlet in the shell, driven by `ImageFocusService`; the focal-point editor (drag or arrow keys, live previews of the surfaces that match the image's `usage`) |
| Toast | `ui-toast` | none — global outlet in the shell, driven by `ToastService.flash()` |
| Money pipe | `\| money` | formats numbers as `$1,234` (`$1.234` in pt-BR). Impure — see §6 |
| Translate pipe | `\| t` | `{{ 'settings.title' \| t }}`, or with placeholders `{{ 'key' \| t: { name } }}`. Impure — see §6 |

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
  `ImageFocusService.uploadAndFrame(file, usage)`, which frames a **local object
  url and only uploads once the user commits** — there is no delete endpoint, so
  uploading first would strand a file every time someone changed their mind. It
  returns the new id, or **`null` if the user discarded**; every call site must
  treat null as "do nothing", or cancelling still replaces the picture.
  `frame(id, usage)` reopens the editor for an image that already exists.
  Discarding and choosing "centred" are deliberately distinct outcomes
  (`FramingResult`): collapsing them is what made a cancelled upload apply
  anyway. **`usage`
  (`'item' | 'banner' | 'icon'`) is required** because it decides which surfaces
  the editor previews: an item photo never appears in a collection banner, so
  previewing that frame would invent a constraint the user doesn't have. A new
  surface adds its ratio to the `SURFACES` map in `ui-image-focus` under the
  usage that renders it.
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
  `copyValue`, `ownedValue`, `paidTotal`, `sortValue`, `unitValue`, `newCopy`,
  `syncWantedTag`). A copy's `value` is `null` when it inherits the item's —
  keep the null, it distinguishes "inherited" from "overridden".
- **An un-estimated item is worth what it cost, and says so.** The estimate
  chain is `copy.value ?? item.value ?? copy.price`: `item.value === 0` is the
  model's only way to say "never estimated", and keeping a market estimate
  current across a whole collection is work nobody does, so most items sit
  there. Reading that as *worth nothing* emptied the collection total and made
  the dashboard's value-vs-paid trend report −100% per un-estimated item. The
  fallback lives in `copyValue` alone, so the card, the table, the item page,
  the group totals and ordering by value can never disagree.
  **The substitution is always visible**: `valueIsPaid`/`copyValueIsPaid` say
  whether a figure is a receipt rather than an estimate, and every surface
  renders through the `itemValue` pipe, which marks it `≈` and turns a genuine
  absence into `—` rather than `$0` — "unknown", not "worthless". Hand the pipe
  the whole `Item` for a per-unit figure so no view can pair the wrong number
  with the wrong marker; the number-plus-flag form is only for totals the
  caller already summed.
- **Groups declare typed fields, their own ordering, and optionally the size of
  the set.** A `GroupNode` carries `fields: GroupField[]`
  (`{ name, type: 'text' | 'number' | 'date' }`),
  `sort: GroupSort | null` (`{ by, direction }`) and `target: number | null`.
  `target` is how many items the complete set has — a 120-issue run, a 24-card
  set — so a group's progress can be measured against the series and not merely
  against what has been catalogued. **Null means "not declared"**, and the
  denominator falls back to the catalogued count; keep the null, and note that
  the field is required-nullable rather than optional precisely because the
  collection is saved as a full-document PUT, where an `undefined` would
  round-trip as a deletion. Every owned/missing/percentage figure comes from
  `core/utils/group-stats.util.ts` — never count items inline, the same way
  `sort.util.ts` owns comparison. `by` is a built-in key
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
  All of that governs a group's *items*. **The groups themselves always list
  alphabetically**, because nothing persists a position for a group the way
  `manual` does for items — the array order is only the order they happened to
  be created in, which tells the reader nothing. `childrenOf()` in
  `core/utils/groups.util.ts` sorts by name through the same numeric- and
  accent-aware collator (exported as `compareNames`), and `flattenTree()` /
  `visibleTree()` build on it, so the sidebar tree, the dashboard cards, the
  item form's group picker and the settings list can never disagree about
  where a group sits. Never sort or list groups inline. The one wrinkle is the
  settings page's inline rename: an alphabetical list would re-sort on every
  keystroke, and moving the focused input in the DOM blurs it, so the page
  freezes the row order for the duration of a rename and releases it on
  `(blurred)`.
- **Which group an item is filed in is inherited from context, and "no group" is
  `''`.** Every "add item" link preserves `?g=`, so `ItemFormPage` takes it as a
  `g` input and a new item lands in the group you were looking at — never in
  whichever group happens to sit first in the array. A group id remembered
  anywhere (that `?g=`, an item's own `groupId`) is narrowed through
  `resolveGroupId()` before it becomes a selection: a blank, the `UNGROUPED_ID`
  bucket sentinel and a group deleted since it was recorded all resolve to `''`,
  so a picker can never show one thing and save another. `UNGROUPED_ID` is a key
  to *read* by — `statsIndex` files unfiled items under it — and never a value to
  store. Being unfiled is a deliberate choice, so it is an option in the picker
  like any other, and saving a new item lands on the group it actually went into
  rather than on the `?g=` you started from.

## 6. Language (i18n)

The app ships **Portuguese (`pt-BR`) and English (`en`)**, switchable at
runtime. Portuguese is the brand's source language — see
[`voice-and-tone.md`](voice-and-tone.md), whose approved product strings are the
pt-BR copy, not a suggestion for it.

**The parts**

| File | What it is |
| --- | --- |
| `core/i18n/messages/en.ts` | The source dictionary. Every key is declared here first |
| `core/i18n/messages/keys.ts` | `MessageKey` = `keyof typeof en`, plus `MessageParams` and `Translate` |
| `core/i18n/messages/pt-BR.ts` | `Record<MessageKey, string>` — a missing or extra key is a **compile error** |
| `core/i18n/langs.ts` | The `LangDef` catalog (id, self-name, `Intl` locale, `Accept-Language` value) |
| `core/i18n/i18n.service.ts` | The signal store — shaped exactly like `ThemeService` |
| `core/i18n/language.interceptor.ts` | Sends `Accept-Language`, so the API answers in the same language |
| `shared/pipes/t.pipe.ts` | `{{ 'key' \| t }}` / `{{ 'key' \| t: { name } }}` |

**Rules**

1. **No user-facing string in a component.** Templates use the `t` pipe; `.ts`
   (toasts, option tables, error maps) uses `I18nService.t`. Both accept only a
   `MessageKey`, so an invented key fails the build.
2. **Label tables are `computed`, never module constants.** A `const TABS = […]`
   captures one language forever. Build them from keys inside a `computed()` so
   they follow a switch.
3. **Never concatenate a translated string.** Word order differs between
   languages: `'Collapse ' + name` becomes
   `'groupTree.collapseGroup' | t: { name }`.
4. **Pure helpers take the translator as an argument.** `core/utils/sort.util.ts`
   and `shared/ui/badge/badge.ts` build labels but have no injector, so they take
   `t: Translate`. Their specs pass a fake `t` that echoes the key back, which
   means the assertions pin *which message* is chosen rather than its English
   wording.
5. **Both translation pipes are `pure: false`, deliberately.** A pure pipe is
   memoized by its arguments — when the language changes, `transform` is handed
   the same key and Angular returns the cached string, freezing every label on
   screen in the old language. The impure version costs one dictionary lookup in
   views that were already being checked. **Do not "optimize" this.**
6. **Plurals are two keys** (`.one` / `.other`) via `I18nService.plural`.
   Portuguese and English agree on one-vs-rest, so ICU machinery would buy
   nothing.
7. **Uppercase is CSS.** Dictionary copy is sentence case; `text-transform`
   does the rest (rule §2.8).

**What is *not* translated** — these are data, not labels:

- Enum wire values (`Mint`/`Good`/`Fair`, `Keep`/`ForTrade`/`ForSale`,
  `Owner`/`Editor`/`Viewer`, `text`/`number`/`date`, `free`/`pro`). They are the
  SQL representation *and* the server-side validator whitelist. Translate them
  at the display layer with a label map.
- The `'wanted'` tag `copies.util.ts` syncs into `item.tags`.
- Proper nouns: the product name "Vault", theme names, plan names.
- Anything a user typed: collection, group, item and custom-field names are
  interpolated, never looked up.

**Preference and formatting**

The language lives in `localStorage['vault.lang']`, exactly like the theme; the
first visit reads `navigator.language` (any `pt-*` → `pt-BR`, everything else →
`en`). Nothing is persisted server-side, so there is no contract change.
`I18nService.locale()` feeds `Intl`: dates through `core/utils/date.util.ts`
(which parses date-only ISO strings as *local* midnight — `new Date('2026-08-13')`
is UTC and would show the previous day in Brazil), amounts through
`core/utils/money.util.ts`. **The `$` never changes**: the figures are USD, and
relabelling them `R$` would restate the same number as a different amount.
`sort.util.ts`'s collator stays locale-agnostic on purpose — `sensitivity: 'base'`
already folds accents, and pt/en share the Latin order.

**Adding a language:** one `LangDef` in `langs.ts`, one `Lang` union member, one
`messages/<id>.ts` typed `Record<MessageKey, string>`, one culture in
`LocalizationOptions()` in the backend's `Program.cs`, and a
`Messages.<culture>.resx` beside it.

**The backend is localized too.** `Accept-Language` drives
`UseRequestLocalization`, and validation failures and ProblemDetails come back
translated from `Vault.Application/Resources/Messages.resx`. That middleware is
registered **before** `UseExceptionHandler` — the handler builds its title while
an exception unwinds, so the culture has to still be in scope. `LocalizationTests`
fails if anyone reorders it.

## 7. Testing & verification

- Pure logic (e.g. `core/utils/groups.util.ts`) gets Vitest specs next to the
  source (`*.spec.ts`). Run with `npm test`.
- A spec that asserts on user-facing text must pin the language
  (`TestBed.inject(I18nService).apply('en')`) rather than relying on whatever
  the runner's `navigator.language` happens to be.
- Before merging UI work: `npm run build` must pass with zero errors and the
  affected flows must be exercised in the browser (`npm start`), including at
  least one dark theme — token regressions usually only show up there, and
  **in Portuguese**, which runs ~20% longer than English and is where text
  overflow shows up first.
- Bundle budgets are enforced in `angular.json` (initial ≤ 500 kB warning,
  component styles ≤ 6 kB warning).

## 8. Known deliberate deviations from the design file

| Where | Design file | Implementation | Why |
| --- | --- | --- | --- |
| Store card, already added | Clickable button that toasts "Already in your vault" | Disabled "✓ In your vault" button | Disabled state is clearer and prevents a no-op action |
| Sidebar footer | `● synced · v0.1 prototype` | `● synced · v0.1 mock API` | Reflects reality |
| Item delete / Export JSON | Decorative in the design | Fully wired | The app is functional, not a mockup |
| Backup count | Hardcoded "25 items" | Computed live | Same |

## 9. Brand governance (unresolved)

The app currently ships the *Collection Control* design's own "Vault" visual
language (indigo accent `#5453C4`, 7 themes). The Colecionary brand manual
([`design-tokens.md`](design-tokens.md), [`design-system.md`](design-system.md))
defines a different palette (Vault Purple `#7C5CFF`, Colecionary Night
`#101827`, dark-first). Reconciling the two requires a formal identity review;
mechanically it is a one-file change in `styles/_themes.scss`.
