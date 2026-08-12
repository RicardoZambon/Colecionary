namespace Vault.Domain.Enums;

/// <summary>
/// Declared type of a group's custom field. Values are still stored as text on
/// the item; the type decides how they are entered and how they compare when
/// items are ordered by the field.
/// </summary>
public enum GroupFieldType
{
    Text,
    Number,
    Date,
}
