import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { SetupService } from './setup.service';

/** App routes: send the user to the wizard until the backend is configured. */
export const setupGuard: CanActivateFn = async () => {
  const setup = inject(SetupService);
  const router = inject(Router);
  return (await setup.isConfigured()) ? true : router.createUrlTree(['/setup']);
};

/** The wizard route: unreachable once the backend is configured. */
export const setupCompletedGuard: CanActivateFn = async () => {
  const setup = inject(SetupService);
  const router = inject(Router);
  return (await setup.isConfigured()) ? router.createUrlTree(['/']) : true;
};
