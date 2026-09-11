-- Let the analytical timeline include archived accounts.
--
-- Archiving is a "stop showing this in my current picture" action, but the
-- summary function filtered archived accounts out unconditionally, so archiving
-- a paid-off loan also rewrote history: months in which that loan was still
-- outstanding lost it from both the per-account rows and the totals. Net worth
-- for a past month must not change because of something the user did today.
--
-- p_include_archived defaults to false, so the current-snapshot callers keep
-- their existing behaviour; only the timeline opts in.

drop function if exists public.get_net_worth_summary(uuid, date);

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
