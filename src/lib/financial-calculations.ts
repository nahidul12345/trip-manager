/**
 * Financial Calculation Engine
 *
 * Core financial logic for the Friends Trip Expense Manager.
 * This module is pure TypeScript with no React or database dependencies.
 * All amounts are integers in BDT (Bangladeshi Taka) whole units.
 *
 * INVARIANT: Sum of all member net balances == Group cash balance
 * (when all transactions are consistent)
 */

import type {
  Contribution,
  Expense,
  ExpenseAllocation,
  FundTransaction,
  TripMember,
  MemberBalance,
  TripFinancials,
  SettlementPlan,
  SettlementAction,
} from '../types';

// ─── Integer Math Utilities ──────────────────────────────────────────────────

/**
 * Round to nearest integer (for display rounding only - never for allocation)
 */
export function roundTaka(amount: number): number {
  return Math.round(amount);
}

/**
 * Format BDT amount for display
 */
export function formatBDT(amount: number): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-BD');
  return `৳${formatted}`;
}

/**
 * Format BDT amount with sign indicator
 */
export function formatBDTWithSign(amount: number): string {
  if (amount === 0) return `৳0`;
  const sign = amount > 0 ? '+' : '-';
  return `${sign}${formatBDT(amount)}`;
}

// ─── Equal Split Algorithm ────────────────────────────────────────────────────

/**
 * Split an integer amount equally among N members.
 * Uses largest-remainder method to ensure sum == totalAmount.
 * Members are identified by index in the provided array.
 *
 * Returns an array of amounts in the same order as memberIds.
 * Guaranteed: sum(result) === totalAmount
 */
export function equalSplit(totalAmount: number, memberIds: string[]): Map<string, number> {
  const n = memberIds.length;
  if (n === 0) throw new Error('Cannot split among zero members');
  if (totalAmount < 0) throw new Error('Expense amount must be non-negative');

  const base = Math.floor(totalAmount / n);
  const remainder = totalAmount % n;

  const result = new Map<string, number>();
  memberIds.forEach((id, index) => {
    // First `remainder` members get one extra taka
    result.set(id, base + (index < remainder ? 1 : 0));
  });

  return result;
}

// ─── Custom Percentage Split Algorithm ───────────────────────────────────────

/**
 * Convert percentage shares to integer amounts using largest-remainder method.
 * percentages: Map<memberId, percentage (0-100)>
 * Guaranteed: sum(result) === totalAmount
 */
export function percentageSplit(
  totalAmount: number,
  percentages: Map<string, number>
): Map<string, number> {
  const entries = Array.from(percentages.entries());

  // Validate percentages sum to 100 (allow 0.01% tolerance)
  const totalPct = entries.reduce((sum, [, pct]) => sum + pct, 0);
  if (Math.abs(totalPct - 100) > 0.01) {
    throw new Error(`Percentages must sum to 100, got ${totalPct}`);
  }

  // Calculate exact (floating-point) amounts
  const exactAmounts = entries.map(([id, pct]) => ({
    id,
    exact: (pct / 100) * totalAmount,
    floor: 0,
    remainder: 0,
  }));

  // Floor each amount and compute remainders
  let totalFloor = 0;
  for (const item of exactAmounts) {
    item.floor = Math.floor(item.exact);
    item.remainder = item.exact - item.floor;
    totalFloor += item.floor;
  }

  // Distribute remaining taka to those with highest fractional parts
  let remainingTaka = totalAmount - totalFloor;
  exactAmounts.sort((a, b) => b.remainder - a.remainder);

  const result = new Map<string, number>();
  for (let i = 0; i < exactAmounts.length; i++) {
    const item = exactAmounts[i];
    result.set(item.id, item.floor + (remainingTaka > 0 ? 1 : 0));
    if (remainingTaka > 0) remainingTaka--;
  }

  return result;
}

// ─── Validate Custom Split ────────────────────────────────────────────────────

export interface SplitValidationResult {
  isValid: boolean;
  errors: string[];
  totalAllocated: number;
}

export function validateCustomAmountSplit(
  totalAmount: number,
  amounts: Map<string, number>
): SplitValidationResult {
  const errors: string[] = [];
  let totalAllocated = 0;

  for (const [memberId, amount] of amounts.entries()) {
    if (amount < 0) errors.push(`Member ${memberId} has a negative allocation`);
    if (!Number.isInteger(amount)) errors.push(`Member ${memberId} has a non-integer amount`);
    totalAllocated += amount;
  }

  if (totalAllocated !== totalAmount) {
    errors.push(`Total allocations (${totalAllocated}) must equal expense amount (${totalAmount})`);
  }

  return { isValid: errors.length === 0, errors, totalAllocated };
}

export function validateCustomPercentageSplit(
  percentages: Map<string, number>
): SplitValidationResult {
  const errors: string[] = [];
  let totalPct = 0;

  for (const [memberId, pct] of percentages.entries()) {
    if (pct < 0) errors.push(`Member ${memberId} has a negative percentage`);
    totalPct += pct;
  }

  if (Math.abs(totalPct - 100) > 0.01) {
    errors.push(`Percentages must sum to 100%, got ${totalPct.toFixed(2)}%`);
  }

  return { isValid: errors.length === 0, errors, totalAllocated: totalPct };
}

// ─── Group Cash Balance ───────────────────────────────────────────────────────

/**
 * Calculate the group's cash balance from raw transactions.
 *
 * Cash Balance = Total Contributions
 *              + Other Valid Cash Inflows (fund_transactions direction='in')
 *              - Group-Fund Expenses
 *              - Cash Refunds and Withdrawals (fund_transactions direction='out')
 */
export function calculateGroupCashBalance(
  contributions: Contribution[],
  expenses: Expense[],
  fundTransactions: FundTransaction[]
): {
  totalContributions: number;
  totalGroupFundExpenses: number;
  totalRefundsAndWithdrawals: number;
  totalOtherInflows: number;
  cashBalance: number;
} {
  const validContributions = contributions.filter(c => c.status === 'valid');
  const validExpenses = expenses.filter(e => e.status === 'valid');
  const validFundTx = fundTransactions.filter(f => f.status === 'valid');

  const totalContributions = validContributions.reduce((sum, c) => sum + c.amount, 0);
  const totalGroupFundExpenses = validExpenses
    .filter(e => e.payment_source === 'group_fund')
    .reduce((sum, e) => sum + e.amount, 0);

  const totalRefundsAndWithdrawals = validFundTx
    .filter(t => t.direction === 'out')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalOtherInflows = validFundTx
    .filter(t => t.direction === 'in')
    .reduce((sum, t) => sum + t.amount, 0);

  const cashBalance =
    totalContributions + totalOtherInflows - totalGroupFundExpenses - totalRefundsAndWithdrawals;

  return {
    totalContributions,
    totalGroupFundExpenses,
    totalRefundsAndWithdrawals,
    totalOtherInflows,
    cashBalance,
  };
}

// ─── Member Net Balance ───────────────────────────────────────────────────────

/**
 * Calculate financial balance for each member.
 *
 * Member Net Balance =
 *   Contributions
 * + Personally Paid Valid Expenses
 * - Allocated Expense Shares
 * - Refunds or Withdrawals Paid to That Member
 * + Other Credits (fund_transactions direction='in' for this member)
 * - Other Debits (fund_transactions direction='out' for this member)
 */
export function calculateMemberBalances(
  members: TripMember[],
  contributions: Contribution[],
  expenses: Expense[],
  allocations: ExpenseAllocation[],
  fundTransactions: FundTransaction[]
): MemberBalance[] {
  const validContributions = contributions.filter(c => c.status === 'valid');
  const validExpenses = expenses.filter(e => e.status === 'valid');
  const validFundTx = fundTransactions.filter(f => f.status === 'valid');

  return members.map(member => {
    const totalContributions = validContributions
      .filter(c => c.member_id === member.id)
      .reduce((sum, c) => sum + c.amount, 0);

    const totalPersonallyPaid = validExpenses
      .filter(e => e.payment_source === 'personal' && e.payer_member_id === member.id)
      .reduce((sum, e) => sum + e.amount, 0);

    const totalAllocatedExpenses = allocations
      .filter(a => {
        const expense = validExpenses.find(e => e.id === a.expense_id);
        return expense !== undefined && a.member_id === member.id;
      })
      .reduce((sum, a) => sum + a.amount, 0);

    const memberFundTx = validFundTx.filter(t => t.member_id === member.id);
    const totalOtherCredits = memberFundTx
      .filter(t => t.direction === 'in' && t.transaction_type !== 'refund')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalRefunds = memberFundTx
      .filter(t => t.direction === 'out' || t.transaction_type === 'refund')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalOtherDebits = memberFundTx
      .filter(t => t.direction === 'out' && t.transaction_type !== 'refund')
      .reduce((sum, t) => sum + t.amount, 0);

    const netBalance =
      totalContributions +
      totalPersonallyPaid -
      totalAllocatedExpenses -
      totalRefunds +
      totalOtherCredits -
      totalOtherDebits;

    return {
      member,
      totalContributions,
      totalPersonallyPaid,
      totalAllocatedExpenses,
      totalRefunds,
      totalOtherCredits,
      totalOtherDebits,
      netBalance,
    };
  });
}

// ─── Full Trip Financials ─────────────────────────────────────────────────────

export function calculateTripFinancials(
  members: TripMember[],
  contributions: Contribution[],
  expenses: Expense[],
  allocations: ExpenseAllocation[],
  fundTransactions: FundTransaction[]
): TripFinancials {
  const cashCalc = calculateGroupCashBalance(contributions, expenses, fundTransactions);
  const memberBalances = calculateMemberBalances(
    members,
    contributions,
    expenses,
    allocations,
    fundTransactions
  );

  const sumOfMemberBalances = memberBalances.reduce((sum, mb) => sum + mb.netBalance, 0);
  const reconciliationDifference = cashCalc.cashBalance - sumOfMemberBalances;

  return {
    groupCashBalance: cashCalc.cashBalance,
    totalContributions: cashCalc.totalContributions,
    totalGroupFundExpenses: cashCalc.totalGroupFundExpenses,
    totalPersonalExpenses: expenses
      .filter(e => e.status === 'valid' && e.payment_source === 'personal')
      .reduce((sum, e) => sum + e.amount, 0),
    totalRefunds: cashCalc.totalRefundsAndWithdrawals,
    totalOtherOutflows: 0,
    memberBalances,
    sumOfMemberBalances,
    reconciliationDifference,
    isReconciled: Math.abs(reconciliationDifference) === 0,
  };
}

// ─── Settlement Algorithm ─────────────────────────────────────────────────────

/**
 * Greedy settlement algorithm.
 * Separates debtors from creditors and suggests minimal transfers.
 */
export function calculateSettlementPlan(financials: TripFinancials): SettlementPlan {
  const actions: SettlementAction[] = [];

  // Separate debtors (negative balance) and creditors (positive balance)
  const debtors = financials.memberBalances
    .filter(mb => mb.netBalance < 0)
    .map(mb => ({ member: mb.member, amount: -mb.netBalance })) // make positive
    .sort((a, b) => b.amount - a.amount);

  const creditors = financials.memberBalances
    .filter(mb => mb.netBalance > 0)
    .map(mb => ({ member: mb.member, amount: mb.netBalance }))
    .sort((a, b) => b.amount - a.amount);

  // Working copies
  const debtorQueue = debtors.map(d => ({ ...d }));
  const creditorQueue = creditors.map(c => ({ ...c }));

  let groupFundBalance = financials.groupCashBalance;

  // Step 1: Match member-to-member settlements
  // This only applies to personal expense scenarios where group fund isn't the mediator
  // In practice, since contributions go to group fund and expenses come from it,
  // member-to-member transfers are rare. But we handle them for completeness.
  let di = 0;
  let ci = 0;

  while (di < debtorQueue.length && ci < creditorQueue.length) {
    const debtor = debtorQueue[di];
    const creditor = creditorQueue[ci];

    const transferAmount = Math.min(debtor.amount, creditor.amount);

    if (transferAmount > 0) {
      // If there's enough in the group fund, suggest fund refund to creditor first
      // If not, suggest member-to-member transfer
      if (groupFundBalance >= creditor.amount) {
        // Creditor gets money back from group fund
        actions.push({
          type: 'group_fund_refund',
          to: creditor.member,
          amount: creditor.amount,
        });
        groupFundBalance -= creditor.amount;
        creditor.amount = 0;
        ci++;

        // Debtor pays to group fund (additional contribution needed)
        if (debtor.amount > 0) {
          actions.push({
            type: 'additional_contribution_needed',
            from: debtor.member,
            amount: debtor.amount,
          });
          debtor.amount = 0;
          di++;
        }
      } else {
        // Not enough group fund — suggest member-to-member transfer
        actions.push({
          type: 'member_to_member',
          from: debtor.member,
          to: creditor.member,
          amount: transferAmount,
        });
        debtor.amount -= transferAmount;
        creditor.amount -= transferAmount;
        if (debtor.amount === 0) di++;
        if (creditor.amount === 0) ci++;
      }
    } else {
      if (debtor.amount === 0) di++;
      if (creditor.amount === 0) ci++;
    }
  }

  // Step 2: Any remaining creditors get refund from group fund
  while (ci < creditorQueue.length) {
    const creditor = creditorQueue[ci];
    if (creditor.amount > 0 && groupFundBalance >= creditor.amount) {
      actions.push({
        type: 'group_fund_refund',
        to: creditor.member,
        amount: creditor.amount,
      });
      groupFundBalance -= creditor.amount;
    } else if (creditor.amount > 0) {
      // Partial refund possible
      if (groupFundBalance > 0) {
        actions.push({
          type: 'group_fund_refund',
          to: creditor.member,
          amount: groupFundBalance,
        });
        groupFundBalance = 0;
      }
    }
    ci++;
  }

  // Step 3: Any remaining debtors need to contribute more
  while (di < debtorQueue.length) {
    const debtor = debtorQueue[di];
    if (debtor.amount > 0) {
      actions.push({
        type: 'additional_contribution_needed',
        from: debtor.member,
        amount: debtor.amount,
      });
    }
    di++;
  }

  const residualGroupFundBalance = Math.max(0, groupFundBalance);
  const cashShortfall = Math.max(0, -groupFundBalance);
  const hasUnresolvedDebt = debtorQueue.slice(di).some(d => d.amount > 0);

  return {
    actions,
    residualGroupFundBalance,
    cashShortfall,
    isFullySettleable: !hasUnresolvedDebt && cashShortfall === 0,
  };
}
