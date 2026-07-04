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
}

export default globalSetup;
