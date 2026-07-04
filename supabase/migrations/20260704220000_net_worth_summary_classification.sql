-- Surface asset classification (liquidity, category) in the net worth
-- summary so the UI can filter/group accounts without a second round trip.

drop function if exists public.get_net_worth_summary(uuid, date);

create function public.get_net_worth_summary(p_household_id uuid, p_as_of date)
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
  signed_value numeric
)
language sql
stable
as $$
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
    end as signed_value
  from public.asset_accounts aa
  left join lateral (
    select av.id, av.valued_on, av.value, av.currency
    from public.asset_valuations av
    where av.asset_account_id = aa.id
      and av.valued_on <= p_as_of
    order by av.valued_on desc, av.created_at desc
    limit 1
  ) latest on true
  where aa.household_id = p_household_id
    and aa.archived = false
  order by aa.created_at asc;
$$;

grant execute on function public.get_net_worth_summary(uuid, date) to authenticated;
