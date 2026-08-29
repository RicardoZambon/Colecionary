using Vault.Domain.Entities;

namespace Vault.Application.Abstractions;

/// <summary>
/// The columns the garbage collector needs from one <c>Storage.Images</c> row.
/// </summary>
/// <remarks>
/// A projection rather than the entity: the sweep reads every row in the
/// installation, and materialising tracked entities for all of them would cost
/// memory the collector has no use for. <see cref="TenantId"/> travels with the
/// id because it is the <em>only</em> tenant a delete may address — see
/// <see cref="IImageStore"/>.
/// </remarks>
public sealed record ImageSweepRow(
    Guid Id,
    Guid TenantId,
    string ContentType,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset? UnreferencedSinceUtc);

public interface IImageRepository
{
    void Add(StoredImage image);

    /// <summary>
    /// Unfiltered read: the GUID id acts as the capability for the anonymous
    /// image endpoint (browsers can't send Authorization on &lt;img&gt; loads).
    /// </summary>
    Task<StoredImage?> GetUnfilteredAsync(Guid id, CancellationToken ct);

    /// <summary>
    /// Tracked, tenant-filtered read for writes (framing).
    /// </summary>
    /// <remarks>
    /// Deliberately NOT <see cref="GetUnfilteredAsync"/>. Ignoring the filter is
    /// only defensible for the anonymous byte read, where the unguessable id is
    /// the capability and the worst case is serving bytes to whoever already
    /// holds the id. A write has no such excuse: routed through the unfiltered
    /// read, one tenant could reframe another tenant's image. Going through the
    /// global filter means a foreign id simply doesn't exist, so the caller gets
    /// a 404 and learns nothing.
    /// </remarks>
    Task<StoredImage?> GetForCurrentTenantAsync(Guid id, CancellationToken ct);

    /// <summary>
    /// Every image belonging to the current tenant, for the export archive.
    /// Tenant-filtered by the context's global query filter — deliberately NOT
    /// unfiltered, unlike <see cref="GetUnfilteredAsync"/>.
    /// </summary>
    Task<List<StoredImage>> ListForCurrentTenantAsync(CancellationToken ct);

    /// <summary>
    /// The subset of <paramref name="ids"/> the current tenant owns, for a
    /// single collection's export. Tenant-filtered like the overload above, so
    /// an id belonging to someone else simply doesn't come back — a collection
    /// referencing a foreign image exports without it rather than leaking it.
    /// </summary>
    Task<List<StoredImage>> ListForCurrentTenantAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct);

    /// <summary>
    /// Every image row in the installation, across every tenant, for the
    /// garbage collector.
    /// </summary>
    /// <remarks>
    /// Deliberately unfiltered and deliberately global. The collector runs
    /// outside any request, so there is no ambient tenant to filter by, and the
    /// reference set it compares against is global too — a collection in one
    /// tenant can hold a reference to an image row in another, and the anonymous
    /// read endpoint serves it. Narrowing either side to one tenant turns a
    /// live photograph into an unreferenced one.
    /// </remarks>
    Task<IReadOnlyList<ImageSweepRow>> ListAllForSweepAsync(CancellationToken ct);

    /// <summary>
    /// Stamps <c>UnreferencedSinceUtc</c> on rows that have none. Starts the
    /// grace period; deletes nothing.
    /// </summary>
    Task<int> MarkUnreferencedAsync(
        IReadOnlyCollection<Guid> ids,
        DateTimeOffset atUtc,
        CancellationToken ct);

    /// <summary>
    /// Clears <c>UnreferencedSinceUtc</c> back to null. This is the undo: an
    /// image someone pointed at again stops being a candidate, and its clock
    /// restarts from scratch if it is ever dereferenced a second time.
    /// </summary>
    /// <remarks>
    /// Unfiltered, like the rest of the sweep's reads — the collector has no
    /// ambient tenant, and reachability is global. The write-path equivalent is
    /// <see cref="ClearUnreferencedMarkForCurrentTenantAsync"/>, which is not.
    /// </remarks>
    Task<int> ClearUnreferencedMarkAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct);

    /// <summary>
    /// Clears the mark on the caller's own images, from a request.
    /// </summary>
    /// <remarks>
    /// <para>
    /// The sweep can only learn that an image is referenced again by looking, so
    /// a reference that appears and disappears entirely between two sweeps is
    /// one it never sees — and the image would then be destroyed on a clock
    /// started before the reference existed. Saving a collection therefore
    /// clears the mark itself, which is what makes "unreferenced since" true
    /// rather than "last seen unreferenced at".
    /// </para>
    /// <para>
    /// <b>Tenant-filtered, deliberately unlike the sweep's version.</b> The ids
    /// come from a request body, and an unfiltered write driven by caller-
    /// supplied ids is exactly what the framing endpoint refuses to be. Clearing
    /// a mark can only ever spare an image, so the stake is small — but a
    /// foreign id must still simply not exist. A cross-tenant reference keeps
    /// the weaker, sweep-observed guarantee, which is the right answer: pointing
    /// at someone else's photograph should not reset their storage clock.
    /// </para>
    /// </remarks>
    Task<int> ClearUnreferencedMarkForCurrentTenantAsync(
        IReadOnlyCollection<Guid> ids,
        CancellationToken ct);

    /// <summary>
    /// Deletes metadata rows by id. Unfiltered, for the same reason the sweep
    /// read is — and safe to be, because the ids come from rows the sweep
    /// itself just read and re-checked against the global reference set.
    /// </summary>
    Task<int> DeleteRowsAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct);

    Task SaveChangesAsync(CancellationToken ct);
}
