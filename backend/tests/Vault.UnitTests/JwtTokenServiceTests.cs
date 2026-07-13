using System.IdentityModel.Tokens.Jwt;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;
using Vault.Domain.Enums;
using Vault.Infrastructure.Auth;

namespace Vault.UnitTests;

public class JwtTokenServiceTests
{
    [Fact]
    public void IssueToken_EmbedsIdentityClaims_AndHonorsLifetime()
    {
        var now = new DateTimeOffset(2026, 7, 12, 12, 0, 0, TimeSpan.Zero);
        var options = Options.Create(new JwtOptions
        {
            Issuer = "vault-api",
            Audience = "vault-app",
            SigningKey = "unit-test-signing-key-0123456789abcdef",
            LifetimeMinutes = 60,
        });
        var service = new JwtTokenService(options, new FakeTimeProvider(now));

        var user = new User
        {
            Id = Guid.NewGuid(),
            TenantId = Guid.NewGuid(),
            Email = "marcus@airia.com",
            Name = "Marcus Keller",
            Role = MemberRole.Owner,
            Plan = PlanId.Free,
        };

        var (token, expiresAt) = service.IssueToken(user);
        Assert.Equal(now.AddMinutes(60), expiresAt);

        var parsed = new JwtSecurityTokenHandler().ReadJwtToken(token);
        Assert.Equal(user.Id.ToString(), parsed.Claims.Single(c => c.Type == VaultClaims.Subject).Value);
        Assert.Equal(user.TenantId.ToString(), parsed.Claims.Single(c => c.Type == VaultClaims.TenantId).Value);
        Assert.Equal("free", parsed.Claims.Single(c => c.Type == VaultClaims.Plan).Value);
        Assert.Equal("vault-api", parsed.Issuer);
    }
}
