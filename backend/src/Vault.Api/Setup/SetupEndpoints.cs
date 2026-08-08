using Microsoft.Data.SqlClient;
using Vault.Application.Setup;

namespace Vault.Api.Setup;

/// <summary>
/// Minimal setup API, mapped only while the app is unconfigured. Once configured
/// these routes are not mapped, so the SPA reads the resulting /api 404 as "done".
/// </summary>
public static class SetupEndpoints
{
    public static void MapSetupEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/setup");

        group.MapGet("/status", (SetupCoordinator coordinator) =>
            Results.Ok(new SetupStatusResponse(false, coordinator.LastError)));

        group.MapPost("/test-connection", async (
            SetupConnectionRequest request,
            SetupCoordinator coordinator,
            IDatabaseConnectionTester tester,
            TimeProvider clock,
            CancellationToken ct) =>
        {
            if (Guard(coordinator, request.Token, clock) is { } denied)
            {
                return denied;
            }

            var result = await tester.TestAsync(BuildConnectionString(request), ct);
            return Results.Ok(new SetupTestResponse(result.ToString()));
        });

        group.MapPost("/apply", async (
            SetupApplyRequest request,
            HttpContext http,
            SetupCoordinator coordinator,
            IDatabaseConnectionTester tester,
            IHostApplicationLifetime lifetime,
            TimeProvider clock,
            CancellationToken ct) =>
        {
            if (Guard(coordinator, request.Token, clock) is { } denied)
            {
                return denied;
            }

            if (string.IsNullOrWhiteSpace(request.OrganizationName)
                || string.IsNullOrWhiteSpace(request.OwnerEmail)
                || string.IsNullOrWhiteSpace(request.OwnerName))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["fields"] = ["Organization name, owner name and owner email are required."],
                });
            }

            if (request.OwnerPassword.Length < 8)
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["ownerPassword"] = ["Password must be at least 8 characters."],
                });
            }

            var connectionString = BuildConnectionString(request);
            var probe = await tester.TestAsync(connectionString, ct);
            if (probe is not (DatabaseConnectionResult.Success or DatabaseConnectionResult.DatabaseMissingButCanBeCreated))
            {
                return Results.ValidationProblem(new Dictionary<string, string[]>
                {
                    ["database"] = [$"Database not usable: {probe}."],
                });
            }

            coordinator.StagePendingConfiguration(connectionString, new SetupBootstrapOptions
            {
                OrganizationName = request.OrganizationName,
                OwnerEmail = request.OwnerEmail,
                OwnerName = request.OwnerName,
                OwnerPassword = request.OwnerPassword,
                DefaultTheme = request.DefaultTheme,
            });
            coordinator.RequestRestart();

            // Stop the host only after this response is flushed, so the client
            // gets its acknowledgement; the Program.cs loop then rebuilds.
            http.Response.OnCompleted(() =>
            {
                lifetime.StopApplication();
                return Task.CompletedTask;
            });
            return Results.Accepted();
        });
    }

    private static IResult? Guard(SetupCoordinator coordinator, string? token, TimeProvider clock)
    {
        if (coordinator.IsLockedOut())
        {
            return Results.StatusCode(StatusCodes.Status429TooManyRequests);
        }

        if (!coordinator.ValidateToken(token))
        {
            coordinator.RegisterFailedAttempt(clock.GetUtcNow());
            return Results.Unauthorized();
        }

        return null;
    }

    private static string BuildConnectionString(SetupConnectionRequest r) => BuildConnectionString(
        r.Server, r.Port, r.Database, r.Username, r.Password, r.TrustServerCertificate);

    private static string BuildConnectionString(SetupApplyRequest r) => BuildConnectionString(
        r.Server, r.Port, r.Database, r.Username, r.Password, r.TrustServerCertificate);

    private static string BuildConnectionString(
        string server, int port, string database, string username, string password, bool trustCert) =>
        new SqlConnectionStringBuilder
        {
            DataSource = port > 0 ? $"{server},{port}" : server,
            InitialCatalog = database,
            UserID = username,
            Password = password,
            TrustServerCertificate = trustCert,
        }.ConnectionString;
}
