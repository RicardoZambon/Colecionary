import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { languageInterceptor } from './core/i18n';
import { errorInterceptor } from './core/api/error.interceptor';
import { VaultApi } from './core/api/vault-api';
import { HttpVaultApi } from './core/api/http-vault-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    /*
     * Order is load-bearing, and it reads outside-in: a request travels down the
     * list and a response comes back up it.
     *
     * `errorInterceptor` sits **first**, so it is the last to see a failing
     * response — and therefore sees the final outcome, after `authInterceptor`
     * has had its say about a 401. Putting it after auth would mean reporting
     * "you don't have permission" in a corner toast while the app was already
     * navigating away to the login page. It also owns the retry, which has to
     * wrap the token attachment rather than the other way round: a retried
     * request re-enters the chain below it and picks the token up again.
     */
    provideHttpClient(
      withInterceptors([errorInterceptor, authInterceptor, languageInterceptor]),
    ),
    // VaultApi is the backend contract; HttpVaultApi talks to the .NET API.
    { provide: VaultApi, useClass: HttpVaultApi },
  ],
};
