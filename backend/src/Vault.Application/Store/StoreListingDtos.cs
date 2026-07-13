namespace Vault.Application.Store;

public sealed record StoreListingItemDto(
    string Id,
    string Name,
    int Year,
    decimal Value,
    string Group,
    string Img);

public sealed record StoreListingDto(
    string Id,
    string Name,
    string Publisher,
    string Description,
    IReadOnlyList<string> Groups,
    IReadOnlyList<StoreListingItemDto> Items);
