using System.Globalization;
using System.Text;

namespace Vault.Application.Archives;

/// <summary>
/// Names the file a download lands as.
/// </summary>
/// <remarks>
/// A collection is named by its owner, in their language, so the name reaching
/// <c>Content-Disposition</c> is arbitrary user text: accents, punctuation,
/// emoji, quotes. Rather than encode all of that (RFC 5987, which browsers and
/// file managers still handle unevenly), the name is folded to a plain ASCII
/// slug — "Ficção Científica" becomes <c>vault-ficcao-cientifica.zip</c>. The
/// file is for a human to recognise in a downloads folder; it is not an
/// identifier, and the archive carries the real name inside.
/// </remarks>
public static class ArchiveFileName
{
    /// <summary>The whole-vault archive. Fixed: there is only ever one.</summary>
    public const string Vault = "vault-export.zip";

    private const int MaxSlugLength = 60;

    /// <summary>
    /// Falls back through the name, then the id, then a constant — a collection
    /// named only in a script this fold cannot represent still downloads as a
    /// file, rather than as a bare "vault-.zip".
    /// </summary>
    public static string ForCollection(string name, string id)
    {
        var slug = Slug(name);
        if (slug.Length == 0)
        {
            slug = Slug(id);
        }

        return $"vault-{(slug.Length == 0 ? "collection" : slug)}.zip";
    }

    /// <summary>
    /// Lowercase ASCII words joined by hyphens. Accented letters decompose to
    /// their base letter (é → e) rather than being dropped, so a Portuguese name
    /// stays readable instead of collapsing to a row of hyphens.
    /// </summary>
    private static string Slug(string value)
    {
        var decomposed = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);
        var pendingSeparator = false;

        foreach (var ch in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) == UnicodeCategory.NonSpacingMark)
            {
                continue; // the accent that FormD split off its letter
            }

            if (char.IsAsciiLetterOrDigit(ch))
            {
                if (pendingSeparator && builder.Length > 0)
                {
                    builder.Append('-');
                }

                pendingSeparator = false;
                builder.Append(char.ToLowerInvariant(ch));

                if (builder.Length == MaxSlugLength)
                {
                    break;
                }
            }
            else
            {
                // Runs of punctuation and spaces collapse into one hyphen, and a
                // trailing run into none, by only emitting on the next letter.
                pendingSeparator = true;
            }
        }

        return builder.ToString();
    }
}
