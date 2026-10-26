-- ============================================================
-- Migration: 003_manager_member_roles.sql
-- Friends Trip Expense Manager — Manager / Group Member roles + join codes
-- ADDITIVE ONLY. Run this in the project's Supabase SQL Editor,
-- AFTER 001_initial_schema.sql and 002_allow_delete_trip.sql.
-- ORDER NOTE (fixed): the trip_members user_id/role columns are added
-- BEFORE the is_trip_member/is_trip_manager helpers below, because those
-- helpers reference user_id and Postgres validates SQL functions at
-- creation time (otherwise 42703: column "user_id" does not exist).
-- It does NOT drop or recreate any table and does NOT rewrite 001/002.
-- Existing trips keep working: every trip owner is linked as its Manager.
-- ============================================================

-- ─── trip_members: link rows to accounts + role ──────────────────────────
-- (must come BEFORE the helpers: they reference trip_members.user_id)

ALTER TABLE trip_members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('manager', 'member'));

CREATE INDEX IF NOT EXISTS idx_trip_members_user_id ON trip_members(user_id);

-- One active linked row per user per trip (leaving sets status inactive,
-- so a user who leaves and rejoins later gets a fresh row).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_members_trip_user_active
  ON trip_members(trip_id, user_id)
  WHERE user_id IS NOT NULL AND status = 'active';

-- ─── Helpers (SECURITY DEFINER so policies can call them without
--     recursing into the same table's RLS) ────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_trip_member(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM trips WHERE id = p_trip_id AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM trip_members
                 WHERE trip_id = p_trip_id AND user_id = auth.uid() AND status = 'active');
$$;

CREATE OR REPLACE FUNCTION public.is_trip_manager(p_trip_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM trips WHERE id = p_trip_id AND owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM trip_members
                 WHERE trip_id = p_trip_id AND user_id = auth.uid()
                   AND status = 'active' AND role = 'manager');
$$;

-- Backfill: if a name-only row already matches the owner's profile name,
-- link it instead of creating a duplicate row.
UPDATE trip_members m
SET user_id = t.owner_id, role = 'manager'
FROM trips t
JOIN profiles p ON p.id = t.owner_id
WHERE m.trip_id = t.id AND m.user_id IS NULL AND m.name = p.display_name;

-- Every remaining trip owner gets a linked Manager row.
INSERT INTO trip_members (trip_id, name, user_id, role, status)
SELECT t.id, COALESCE(NULLIF(p.display_name, ''), 'Trip Manager'),
       t.owner_id, 'manager', 'active'
FROM trips t
LEFT JOIN profiles p ON p.id = t.owner_id
WHERE NOT EXISTS (
  SELECT 1 FROM trip_members m
  WHERE m.trip_id = t.id AND m.user_id = t.owner_id
);

-- ─── trip_join_codes ─────────────────────────────────────────────────────
-- The code is created lazily on the trip page for the Manager only
-- (see getOrCreateJoinCode in src/lib/api.ts) — never at trip creation.

CREATE TABLE IF NOT EXISTS trip_join_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id uuid NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (length(code) BETWEEN 4 AND 32),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trip_join_codes_trip_id ON trip_join_codes(trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_join_codes_active_per_trip
  ON trip_join_codes(trip_id) WHERE is_active;

ALTER TABLE trip_join_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Managers can view join codes" ON trip_join_codes;
CREATE POLICY "Managers can view join codes"
  ON trip_join_codes FOR SELECT USING (public.is_trip_manager(trip_id));
DROP POLICY IF EXISTS "Managers can create join codes" ON trip_join_codes;
CREATE POLICY "Managers can create join codes"
  ON trip_join_codes FOR INSERT
  WITH CHECK (public.is_trip_manager(trip_id) AND auth.uid() = created_by);
DROP POLICY IF EXISTS "Managers can update join codes" ON trip_join_codes;
CREATE POLICY "Managers can update join codes"
  ON trip_join_codes FOR UPDATE USING (public.is_trip_manager(trip_id));
DROP POLICY IF EXISTS "Managers can delete join codes" ON trip_join_codes;
CREATE POLICY "Managers can delete join codes"
  ON trip_join_codes FOR DELETE USING (public.is_trip_manager(trip_id));

-- ─── Join / promote / leave (server-side rules, atomic) ─────────────────

-- Join as a Group Member. SECURITY DEFINER so a not-yet-member can
-- validate a code without being able to read the codes table.
CREATE OR REPLACE FUNCTION public.join_trip_by_code(p_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_trip_id uuid;
  v_name text;
BEGIN
  SELECT trip_id INTO v_trip_id
  FROM trip_join_codes
  WHERE upper(code) = upper(p_code) AND is_active = true;

  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or inactive join code';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM trips WHERE id = v_trip_id AND status = 'active') THEN
    RAISE EXCEPTION 'This trip is not active';
  END IF;
  -- Already a member: idempotent, just return the trip.
  IF EXISTS (SELECT 1 FROM trip_members
             WHERE trip_id = v_trip_id AND user_id = auth.uid() AND status = 'active') THEN
    RETURN v_trip_id;
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), 'Member') INTO v_name
  FROM profiles WHERE id = auth.uid();

  INSERT INTO trip_members (trip_id, name, user_id, role, status)
  VALUES (v_trip_id, COALESCE(v_name, 'Member'), auth.uid(), 'member', 'active');
  RETURN v_trip_id;
END;
$$;

-- Promote a linked Member to Manager. The previous Manager becomes only
-- a Group Member; if they were the trip owner, ownership moves with the role.
CREATE OR REPLACE FUNCTION public.promote_member_to_manager(p_trip_id uuid, p_member_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_user uuid;
  v_old_owner uuid;
BEGIN
  IF NOT public.is_trip_manager(p_trip_id) THEN
    RAISE EXCEPTION 'Only the Manager can promote a member';
  END IF;
  SELECT user_id INTO v_target_user
  FROM trip_members
  WHERE id = p_member_id AND trip_id = p_trip_id AND status = 'active';
  IF v_target_user IS NULL THEN
    RAISE EXCEPTION 'Only a signed-in (linked) member can become Manager';
  END IF;
  IF v_target_user = auth.uid() THEN
    RAISE EXCEPTION 'You are already a Manager of this trip';
  END IF;

  -- Demote every other linked Manager to Member.
  UPDATE trip_members SET role = 'member', updated_at = now()
  WHERE trip_id = p_trip_id AND role = 'manager' AND id <> p_member_id;

  UPDATE trip_members SET role = 'manager', updated_at = now()
  WHERE id = p_member_id;

  -- Single-Manager invariant: the previous owner always becomes only a
  -- Member (with a linked row, so they stay visible as a member), and
  -- ownership moves to the promoted member — whoever called promote.
  SELECT owner_id INTO v_old_owner FROM trips WHERE id = p_trip_id;
  IF v_old_owner IS DISTINCT FROM v_target_user THEN
    IF NOT EXISTS (SELECT 1 FROM trip_members
                   WHERE trip_id = p_trip_id AND user_id = v_old_owner) THEN
      INSERT INTO trip_members (trip_id, name, user_id, role, status)
      SELECT p_trip_id, COALESCE(NULLIF(display_name, ''), 'Member'),
             t.owner_id, 'member', 'active'
      FROM trips t LEFT JOIN profiles p ON p.id = t.owner_id
      WHERE t.id = p_trip_id;
    ELSE
      UPDATE trip_members SET role = 'member', status = 'active', updated_at = now()
      WHERE trip_id = p_trip_id
        AND user_id = v_old_owner
        AND id <> p_member_id;
    END IF;
    UPDATE trips SET owner_id = v_target_user, updated_at = now()
    WHERE id = p_trip_id;
  END IF;
END;
$$;

-- Leave voluntarily. The only Manager cannot leave until someone else
-- has been promoted first (promote_member_to_manager above).
CREATE OR REPLACE FUNCTION public.leave_trip(p_trip_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_manager_count int;
  v_other_manager uuid;
  v_is_owner boolean;
BEGIN
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'You are not a member of this trip';
  END IF;

  SELECT COUNT(DISTINCT manager_user) INTO v_manager_count FROM (
    SELECT owner_id AS manager_user FROM trips WHERE id = p_trip_id
    UNION
    SELECT user_id FROM trip_members
    WHERE trip_id = p_trip_id AND status = 'active' AND role = 'manager' AND user_id IS NOT NULL
  ) managers;

  IF public.is_trip_manager(p_trip_id) AND v_manager_count <= 1 THEN
    RAISE EXCEPTION 'You are the only Manager. Promote someone to Manager first, then you can leave.';
  END IF;

  v_is_owner := EXISTS (SELECT 1 FROM trips WHERE id = p_trip_id AND owner_id = auth.uid());

  -- If the leaving owner is not the sole Manager, hand ownership to another Manager.
  IF v_is_owner THEN
    SELECT user_id INTO v_other_manager FROM trip_members
    WHERE trip_id = p_trip_id AND status = 'active' AND role = 'manager'
      AND user_id IS NOT NULL AND user_id <> auth.uid()
    LIMIT 1;
    IF v_other_manager IS NOT NULL THEN
      UPDATE trips SET owner_id = v_other_manager, updated_at = now() WHERE id = p_trip_id;
    END IF;
  END IF;

  UPDATE trip_members SET status = 'inactive', updated_at = now()
  WHERE trip_id = p_trip_id AND user_id = auth.uid() AND status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_trip_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_member_to_manager(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_trip(uuid) TO authenticated;

-- ─── RLS: members can now read their own trips; only Managers manage ────
-- Old policies were owner-only. Dropping + recreating by name keeps this
-- migration re-runnable (DROP IF EXISTS) even though 002 re-created some
-- DELETE policy names that already existed in 001.

-- Trips
DROP POLICY IF EXISTS "Owners can view their trips" ON trips;
DROP POLICY IF EXISTS "Owners can create trips" ON trips;
DROP POLICY IF EXISTS "Owners can update their trips" ON trips;
DROP POLICY IF EXISTS "Owners can delete their trips" ON trips;
CREATE POLICY "Members can view their trips"
  ON trips FOR SELECT USING (public.is_trip_member(id));
CREATE POLICY "Owners can create trips"
  ON trips FOR INSERT WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Managers can update trips"
  ON trips FOR UPDATE USING (public.is_trip_manager(id));
CREATE POLICY "Managers can delete trips"
  ON trips FOR DELETE USING (public.is_trip_manager(id));

-- Trip members
DROP POLICY IF EXISTS "Trip owners can view members" ON trip_members;
DROP POLICY IF EXISTS "Trip owners can insert members" ON trip_members;
DROP POLICY IF EXISTS "Trip owners can update members" ON trip_members;
DROP POLICY IF EXISTS "Trip owners can delete members" ON trip_members;
CREATE POLICY "Members can view members"
  ON trip_members FOR SELECT USING (public.is_trip_member(trip_id));
CREATE POLICY "Managers can insert members"
  ON trip_members FOR INSERT WITH CHECK (public.is_trip_manager(trip_id));
CREATE POLICY "Managers can update members"
  ON trip_members FOR UPDATE USING (public.is_trip_manager(trip_id));
CREATE POLICY "Managers can delete members"
  ON trip_members FOR DELETE USING (public.is_trip_manager(trip_id));

-- Contributions: Managers any member; Members only their own row.
DROP POLICY IF EXISTS "Trip owners can view contributions" ON contributions;
DROP POLICY IF EXISTS "Trip owners can insert contributions" ON contributions;
DROP POLICY IF EXISTS "Trip owners can update contributions (void only)" ON contributions;
DROP POLICY IF EXISTS "Trip owners can delete contributions" ON contributions;
CREATE POLICY "Members can view contributions"
  ON contributions FOR SELECT USING (public.is_trip_member(trip_id));
CREATE POLICY "Members can insert own contributions"
  ON contributions FOR INSERT WITH CHECK (
    public.is_trip_member(trip_id)
    AND auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND status = 'active')
    AND (
      public.is_trip_manager(trip_id)
      OR member_id IN (SELECT id FROM trip_members
                       WHERE trip_id = contributions.trip_id
                         AND user_id = auth.uid() AND status = 'active')
    )
  );
CREATE POLICY "Managers can update contributions"
  ON contributions FOR UPDATE USING (public.is_trip_manager(trip_id));
CREATE POLICY "Managers can delete contributions"
  ON contributions FOR DELETE USING (public.is_trip_manager(trip_id));

-- Expenses: Managers any; Members group-fund or personally paid by themselves.
DROP POLICY IF EXISTS "Trip owners can view expenses" ON expenses;
DROP POLICY IF EXISTS "Trip owners can insert expenses" ON expenses;
DROP POLICY IF EXISTS "Trip owners can update expenses" ON expenses;
DROP POLICY IF EXISTS "Trip owners can delete expenses" ON expenses;
CREATE POLICY "Members can view expenses"
  ON expenses FOR SELECT USING (public.is_trip_member(trip_id));
CREATE POLICY "Members can insert own expenses"
  ON expenses FOR INSERT WITH CHECK (
    public.is_trip_member(trip_id)
    AND auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND status = 'active')
    AND (
      public.is_trip_manager(trip_id)
      OR payment_source = 'group_fund'
      OR payer_member_id IN (SELECT id FROM trip_members
                             WHERE trip_id = expenses.trip_id
                               AND user_id = auth.uid() AND status = 'active')
    )
  );
CREATE POLICY "Managers can update expenses"
  ON expenses FOR UPDATE USING (public.is_trip_manager(trip_id));
CREATE POLICY "Managers can delete expenses"
  ON expenses FOR DELETE USING (public.is_trip_manager(trip_id));

-- Expense allocations
DROP POLICY IF EXISTS "Trip owners can view allocations" ON expense_allocations;
DROP POLICY IF EXISTS "Trip owners can insert allocations" ON expense_allocations;
DROP POLICY IF EXISTS "Trip owners can delete allocations" ON expense_allocations;
CREATE POLICY "Members can view allocations"
  ON expense_allocations FOR SELECT USING (
    EXISTS (SELECT 1 FROM expenses e WHERE e.id = expense_id
            AND public.is_trip_member(e.trip_id))
  );
CREATE POLICY "Members can insert allocations"
  ON expense_allocations FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM expenses e WHERE e.id = expense_id
            AND public.is_trip_member(e.trip_id))
  );
CREATE POLICY "Managers can delete allocations"
  ON expense_allocations FOR DELETE USING (
    EXISTS (SELECT 1 FROM expenses e WHERE e.id = expense_id
            AND public.is_trip_manager(e.trip_id))
  );

-- Fund transactions: Manager only (unchanged in spirit, owner -> manager).
DROP POLICY IF EXISTS "Trip owners can view fund transactions" ON fund_transactions;
DROP POLICY IF EXISTS "Trip owners can insert fund transactions" ON fund_transactions;
DROP POLICY IF EXISTS "Trip owners can update fund transactions" ON fund_transactions;
DROP POLICY IF EXISTS "Trip owners can delete fund transactions" ON fund_transactions;
CREATE POLICY "Members can view fund transactions"
  ON fund_transactions FOR SELECT USING (public.is_trip_member(trip_id));
CREATE POLICY "Managers can insert fund transactions"
  ON fund_transactions FOR INSERT WITH CHECK (
    public.is_trip_manager(trip_id)
    AND EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND status = 'active')
    AND auth.uid() = created_by
  );
CREATE POLICY "Managers can update fund transactions"
  ON fund_transactions FOR UPDATE USING (public.is_trip_manager(trip_id));
CREATE POLICY "Managers can delete fund transactions"
  ON fund_transactions FOR DELETE USING (public.is_trip_manager(trip_id));

-- Share links: Manager only (unchanged in spirit, owner -> manager).
DROP POLICY IF EXISTS "Trip owners can view their share links" ON trip_share_links;
DROP POLICY IF EXISTS "Trip owners can create share links" ON trip_share_links;
DROP POLICY IF EXISTS "Trip owners can update (revoke) share links" ON trip_share_links;
DROP POLICY IF EXISTS "Trip owners can delete share links" ON trip_share_links;
CREATE POLICY "Managers can view share links"
  ON trip_share_links FOR SELECT USING (public.is_trip_manager(trip_id));
CREATE POLICY "Managers can create share links"
  ON trip_share_links FOR INSERT WITH CHECK (
    public.is_trip_manager(trip_id) AND auth.uid() = created_by
  );
CREATE POLICY "Managers can update share links"
  ON trip_share_links FOR UPDATE USING (public.is_trip_manager(trip_id));
CREATE POLICY "Managers can delete share links"
  ON trip_share_links FOR DELETE USING (public.is_trip_manager(trip_id));
