using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Repositories;

public sealed class UserRepository(VaultDbContext db) : IUserRepository
{
    public Task<User?> GetByEmailAsync(string email, CancellationToken ct) =>
        db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);

    public Task<User?> FindForLoginAsync(string email, CancellationToken ct) =>
        // Login happens before any tenant claim exists — bypass the filter.
        // Email is unique per tenant; v1 assumes it is globally unique in practice.
        db.Users.IgnoreQueryFilters().FirstOrDefaultAsync(u => u.Email == email, ct);

    public Task<User?> GetByIdAsync(Guid id, CancellationToken ct) =>
        db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);

    public Task<List<User>> ListTenantMembersAsync(CancellationToken ct) =>
        db.Users.OrderBy(u => u.Role).ThenBy(u => u.Name).ToListAsync(ct);

    public void Add(User user) => db.Users.Add(user);

    public void Remove(User user) => db.Users.Remove(user);

    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}
