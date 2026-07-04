import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { HouseholdService } from './household.service';

export const householdGuard: CanActivateFn = async () => {
  const households = inject(HouseholdService);
  const router = inject(Router);

  if (!households.loaded()) {
    await households.loadHouseholds();
  }

  return households.households().length > 0 ? true : router.parseUrl('/household/create');
};
