using FluentValidation;
using Vault.Application.Abstractions;
using Vault.Application.Common;

namespace Vault.Application.Profile;

public class ProfileService(
    IUserRepository users,
    ICurrentTenant currentTenant,
    IValidator<UserProfileDto> profileValidator)
{
    public async Task<UserProfileDto> GetAsync(CancellationToken ct)
    {
        var user = await users.GetByIdAsync(currentTenant.UserId, ct)
            ?? throw new NotFoundException("Current user not found.");
        return user.ToProfileDto();
    }

    public async Task<UserProfileDto> UpdateAsync(UserProfileDto dto, CancellationToken ct)
    {
        await profileValidator.ValidateAndThrowAsync(dto, ct);
        var user = await users.GetByIdAsync(currentTenant.UserId, ct)
            ?? throw new NotFoundException("Current user not found.");

        if (!string.Equals(dto.Email, user.Email, StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleException("Email is the login identity and can't be changed yet.");
        }

        user.Name = dto.Name;
        user.Initials = dto.Initials;
        user.Plan = DtoMapper.ParsePlan(dto.Plan);
        await users.SaveChangesAsync(ct);
        return user.ToProfileDto();
    }
}
