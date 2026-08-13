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
| `frontend/` | **The app.** Angular 21 + TypeScript. Talks to the backend via `HttpVaultApi` (JWT auth). No mocked data — everything comes from the API. |
| `backend/` | **The API.** .NET 10 clean-architecture solution (Domain / Application / Infrastructure / Api), SQL Server + EF Core, JWT auth, multi-tenancy via global query filters. See `backend/README.md`. |
| `prototype/` | Frozen dependency-free HTML/JS port of the design file. Reference only — do not add features here. |
| `docs/frontend-standards.md` | **The frontend rulebook.** Architecture, component catalog, theming, data layer. Read it before touching `frontend/`. |
| `docs/` (rest) | Colecionary brand manual (identity, design system, brand tokens, voice). Brand reference — not yet the app's visual language (see governance below). |

## Commands

```sh
# backend/  — requires Docker for SQL Server
docker compose up -d                  # SQL Server 2022 → localhost:1433
dotnet run --project src/Vault.Api    # API → http://localhost:5100 (migrates + seeds in dev)
dotnet test                           # unit + integration (Testcontainers)
dotnet format --verify-no-changes

# frontend/
npm start        # dev server → http://localhost:4200 (expects the API on 5100)
npm test         # vitest unit tests
npm run build    # production build (must pass before merging)
```

Demo login: `marcus@airia.com` / `vault-demo` (also `ana@` Editor, `dev@` Viewer).
`.claude/launch.json` defines the `frontend` (4200) and `prototype` (4173)
preview servers.

## Non-negotiable backend rules

Full detail in [`backend/README.md`](backend/README.md).

1. **Tenant isolation is enforced by the database layer, not by services.**
   Every tenant-owned entity implements `ITenantOwned`; `VaultDbContext`
   applies a global query filter by convention and the
   `TenantStampingInterceptor` stamps/validates `TenantId` on writes. Never
   hand-write `WHERE TenantId = …`, never bypass the filter outside
   login/seeding, and any new tenant-owned entity just implements the
   interface.
2. **Layering:** controllers are thin; behavior lives in Application services;
   EF mechanics live in Infrastructure repositories (one per aggregate root —
   no generic repository). Domain references nothing.
3. **The API contract mirrors `VaultApi`** (frontend). JSON stays camelCase
   with string enums so the Angular models never change. Contract changes must
   update both sides plus the integration tests.
4. **Tests:** integration tests run against real SQL Server (Testcontainers);
   tenant isolation has dedicated coverage that must stay green.
5. **Tables are PascalCase and explicitly schema-qualified.** Schemas are
   declared only in `VaultSchemas` (`Identity`, `Catalog`, `Store`, `Storage`);
   every configuration calls `ToTable("Name", VaultSchemas.X)` and columns —
   JSON container columns included — are PascalCase.
   `TableNamingConventionTests` fails the build otherwise. Migrations predating
   `UseSchemaQualifiedPascalCaseNames` keep their old lowercase names; never
   retro-edit an applied migration.
6. **Image bytes live in `IImageStore`, never in the database.** The `Images`
   row is metadata only (id → tenant, content type). `FileSystemImageStore`
   writes `{ImageStorage:Root}/{tenantId}/{imageId}.{ext}` — **one directory per
   tenant**, so a tenant's images are a unit you can copy, quota or delete, and
   no lookup can cross tenants. Always pass the tenant id read from the image's
   own row, not the ambient request tenant; that is what keeps the anonymous
   GUID read endpoint safe. **Framing (`FocalX`/`FocalY`) is metadata on that
   same row and never rewrites the bytes**, so an id and its `immutable`-cached
   URL stay valid. Its write resolves the row through
   `GetForCurrentTenantAsync`, never `GetUnfilteredAsync`: ignoring the filter
   is only defensible for the anonymous byte read, and using it for a write
   would let one tenant reframe another's image.

## Non-negotiable frontend rules

Full detail and rationale in [`docs/frontend-standards.md`](docs/frontend-standards.md).

1. **Design tokens only.** All colors/fonts/radii/shadows come from the CSS
   custom properties in `frontend/src/styles/_themes.scss` (7 themes). Never
   hardcode visual values in components or pages.
2. **`shared/ui` is the single source of truth for elements.** Buttons,
   inputs, selects, chips, cards, badges, toggles, tabs, avatars, dropdowns,
   etc. are always the `ui-*` components. Need a variant? Extend the
   component; never restyle raw HTML in a page.
3. **Items own their copies; ownership is derived.** An `Item` is the
   catalogue entry (`value` = per-unit reference estimate) and carries
   `copies: ItemCopy[]` — each with its own condition, price paid, optional
   value override, acquisition date, status (keep/trade/sale) and notes. There
   is no `owned` flag and no item-level condition/price: at least one copy
   means owned, none means wantlist. Always go through the pure helpers in
   `core/utils/copies.util.ts` (backend mirror: `ItemCopy` in a `copies` JSON
   column).
4. **Groups declare typed fields and their default order.** A `GroupNode`
   carries `fields: GroupField[]` (`{ name, type: text|number|date }`) and
   `sort: GroupSort | null`; field *values* stay on the item as `custom`
   strings, so retyping a field never rewrites data. Fields merge down the
   whole ancestor path, `sort` takes only the nearest ancestor that sets one,
   and all comparison lives in `core/utils/sort.util.ts` — never sort items
   inline. Manual order is the array order of `collection.items`, persisted by
   index; the item DTO has no `sortOrder`.
5. **Image framing is a focal point, never a crop.** Every surface renders with
   `background-size: cover`, so which part shows is one property:
   `background-position`. An image carries `focal: {x, y}` (0–1) on its own row,
   so one adjustment fixes the card, the gallery and the banner at once. Bind
   `ImageFocusService.position(id)`; never compute a percentage inline — the
   conversion lives in `core/utils/focal.util.ts`. Null means "never framed"
   (renders centred) and must survive round-trips.
6. **All data flows through the abstract `VaultApi`**
   (`frontend/src/app/core/api/vault-api.ts`), fulfilled by `HttpVaultApi`
   against the .NET backend. There is no mocked data in the frontend — demo
   data lives in the backend seeder. Feature code only ever sees the abstract
   contract.
7. **Signals + zoneless + OnPush.** State lives in signal stores
   (`core/state`); no Zone.js patterns.
8. **URL is state.** Selected group = `?g=`, settings tabs = `?tab=`, ids in
   the path. In-collection navigation preserves `?g=`
   (`queryParamsHandling: 'preserve'`).
9. **Accessibility.** Real `<a>`/`<button>` for clickables, visible
   `:focus-visible`, status never communicated by color alone. Anything
   draggable also needs a keyboard path (`ui-reorder`, `ui-image-focus`).
10. **Verify before merging:** `npm run build` clean (warnings included — the
   6 kB per-component style budget is real), unit tests green, and the
   affected flows exercised in the browser in at least one dark theme.

## ⚠️ Brand governance (pending)

The app currently uses the Collection Control design's own "Vault" theming
(indigo `#5453C4`, 7 switchable themes). The Colecionary brand manual in
`docs/` defines a different identity (Vault Purple `#7C5CFF`, Colecionary
Night `#101827`, dark-first). **No new visual language may be invented beyond
either system.** Reconciling the two requires a formal identity review;
mechanically it is a one-file change (`styles/_themes.scss`).

## Known v1 tradeoffs (documented follow-ups)

JWT in localStorage without refresh tokens; no optimistic concurrency on the
full-document collection PUT; collection members are denormalized snapshots;
invited members can't log in until an invite/set-password flow exists; images
are served via unguessable-GUID URLs (signed URLs later); replaced/removed
images are not garbage-collected yet.
