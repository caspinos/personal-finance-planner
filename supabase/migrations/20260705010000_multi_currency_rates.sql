-- Stage 3/4: multi-currency support. Household-scoped exchange rates and
-- commodity price reference data, plus a configurable household base
-- currency. Rates are always stored relative to PLN as a fixed pivot
-- (PLN is the app-wide implicit default everywhere else), so converting
-- between any two currencies hops through PLN:
--   amount_in_target = amount_in_source * rate_to_pln(source) / rate_to_pln(target)
-- rate_to_pln('PLN') is always 1 and is never stored as a row.

-- 1. Household base currency -------------------------------------------------

alter table public.households
  add column base_currency text not null default 'PLN';

-- No new RLS policy needed: "Owners can update their household" already
-- covers arbitrary column updates via UPDATE ... using (is_household_owner(id)).

-- 2. exchange_rates -----------------------------------------------------------

create table public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  currency text not null,
  rate_to_pln numeric(18, 6) not null check (rate_to_pln > 0),
  rate_date date not null default current_date,
  source text,
  note text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint exchange_rates_unique_currency_date unique (household_id, currency, rate_date),
  constraint exchange_rates_currency_not_pln check (currency <> 'PLN')
);

alter table public.exchange_rates enable row level security;

create policy "Members can view household exchange rates"
  on public.exchange_rates for select
  using (public.is_household_member(household_id));

create policy "Editors can create exchange rates"
  on public.exchange_rates for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update exchange rates"
  on public.exchange_rates for update
  using (public.is_household_editor(household_id));

create policy "Editors can delete exchange rates"
  on public.exchange_rates for delete
  using (public.is_household_editor(household_id));

grant select, insert, update, delete on public.exchange_rates to authenticated;

-- 3. commodity_prices -----------------------------------------------------

create table public.commodity_prices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  commodity text not null,
  price numeric(14, 4) not null check (price >= 0),
  currency text not null default 'PLN',
  price_date date not null default current_date,
  source text,
  note text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.commodity_prices enable row level security;

create policy "Members can view household commodity prices"
  on public.commodity_prices for select
  using (public.is_household_member(household_id));

create policy "Editors can create commodity prices"
  on public.commodity_prices for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update commodity prices"
  on public.commodity_prices for update
  using (public.is_household_editor(household_id));

create policy "Editors can delete commodity prices"
  on public.commodity_prices for delete
  using (public.is_household_editor(household_id));

grant select, insert, update, delete on public.commodity_prices to authenticated;

-- 4. get_exchange_rate helper -------------------------------------------------
-- Returns the amount of PLN that 1 unit of p_currency is worth, as of the
-- latest rate on or before p_as_of. Returns 1 for PLN with no lookup. Returns
-- null if no household-scoped rate exists at/before that date -- callers must
-- treat null as "cannot convert" and not silently coerce to 0/1.

create function public.get_exchange_rate(p_household_id uuid, p_currency text, p_as_of date)
returns numeric
language sql
stable
as $$
  select
    case
      when p_currency = 'PLN' then 1::numeric
      else (
        select er.rate_to_pln
        from public.exchange_rates er
        where er.household_id = p_household_id
          and er.currency = p_currency
          and er.rate_date <= p_as_of
        order by er.rate_date desc, er.created_at desc
        limit 1
      )
    end;
$$;

grant execute on function public.get_exchange_rate(uuid, text, date) to authenticated;

-- 5. get_net_worth_summary: add base-currency conversion ----------------------
-- value_in_base / signed_value_in_base are null when no rate is available for
-- that account's currency (or the household's base currency, if it isn't PLN)
-- as of p_as_of -- the UI must handle null explicitly rather than treating it
-- as zero, so a missing rate doesn't silently understate net worth.

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
    and aa.archived = false
  order by aa.created_at asc;
$$;

grant execute on function public.get_net_worth_summary(uuid, date) to authenticated;

-- 6. get_holding_positions: add base-currency conversion ----------------------

drop function if exists public.get_holding_positions(uuid, date);

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
  unrealized_gain numeric,
  market_value_in_base numeric,
  unrealized_gain_in_base numeric
)
language sql
stable
as $$
  with base as (
    select coalesce(h.base_currency, 'PLN') as base_currency
    from public.households h
    where h.id = p_household_id
  ),
  buys as (
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
  ),
  positions as (
    select
      ah.id as holding_id,
      ah.name as holding_name,
      ah.ticker,
      ah.asset_account_id,
      ah.currency,
      ah.created_at,
      base.base_currency,
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
    cross join base
    left join buys b on b.asset_holding_id = ah.id
    left join sells s on s.asset_holding_id = ah.id
    left join latest l on l.asset_holding_id = ah.id
    where ah.household_id = p_household_id
      and ah.archived = false
  )
  select
    p.holding_id,
    p.holding_name,
    p.ticker,
    p.asset_account_id,
    p.currency,
    p.quantity,
    p.average_cost,
    p.invested_amount,
    p.latest_price,
    p.market_value,
    p.unrealized_gain,
    case
      when p.currency = p.base_currency then p.market_value
      else
        p.market_value
          * public.get_exchange_rate(p_household_id, p.currency, p_as_of)
          / public.get_exchange_rate(p_household_id, p.base_currency, p_as_of)
    end as market_value_in_base,
    case
      when p.currency = p.base_currency then p.unrealized_gain
      else
        p.unrealized_gain
          * public.get_exchange_rate(p_household_id, p.currency, p_as_of)
          / public.get_exchange_rate(p_household_id, p.base_currency, p_as_of)
    end as unrealized_gain_in_base
  from positions p
  order by p.created_at asc;
$$;

grant execute on function public.get_holding_positions(uuid, date) to authenticated;

-- 7. get_envelope_balances: add base-currency conversion -----------------------
-- Per the product decision, budget transactions are implicitly PLN-only, so
-- this converts the single aggregate PLN balance to base currency (not a
-- per-transaction historical conversion). balance_in_base is null only if the
-- household's base currency itself has no PLN rate as of p_as_of.

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
  balances as (
    select
      e.id as envelope_id,
      coalesce(sum(
        case
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
        ), 0) as balance
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
