using System.Globalization;
using Vault.Application.Collections;

namespace Vault.UnitTests;

/// <summary>
/// The token itself: how a collection's version becomes an entity-tag, and what
/// counts as a match.
/// </summary>
/// <remarks>
/// Small surface, but everything downstream of it — the <c>ETag</c> header, the
/// version in the collection list, and the comparison a write is refused by —
/// goes through these two methods. Three spellings of the same number would be
/// a guard that refuses correct clients.
/// </remarks>
public class CollectionVersionTests
{
    [Fact]
    public void AVersionBecomesAStrongQuotedEntityTag()
    {
        Assert.Equal("\"1\"", CollectionVersions.ToETag(1));
        Assert.Equal("\"4096\"", CollectionVersions.ToETag(4096));
    }

    [Fact]
    public void TheTagIsCultureInvariant()
    {
        var thousands = CultureInfo.GetCultureInfo("pt-BR");
        var previous = CultureInfo.CurrentCulture;
        try
        {
            // A culture that groups digits would otherwise turn version 123456
            // into "123.456" on one server and "123,456" on another, and the two
            // would refuse each other's clients.
            CultureInfo.CurrentCulture = thousands;
            Assert.Equal("\"123456\"", CollectionVersions.ToETag(123456));
        }
        finally
        {
            CultureInfo.CurrentCulture = previous;
        }
    }

    [Fact]
    public void ATagMatchesOnlyItsOwnVersion()
    {
        Assert.True(CollectionVersions.Matches(7, ["\"7\""]));
        Assert.False(CollectionVersions.Matches(7, ["\"8\""]));
        Assert.False(CollectionVersions.Matches(7, ["\"6\""]));
    }

    [Fact]
    public void AListMatchesIfAnyTagDoes()
    {
        // If-Match is defined as a list, and refusing lists outright would
        // refuse a well-formed request.
        Assert.True(CollectionVersions.Matches(7, ["\"6\"", "\"7\""]));
        Assert.False(CollectionVersions.Matches(7, ["\"5\"", "\"6\""]));
    }

    [Fact]
    public void NoTagsNeverMatches()
    {
        // "No precondition" must never read as "any version will do". That case
        // is refused earlier with a 428, and this is the second line of the same
        // rule: if it ever got this far it would still not pass.
        Assert.False(CollectionVersions.Matches(7, []));
    }

    [Fact]
    public void AnUnquotedNumberIsNotATag()
    {
        // The digits are never compared, only the tag. A client sending the raw
        // number would be refused, which is what keeps the token opaque enough
        // to become something other than a counter later.
        Assert.False(CollectionVersions.Matches(7, ["7"]));
    }
}
