-- Amortized (spread-over-time) expenses.
--
-- A large, irregular expense -- e.g. a yearly car-insurance premium paid in one
-- go -- shouldn't crater a single month's budget while flattering the other
-- eleven. When envelopes are used as *budgets* (planned spending per category)
-- rather than as cash reserves, the true monthly cost of such an expense is
-- total / months, consumed evenly across the amortization window.
--
-- Design (three invariants agreed with the product owner):
--   1. The payment record stays in history and carries the "amortized" marker,
--      but does NOT hit the envelope balance directly.
--   2. Only the derived monthly slices consume the budget.
--   3. Any edit to the header (amount, length, date) always re-derives the
--      slices, so state can never drift.
--
-- Invariant #3 is satisfied structurally: slices are never stored. They are a
-- pure function of (amount, amortized_months, amortized_start_on) on the
-- transaction row, computed on the fly -- exactly like envelope balances. There
-- is nothing to keep in sync, so drift is impossible.
--
-- The header and the payment record are the same row: an amortized expense is
-- just a budget_transaction that additionally carries amortization parameters.
-- Amortization is expense-only (spreading income has no budgeting meaning here).

alter table public.budget_transactions
  add column amortized_months smallint
    check (amortized_months is null or amortized_months between 2 and 120),
  add column amortized_start_on date;

-- amortized_months and amortized_start_on are both set or both null; a marked
-- transaction must be an expense.
alter table public.budget_transactions
  add constraint budget_transactions_amortization_complete
    check ((amortized_months is null) = (amortized_start_on is null)),
  add constraint budget_transactions_amortization_expense_only
    check (amortized_months is null or type = 'expense');

-- Generates the monthly amortization slices for every amortized transaction in
-- the household whose slice month falls within [p_from, p_to]. Slices are
-- aligned to the first day of each month, starting at the month of
-- amortized_start_on. Each slice is round(amount / months, 2); the final slice
-- absorbs the rounding remainder so the slices always sum back to `amount`
-- exactly (e.g. 1000 / 3 -> 333.33 + 333.33 + 333.34).
--
-- Security invoker (default), so RLS on budget_transactions applies to the
-- caller -- a member only ever sees their own household's slices.
create function public.get_amortized_charges(p_household_id uuid, p_from date, p_to date)
returns table (
  transaction_id uuid,
  envelope_id uuid,
  name text,
  currency text,
  month date,
  amount numeric
)
language sql
stable
as $$
  select
    bt.id as transaction_id,
    bt.envelope_id,
    bt.name,
    bt.currency,
    (date_trunc('month', bt.amortized_start_on) + make_interval(months => gs.i))::date as month,
    case
      when gs.i = bt.amortized_months - 1
        then bt.amount - round(bt.amount / bt.amortized_months, 2) * (bt.amortized_months - 1)
      else round(bt.amount / bt.amortized_months, 2)
    end as amount
  from public.budget_transactions bt
  cross join lateral generate_series(0, bt.amortized_months - 1) as gs(i)
  where bt.household_id = p_household_id
    and bt.amortized_months is not null
    and (date_trunc('month', bt.amortized_start_on) + make_interval(months => gs.i))::date
        between p_from and p_to;
$$;

grant execute on function public.get_amortized_charges(uuid, date, date) to authenticated;

-- get_envelope_balances: amortized transactions no longer contribute their full
-- amount (invariant #1); instead the envelope is charged the sum of amortization
-- slices whose month is on or before p_as_of (invariant #2). Future slices are
-- not yet consumed, mirroring the existing `occurred_on <= p_as_of` rule.

drop function if exists public.get_envelope_balances(uuid, date);

create function public.get_envelope_balances(p_household_id uuid, p_as_of date)
returns table (envelope_id uuid, balance numeric, balance_in_base numeric)
language sql
stable
as $$
  with base as (
    select coalesce(h.base_currency, 'PLN') as base_currency
    from public.households h
    where h.id = p_household_id
  ),
  amortized as (
    select c.envelope_id, sum(c.amount) as consumed
    from public.get_amortized_charges(p_household_id, 'epoch'::date, p_as_of) c
    group by c.envelope_id
  ),
  balances as (
    select
      e.id as envelope_id,
      coalesce(sum(
        case
          when bt.amortized_months is not null then 0
          when bt.type = 'income' then bt.amount
          when bt.type = 'expense' then -bt.amount
        end
      ), 0)
      + coalesce((
          select sum(t_in.amount)
          from public.envelope_transfers t_in
          where t_in.to_envelope_id = e.id and t_in.occurred_on <= p_as_of
        ), 0)
      - coalesce((
          select sum(t_out.amount)
          from public.envelope_transfers t_out
          where t_out.from_envelope_id = e.id and t_out.occurred_on <= p_as_of
        ), 0)
      - coalesce((select a.consumed from amortized a where a.envelope_id = e.id), 0) as balance
    from public.envelopes e
    left join public.budget_transactions bt
      on bt.envelope_id = e.id and bt.occurred_on <= p_as_of
    where e.household_id = p_household_id
    group by e.id
  )
  select
    balances.envelope_id,
    balances.balance,
    balances.balance
      * public.get_exchange_rate(p_household_id, 'PLN', p_as_of)
      / public.get_exchange_rate(p_household_id, base.base_currency, p_as_of)
      as balance_in_base
  from balances
  cross join base;
$$;

grant execute on function public.get_envelope_balances(uuid, date) to authenticated;
