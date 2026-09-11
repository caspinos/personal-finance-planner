-- Valuations now carry their own sign.
--
-- `value` used to be constrained to be non-negative, recorded from the
-- account's own perspective, and `get_net_worth_summary` flipped the sign for
-- liability accounts. That made the two edge cases impossible to record: an
-- overdrawn (debit) account, and an overpaid liability that has turned into a
-- receivable.
--
-- From now on a valuation is recorded exactly the way it contributes to net
-- worth: a debt of 100 is -100, an overpayment on that debt is +100, and an
-- overdrawn account is negative. Nothing flips the sign afterwards, which also
-- makes `signed_value`/`signed_value_in_base` redundant -- the summary drops
-- them and callers read `value`/`value_in_base`.

-- 1. Allow negative valuations, and move existing liabilities onto the new
--    convention ---------------------------------------------------------------
--
-- The original `check (value >= 0)` was declared inline, so Postgres generated
-- its name. Drop every check constraint that mentions the column rather than
-- assuming either the generated name or the pretty-printed predicate: this
-- table has exactly one, and it is the one being lifted.
--
-- That same constraint is what marks a database as still being on the old
-- convention, so the sign flip is tied to it. Re-running this migration finds
-- no constraint, skips the flip, and leaves the data alone -- otherwise a
-- second run would quietly flip every liability back.
do $$
declare
  target record;
  on_old_convention boolean;
begin
  select exists (
    select 1
    from pg_constraint
    where conrelid = 'public.asset_valuations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%value%'
  ) into on_old_convention;

  for target in
    select conname
    from pg_constraint
    where conrelid = 'public.asset_valuations'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%value%'
  loop
    execute format('alter table public.asset_valuations drop constraint %I', target.conname);
  end loop;

  if on_old_convention then
    update public.asset_valuations av
    set value = -av.value
    from public.asset_accounts aa
    where aa.id = av.asset_account_id
      and aa.type = 'liability'
      and av.value <> 0;
  end if;
end;
$$;

comment on column public.asset_valuations.value is
  'Balance as of valued_on, in the valuation currency, signed the way it contributes to net worth: negative for a debt or an overdrawn account, positive for an asset or an overpaid liability.';

-- 2. Stop flipping the sign in the summary ------------------------------------
--
-- Otherwise unchanged from 20260911170000_net_worth_summary_last_valued_on.sql:
-- p_include_archived and last_valued_on keep working exactly as they do there.

drop function if exists public.get_net_worth_summary(uuid, date, boolean);

create function public.get_net_worth_summary(
  p_household_id uuid,
  p_as_of date,
  p_include_archived boolean default false
)
returns table (
  account_id uuid,
  account_name text,
  account_type public.asset_account_type,
  liquidity public.asset_liquidity_class,
  category text,
  currency text,
  valuation_id uuid,
  valued_on date,
  last_valued_on date,
  value numeric,
  value_in_base numeric
)
language sql
stable
as $$
  with base as (
    select coalesce(h.base_currency, 'PLN') as base_currency
    from public.households h
    where h.id = p_household_id
  )
  select
    aa.id as account_id,
    aa.name as account_name,
    aa.type as account_type,
    aa.liquidity,
    aa.category,
    coalesce(latest.currency, aa.currency) as currency,
    latest.id as valuation_id,
    latest.valued_on,
    (
      select max(av.valued_on)
      from public.asset_valuations av
      where av.asset_account_id = aa.id
    ) as last_valued_on,
    coalesce(latest.value, 0) as value,
    case
      when coalesce(latest.currency, aa.currency) = base.base_currency then coalesce(latest.value, 0)
      else
        coalesce(latest.value, 0)
          * public.get_exchange_rate(p_household_id, coalesce(latest.currency, aa.currency), p_as_of)
          / public.get_exchange_rate(p_household_id, base.base_currency, p_as_of)
    end as value_in_base
  from public.asset_accounts aa
  cross join base
  left join lateral (
    select av.id, av.valued_on, av.value, av.currency
    from public.asset_valuations av
    where av.asset_account_id = aa.id
      and av.valued_on <= p_as_of
    order by av.valued_on desc, av.created_at desc
    limit 1
  ) latest on true
  where aa.household_id = p_household_id
    and (p_include_archived or aa.archived = false)
  order by aa.created_at asc;
$$;

grant execute on function public.get_net_worth_summary(uuid, date, boolean) to authenticated;
