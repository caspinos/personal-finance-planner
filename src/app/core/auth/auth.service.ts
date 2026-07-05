import { Injectable, computed, inject, signal } from '@angular/core';
import type { AuthError, Session, User } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SupabaseService).client;

  private readonly sessionSignal = signal<Session | null>(null);

  /** Resolves once the initial session has been loaded from storage/Supabase. */
  readonly ready: Promise<void>;

  readonly session = this.sessionSignal.asReadonly();
  readonly user = computed<User | null>(() => this.sessionSignal()?.user ?? null);

  constructor() {
    this.ready = this.supabase.auth.getSession().then(({ data }) => {
      this.sessionSignal.set(data.session);
    });

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.sessionSignal.set(session);
    });
  }

  signInWithPassword(email: string, password: string): Promise<{ error: AuthError | null }> {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  async signUp(
    email: string,
    password: string,
  ): Promise<{ session: Session | null; error: AuthError | null }> {
    const { data, error } = await this.supabase.auth.signUp({ email, password });
    if (data.session) {
      this.sessionSignal.set(data.session);
    }
    return { session: data.session, error };
  }

  signOut(): Promise<{ error: AuthError | null }> {
    return this.supabase.auth.signOut();
  }
}
