namespace Vault.Api.Setup;

/// <summary>Read by the SPA to decide whether to show the wizard. Only mapped in setup mode.</summary>
public sealed record SetupStatusResponse(bool Configured, string? LastError);

/// <summary>Database connection fields shared by test + apply.</summary>
public sealed record SetupConnectionRequest(
    string Token,
    string Server,
    int Port,
    string Database,
    string Username,
    string Password,
    bool TrustServerCertificate);

public sealed record SetupTestResponse(string Result);

/// <summary>Full first-run payload: connection + first organization/owner + preferences.</summary>
public sealed record SetupApplyRequest(
    string Token,
    string Server,
    int Port,
    string Database,
    string Username,
    string Password,
    bool TrustServerCertificate,
    string OrganizationName,
    string OwnerEmail,
    string OwnerName,
    string OwnerPassword,
    string? DefaultTheme);
