namespace Vault.Application.Abstractions;

/// <summary>JWT claim names shared by the token issuer and the API.</summary>
public static class VaultClaims
{
    public const string Subject = "sub";
    public const string TenantId = "tenant_id";
    public const string Email = "email";
    public const string Name = "name";
    public const string Plan = "plan";
}
