-- Stage 3 foundations: asset accounts and manual valuation snapshots.
-- This keeps net worth event-like: values are captured as dated snapshots,
-- and the current summary is derived from the latest valuation as of a date.

create type public.asset_account_type as enum (
  'bank',
  'investment',
  'cash',
  'real_estate',
  'vehicle',
  'precious_metals',
  'currency',
  'other_asset',
  'liability'
);

create type public.asset_liquidity_class as enum (
  'cash',
  'liquid',
  'restricted',
  'illiquid',
  'liability'
);

create table public.asset_accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  type public.asset_account_type not null,
  currency text not null default 'PLN',
  institution text,
  category text,
  owner_name text,
  liquidity public.asset_liquidity_class not null default 'liquid',
  archived boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.asset_valuations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  asset_account_id uuid not null references public.asset_accounts (id) on delete cascade,
  valued_on date not null default current_date,
  value numeric(14, 2) not null check (value >= 0),
  currency text not null default 'PLN',
  contribution_amount numeric(14, 2) not null default 0,
  note text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint asset_valuations_unique_account_date unique (asset_account_id, valued_on)
);

alter table public.asset_accounts enable row level security;
alter table public.asset_valuations enable row level security;

-- asset_accounts policies
create policy "Members can view household asset accounts"
  on public.asset_accounts for select
  using (public.is_household_member(household_id));

create policy "Editors can create asset accounts"
  on public.asset_accounts for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update asset accounts"
  on public.asset_accounts for update
  using (public.is_household_editor(household_id));

create policy "Owners can delete asset accounts"
  on public.asset_accounts for delete
  using (public.is_household_owner(household_id));

-- asset_valuations policies
create policy "Members can view household asset valuations"
  on public.asset_valuations for select
  using (public.is_household_member(household_id));

create policy "Editors can create asset valuations"
  on public.asset_valuations for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update asset valuations"
  on public.asset_valuations for update
  using (public.is_household_editor(household_id));

create policy "Editors can delete asset valuations"
  on public.asset_valuations for delete
  using (public.is_household_editor(household_id));

grant select, insert, update, delete on public.asset_accounts to authenticated;
grant select, insert, update, delete on public.asset_valuations to authenticated;

create function public.get_net_worth_summary(p_household_id uuid, p_as_of date)
returns table (
  account_id uuid,
  account_name text,
  account_type public.asset_account_type,
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
