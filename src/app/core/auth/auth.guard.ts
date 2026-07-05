import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready;

  return auth.user()
    ? true
    : router.parseUrl(`/login?returnUrl=${encodeURIComponent(state.url)}`);
};
