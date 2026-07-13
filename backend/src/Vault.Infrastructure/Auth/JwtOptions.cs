using System.ComponentModel.DataAnnotations;

namespace Vault.Infrastructure.Auth;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    [Required]
    public string Issuer { get; set; } = "vault-api";

    [Required]
    public string Audience { get; set; } = "vault-app";

    /// <summary>HS256 signing key — at least 32 bytes. Dev value lives in appsettings.Development.json.</summary>
    [Required]
    [MinLength(32)]
    public string SigningKey { get; set; } = string.Empty;

    [Range(5, 24 * 60)]
    public int LifetimeMinutes { get; set; } = 8 * 60;
}
