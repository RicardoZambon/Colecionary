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
| `docs/manual/` | **The technical manual (HTML).** How the system actually works: architecture, end-to-end flows, the HTTP contract, tenancy, images, the frontend, operations, the test matrix and the decision record. Open `docs/manual/index.html`. Descriptive, not normative — and **every feature updates it** (see below). |
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
npm run verify:browser   # Playwright checks against a running dev server
```

Demo login: `marcus@example.com` / `vault-demo` (also `ana@` Editor, `dev@` Viewer).
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
   Sections travel in the same document (`CollectionDto.Sections`,
   `ItemDto.SectionId`), both **optional on the wire and normalised** to `[]` /
   `""` — that DTO is also the archive format, so an export taken before
   sections existed has to restore rather than fail.
   **A write to a collection or any of its items requires an `If-Match`
   carrying the version the client last synchronised with**, and a missing
   precondition is refused with `428` — an optional precondition only protects
   the clients that already remember to send one, which is never the buggy one
   about to erase someone's afternoon. Versions reach the client through the
   collection list envelope and an `ETag` header, **never as a field inside
   `CollectionDto`**: that DTO is also the archive format, and a concurrency
   token has no business in a backup. Item writes bump the collection's version
   and are guarded by it — there is nowhere to put a per-item token, so the real
   choice was collection-wide or nothing, and nothing loses updates in silence.
4. **The aggregate is Collection + Groups + Sections + Items + Members.**
   Every one of them needs a `MergeByKey` block in
   `CollectionRepository.ReplaceGraph` (plain assignment, never a coalesce —
   clearing a target back to null is a legitimate edit) and needs to be
   recognised by `CollectionVersionInterceptor`. A child written without moving
   the root's version is a silently lost update, which is the one failure that
   whole feature exists to prevent.
5. **Tests:** integration tests run against real SQL Server (Testcontainers);
   tenant isolation has dedicated coverage that must stay green.
6. **User-facing API text is localized, and the middleware order is load-bearing.**
   Validation messages, ProblemDetails titles and service exceptions come from
   `Vault.Application/Resources/Messages.resx` (+ `.pt-BR.resx`), resolved
   against `CurrentUICulture`, which `UseRequestLocalization` sets from the
   frontend's `Accept-Language`. That middleware is registered **before**
   `UseExceptionHandler` in both hosts: the handler builds its title while an
   exception unwinds, so the culture must still be in scope. The general
   property is broader than the exception handler, which is only its most
   obvious instance: **anything that produces localized text must run
   downstream of `UseRequestLocalization`** — the login throttle's `429` is not
   an exception and would answer in English from the wrong position. Never assert a
   literal user-facing message in a test — go through `Messages.In(name,
   culture)`, or the test becomes a second copy of the English translation that
   drifts silently. `MessageResourceTests` pins name parity and placeholders
   across both files; `LocalizationTests` pins the pipeline order.
7. **Tables are PascalCase and explicitly schema-qualified.** Schemas are
   declared only in `VaultSchemas` (`Identity`, `Catalog`, `Store`, `Storage`);
   every configuration calls `ToTable("Name", VaultSchemas.X)` and columns —
   JSON container columns included — are PascalCase.
   `TableNamingConventionTests` fails the build otherwise. Migrations predating
   `UseSchemaQualifiedPascalCaseNames` keep their old lowercase names; never
   retro-edit an applied migration.
8. **Image bytes live in `IImageStore`, never in the database.** The `Images`
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
   **Bytes are destroyed only by the collector, and only after
   `UnreferencedSinceUtc` has stood for the whole grace period.** Deletion is
   never on the dereference path: a mark is not a death sentence, it is a clock
   that any write resets, which is what makes an accidental dereference
   survivable. Reachability is deliberately computed across every tenant with
   `IgnoreQueryFilters()` — outside a request the filter resolves against no
   tenant and would compute an **empty** reference set, i.e. "collect
   everything". That call is the single most dangerous query in the
   application, it is covered only by the Testcontainers suite, and a
   plausible-looking cleanup that removes it is total data loss.

9. **Authentication is not authorization, and a write endpoint must name a
   policy.** `[Authorize(Policy = VaultPolicies.CanWrite)]` (Owner, Editor) for
   catalogue content — collections, items, image bytes, framing;
   `VaultPolicies.CanAdminister` (Owner) for anything at account scale, which
   includes archive import, because one request can overwrite every collection
   in the vault. The deny-by-default `FallbackPolicy` only makes an endpoint
   *authenticated*; for a long time that was all it was, and a Viewer's token
   was accepted by every write in the application. Never spell a role list in a
   controller — the membership of "may write" is one decision, and a list copied
   into eleven attributes eventually disagrees with itself. `RoleAuthorizationTests`
   must cover three directions: the Viewer refused, the **Editor accepted**, and
   nothing written by the refused attempt. Policies are tenant-wide;
   `CollectionMember.Role` still authorises nothing, deliberately.

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
   column). **An item nobody estimated (`value === 0`) is worth what it cost:**
   the chain is `copy.value ?? item.value ?? copy.price`, resolved in
   `copyValue` alone so no two surfaces disagree — and the substitution is
   never silent. `valueIsPaid` flags it and the `itemValue` pipe renders it
   `≈ $85`, with a genuine absence as `—` rather than `$0`.
4. **Groups declare typed fields, their default order, and optionally how big
   the set is.** A `GroupNode` carries `fields: GroupField[]`
   (`{ name, type: text|number|date }`), `sort: GroupSort | null` and
   `target: number | null`; field *values* stay on the item as `custom`
   strings, so retyping a field never rewrites data. Fields merge down the
   whole ancestor path, `sort` takes only the nearest ancestor that sets one,
   and all comparison lives in `core/utils/sort.util.ts` — never sort items
   inline. `target` is the declared size of the complete set, so progress can
   be measured against the series rather than against what is catalogued;
   **null means "not declared"** and must survive round-trips, and all the
   owned/missing arithmetic lives in `core/utils/group-stats.util.ts` — never
   count items inline. Manual order is the array order of `collection.items`,
   persisted by index; the item DTO has no `sortOrder`. That ordering is for a
   group's *items*: **the groups themselves always list alphabetically**, since
   nothing persists a position for a group. `childrenOf` in
   `core/utils/groups.util.ts` sorts by name (and `flattenTree`/`visibleTree`
   build on it) — never list or sort groups inline. **An item's group is
   inherited from context and "no group" is `''`:** `?g=` rides every "add item"
   link into `ItemFormPage`, so a new item lands in the open group, and any
   remembered group id passes through `resolveGroupId` first — blank, the
   `UNGROUPED_ID` bucket sentinel and a since-deleted group all collapse to `''`.
   `UNGROUPED_ID` is a key to read by, never a value to store.
5. **A section is a separator inside one group, never a level.** A `Section`
   (`{ id, groupId, name, target }`) labels a run of a group's items;
   `item.sectionId` points at it, `''` means none. It has **no `parentId`, no
   `fields`, no `sort`** — the recursion already lives on `GroupNode`, fields
   are taxonomy, and a run inside one ordered list cannot declare its own
   order. What it has and a group does not is a persisted position: order is
   the array order of `collection.sections`, read only through `sectionsOf`
   (`core/utils/sections.util.ts`), because Bronze → Prata → Ouro is a
   progression the alphabet reads Bronze, Ouro, Prata. **A section orders, it
   does not scope:** `sortItems` takes `sectionRank` as its *primary* key and
   `chunkBySection` only cuts the already-ordered list into runs, each entry
   keeping its index **in the list** — which is what leaves `scopeItems`,
   `subtreeIds`, the breadcrumb and the item page's `←`/`→` untouched.
   Narrowing to one run is a filter (`?s=`), never a destination. A reference
   to another group's section, or to a deleted one, resolves to "no section"
   rather than failing — groups, sections and items arrive in the same PUT, so
   cross-checking them would refuse legitimate intermediate states.
6. **Image framing is a focal point, never a crop.** Every surface renders with
   `background-size: cover`, so which part shows is one property:
   `background-position`. An image carries `focal: {x, y}` (0–1) on its own row,
   so one adjustment fixes the card, the gallery and the banner at once. Bind
   `ImageFocusService.position(id)`; never compute a percentage inline — the
   conversion lives in `core/utils/focal.util.ts`. Null means "never framed"
   (renders centred) and must survive round-trips.
   **Uploading and framing are separate acts.** Bytes go up as soon as they are
   picked (`PhotoUploadService`, progress-reported, sequential); framing is
   something you then choose to do to a photo that already exists. They used to
   be one step, which is why closing the editor destroyed the upload and why
   only the first file of a batch could be framed. Never reintroduce a framing
   step that gates an upload — the overlay must always be safe to dismiss.
7. **Ask for the size you are going to render.** Every image URL carries a
   variant: `images.url(id, 'thumb' | 'display' | 'full')`. A card or tile takes
   `thumb` (400px), a banner or gallery main image takes `display` (1400px), and
   `full` is the original, which only the lightbox's "open original" link wants.
   The server resizes to WebP on upload and caches the result, deriving on
   demand for anything older; **always name the variant** rather than relying on
   the server's default, or one picture ends up with two cache entries.
   Animated GIFs are never derived, so they keep moving.
   **The cover photo is `photoIds[0]`** — there is no `coverId`, and reordering
   through `ui-photo-manager` is how it changes.
8. **No user-facing string lives in a component.** The app ships pt-BR and en,
   switchable at runtime. Every string is a key in `core/i18n/messages/`,
   rendered through the `t` pipe in templates or `I18nService.t` in code;
   `en.ts` declares the keys and `pt-BR.ts` is `Record<MessageKey, string>`, so
   a missing translation is a compile error. `I18nService` mirrors
   `ThemeService` (signal + `localStorage['vault.lang']`, first visit from
   `navigator.language`). **Enum wire values, user-typed names and proper nouns
   are never translated** — they are data, and the enums are simultaneously the
   SQL representation and the server's validator whitelist. Both the `t` and
   `money` pipes are `pure: false` on purpose: a pure pipe memoizes by argument
   and would freeze every label in the old language. Dates go through
   `core/utils/date.util.ts`, amounts through `core/utils/money.util.ts`.
   **Currency is one of those data values, never copy.** Amounts are
   denominated in the account's `defaultCurrency` (ISO 4217, on `Tenant`),
   which a collection may override through its own nullable `currency` —
   **null means "follow the account" and must survive a round-trip**, so never
   resolve it to a code on write. Read it only through `currencyOf`
   (`core/utils/currency.util.ts`); the account default lives in
   `CurrencyService`, a dependency-free signal `VaultStore` owns, so that a
   pipe never drags `HttpClient` into the TestBed of every component that
   renders an amount. The language moves the separators and the symbol's
   spelling, never the currency itself: pt-BR writes a USD figure `US$
   4.200,00`, because relabelling it `R$` would restate the same number as a
   different amount of money. Every amount carries two decimals and is rounded
   **up** to the cent (`ceilToCents`, which collapses binary floating-point
   error first — a naive `Math.ceil` bills `0.07` as eight cents). Mixed
   currencies are never summed: `ownedValueByCurrency` returns one row per
   currency, because adding BRL to USD is not an amount of money in either.
   `SUPPORTED_CURRENCIES` mirrors `Money.SupportedCurrencies` on the backend
   and the two move together, like the condition and role whitelists.
9. **All data flows through the abstract `VaultApi`**
   (`frontend/src/app/core/api/vault-api.ts`), fulfilled by `HttpVaultApi`
   against the .NET backend. There is no mocked data in the frontend — demo
   data lives in the backend seeder. Feature code only ever sees the abstract
   contract.
10. **Signals + zoneless + OnPush.** State lives in signal stores
   (`core/state`); no Zone.js patterns.
11. **URL is state.** Selected group = `?g=`, section = `?s=`, view = `?v=`,
   item filters and order = `?cond=` / `?own=` / `?sort=` + `?dir=`, settings
   tabs = `?tab=`, ids
   in the path. In-collection navigation preserves the query string
   (`queryParamsHandling: 'preserve'`), which is what lets an open item rebuild
   the exact list the grid showed and step to its neighbours. Query strings are
   untrusted input: parse them through `features/collection/browse-params.ts`,
   and derive the visible list and an item's neighbours only through
   `core/utils/browse.util.ts` — two screens filtering inline would disagree the
   first time a filter changed. Links that open a group go through
   `groupLinkParams`, which keeps the filters and drops the ad-hoc order, since
   every group declares its own.
12. **Accessibility.** Real `<a>`/`<button>` for clickables, visible
   `:focus-visible`, status never communicated by color alone. Anything
   draggable also needs a keyboard path (`ui-reorder`, `ui-image-focus`).
13. **Verify before merging:** `npm run verify:browser` green against a running
   dev server (it makes the checks only a browser can — first paint, no toast
   while idle, `scrollWidth === clientWidth` at 390/768/900, the nav drawer's
   aria and focus contract — and **add to it whenever you find a defect the
   unit suite could not have caught**), `npm run build` clean (warnings included — the
   6 kB per-component style budget is real), unit tests green, and the
   affected flows exercised in the browser in at least one dark theme **and in
   Portuguese** — it runs ~20% longer than English, so that is where text
   overflow shows up first.

14. **A bulk write is one full-document PUT**, never N `upsertItem` calls: each
   item write bumps the collection version, so N writes are N sequential
   round-trips where a failure at item 7 of 40 is unrecoverable and a competing
   writer refuses the rest with a 412 nobody can act on. Bulk delete is the same
   PUT with the items filtered out, because `DELETE /items/{id}` carries no
   precondition by design. A bulk apply **keeps** custom fields the destination
   group does not declare — the single-item form may drop them in front of
   someone looking at that item's whole field set; doing it across forty destroys
   data nobody was shown. Selection lives in a signal on the page, intersected
   with the *visible* list before any action, and is **not** URL state; neither
   is column visibility (`localStorage`, per collection and group, storing the
   *hidden* names). Both exceptions are justified in the code.
15. **A destructive act asks, and an undo is worth more than the question.**
   Deletion goes through `ConfirmService.ask()`, with the count or name in the
   body and the outcome in the button ("Delete 12 items"). Where an undo exists,
   state its limits honestly — a restore is version-guarded, so a refused one
   leaves the item deleted. Where none exists, say so and offer the export.
   Deleting a group asks what happens to its contents (move up / unfile with
   `groupId: ''`, never `UNGROUPED_ID` / delete too), and the counts shown and
   the graph applied come from one function, `groupDeletePlan`.
16. **No HTTP failure is silent, and no expected failure is reported.**
   `errorInterceptor` is the single reporter; it retries idempotent GETs only —
   a PUT that timed out may have been applied — and leaves 401 to auth and 412
   to `ConflictService`. A request that is *meant* to fail opts out with
   `SILENT_FAILURE`: `/api/setup/status` 404s by design on a configured host, and
   reporting it greeted every user with a red toast in front of a working app.
   Store writes rethrow rather than swallow; `VaultStore.loadError` +
   `retryLoad()` exist because a boot failure that was not a 401 used to leave
   "Loading…" on screen for ever.
17. **Breakpoints live only in `_mixins.scss`** (`$bp-sm/md/lg/xl`, via
   `upto()`/`from()`), grids state a `minmax` minimum and never a column count,
   and below `$bp-lg` nothing interactive renders under `--tap` (44px) — grow the
   *target* with a pseudo-element where the visual box must not grow. The
   sidebar is a `position: fixed` off-canvas drawer there, `inert` and
   `aria-hidden` when closed: an absolute box translated off-screen still widens
   the document, which is what made every screen overflow a phone. The
   responsive pass is a measurement — `scrollWidth === clientWidth` at
   390/768/900 — not a look.
18. **`--danger` is destruction and error; `--warn` is a warning; `--muted` is
   decoration and `--muted-strong` is the secondary type layer.** The raw
   `--accent`/`--accent2` are *fills* (3:1); `--accent-strong`/`--accent2-strong`
   are *type* (4.5:1). Structural scales — `--sp-*`, `--fs-*`, `--dur-*`,
   `--ease-*`, `--z-*`, focus — do not vary by theme. A new theme derives its
   own `--muted-strong`, `--accent-strong`, `--accent2-strong` and `--danger`
   against its own `--bg`, `--panel` **and** `--panel2`, and `themes.spec.ts`
   refuses the palette below 4.5:1. Only `ui-skeleton` may shimmer; a no-image
   state is flat, because a hatch is indistinguishable from a loading shimmer.
   A raw Unicode glyph is not an icon — add a name to `ICON_NAMES`.

## Documentation is part of the change

The technical manual lives in [`docs/manual/`](docs/manual/index.html) — 12
self-contained HTML pages, no build step, no external dependency (it must keep
opening straight off disk over `file://`). It is where the *mechanism* is
written down: how a request travels, why a null is meaningful, what breaks if a
guard is removed. **A feature is not finished until the manual describes what it
did.**

The division of labour is what stops the two from duplicating each other:
**this file commands, the manual explains.** A new rule lands here in one or two
imperative sentences; the diagram, the flow and the consequence land in the
manual. Copy the link, never the whole rule.

Route the update by what you changed:

| Changed | Update |
| --- | --- |
| Entity, column, migration, key, JSON column | `domain-model.html` (tables, migrations, the meaningful-nulls list) and the ER diagram |
| Endpoint, route, status code, header, precondition | `api-reference.html` — plus `VaultApi` on the frontend and `ContractTests` |
| Auth rule, role, query filter, throttle | `security.html` (including the anonymous-route list) and `testing.html` |
| Anything about images: variants, derivation, focal, the collector | `images.html` and the config reference in `operations.html` |
| Page, SPA route, `ui-*` component, store, pure util | `frontend.html` **and** `docs/frontend-standards.md` (the catalog is normative there) |
| Config key, env var, volume, CI step | `operations.html` and `docs/deployment.md` |
| An end-to-end path (login, save, upload, import…) | `flows.html` |
| A test that pins an invariant | the matrix in `testing.html` — the matrix, not the count |
| **Any deliberate trade-off** | a new ADR in `decisions.html`, next free number. Never renumber existing ones |
| A known limitation appeared or was closed | `index.html` (limits) and `security.html` (gaps) |
| A new symptom support will receive | the symptom table in `operations.html` |

Three rules for writing in it, spelled out in
[`docs/manual/maintaining.html`](docs/manual/maintaining.html):

1. **Describe what exists, never what should exist.** Half-finished behaviour is
   documented as half-finished, in a marked callout — a feature documented as
   done when it is not is worse than one that is undocumented.
2. **Prose is pt-BR; identifiers stay in English.** Never translate `If-Match`,
   `ETag`, `ImageGc:GracePeriod`, a file path, or a test name.
3. **State the consequence, not just the mechanism.** "There is an interceptor"
   helps nobody; "without the bump, a stale PUT silently undoes somebody else's
   edit" is the sentence worth writing.

A new page goes in one list — `PAGES` at the top of
`docs/manual/assets/manual.js` — which drives the sidebar, the numbering and the
prev/next links on every page. Diagrams use the theme tokens
(`.box`/`.t`/`.ln` in `assets/manual.css`), never fixed colours: the manual has a
light and a dark theme, like the app.

## ⚠️ Brand governance (pending)

The app currently uses the Collection Control design's own "Vault" theming
(indigo `#5453C4`, 7 switchable themes). The Colecionary brand manual in
`docs/` defines a different identity (Vault Purple `#7C5CFF`, Colecionary
Night `#101827`, dark-first). **No new visual language may be invented beyond
either system.** Reconciling the two requires a formal identity review;
mechanically it is a one-file change (`styles/_themes.scss`).

## Known v1 tradeoffs (documented follow-ups)

JWT in localStorage without refresh tokens; collection members are
denormalized snapshots; invited members can't log in until an invite/set-password
flow exists; images are served via unguessable-GUID URLs (signed URLs later).

Login throttling is real but its state is **in-memory**: a deploy hands every
attacker a clean slate and a scaled-out deployment throttles per node. The
durable form is an `Identity.LoginAttempts` table keyed by `(Kind, Key)`,
deliberately *not* tenant-owned since login precedes any tenant claim.
Login also still **enumerates accounts by timing** — an unknown email skips
PBKDF2 entirely and answers in microseconds, and status, title, body and
headers are otherwise identical, so timing is the whole leak. The fix is a
fixed decoy hash, at the cost of making every unknown-email attempt pay a
PBKDF2. Relatedly, `Identity.Users` has no index on `Email` alone
(`IX_Users_TenantId_Email` leads with `TenantId`), so **every login scans**;
the read-only pre-gate exists so that a refused attempt never reaches SQL.

Concurrency is guarded at **collection** granularity, so two people editing
different items in the same collection will see one of them refused. There is
nowhere to put a per-item token, and the alternative was losing writes
silently.

Roles are enforced **tenant-wide**, not per collection: an Editor can write to
any collection in the account, including one never shared with them.
`CollectionMember.Role` is validated and displayed and grants nothing.

Undo exists for deleting **one item** and nowhere else, and even that is
version-guarded — if the collection moved on, the restore is refused and the
item stays deleted. A restored item lands at the end of its group, because
manual order is the array index. Billing is not implemented and the plan control
says so. `Item.img` is still on the wire, populated, validated and used by
nothing. `GET /api/collections` still returns the whole vault with no
pagination, and the item list is not virtualised — fine at demo size, and the
hardest ceiling in the codebase.
