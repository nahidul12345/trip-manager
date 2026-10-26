-- Friends Trip Manager - HTML version, FULL tables (Step 3+)
-- Run AFTER sql/01_setup.sql, in Supabase Dashboard > SQL Editor.
-- This file does NOT drop Step 1-2 tables. Run it once on the new project.
-- Tables: contributions, expenses, expense_allocations, trip_share_links.
-- Share note: this HTML version stores the share token in plain text in
-- trip_share_links so the RPC below can look it up without an Edge Function.
-- That is simpler, but less secure than the old React app's SHA-256 hash +
-- Edge Function. Do NOT use a share token as a password, and revoke a link
-- as soon as you no longer need it. Tokens expire after 30 days by default
-- in the JS code (expires_at is set on insert).

-- ---------- contributions ----------
create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  amount bigint not null check (amount > 0),
  occurred_at date default CURRENT_DATE,
  payment_method text default 'cash' check (payment_method in ('cash','bkash','nagad','bank','other')),
  note text,
  reference text,
  status text default 'valid' check (status in ('valid','void')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now()
);

-- ---------- expenses ----------
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  category text default 'other' check (category in ('transport','food','tickets','accommodation','shopping','other')),
  amount bigint not null check (amount > 0),
  payment_source text default 'group_fund' check (payment_source in ('group_fund','personal')),
  payer_member_id uuid references public.trip_members(id) on delete set null,
  occurred_at date default CURRENT_DATE,
  description text,
  status text default 'valid' check (status in ('valid','void')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now()
);

-- ---------- expense_allocations ----------
create table if not exists public.expense_allocations (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  amount bigint not null check (amount >= 0),
  created_at timestamptz default now(),
  unique (expense_id, member_id)
);

-- ---------- trip_share_links ----------
create table if not exists public.trip_share_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  token text not null unique,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz default now()
);

-- ---------- RLS for new tables ----------
alter table public.contributions enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_allocations enable row level security;
alter table public.trip_share_links enable row level security;

drop policy if exists "contrib member select" on public.contributions;
drop policy if exists "contrib member insert" on public.contributions;
drop policy if exists "contrib manager update" on public.contributions;
create policy "contrib member select" on public.contributions for select
  using (public.is_trip_member(trip_id));
create policy "contrib member insert" on public.contributions for insert
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());
create policy "contrib manager update" on public.contributions for update
  using (public.is_trip_manager(trip_id));

drop policy if exists "expense member select" on public.expenses;
drop policy if exists "expense member insert" on public.expenses;
drop policy if exists "expense manager update" on public.expenses;
create policy "expense member select" on public.expenses for select
  using (public.is_trip_member(trip_id));
create policy "expense member insert" on public.expenses for insert
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());
create policy "expense manager update" on public.expenses for update
  using (public.is_trip_manager(trip_id));

drop policy if exists "alloc member select" on public.expense_allocations;
drop policy if exists "alloc member insert" on public.expense_allocations;
create policy "alloc member select" on public.expense_allocations for select
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));
create policy "alloc member insert" on public.expense_allocations for insert
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id)));

drop policy if exists "share manager select" on public.trip_share_links;
drop policy if exists "share manager insert" on public.trip_share_links;
drop policy if exists "share manager update" on public.trip_share_links;
create policy "share manager select" on public.trip_share_links for select
  using (public.is_trip_manager(trip_id));
create policy "share manager insert" on public.trip_share_links for insert
  with check (public.is_trip_manager(trip_id) and created_by = auth.uid());
create policy "share manager update" on public.trip_share_links for update
  using (public.is_trip_manager(trip_id));

-- ---------- Public share RPC (security definer, bypasses RLS) ----------
-- Returns trip + members + valid contributions/expenses/allocations
-- only if the token is active and not expired. No auth required to call it,
-- so anyone with the link can see the summary - that is the point of a
-- read-only share link. Revoke it to stop access.
create or replace function public.get_shared_trip(p_token text)
returns jsonb language plpgsql security definer stable as $$
declare
  v_trip_id uuid;
  result jsonb;
begin
  select trip_id into v_trip_id from public.trip_share_links
  where token = p_token and revoked_at is null
    and (expires_at is null or expires_at > now());
  if v_trip_id is null then
    return jsonb_build_object('error', 'invalid_or_expired');
  end if;

  select jsonb_build_object(
    'trip', (select row_to_json(t) from (select id, name, location, start_date, end_date, currency, status from public.trips where id = v_trip_id) t),
    'members', (select coalesce(jsonb_agg(row_to_json(m)), '[]'::jsonb) from (select tm.id, tm.user_id, tm.role, p.email from public.trip_members tm left join public.profiles p on p.id = tm.user_id where tm.trip_id = v_trip_id and tm.status = 'active') m),
    'contributions', (select coalesce(jsonb_agg(row_to_json(c)), '[]'::jsonb) from (select id, member_id, amount, occurred_at, payment_method, note from public.contributions where trip_id = v_trip_id and status = 'valid') c),
    'expenses', (select coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb) from (select id, title, category, amount, payment_source, payer_member_id, occurred_at from public.expenses where trip_id = v_trip_id and status = 'valid') e),
    'allocations', (select coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb) from (select ea.expense_id, ea.member_id, ea.amount from public.expense_allocations ea join public.expenses e on e.id = ea.expense_id where e.trip_id = v_trip_id) a)
  ) into result;
  return result;
end;
$$;
