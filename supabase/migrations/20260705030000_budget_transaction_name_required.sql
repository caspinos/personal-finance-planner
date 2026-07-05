-- Envelope top-ups and charges (budget_transactions) must carry a name
-- describing what they're for, matching the "name" convention already used
-- by envelopes and recurring_envelope_rules. Existing rows without a
-- description are backfilled with a placeholder so the NOT NULL constraint
-- can be added.

alter table public.budget_transactions rename column description to name;

update public.budget_transactions set name = 'Unnamed transaction' where name is null;

alter table public.budget_transactions
  alter column name set not null,
  add constraint budget_transactions_name_not_blank check (char_length(btrim(name)) > 0);

-- process_due_recurring_rules (defined in the previous migration) inserts
-- into budget_transactions.description by name -- redefine it now that the
-- column is called `name`, so plpgsql resolves it against the current schema.
create or replace function public.process_due_recurring_rules(p_household_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rule record;
  run_date date;
  processed_count integer := 0;
begin
  if not public.is_household_member(p_household_id) then
    raise exception 'Not a member of this household';
  end if;

  for rule in
    select *
    from public.recurring_envelope_rules
    where household_id = p_household_id
      and active = true
      and next_run_on <= current_date
    for update
  loop
    run_date := rule.next_run_on;

    while run_date <= current_date loop
      insert into public.budget_transactions
        (household_id, envelope_id, type, amount, currency, occurred_on, name, created_by)
      values
        (rule.household_id, rule.envelope_id, rule.type, rule.amount, 'PLN', run_date, rule.name, rule.created_by);

      processed_count := processed_count + 1;
      run_date := (run_date + interval '1 month')::date;
    end loop;

    update public.recurring_envelope_rules
    set next_run_on = run_date, last_run_on = current_date
    where id = rule.id;
  end loop;

  return processed_count;
end;
$$;
