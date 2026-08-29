using Microsoft.Net.Http.Headers;
using Vault.Application.Common;
using Vault.Application.Resources;

namespace Vault.Api.Infrastructure;

/// <summary>
/// Reads the <c>If-Match</c> precondition off a request, and refuses the
/// request when there isn't a usable one.
/// </summary>
/// <remarks>
/// <para>
/// <b>The header is mandatory, and that is the decision this whole feature
/// rests on.</b> An optional precondition protects only the clients that
/// already remember to send it — which is the set of clients that were never
/// going to lose anybody's work. Treating "absent" as "no opinion" would leave
/// the guard switched off by default for every buggy, old or hand-rolled
/// caller, i.e. exactly the callers that need it. RFC 9110 has a status code
/// for this and it is 428, so an omission is answered with one rather than
/// waved through.
/// </para>
/// <para>
/// It is a breaking change for any caller that already exists. There is exactly
/// one, in this repository, updated in the same change — and the repo's own rule
/// is that a contract change updates both sides plus the integration tests, not
/// that the contract may never move.
/// </para>
/// <para>
/// Three shapes carry no version and are therefore refused as "no
/// precondition": a bare <c>If-Match: *</c>, which RFC 9110 defines as "if the
/// resource exists at all" and which would be an opt-out wearing the right
/// clothes; a weak tag, which <c>If-Match</c> is defined to compare strongly and
/// so can never identify a version; and a header that does not parse. All three
/// answer 428 with the same message, because from the client's side the fix is
/// identical: send the version the server gave you. A <c>*</c> <em>alongside</em>
/// a real tag is fine — the real tag is what the precondition then turns on.
/// </para>
/// <para>
/// The list is not length-capped. It is bounded already by the request's header
/// size limit, and a cap here would refuse a well-formed request that <em>did</em>
/// name the current version with a status code saying it had not.
/// </para>
/// </remarks>
public static class IfMatch
{
    /// <summary>
    /// The strong entity-tags the request offered, quotes included.
    /// </summary>
    /// <exception cref="PreconditionRequiredException">
    /// No usable precondition — absent, empty, only <c>*</c>, only weak tags, or
    /// unparseable.
    /// </exception>
    public static IReadOnlyCollection<string> Require(HttpRequest request) =>
        Read(request) ?? throw new PreconditionRequiredException(Messages.IfMatchRequired);

    /// <summary>
    /// The tags the request offered, or null if it offered none.
    /// </summary>
    /// <remarks>
    /// For the two endpoints that do not <em>demand</em> a precondition — the
    /// two deletes. They ask nothing of a caller that sends none, but a caller
    /// that does send one has said something about the state it expects, and RFC
    /// 9110 §13.1.1 requires that to be evaluated rather than ignored. Silently
    /// dropping it would make the safest thing a client can do indistinguishable
    /// from the least safe.
    /// </remarks>
    public static IReadOnlyCollection<string>? Optional(HttpRequest request) => Read(request);

    private static IReadOnlyCollection<string>? Read(HttpRequest request)
    {
        var header = request.Headers.IfMatch;
        if (header.Count == 0 || !EntityTagHeaderValue.TryParseStrictList(header, out var tags))
        {
            return null;
        }

        var strong = tags
            .Where(tag => !tag.IsWeak && tag.Tag.HasValue && tag.Tag != EntityTagHeaderValue.Any.Tag)
            .Select(tag => tag.Tag.Value!)
            .ToArray();

        return strong.Length == 0 ? null : strong;
    }
}
