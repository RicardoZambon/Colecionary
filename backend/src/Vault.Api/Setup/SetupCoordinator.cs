using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Vault.Application.Setup;

namespace Vault.Api.Setup;

/// <summary>
/// Owns first-run state across in-process host rebuilds. Lives outside DI
/// (constructed in Program.cs) so staged secrets — the admin password, the
/// generated JWT key — stay in memory and are written to disk only after the
/// database bootstrap succeeds.
/// </summary>
public sealed class SetupCoordinator
{
    private const int MaxAttempts = 10;
    private static readonly TimeSpan LockoutWindow = TimeSpan.FromMinutes(5);

    private readonly string _configDirectory;
    private readonly List<DateTimeOffset> _failedAttempts = [];
    private readonly Lock _gate = new();

    private string _token = string.Empty;

    public SetupCoordinator(string configDirectory)
    {
        _configDirectory = configDirectory;
        ConfigurationFilePath = Path.Combine(configDirectory, "colecionary.json");
        TokenFilePath = Path.Combine(configDirectory, "setup-token.txt");
    }

    /// <summary>Persisted config written once setup succeeds. Its existence = "configured".</summary>
    public string ConfigurationFilePath { get; }

    public string TokenFilePath { get; }

    public string? LastError { get; private set; }

    public bool RestartRequested { get; private set; }

    /// <summary>Staged values awaiting a rebuild; null once discarded/committed.</summary>
    public PendingConfiguration? Pending { get; private set; }

    public SetupBootstrapOptions? PendingBootstrap => Pending?.Bootstrap;

    public bool HasPendingConfiguration => Pending is not null;

    /// <summary>Config key/values the rebuilt host should read (connection string + JWT key).</summary>
    public IReadOnlyDictionary<string, string?> StagedConfiguration =>
        Pending is null
            ? new Dictionary<string, string?>()
            : new Dictionary<string, string?>
            {
                ["ConnectionStrings:Vault"] = Pending.ConnectionString,
                ["Jwt:SigningKey"] = Pending.JwtSigningKey,
            };

    /// <summary>Generates (once) and returns the token guarding the setup screen.</summary>
    public string EnsureToken()
    {
        lock (_gate)
        {
            if (_token.Length == 0)
            {
                _token = Base64Url(RandomNumberGenerator.GetBytes(32));
                Directory.CreateDirectory(_configDirectory);
                File.WriteAllText(TokenFilePath, _token);
            }

            return _token;
        }
    }

    public bool ValidateToken(string? candidate)
    {
        if (string.IsNullOrEmpty(candidate) || _token.Length == 0)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(candidate),
            Encoding.UTF8.GetBytes(_token));
    }

    public bool IsLockedOut()
    {
        lock (_gate)
        {
            Prune();
            return _failedAttempts.Count >= MaxAttempts;
        }
    }

    public void RegisterFailedAttempt(DateTimeOffset now)
    {
        lock (_gate)
        {
            Prune(now);
            _failedAttempts.Add(now);
        }
    }

    /// <summary>Stages a validated connection string + admin bootstrap; generates the JWT key.</summary>
    public void StagePendingConfiguration(string connectionString, SetupBootstrapOptions bootstrap)
    {
        lock (_gate)
        {
            Pending = new PendingConfiguration(
                connectionString,
                Base64Url(RandomNumberGenerator.GetBytes(48)),
                bootstrap);
            LastError = null;
        }
    }

    public void RequestRestart() => RestartRequested = true;

    public void ClearRestartRequest() => RestartRequested = false;

    public void DiscardPendingConfiguration() => Pending = null;

    public void RecordFailure(string message) => LastError = message;

    /// <summary>Persists the resolved config after a successful bootstrap; removes the token.</summary>
    public void CommitPendingConfiguration()
    {
        if (Pending is null)
        {
            return;
        }

        Directory.CreateDirectory(_configDirectory);
        var payload = new
        {
            ConnectionStrings = new { Vault = Pending.ConnectionString },
            Jwt = new { SigningKey = Pending.JwtSigningKey },
        };
        File.WriteAllText(
            ConfigurationFilePath,
            JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
        RestrictToOwner(ConfigurationFilePath);

        if (File.Exists(TokenFilePath))
        {
            File.Delete(TokenFilePath);
        }

        Pending = null;
        LastError = null;
    }

    private void Prune(DateTimeOffset? now = null)
    {
        var cutoff = (now ?? DateTimeOffset.UtcNow) - LockoutWindow;
        _failedAttempts.RemoveAll(t => t < cutoff);
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static void RestrictToOwner(string path)
    {
        if (!OperatingSystem.IsWindows())
        {
            File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
    }

    public sealed record PendingConfiguration(
        string ConnectionString,
        string JwtSigningKey,
        SetupBootstrapOptions Bootstrap);
}
