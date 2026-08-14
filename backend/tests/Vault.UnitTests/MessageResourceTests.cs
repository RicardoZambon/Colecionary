using System.Globalization;
using Vault.Application.Resources;

namespace Vault.UnitTests;

/// <summary>
/// Pins the localized API text to its resource files.
///
/// <para>
/// <see cref="Messages"/> is hand-written rather than generated, so these tests
/// are what keeps it honest — and they check more than the generator would: that
/// every name resolves in the neutral culture, that the pt-BR satellite actually
/// translates all of them, and that the placeholders survive translation. A
/// message whose <c>{0}</c> got dropped in translation would silently swallow
/// the id it was supposed to name.
/// </para>
/// </summary>
public class MessageResourceTests
{
    private static readonly CultureInfo English = CultureInfo.GetCultureInfo("en");
    private static readonly CultureInfo Portuguese = CultureInfo.GetCultureInfo("pt-BR");

    /// <summary>Names whose value splices in a value at render time.</summary>
    private static readonly string[] Formatted =
    [
        nameof(Messages.CollectionNotFound),
        nameof(Messages.StoreListingNotFound),
        nameof(Messages.ImageNotFound),
        nameof(Messages.ImageHasNoBytes),
        nameof(Messages.UnknownGroupFieldType),
        nameof(Messages.UnknownCondition),
        nameof(Messages.UnknownCopyStatus),
        nameof(Messages.UnknownRole),
        nameof(Messages.UnknownPlan),
        nameof(Messages.SetupDatabaseNotUsable),
    ];

    [Fact]
    public void EveryName_ResolvesInEnglish()
    {
        var missing = Messages.Names.Where(n => string.IsNullOrWhiteSpace(Messages.In(n, English)));
        Assert.Empty(missing);
    }

    [Fact]
    public void EveryName_IsTranslatedToPortuguese()
    {
        // A name absent from the satellite silently falls back to English, which
        // is exactly the failure this catches: half the API answering in English
        // while the UI is in Portuguese.
        var untranslated = Messages.Names
            .Where(n => Messages.In(n, Portuguese) == Messages.In(n, English))
            .ToArray();
        Assert.Empty(untranslated);
    }

    [Fact]
    public void FormattedMessages_KeepTheirPlaceholder_InBothLanguages()
    {
        foreach (var name in Formatted)
        {
            Assert.Contains("{0}", Messages.In(name, English));
            Assert.Contains("{0}", Messages.In(name, Portuguese));
        }
    }

    [Fact]
    public void UnformattedMessages_HaveNoStrayPlaceholder()
    {
        foreach (var name in Messages.Names.Except(Formatted))
        {
            Assert.DoesNotContain("{0}", Messages.In(name, English));
            Assert.DoesNotContain("{0}", Messages.In(name, Portuguese));
        }
    }

    [Fact]
    public void CurrentUiCulture_DecidesWhichLanguageComesBack()
    {
        var original = CultureInfo.CurrentUICulture;
        try
        {
            CultureInfo.CurrentUICulture = Portuguese;
            var portuguese = Messages.CollectionNotFoundFor("retro");

            CultureInfo.CurrentUICulture = English;
            var english = Messages.CollectionNotFoundFor("retro");

            Assert.NotEqual(english, portuguese);
            // The id is data: it is spliced in verbatim, whatever the language.
            Assert.Contains("retro", english);
            Assert.Contains("retro", portuguese);
        }
        finally
        {
            CultureInfo.CurrentUICulture = original;
        }
    }

    [Fact]
    public void AnUnsupportedCulture_FallsBackToEnglish()
    {
        Assert.Equal(
            Messages.In(nameof(Messages.ProblemNotFound), English),
            Messages.In(nameof(Messages.ProblemNotFound), CultureInfo.GetCultureInfo("de-DE")));
    }
}
