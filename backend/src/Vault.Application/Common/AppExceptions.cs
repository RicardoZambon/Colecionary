namespace Vault.Application.Common;

/// <summary>Maps to HTTP 404 via the global exception handler.</summary>
public sealed class NotFoundException(string message) : Exception(message);

/// <summary>Maps to HTTP 409. The message is shown to the user (toast).</summary>
public sealed class ConflictException(string message) : Exception(message);

/// <summary>Maps to HTTP 400 for domain rules that are not simple input validation.</summary>
public sealed class DomainRuleException(string message) : Exception(message);
