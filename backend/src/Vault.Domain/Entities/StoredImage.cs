using Vault.Domain.Abstractions;

namespace Vault.Domain.Entities;

/// <summary>
/// Uploaded image bytes (item photos, collection banners/icons). The GUID id
/// doubles as an unguessable capability for the anonymous read endpoint —
/// browsers can't attach Authorization headers to &lt;img&gt; requests.
/// SQL Server varbinary(max) storage is deliberate for v1; swap for object storage later.
/// </summary>
public class StoredImage : ITenantOwned
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public string ContentType { get; set; } = string.Empty;

    public byte[] Data { get; set; } = [];

    public DateTimeOffset CreatedAtUtc { get; set; }
}
