-- Household invites: an owner generates a token-based invite for an email +
-- role. The invitee redeems the token once authenticated with that email,
-- which adds them as a member. This avoids depending on custom transactional
-- email delivery (not configured for production yet) -- the owner shares the
-- generated link through whatever channel they like.

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null,
  role public.household_role not null default 'viewer',
  token uuid not null default gen_random_uuid(),
  invited_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  unique (token)
);

alter table public.household_invites enable row level security;

grant select, insert, update on public.household_invites to authenticated;

-- household_invites policies
create policy "Owners can view invites for their household"
  on public.household_invites for select
  using (public.is_household_owner(household_id));

create policy "Owners can create invites"
  on public.household_invites for insert
  with check (public.is_household_owner(household_id) and invited_by = auth.uid());

create policy "Owners can revoke invites"
  on public.household_invites for update
  using (public.is_household_owner(household_id));

-- The invitee isn't a member yet, so they can't rely on is_household_owner;
-- let them see their own pending invite once they're authenticated with the
-- invited email, so the accept page can show what they're joining.
create policy "Invitees can view their own pending invite"
  on public.household_invites for select
  using (
    accepted_at is null
    and revoked_at is null
    and lower(email) = lower(auth.email())
  );

-- Look up member emails for a household. household_members only stores
-- user_id; auth.users isn't directly queryable by authenticated, so this
-- runs as security definer and re-checks membership itself.
create function public.get_household_members(p_household_id uuid)
returns table (
  household_id uuid,
  user_id uuid,
  role public.household_role,
  email text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select hm.household_id, hm.user_id, hm.role, u.email, hm.created_at
  from public.household_members hm
  join auth.users u on u.id = hm.user_id
  where hm.household_id = p_household_id
    and public.is_household_member(p_household_id)
  order by hm.created_at asc;
$$;

grant execute on function public.get_household_members(uuid) to authenticated;

-- Redeem an invite token: adds the caller as a household member with the
-- invited role. household_members INSERT is normally owner-only via RLS, so
-- this runs as security definer -- it re-validates the token, expiry, and
-- that the invite's email matches the caller's authenticated email.
-- Note: the OUT columns are prefixed (out_*) because RETURNS TABLE(...)
-- creates implicit PL/pgSQL variables from its column names, which would
-- otherwise shadow public.household_members.household_id and make the
-- ON CONFLICT target below ambiguous.
create function public.accept_household_invite(p_token uuid)
returns table (
  out_household_id uuid,
  out_user_id uuid,
  out_role public.household_role,
  out_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.household_invites;
begin
  select * into v_invite
  from public.household_invites
  where token = p_token
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This invite is invalid, already used, or has expired.';
  end if;

  if auth.email() is null or lower(auth.email()) <> lower(v_invite.email) then
    raise exception 'This invite was issued to a different email address.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, auth.uid(), v_invite.role)
  on conflict (household_id, user_id) do update set role = excluded.role;

  update public.household_invites
  set accepted_at = now()
  where id = v_invite.id;

  return query
    select hm.household_id, hm.user_id, hm.role, hm.created_at
    from public.household_members hm
    where hm.household_id = v_invite.household_id
      and hm.user_id = auth.uid();
end;
$$;

grant execute on function public.accept_household_invite(uuid) to authenticated;
