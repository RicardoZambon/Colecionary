using FluentValidation;
using Vault.Application.Abstractions;
using Vault.Application.Common;
using Vault.Application.Resources;

namespace Vault.Application.Profile;

public class ProfileService(
    IUserRepository users,
    ICurrentTenant currentTenant,
    IValidator<UserProfileDto> profileValidator)
{
    public async Task<UserProfileDto> GetAsync(CancellationToken ct)
    {
        var user = await users.GetByIdAsync(currentTenant.UserId, ct)
            ?? throw new NotFoundException(Messages.CurrentUserNotFound);
        return user.ToProfileDto();
    }

    public async Task<UserProfileDto> UpdateAsync(UserProfileDto dto, CancellationToken ct)
    {
        await profileValidator.ValidateAndThrowAsync(dto, ct);
        var user = await users.GetByIdAsync(currentTenant.UserId, ct)
            ?? throw new NotFoundException(Messages.CurrentUserNotFound);

        if (!string.Equals(dto.Email, user.Email, StringComparison.OrdinalIgnoreCase))
        {
            throw new DomainRuleException(Messages.EmailCannotBeChanged);
        }

        user.Name = dto.Name;
        user.Initials = dto.Initials;
        user.Plan = DtoMapper.ParsePlan(dto.Plan);
        // `dto.Role` is deliberately not read. The client is told its role so it
        // can stop offering what the server would refuse; letting it write one
        // back would make every policy advisory.

        await users.SaveChangesAsync(ct);
        return user.ToProfileDto();
    }
}
