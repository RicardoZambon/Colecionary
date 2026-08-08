using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using Serilog;
using Vault.Api.Infrastructure;
using Vault.Application;
using Vault.Application.Abstractions;
using Vault.Infrastructure;
using Vault.Infrastructure.Auth;
using Vault.Infrastructure.Persistence.Seeding;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSerilog(config => config
    .ReadFrom.Configuration(builder.Configuration)
    .WriteTo.Console());

builder.Services.AddControllers();
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

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
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = options.DefaultPolicy;
});

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
var spaFileOptions = new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // index.html must never be cached — a deploy would otherwise leave
        // clients pinned to a stale shell referencing purged hashed bundles.
        if (ctx.File.Name.Equals("index.html", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        }
    },
};
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

// Development convenience: migrate + seed on boot when enabled.
using (var scope = app.Services.CreateScope())
{
    var seedOptions = scope.ServiceProvider.GetRequiredService<IOptions<SeedOptions>>();
    if (seedOptions.Value.Enabled)
    {
        await scope.ServiceProvider.GetRequiredService<DbSeeder>().SeedAsync();
    }
}

await app.RunAsync();

/// <summary>Exposed for WebApplicationFactory in integration tests.</summary>
public partial class Program;
