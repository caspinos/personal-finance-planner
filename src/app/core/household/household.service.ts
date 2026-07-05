import { Injectable, computed, inject, signal } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase.service';

export interface Household {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
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

@Injectable({ providedIn: 'root' })
export class HouseholdService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly auth = inject(AuthService);

  private readonly householdsSignal = signal<Household[]>([]);
  private readonly loadedSignal = signal(false);
  private readonly currentHouseholdIdSignal = signal<string | null>(
    localStorage.getItem(CURRENT_HOUSEHOLD_STORAGE_KEY)
  );
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
    return this.householdsSignal();
  }

  selectHousehold(householdId: string): void {
    this.currentHouseholdIdSignal.set(householdId);
    localStorage.setItem(CURRENT_HOUSEHOLD_STORAGE_KEY, householdId);
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
