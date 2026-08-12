using Vault.Domain.Abstractions;

namespace Vault.Domain.Entities;

/// <summary>
/// Metadata for an uploaded image (item photos, collection banners/icons). The
/// GUID id doubles as an unguessable capability for the anonymous read endpoint —
/// browsers can't attach Authorization headers to &lt;img&gt; requests.
/// </summary>
/// <remarks>
/// The bytes are NOT here: they live in an <c>IImageStore</c>, partitioned by
/// tenant. This row is what maps an id to its owning tenant, so it is still the
/// thing that makes the anonymous read safe — the read path resolves the tenant
/// from the row and only then goes to storage.
/// </remarks>
public class StoredImage : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    /// <summary>
    /// Immutable once written: the stored file's extension is derived from it,
    /// so changing it would orphan the bytes it names.
    /// </summary>
    public string ContentType { get; set; } = string.Empty;

    public DateTimeOffset CreatedAtUtc { get; set; }
}
