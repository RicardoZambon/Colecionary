namespace Vault.Application.Setup;

/// <summary>
/// First-run values captured by the setup wizard. Held in memory only (never
/// written to disk) and consumed once, when the configured host bootstraps the
/// database, to create the first tenant + owner.
/// </summary>
public sealed class SetupBootstrapOptions
{
    public string OrganizationName { get; init; } = string.Empty;

    public string OwnerEmail { get; init; } = string.Empty;

    public string OwnerName { get; init; } = string.Empty;

    public string OwnerPassword { get; init; } = string.Empty;

    /// <summary>Optional default UI theme id (e.g. "devlight").</summary>
    public string? DefaultTheme { get; init; }
}

/// <summary>Outcome of probing a candidate SQL Server connection during setup.</summary>
public enum DatabaseConnectionResult
{
    Success,
    DatabaseMissingButCanBeCreated,
    DatabaseMissingAndCannotCreate,
    LoginRejected,
    HostUnreachable,
    Unknown,
}

/// <summary>Probes a candidate connection string without touching app state.</summary>
public interface IDatabaseConnectionTester
{
    Task<DatabaseConnectionResult> TestAsync(string connectionString, CancellationToken ct = default);
}

/// <summary>Migrates the database and creates the first tenant + owner on first run.</summary>
public interface ISetupBootstrapper
{
    Task BootstrapAsync(SetupBootstrapOptions options, CancellationToken ct = default);
}
