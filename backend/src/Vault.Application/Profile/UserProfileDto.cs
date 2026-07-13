namespace Vault.Application.Profile;

/// <summary>Mirrors the frontend's UserProfile: plan is "free" | "pro".</summary>
public sealed record UserProfileDto(string Name, string Email, string Initials, string Plan);
