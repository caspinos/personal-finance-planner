import { Component, inject } from '@angular/core';

import { HlmCardImports } from '@spartan-ng/helm/card';

import { HouseholdService } from '../../core/household/household.service';

@Component({
  selector: 'app-dashboard',
  imports: [HlmCardImports],
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
    </div>
  `,
})
export class Dashboard {
  protected readonly households = inject(HouseholdService);
}
