import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { languageInterceptor } from './core/i18n';
import { VaultApi } from './core/api/vault-api';
import { HttpVaultApi } from './core/api/http-vault-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor, languageInterceptor])),
    // VaultApi is the backend contract; HttpVaultApi talks to the .NET API.
    { provide: VaultApi, useClass: HttpVaultApi },
  ],
};
