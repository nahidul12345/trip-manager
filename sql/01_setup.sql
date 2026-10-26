-- Friends Trip Manager - HTML version, Step 1-2 setup
-- Run this whole file in Supabase Dashboard > SQL Editor > New Query.
-- It creates profiles, trips, trip_members, trip_join_codes with RLS.
-- Run it once. If you run it again, it will drop and recreate these tables,
-- so only run it on a NEW project, not on a project with live data.
--
-- IMPORTANT ORDER (fixed 26 Oct 2026): tables FIRST, then the helper
-- functions that query trip_members. The old version defined the helpers
-- before the table existed, so Postgres failed with:
--   ERROR 42P01: relation "public.trip_members" does not exist
-- at the first helper function. This fixed version creates the tables
-- first, so the helpers validate cleanly.

-- ---------- drop old tables (clean start, new project only) ----------
drop table if exists public.trip_join_codes cascade;
drop table if exists public.trip_members cascade;
drop table if exists public.trips cascade;
drop table if exists public.profiles cascade;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  preferred_role text check (preferred_role in ('manager', 'member')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- trips ----------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  location text,
  start_date date,
  end_date date,
  currency text default 'BDT',
  status text default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------- trip_members (role is PER TRIP) ----------
create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('manager', 'member')),
  status text not null default 'active' check (status in ('active', 'inactive')),
  joined_at timestamptz default now(),
  unique (trip_id, user_id)
);

-- ---------- trip_join_codes ----------
create table public.trip_join_codes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- ---------- helpers (avoid RLS recursion) ----------
-- These MUST come after trip_members exists, otherwise Postgres
-- rejects them with 42P01 at creation time.
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_trip_manager(p_trip_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and role = 'manager' and status = 'active'
  );
$$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_join_codes enable row level security;

-- profiles: own row only
create policy "profiles own select" on public.profiles for select using (id = auth.uid());
create policy "profiles own insert" on public.profiles for insert with check (id = auth.uid());
create policy "profiles own update" on public.profiles for update using (id = auth.uid());

-- trips: members can read, creator can insert, managers can update
create policy "trips member select" on public.trips for select
  using (owner_id = auth.uid() or public.is_trip_member(id));
create policy "trips creator insert" on public.trips for insert with check (owner_id = auth.uid());
create policy "trips manager update" on public.trips for update
  using (public.is_trip_manager(id));

-- trip_members: members can read their trip's members, join as self, managers can update roles
create policy "members trip select" on public.trip_members for select
  using (public.is_trip_member(trip_id));
create policy "members self insert" on public.trip_members for insert
  with check (user_id = auth.uid());
create policy "members manager update" on public.trip_members for update
  using (public.is_trip_manager(trip_id));
create policy "members self update" on public.trip_members for update
  using (user_id = auth.uid());

-- join codes: managers can read/create, members cannot see codes via this table
-- (join-trip page looks up by code; that lookup needs a code-specific policy:
--  any logged-in user may read a code row only to join - in this Step 1-2
--  version we allow authenticated select on codes, but trip.html only
--  DISPLAYS the code to managers in the UI. For stricter privacy, move
--  code lookup to an Edge Function in a later step.)
create policy "codes auth select" on public.trip_join_codes for select
  using (auth.role() = 'authenticated');
create policy "codes manager insert" on public.trip_join_codes for insert
  with check (public.is_trip_manager(trip_id) or created_by = auth.uid());
create policy "codes manager update" on public.trip_join_codes for update
  using (public.is_trip_manager(trip_id));
