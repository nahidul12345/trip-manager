// Type definitions for the Friends Trip Expense Manager

export type UUID = string;

export type TripStatus = 'active' | 'archived';
export type MemberStatus = 'active' | 'inactive';
export type TripMemberRole = 'manager' | 'member';
export type TransactionStatus = 'valid' | 'void';
export type PaymentMethod = 'cash' | 'bkash' | 'nagad' | 'bank' | 'other';
export type PaymentSource = 'group_fund' | 'personal';
export type ExpenseCategory = 'transport' | 'food' | 'tickets' | 'accommodation' | 'shopping' | 'other';
export type SplitMethod = 'equal' | 'custom_amount' | 'custom_percentage';
export type FundTransactionType = 'refund' | 'withdrawal' | 'adjustment' | 'deposit';
export type FundTransactionDirection = 'in' | 'out';

// ─── Database Row Types ──────────────────────────────────────────────────────

export interface Profile {
  id: UUID;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface Trip {
  id: UUID;
  owner_id: UUID;
  name: string;
  description: string | null;
  location: string | null;
  start_date: string;
  end_date: string;
  currency: string;
  status: TripStatus;
  created_at: string;
  updated_at: string;
}

export interface TripMember {
  id: UUID;
  trip_id: UUID;
  name: string;
  notes: string | null;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
  // Added by migration 003 (Manager / Member roles). Name-only members
  // created before 003 keep user_id null and role 'member'.
  user_id?: UUID | null;
  role?: TripMemberRole;
}

/** A signed-in user's membership in one trip, if any. */
export interface TripMembership {
  member_id: UUID;
  role: TripMemberRole;
}

export interface TripJoinCode {
  id: UUID;
  trip_id: UUID;
  code: string;
  is_active: boolean;
  created_by: UUID;
  created_at: string;
}

export interface Contribution {
  id: UUID;
  trip_id: UUID;
  member_id: UUID;
  amount: number; // BIGINT stored as integer taka
  occurred_at: string;
  payment_method: PaymentMethod;
  note: string | null;
  reference: string | null;
  status: TransactionStatus;
  created_by: UUID;
  created_at: string;
  updated_at: string;
  // Joined
  member?: TripMember;
}

export interface Expense {
  id: UUID;
  trip_id: UUID;
  title: string;
  category: ExpenseCategory;
  amount: number;
  payment_source: PaymentSource;
  payer_member_id: UUID | null;
  occurred_at: string;
  description: string | null;
  receipt_path: string | null;
  status: TransactionStatus;
  created_by: UUID;
  created_at: string;
  updated_at: string;
  // Joined
  payer_member?: TripMember;
  allocations?: ExpenseAllocation[];
}

export interface ExpenseAllocation {
  id: UUID;
  expense_id: UUID;
  member_id: UUID;
  amount: number;
  created_at: string;
  // Joined
  member?: TripMember;
}

export interface FundTransaction {
  id: UUID;
  trip_id: UUID;
  member_id: UUID | null;
  transaction_type: FundTransactionType;
  direction: FundTransactionDirection;
  amount: number;
  related_expense_id: UUID | null;
  occurred_at: string;
  note: string | null;
  status: TransactionStatus;
  created_by: UUID;
  created_at: string;
  // Joined
  member?: TripMember;
  related_expense?: Expense;
}

export interface TripShareLink {
  id: UUID;
  trip_id: UUID;
  token_hash: string;
  revoked_at: string | null;
  expires_at: string | null;
  created_by: UUID;
  created_at: string;
}

// ─── Computed / Derived Types ────────────────────────────────────────────────

export interface MemberBalance {
  member: TripMember;
  totalContributions: number;
  totalPersonallyPaid: number;
  totalAllocatedExpenses: number;
  totalRefunds: number;
  totalOtherCredits: number;
  totalOtherDebits: number;
  netBalance: number; // positive = credit, negative = owes
}

export interface TripFinancials {
  groupCashBalance: number;
  totalContributions: number;
  totalGroupFundExpenses: number;
  totalPersonalExpenses: number;
  totalRefunds: number;
  totalOtherOutflows: number;
  memberBalances: MemberBalance[];
  sumOfMemberBalances: number;
  reconciliationDifference: number;
  isReconciled: boolean;
}

export interface SettlementTransfer {
  type: 'member_to_member';
  from: TripMember; // debtor
  to: TripMember;   // creditor
  amount: number;
}

export interface GroupFundRefund {
  type: 'group_fund_refund';
  to: TripMember;
  amount: number;
}

export interface AdditionalContributionNeeded {
  type: 'additional_contribution_needed';
  from: TripMember;
  amount: number;
}

export type SettlementAction = SettlementTransfer | GroupFundRefund | AdditionalContributionNeeded;

export interface SettlementPlan {
  actions: SettlementAction[];
  residualGroupFundBalance: number;
  cashShortfall: number;
  isFullySettleable: boolean;
}

// ─── Form Types ──────────────────────────────────────────────────────────────

export interface CreateTripForm {
  name: string;
  description?: string;
  location?: string;
  start_date: string;
  end_date: string;
  currency: string;
  members: { name: string; notes?: string }[];
}

export interface AddContributionForm {
  member_id: UUID;
  amount: number;
  occurred_at: string;
  payment_method: PaymentMethod;
  note?: string;
  reference?: string;
}

export interface MemberSplit {
  member_id: UUID;
  amount?: number;
  percentage?: number;
}

export interface AddExpenseForm {
  title: string;
  category: ExpenseCategory;
  amount: number;
  payment_source: PaymentSource;
  payer_member_id?: UUID;
  occurred_at: string;
  description?: string;
  receipt_file?: File;
  split_method: SplitMethod;
  selected_member_ids: UUID[];
  custom_splits?: MemberSplit[];
}

// ─── UI State Types ──────────────────────────────────────────────────────────

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
}

export interface ShareLinkInfo {
  token: string; // raw token for sharing (never stored in DB)
  shareUrl: string;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

// ─── API Response Types ──────────────────────────────────────────────────────

export interface PublicTripData {
  trip: Pick<Trip, 'id' | 'name' | 'description' | 'location' | 'start_date' | 'end_date' | 'currency' | 'status'>;
  members: Pick<TripMember, 'id' | 'name' | 'status'>[];
  contributions: Pick<Contribution, 'id' | 'member_id' | 'amount' | 'occurred_at' | 'payment_method' | 'note' | 'status'>[];
  expenses: Pick<Expense, 'id' | 'title' | 'category' | 'amount' | 'payment_source' | 'payer_member_id' | 'occurred_at' | 'description' | 'status'>[];
  expense_allocations: Pick<ExpenseAllocation, 'id' | 'expense_id' | 'member_id' | 'amount'>[];
  fund_transactions: Pick<FundTransaction, 'id' | 'member_id' | 'transaction_type' | 'direction' | 'amount' | 'occurred_at' | 'note' | 'status'>[];
  financials: TripFinancials;
  settlement_plan: SettlementPlan;
}
