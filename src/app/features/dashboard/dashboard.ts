import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

import { HouseholdService } from '../../core/household/household.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, HlmCardImports, HlmButtonImports],
  template: `
    <div hlmCard class="max-w-2xl">
      <div hlmCardHeader>
        <h1 hlmCardTitle>
          Welcome{{
            households.currentHousehold()?.name ? ', ' + households.currentHousehold()!.name : ''
          }}
        </h1>
        <p hlmCardDescription>Budget envelopes and net worth tracking will show up here soon.</p>
      </div>
      <div hlmCardFooter>
        <a hlmBtn size="sm" routerLink="/budget">Go to budget</a>
      </div>
    </div>
  `,
})
export class Dashboard {
  protected readonly households = inject(HouseholdService);
}
