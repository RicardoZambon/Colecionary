namespace Vault.Domain.ValueObjects;

/// <summary>
/// The currencies a vault can be read in, as ISO 4217 codes.
/// </summary>
/// <remarks>
/// A code, never a symbol. "R$" and "$" are how a code is *rendered* in a given
/// locale, and the renderer is the browser's <c>Intl.NumberFormat</c>, which
/// also knows that pt-BR writes "R$ 1.234,57" while en-US writes "$1,234.57".
/// Storing the symbol would freeze one of those spellings into the database and
/// still leave the separators to guess.
/// <para>
/// The list is curated rather than derived from <c>RegionInfo</c>: culture data
/// varies with the host's ICU build, and a whitelist that changes with the base
/// image would start rejecting values already saved in the database.
/// </para>
/// <para>
/// The frontend mirrors this list in <c>core/utils/money.util.ts</c>, the same
/// way it mirrors the condition and role whitelists. Both sides must move
/// together — the server is the validator, but a code missing from the client's
/// picker is one no user can choose.
/// </para>
/// </remarks>
public static class Money
{
    /// <summary>What an account is worth in before anyone chooses otherwise.</summary>
    public const string FallbackCurrency = "USD";

    /// <summary>Accepted ISO 4217 codes. Ordinal comparison: codes are uppercase by definition.</summary>
    public static readonly IReadOnlySet<string> SupportedCurrencies =
        new HashSet<string>(StringComparer.Ordinal)
        {
            "AUD", "BRL", "CAD", "CHF", "CNY", "DKK", "EUR", "GBP", "INR", "JPY",
            "MXN", "NOK", "NZD", "PLN", "SEK", "USD", "ZAR",
        };

    /// <summary>True when <paramref name="code"/> is a currency this vault can store.</summary>
    public static bool IsSupported(string? code) =>
        code is not null && SupportedCurrencies.Contains(code);
}
