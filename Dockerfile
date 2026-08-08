# syntax=docker/dockerfile:1
#
# Single image: the .NET API serves the built Angular SPA from wwwroot.
# One process, one port. amd64 only (SQL Server has no ARM build).

# ── Stage 1: build the Angular SPA ──────────────────────────────────────────
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Stage 2: publish the .NET API ───────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS backend
WORKDIR /src
# Restore first so the layer caches until a .csproj / Directory.Build.props changes.
COPY backend/Directory.Build.props ./backend/
COPY backend/src/Vault.Domain/Vault.Domain.csproj ./backend/src/Vault.Domain/
COPY backend/src/Vault.Application/Vault.Application.csproj ./backend/src/Vault.Application/
COPY backend/src/Vault.Infrastructure/Vault.Infrastructure.csproj ./backend/src/Vault.Infrastructure/
COPY backend/src/Vault.Api/Vault.Api.csproj ./backend/src/Vault.Api/
RUN dotnet restore backend/src/Vault.Api/Vault.Api.csproj
# Build + publish (warnings are errors — enforced by Directory.Build.props).
COPY backend/ ./backend/
RUN dotnet publish backend/src/Vault.Api/Vault.Api.csproj -c Release -o /out /p:UseAppHost=false

# ── Stage 3: runtime (API + SPA in one image) ───────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=backend /out ./
COPY --from=frontend /src/frontend/dist/frontend/browser ./wwwroot
ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_HTTP_PORTS=80
EXPOSE 80
# Run as the image's non-root user.
USER $APP_UID
ENTRYPOINT ["dotnet", "Vault.Api.dll"]
