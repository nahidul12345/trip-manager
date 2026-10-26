/**
 * Supabase data access layer for trips, members, contributions, expenses, etc.
 * All operations are scoped to the authenticated user via RLS.
 */

import { supabase } from './supabase';
import type {
  Trip,
  TripMember,
  Contribution,
  Expense,
  ExpenseAllocation,
  FundTransaction,
  TripShareLink,
  CreateTripForm,
  AddContributionForm,
  AddExpenseForm,
  TripStatus,
  MemberStatus,
  SplitMethod,
  UUID,
} from '../types';
import { equalSplit, percentageSplit } from './financial-calculations';

// ─── Trips ───────────────────────────────────────────────────────────────────

export async function fetchTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Trip[];
}

export async function fetchTrip(tripId: UUID): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function createTrip(form: CreateTripForm): Promise<Trip> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Deliberately no join code is created here. A code is created lazily on
  // the trip page for the Manager only (see getOrCreateJoinCode).

  // Create trip
  const { data: trip, error: tripError } = await supabase
    .from('trips')
    .insert({
      owner_id: user.id,
      name: form.name,
      description: form.description || null,
      location: form.location || null,
      start_date: form.start_date,
      end_date: form.end_date,
      currency: form.currency || 'BDT',
      status: 'active',
    })
    .select()
    .single();

  if (tripError) throw tripError;

  // Link the creator as this trip's Manager row (migration 003 model).
  // Previously new trips had NO linked row for the creator, so the
  // Manager could not pick themselves in contribution/expense dropdowns
  // and did not appear in the Members tab. Pre-003 databases have no
  // user_id/role columns, so that insert is best-effort and ignored there
  // (owner_id still makes the creator a Manager via RLS/helpers).
  try {
    const displayName =
      (user.user_metadata as { display_name?: string } | null)?.display_name ||
      user.email?.split('@')[0] ||
      'Trip Manager';
    const { error: managerRowError } = await supabase
      .from('trip_members')
      .insert({
        trip_id: trip.id,
        name: displayName,
        notes: null,
        user_id: user.id,
        role: 'manager',
        status: 'active',
      });
    if (managerRowError) throw managerRowError;
  } catch (err) {
    // Pre-003 schema (no user_id/role columns) or a duplicate linked row:
    // the trip itself was created successfully, so do not fail creation.
    console.warn('Creator Manager row not created (pre-003 database?):', err);
  }

  // Create members
  if (form.members && form.members.length > 0) {
    const membersToInsert = form.members
      .filter(m => m.name.trim())
      .map(m => ({
        trip_id: trip.id,
        name: m.name.trim(),
        notes: m.notes || null,
        status: 'active',
      }));

    if (membersToInsert.length > 0) {
      const { error: membersError } = await supabase
        .from('trip_members')
        .insert(membersToInsert);
      if (membersError) throw membersError;
    }
  }

  return trip as Trip;
}

export async function updateTrip(tripId: UUID, updates: Partial<Trip>): Promise<Trip> {
  const { data, error } = await supabase
    .from('trips')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .select()
    .single();
  if (error) throw error;
  return data as Trip;
}

export async function archiveTrip(tripId: UUID): Promise<void> {
  const { error } = await supabase
    .from('trips')
    .update({ status: 'archived' as TripStatus, updated_at: new Date().toISOString() })
    .eq('id', tripId);
  if (error) throw error;
}

export async function deleteTrip(tripId: UUID): Promise<void> {
  // Pre-cleanup child records to ensure clean deletion across all database setups
  try {
    await supabase.from('fund_transactions').delete().eq('trip_id', tripId);
    await supabase.from('trip_share_links').delete().eq('trip_id', tripId);
    const { data: expList } = await supabase.from('expenses').select('id').eq('trip_id', tripId);
    if (expList && expList.length > 0) {
      const expIds = expList.map(e => e.id);
      await supabase.from('expense_allocations').delete().in('expense_id', expIds);
    }
    await supabase.from('expenses').delete().eq('trip_id', tripId);
    await supabase.from('contributions').delete().eq('trip_id', tripId);
    await supabase.from('trip_members').delete().eq('trip_id', tripId);
  } catch (err) {
    console.warn('Child table cleanup error (cascade will proceed):', err);
  }

  const { error } = await supabase
    .from('trips')
    .delete()
    .eq('id', tripId);
  if (error) throw error;
}

// ─── Members ─────────────────────────────────────────────────────────────────

export async function fetchTripMembers(tripId: UUID): Promise<TripMember[]> {
  const { data, error } = await supabase
    .from('trip_members')
    .select('*')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as TripMember[];
}

export async function addTripMember(
  tripId: UUID,
  name: string,
  notes?: string
): Promise<TripMember> {
  const { data, error } = await supabase
    .from('trip_members')
    .insert({ trip_id: tripId, name: name.trim(), notes: notes || null, status: 'active' })
    .select()
    .single();
  if (error) throw error;
  return data as TripMember;
}

export async function updateMemberStatus(
  memberId: UUID,
  status: MemberStatus
): Promise<void> {
  const { error } = await supabase
    .from('trip_members')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', memberId);
  if (error) throw error;
}

export async function updateMember(
  memberId: UUID,
  name: string,
  notes?: string
): Promise<TripMember> {
  const { data, error } = await supabase
    .from('trip_members')
    .update({ name: name.trim(), notes: notes || null, updated_at: new Date().toISOString() })
    .eq('id', memberId)
    .select()
    .single();
  if (error) throw error;
  return data as TripMember;
}

// ─── Manager / Member roles & join codes (migration 003) ────────────────────
// NOTE: These helpers only work after supabase/migrations/003_manager_member_roles.sql
// has been run on the project's Supabase database. Until then the old
// owner-only behaviour applies and these calls fail with a clear error.

export type TripRoleInfo = {
  /** True when the signed-in user is this trip's Manager (owner or manager row). */
  isManager: boolean;
  /** The signed-in user's linked member row, if they joined / were linked. */
  membership: { member_id: UUID; role: 'manager' | 'member' } | null;
};

/** Resolve the signed-in user's role for one trip. Owners are Managers. */
export async function getTripRole(tripId: UUID): Promise<TripRoleInfo> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const trip = await fetchTrip(tripId);
  const { data, error } = await supabase
    .from('trip_members')
    .select('id, role')
    .eq('trip_id', tripId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  const linked = data as { id: UUID; role: 'manager' | 'member' } | null;
  const isManager = trip.owner_id === user.id || linked?.role === 'manager';
  return {
    isManager,
    membership: linked ? { member_id: linked.id, role: linked.role } : null,
  };
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}

/**
 * Get this trip's active join code, creating one only now (on the trip page,
 * for a Manager) — never at trip creation. Returns null for non-Managers,
 * because the join-code RLS policy only lets Managers read the table.
 */
export async function getOrCreateJoinCode(tripId: UUID): Promise<string | null> {
  const { data: existing, error: selectError } = await supabase
    .from('trip_join_codes')
    .select('code')
    .eq('trip_id', tripId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return (existing as { code: string }).code;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data, error } = await supabase
    .from('trip_join_codes')
    .insert({ trip_id: tripId, code: generateJoinCode(), is_active: true, created_by: user.id })
    .select('code')
    .single();
  if (error) {
    // Race: another Manager created the (single) active code first, or
    // the generated code collided. The active-per-trip unique index
    // rejects the second insert — just return the code that now exists.
    const { data: retry, error: retryError } = await supabase
      .from('trip_join_codes')
      .select('code')
      .eq('trip_id', tripId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (retryError || !retry) throw error;
    return (retry as { code: string }).code;
  }
  return (data as { code: string }).code;
}

/** Join a trip as a Group Member using a code. Returns the trip id. */
export async function joinTripByCode(code: string): Promise<UUID> {
  const cleaned = code.trim().toUpperCase();
  if (!cleaned) throw new Error('Enter a join code');
  const { data, error } = await supabase.rpc('join_trip_by_code', { p_code: cleaned });
  if (error) throw error;
  return data as UUID;
}

/**
 * Promote a linked Member to Manager. The previous Manager becomes only a
 * Group Member (and, if they were the trip owner, ownership moves to the
 * promoted member — see migration 003).
 */
export async function promoteMemberToManager(tripId: UUID, memberId: UUID): Promise<void> {
  const { error } = await supabase.rpc('promote_member_to_manager', {
    p_trip_id: tripId,
    p_member_id: memberId,
  });
  if (error) throw error;
}

/**
 * Leave a trip voluntarily. The server rejects this for the only Manager;
 * promote someone else first (see migration 003).
 */
export async function leaveTrip(tripId: UUID): Promise<void> {
  const { error } = await supabase.rpc('leave_trip', { p_trip_id: tripId });
  if (error) throw error;
}

// ─── Contributions ────────────────────────────────────────────────────────────

export async function fetchContributions(tripId: UUID): Promise<Contribution[]> {
  const { data, error } = await supabase
    .from('contributions')
    .select('*, member:trip_members(*)')
    .eq('trip_id', tripId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data as Contribution[];
}

export async function addContribution(
  tripId: UUID,
  form: AddContributionForm
): Promise<Contribution> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Role gate (migration 003): a Group Member may only add their own
  // contribution. Pre-migration this lookup fails and old RLS behaviour
  // (owner only) is left to enforce access, so existing trips keep working.
  try {
    const role = await getTripRole(tripId);
    if (!role.isManager && role.membership && form.member_id !== role.membership.member_id) {
      throw new Error('Members can only add their own contributions');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Members can only add their own contributions') throw err;
  }

  if (!Number.isInteger(form.amount) || form.amount <= 0) {
    throw new Error('Contribution amount must be a positive integer');
  }

  const { data, error } = await supabase
    .from('contributions')
    .insert({
      trip_id: tripId,
      member_id: form.member_id,
      amount: form.amount,
      occurred_at: form.occurred_at,
      payment_method: form.payment_method,
      note: form.note || null,
      reference: form.reference || null,
      status: 'valid',
      created_by: user.id,
    })
    .select('*, member:trip_members(*)')
    .single();
  if (error) throw error;
  return data as Contribution;
}

export async function voidContribution(contributionId: UUID): Promise<void> {
  const { error } = await supabase
    .from('contributions')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', contributionId);
  if (error) throw error;
}

// ─── Expenses ─────────────────────────────────────────────────────────────────

export async function fetchExpenses(tripId: UUID): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*, payer_member:trip_members(*), allocations:expense_allocations(*, member:trip_members(*))')
    .eq('trip_id', tripId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data as Expense[];
}

export async function addExpense(tripId: UUID, form: AddExpenseForm): Promise<Expense> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Role gate (migration 003): a Group Member's personal expense must be
  // paid by themselves. Group-fund expenses they create are still allowed.
  // Pre-migration the lookup fails and old RLS behaviour is left in place.
  try {
    const role = await getTripRole(tripId);
    if (
      !role.isManager && role.membership &&
      form.payment_source === 'personal' &&
      form.payer_member_id && form.payer_member_id !== role.membership.member_id
    ) {
      throw new Error('Members can only add personal expenses they paid themselves');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'Members can only add personal expenses they paid themselves') throw err;
  }

  if (!Number.isInteger(form.amount) || form.amount <= 0) {
    throw new Error('Expense amount must be a positive integer');
  }

  // Calculate allocations
  let allocationMap: Map<string, number>;
  const splitMethod: SplitMethod = form.split_method;

  if (splitMethod === 'equal') {
    allocationMap = equalSplit(form.amount, form.selected_member_ids);
  } else if (splitMethod === 'custom_amount') {
    allocationMap = new Map();
    (form.custom_splits || []).forEach(s => {
      if (s.amount !== undefined) allocationMap.set(s.member_id, s.amount);
    });
  } else if (splitMethod === 'custom_percentage') {
    const pctMap = new Map<string, number>();
    (form.custom_splits || []).forEach(s => {
      if (s.percentage !== undefined) pctMap.set(s.member_id, s.percentage);
    });
    allocationMap = percentageSplit(form.amount, pctMap);
  } else {
    throw new Error('Invalid split method');
  }

  // Validate allocations sum
  const totalAllocated = Array.from(allocationMap.values()).reduce((s, a) => s + a, 0);
  if (totalAllocated !== form.amount) {
    throw new Error(`Allocation sum (${totalAllocated}) does not equal expense amount (${form.amount})`);
  }

  // Handle receipt upload
  let receiptPath: string | null = null;
  if (form.receipt_file) {
    const ext = form.receipt_file.name.split('.').pop();
    const path = `receipts/${tripId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('receipts')
      .upload(path, form.receipt_file, { upsert: false });
    if (!uploadError) receiptPath = path;
  }

  // Insert expense
  const { data: expense, error: expError } = await supabase
    .from('expenses')
    .insert({
      trip_id: tripId,
      title: form.title.trim(),
      category: form.category,
      amount: form.amount,
      payment_source: form.payment_source,
      payer_member_id: form.payment_source === 'personal' ? (form.payer_member_id || null) : null,
      occurred_at: form.occurred_at,
      description: form.description || null,
      receipt_path: receiptPath,
      status: 'valid',
      created_by: user.id,
    })
    .select()
    .single();

  if (expError) {
    // Clean up uploaded receipt if expense creation failed
    if (receiptPath) {
      await supabase.storage.from('receipts').remove([receiptPath]);
    }
    throw expError;
  }

  // Insert allocations
  const allocationsToInsert = Array.from(allocationMap.entries()).map(([memberId, amount]) => ({
    expense_id: expense.id,
    member_id: memberId,
    amount,
  }));

  const { error: allocError } = await supabase
    .from('expense_allocations')
    .insert(allocationsToInsert);

  if (allocError) {
    // Rollback expense
    await supabase.from('expenses').delete().eq('id', expense.id);
    throw allocError;
  }

  // Return with joins
  const { data: full, error: fetchError } = await supabase
    .from('expenses')
    .select('*, payer_member:trip_members(*), allocations:expense_allocations(*, member:trip_members(*))')
    .eq('id', expense.id)
    .single();

  if (fetchError) throw fetchError;
  return full as Expense;
}

export async function voidExpense(expenseId: UUID): Promise<void> {
  const { error } = await supabase
    .from('expenses')
    .update({ status: 'void', updated_at: new Date().toISOString() })
    .eq('id', expenseId);
  if (error) throw error;
}

// ─── Expense Allocations ─────────────────────────────────────────────────────

export async function fetchAllAllocations(tripId: UUID): Promise<ExpenseAllocation[]> {
  const { data, error } = await supabase
    .from('expense_allocations')
    .select('*, member:trip_members(*), expense:expenses!inner(trip_id)')
    .eq('expense.trip_id', tripId);
  if (error) throw error;
  return data as ExpenseAllocation[];
}

// ─── Fund Transactions ────────────────────────────────────────────────────────

export async function fetchFundTransactions(tripId: UUID): Promise<FundTransaction[]> {
  const { data, error } = await supabase
    .from('fund_transactions')
    .select('*, member:trip_members(*)')
    .eq('trip_id', tripId)
    .order('occurred_at', { ascending: false });
  if (error) throw error;
  return data as FundTransaction[];
}

export async function addRefund(
  tripId: UUID,
  memberId: UUID,
  amount: number,
  relatedExpenseId: UUID | null,
  note: string,
  occurredAt: string
): Promise<FundTransaction> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Refund amount must be a positive integer');
  }

  const { data, error } = await supabase
    .from('fund_transactions')
    .insert({
      trip_id: tripId,
      member_id: memberId,
      transaction_type: 'refund',
      direction: 'out',
      amount,
      related_expense_id: relatedExpenseId,
      occurred_at: occurredAt,
      note,
      status: 'valid',
      created_by: user.id,
    })
    .select('*, member:trip_members(*)')
    .single();
  if (error) throw error;
  return data as FundTransaction;
}

export async function voidFundTransaction(txId: UUID): Promise<void> {
  const { error } = await supabase
    .from('fund_transactions')
    .update({ status: 'void' })
    .eq('id', txId);
  if (error) throw error;
}

// ─── Share Links ─────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random share token, hash it, and store the hash.
 * Returns the raw token (only shown once - user must copy it).
 */
export async function createShareLink(
  tripId: UUID,
  expiresInDays?: number
): Promise<{ token: string; link: TripShareLink }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Generate random 32-byte token
  const rawBytes = crypto.getRandomValues(new Uint8Array(32));
  const rawToken = Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // Hash with SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(rawToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  // Revoke existing active links first
  await supabase
    .from('trip_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('trip_id', tripId)
    .is('revoked_at', null);

  const { data: link, error } = await supabase
    .from('trip_share_links')
    .insert({
      trip_id: tripId,
      token_hash: tokenHash,
      revoked_at: null,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return { token: rawToken, link: link as TripShareLink };
}

export async function revokeShareLink(tripId: UUID): Promise<void> {
  const { error } = await supabase
    .from('trip_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('trip_id', tripId)
    .is('revoked_at', null);
  if (error) throw error;
}

export async function getActiveShareLink(tripId: UUID): Promise<TripShareLink | null> {
  const { data, error } = await supabase
    .from('trip_share_links')
    .select('*')
    .eq('trip_id', tripId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as TripShareLink | null;
}
