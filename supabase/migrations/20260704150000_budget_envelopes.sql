-- Stage 2 foundations: budget envelopes, transactions, and transfers.
-- Balances are derived dynamically (event-based) rather than stored.

create function public.is_household_editor(p_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
      and role in ('owner', 'editor')
  );
$$;

create table public.envelopes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create type public.budget_transaction_type as enum ('expense', 'income');

create table public.budget_transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  envelope_id uuid not null references public.envelopes (id) on delete cascade,
  type public.budget_transaction_type not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null default 'PLN',
  occurred_on date not null default current_date,
  description text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.envelope_transfers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  from_envelope_id uuid not null references public.envelopes (id) on delete cascade,
  to_envelope_id uuid not null references public.envelopes (id) on delete cascade,
  amount numeric(14, 2) not null check (amount > 0),
  occurred_on date not null default current_date,
  description text,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint envelope_transfers_distinct_envelopes check (from_envelope_id <> to_envelope_id)
);

alter table public.envelopes enable row level security;
alter table public.budget_transactions enable row level security;
alter table public.envelope_transfers enable row level security;

-- envelopes policies
create policy "Members can view household envelopes"
  on public.envelopes for select
  using (public.is_household_member(household_id));

create policy "Editors can create envelopes"
  on public.envelopes for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update envelopes"
  on public.envelopes for update
  using (public.is_household_editor(household_id));

create policy "Owners can delete envelopes"
  on public.envelopes for delete
  using (public.is_household_owner(household_id));

-- budget_transactions policies
create policy "Members can view household budget transactions"
  on public.budget_transactions for select
  using (public.is_household_member(household_id));

create policy "Editors can record budget transactions"
  on public.budget_transactions for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update budget transactions"
  on public.budget_transactions for update
  using (public.is_household_editor(household_id));

create policy "Editors can delete budget transactions"
  on public.budget_transactions for delete
  using (public.is_household_editor(household_id));

-- envelope_transfers policies
create policy "Members can view household envelope transfers"
  on public.envelope_transfers for select
  using (public.is_household_member(household_id));

create policy "Editors can record envelope transfers"
  on public.envelope_transfers for insert
  with check (public.is_household_editor(household_id) and created_by = auth.uid());

create policy "Editors can update envelope transfers"
  on public.envelope_transfers for update
  using (public.is_household_editor(household_id));

create policy "Editors can delete envelope transfers"
  on public.envelope_transfers for delete
  using (public.is_household_editor(household_id));

grant select, insert, update, delete on public.envelopes to authenticated;
grant select, insert, update, delete on public.budget_transactions to authenticated;
grant select, insert, update, delete on public.envelope_transfers to authenticated;

-- Dynamically derived envelope balances as of a given date (cumulative,
-- so surpluses/deficits naturally carry over between months). Runs with the
-- caller's own privileges, so RLS on the underlying tables still applies.
create function public.get_envelope_balances(p_household_id uuid, p_as_of date)
returns table (envelope_id uuid, balance numeric)
language sql
stable
as $$
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
  group by e.id;
$$;

grant execute on function public.get_envelope_balances(uuid, date) to authenticated;
