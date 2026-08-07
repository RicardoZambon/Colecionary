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
