# Image upload & gallery — design

**Date:** 2026-08-25
**Branch:** `currency-and-decimal-values` (continues on the same branch)
**Areas touched:** `backend/src/Vault.{Domain,Application,Infrastructure,Api}`, `frontend/src/app/{core,shared,features}`

## Problem

Four reported defects, which turn out to be three separate design faults.

| # | Reported | Real cause |
|---|---|---|
| 1 | A large upload renders badly — the browser squeezes the full-size image into a small box | The server stores and serves **original bytes only**. A 6000×4000 phone photo is downloaded in full and downscaled by the browser into a 215×116 card. |
| 2 | Framing is demanded on every upload, but only matters for the cover | `addPhotos` opens the framing editor for `index === 0` of every batch — including batches added to an item that already has photos, where index 0 is not the cover. |
| 3 | Clicking outside the modal cancels the whole upload | `uploadAndFrame` shows the editor **before** uploading, so "cancel" means "throw the file away". The scrim click is wired to that same cancel. |
| 4 | With several files only the first can be framed, and it is forced to be the cover | Cover is implicitly `photoIds[0]`, and nothing can reorder the list. |

Faults 2, 3 and 4 are all the same mistake: **framing was made a step of uploading.**
Fault 1 is independent and lives entirely in the backend.

## Goal

Uploading photos and curating them are two separate acts.

- Dropping files uploads them, immediately, with visible progress and no modal.
- A photo manager afterwards decides order, cover, framing and removal.
- Every surface downloads an image sized for that surface, not the original.

## Design decisions

### 1. Derived sizes, generated on the server

Three sizes, keyed by what they are for rather than by pixels:

| Variant | Longest edge | Used by |
|---|---|---|
| `thumb` | 400 px | item cards, grid tiles, gallery thumbnails, mosaic tiles |
| `display` | 1400 px | gallery main image, collection banner, framing editor stage |
| `full` | — (the original) | the lightbox's "open original", export archives |

`display` is the **default** for a bare `/api/images/{id}` so every existing caller
improves without changing, and no URL already in a cached page breaks.

**Derived bytes are WebP** (quality 82), regardless of source format — it handles both
photographs and transparency, and every browser the app targets decodes it. The one
exception is **GIF, which is never derived**: deriving would drop the animation, so a GIF
serves its original bytes at every variant. That is a deliberate quality-for-honesty
trade: an animated GIF is rare in a collection catalogue and silently freezing it would
be worse than serving it whole.

**Generation is eager at upload and lazy on miss.** Eager keeps the first view fast; lazy
is what makes the feature work for the images already in every existing vault and for
every image that arrives through an archive import. Both paths call the same code, so
there is no second implementation to drift.

**Originals keep their existing path** (`{root}/{tenant}/{id}.{ext}`) and derived files go
to `{root}/{tenant}/derived/{id}_{variant}.webp`. This is what keeps `ExportService` and
`ImportService` working untouched: an archive carries originals, and a restored vault
re-derives on demand.

#### Library choice

`SkiaSharp` + `SkiaSharp.NativeAssets.Linux.NoDependencies`, added to `Vault.Infrastructure`.

ImageSharp was the first choice and the more ergonomic API, and it was tried first. It is
**not usable here**: version 4.x requires a paid Six Labors licence and emits
`warning : No Six Labors license found` on every build without one — and
`Directory.Build.props` makes warnings errors. Older 3.1.x is free for OSI-licensed
projects, but pinning a major version behind on a licence technicality is a liability for
an app that ships as a self-hosted image.

SkiaSharp is MIT with no such condition. The cost is native assets, paid with the
`NoDependencies` variant, which carries its own `libSkiaSharp` and so needs nothing added
to the `aspnet:10.0` runtime image or the Dockerfile.

Decoding goes through `SKBitmap.Decode`, not `SKImage`, because only the former applies
EXIF orientation — without it every portrait phone photo derives on its side.

Decoding is bounded (`MaxBytes` is already 5 MB) and the deriver refuses images whose pixel
count would blow memory, so a "decompression bomb" cannot be uploaded.

### 2. Intrinsic size is metadata

`StoredImage` gains `Width`/`Height`, nullable for rows that predate this. The client uses
them to reserve the right aspect ratio before bytes arrive, which is what stops the gallery
from jumping as photos load. Backfilled the first time an image is derived.

### 3. Upload never opens the editor

`uploadAndFrame` is deleted. The upload pipeline becomes:

```
files ─▶ validate (type, count, size) ─▶ upload each, in order, with progress ─▶ ids appended
```

Framing becomes a thing you *choose* to do to a photo that already exists — the same
`frame(id, usage)` call the "adjust framing" buttons already make. Cancelling it now only
ever means "leave the framing alone"; there is no upload left to lose, which is what makes
the scrim click safe by construction rather than by adding a confirmation prompt.

### 4. Cover is position, and position is editable

The wire contract stays `photoIds: string[]` with the cover at index 0 — no new field, no
migration, and the concept stays legible in the archive format.

What changes is that the order becomes **editable**: each photo in the manager gets
`ui-reorder` (the keyboard-reachable move controls already used for items) plus an explicit
**"Make cover"** action, which is just "move to index 0" with a name a user recognises.

The alternative — a `coverId` field — was rejected: it introduces a second source of truth
that can point at a removed photo, and it would have to be defended in the validator, the
importer and the archive format for no gain over "first one wins".

### 5. The gallery is a viewer

The item page's photo strip becomes a real gallery: thumbnails at `thumb`, main image at
`display`, keyboard-navigable, and a **lightbox** that opens the photo large with arrow-key
paging and a link to the original. This is the surface fault 1 was actually complained
about, so serving it the right bytes is only half the fix — it also needs somewhere to show
a photo properly.

## Out of scope

- Deleting the bytes of a removed photo. Orphan collection is an existing documented gap
  (`CLAUDE.md`, "Known v1 tradeoffs") and derived files inherit it; solving it needs a
  reference-counting pass across items, banners and icons.
- Client-side pre-upload compression. The server now returns right-sized bytes, which is
  the reported problem; shrinking what goes *up* is a separate bandwidth concern.
- Subject detection to pre-fill a focal point. Still a plausible future use of the
  `null` focal, unchanged by this work.
