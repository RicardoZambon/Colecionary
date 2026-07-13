using Microsoft.AspNetCore.Identity;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Auth;

/// <summary>
/// Wraps ASP.NET Core Identity's audited PBKDF2 hasher — the only part of
/// Identity this app needs.
/// </summary>
public sealed class PasswordService : IPasswordService
{
    private readonly PasswordHasher<User> _hasher = new();

    public string Hash(User user, string password) => _hasher.HashPassword(user, password);

    public bool Verify(User user, string hash, string password) =>
        _hasher.VerifyHashedPassword(user, hash, password)
            is PasswordVerificationResult.Success or PasswordVerificationResult.SuccessRehashNeeded;
}
