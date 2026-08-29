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
image in the UI. Both that residue and images nothing points at any more are
reclaimed by the garbage collector below, on a grace period.

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

### Collecting what nothing points at any more

Removing a photo from an item used to leak: the id left `photoIds`, the row
stayed in `Storage.Images` for ever and the bytes stayed on disk for ever. That
is now collected — **on a grace period, never on the dereference**.

`ImageGarbageCollector` (Application) is the policy;
`ImageGarbageCollectionService` (Api) is a `BackgroundService` that runs it on a
timer and writes down what it did. There is no endpoint and no CLI: the API
contract mirrors the frontend's `VaultApi` one-for-one, so a route no user calls
would be a contract change on both sides, and an authenticated endpoint that
deletes data permanently is attack surface bought for nothing.

**Mark and sweep, because dereferencing is not a decision.** A sweep records the
first moment an image reads as unreferenced (`Images.UnreferencedSinceUtc`),
clears that mark the instant anything points at the image again, and only
destroys bytes once the mark has stood for the whole grace period. Deleting the
moment a reference disappears would couple irreversible destruction to the
full-document collection PUT — last-writer-wins, and today with no optimistic
concurrency — so two open tabs, a partial client payload or a bad merge would
take photographs with them, permanently, with no backup anywhere in the system.

The mark is a better quarantine than moving the bytes aside would be. While it
stands the image is **not degraded at all**: still served, still exported, still
framable. An accidental dereference noticed inside the window costs nothing and
needs no restore procedure — the mark is simply cleared. And because the mark is
a column rather than in-process state, it survives restarts and deploys, which
an in-memory "I have seen this unreferenced for N days" counter would not (that
design is only ever safe by being useless: a process that restarts weekly never
finishes a 30-day observation).

**Saving a collection clears the mark itself**, rather than leaving it to the
next sweep. A sweep only learns what it looks at, so a reference that appeared
and disappeared between two of them would never be observed, and the image would
then be destroyed on a clock started before it was ever used — the real undo
window would be the sweep interval, not the grace period. That write-path clear
is **tenant-filtered**, deliberately unlike the sweep's: its ids come from a
request body, and pointing at somebody else's photograph must not reset their
storage clock. A cross-tenant reference keeps the weaker, sweep-observed
guarantee.

`CreatedAtUtc` cannot be that clock, which is why the column exists.
Creation time answers "how old is this picture" — a photo uploaded a year ago
and dropped from an item this morning is older than any grace period on its
first sweep. It is still consulted as a **second, independent** condition,
because it is what covers the window between bytes being uploaded from the
picker and the item that will carry them being saved. That window has no upper
bound: the form can sit open indefinitely.

The grace period is also what reconciles the collector with the whole-vault
export, which deliberately packs *every* image a tenant owns rather than only
the referenced ones, "since an image not currently on an item is still the
user's". That is a statement about a photo mid-workflow — a state this app
reaches on every single upload. Thirty days keeps that promise. What it stops
keeping is the promise that a photo nothing has pointed at since last month is
worth storing for ever, which is the promise that makes a storage quota
impossible to offer honestly.

**Reachability is computed globally, across every tenant, and that is the most
dangerous line in the feature.** `ListReferencedImageIdsAcrossAllTenantsAsync`
reads banners, icons and item `photoIds` with `IgnoreQueryFilters()` on every
query. Without it the filter resolves `CurrentTenantId` against whatever tenant
is in scope — outside a request, none — and the sweep would compute an *empty*
reference set while reading every image row in the installation. Global is also
the correct answer on its own terms: nothing validates that a banner or a photo
id belongs to the tenant that wrote it, and the anonymous read resolves an id
through the image's own row, so a cross-tenant reference is one that actually
renders. Over-collecting the reference set is the safe direction;
under-collecting destroys photographs. `photoIds[0]` needs no special case — the
cover is a position in that list, not a column.

Deletion always addresses **the tenant on the image's own row**, never an
ambient one, exactly like the anonymous read. Renditions go with the original,
found by the id's own prefix rather than by rebuilding each variant's name: a
JPEG's cached copies are `.webp`, so reconstructing them from the row's content
type would delete nothing and move the leak instead of fixing it.

Two more guards sit on top. The doomed batch is re-checked against a **freshly
read** reference set immediately before anything is destroyed, so a PUT that
landed during the sweep still wins; and the row is deleted before the bytes —
the mirror of how an image is created — so an interruption leaves a file nothing
names rather than a row whose picture is gone.

A separate pass reclaims **bytes no metadata row has ever named**: uploads and
imports both write the file before the row, so a crash in between leaves
something no query can see. It is guarded three ways — only files older than the
whole grace period, only ids with no row anywhere, and a file whose id belongs to
a *different* tenant's row is reported and left alone rather than resolved either
way. Anything the store cannot classify is skipped outright: an unrecognised
name is somebody else's file.

**The defaults are inert.** This is the only code in the application that
destroys user data permanently, so two separate deliberate acts stand between a
deployment and a lost byte:

```json
"ImageGc": {
  "Enabled": false,          // off: the background service is not even registered
  "DryRun": true,            // reports exactly what it would remove, writes nothing
  "GracePeriod": "30.00:00:00",
  "Interval": "06:00:00",
  "InitialDelay": "00:05:00",
  "BatchSize": 200,          // bounds one sweep's blast radius
  "CollectOrphanFiles": true
}
```

A grace period under an hour fails at startup rather than being rounded into
something plausible — it would turn mark-and-sweep back into
delete-on-dereference, which is the one shape this design exists to avoid.
`ImageReferenceCoverageTests` fails the build if a GUID-shaped column appears in
the model that nobody has classified as an image reference or as something else,
so a new reference site cannot be added and forgotten; its blind spot is a
reference stored as a string, which is why `Item.Img` — free text named like an
image, holding a slug of the item's own name — carries its own written argument
in `CollectionRepository`.

**Turn it off before restoring from a backup.** The sweep believes the database
about what exists and storage about what is on disk. Restore one without the
other — an older database beside a current image directory, or the reverse — and
every file the restored database has forgotten reads as garbage older than the
grace period, because `rsync -a` and friends preserve modification times. Set
`Enabled` to false (or `DryRun` back to true) until the two are known to agree.

Known limits: a server clock that jumps forward makes everything already marked
ripe at once, bounded only by `BatchSize` per sweep; two app instances sweep
independently (harmless — every operation is idempotent, and both compute the
same answer); the re-check narrows the window between deciding and deleting but
does not close it, which would need a lock across the whole catalogue; and a
`Storage.Images` row whose file is missing is left alone rather than tidied,
because "the bytes are gone" is a restore problem, not evidence about a
reference.

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
manifest.json             # what this file is, and which layout version wrote it
collections.json          # same shape as GET /api/collections
images.json               # id, content type and focal point for each image
images/{imageId}.{ext}    # every image that tenant owns
```

`GET /api/export/collections/{id}` writes the same format at a narrower scope:
`collection.json` (one object, not an array) and only the images that
collection actually references — a collection is a self-contained thing to hand
to someone, and packing the tenant's unrelated photos into it would leak
everything else they own.

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

## Import

`POST /api/import` reads either archive back — the entry that is present
(`collection.json` or `collections.json`) decides which, since a hand-edited
manifest can lie and an entry cannot. The zip goes up as the raw request body.

- **Images are copied, never referenced.** An id in an archive belongs to
  whoever exported it, so every photo is written afresh under a new id in the
  importing tenant's storage and every reference is remapped. Framing rides
  along on `images.json`.
- **Overwriting is the user's decision, never a default.** When the archive
  holds a collection the vault already has *by name*, the request answers
  **409** with an `ImportPlan` — every collection in the file, each paired with
  the live one it would land on — and writes nothing. The client asks, then
  posts the same file again with `?confirmed=true&replace=<id>&replace=<id>`.
  Ids named there are overwritten; everything else lands as a new collection.
  An archive with no name collisions imports on the first request.
- **Overwriting replaces, and never merges.** It goes through the same
  `ReplaceGraph` the full-document PUT uses, so the collection ends up holding
  exactly what the archive holds: an item the archive lacks is an item the
  collection loses. The collection keeps its id, so its links keep working.
- **Creating instead keeps nothing of the live one.** The archived collection
  keeps its own id when that id is free — restoring one you deleted brings back
  its links — and is renamed when the name is taken, so two identically named
  collections never appear.

Matching is by name rather than by id, trimmed and case-insensitive, because
that is what the user recognises: a collection restored once already carries a
different id, and matching on ids would offer to overwrite nothing while a
same-named duplicate piled up beside it. Names are not unique in this model, so
the plan answers with an id, which is.

The second upload is deliberate. Parking the first one server-side between the
two requests would save the bytes and cost a stash with a lifetime, an expiry
and a cleanup path; a stateless retry has none of that, and an archive with
nothing to ask about never pays it.

### Archive versioning

`manifest.json` carries `ArchiveManifest.CurrentVersion`, and the import gate
is one-directional: **older is readable, newer is refused.** Every entry a past
version wrote is one this build still understands, and a field it never wrote
deserialises to the same default an absent field always meant. The reverse has
no such guarantee — a newer layout may have moved or re-scoped a field, and
reading it under today's shapes would not fail, it would *succeed quietly* and
write nonsense into the vault. A missing manifest is not an error: archives
predating it are v1 by definition.

So a change costs a version bump only when a reader that does not know about it
would misread the file. Adding an optional field or a new entry does not;
renaming a field, changing what one means, or changing a unit does. The check
lives in `ArchiveCompatibility` — pure, and unit-tested — and runs before the
first byte is written, so a refusal leaves nothing behind.

## Auth

`POST /api/auth/login` verifies credentials (ASP.NET Identity's
`PasswordHasher` — the only piece of Identity used) and issues an HS256 JWT
with `sub`, `tenant_id`, `role` and `plan` claims (8 h lifetime). Everything
else requires a bearer token (deny-by-default fallback policy);
`PUT /api/tenant/members` additionally requires the `Owner` role.

### Brute-force protection

Login is the only anonymous write in the app, so it is the only door worth
knocking on. `ILoginAttemptTracker` counts recent attempts in **two dimensions
at once**, because neither is sufficient alone:

| Dimension | Limit | Penalty | Why it is shaped that way |
| --- | --- | --- | --- |
| Account | 10 failures / 5 min | 5 min, doubling per consecutive trip, capped at 30 min | An account is one person's, so escalating is affordable |
| Client address | 30 failures / 5 min, and 8 attempts in flight | 5 min, flat / retry in 1 s | An address is shared (NAT, CGNAT, a household), so escalating it punishes bystanders |

Throttling only the address is weak against an attacker spread over a botnet
and punishes everyone behind one office egress; throttling only the account
hands any stranger a denial of service against a named user, since failing
someone else's logins is free. Together, the address rule costs a distributed
attacker addresses and the account rule costs them time.

Six decisions are load-bearing:

- **A correct password is never rate limited.** The account's budget is charged
  as the attempt starts and refunded the moment it succeeds; an address is
  charged only when an attempt fails. So the person who has forgotten which
  password they used is not punished for finally remembering it, and an office
  behind one address never spends its budget on people who are signing in fine.
  A success deliberately does *not* touch the *address* record — otherwise every
  credential-stuffing run would park one working login between batches.
- **The penalty escalates; it never becomes a lockout.** A hard lockout needs a
  human to undo, which turns "I fail your logins" into "your account is gone
  until support answers". A delay that always expires on its own degrades that
  attack into an inconvenience while still cutting the guess rate by orders of
  magnitude. The 30-minute cap bounds what one burst of ten failures can buy.
- **Concurrency is part of the limit, not an afterthought.** A gate that only
  *reads* state can be walked past by a burst: a thousand parallel guesses all
  pass a check none of them has paid for yet. The account is therefore charged
  inside the same lock that checks it. The address cannot be — a crowd of
  *legitimate* simultaneous sign-ins would trip a shared identifier before any
  of them was refunded — so it gets an in-flight cap instead, which costs a
  crowd a retry rather than a five-minute outage. Both are pinned by concurrent
  tests.
- **Every spelling of one account is one budget, and accounts that do not exist
  are counted too.** The key is the *stored* email when the user exists, since
  SQL Server matches case-insensitively and keying on what was typed would mint
  a fresh allowance per capitalisation. The unknown-account key is the same
  normalization of what was typed — bounded, stripped of characters the collation
  weighs as nothing, width-folded, lower-cased, and **trimmed last**. Those two
  derivations have to agree, or eleven requests would answer whether an account
  exists: ten at an invisibly different spelling, one at the plain one, and
  429-vs-401 tells you whether the database folded them together. The trim being
  last is part of that — stripping an invisible character exposes a trailing
  space that was hiding behind it, normalization turns a no-break space into a
  plain one, and SQL Server ignores trailing spaces, so a leading-only trim
  reopens the oracle. `FindForLoginAsync` names its collation
  (`Latin1_General_CI_AS`) for the same reason: a database restored with an
  accent-insensitive one would start folding spellings the key does not. Both
  dimensions answer with the *same* message for the same reason.
- **The check runs inside the controller action, not in a middleware ahead of
  the pipeline.** It needs the submitted email, which exists only after model
  binding; and only code downstream of `UseRequestLocalization` builds its title
  in the culture the client asked for (see the ordering rule in CLAUDE.md). The
  429 carries `Retry-After`, which the CORS policy exposes so the SPA can read
  it.
- **Both inputs are length-capped** (`LoginRequestValidator`). This was the only
  email rule in the app without one, on the one endpoint that is anonymous, and
  the throttle would have retained whatever arrived as a dictionary key for an
  hour — a 30 MB address is a memory exhaustion attack, and a 30 MB password is
  a PBKDF2 on demand.

Limits bind from the `LoginThrottle` configuration section (defaults in
`appsettings.json`, and again in `LoginThrottleOptions` so an operator who omits
the section is still protected); a nonsensical combination fails at startup
rather than silently serving an unprotected endpoint. Memory is bounded by
`MaxTrackedRecords`: eviction spares records serving a live penalty while
anything else can go, and when *everything* is blocked it drops the one closest
to expiring — refusing to track new keys instead would let a flood switch the
account rule off for everyone not already in the table.

**Behind a reverse proxy, say so.** `RemoteIpAddress` is the connection's
address, which behind nginx/Traefik/Cloudflare is the *proxy* — every caller in
one bucket, so thirty failed logins from anyone would answer 429 to the whole
deployment. Name the proxies you trust and the app reads `X-Forwarded-For`
instead:

```json
"ForwardedHeaders": { "KnownProxies": ["10.0.0.2"] }
```

It is opt-in because the failure mode is asymmetric: trusting the header
unconditionally would let any caller name their own address and mint a fresh
budget per guess, which is worse than having no address dimension at all. With
no proxy in front of the app, leave it empty.

**What it does not survive.** The state is in memory, so a restart clears every
counter and a scaled-out deployment throttles per node — acceptable while the
app is single-instance, and fixable only with a shared store. When the host
cannot see an address at all the address dimension is skipped rather than
sharing one bucket, because a single attacker throttling the entire deployment
is worse than no address rule.

Known v1 tradeoffs: JWT lives in browser localStorage (no refresh tokens yet),
no optimistic concurrency on the full-document collection PUT, and the login
throttle's counters do not survive a restart. All are documented follow-ups.
(The concurrency gap is why image collection runs on a grace period rather than
on the dereference — see "Collecting what nothing points at any more".)

## Endpoints

| Method | Route | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | anonymous; throttled per account and per address, 429 + `Retry-After` |
| GET / POST | `/api/collections` | list (full graphs, each in a `{ version, collection }` envelope) / create (`ETag`) |
| PUT / DELETE | `/api/collections/{id}` | full-document replace, **`If-Match` required** → `ETag` / delete (no precondition) |
| POST | `/api/collections/import/{listingId}` | 409 "Already in your vault" on re-import; answers with an `ETag` |
| PUT / DELETE | `/api/collections/{cid}/items/{itemId}` | upsert by client-generated id, **`If-Match` required** / idempotent delete; both answer with an `ETag` |
| GET | `/api/store/listings` | global catalog |
| POST | `/api/images` | multipart upload (≤5 MB, image/* only) → `{ id }` |
| GET | `/api/images/{id}` | anonymous by design — the GUID is the capability (`<img>` can't send auth headers) |
| GET | `/api/images/meta` | the caller's own image metadata (id, content type, focal) |
| PUT | `/api/images/{id}/focal` | sets/clears the focal point; tenant-filtered, so a foreign id 404s |
| GET / PUT | `/api/tenant/members` | PUT is Owner-only |
| GET / PUT | `/api/profile` | email immutable in v1 |
| GET | `/api/export` | zip: `collections.json` + `images/…` for the caller's tenant |
| GET | `/api/export/collections/{id}` | zip of one collection and only the images it references |
| POST | `/api/import` | raw-body zip; 409 + `ImportPlan` when a name collides, `?confirmed=true&replace=<id>` answers it; refuses a newer archive format; answers with `{ version, collection }` per collection |

JSON is camelCase with string enums — byte-compatible with the Angular
models in `frontend/src/app/core/models/`.

## Optimistic concurrency on the collection PUT

`PUT /api/collections/{id}` replaces the **whole document**, and
`ReplaceGraph`/`MergeByKey` delete every group, item and member the payload does
not carry. A client working from a version somebody has already replaced
therefore does not overwrite part of their work — it restores an old document
over all of it, with no error and no trace. `Catalog.Collections.Version` is
what stops that.

**The precondition is mandatory.** A write with no `If-Match` is refused with
**428 Precondition Required**; one quoting a superseded tag with **412
Precondition Failed**. Both write nothing at all. An *optional* precondition
would protect only the clients that already remember to send one — which is
exactly the set of clients that were never going to lose anybody's work — so
"absent" is refused rather than treated as "no opinion". `*` and weak tags are
refused as 428 too: `If-Match: *` means "if the resource exists at all", which
would be an opt-out wearing the right clothes, and `If-Match` is defined to
compare strongly so a weak tag can never identify a version.

**The version belongs to the aggregate, not to the row.** An item write touches
no column on `Collections`, yet a client that has not seen that item must not be
allowed to PUT the document over it. `CollectionVersionInterceptor` therefore
advances `Version` whenever *any* entity under the collection is added, changed
or removed, and **throws** when a child is written without its collection in
scope — a write that reached SQL without a bump would be a silently lost update.
That is also why this is a counter and not a SQL `rowversion`: a rowversion moves
only when its own row is updated, which is precisely the case an item edit is
not.

The interceptor walks EF-owned entities up to their principal, and that is
load-bearing rather than tidy. An item's `Copies` and `Custom` and a group's
`Fields` are owned entities mapped to JSON columns, and rewriting one leaves the
row that carries it `Unchanged` — so matching on entity type alone saw nothing
for such a write: no bump, and no `UPDATE` of the root either, which means the
concurrency token was never consulted and the write went through completely
unguarded. The owned entry carries its principal's key under names EF composes
(`Item.TenantId` becomes `ItemTenantId` on `ItemCopy`), so the names are resolved
through the ownership foreign keys rather than guessed.

**Two guards, catching different things.** `CollectionService.UpdateAsync`
compares the loaded version against `If-Match` and refuses before writing
anything — that is the ordinary stale-tab case, and refusing early is what keeps
a rejected PUT from clearing an image's garbage-collection mark (see *Collecting
what nothing points at any more*). It cannot catch two writers who both read the
same version in the same instant; `IsConcurrencyToken()` does, inside the UPDATE,
and EF's transaction takes the loser's child writes back with it.
`WhenBothWritersPassTheirPrecondition_TheDatabaseStillLetsOnlyOneThrough` builds
that interleaving by hand, because it cannot be provoked reliably over HTTP — and
it is the only test that fails if the token is removed.

**The deletes demand nothing and honour what they are given.**
`DELETE /api/collections/{id}` and `DELETE …/items/{itemId}` do not *require* a
precondition: a delete is intent about a resource's identity, not a document
derived from a read, so there is nothing in it a stale caller could overwrite
unknowingly. An `If-Match` a caller chooses to send is still evaluated, as
RFC 9110 §13.1.1 requires — silently dropping it would make the safest thing a
client can do indistinguishable from the least safe. Both still *move* the
version (the item delete through the interceptor), or a client that had not seen
the delete would PUT the document back and resurrect what it removed.

There is a consequence worth knowing: because `Version` is a concurrency token,
EF puts it in the `WHERE` of the collection `DELETE` and of the root `UPDATE` the
item delete's bump produces. A delete that races a concurrent write to the same
collection is therefore refused with a 412 rather than succeeding, even though it
sent no precondition. Nothing partial commits and a retry works; it is a rare,
safe, retryable race rather than a lost update, and it is left as such because
unguarding those two statements would mean reaching around the token.

**An import that overwrites is guarded too, through the plan.** It runs the very
same wholesale `ReplaceGraph`, so the same rule has to hold — but the decision is
made in one request and acted on in another, with a dialog and a second upload in
between, and a single `If-Match` header cannot speak for several collections at
once. So `ImportEntry` carries the version of the collection it would land on,
and the client sends it back: `?confirmed=true&replace=<id>&replaceVersion=<tag>`,
two parallel lists that the server refuses if they do not line up. If any chosen
collection has moved on, the import answers **409 with a fresh plan** — the same
channel the first question used — and the user answers again against what is
actually in the vault. Without this the endpoint was a full-document
last-writer-wins replace with no precondition available to a client at all; an
adversarial review demonstrated the lost update, and
`Import_RefusesAnOverwriteDecidedAgainstAVersionThatHasMovedOn` is the test that
now fails without the check.

**Item writes are guarded by the *collection's* version**, which over-refuses.
Two people editing different items in one collection will see one of them
refused. The alternative was no check at all — there is nowhere to put a per-item
token, since versions reach the client through the collection list and an item
token would have to ride inside `ItemDto`, which is also the archive's on-disk
format — and no check means two people editing *the same* item overwrite each
other in silence. Over-refusing costs a reload; under-refusing costs the work.

**The version travels as an opaque entity-tag.** `CollectionVersions.ToETag`
formats it in one place, and nothing outside that file parses the digits — which
is what would let the token become a `rowversion` later without touching a line
of the frontend. It reaches the client as an `ETag` header on every
single-collection response and inside a `{ version, collection }` envelope on
the list, because a header describes one resource and the list is where this
client synchronises. It is deliberately *not* a field on `CollectionDto`: that
DTO is byte-for-byte what an exported archive holds, and a concurrency token has
no business in a backup.

`ETag` is listed in the CORS `WithExposedHeaders`. Without it the dev SPA —
cross-origin until the build lands in `wwwroot` — cannot read a version back off
a write, and every save after the first would be refused.

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
