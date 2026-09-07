namespace Vault.Domain.Enums;

/// <summary>
/// What a declared field describes. Orthogonal to where it is declared: a
/// collection and a group both declare fields of either scope.
/// </summary>
public enum FieldScope
{
    /// <summary>The catalogue entry — one value per item, in Item.Custom.</summary>
    Item,

    /// <summary>One physical copy — one value per copy, in ItemCopy.Custom.</summary>
    Copy,
}
