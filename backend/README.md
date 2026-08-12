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
- Demo logins (password `vault-demo`): `marcus@airia.com` (Owner),
  `ana@airia.com` (Editor), `dev@airia.com` (Viewer) — tenant `acme-vault`.

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
| GET / PUT | `/api/tenant/members` | PUT is Owner-only |
| GET / PUT | `/api/profile` | email immutable in v1 |

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

Values still live on the item as `Custom` strings: the type belongs to the
declaration, so retyping a field never rewrites item data. Sorting itself stays
client-side; the server only stores the preference. There are **no group
endpoints** — groups change only through the full-document collection PUT,
which means `CollectionRepository.ReplaceGraph` must copy `SortBy` and
`SortDirection` in its group lambda. Miss one and the setting saves on create
and then silently never changes again; `ContractTests` PUTs the same collection
three times specifically to catch that, and the third PUT clears the sort back
to null.

`AddGroupFieldTypesAndSort` converts `["Número"]` to
`[{"Name":"Número","Type":"Text"}]` with `OPENJSON` + `FOR JSON PATH` (which
escapes user-supplied field names for us). The `COALESCE(..., N'[]')` around it
is load-bearing: `FOR JSON PATH` over zero rows returns `NULL`, so without it
every group that had no fields would have its column nulled out.
