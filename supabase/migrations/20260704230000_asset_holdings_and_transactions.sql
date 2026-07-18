-- Per-holding detail for investment accounts: buy/sell transactions on a
-- named instrument (stock, ETF, fund, etc.) within an investment account.
-- This is additive to the whole-account manual valuations from Stage 3 --
-- an investment account can still carry a manual valuation, and can
-- optionally break its value down into individual holdings tracked here.
--
-- Quantity and market value are derived (event-based), consistent with
-- the rest of the app: no stored running totals. Average cost is a simple
-- weighted-average of all buys (not FIFO/lot-based), which is an accepted
-- simplification for now -- see docs/feature-map.md.

create type public.asset_transaction_type as enum ('buy', 'sell');

create table public.asset_holdings (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  asset_account_id uuid not null references public.asset_accounts (id) on delete cascade,
  name text not null,
  ticker text,
  currency text not null default 'PLN',
  archived boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.asset_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  asset_holding_id uuid not null references public.asset_holdings (id) on delete cascade,
  type public.asset_transaction_type not null,
  quantity numeric(18, 6) not null check (quantity > 0),
  price_per_unit numeric(14, 4) not null check (price_per_unit >= 0),
  fee numeric(12, 2) not null default 0,
  occurred_on date not null default current_date,
  note text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.asset_holdings enable row level security;
alter table public.asset_transactions enable row level security;

-- asset_holdings policies (mirrors asset_accounts)
create policy "Members can view household asset holdings"
  on public.asset_holdings for select
  using (public.is_household_member(household_id));

create policy "Editors can create asset holdings"
  on public.asset_holdings for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update asset holdings"
  on public.asset_holdings for update
  using (public.is_household_editor(household_id));

create policy "Owners can delete asset holdings"
  on public.asset_holdings for delete
  using (public.is_household_owner(household_id));

-- asset_transactions policies (mirrors asset_valuations)
create policy "Members can view household asset transactions"
  on public.asset_transactions for select
  using (public.is_household_member(household_id));

create policy "Editors can create asset transactions"
  on public.asset_transactions for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update asset transactions"
  on public.asset_transactions for update
  using (public.is_household_editor(household_id));

create policy "Editors can delete asset transactions"
  on public.asset_transactions for delete
  using (public.is_household_editor(household_id));

grant select, insert, update, delete on public.asset_holdings to authenticated;
grant select, insert, update, delete on public.asset_transactions to authenticated;

create function public.get_holding_positions(p_household_id uuid, p_as_of date)
returns table (
  holding_id uuid,
  holding_name text,
  ticker text,
  asset_account_id uuid,
  currency text,
  quantity numeric,
  average_cost numeric,
  invested_amount numeric,
  latest_price numeric,
  market_value numeric,
  unrealized_gain numeric
)
language sql
stable
as $$
  with buys as (
    select asset_holding_id,
      sum(quantity) as bought_qty,
      sum(quantity * price_per_unit + fee) as bought_cost
    from public.asset_transactions
    where household_id = p_household_id
      and type = 'buy'
      and occurred_on <= p_as_of
    group by asset_holding_id
  ),
  sells as (
    select asset_holding_id,
      sum(quantity) as sold_qty
    from public.asset_transactions
    where household_id = p_household_id
      and type = 'sell'
      and occurred_on <= p_as_of
    group by asset_holding_id
  ),
  latest as (
    select distinct on (asset_holding_id) asset_holding_id, price_per_unit
    from public.asset_transactions
    where household_id = p_household_id
      and occurred_on <= p_as_of
    order by asset_holding_id, occurred_on desc, created_at desc
  )
  select
    ah.id as holding_id,
    ah.name as holding_name,
    ah.ticker,
    ah.asset_account_id,
    ah.currency,
    coalesce(b.bought_qty, 0) - coalesce(s.sold_qty, 0) as quantity,
    case when coalesce(b.bought_qty, 0) > 0 then b.bought_cost / b.bought_qty else 0 end
      as average_cost,
    case when coalesce(b.bought_qty, 0) > 0 then
      (b.bought_cost / b.bought_qty) * (coalesce(b.bought_qty, 0) - coalesce(s.sold_qty, 0))
    else 0 end as invested_amount,
    coalesce(l.price_per_unit, 0) as latest_price,
    (coalesce(b.bought_qty, 0) - coalesce(s.sold_qty, 0)) * coalesce(l.price_per_unit, 0)
      as market_value,
    (coalesce(b.bought_qty, 0) - coalesce(s.sold_qty, 0)) * coalesce(l.price_per_unit, 0)
      - case when coalesce(b.bought_qty, 0) > 0 then
          (b.bought_cost / b.bought_qty) * (coalesce(b.bought_qty, 0) - coalesce(s.sold_qty, 0))
        else 0 end as unrealized_gain
  from public.asset_holdings ah
  left join buys b on b.asset_holding_id = ah.id
  left join sells s on s.asset_holding_id = ah.id
  left join latest l on l.asset_holding_id = ah.id
  where ah.household_id = p_household_id
    and ah.archived = false
  order by ah.created_at asc;
$$;

grant execute on function public.get_holding_positions(uuid, date) to authenticated;
