import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { LANGUAGE_STORAGE_STATE_PATH } from './language';

/**
 * Runs once before the whole E2E suite. Fails fast with a clear message if
 * the local Supabase stack isn't running, instead of letting every test time
 * out individually against network errors.
 */
async function globalSetup(): Promise<void> {
  const supabaseUrl = process.env['E2E_SUPABASE_URL'] ?? 'http://127.0.0.1:54321';

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`);
    if (!response.ok) {
      throw new Error(`Received ${response.status} from ${supabaseUrl}`);
    }
  } catch (error) {
    throw new Error(
      `Could not reach the local Supabase stack at ${supabaseUrl}. ` +
        `Start it first with "npx supabase start", then re-run the E2E tests. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // The app defaults to Polish when no language preference is stored (see
  // app.config.ts), but every test/support helper locates elements by their
  // English copy. Seed the language preference via storageState so tests get
  // English UI regardless of the app's default, without touching every spec.
  const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';
  await mkdir(path.dirname(LANGUAGE_STORAGE_STATE_PATH), { recursive: true });
  await writeFile(
    LANGUAGE_STORAGE_STATE_PATH,
    JSON.stringify({
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: 'pfp.lang', value: 'en' }],
        },
      ],
    }),
  );
}

export default globalSetup;
