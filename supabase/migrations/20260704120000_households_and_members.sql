-- Stage 1 foundations: households, membership roles, and RLS.

create type public.household_role as enum ('owner', 'editor', 'viewer');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.household_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;

-- Security-definer helpers so membership checks don't recurse into the RLS
-- policies of household_members itself.
create function public.is_household_member(p_household_id uuid)
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
  );
$$;

create function public.is_household_owner(p_household_id uuid)
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
      and role = 'owner'
  );
$$;

-- Automatically make the creator of a household its first owner.
create function public.handle_new_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_household_created
  after insert on public.households
  for each row execute function public.handle_new_household();

-- households policies
create policy "Members can view their household"
  on public.households for select
  using (public.is_household_member(id));

create policy "Authenticated users can create a household"
  on public.households for insert
  with check (auth.uid() = created_by);

create policy "Owners can update their household"
  on public.households for update
  using (public.is_household_owner(id));

create policy "Owners can delete their household"
  on public.households for delete
  using (public.is_household_owner(id));

-- household_members policies
create policy "Members can view membership of their household"
  on public.household_members for select
  using (public.is_household_member(household_id));

create policy "Owners can add members"
  on public.household_members for insert
  with check (public.is_household_owner(household_id));

create policy "Owners can update member roles"
  on public.household_members for update
  using (public.is_household_owner(household_id));

create policy "Owners can remove members"
  on public.household_members for delete
  using (public.is_household_owner(household_id));
