// Production values are filled in once a remote Supabase project exists.
// The anon key is safe to commit: access is enforced by Postgres RLS policies,
// never put the service_role key here.
export const environment = {
  production: true,
  supabaseUrl: 'https://bliwvaoxxydeampcjqvq.supabase.co',
  supabaseAnonKey: 'sb_publishable_D4tDDr4fVtaFJio9LmucFw_4Wpp3CfI',
};
