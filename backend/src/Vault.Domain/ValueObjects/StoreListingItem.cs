namespace Vault.Domain.ValueObjects;

/// <summary>Checklist entry of a curated store listing (read-only catalog data).</summary>
public class StoreListingItem
{
    public string Id { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;

    public int Year { get; set; }

    public decimal Value { get; set; }

    public string Group { get; set; } = string.Empty;

    public string Img { get; set; } = string.Empty;
}
