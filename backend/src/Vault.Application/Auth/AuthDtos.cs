using Vault.Application.Profile;

namespace Vault.Application.Auth;

public sealed record LoginRequest(string Email, string Password);

public sealed record LoginResponse(string Token, DateTimeOffset ExpiresAt, UserProfileDto Profile);
