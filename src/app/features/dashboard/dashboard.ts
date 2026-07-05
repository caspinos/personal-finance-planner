import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { TranslocoModule } from '@jsverse/transloco';

import { HouseholdService } from '../../core/household/household.service';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, HlmCardImports, HlmButtonImports, TranslocoModule],
  template: `
    <div hlmCard class="max-w-2xl">
      <div hlmCardHeader>
        <h1 hlmCardTitle>
          @if (households.currentHousehold()?.name; as name) {
            {{ 'dashboard.welcomeNamed' | transloco: { name } }}
          } @else {
            {{ 'dashboard.welcome' | transloco }}
          }
        </h1>
        <p hlmCardDescription>{{ 'dashboard.description' | transloco }}</p>
      </div>
      <div hlmCardFooter class="flex gap-2">
        <a hlmBtn size="sm" routerLink="/budget">{{ 'dashboard.goToBudget' | transloco }}</a>
        <a hlmBtn variant="outline" size="sm" routerLink="/net-worth">{{
          'dashboard.goToNetWorth' | transloco
        }}</a>
      </div>
    </div>
  `,
})
export class Dashboard {
  protected readonly households = inject(HouseholdService);
}
