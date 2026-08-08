# Deployment & release

Colecionary ships as a **single Docker image**: the .NET API serves the built
Angular SPA from `wwwroot`. One process, one port (`80`), amd64 only (SQL
Server has no ARM build).

## Release pipeline

`.github/workflows/release.yml` runs on every push to `main` (and manual
dispatch). It mirrors the Panthor pipeline:

1. **validate** — backend builds in Release (warnings are errors), backend unit
   tests, frontend install + tests + production build. Nothing ships unless
   this passes.
2. **version** — [semantic-release](https://semantic-release.gitbook.io/) runs
   in dry-run to compute the next version from **conventional commits**. No
   release happens if there is nothing releasable (e.g. only `chore:`/`docs:`).
3. **publish** — stamps the version into `Vault.Api.csproj` and
   `frontend/package.json`, then builds and pushes the image to Docker Hub as
   `ricardozambon/colecionary:<version>` and `:latest`.
4. **release** — creates the git tag + GitHub Release **after** the image
   exists, so a tag never points at a missing artifact.

### Versioning = conventional commits

semantic-release decides the bump from commit messages: `fix:` → patch,
`feat:` → minor, `feat!:`/`BREAKING CHANGE:` → major. `chore:`, `docs:`,
`refactor:`, etc. do not trigger a release. Write commits accordingly.

### Required repository secrets

Add under **Settings → Secrets and variables → Actions**:

| Secret | What |
| --- | --- |
| `DOCKERHUB_USERNAME` | Docker Hub account that owns `ricardozambon/colecionary` |
| `DOCKERHUB_TOKEN` | Docker Hub access token (Read/Write) |

`GITHUB_TOKEN` is provided automatically; the workflow requests `contents:
write` so semantic-release can tag and publish the release.

## Running the image

```sh
docker run -d --name colecionary -p 8080:80 ricardozambon/colecionary:latest
```

Open `http://<host>:8080/`. On first run — with no database connection
provided by the environment — the app boots into a **setup wizard** (see the
first-run setup, Phase 3). TLS is expected to terminate at the host/reverse
proxy; the container speaks plain HTTP on `80`.

> Building the image locally: `docker build -t colecionary:dev .` from the repo
> root. (Not runnable in every dev sandbox — the CI build is the source of
> truth for the image.)
