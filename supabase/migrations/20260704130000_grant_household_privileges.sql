-- Supabase does not auto-expose newly created tables to the anon/authenticated
-- roles. RLS policies only filter rows; the roles still need the underlying
-- GRANT before they're allowed to touch the table at all.

grant select, insert, update, delete on public.households to authenticated;
grant select, insert, update, delete on public.household_members to authenticated;
