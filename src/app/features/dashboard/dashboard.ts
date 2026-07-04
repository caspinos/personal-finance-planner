import { Component, inject } from '@angular/core';

import { HouseholdService } from '../../core/household/household.service';

@Component({
  selector: 'app-dashboard',
  template: `
    <section>
      <h1>Welcome{{ households.currentHousehold()?.name ? ', ' + households.currentHousehold()!.name : '' }}</h1>
      <p>Budget envelopes and net worth tracking will show up here soon.</p>
    </section>
  `,
})
export class Dashboard {
  protected readonly households = inject(HouseholdService);
}
