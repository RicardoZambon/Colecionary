using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Repositories;

public sealed class UserRepository(VaultDbContext db) : IUserRepository
{
    /// <summary>
    /// Case-insensitive, accent-sensitive, width-insensitive — the collation
    /// <c>AuthService.AccountKey</c>'s normalization is written against.
    /// </summary>
    private const string LoginCollation = "Latin1_General_CI_AS";

    public Task<User?> GetByEmailAsync(string email, CancellationToken ct) =>
        db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

    /// <summary>
    /// Resolves a login by email, under an explicit collation.
    /// </summary>
    /// <remarks>
    /// <para>
    /// Login happens before any tenant claim exists — hence the bypassed filter.
    /// Email is unique per tenant; v1 assumes it is globally unique in practice.
    /// </para>
    /// <para>
    /// The collation is named rather than inherited because <b>which spellings
    /// this fold together decides what the login throttle has to fold
    /// together</b>. <c>AuthService.AccountKey</c> normalizes case, width and
    /// weightless characters to match; if a deployment's database were restored
    /// with an accent-insensitive collation, the server would silently start
    /// matching spellings the key does not, and the disagreement is an
    /// account-existence oracle. Naming it keeps the two in step and costs
    /// nothing here — the column has no index this query could seek on anyway.
    /// </para>
    /// </remarks>
    public Task<User?> FindForLoginAsync(string email, CancellationToken ct) =>
        db.Users
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => EF.Functions.Collate(u.Email, LoginCollation) == email, ct);

    public Task<User?> GetByIdAsync(Guid id, CancellationToken ct) =>
        db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);

    public Task<List<User>> ListTenantMembersAsync(CancellationToken ct) =>
        db.Users.OrderBy(u => u.Role).ThenBy(u => u.Name).ToListAsync(ct);

    public void Add(User user) => db.Users.Add(user);

    public void Remove(User user) => db.Users.Remove(user);

    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}
