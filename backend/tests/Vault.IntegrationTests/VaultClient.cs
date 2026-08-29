using System.Net.Http.Headers;
using System.Net.Http.Json;
using Vault.Application.Collections.Dtos;

namespace Vault.IntegrationTests;

/// <summary>
/// Talking to the collection endpoints now that writes carry a precondition.
/// </summary>
/// <remarks>
/// <para>
/// <c>GET /api/collections</c> answers with a version envelope per collection,
/// and every write demands the matching <c>If-Match</c>. Most tests care about
/// neither — they want "save this document" — so the helpers here look the
/// current version up when the caller does not supply one, and take it
/// explicitly when the point of the test <em>is</em> the version.
/// </para>
/// <para>
/// Deliberately not a way to skip the precondition: there is no overload that
/// omits the header. A test that wants to see what a missing one does has to
/// build that request by hand, which is what
/// <c>OptimisticConcurrencyTests</c> does.
/// </para>
/// </remarks>
internal static class VaultClient
{
    /// <summary>Every collection, unwrapped from its version envelope.</summary>
    public static async Task<List<CollectionDto>> GetCollectionsAsync(this HttpClient client)
    {
        var versioned = await client.GetVersionedCollectionsAsync();
        return [.. versioned.Select(v => v.Collection)];
    }

    public static async Task<List<VersionedCollectionDto>> GetVersionedCollectionsAsync(this HttpClient client) =>
        (await client.GetFromJsonAsync<List<VersionedCollectionDto>>("/api/collections"))!;

    /// <summary>The entity-tag a write of this collection has to quote back.</summary>
    public static async Task<string> GetCollectionVersionAsync(this HttpClient client, string id)
    {
        var versioned = await client.GetVersionedCollectionsAsync();
        return versioned.Single(v => v.Collection.Id == id).Version;
    }

    /// <summary>
    /// PUTs a whole collection. Without <paramref name="ifMatch"/> it reads the
    /// current version first, which is what a client that has just synchronised
    /// would send.
    /// </summary>
    public static async Task<HttpResponseMessage> PutCollectionAsync(
        this HttpClient client,
        CollectionDto collection,
        string? ifMatch = null)
    {
        ifMatch ??= await client.GetCollectionVersionAsync(collection.Id);
        return await client.SendWithIfMatchAsync(
            $"/api/collections/{collection.Id}", collection, ifMatch);
    }

    /// <inheritdoc cref="PutCollectionAsync"/>
    public static async Task<HttpResponseMessage> PutItemAsync(
        this HttpClient client,
        string collectionId,
        ItemDto item,
        string? ifMatch = null)
    {
        ifMatch ??= await client.GetCollectionVersionAsync(collectionId);
        return await client.SendWithIfMatchAsync(
            $"/api/collections/{collectionId}/items/{item.Id}", item, ifMatch);
    }

    private static async Task<HttpResponseMessage> SendWithIfMatchAsync<T>(
        this HttpClient client,
        string url,
        T body,
        string ifMatch)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, url) { Content = JsonContent.Create(body) };
        // Parsed rather than added raw, so a malformed tag fails here in the
        // test rather than arriving at the server as a missing precondition.
        request.Headers.IfMatch.Add(EntityTagHeaderValue.Parse(ifMatch));
        return await client.SendAsync(request);
    }
}
