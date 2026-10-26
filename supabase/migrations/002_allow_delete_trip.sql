-- ============================================================
-- Migration: 002_allow_delete_trip.sql
-- Enables permanent trip deletion with cascade and RLS policies
-- IDEMPOTENT: the policies below are dropped (IF EXISTS) before being
-- recreated, because 001 already creates the trips DELETE policy.
-- Run in order: 001 -> 002 -> 003.
-- ============================================================

-- Drop first: 001 already created "Owners can delete their trips".
DROP POLICY IF EXISTS "Owners can delete their trips" ON trips;
DROP POLICY IF EXISTS "Trip owners can delete members" ON trip_members;
DROP POLICY IF EXISTS "Trip owners can delete contributions" ON contributions;
DROP POLICY IF EXISTS "Trip owners can delete expenses" ON expenses;
DROP POLICY IF EXISTS "Trip owners can delete allocations" ON expense_allocations;
DROP POLICY IF EXISTS "Trip owners can delete fund transactions" ON fund_transactions;
DROP POLICY IF EXISTS "Trip owners can delete share links" ON trip_share_links;

-- RLS Policies for DELETE
CREATE POLICY "Owners can delete their trips"
  ON trips FOR DELETE
  USING (auth.uid() = owner_id);

CREATE POLICY "Trip owners can delete members"
  ON trip_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete contributions"
  ON contributions FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete expenses"
  ON expenses FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete allocations"
  ON expense_allocations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN trips t ON t.id = e.trip_id
      WHERE e.id = expense_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Trip owners can delete fund transactions"
  ON fund_transactions FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete share links"
  ON trip_share_links FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));
