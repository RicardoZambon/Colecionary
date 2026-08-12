using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using Serilog;
using Vault.Api.Infrastructure;
using Vault.Api.Setup;
using Vault.Application;
using Vault.Application.Abstractions;
using Vault.Application.Setup;
using Vault.Infrastructure;
using Vault.Infrastructure.Auth;
using Vault.Infrastructure.Persistence;
using Vault.Infrastructure.Persistence.Seeding;
using Vault.Infrastructure.Setup;
using Vault.Infrastructure.Storage;

var setup = new SetupCoordinator(ResolveConfigurationDirectory(args));

// First-run setup keeps the same OS process across the setup→configured
// transition, so the admin password + generated JWT key live only in memory
// until the database bootstrap succeeds.
while (true)
{
    WebApplication app;
    try
    {
        app = BuildApplication(args, setup);
    }
    catch (Exception ex) when (setup.HasPendingConfiguration)
    {
        // A staged config failed to boot (bad DB / migration). Surface it on the
        // next wizard render and fall back to setup mode.
        setup.RecordFailure(ex.Message);
        setup.DiscardPendingConfiguration();
        setup.ClearRestartRequest();
        continue;
    }

    await app.RunAsync();

    if (!setup.RestartRequested)
    {
        break;
    }

    setup.ClearRestartRequest();
}

static string ResolveConfigurationDirectory(string[] args)
{
    var config = new ConfigurationBuilder()
        .AddEnvironmentVariables()
        .AddCommandLine(args)
        .Build();
    return config["Setup:ConfigDirectory"]
        ?? Path.Combine(AppContext.BaseDirectory, "App_Data", "config");
}

static WebApplication BuildApplication(string[] args, SetupCoordinator setup)
{
    var builder = WebApplication.CreateBuilder(args);

    builder.Services.AddSerilog(config => config
        .ReadFrom.Configuration(builder.Configuration)
        .WriteTo.Console());

    // Normal providers (appsettings/env/user-secrets) win; only when none supply
    // a connection string do we consult the persisted + staged setup config.
    var connectionString = builder.Configuration.GetConnectionString("Vault");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        if (File.Exists(setup.ConfigurationFilePath))
        {
            builder.Configuration.AddJsonFile(setup.ConfigurationFilePath, optional: true);
        }

        if (setup.HasPendingConfiguration)
        {
            builder.Configuration.AddInMemoryCollection(setup.StagedConfiguration);
        }

        connectionString = builder.Configuration.GetConnectionString("Vault");
    }

    return string.IsNullOrWhiteSpace(connectionString)
        ? BuildSetupApplication(builder, setup)
        : BuildConfiguredApplication(builder, setup);
}

// Minimal host: serves the SPA + the token-guarded setup endpoints. No DbContext,
// no auth. The SPA's setup guard drives the wizard until a config is committed.
static WebApplication BuildSetupApplication(WebApplicationBuilder builder, SetupCoordinator setup)
{
    builder.Services.AddSingleton(setup);
    builder.Services.AddSingleton<IDatabaseConnectionTester, DatabaseConnectionTester>();
    builder.Services.AddSingleton(TimeProvider.System);
    builder.Services.AddCors(options => options.AddPolicy(
        "setup",
        policy => policy.SetIsOriginAllowed(_ => true).AllowAnyHeader().AllowAnyMethod()));

    var app = builder.Build();

    var token = setup.EnsureToken();
    app.Logger.LogWarning("SETUP MODE — open the app and enter this token to configure it:\n    {Token}", token);

    var spaFileOptions = SpaFileOptions();
    app.UseSerilogRequestLogging();
    app.UseDefaultFiles();
    app.UseStaticFiles(spaFileOptions);
    app.UseCors("setup");
    app.MapSetupEndpoints();
    app.MapFallback("/api/{**path}", () => Results.NotFound());
    app.MapFallbackToFile("index.html", spaFileOptions);
    return app;
}

// Full application: today's API, plus SPA hosting. On boot it migrates and, on
// the wizard path, creates the first tenant + owner and persists the config.
static WebApplication BuildConfiguredApplication(WebApplicationBuilder builder, SetupCoordinator setup)
{
    builder.Services.AddControllers();
    builder.Services.AddOpenApi();
    builder.Services.AddProblemDetails();
    builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

    builder.Services.AddApplication();
    builder.Services.AddInfrastructure(builder.Configuration, builder.Environment.ContentRootPath);

    builder.Services.AddHttpContextAccessor();
    builder.Services.AddScoped<ICurrentTenant, CurrentTenantFromHttpContext>();

    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            // Keep raw claim names (sub, tenant_id, …) — no legacy remapping.
            options.MapInboundClaims = false;
            var jwt = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
                ?? new JwtOptions();
            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidIssuer = jwt.Issuer,
                ValidAudience = jwt.Audience,
                IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
                ValidateIssuerSigningKey = true,
                ClockSkew = TimeSpan.FromMinutes(1),
            };
        });

    // Deny-by-default: every endpoint requires an authenticated user unless
    // explicitly [AllowAnonymous].
    builder.Services.AddAuthorization(options => options.FallbackPolicy = options.DefaultPolicy);

    const string frontendCorsPolicy = "frontend";
    builder.Services.AddCors(options => options.AddPolicy(frontendCorsPolicy, policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            // Dev is reached via varying hosts (container IP, umbrel.local, localhost).
            // Auth is bearer-token (no cookies), so reflecting any origin is safe here.
            policy.SetIsOriginAllowed(_ => true).AllowAnyHeader().AllowAnyMethod();
        }
        else
        {
            policy
                .WithOrigins(builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [])
                .AllowAnyHeader()
                .AllowAnyMethod();
        }
    }));

    var app = builder.Build();

    app.UseExceptionHandler();
    app.UseSerilogRequestLogging();

    // Serve the built Angular SPA from wwwroot (populated in the published image).
    // Static files run before auth: the shell is public; only /api needs a token.
    var spaFileOptions = SpaFileOptions();
    app.UseDefaultFiles();
    app.UseStaticFiles(spaFileOptions);

    app.UseCors(frontendCorsPolicy);
    app.UseAuthentication();
    app.UseAuthorization();

    if (app.Environment.IsDevelopment())
    {
        app.MapOpenApi().AllowAnonymous();
        app.MapScalarApiReference().AllowAnonymous();
    }

    app.MapControllers();

    // Unmatched /api/* → JSON 404, so the SPA fallback never hijacks an API route
    // (a literal segment out-specifies the catch-all below).
    app.MapFallback("/api/{**path}", () => Results.NotFound()).AllowAnonymous();
    // Every other unmatched route → SPA entry point for client-side routing.
    // AllowAnonymous: the deny-by-default fallback policy would otherwise 401 the shell.
    app.MapFallbackToFile("index.html", spaFileOptions).AllowAnonymous();

    BootstrapDatabase(app, setup);
    return app;
}

// Runs at startup (synchronously — this is boot code). On the wizard path it
// creates the first tenant + owner then persists the config; otherwise it keeps
// the existing dev demo-seed behaviour, or just migrates.
static void BootstrapDatabase(WebApplication app, SetupCoordinator setup)
{
    using var scope = app.Services.CreateScope();
    var sp = scope.ServiceProvider;

    // Must precede every path below: all of them migrate, and the migration that
    // drops Storage.Images.Data would otherwise destroy the bytes this rescues.
    // No-ops once the column is gone.
    sp.GetRequiredService<LegacyImageBlobExporter>().ExportAsync().GetAwaiter().GetResult();

    if (setup.PendingBootstrap is not null)
    {
        sp.GetRequiredService<ISetupBootstrapper>().BootstrapAsync(setup.PendingBootstrap).GetAwaiter().GetResult();
        setup.CommitPendingConfiguration();
        return;
    }

    var seedOptions = sp.GetRequiredService<IOptions<SeedOptions>>();
    if (seedOptions.Value.Enabled)
    {
        sp.GetRequiredService<DbSeeder>().SeedAsync().GetAwaiter().GetResult();
    }
    else
    {
        sp.GetRequiredService<VaultDbContext>().Database.Migrate();
    }
}

static StaticFileOptions SpaFileOptions() => new()
{
    OnPrepareResponse = ctx =>
    {
        // index.html must never be cached — a deploy would otherwise leave clients
        // pinned to a stale shell referencing purged hashed bundles.
        if (ctx.File.Name.Equals("index.html", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        }
    },
};

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;
