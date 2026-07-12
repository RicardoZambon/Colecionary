# CLAUDE.md

Guidance for Claude Code (and any contributor) working in this repository.

## Project

**Colecionary** is a SaaS to catalog, organize, value, and showcase personal
collections. The current implementation ships under the working name
**Vault — Collection Control**, built from the Claude Design project
*Collection Control* (`27631083-1c42-43e2-8868-174dd8aa138b`).

## Repository layout

| Path | What it is |
| --- | --- |
| `frontend/` | **The app.** Angular 21 + TypeScript, mocked data, backend-ready. |
| `prototype/` | Frozen dependency-free HTML/JS port of the design file. Reference only — do not add features here. |
| `docs/frontend-standards.md` | **The frontend rulebook.** Architecture, component catalog, theming, data layer. Read it before touching `frontend/`. |
| `docs/` (rest) | Colecionary brand manual (identity, design system, brand tokens, voice). Brand reference — not yet the app's visual language (see governance below). |

## Commands (run in `frontend/`)

```sh
npm start        # dev server → http://localhost:4200
npm test         # vitest unit tests
npm run build    # production build (must pass before merging)
```

`.claude/launch.json` defines the `frontend` (4200) and `prototype` (4173)
preview servers.

## Non-negotiable frontend rules

Full detail and rationale in [`docs/frontend-standards.md`](docs/frontend-standards.md).

1. **Design tokens only.** All colors/fonts/radii/shadows come from the CSS
   custom properties in `frontend/src/styles/_themes.scss` (7 themes). Never
   hardcode visual values in components or pages.
2. **`shared/ui` is the single source of truth for elements.** Buttons,
   inputs, selects, chips, cards, badges, toggles, tabs, avatars, dropdowns,
   etc. are always the `ui-*` components. Need a variant? Extend the
   component; never restyle raw HTML in a page.
3. **All data flows through the abstract `VaultApi`**
   (`frontend/src/app/core/api/vault-api.ts`). It is currently fulfilled by
   `MockVaultApi` (seed data + latency + localStorage). To connect the real
   backend, implement the same contract and swap one provider line in
   `app.config.ts` — feature code must never know the difference.
4. **Signals + zoneless + OnPush.** State lives in signal stores
   (`core/state`); no Zone.js patterns.
5. **URL is state.** Selected group = `?g=`, settings tabs = `?tab=`, ids in
   the path. In-collection navigation preserves `?g=`
   (`queryParamsHandling: 'preserve'`).
6. **Accessibility.** Real `<a>`/`<button>` for clickables, visible
   `:focus-visible`, status never communicated by color alone.
7. **Verify before merging:** `npm run build` clean, unit tests green, and
   the affected flows exercised in the browser in at least one dark theme.

## ⚠️ Brand governance (pending)

The app currently uses the Collection Control design's own "Vault" theming
(indigo `#5453C4`, 7 switchable themes). The Colecionary brand manual in
`docs/` defines a different identity (Vault Purple `#7C5CFF`, Colecionary
Night `#101827`, dark-first). **No new visual language may be invented beyond
either system.** Reconciling the two requires a formal identity review;
mechanically it is a one-file change (`styles/_themes.scss`).

## Backend (not started)

Planned stack: **.NET** API. When it lands, implement `HttpVaultApi` against
the `VaultApi` contract — the models in `frontend/src/app/core/models/`
define the expected shapes.
