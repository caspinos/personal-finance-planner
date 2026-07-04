import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { householdGuard } from './core/household/household.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'household/create',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/household/create-household/create-household').then(
        (m) => m.CreateHousehold
      ),
  },
  {
    path: '',
    canActivate: [authGuard, householdGuard],
    loadComponent: () => import('./layout/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
      },
    ],
  },
];
