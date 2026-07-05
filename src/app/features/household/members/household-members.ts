import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { HlmAlertImports } from '@spartan-ng/helm/alert';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmSelectImports } from '@spartan-ng/helm/select';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

import { AuthService } from '../../../core/auth/auth.service';
import {
  HouseholdInvite,
  HouseholdMember,
  HouseholdRole,
  HouseholdService,
} from '../../../core/household/household.service';

const ROLES: Array<{ value: HouseholdRole; label: string }> = [
  { value: 'owner', label: 'Owner' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
];

@Component({
  selector: 'app-household-members',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    HlmAlertImports,
    HlmButtonImports,
    HlmCardImports,
    HlmFieldImports,
    HlmInputImports,
    HlmSelectImports,
    HlmSpinnerImports,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h1 class="text-2xl font-semibold">Household members</h1>
        <p class="text-muted-foreground text-sm">
          {{ households.currentHousehold()?.name }}
        </p>
      </div>

      @if (errorMessage()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertTitle>Something went wrong</p>
          <p hlmAlertDescription>{{ errorMessage() }}</p>
        </div>
      }

      <div hlmCard>
        <div hlmCardHeader>
          <h2 hlmCardTitle>Members</h2>
          <p hlmCardDescription>Everyone with access to this household's data.</p>
        </div>
        <div hlmCardContent>
          @if (loading()) {
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <hlm-spinner />
              Loading members...
            </div>
          } @else {
            <ul class="flex flex-col gap-3">
              @for (member of members(); track member.user_id) {
                <li
                  class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div class="flex min-w-0 flex-col">
                    <span class="font-medium">
                      {{ member.email }}
                      @if (member.user_id === currentUserId()) {
                        <span class="text-muted-foreground text-sm">(you)</span>
                      }
                    </span>
                    <span class="text-muted-foreground text-sm">
                      Member since {{ member.created_at | date: 'mediumDate' }}
                    </span>
                  </div>

                  <div class="flex shrink-0 flex-wrap items-center gap-2">
                    @if (isOwner() && member.user_id !== currentUserId()) {
                      <hlm-select
                        [value]="member.role"
                        (valueChange)="changeRole(member, $event)"
                        [itemToString]="roleToString"
                      >
                        <hlm-select-trigger class="w-32">
                          <hlm-select-value />
                        </hlm-select-trigger>
                        <hlm-select-content *hlmSelectPortal>
                          @for (option of roles; track option.value) {
                            <hlm-select-item [value]="option.value">
                              {{ option.label }}
                            </hlm-select-item>
                          }
                        </hlm-select-content>
                      </hlm-select>
                      <button
                        hlmBtn
                        variant="destructive"
                        size="sm"
                        type="button"
                        [disabled]="busyUserId() === member.user_id"
                        (click)="remove(member)"
                      >
                        @if (busyUserId() === member.user_id) {
                          <hlm-spinner />
                        }
                        Remove
                      </button>
                    } @else {
                      <span class="text-muted-foreground text-sm">{{ roleToString(member.role) }}</span>
                    }
                  </div>
                </li>
              }
            </ul>
          }
        </div>
      </div>

      @if (isOwner()) {
        <div hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Invite someone</h2>
            <p hlmCardDescription>
              Generates a link you can share directly &mdash; no email is sent automatically.
            </p>
          </div>
          <div hlmCardContent class="flex flex-col gap-4">
            <form [formGroup]="inviteForm" (ngSubmit)="submitInvite()" novalidate class="flex flex-col gap-4">
              <div class="flex flex-col gap-4 sm:flex-row">
                <div hlmField class="flex-1">
                  <label hlmFieldLabel for="inviteEmail">Email</label>
                  <input
                    hlmInput
                    id="inviteEmail"
                    type="email"
                    formControlName="email"
                    autocomplete="off"
                  />
                  @if (inviteForm.controls.email.invalid && inviteForm.controls.email.touched) {
                    <hlm-field-error forceShow>Enter a valid email address.</hlm-field-error>
                  }
                </div>

                <div hlmField class="w-full sm:w-40">
                  <label hlmFieldLabel>Role</label>
                  <hlm-select
                    [value]="inviteRole()"
                    (valueChange)="onInviteRoleChange($event)"
                    [itemToString]="roleToString"
                  >
                    <hlm-select-trigger class="w-full">
                      <hlm-select-value />
                    </hlm-select-trigger>
                    <hlm-select-content *hlmSelectPortal>
                      @for (option of roles; track option.value) {
                        <hlm-select-item [value]="option.value">{{ option.label }}</hlm-select-item>
                      }
                    </hlm-select-content>
                  </hlm-select>
                </div>
              </div>

              <button hlmBtn type="submit" class="self-start" [disabled]="inviteForm.invalid || inviting()">
                @if (inviting()) {
                  <hlm-spinner />
                }
                Create invite link
              </button>
            </form>

            @if (lastInviteLink()) {
              <div class="border-border flex flex-col gap-2 rounded-md border p-4">
                <p class="text-sm font-medium">Share this link with {{ lastInviteEmail() }}:</p>
                <div class="flex flex-wrap items-center gap-2">
                  <code class="bg-muted rounded px-2 py-1 text-xs break-all">{{ lastInviteLink() }}</code>
                  <button hlmBtn variant="outline" size="sm" type="button" (click)="copyLink(lastInviteLink()!)">
                    {{ copied() ? 'Copied!' : 'Copy link' }}
                  </button>
                </div>
              </div>
            }
          </div>
        </div>

        <div hlmCard>
          <div hlmCardHeader>
            <h2 hlmCardTitle>Pending invites</h2>
            <p hlmCardDescription>Invites that haven't been accepted yet.</p>
          </div>
          <div hlmCardContent>
            @if (invites().length === 0) {
              <p class="text-muted-foreground text-sm">No pending invites.</p>
            } @else {
              <ul class="flex flex-col gap-3">
                @for (invite of invites(); track invite.id) {
                  <li
                    class="border-border flex flex-col gap-3 rounded-md border p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div class="flex min-w-0 flex-col">
                      <span class="font-medium">{{ invite.email }}</span>
                      <span class="text-muted-foreground text-sm">
                        {{ roleToString(invite.role) }} &middot; expires
                        {{ invite.expires_at | date: 'mediumDate' }}
                      </span>
                    </div>

                    <div class="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        hlmBtn
                        variant="outline"
                        size="sm"
                        type="button"
                        (click)="copyLink(inviteLink(invite))"
                      >
                        Copy link
                      </button>
                      <button
                        hlmBtn
                        variant="destructive"
                        size="sm"
                        type="button"
                        [disabled]="revokingId() === invite.id"
                        (click)="revoke(invite)"
                      >
                        @if (revokingId() === invite.id) {
                          <hlm-spinner />
                        }
                        Revoke
                      </button>
                    </div>
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class HouseholdMembers {
  protected readonly households = inject(HouseholdService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly roles = ROLES;
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly busyUserId = signal<string | null>(null);
  protected readonly inviting = signal(false);
  protected readonly revokingId = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly inviteRole = signal<HouseholdRole>('viewer');
  protected readonly lastInviteLink = signal<string | null>(null);
  protected readonly lastInviteEmail = signal<string | null>(null);

  protected readonly members = this.households.members;
  protected readonly invites = this.households.invites;
  protected readonly currentUserId = computed(() => this.auth.user()?.id ?? null);
  protected readonly isOwner = computed(() => this.households.currentRole() === 'owner');

  protected readonly inviteForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  constructor() {
    void this.loadAll();
  }

  protected readonly roleToString = (role: HouseholdRole): string =>
    ROLES.find((option) => option.value === role)?.label ?? role;

  protected onInviteRoleChange(value: HouseholdRole | HouseholdRole[] | null | undefined): void {
    if (typeof value === 'string') {
      this.inviteRole.set(value);
    }
  }

  protected inviteLink(invite: HouseholdInvite): string {
    return `${window.location.origin}/invite/accept?token=${invite.token}`;
  }

  protected async copyLink(link: string): Promise<void> {
    await navigator.clipboard.writeText(link);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected async changeRole(
    member: HouseholdMember,
    value: HouseholdRole | HouseholdRole[] | null | undefined,
  ): Promise<void> {
    if (typeof value !== 'string' || value === member.role) {
      return;
    }

    this.busyUserId.set(member.user_id);
    this.errorMessage.set(null);

    try {
      await this.households.updateMemberRole(member.user_id, value);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.busyUserId.set(null);
    }
  }

  protected async remove(member: HouseholdMember): Promise<void> {
    const confirmed = window.confirm(`Remove ${member.email} from this household?`);
    if (!confirmed) {
      return;
    }

    this.busyUserId.set(member.user_id);
    this.errorMessage.set(null);

    try {
      await this.households.removeMember(member.user_id);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.busyUserId.set(null);
    }
  }

  protected async submitInvite(): Promise<void> {
    if (this.inviteForm.invalid || this.inviting()) {
      return;
    }

    this.inviting.set(true);
    this.errorMessage.set(null);
    this.lastInviteLink.set(null);

    try {
      const { email } = this.inviteForm.getRawValue();
      const invite = await this.households.inviteMember(email, this.inviteRole());
      this.lastInviteLink.set(this.inviteLink(invite));
      this.lastInviteEmail.set(invite.email);
      this.inviteForm.reset();
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.inviting.set(false);
    }
  }

  protected async revoke(invite: HouseholdInvite): Promise<void> {
    this.revokingId.set(invite.id);
    this.errorMessage.set(null);

    try {
      await this.households.revokeInvite(invite.id);
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.revokingId.set(null);
    }
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      await this.households.loadMembers();

      if (this.isOwner()) {
        await this.households.loadInvites();
      }
    } catch (error) {
      this.errorMessage.set(this.extractMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  private extractMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === 'object' && 'message' in error) {
      return String((error as { message: unknown }).message);
    }

    return 'Something went wrong.';
  }
}
