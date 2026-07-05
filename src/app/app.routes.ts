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
    path: 'invite/accept',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/household/accept-invite/accept-invite').then((m) => m.AcceptInvite),
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
        path: 'household/members',
        loadComponent: () =>
          import('./features/household/members/household-members').then(
            (m) => m.HouseholdMembers,
          ),
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
      {
        path: 'net-worth',
        loadComponent: () => import('./features/net-worth/net-worth').then((m) => m.NetWorth),
      },
      {
        path: 'net-worth/accounts/new',
        loadComponent: () =>
          import('./features/net-worth/account-form/account-form').then((m) => m.AccountForm),
      },
      {
        path: 'net-worth/accounts/:id',
        loadComponent: () =>
          import('./features/net-worth/account-history/account-history').then(
            (m) => m.AccountHistory,
          ),
      },
      {
        path: 'net-worth/valuations/new',
        loadComponent: () =>
          import('./features/net-worth/valuation-form/valuation-form').then(
            (m) => m.ValuationForm,
          ),
      },
      {
        path: 'net-worth/valuations/:id/edit',
        loadComponent: () =>
          import('./features/net-worth/valuation-form/valuation-form').then(
            (m) => m.ValuationForm,
          ),
      },
      {
        path: 'net-worth/holdings/new',
        loadComponent: () =>
          import('./features/net-worth/holding-form/holding-form').then((m) => m.HoldingForm),
      },
      {
        path: 'net-worth/holdings/transactions/new',
        loadComponent: () =>
          import('./features/net-worth/holding-transaction-form/holding-transaction-form').then(
            (m) => m.HoldingTransactionForm,
          ),
      },
      {
        path: 'net-worth/holdings/transactions/:id/edit',
        loadComponent: () =>
          import('./features/net-worth/holding-transaction-form/holding-transaction-form').then(
            (m) => m.HoldingTransactionForm,
          ),
      },
      {
        path: 'net-worth/holdings/:id',
        loadComponent: () =>
          import('./features/net-worth/holding-history/holding-history').then(
            (m) => m.HoldingHistory,
          ),
      },
    ],
  },
];
