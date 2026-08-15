# Vault API — .NET 10 backend

ASP.NET Core Web API for Vault (Collection Control): SQL Server + EF Core,
JWT auth, and **server-enforced multi-tenancy via EF Core global query
filters**. Implements the frontend's `VaultApi` contract 1:1.

## Run it

```sh
docker compose up -d              # SQL Server 2022 on localhost:1433 (sa / Your_strong_Pass123)
dotnet run --project src/Vault.Api   # http://localhost:5100 (migrates + seeds in Development)
```

- API reference (dev): http://localhost:5100/scalar
- Demo logins (password `vault-demo`): `marcus@example.com` (Owner),
  `ana@example.com` (Editor), `dev@example.com` (Viewer) — tenant `acme-vault`.

```sh
dotnet build            # warnings are errors
dotnet test             # unit + integration (integration uses Testcontainers → needs Docker)
dotnet format --verify-no-changes
```

## Solution layout

| Project | Contents | Depends on |
| --- | --- | --- |
| `Vault.Domain` | Entities, enums, value objects, `ITenantOwned` | — |
| `Vault.Application` | Services, DTOs (mirror the TS interfaces), FluentValidation validators, repository + `ICurrentTenant` abstractions | Domain |
| `Vault.Infrastructure` | `VaultDbContext`, entity configurations, `TenantStampingInterceptor`, repositories, migrations, seeding, JWT + password services | Application, Domain |
| `Vault.Api` | Controllers, `CurrentTenantFromHttpContext`, ProblemDetails exception handler, `Program.cs` | Application (+Infrastructure for DI) |

## Multi-tenancy (the core design)

1. Every tenant-owned entity implements `ITenantOwned` and carries `TenantId`.
2. `VaultDbContext` applies a **global query filter by convention** to every
   `ITenantOwned` entity: `e.TenantId == CurrentTenantId`, where
   `CurrentTenantId` delegates to the scoped `ICurrentTenant` (JWT claims).
   Every query is tenant-filtered automatically — services and repositories
   never write `WHERE TenantId = …` by hand.
3. `TenantStampingInterceptor` stamps `TenantId` on inserts and **rejects any
   write carrying a foreign tenant id**.
4. Composite primary keys — `(TenantId, Id)` for collections,
   `(TenantId, CollectionId, Id)` for children — make cross-tenant references
   impossible at the database level, and let two tenants own the same public
   string id (e.g. both importing the `store_ps1` checklist).
5. `Tenant` and `StoreListing` (global catalog) are deliberately unfiltered.

Tenant isolation has dedicated integration coverage in
`tests/Vault.IntegrationTests/TenantIsolationTests.cs`.

## Physical naming

Every table is **PascalCase and explicitly schema-qualified** — no object
resolves through the caller's default schema. Schemas are declared once in
`VaultSchemas` and grouped by concern, so a role can be granted the store
catalogue without being granted the whole database:

| Schema | Tables |
| --- | --- |
| `Identity` | `Tenants`, `Users` |
| `Catalog` | `Collections`, `CollectionMembers`, `Groups`, `Items` |
| `Store` | `StoreListings` |
| `Storage` | `Images` |

Columns are PascalCase too, including the JSON container columns
(`Items.Custom`, `Items.Copies`, `Groups.Fields`, `StoreListings.Items`).
`TableNamingConventionTests` enforces all of this against the built model, so a
new entity mapped with a bare `ToTable("thing")` fails the unit tests instead of
shipping a stray lowercase table into `dbo`.

Two deliberate exceptions:

- **`dbo.__EFMigrationsHistory` stays in `dbo`.** EF reads it *before* it can
  apply anything, so relocating it on an existing database would make EF see
  zero applied migrations and try to re-run the whole chain.
- **Migrations before `UseSchemaQualifiedPascalCaseNames` still reference the
  old lowercase names.** That is correct: they ran against the old shape, and
  the raw-T-SQL backfills in `AddItemCopies` / `AddGroupFieldTypesAndSort`
  execute before the rename. Never retro-edit them.

Note that `Identity` and `Storage` are T-SQL keywords: hand-written ad-hoc SQL
needs `[Identity].[Tenants]`. EF always brackets, so application code is fine.

## Image storage

Image **bytes live on disk, not in SQL.** `Storage.Images` is metadata only —
which tenant owns an id, its content type, when it was uploaded — and the bytes
go through `IImageStore`. `FileSystemImageStore` lays them out as:

```
{ImageStorage:Root}/{tenantId}/{imageId}.{ext}      # default root: App_Data/images
```

**One directory per tenant**, so images are a unit you can copy, quota or delete,
and no lookup can wander into another tenant's files. Both path segments are
GUIDs we format ourselves, never caller-supplied strings, so nothing can traverse
out of its folder. The extension comes from the content type, which is immutable
once written — retyping an image would orphan the file it names.

The read endpoint stays anonymous (an `<img>` tag can't send an Authorization
header), and is still safe because the **tenant is resolved from the image's own
row before storage is touched**: a guessed GUID can only ever resolve inside the
tenant that owns it. Never pass the ambient request tenant instead.

Uploads write the file *before* the row. The failure modes aren't symmetric — a
file with no row is unreachable garbage, while a row with no file is a broken
image in the UI. (Orphans are the same known gap as replaced images; collecting
them is a documented follow-up.)

### Framing (focal point)

`Storage.Images` also carries `FocalX`/`FocalY` — nullable fractions (0–1) naming
which part of the picture matters. The client renders them as a CSS
`background-position`, so one point serves every aspect ratio the UI crops to
(1:1 icon through ~9:1 banner) without generating a single derived file. **Null
is meaningful:** it means "never framed", which renders centred, and stays
tellable from a deliberate centre so a future subject-detection pass can fill it
in without overwriting a human choice. Both axes must be present for the pair to
mean anything; a half-written row degrades to unframed.

Framing never touches the bytes, which is what keeps the read endpoint's
`immutable` cache header honest — the id and its URL stay valid.

The write is **tenant-filtered**, deliberately unlike the read: `ImageService`
resolves it through `GetForCurrentTenantAsync`, never `GetUnfilteredAsync`.
Ignoring the filter is only defensible for the anonymous byte read, where the
unguessable id is the capability. A write has no such excuse — routed through
the unfiltered read, one tenant could reframe another's image. Going through the
global filter means a foreign id simply doesn't exist, so the caller gets a 404
and learns nothing. `ImageFocalTests` pins that.

### Migrating an existing database

`MoveImageBytesToFileStorage` drops the old `varbinary(max)` column, and a
migration can't write files — so `LegacyImageBlobExporter` runs at startup
**before** `Database.Migrate()`, copies every blob to the store, and lets the
migration drop the column immediately after. One deployment, no data loss, and a
no-op on every subsequent start.

Because the export lives in startup, **don't apply this migration with a bare
`dotnet ef database update`** against a database that still holds blobs — that
drops the bytes. Start the API instead; it does both, in the right order.

## Export

`GET /api/export` streams a zip of the caller's tenant:

```
collections.json          # same shape as GET /api/collections
images.json               # id, content type and focal point for each image
images/{imageId}.{ext}    # every image that tenant owns
```

`images.json` exists because framing lives on the image row, not in the
collection graph: without it an archive would restore every photo centred, and
the user's framing would be lost silently.

This used to be a browser-side JSON blob of whatever the tab had in memory. It
moved server-side so it can include image bytes (unreachable from the client as
data) and so the same global query filters that protect every other read also
scope the export. Images are stored uncompressed in the zip — every format we
accept is already compressed.

The archive is built into a temp file rather than written straight to the
response: `ZipArchive` emits its central directory with a *synchronous* write on
dispose, which Kestrel rejects on the response body. The alternative,
`AllowSynchronousIO`, would block a request thread for the whole download.

## Auth

`POST /api/auth/login` verifies credentials (ASP.NET Identity's
`PasswordHasher` — the only piece of Identity used) and issues an HS256 JWT
with `sub`, `tenant_id`, `role` and `plan` claims (8 h lifetime). Everything
else requires a bearer token (deny-by-default fallback policy);
`PUT /api/tenant/members` additionally requires the `Owner` role.

Known v1 tradeoffs: JWT lives in browser localStorage (no refresh tokens yet),
no optimistic concurrency on the full-document collection PUT. Both are
documented follow-ups.

## Endpoints

| Method | Route | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | anonymous |
| GET / POST | `/api/collections` | list (full graphs) / create |
| PUT / DELETE | `/api/collections/{id}` | full-document replace / delete |
| POST | `/api/collections/import/{listingId}` | 409 "Already in your vault" on re-import |
| PUT / DELETE | `/api/collections/{cid}/items/{itemId}` | upsert by client-generated id / idempotent delete |
| GET | `/api/store/listings` | global catalog |
| POST | `/api/images` | multipart upload (≤5 MB, image/* only) → `{ id }` |
| GET | `/api/images/{id}` | anonymous by design — the GUID is the capability (`<img>` can't send auth headers) |
| GET | `/api/images/meta` | the caller's own image metadata (id, content type, focal) |
| PUT | `/api/images/{id}/focal` | sets/clears the focal point; tenant-filtered, so a foreign id 404s |
| GET / PUT | `/api/tenant/members` | PUT is Owner-only |
| GET / PUT | `/api/profile` | email immutable in v1 |
| GET | `/api/export` | zip: `collections.json` + `images/…` for the caller's tenant |

JSON is camelCase with string enums — byte-compatible with the Angular
models in `frontend/src/app/core/models/`.

### Item copies

An `Item` is the catalogue entry; the physical copies live in
`Copies : List<ItemCopy>`, persisted as a single JSON column (`copies`) via
`OwnsMany(...).ToJson()`, the same pattern as `custom`. Each copy carries its
own `Condition`, `Price` paid, optional `Value` override (null = inherit the
item's per-unit `Value`), `AcquiredOn` (`DateOnly?`, serialised `yyyy-MM-dd`),
`Status` (`Keep`/`ForTrade`/`ForSale`) and `Notes`.

**Ownership is derived, never transported:** an item with at least one copy is
owned, one with none is on the wantlist. `ItemDto` deliberately has no `owned`
field — it round-trips GET → PUT, so a value the server computes but ignores on
input would desynchronise silently. `Item.Condition`, `Item.Price` and
`Item.Owned` were removed in the `AddItemCopies` migration, which backfills one
copy per previously-owned item.

Two details are load-bearing and pinned by unit tests
(`Vault.UnitTests/ItemCopyJsonShapeTests.cs`): the copy enums must keep their
`HasConversion<string>()` (an unconverted enum is written into JSON as an
integer), and the JSON property names must keep their `HasJsonPropertyName` —
the migration wrote that document once from raw T-SQL and never regenerates it,
so a rename would orphan existing data with no error anywhere.

### Group fields and ordering

A `Group` declares the custom fields its items (and its sub-groups' items) can
carry, plus the order those items default to:

- `Fields : List<GroupField>` — `{ Name, Type }` where `Type` is
  `Text`/`Number`/`Date`. Persisted as a JSON document in the **existing**
  `Fields` column via `OwnsMany(...).ToJson("Fields")`; it used to be an EF
  primitive collection of plain strings, and `AddGroupFieldTypesAndSort`
  rewrites the documents in place. The same two rules as `copies` apply and are
  pinned by `Vault.UnitTests/GroupFieldJsonShapeTests.cs`: keep the
  `HasConversion<string>()` on `Type` and the `HasJsonPropertyName` on both
  properties.
- `SortBy` / `SortDirection` — two nullable scalar columns rather than a JSON
  document, so they carry no pinned-name risk. `SortBy` is a built-in key
  (`manual`, `added`, `name`, `value`, `year`) or `field:<field name>`;
  `SortDirection` is `asc`/`desc`. They travel as one nullable `sort` object on
  the wire (`GroupSortDto`), because half a configuration is not a
  configuration — `ToDto` defaults a missing direction to `asc`.
- `Target : int?` — the declared size of the complete set the group stands for
  (a 120-issue run, a 24-card set), so the client can show progress against the
  series rather than only against what has been catalogued. Also a scalar
  column, for the same no-pinned-names reason. **`null` means "no target
  declared"** and is deliberately distinct from any number: a non-nullable
  `int` would default to `0` and silently declare every existing group an empty
  series. `GroupNodeDtoValidator` accepts null or `1..100_000` — zero is not a
  series, and the ceiling is a plausibility guard against a mistyped paste.
  A target **below** the items already catalogued is accepted **on purpose**:
  groups and items arrive in the same document, so cross-checking them would
  make declaring a target before cataloguing impossible and would block the
  whole collection from saving until the user deleted items. The overrun is a
  display concern. `ImportStoreListingAsync` derives a target from the
  listing's per-group item count, because a curated checklist *is* the declared
  set.

Values still live on the item as `Custom` strings: the type belongs to the
declaration, so retyping a field never rewrites item data. Sorting and the
owned/missing arithmetic both stay client-side; the server only stores the
declarations. There are **no group endpoints** — groups change only through the
full-document collection PUT, which means `CollectionRepository.ReplaceGraph`
must copy `SortBy`, `SortDirection` **and `Target`** in its group lambda, by
plain assignment and never a coalesce. Miss one and the setting saves on create
and then silently never changes again; coalesce it and clearing it back to null
becomes impossible. `ContractTests` PUTs the same collection three times
specifically to catch both, and the third PUT clears the sort and the target
back to null.

`AddGroupFieldTypesAndSort` converts `["Número"]` to
`[{"Name":"Número","Type":"Text"}]` with `OPENJSON` + `FOR JSON PATH` (which
escapes user-supplied field names for us). The `COALESCE(..., N'[]')` around it
is load-bearing: `FOR JSON PATH` over zero rows returns `NULL`, so without it
every group that had no fields would have its column nulled out.
