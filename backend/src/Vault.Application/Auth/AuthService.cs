using Vault.Application.Abstractions;
using Vault.Application.Common;

namespace Vault.Application.Auth;

public class AuthService(
    IUserRepository users,
    IPasswordService passwords,
    IJwtTokenService tokens)
{
    /// <summary>Returns null on invalid credentials — the controller maps that to 401.</summary>
    public async Task<LoginResponse?> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var user = await users.FindForLoginAsync(request.Email.Trim(), ct);
        if (user?.PasswordHash is null)
        {
            return null;
        }

        if (!passwords.Verify(user, user.PasswordHash, request.Password))
        {
            return null;
        }

        var (token, expiresAt) = tokens.IssueToken(user);
        return new LoginResponse(token, expiresAt, user.ToProfileDto());
    }
}
