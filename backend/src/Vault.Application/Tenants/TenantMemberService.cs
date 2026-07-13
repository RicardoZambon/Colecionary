using FluentValidation;
using Vault.Application.Abstractions;
using Vault.Application.Collections.Dtos;
using Vault.Application.Common;
using Vault.Domain.Entities;
using Vault.Domain.Enums;

namespace Vault.Application.Tenants;

public class TenantMemberService(
    IUserRepository users,
    ICurrentTenant currentTenant,
    IValidator<MemberDto> memberValidator)
{
    public async Task<List<MemberDto>> ListAsync(CancellationToken ct)
    {
        var members = await users.ListTenantMembersAsync(ct);
        return [.. members.Select(u => u.ToMemberDto())];
    }

    /// <summary>
    /// Syncs the tenant's user list by email: adds invited (passwordless)
    /// users, updates role/name/initials, removes absent ones. Owner-only
    /// (enforced at the controller); refuses to remove the last Owner.
    /// </summary>
    public async Task<List<MemberDto>> UpdateAsync(IReadOnlyList<MemberDto> desired, CancellationToken ct)
    {
        foreach (var member in desired)
        {
            await memberValidator.ValidateAndThrowAsync(member, ct);
        }

        if (!desired.Any(m => DtoMapper.ParseRole(m.Role) == MemberRole.Owner))
        {
            throw new DomainRuleException("The tenant must keep at least one Owner.");
        }

        var existing = await users.ListTenantMembersAsync(ct);
        var desiredByEmail = desired.ToDictionary(m => m.Email, StringComparer.OrdinalIgnoreCase);

        foreach (var user in existing)
        {
            if (desiredByEmail.TryGetValue(user.Email, out var update))
            {
                user.Name = update.Name;
                user.Initials = update.Initials;
                user.Role = DtoMapper.ParseRole(update.Role);
            }
            else
            {
                if (user.Role == MemberRole.Owner)
                {
                    throw new DomainRuleException("The owner can't be removed.");
                }

                if (user.Id == currentTenant.UserId)
                {
                    throw new DomainRuleException("You can't remove yourself.");
                }

                users.Remove(user);
            }
        }

        var existingEmails = existing.Select(u => u.Email).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var invited in desired.Where(m => !existingEmails.Contains(m.Email)))
        {
            users.Add(new User
            {
                Id = Guid.NewGuid(),
                TenantId = currentTenant.TenantId,
                Email = invited.Email,
                Name = invited.Name,
                Initials = invited.Initials,
                Role = DtoMapper.ParseRole(invited.Role),
                Plan = PlanId.Free,
                PasswordHash = null, // invited — no login until a password is set
            });
        }

        await users.SaveChangesAsync(ct);
        var refreshed = await users.ListTenantMembersAsync(ct);
        return [.. refreshed.Select(u => u.ToMemberDto())];
    }
}
