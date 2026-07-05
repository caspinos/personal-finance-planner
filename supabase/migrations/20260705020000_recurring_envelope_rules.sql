-- Recurring envelope rules: monthly automatic top-ups (income) and cyclical
-- charges (expense). One mechanism covers both, differentiated by
-- `budget_transaction_type` just like one-off budget_transactions.
--
-- Rules fire on `day_of_month` (clamped to 1-28 so every month has that day).
-- `next_run_on` advances by exactly one calendar month per occurrence, so it
-- always lands on the same day_of_month. Processing is client-triggered
-- (called when the household's budget data loads) rather than a server-side
-- cron job, catching up on any months missed while nobody had the app open.

create table public.recurring_envelope_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  envelope_id uuid not null references public.envelopes (id) on delete cascade,
  type public.budget_transaction_type not null,
  amount numeric(14, 2) not null check (amount > 0),
  name text not null check (char_length(btrim(name)) > 0),
  day_of_month smallint not null check (day_of_month between 1 and 28),
  active boolean not null default true,
  next_run_on date not null,
  last_run_on date,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.recurring_envelope_rules enable row level security;

create policy "Members can view household recurring rules"
  on public.recurring_envelope_rules for select
  using (public.is_household_member(household_id));

create policy "Editors can create recurring rules"
  on public.recurring_envelope_rules for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update recurring rules"
  on public.recurring_envelope_rules for update
  using (public.is_household_editor(household_id));

create policy "Editors can delete recurring rules"
  on public.recurring_envelope_rules for delete
  using (public.is_household_editor(household_id));

grant select, insert, update, delete on public.recurring_envelope_rules to authenticated;

-- Creates a budget_transaction for every occurrence of every active, due rule
-- in the household (backfilling if several months have elapsed since the
-- last check-in), then advances next_run_on/last_run_on past today.
-- Security definer so any household member can trigger catch-up (e.g. a
-- viewer opening the app) without needing editor privileges themselves --
-- generated transactions are attributed to the rule's own creator.
create function public.process_due_recurring_rules(p_household_id uuid)
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
        (household_id, envelope_id, type, amount, currency, occurred_on, description, created_by)
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

grant execute on function public.process_due_recurring_rules(uuid) to authenticated;
