using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Vault.Application.Abstractions;
using Vault.Infrastructure.Auth;
using Vault.Infrastructure.Persistence;
using Vault.Infrastructure.Persistence.Interceptors;
using Vault.Infrastructure.Persistence.Repositories;
using Vault.Infrastructure.Persistence.Seeding;
using Vault.Infrastructure.Storage;

namespace Vault.Infrastructure;

public static class DependencyInjection
{
    // contentRootPath resolves a relative ImageStorage:Root. It is passed in
    // because Infrastructure deliberately doesn't reference the hosting
    // abstractions, so it has no IHostEnvironment to ask.
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration,
        string contentRootPath)
    {
        services.AddScoped<TenantStampingInterceptor>();
        // Stateless, so a singleton; ordered before tenant stamping so the row
        // it marks modified is still validated by the stamping pass.
        services.AddSingleton<CollectionVersionInterceptor>();
        services.AddDbContext<VaultDbContext>((sp, options) =>
            options
                .UseSqlServer(configuration.GetConnectionString("Vault"))
                .AddInterceptors(
                    sp.GetRequiredService<CollectionVersionInterceptor>(),
                    sp.GetRequiredService<TenantStampingInterceptor>()));

        services.AddScoped<Vault.Application.Setup.ISetupBootstrapper, Vault.Infrastructure.Setup.SetupBootstrapper>();

        services.AddScoped<ICollectionRepository, CollectionRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<ITenantRepository, TenantRepository>();
        services.AddScoped<IStoreListingRepository, StoreListingRepository>();
        services.AddScoped<IImageRepository, ImageRepository>();

        services.AddOptions<JwtOptions>()
            .BindConfiguration(JwtOptions.SectionName)
            .ValidateDataAnnotations()
            .ValidateOnStart();
        // Fail fast on a nonsensical throttle rather than silently serving an
        // endpoint whose protection is a negative window.
        services.AddOptions<LoginThrottleOptions>()
            .BindConfiguration(LoginThrottleOptions.SectionName)
            .ValidateDataAnnotations()
            .Validate(
                o => o.FailureWindow > TimeSpan.Zero
                     && o.AccountDelay > TimeSpan.Zero
                     && o.ClientDelay > TimeSpan.Zero
                     && o.RecordExpiry > TimeSpan.Zero
                     && o.MaxAccountDelay >= o.AccountDelay,
                "LoginThrottle windows must be positive, and MaxAccountDelay at least AccountDelay.")
            .ValidateOnStart();

        services.AddOptions<SeedOptions>().BindConfiguration(SeedOptions.SectionName);
        services.AddOptions<ImageStorageOptions>().BindConfiguration(ImageStorageOptions.SectionName);
        // The collector permanently destroys user data, so a nonsensical setting
        // has to stop the process rather than be rounded into something
        // plausible. In particular a grace period shorter than
        // MinimumGracePeriod is refused outright: it would turn mark-and-sweep
        // back into delete-on-dereference, which is the one shape this design
        // exists to avoid.
        services.AddOptions<ImageGcOptions>()
            .BindConfiguration(ImageGcOptions.SectionName)
            .ValidateDataAnnotations()
            .Validate(
                o => o.GracePeriod >= ImageGcOptions.MinimumGracePeriod
                     && o.Interval > TimeSpan.Zero
                     && o.Interval <= ImageGcOptions.MaximumTimerSpan
                     && o.InitialDelay >= TimeSpan.Zero
                     && o.InitialDelay <= ImageGcOptions.MaximumTimerSpan,
                $"ImageGc.GracePeriod must be at least {ImageGcOptions.MinimumGracePeriod}; "
                + "ImageGc.Interval must be positive and ImageGc.InitialDelay must not be negative; "
                + $"both must be at most {ImageGcOptions.MaximumTimerSpan}.")
            .ValidateOnStart();

        services.AddSingleton<IImageStore>(sp =>
        {
            var root = sp.GetRequiredService<IOptions<ImageStorageOptions>>().Value.Root;
            return new FileSystemImageStore(
                Path.IsPathRooted(root) ? root : Path.Combine(contentRootPath, root));
        });
        services.AddScoped<LegacyImageBlobExporter>();
        // Stateless and thread-safe; one instance serves every request.
        services.AddSingleton<IImageDeriver, SkiaImageDeriver>();

        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IJwtTokenService, JwtTokenService>();
        // Singleton on purpose: the failure counts have to outlive the request
        // that produced them, which is the whole point of the throttle.
        services.AddSingleton<ILoginAttemptTracker, InMemoryLoginAttemptTracker>();
        services.AddSingleton<IPasswordService, PasswordService>();
        services.AddScoped<DbSeeder>();

        return services;
    }
}
