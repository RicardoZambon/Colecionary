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
docker run -d --name colecionary \
  -p 8080:80 \
  -v colecionary-config:/data/config \
  ricardozambon/colecionary:latest
```

Open `http://<host>:8080/`. TLS is expected to terminate at the host/reverse
proxy; the container speaks plain HTTP on `80`.

### First-run setup

With no connection string provided by the environment, the app boots into
**setup mode** and serves a wizard:

1. On boot it prints a one-time token to the container log
   (`docker logs colecionary` → `SETUP MODE — … token …`).
2. Open the app; it redirects to `/setup`. Enter the token, then the SQL Server
   connection (the login needs rights to create the database if absent), the
   first organization + owner account, and a default theme.
3. Apply. The app migrates, creates the tenant + owner, writes
   `/data/config/colecionary.json` (connection string + a generated JWT key),
   and restarts into the normal sign-in screen.

Mounting `/data/config` is what makes this survive container recreation — the
config lives there, so setup runs exactly once. To reconfigure, delete
`colecionary.json` from that volume.

Alternatively, skip the wizard entirely by supplying the connection string
directly: `-e ConnectionStrings__Vault="Server=…;Database=…;User Id=…;Password=…;TrustServerCertificate=true"`
(and `-e Jwt__SigningKey=…`, ≥32 chars).

> Building the image locally: `docker build -t colecionary:dev .` from the repo
> root. (Not runnable in every dev sandbox — the CI build is the source of
> truth for the image.)
