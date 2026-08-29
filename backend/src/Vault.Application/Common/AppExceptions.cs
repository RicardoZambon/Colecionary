namespace Vault.Application.Common;

/// <summary>Maps to HTTP 404 via the global exception handler.</summary>
public sealed class NotFoundException(string message) : Exception(message);

/// <summary>Maps to HTTP 409. The message is shown to the user (toast).</summary>
public sealed class ConflictException(string message) : Exception(message);

/// <summary>Maps to HTTP 400 for domain rules that are not simple input validation.</summary>
public sealed class DomainRuleException(string message) : Exception(message);

/// <summary>
/// Maps to HTTP 428. The request must carry an <c>If-Match</c> precondition and
/// did not — so the server has no way to tell an up-to-date write from one built
/// on a document somebody has already replaced.
/// </summary>
/// <remarks>
/// Refusing rather than defaulting to "no precondition" is the whole guarantee.
/// An optional precondition protects only the clients that remember to send one,
/// which is precisely the set of clients that were never going to lose data.
/// </remarks>
public sealed class PreconditionRequiredException(string message) : Exception(message);

/// <summary>
/// Maps to HTTP 412. The client's version of the document is not the one in
/// storage: somebody else wrote in between, and accepting this write would
/// silently erase their changes.
/// </summary>
public sealed class PreconditionFailedException(string message, Exception? innerException = null)
    : Exception(message, innerException);
