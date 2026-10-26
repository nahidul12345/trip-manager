-- ============================================================
-- Migration: 001_initial_schema.sql
-- Friends Trip Expense Manager
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Profiles ─────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Trips ────────────────────────────────────────────────────────────────────

CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 200),
  description TEXT CHECK (length(description) <= 1000),
  location TEXT CHECK (length(location) <= 300),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL CHECK (end_date >= start_date),
  currency TEXT NOT NULL DEFAULT 'BDT' CHECK (length(currency) <= 10),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trips_owner_id ON trips(owner_id);
CREATE INDEX idx_trips_status ON trips(status);

ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their trips"
  ON trips FOR SELECT USING (auth.uid() = owner_id);

CREATE POLICY "Owners can create trips"
  ON trips FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their trips"
  ON trips FOR UPDATE USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their trips"
  ON trips FOR DELETE USING (auth.uid() = owner_id);

-- ─── Trip Members ─────────────────────────────────────────────────────────────

CREATE TABLE trip_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  notes TEXT CHECK (length(notes) <= 500),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trip_members_trip_id ON trip_members(trip_id);

ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;

-- Only trip owners can view/manage members
CREATE POLICY "Trip owners can view members"
  ON trip_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can insert members"
  ON trip_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can update members"
  ON trip_members FOR UPDATE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete members"
  ON trip_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

-- ─── Contributions ────────────────────────────────────────────────────────────

CREATE TABLE contributions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES trip_members(id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  occurred_at TIMESTAMPTZ NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'bkash', 'nagad', 'bank', 'other')),
  note TEXT CHECK (length(note) <= 500),
  reference TEXT CHECK (length(reference) <= 200),
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'void')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contributions_trip_id ON contributions(trip_id);
CREATE INDEX idx_contributions_member_id ON contributions(member_id);
CREATE INDEX idx_contributions_status ON contributions(status);

ALTER TABLE contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip owners can view contributions"
  ON contributions FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can insert contributions"
  ON contributions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid() AND status = 'active')
    AND auth.uid() = created_by
  );

CREATE POLICY "Trip owners can update contributions (void only)"
  ON contributions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete contributions"
  ON contributions FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

-- ─── Expenses ─────────────────────────────────────────────────────────────────

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 2 AND 300),
  category TEXT NOT NULL CHECK (category IN ('transport', 'food', 'tickets', 'accommodation', 'shopping', 'other')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  payment_source TEXT NOT NULL CHECK (payment_source IN ('group_fund', 'personal')),
  payer_member_id UUID REFERENCES trip_members(id),
  occurred_at TIMESTAMPTZ NOT NULL,
  description TEXT CHECK (length(description) <= 1000),
  receipt_path TEXT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'void')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- If personal, payer must be specified
  CONSTRAINT personal_expense_requires_payer CHECK (
    payment_source = 'group_fund' OR payer_member_id IS NOT NULL
  )
);

CREATE INDEX idx_expenses_trip_id ON expenses(trip_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_category ON expenses(category);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip owners can view expenses"
  ON expenses FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can insert expenses"
  ON expenses FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid() AND status = 'active')
    AND auth.uid() = created_by
  );

CREATE POLICY "Trip owners can update expenses"
  ON expenses FOR UPDATE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete expenses"
  ON expenses FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

-- ─── Expense Allocations ──────────────────────────────────────────────────────

CREATE TABLE expense_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES trip_members(id),
  amount BIGINT NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(expense_id, member_id)
);

CREATE INDEX idx_expense_allocations_expense_id ON expense_allocations(expense_id);
CREATE INDEX idx_expense_allocations_member_id ON expense_allocations(member_id);

ALTER TABLE expense_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip owners can view allocations"
  ON expense_allocations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN trips t ON t.id = e.trip_id
      WHERE e.id = expense_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Trip owners can insert allocations"
  ON expense_allocations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN trips t ON t.id = e.trip_id
      WHERE e.id = expense_id AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Trip owners can delete allocations"
  ON expense_allocations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM expenses e
      JOIN trips t ON t.id = e.trip_id
      WHERE e.id = expense_id AND t.owner_id = auth.uid()
    )
  );

-- ─── Fund Transactions ────────────────────────────────────────────────────────

CREATE TABLE fund_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID REFERENCES trip_members(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('refund', 'withdrawal', 'adjustment', 'deposit')),
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount BIGINT NOT NULL CHECK (amount > 0),
  related_expense_id UUID REFERENCES expenses(id),
  occurred_at TIMESTAMPTZ NOT NULL,
  note TEXT CHECK (length(note) <= 500),
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'void')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_fund_transactions_trip_id ON fund_transactions(trip_id);
CREATE INDEX idx_fund_transactions_member_id ON fund_transactions(member_id);

ALTER TABLE fund_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip owners can view fund transactions"
  ON fund_transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can insert fund transactions"
  ON fund_transactions FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid() AND status = 'active')
    AND auth.uid() = created_by
  );

CREATE POLICY "Trip owners can update fund transactions"
  ON fund_transactions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete fund transactions"
  ON fund_transactions FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

-- ─── Trip Share Links ─────────────────────────────────────────────────────────

CREATE TABLE trip_share_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,  -- SHA-256 hash of the raw token
  revoked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trip_share_links_trip_id ON trip_share_links(trip_id);
CREATE INDEX idx_trip_share_links_token_hash ON trip_share_links(token_hash);

ALTER TABLE trip_share_links ENABLE ROW LEVEL SECURITY;

-- Only trip owners can manage share links
CREATE POLICY "Trip owners can view their share links"
  ON trip_share_links FOR SELECT
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can create share links"
  ON trip_share_links FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid())
    AND auth.uid() = created_by
  );

CREATE POLICY "Trip owners can update (revoke) share links"
  ON trip_share_links FOR UPDATE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

CREATE POLICY "Trip owners can delete share links"
  ON trip_share_links FOR DELETE
  USING (EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND owner_id = auth.uid()));

-- CRITICAL: No public SELECT policy on trip_share_links.
-- The Edge Function uses the service role key to validate tokens server-side.
-- Anonymous clients cannot query this table directly.

-- ─── Storage Bucket for Receipts ─────────────────────────────────────────────
-- Run this separately in the Supabase dashboard or via CLI:
-- insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);
-- And create appropriate storage policies for authenticated users.

-- ─── Updated_at triggers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_trips_updated_at BEFORE UPDATE ON trips
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_trip_members_updated_at BEFORE UPDATE ON trip_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_contributions_updated_at BEFORE UPDATE ON contributions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
