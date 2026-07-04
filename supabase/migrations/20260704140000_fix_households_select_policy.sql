-- INSERT ... RETURNING evaluates the SELECT policy for the just-inserted row
-- before the AFTER INSERT trigger (handle_new_household) has created the
-- creator's household_members row, so a freshly created household always
-- failed "is_household_member". Let the creator see their own household
-- directly so household creation works without depending on trigger timing.

drop policy "Members can view their household" on public.households;

create policy "Members can view their household"
  on public.households for select
  using (public.is_household_member(id) or created_by = auth.uid());
