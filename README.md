# Colecionary

Colecionary exists to transform personal collections into organized, beautiful,
and easy-to-browse digital archives.

It ships as a **single Docker image**: a .NET 10 API that serves the Angular
frontend and stores data in SQL Server. One container, one port.

## Run with Docker

```sh
docker run -d --name colecionary \
  -p 8080:80 \
  -v colecionary-config:/data/config \
  ricardozambon/vault:latest
```

Then open **http://localhost:8080/** (swap in your host). TLS is expected to
terminate at your reverse proxy — the container speaks plain HTTP on port `80`.

- `-p 8080:80` — publish the app on host port 8080.
- `-v colecionary-config:/data/config` — **required.** First-run setup writes
  its config here; the volume makes it survive container recreation so setup
  runs only once.

You provide a SQL Server yourself (2022+). Docker Compose example:

```yaml
services:
  colecionary:
    image: ricardozambon/vault:latest
    ports:
      - "8080:80"
    volumes:
      - colecionary-config:/data/config
    restart: unless-stopped
volumes:
  colecionary-config:
```

### First run

With no database connection supplied, the app boots into a **setup wizard**:

1. It prints a one-time token to the container log:
   `docker logs colecionary` → look for `SETUP MODE — … token …`.
2. Open the app; it redirects to `/setup`. Enter the token, then your SQL Server
   connection (the login needs rights to create the database if it doesn't
   exist), the first organization + owner account, and a default theme.
3. Apply. The app creates the database schema and your owner account, then
   restarts into the normal sign-in screen.

To reconfigure later, delete `colecionary.json` from the `/data/config` volume.

### Skip the wizard (headless config)

Supply the connection string and a JWT signing key (≥32 chars) directly, and the
wizard is bypassed:

```sh
docker run -d --name colecionary -p 8080:80 \
  -v colecionary-config:/data/config \
  -e ConnectionStrings__Vault="Server=db-host,1433;Database=Colecionary;User Id=sa;Password=…;TrustServerCertificate=true" \
  -e Jwt__SigningKey="a-long-random-secret-at-least-32-bytes" \
  ricardozambon/vault:latest
```

### Build the image yourself

```sh
docker build -t colecionary:dev .
```

## Develop locally

The frontend (Angular 21) and backend (.NET 10, SQL Server) run separately in
development. See [`CLAUDE.md`](CLAUDE.md) for the full workflow,
[`backend/README.md`](backend/README.md) for the API, and
[`docs/deployment.md`](docs/deployment.md) for the release pipeline and
deployment details.
