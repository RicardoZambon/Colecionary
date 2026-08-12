using Microsoft.EntityFrameworkCore;
using Vault.Application.Abstractions;
using Vault.Domain.Entities;

namespace Vault.Infrastructure.Persistence.Repositories;

public sealed class ImageRepository(VaultDbContext db) : IImageRepository
{
    public void Add(StoredImage image) => db.Images.Add(image);

    public Task<StoredImage?> GetUnfilteredAsync(Guid id, CancellationToken ct) =>
        db.Images.IgnoreQueryFilters().AsNoTracking().FirstOrDefaultAsync(i => i.Id == id, ct);

    public Task<List<StoredImage>> ListForCurrentTenantAsync(CancellationToken ct) =>
        db.Images.AsNoTracking().OrderBy(i => i.CreatedAtUtc).ToListAsync(ct);

    public Task SaveChangesAsync(CancellationToken ct) => db.SaveChangesAsync(ct);
}
