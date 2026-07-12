# Vault — Collection Control (Angular frontend)

Angular 21 + TypeScript implementation of the **Collection Control** design
(claude.ai/design project `27631083-1c42-43e2-8868-174dd8aa138b`). Runs fully
on mocked data today and is wired to swap in a real backend without touching
feature code.

```sh
npm install
npm start          # ng serve → http://localhost:4200
npm test           # vitest unit tests
npm run build      # production build
```

## Architecture

```
src/
├─ styles/
│  ├─ _themes.scss          ← ALL design tokens (7 themes as CSS custom props)
│  └─ _mixins.scss          ← shared style building blocks
├─ app/
│  ├─ core/                 ← no UI here
│  │  ├─ models/            ← typed domain model (Collection, Item, GroupNode, …)
│  │  ├─ api/
│  │  │  ├─ vault-api.ts    ← abstract backend contract (the DI token)
│  │  │  ├─ mock-vault-api.ts ← mock impl: seed data + latency + localStorage
│  │  │  └─ seed-data.ts    ← demo dataset, themes, plans
│  │  ├─ state/             ← signal stores: VaultStore, ThemeService,
│  │  │                        ToastService, ImageSlotService
│  │  └─ utils/             ← pure group-tree helpers (unit-tested)
│  ├─ shared/
│  │  ├─ ui/                ← THE component library — single source of truth
│  │  │                        for button, inputs, select, chip, card, badge,
│  │  │                        toggle, tabs, avatar, progress, dropdown,
│  │  │                        image-slot, toast, field
│  │  └─ pipes/             ← money pipe
│  ├─ layout/               ← shell, topbar (breadcrumb, search, theme menu), sidebar
│  ├─ features/             ← routed pages, lazy-loaded
│  │  ├─ dashboard/
│  │  ├─ collection/        ← collection, item, item-form, collection-settings
│  │  ├─ store/
│  │  └─ settings/
│  ├─ app.routes.ts
│  └─ app.config.ts         ← provider wiring (VaultApi → MockVaultApi)
```

### Rules of the road

- **Design tokens only.** Components never hardcode colors, radii, fonts, or
  shadows — everything reads the CSS custom properties from
  `styles/_themes.scss`. Adding/altering a theme touches exactly one file.
- **One source of truth for elements.** Pages compose `shared/ui` components;
  raw `<button>`/`<input>` styling in pages is reserved for one-off inline
  editors and is still token-driven.
- **Backend-ready.** All data flows through the abstract `VaultApi`
  (`core/api/vault-api.ts`). `MockVaultApi` simulates a server (latency, deep
  copies, persistence). To connect the real .NET backend, implement
  `HttpVaultApi` against the same contract and change one provider line in
  `app.config.ts`.
- **Signals + zoneless.** State lives in signal stores (`core/state`);
  components are `OnPush` with `computed()` view models. Route/query params
  bind through `withComponentInputBinding()` — e.g. the selected group is the
  `?g=` query param, so deep links and back/forward restore context.

## ⚠️ Design-governance note

This app renders the Collection Control design verbatim, including its own
"Vault" theming (indigo `#5453C4` accent, 7 switchable themes). Those tokens
are **not** the Colecionary brand tokens from `../docs/design-tokens.md`.
Reconciling the two requires the formal identity review mandated in
`../CLAUDE.md` before this ships as product UI. Mechanically it is a
one-file change (`styles/_themes.scss`).
