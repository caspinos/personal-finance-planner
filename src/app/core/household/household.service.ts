import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase.service';

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  base_currency: string;
}

export type HouseholdRole = 'owner' | 'editor' | 'viewer';

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: HouseholdRole;
  email: string;
  created_at: string;
}

export interface HouseholdInvite {
  id: string;
  household_id: string;
  email: string;
  role: HouseholdRole;
  token: string;
  invited_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

const CURRENT_HOUSEHOLD_STORAGE_KEY = 'pfp.currentHouseholdId';

/**
 * The selected household is remembered per browser, so two devices signed in
 * to the same account can sit on different households. Reads and writes are
 * guarded because storage can be unavailable (private mode, blocked cookies)
 * and a throwing selection must not take the whole app down.
 */
function readStoredHouseholdId(): string | null {
  try {
    return localStorage.getItem(CURRENT_HOUSEHOLD_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredHouseholdId(householdId: string | null): void {
  try {
    if (householdId === null) {
      localStorage.removeItem(CURRENT_HOUSEHOLD_STORAGE_KEY);
    } else {
      localStorage.setItem(CURRENT_HOUSEHOLD_STORAGE_KEY, householdId);
    }
  } catch {
    // Selection just won't survive a reload; not worth failing the action.
  }
}

@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly householdsSignal = signal<Household[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly currentHouseholdIdSignal = signal<string | null>(readStoredHouseholdId());
  private readonly membersSignal = signal<HouseholdMember[]>([]);
  private readonly invitesSignal = signal<HouseholdInvite[]>([]);

  readonly households = this.householdsSignal.asReadonly();
  readonly loaded = this.loadedSignal.asReadonly();
  readonly members = this.membersSignal.asReadonly();
  readonly invites = this.invitesSignal.asReadonly();
  readonly currentHousehold = computed<Household | null>(() => {
    const households = this.householdsSignal();
    const currentId = this.currentHouseholdIdSignal();
    return households.find((household) => household.id === currentId) ?? households[0] ?? null;
  });
  readonly hasMultipleHouseholds = computed(() => this.householdsSignal().length > 1);
  readonly currentRole = computed<HouseholdRole | null>(() => {
    const userId = this.auth.user()?.id;
    return this.membersSignal().find((member) => member.user_id === userId)?.role ?? null;
  });

  async loadHouseholds(): Promise<Household[]> {
    const { data, error } = await this.supabase
      .from('households')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    this.householdsSignal.set(data ?? []);
    this.loadedSignal.set(true);
    this.dropStaleSelection();
    return this.householdsSignal();
  }

  selectHousehold(householdId: string): void {
    this.currentHouseholdIdSignal.set(householdId);
    writeStoredHouseholdId(householdId);
  }

  /**
   * Switches the active household and reloads the app at the dashboard.
   *
   * Feature components fetch their data once, in their constructor, and the
   * budget/net-worth/rates services cache it in root-level signals keyed to
   * whichever household was active at fetch time. A full reload is what
   * guarantees none of that survives the switch; an in-place navigation would
   * leave the previous household's envelopes, accounts and rates on screen.
   */
  switchHousehold(householdId: string): void {
    this.selectHousehold(householdId);
    window.location.assign('/');
  }

  /**
   * A household id stored by this browser can point at a household the user no
   * longer has (left, removed, or deleted elsewhere). Left in place it silently
   * wins over the fallback below and the app looks empty, so clear it and let
   * `currentHousehold` fall back to the first one the account can actually see.
   */
  private dropStaleSelection(): void {
    const storedId = this.currentHouseholdIdSignal();
    if (!storedId) {
      return;
    }

    if (!this.householdsSignal().some((household) => household.id === storedId)) {
      this.currentHouseholdIdSignal.set(null);
      writeStoredHouseholdId(null);
    }
  }

  async createHousehold(name: string): Promise<Household> {
    const userId = this.auth.user()?.id;
    if (!userId) {
      throw new Error('You must be signed in to create a household.');
    }

    const { data, error } = await this.supabase
      .from('households')
      .insert({ name, created_by: userId })
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.householdsSignal.update((households) => [...households, data]);
    this.selectHousehold(data.id);
    return data;
  }

  async updateBaseCurrency(baseCurrency: string): Promise<Household> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('households')
      .update({ base_currency: baseCurrency })
      .eq('id', householdId)
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.householdsSignal.update((households) =>
      households.map((household) => (household.id === householdId ? data : household)),
    );
    return data;
  }

  async loadMembers(): Promise<HouseholdMember[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase.rpc('get_household_members', {
      p_household_id: householdId,
    });

    if (error) {
      throw error;
    }

    this.membersSignal.set(data ?? []);
    return this.membersSignal();
  }

  async updateMemberRole(userId: string, role: HouseholdRole): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('household_members')
      .update({ role })
      .eq('household_id', householdId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    this.membersSignal.update((members) =>
      members.map((member) => (member.user_id === userId ? { ...member, role } : member)),
    );
  }

  async removeMember(userId: string): Promise<void> {
    const householdId = this.requireHouseholdId();

    const { error } = await this.supabase
      .from('household_members')
      .delete()
      .eq('household_id', householdId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    this.membersSignal.update((members) => members.filter((member) => member.user_id !== userId));
  }

  async loadInvites(): Promise<HouseholdInvite[]> {
    const householdId = this.requireHouseholdId();

    const { data, error } = await this.supabase
      .from('household_invites')
      .select('*')
      .eq('household_id', householdId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    this.invitesSignal.set(data ?? []);
    return this.invitesSignal();
  }

  async inviteMember(email: string, role: HouseholdRole): Promise<HouseholdInvite> {
    const householdId = this.requireHouseholdId();
    const userId = this.requireUserId();

    const { data, error } = await this.supabase
      .from('household_invites')
      .insert({ household_id: householdId, email, role, invited_by: userId })
      .select()
      .single();

    if (error) {
      throw error;
    }

    this.invitesSignal.update((invites) => [data, ...invites]);
    return data;
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await this.supabase
      .from('household_invites')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', inviteId);

    if (error) {
      throw error;
    }

    this.invitesSignal.update((invites) => invites.filter((invite) => invite.id !== inviteId));
  }

  async acceptInvite(token: string): Promise<Household> {
    const { data, error } = await this.supabase.rpc('accept_household_invite', {
      p_token: token,
    });

    if (error) {
      throw error;
    }

    const householdId = data?.[0]?.out_household_id as string | undefined;
    const households = await this.loadHouseholds();
    const joined = households.find((household) => household.id === householdId);
    if (!joined) {
      throw new Error("Joined the household, but couldn't load its details.");
    }

    this.selectHousehold(joined.id);
    return joined;
  }

  private requireHouseholdId(): string {
    const householdId = this.currentHousehold()?.id;
    if (!householdId) {
      throw new Error('No active household selected.');
    }
    return householdId;
  }

  private requireUserId(): string {
    const userId = this.auth.user()?.id;
    if (!userId) {
      throw new Error('You must be signed in.');
    }
    return userId;
  }
}
