using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Vault.Application.Auth;
using Vault.Application.Collections;
using Vault.Application.Profile;
using Vault.Application.Store;
using Vault.Application.Tenants;

namespace Vault.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly);
        services.AddScoped<AuthService>();
        services.AddScoped<CollectionService>();
        services.AddScoped<Images.ImageService>();
        // Scoped like every other service: the background sweep opens a scope of
        // its own per run, so its DbContext is never shared with a request.
        services.AddScoped<Images.ImageGarbageCollector>();
        services.AddScoped<Export.ExportService>();
        services.AddScoped<Import.ImportService>();
        services.AddScoped<StoreService>();
        services.AddScoped<TenantMemberService>();
        services.AddScoped<TenantSettingsService>();
        services.AddScoped<ProfileService>();
        return services;
    }
}
