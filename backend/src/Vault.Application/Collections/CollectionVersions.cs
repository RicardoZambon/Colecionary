using System.Globalization;

namespace Vault.Application.Collections;

/// <summary>
/// Turns a collection's version counter into the HTTP entity-tag clients carry
/// back in <c>If-Match</c>, and answers whether a precondition matches.
/// </summary>
/// <remarks>
/// <para>
/// One place formats it so the tag in the <c>ETag</c> response header, the tag
/// embedded in the collection list, and the tag a precondition is compared
/// against cannot drift into three spellings of the same number.
/// </para>
/// <para>
/// The tag is <b>strong</b> (no <c>W/</c> prefix) and compared byte-for-byte,
/// which is what RFC 9110 requires of <c>If-Match</c>. Clients treat it as
/// opaque: nothing outside this file parses the digits, which is what would let
/// the token become a <c>rowversion</c> later without touching a line of the
/// frontend.
/// </para>
/// </remarks>
public static class CollectionVersions
{
    /// <summary>The entity-tag for a version, quotes included.</summary>
    public static string ToETag(int version) =>
        string.Create(CultureInfo.InvariantCulture, $"\"{version}\"");

    /// <summary>
    /// Whether any tag the client offered is the collection's current one.
    /// </summary>
    /// <remarks>
    /// A list is accepted because <c>If-Match</c> is defined as one, and
    /// answering only to a single tag would refuse a well-formed request. An
    /// empty list never matches — "no precondition" is refused earlier, with a
    /// 428, rather than quietly passing here.
    /// </remarks>
    public static bool Matches(int version, IReadOnlyCollection<string> ifMatch)
    {
        var current = ToETag(version);
        return ifMatch.Any(tag => string.Equals(tag, current, StringComparison.Ordinal));
    }
}
