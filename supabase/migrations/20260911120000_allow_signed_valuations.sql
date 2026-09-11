-- Valuations are not always non-negative. An asset account can be overdrawn
-- (a bank account in debit) and a liability can be overpaid, which turns it
-- into a receivable until the balance is used up.
--
-- The sign convention itself does not change: `value` is recorded from the
-- account's own perspective (for a liability, the amount owed), and
-- `get_net_worth_summary` keeps flipping the sign for liability accounts. A
-- negative value therefore reads as "the opposite of what this account type
-- usually holds": an overdraft on an asset, an overpayment on a liability.
--
-- The original `check (value >= 0)` was declared inline, so Postgres generated
-- its name. Look the constraint up instead of hard-coding that generated name,
-- so the drop still happens if it differs from the expected one.
do $$
declare
  target record;
begin
  for target in
    select conname
    from pg_constraint
    where conrelid = 'public.asset_valuations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%value%>=%0%'
  loop
    execute format('alter table public.asset_valuations drop constraint %I', target.conname);
  end loop;
end;
$$;

comment on column public.asset_valuations.value is
  'Balance as of valued_on, in the valuation currency, recorded from the account perspective: for liability accounts the amount owed, for every other type the amount held. Negative values are allowed and mean an overdraft (asset) or an overpayment (liability).';
