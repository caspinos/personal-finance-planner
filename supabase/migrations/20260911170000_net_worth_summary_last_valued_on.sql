-- Report each account's newest valuation date, over its whole history.
--
-- The timeline has to know when an archived account stopped being tracked, so
-- it can stop carrying its final balance forward. Deriving that from the rows
-- of the visible window is wrong: those rows only ever carry the newest
-- valuation at or before the window, so an account valued in Jan 2024 and
-- again in Jan 2026 looks, from a 2025 window, as though it ended in Jan 2024 --
-- and its perfectly valid 2025 balance would be blanked out of both its row and
-- the totals.
--
-- last_valued_on ignores p_as_of on purpose: it is a fact about the account, not
-- about the date being viewed, so the answer is the same in every window.

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
  signed_value numeric,
  value_in_base numeric,
  signed_value_in_base numeric
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
      when aa.type = 'liability' then -coalesce(latest.value, 0)
      else coalesce(latest.value, 0)
    end as signed_value,
    case
      when coalesce(latest.currency, aa.currency) = base.base_currency then coalesce(latest.value, 0)
      else
        coalesce(latest.value, 0)
          * public.get_exchange_rate(p_household_id, coalesce(latest.currency, aa.currency), p_as_of)
          / public.get_exchange_rate(p_household_id, base.base_currency, p_as_of)
    end as value_in_base,
    case
      when coalesce(latest.currency, aa.currency) = base.base_currency then
        case
          when aa.type = 'liability' then -coalesce(latest.value, 0)
          else coalesce(latest.value, 0)
        end
      else
        (case
          when aa.type = 'liability' then -coalesce(latest.value, 0)
          else coalesce(latest.value, 0)
        end)
          * public.get_exchange_rate(p_household_id, coalesce(latest.currency, aa.currency), p_as_of)
          / public.get_exchange_rate(p_household_id, base.base_currency, p_as_of)
    end as signed_value_in_base
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
