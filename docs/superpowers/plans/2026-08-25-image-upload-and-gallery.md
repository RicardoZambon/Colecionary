# Image upload & gallery — implementation plan

**Goal:** Separate uploading from framing, let the photo manager decide order and cover, and
serve every surface an image sized for it.

**Spec:** `docs/superpowers/specs/2026-08-25-image-upload-and-gallery-design.md`

## Global constraints

- `CLAUDE.md` rules apply — design tokens only, `shared/ui` for every element, no user-facing
  string in a component, signals + OnPush, `npm run build` clean **including warnings**
  (6 kB per-component style budget), `dotnet format --verify-no-changes` clean.
- Backend warnings are errors (`Directory.Build.props`).
- Integration tests need `TESTCONTAINERS_RYUK_DISABLED=true` in this environment: `DOCKER_HOST`
  is `/var/arcane/docker.sock`, a path that does not exist inside the daemon, so the
  Testcontainers reaper fails to bind-mount it.
- Never retro-edit an applied migration.
- No commits — the branch already carries uncommitted currency work and the Archives/Import WIP.

## Task order

| # | Task | Why it must come first |
|---|---|---|
| 1 | `ImageVariant` + `IImageDeriver` contract, ImageSharp implementation | Everything downstream needs the vocabulary |
| 2 | `IImageStore` learns variants; `FileSystemImageStore` derived paths | The deriver needs somewhere to put bytes |
| 3 | `StoredImage.Width/Height` + migration | Derivation backfills them, so the column must exist |
| 4 | `ImageService` derives on upload and on miss; `ImagesController` variant route | The API surface the client will call |
| 5 | Backend tests | Lock 1–4 before the client depends on them |
| 6 | `ImagesApi.url(id, variant)` + `ImageMeta` dimensions | The client vocabulary |
| 7 | Upload decoupled from framing (`ImageFocusService`, `item-form-page`) | Fixes defects 2, 3, 4 |
| 8 | `ui-photo-manager` — reorder, make cover, frame, remove, progress | The curation surface |
| 9 | Item page gallery + lightbox at the right variants | Fixes defect 1 where it was seen |
| 10 | Every other surface onto `thumb`/`display` | Consistency; the perf win |
| 11 | i18n, tests, docs | Definition of done |

## File structure

| File | Change |
|---|---|
| `backend/src/Vault.Domain/Enums/ImageVariant.cs` | Create |
| `backend/src/Vault.Domain/Entities/StoredImage.cs` | Add `Width`/`Height` |
| `backend/src/Vault.Application/Abstractions/IImageDeriver.cs` | Create |
| `backend/src/Vault.Application/Abstractions/IImageStore.cs` | Variant-aware overloads |
| `backend/src/Vault.Application/Images/ImageService.cs` | Derive on upload + on miss |
| `backend/src/Vault.Application/Images/Dtos/ImageDtos.cs` | Meta gains dimensions |
| `backend/src/Vault.Infrastructure/Storage/ImageSharpDeriver.cs` | Create |
| `backend/src/Vault.Infrastructure/Storage/FileSystemImageStore.cs` | Derived paths |
| `backend/src/Vault.Api/Controllers/ImagesController.cs` | `?size=` on the read |
| `frontend/src/app/core/api/images-api.ts` | Variant-aware `url()` |
| `frontend/src/app/core/state/image-focus.service.ts` | Drop `uploadAndFrame` |
| `frontend/src/app/core/state/photo-upload.service.ts` | Create — progress-tracked batch upload |
| `frontend/src/app/shared/ui/photo-manager/photo-manager.ts` | Create |
| `frontend/src/app/shared/ui/lightbox/lightbox.ts` | Create |
| `frontend/src/app/features/collection/item-form-page/*` | Use the manager |
| `frontend/src/app/features/collection/item-page/*` | Gallery + lightbox |
