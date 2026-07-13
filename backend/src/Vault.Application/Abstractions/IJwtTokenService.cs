using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

public interface IJwtTokenService
{
    (string Token, DateTimeOffset ExpiresAt) IssueToken(User user);
}
