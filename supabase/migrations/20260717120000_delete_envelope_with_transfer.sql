-- Deleting an envelope while preserving its history.
--
-- An envelope can accumulate one-off transactions, transfers, and recurring
-- rules. Deleting it outright would cascade-delete all of that history (see the
-- `on delete cascade` foreign keys), which is rarely what the user wants. This
-- RPC instead reassigns every operation of the deleted envelope to another
-- envelope the caller picks, then removes the now-empty envelope -- all in a
-- single transaction so history can never be left orphaned or half-moved.
--
-- Security invoker (default): the existing RLS policies still govern every
-- statement. In particular "Owners can delete envelopes" means only a household
-- owner can complete the final delete; if RLS blocks it the delete touches no
-- rows and the function raises, rolling back the reassignments too.
create function public.delete_envelope_with_transfer(
  p_household_id uuid,
  p_envelope_id uuid,
  p_target_envelope_id uuid
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if p_envelope_id = p_target_envelope_id then
    raise exception 'Cannot move operations to the envelope being deleted';
  end if;

  if not exists (
    select 1 from public.envelopes
    where id = p_envelope_id and household_id = p_household_id
  ) then
    raise exception 'Envelope not found in this household';
  end if;

  if not exists (
    select 1 from public.envelopes
    where id = p_target_envelope_id and household_id = p_household_id
  ) then
    raise exception 'Target envelope not found in this household';
  end if;

  -- Reassign one-off transactions and recurring rules to the target envelope.
  update public.budget_transactions
    set envelope_id = p_target_envelope_id
    where household_id = p_household_id and envelope_id = p_envelope_id;

  update public.recurring_envelope_rules
    set envelope_id = p_target_envelope_id
    where household_id = p_household_id and envelope_id = p_envelope_id;

  -- Transfers directly between the deleted envelope and the target would
  -- collapse into a self-transfer (forbidden by
  -- envelope_transfers_distinct_envelopes), so drop them rather than reassign.
  delete from public.envelope_transfers
    where household_id = p_household_id
      and (
        (from_envelope_id = p_envelope_id and to_envelope_id = p_target_envelope_id)
        or (from_envelope_id = p_target_envelope_id and to_envelope_id = p_envelope_id)
      );

  update public.envelope_transfers
    set from_envelope_id = p_target_envelope_id
    where household_id = p_household_id and from_envelope_id = p_envelope_id;

  update public.envelope_transfers
    set to_envelope_id = p_target_envelope_id
    where household_id = p_household_id and to_envelope_id = p_envelope_id;

  delete from public.envelopes
    where id = p_envelope_id and household_id = p_household_id;

  if not found then
    raise exception 'Envelope could not be deleted';
  end if;
end;
$$;

grant execute on function public.delete_envelope_with_transfer(uuid, uuid, uuid) to authenticated;
