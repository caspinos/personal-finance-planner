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
        (m) => m.CreateHousehold,
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
      {
        path: 'budget',
        loadComponent: () => import('./features/budget/budget').then((m) => m.Budget),
      },
      {
        path: 'budget/envelopes/new',
        loadComponent: () =>
          import('./features/budget/envelope-form/envelope-form').then((m) => m.EnvelopeForm),
      },
      {
        path: 'budget/envelopes/:id',
        loadComponent: () =>
          import('./features/budget/envelope-history/envelope-history').then(
            (m) => m.EnvelopeHistory,
          ),
      },
      {
        path: 'budget/transactions/new',
        loadComponent: () =>
          import('./features/budget/transaction-form/transaction-form').then(
            (m) => m.TransactionForm,
          ),
      },
      {
        path: 'budget/transactions/:id/edit',
        loadComponent: () =>
          import('./features/budget/transaction-form/transaction-form').then(
            (m) => m.TransactionForm,
          ),
      },
      {
        path: 'budget/transfers/new',
        loadComponent: () =>
          import('./features/budget/transfer-form/transfer-form').then((m) => m.TransferForm),
      },
      {
        path: 'budget/transfers/:id/edit',
        loadComponent: () =>
          import('./features/budget/transfer-form/transfer-form').then((m) => m.TransferForm),
      },
    ],
  },
];
