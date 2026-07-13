namespace Vault.IntegrationTests;

/// <summary>
/// Shares one API + Postgres container across all integration test classes —
/// container startup dominates test time.
/// </summary>
[CollectionDefinition(nameof(ApiCollection))]
public sealed class ApiCollection : ICollectionFixture<VaultApiFactory>;
