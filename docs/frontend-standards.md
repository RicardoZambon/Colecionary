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
   `?cond=` / `?own=` / `?sort=` + `?dir=`, the open section is `?s=`,
   settings tabs are `?tab=<id>`,
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

   **Two things are deliberately *not* URL state, and both need the
   justification written down or a later reader will "fix" them.** A row
   **selection** is a signal on `CollectionPage`: forty ids in a query string is
   hostile, filter navigations use `replaceUrl` and would trample it, and a
   shared link that opens with forty rows marked in front of a destructive bar
   is a hazard rather than a restored state. **Column visibility** is a
   `localStorage` preference (`column-prefs.ts`, keyed per collection *and*
   group, storing the *hidden* names so a field declared later is visible by
   default): which of eight columns you hid is not something a shared link
   should carry, and no other screen needs it to rebuild the list. The test for
   the exception is always the same — *would the person you send this link to
   want this?*
6. **Lazy routes.** Every routed page is `loadComponent`. Keep the initial
   bundle lean. A route guard that must be referenced eagerly (the item form's
   `unsavedItemGuard`) lives in its own module and is structurally typed, so
   naming it in `app.routes.ts` does not drag the page it guards into the
   initial bundle.
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
   or `I18nService.t` (see §6). Amounts render through the `money` pipe
   (`$4,200.00` / `US$ 4.200,00`), dates through `core/utils/date.util.ts`.
   Micro-headings use `ui-section-label` / the `mono-label` mixin — uppercase
   is applied by CSS, never typed in copy, so translators get sentence case.

9. **A destructive act asks, and an undo is worth more than the question.**
   Deletion goes through `ConfirmService.ask()`, with the count or the name in
   the body and the outcome in the button ("Delete 12 items", not "Delete").
   The dialog can stay one sentence long *because* the act is reversible — so
   build the undo, and be honest about its two limits: a restore is
   version-guarded, so if someone else saved the collection in between the write
   is refused and the item **stays deleted** (say so, in an error toast — "try
   again" does not bring an item back); and manual order is the array index, so
   a restored item lands at the end of its group. Never claim an undo that does
   not exist: where there is none — the group-deletion dialog — the dialog says
   so and offers the export first.

10. **No HTTP failure is silent.** `errorInterceptor` is the single reporter,
    producing one localized sentence per class of failure and preferring the
    server's own `ProblemDetails` (already translated via `Accept-Language`).
    It retries **idempotent GETs only**, twice, with a short backoff — a PUT
    that timed out may have been applied. 401 belongs to auth and 412 to
    `ConflictService`; a page's own `catch` adds meaning, never a second copy of
    the same sentence. A failure the app *expects* opts out with the
    `SILENT_FAILURE` context token — `/api/setup/status` 404s by design on a
    configured host, and reporting it greeted every user with a red toast in
    front of a working app.

11. **A store write rethrows; it never swallows.** One voice for HTTP failures
    (the interceptor), and only the caller knows whether to keep the form, stay
    put, or put a control back. `VaultStore` also exposes `loadError` and
    `retryLoad()`: a boot failure that is not a 401 used to leave the word
    "Loading…" on screen for ever, because the shell discarded the error and
    gated the outlet on `loaded()`.

12. **A bulk write is one full-document PUT.** Never N `upsertItem` calls: each
    one bumps the collection version, so N writes are N strictly sequential
    round-trips where a failure at item 7 of 40 is unrecoverable and a competing
    writer refuses the remainder with a 412 the user cannot map onto "which 22
    of my 40 got through". Bulk delete is the same PUT with the items filtered
    out, because `DELETE /items/{id}` carries no precondition — right for one
    deliberate deletion, wrong for a sweep of forty. A bulk apply **keeps**
    custom fields the destination group does not declare: the single-item form
    drops them in front of a user who can see that item's whole field set, and
    doing the same across forty destroys data nobody was shown.

13. **A control that cannot tell the truth does not ship.** A switch that
    persists nothing must not look like a setting, and a button that cannot
    perform a transaction must not look like it can. Two shipped surfaces broke
    this — three tenant "access policy" toggles that were a component signal,
    and a plan button that let the client set its own `plan` to `pro` with no
    payment, entitlement or audit. Both are gone; the plan tiers remain as
    information with the unavailable action explicitly disabled.

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
- **Two greys, and two accent tiers.** `--muted` is *decoration* and is below
  AA on purpose. `--muted-strong` is the secondary type layer — every label,
  count, micro-heading, breadcrumb and placeholder. Likewise `--accent` and
  `--accent2` are **fills** (a bar, a button ground — a 3:1 job), while
  `--accent-strong` and `--accent2-strong` are the same hues tuned for **type**.
  Where a theme's accent already clears 4.5:1 as text, the `-strong` value *is*
  the accent, so there is no shadow palette to keep in sync.

  This split exists because `--muted` used to carry the whole secondary type
  layer at 2.4–4.4:1 depending on theme and surface, and three of the seven
  accents fail 4.5:1 as text while passing as fills. Raising `--muted` would
  have fixed the contrast and destroyed the distinction between text that
  informs and text that decorates.
- **`--danger` is not `--warn`.** `--danger` is destruction and error;
  `--warn` is a warning. They were one token, which is why "Delete collection"
  and a Fair-condition badge rendered in the same colour — a colour that marks
  two unrelated things marks neither.
- **Structural tokens do not vary by theme.** Spacing (`--sp-1`…`--sp-12`),
  type (`--fs-xs`…`--fs-xl`), motion (`--dur-fast/mid/slow`, `--ease-out`,
  `--ease-in-out`), layering (`--z-sticky/dropdown/overlay/modal/toast/notice`)
  and focus (`--focus-width`, `--focus-offset`) live in their own structural
  `:root`. A theme changes what the app looks like; it does not change how far
  apart two things sit or which one is on top.
- **Adding a theme:** add one block to `_themes.scss` + one `ThemeDef` entry
  in `core/state/themes.ts` + the id to `ThemeId` + a
  `theme.<id>.description` key in both dictionaries. The block must define
  `--muted-strong`, `--accent-strong`, `--accent2-strong` and `--danger`, each
  **derived against that theme's own `--bg`, `--panel` and `--panel2`** — never
  copied from another palette. In a dark theme `--panel2` is the *lightest*
  surface, which is where a label actually fails, so all three are checked.
  `src/styles/themes.spec.ts` parses the shipped `.scss` (never a copy) and
  refuses the palette below 4.5:1, so an eighth theme cannot quietly regress
  the seven. Also add the id to the allowlist in `src/index.html` — see
  *First paint* below.

Current themes: `devlight` (Paperwhite, default), `devdark` (Graphite),
`terminal` (Phosphor), `arcade` (Arcade), `hud` (Starship), `paper` (Zine),
`synth` (Synthwave).

## 3b. Responsive layout, breakpoints and targets

The app was desktop-only: four `@media` rules across twenty-three stylesheets,
at four uncoordinated widths, and a document that overflowed a 390px viewport
by up to 107px on **every** screen because the sidebar was a hardcoded 226px
column with no breakpoint at all. These rules are what stop that recurring.

- **Breakpoints live only in `styles/_mixins.scss`** — `$bp-sm: 560px`,
  `$bp-md: 768px`, `$bp-lg: 900px`, `$bp-xl: 1200px` — and are used through
  `upto($bp)` / `from($bp)`. Never write a pixel value in a media query. A
  media query cannot read a CSS custom property, which is exactly why these are
  SCSS variables and exactly why four files had each copied a different number.
- **Grids state a minimum, never a count.** `repeat(auto-fit, minmax(Xpx, 1fr))`
  where tiles should stretch to fill; `auto-fill` where a card should stay
  card-sized. `repeat(4, 1fr)` is a 48px column at 390px, which renders a stat
  label clipped mid-word. Add `grid-auto-rows: 1fr` where cards in a row must
  match height.
- **`$bp-lg` is where the sidebar stops being a column.** `LayoutService`
  (`core/state/layout.service.ts`) owns `navOpen` — transient, never persisted,
  because an open drawer is a gesture and not a preference, and closed on
  `NavigationEnd` — and `compact`, a `matchMedia` mirror of `$bp-lg`. The
  duplicated constant is deliberate and documented: CSS cannot tell script that
  a hidden drawer must also leave the accessibility tree and the tab order.
- **The drawer is `position: fixed`, not `absolute`.** A translated absolute box
  still counts toward document overflow — that was the original 280px of
  sideways scroll. Closed, below the breakpoint, it is `aria-hidden` **and**
  `inert`; otherwise it is a dozen invisible tab stops.
- **The drawer's focus contract:** opening focuses the first nav item; Escape,
  the scrim and the ✕ all close it and return focus to the toggle (`NAV_TOGGLE_ID`
  in `layout/nav-focus.ts`). Following a link closes it without moving focus.
- **`--tap: 44px`** lives in `styles.scss`, not `_themes.scss` — a target is
  44px in every theme. Below `$bp-lg` nothing interactive may render smaller;
  square controls need the width too. Where the visual box must *not* grow (a
  chip in a dense filter row, a selection checkbox in a table, the reframe pip
  that sits on the photograph it edits), grow the **target** with an absolutely
  positioned `::after`. The reframe pip owes 44px at every width.
- **A cross-cutting rule that must outrank component styles needs extra
  class-level specificity.** Angular injects component styles into `<head>`
  *after* `styles.scss`, and `.btn[_ngcontent-…]` is two class-level selectors,
  so a single-class global rule loses on source order — silently. Hence the
  doubled `.btn.btn` and the tripled `:focus-visible` in `styles.scss`. Prefer
  putting the property on the component when you own it.
- **The focus ring has a positive offset.** It was `outline-offset: -1px`, which
  draws the ring *inside* the element, so on every accent-backed surface — the
  active nav item, every primary button, a selected chip — it was
  accent-on-accent and invisible. Positive offset plus a ground-coloured halo
  filling the gap.
- **First paint.** `src/index.html` carries a small dependency-free inline
  script that sets `data-theme` and `lang` from `localStorage` **before** the
  bundle; without it every cold load flashed white and English, because those
  attributes were hardcoded and the real values only arrived from an Angular
  `effect()`. The stored values are user-writable and land in an attribute
  selector, so they are validated against an **allowlist**, never interpolated.
  A value missing from that list costs a flash, not a broken page — so a new
  theme or language must be added there too.

## 3c. Motion

Five uses, and no more: card lift, press, chip transition, drawer slide (with
its scrim fade), skip-link reveal.

- `transform` and `opacity` only. Durations and easing come from `--dur-*` and
  `--ease-*`.
- Everything goes inside the `motion-safe` mixin
  (`prefers-reduced-motion: no-preference`).
- **`:active` is functional, not decoration.** Hover does not exist on touch; a
  control that does not visibly take the press reads as broken and gets tapped
  twice. The app shipped 25 `:hover` rules and **zero** `:active`.
- An animation the user waits for is a bug. This is a data tool.

## 4. Component library (`shared/ui`)

Standalone, `OnPush`, single-file components with inline templates/styles.
Selectors are prefixed `ui-`; layout/page components use `app-`.
All are exported from `shared/ui/index.ts`.

| Component | Selector | API (inputs / models / outputs) |
| --- | --- | --- |
| Button | `ui-button` | `variant: 'primary' \| 'ghost' \| 'danger' \| 'link' \| 'icon'`, `size: 'md' \| 'sm'`, `block`, `disabled`, `muted`, `type`, `ariaLabel` (required when the label is a bare glyph; also becomes the tooltip), `ariaExpanded`/`ariaControls`/`controlId` for a button that discloses something — these land on the **inner** `<button>`, because the `<ui-button>` host is neither focusable nor announced, so an attribute placed there is never reached — content-projected label. `link` is a text action inside a dense row, `icon` a bare glyph (the ✕ that removes a copy, a field, a member). `muted` reads as unavailable but still fires: `disabled` would be the obvious choice and is the wrong one, because a dead control cannot say *why* it is dead — removing the tenant's owner has an explanation the click is what surfaces. An action that navigates stays a real `<a>`; see the `a.link` note in `collection-settings-page.scss` |
| Field | `ui-field` | `label` (required) — wraps any control with the mono uppercase label |
| Text input | `ui-text-input` | `value` (model), `placeholder`, `type`, `variant: 'panel' \| 'subtle'`, `ariaLabel`; outputs `keydown`, `blurred` |
| Textarea | `ui-textarea` | `value` (model), `rows`, `placeholder` |
| Select | `ui-select` | `value` (model), `options: SelectOption[]`, `disabled`, `ariaLabel`; add class `compact` for dense rows |
| Chip | `ui-chip` | `selected`, `onPath`, `dashed`, `small`, `count`, `link` (router commands), `queryParams` — content-projected label. Renders a `<button>` by default (attach `(click)` at the usage site); with `link` it renders a real `<a>` instead, because a chip that navigates must survive middle-click and a button nested in an anchor is invalid |
| Card | `ui-card` | `interactive` (hover affordance), `dashed` — the panel surface |
| Badge | `ui-badge` | `tone: 'good' \| 'warn' \| 'accent' \| 'neutral'`; helpers `conditionTone(condition)` for one copy, `itemTone(item)` for an item, `conditionLabelKey(condition)` for its message key, and `itemBadgeLabel(item, t)` for the rendered label ("Wanted", "Mint", "Mint ×3" — uppercased by CSS). The `t` argument is `I18nService.t`: the helper is pure and has no injector |
| Toggle | `ui-toggle` | `on` (model), `ariaLabel` — rendered as `role="switch"`. A switch turns something on. **Never use it to select a row** — that is `ui-checkbox`, and assistive technology announces the two differently |
| Checkbox | `ui-checkbox` | `checked` (model), `indeterminate`, `disabled`, `ariaLabel`; output `picked({ checked, shift })`. A real `<input type="checkbox">`, not a styled button, because only the platform gives you the `indeterminate` dash a tri-state "select all" needs — plus the role, the checked state and space-bar activation for free. `picked` carries the modifier keys so a list can implement shift-click ranges without reading the event; shift+**Space** is the keyboard equivalent, since the platform dispatches a real click carrying `shiftKey`. Below `$bp-lg` it grows a 44px target through a centred pseudo-element rather than by growing the 15px box, which a dense table row depends on |
| Tabs | `ui-tabs` | `tabs: TabDef[]`, `active` (model, required) |
| Avatar | `ui-avatar` | `initials` (required), `size: 'sm' \| 'md' \| 'lg'` |
| Avatar stack | `ui-avatar-stack` | `members: Member[]` (shows first 4, overlapped) |
| Progress | `ui-progress` | `pct` (required, 0–100, clamped), `secondaryPct` (a dimmer hatched band drawn behind the fill — owned vs catalogued against one denominator), `size: 'sm' \| 'md'`, `label` (→ `aria-label`), `valueText` (→ `aria-valuetext`, e.g. "12 of 120 owned"). Two shades of one hue is a colour-only distinction, so always print the numbers beside the bar |
| Mosaic | `ui-mosaic` | `tiles: MosaicTile[]` (`{ src, position }`, up to 4), `placeholder`, `dim` — a cover built from several photos, `aria-hidden` because the name belongs to the link wrapping it. Presentational: the page resolves ids through `ImagesApi`/`ImageFocusService`, as with `ui-image-slot` |
| Icon | `ui-icon` | `name` (required, one of `ICON_NAMES`), `size`, `strokeWidth`, optional `label`. Inline Feather-style SVG. With `label` it is `role="img"` + `aria-label`; without, `aria-hidden="true"` — so an icon beside its own text label never double-announces. **A raw Unicode glyph is not an icon**: add a name to `ICON_NAMES` instead. The set was four names, which is exactly why the app had accumulated `⌖ ⚙ ⟩ ▤ ☰ ▲ ✕` as substitutes, at the cost of baseline alignment, cross-platform consistency, screen-reader predictability and two extra webfonts. `icon.spec.ts` asserts every name in `ICON_NAMES` draws geometry, because a mistyped `@case` renders an empty `<svg>` and nothing else complains |
| Reorder | `ui-reorder` | `label` (names the item for screen readers), `first`, `last`; output `moved(-1 | 1)` — the keyboard half of a drag-to-reorder list, absolutely positioned over a `position: relative` parent |
| Section label | `ui-section-label` | content-projected mono uppercase micro-heading |
| Dropdown | `ui-dropdown` | `width`; project trigger via `[ddTrigger]`, panel via `[ddPanel]`; call `close()` from panel handlers |
| Image slot | `ui-image-slot` | `src`, `focal` (CSS `background-position`), `placeholder`, `reframable`; outputs `fileSelected(File)`, `reframeRequested()` — presentational; pages upload via `ImagesApi` and persist ids on the DTO |
| Image focus | `ui-image-focus` | none — global outlet in the shell, driven by `ImageFocusService`; the focal-point editor (drag or arrow keys, live previews of the surfaces that match the image's `usage`) |
| Toast | `ui-toast` | none — global outlet in the shell, driven by `ToastService.flash(message, action?)`. Tones `info \| success \| error`. **An error is painted with `--danger` and never auto-dismisses** — a failure the user did not see is a failure they think succeeded — while info and success keep the short timeout. Messages **queue** instead of cancelling the previous one (a single slot meant two messages in a row showed one), an error head holds the queue behind it, and identical text already showing is dropped, which is what lets a page's own `catch` and the global interceptor both report without the user reading it twice. Tone is never colour-only: each carries a text marker, and errors are `role="alert"`. `action` renders the undo affordance |
| Dialog | `ui-dialog` | `title` (required), `describedBy`, `role: 'dialog' \| 'alertdialog'`; output `dismissed`; default slot plus a projected `[dlgActions]`. Owns the scrim, `aria-modal`, Escape, and initial focus — on the **panel**, deliberately not on a control, so a held Enter cannot answer a dialog before it has been read. **`dismissed` always means "nothing happened"**: Escape and the scrim both fire it, and a caller must never read either as a confirmation. A dialog you cannot leave by reflex is one people answer at random |
| Confirm | `ui-confirm` | none — global outlet in the shell, driven by `ConfirmService.ask(req): Promise<boolean>` where `req` is `{ titleKey, bodyKey, bodyParams?, confirmKey, cancelKey?, tone? }`. Built on `ui-dialog` as an `alertdialog`. With `tone: 'danger'` the confirm button takes the `danger` variant and **initial focus goes to Cancel**. Escape, the scrim and a second `ask()` all resolve `false`; it never rejects. A service and an outlet, following `ConflictService`/`app-conflict-notice` — not a modal framework |
| Empty state | `ui-empty` | `icon`, `title` (**required, no default**), `body` (optional, capped near 48ch), `compact`; actions projected via `[emptyActions]`. The title has no default on purpose: "nothing matches your filters" and "nothing here yet" are different facts, and one message serving both is what told people to clear filters they had never set. Deliberately **not** `role="status"` — these render on first paint, where a live region announces nothing while stealing the announcement from whatever did change |
| Skeleton | `ui-skeleton` | `variant: 'text' \| 'block' \| 'circle'`, `width`, `height`, `radius`, `lines`. **The only thing in the app allowed to shimmer**, and only inside `motion-safe`. A no-image state is flat — see `ui-image-slot` — because a diagonal hatch is indistinguishable from a shimmer, which is what made the dashboard, the store and the group cards read as permanently mid-fetch. `aria-hidden` with no name; the surrounding region owns `aria-busy` |
| Date input | `ui-date-input` | `value` (model, ISO `yyyy-MM-dd`; `''` = no date), `min`, `max`, `variant`, `ariaLabel`; output `blurred`. A native `<input type="date">` follows the **browser's** locale, not the document's, so an English-locale Chrome renders `mm/dd/yyyy` inside a pt-BR UI — which does not fail, it records the wrong date. Two defences: `lang` is bound to `I18nService.current()` (Chromium honours it; Firefox and Safari still take the OS locale), and the expected order is printed under the field from `Intl.DateTimeFormat` for `I18nService.locale()`, wired up as `aria-describedby` so it is announced and not merely drawn. Always use this instead of `ui-text-input type="date"` |
| Conflict notice | `app-conflict-notice` | none — global outlet in the shell, driven by `ConflictService`. Lives in `layout/`, not `shared/ui`: it is one app-specific outlet, not a reusable element. Raised when a write is refused because someone else changed the collection first; it never discards what the user typed |
| Money pipe | `\| money: currency()` | formats numbers as `$1,234.57`, always two decimals, always rounded **up**. Takes the collection's currency; omitted, the account default. Impure — see §6 |
| Photo manager | `<ui-photo-manager>` | add / reorder / cover / frame / remove an item's photos. Owns the dropzone and the upload queue; emits the whole list back |
| Lightbox | `<ui-lightbox>` | full-screen photo viewer, arrow-key paging, links the original |
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
- **Collection writes carry a version.** Every write to a collection or its
  items sends an `If-Match` with the version the client last synchronised with;
  the server refuses a missing precondition outright, so there is no path that
  quietly opts out of the guard. `VaultStore` owns the version map and
  `HttpVaultApi` reads versions off the list envelope and the `ETag` header —
  **never off `Collection` itself**, because the same shape is the archive
  format and a concurrency token has no business in a backup. A refused write
  raises `ConflictService`; it never discards what the user typed.
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

  **A group's parent is editable, and a move is not a reorder.** The detail pane
  in collection settings carries a parent picker — a `ui-select`, filtered
  through `canReparent()` (`core/utils/groups.util.ts`) so an illegal target is
  never offered. Deliberately not drag-and-drop: because groups list
  alphabetically and nothing persists a position, a drop *between* two rows
  means nothing and would teach the wrong model, so only a drop *onto* a row
  could count — an invisible affordance that would then owe a keyboard path
  anyway. A select is keyboard-native and can *omit* the illegal option instead
  of rejecting the gesture after the fact. `subtreeIds()` carries a cycle guard
  like `visibleTree`/`statsIndex`/`pathOf`, because `canReparent` depends on it
  terminating on a tree that is already broken.

  **`ParentId` is the one reference in the aggregate that may not dangle.**
  A `Section.groupId` or an `Item.sectionId` pointing at something gone resolves
  gracefully to "none", which is why they are never cross-checked. A dangling
  `ParentId` has no graceful reading: `childrenOf(groups, null)` never reaches a
  looped or orphaned branch, so every group in it vanishes from the tree and the
  picker while its items keep counting in the collection total. The API refuses
  both cases (`CollectionDtoValidator`).

  **Moving a group must be previewed, because nothing afterwards looks broken.**
  `fieldsFor` merges the whole ancestor path and `sortFor` takes the nearest
  ancestor, so a move silently re-declares which fields every item in the branch
  displays and which order it follows. `groupMoveImpact()`
  (`core/utils/group-move.util.ts`) states the fields gained, each field lost
  *with how many items hold a value for it*, and the order the branch will
  inherit. Nothing is destroyed — a `custom` value is keyed by field *name* on
  the item, so it goes dormant and returns if the group moves back — which is
  what makes the move reversible and the warning a warning rather than a block.
  Sibling name collisions are warned, never blocked: names are not keys, and
  blocking would refuse legitimate intermediate states of a full-document PUT.

  **Deleting a group asks what happens to its contents.** It used to refuse
  outright whenever any item existed anywhere in the subtree — safe, and a dead
  end, since the message said "move them first" and the app offered no way to
  move anything in bulk. Meanwhile empty sub-groups were deleted silently and
  uncounted, which was the genuinely dangerous half. The dialog now states the
  real counts and offers three dispositions with **nothing preselected**: move
  the contents up to the parent (recommended — the only one that loses
  nothing), unfile the items (`groupId: ''`, **never** `UNGROUPED_ID`, which is
  a key to read by and never a value to store), or delete the items too, with
  the count in the button. Every disposition removes the deleted groups'
  sections and clears any surviving item's `sectionId`. The arithmetic is
  `groupDeletePlan()` (`core/utils/group-delete.util.ts`), which returns both
  the counts the dialog renders **and** the graph the page applies, from one
  function, so the number shown and the change made cannot disagree.
- **A section is a separator inside one group, never a level.** A `Section`
  (`{ id, groupId, name, target }`) labels a run of a group's items;
  `item.sectionId` points at it and `''` means none. It deliberately has **no
  `parentId`** (the recursion already lives on `GroupNode` — a nesting section
  is that tree under another name), **no `fields`** (they are taxonomy: a
  divider that changes the item form's field set is the defect this fixes) and
  **no `sort`** (it is a run inside *one* ordered list, so per-run ordering
  would make the group's declared order meaningless). What it has and a group
  does not is a persisted position: order is the array order of
  `collection.sections`, because Bronze → Prata → Ouro is a progression the
  alphabet reads Bronze, Ouro, Prata. Read them only through `sectionsOf()` in
  `core/utils/sections.util.ts` — never sort them by name.
  **A section orders, it does not scope.** `sortItems` takes the open group's
  `sectionRank` as its **primary** key and the chosen order only breaks ties
  inside a run; `chunkBySection` then merely *cuts* the already-ordered list
  into runs, each entry carrying its index **in the list**, not in the chunk.
  That is what leaves `scopeItems`, `subtreeIds`, the breadcrumb, the group
  tree and the item page's `←`/`→` untouched. A sort direction reverses the
  items inside each run, never the runs. Ownership resolution is free: the rank
  only holds the open group's sections, so an item pointing at another group's
  section — or one deleted since — ranks as unsectioned rather than erroring,
  and any remembered id passes through `resolveSectionId` first. Narrowing to
  one run is a **filter** (`?s=`, beside `?cond=` / `?own=`), so the heading is
  a `<button aria-pressed>` that toggles, and `groupLinkParams` drops it when
  the group changes. Per-section progress comes from `sectionStatsIndex` in
  `group-stats.util.ts`, and a section's `target` rolls up into its group
  exactly like a child group's.
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

### Pure utils and page-local helpers

Every one of these exists so that two surfaces cannot disagree. If you find
yourself computing one of these things inline, that is the bug.

| Module | Owns |
| --- | --- |
| `core/utils/browse.util.ts` | `visibleItems`, `neighbours`, `scopeItems`, and `matchesQuery` — search reaches an item's name, description, tags **and custom-field values**, which is where a catalogue number actually lives. It matched the name alone, so the single most common lookup a cataloguer performs could not find anything |
| `core/utils/sort.util.ts` | all comparison, plus `moveInList` / `applyManualOrder` |
| `core/utils/groups.util.ts` | the tree: `childrenOf`, `flattenTree`, `visibleTree`, `pathOf`, `subtreeIds`, `fieldsFor`, `sortFor`, `resolveGroupId`, `canReparent`, `compareNames` |
| `core/utils/group-stats.util.ts` | every owned / missing / percentage figure |
| `core/utils/group-move.util.ts` | `groupMoveImpact` — what a reparent will change, before it changes it |
| `core/utils/group-delete.util.ts` | `groupDeletePlan` — the counts a deletion dialog shows *and* the graph it applies |
| `core/utils/sections.util.ts` | `sectionsOf`, `chunkBySection`, `resolveSectionId` |
| `core/utils/copies.util.ts` | ownership, `copyValue`, `valueIsPaid` |
| `core/utils/field-format.util.ts` | rendering a custom-field value: `date` through `formatDate`, `number` through `Intl.NumberFormat` — **deliberately not the money formatter**, because a field typed `number` is a catalogue number or a print run and rendering `12` as `US$ 12,00` invents a currency the data never claimed. Display only; ordering stays on the raw value in `sort.util.ts`. An unparseable value is echoed back, because the field is free text underneath |
| `core/utils/list-totals.util.ts` | `listTotals` — the row count and per-currency totals under a **filtered visible list**. Not `ownedValueByCurrency`, which is vault-wide, and not `group-stats.util.ts`, which measures a subtree against a target |
| `core/utils/currency.util.ts`, `money.util.ts`, `date.util.ts`, `focal.util.ts`, `download.util.ts` | as before |

Page-local helpers live beside the page that owns them and are unit-tested the
same way — `collection-page/drag-order.ts`, `tree-prefs.ts`,
`item-selection.ts` (the selection model, with the visible-intersection rule),
`bulk-patch.ts` (`applyBulkPatch`, `removeItems`), `column-prefs.ts`, and
`item-form-page/unsaved-item.guard.ts`.

### The store's failure contract

`VaultStore` exposes `loadError` (the server's own sentence where there is one),
`retrying`, `retryLoad()`, and a derived `syncState` /`syncStatusKey`
(`conflict > offline > saving > synced`) which is what the sidebar's status line
renders. That line used to be the hardcoded string `'● synced · v0.1 mock API'`
in a product running against a real .NET backend, with a dot that never changed.

`load()` records the failure **and rethrows**, so a caller that needs to know
whether it worked still can. Every write goes through a counted wrapper that
reports nothing and rethrows — see rule 11.

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
3. **Never concatenate a translated string** — and that includes placing two
   keys next to each other in a template. Word order differs between languages:
   `'Collapse ' + name` becomes `'groupTree.collapseGroup' | t: { name }`.
   This rule was violated in the collection hero and the group card, where
   `progress.owned` was rendered immediately followed by `progress.ofCatalogued`.
   In English the pieces happened to line up; in Portuguese the result read
   *"9 / 10 na coleção do catalogado"* — a phrase in no language. The correctly
   composed sentence already existed in the component and was being passed only
   to an accessible-text binding. **Two adjacent keys are a concatenation**;
   compose the whole sentence with placeholders, and delete the fragments.
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
`core/utils/money.util.ts`. **The currency never follows the language**: it is
data — the account's `defaultCurrency`, or a collection's override — resolved
through `currencyOf` in `core/utils/currency.util.ts` and held for the account in
`CurrencyService`. Only the separators and the symbol's spelling follow the
locale, so pt-BR renders a USD figure `US$ 4.200,00`; relabelling it `R$` would
restate the same number as a different amount of money. Amounts always carry two
decimals and are rounded **up** to the cent, never half-up — see `ceilToCents`,
which collapses binary floating-point error first so `0.07` does not bill as
eight cents. Adding a currency means moving `SUPPORTED_CURRENCIES` here *and*
`Money.SupportedCurrencies` on the backend together.
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
- Before merging UI work: `npm run build` must pass with zero errors **and zero
  warnings** and the affected flows must be exercised in the browser
  (`npm start`), including at least one dark theme — token regressions usually
  only show up there — and **in Portuguese**, which runs ~20% longer than
  English and is where text overflow shows up first.
- **`npm run verify:browser`** (`frontend/e2e/verify.mjs`) makes the checks only
  a real browser can. Run it against a dev server before merging UI work. It
  asserts first paint carries the stored theme and language, that the dashboard
  raises **no toast while idle**, that `scrollWidth === clientWidth` at 390/768/900
  across the routes, and the nav drawer's whole aria and focus contract — in
  pt-BR and a dark theme, because both are where this app breaks first. It is
  not an end-to-end suite; **add to it whenever you find a defect the unit suite
  could not have caught.**
- **The palette is arithmetic.** `src/styles/themes.spec.ts` parses the shipped
  `_themes.scss` and holds `--muted-strong`, `--accent-strong`,
  `--accent2-strong`, `--text2` and `--text` to 4.5:1 against `--bg`, `--panel`
  **and** `--panel2`, for all seven themes. It reads the real file rather than a
  copy on purpose: a duplicated palette in a test is a palette that will
  disagree with the one that ships.
- **A browser pass catches what no unit test can.** The `/api/setup/status`
  false-alarm toast passed every spec in the suite and greeted every user on
  every page load. If you have changed anything that reports to the user, open
  the app and watch it idle for a few seconds.
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


## Images

**Ask for the size you will render.** `images.url(id, variant)` takes
`'thumb'` (400 px — cards, tiles, gallery thumbnails), `'display'` (1400 px —
banners, the gallery's main image, the framing editor's stage) or `'full'` (the
original, only behind the lightbox's "open original"). The server resizes to
WebP on upload and caches the result, deriving on demand for images that predate
variants or arrived through an archive import. Animated GIFs are never derived,
so they keep moving. **Always name the variant**: leaving it to the server's
default gives one picture two URLs and so two cache entries everywhere.

`ImageMeta` carries `width`/`height` so a surface can reserve the right shape
before the bytes arrive. Both or neither — a lone dimension describes nothing.

**Uploading and framing are separate acts.** `PhotoUploadService` sends picked
files immediately, one at a time, reporting progress; `ImageFocusService.frame`
opens the editor on a photo that is *already stored*. They used to be one step,
and that is what made dismissing the editor destroy the upload and made the
first file of a batch the only one you could frame — or choose as the cover. The
overlay must stay safe to dismiss: never gate an upload behind it again.

**The cover is `photoIds[0]`.** There is no `coverId` field: a second source of
truth can point at a removed photo and would need defending in the validator,
the importer and the archive format to say what the order already says.
`ui-photo-manager` is where the order is edited, and "Make cover" is exactly
"move to the front".
