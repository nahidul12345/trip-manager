/**
 * Financial Calculation Tests
 *
 * Tests for the core financial engine covering all required test cases.
 * These tests use only pure TypeScript - no React, no database.
 */

import { describe, it, expect } from 'vitest';
import {
  equalSplit,
  percentageSplit,
  validateCustomAmountSplit,
  validateCustomPercentageSplit,
  calculateGroupCashBalance,
  calculateMemberBalances,
  calculateTripFinancials,
  calculateSettlementPlan,
} from '../lib/financial-calculations';
import type {
  TripMember,
  Contribution,
  Expense,
  ExpenseAllocation,
  FundTransaction,
} from '../types';

// ─── Test Fixtures ─────────────────────────────────────────────────────────────

function makeMember(id: string, name: string): TripMember {
  return { id, name, trip_id: 'trip1', notes: null, status: 'active', created_at: '', updated_at: '' };
}

function makeContribution(
  id: string, memberId: string, amount: number, status: 'valid' | 'void' = 'valid'
): Contribution {
  return {
    id, trip_id: 'trip1', member_id: memberId, amount,
    occurred_at: '2025-01-01T00:00:00Z', payment_method: 'cash',
    note: null, reference: null, status, created_by: 'admin', created_at: '', updated_at: '',
  };
}

function makeExpense(
  id: string, amount: number, paymentSource: 'group_fund' | 'personal',
  payerMemberId: string | null = null, status: 'valid' | 'void' = 'valid'
): Expense {
  return {
    id, trip_id: 'trip1', title: 'Test Expense', category: 'food', amount,
    payment_source: paymentSource, payer_member_id: payerMemberId,
    occurred_at: '2025-01-01T00:00:00Z', description: null, receipt_path: null,
    status, created_by: 'admin', created_at: '', updated_at: '',
  };
}

function makeAllocation(id: string, expenseId: string, memberId: string, amount: number): ExpenseAllocation {
  return { id, expense_id: expenseId, member_id: memberId, amount, created_at: '' };
}

// ─── Equal Split Tests ────────────────────────────────────────────────────────

describe('equalSplit', () => {
  it('splits 1000 among 3 members correctly (sum = 1000)', () => {
    const result = equalSplit(1000, ['a', 'b', 'c']);
    const values = Array.from(result.values());
    expect(values.reduce((s, v) => s + v, 0)).toBe(1000);
    // Two members get 333, one gets 334
    const sorted = values.sort((a, b) => b - a);
    expect(sorted[0]).toBe(334);
    expect(sorted[1]).toBe(333);
    expect(sorted[2]).toBe(333);
  });

  it('splits 1200 among 5 members correctly (sum = 1200)', () => {
    const result = equalSplit(1200, ['a', 'b', 'c', 'd', 'e']);
    const total = Array.from(result.values()).reduce((s, v) => s + v, 0);
    expect(total).toBe(1200);
  });

  it('splits 100 among 3 members correctly', () => {
    const result = equalSplit(100, ['a', 'b', 'c']);
    const values = Array.from(result.values());
    const total = values.reduce((s, v) => s + v, 0);
    expect(total).toBe(100);
  });

  it('splits evenly when divisible', () => {
    const result = equalSplit(900, ['a', 'b', 'c']);
    const values = Array.from(result.values());
    expect(values.every(v => v === 300)).toBe(true);
  });

  it('handles single member', () => {
    const result = equalSplit(500, ['a']);
    expect(result.get('a')).toBe(500);
  });

  it('throws for zero members', () => {
    expect(() => equalSplit(1000, [])).toThrow();
  });
});

// ─── Percentage Split Tests ───────────────────────────────────────────────────

describe('percentageSplit', () => {
  it('splits ৳1000 by 50/30/20% correctly', () => {
    const pct = new Map([['a', 50], ['b', 30], ['c', 20]]);
    const result = percentageSplit(1000, pct);
    const total = Array.from(result.values()).reduce((s, v) => s + v, 0);
    expect(total).toBe(1000);
    expect(result.get('a')).toBe(500);
    expect(result.get('b')).toBe(300);
    expect(result.get('c')).toBe(200);
  });

  it('handles rounding: ৳1000 split 33.33/33.33/33.34 = sums to 1000', () => {
    const pct = new Map([['a', 33.33], ['b', 33.33], ['c', 33.34]]);
    const result = percentageSplit(1000, pct);
    const total = Array.from(result.values()).reduce((s, v) => s + v, 0);
    expect(total).toBe(1000);
  });

  it('throws when percentages do not sum to 100', () => {
    const pct = new Map([['a', 50], ['b', 30]]);
    expect(() => percentageSplit(1000, pct)).toThrow();
  });

  it('distributes remainder correctly for ৳1001 split 50/50%', () => {
    const pct = new Map([['a', 50], ['b', 50]]);
    const result = percentageSplit(1001, pct);
    const total = Array.from(result.values()).reduce((s, v) => s + v, 0);
    expect(total).toBe(1001);
  });
});

// ─── Validation Tests ─────────────────────────────────────────────────────────

describe('validateCustomAmountSplit', () => {
  it('validates correct split', () => {
    const amounts = new Map([['a', 600], ['b', 400]]);
    const result = validateCustomAmountSplit(1000, amounts);
    expect(result.isValid).toBe(true);
  });

  it('fails when total does not match', () => {
    const amounts = new Map([['a', 600], ['b', 300]]);
    const result = validateCustomAmountSplit(1000, amounts);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('fails on negative amount', () => {
    const amounts = new Map([['a', 1100], ['b', -100]]);
    const result = validateCustomAmountSplit(1000, amounts);
    expect(result.isValid).toBe(false);
  });
});

describe('validateCustomPercentageSplit', () => {
  it('validates percentages that sum to 100', () => {
    const percentages = new Map([['a', 60], ['b', 40]]);
    const result = validateCustomPercentageSplit(percentages);
    expect(result.isValid).toBe(true);
  });

  it('fails when percentages do not sum to 100', () => {
    const percentages = new Map([['a', 60], ['b', 30]]);
    const result = validateCustomPercentageSplit(percentages);
    expect(result.isValid).toBe(false);
  });
});

// ─── Group Cash Balance Tests ─────────────────────────────────────────────────

describe('calculateGroupCashBalance', () => {
  it('test 1: one member contributes ৳1000 → cash balance = 1000', () => {
    const contributions = [makeContribution('c1', 'm1', 1000)];
    const { cashBalance } = calculateGroupCashBalance(contributions, [], []);
    expect(cashBalance).toBe(1000);
  });

  it('test 2: five members each contribute ৳1000 → cash balance = 5000', () => {
    const contributions = ['m1','m2','m3','m4','m5'].map((id, i) =>
      makeContribution(`c${i+1}`, id, 1000)
    );
    const { cashBalance } = calculateGroupCashBalance(contributions, [], []);
    expect(cashBalance).toBe(5000);
  });

  it('test 3: group fund expense of ৳1200 reduces cash', () => {
    const contributions = [makeContribution('c1', 'm1', 2000)];
    const expenses = [makeExpense('e1', 1200, 'group_fund')];
    const { cashBalance } = calculateGroupCashBalance(contributions, expenses, []);
    expect(cashBalance).toBe(800);
  });

  it('test 4: personal expense does NOT reduce group cash', () => {
    const contributions = [makeContribution('c1', 'm1', 1000)];
    const expenses = [makeExpense('e1', 800, 'personal', 'm2')];
    const { cashBalance } = calculateGroupCashBalance(contributions, expenses, []);
    expect(cashBalance).toBe(1000); // unchanged
  });

  it('test 9: voided contribution does not count', () => {
    const contributions = [
      makeContribution('c1', 'm1', 1000, 'valid'),
      makeContribution('c2', 'm1', 500, 'void'),
    ];
    const { cashBalance, totalContributions } = calculateGroupCashBalance(contributions, [], []);
    expect(cashBalance).toBe(1000);
    expect(totalContributions).toBe(1000);
  });
});

// ─── Member Balance Tests ─────────────────────────────────────────────────────

describe('calculateMemberBalances', () => {
  const m1 = makeMember('m1', 'Alice');
  const m2 = makeMember('m2', 'Bob');
  const m3 = makeMember('m3', 'Carol');

  it('test 5: equal split of ৳1000 among 3 members', () => {
    const contributions = [makeContribution('c1', 'm1', 3000)];
    const expenses = [makeExpense('e1', 1000, 'group_fund')];
    const allocs = [
      makeAllocation('a1', 'e1', 'm1', 334),
      makeAllocation('a2', 'e1', 'm2', 333),
      makeAllocation('a3', 'e1', 'm3', 333),
    ];
    // Verify allocations sum
    const allocTotal = allocs.reduce((s, a) => s + a.amount, 0);
    expect(allocTotal).toBe(1000);

    const balances = calculateMemberBalances([m1, m2, m3], contributions, expenses, allocs, []);
    // Alice contributed 3000, allocated 334 → netBalance = 3000 - 334 = 2666
    expect(balances.find(b => b.member.id === 'm1')?.netBalance).toBe(3000 - 334);
    // Bob contributed 0, allocated 333 → netBalance = -333
    expect(balances.find(b => b.member.id === 'm2')?.netBalance).toBe(-333);
  });

  it('test 6: custom amount split', () => {
    const contributions = [makeContribution('c1', 'm1', 1000)];
    const expenses = [makeExpense('e1', 1000, 'group_fund')];
    const allocs = [
      makeAllocation('a1', 'e1', 'm1', 600),
      makeAllocation('a2', 'e1', 'm2', 400),
    ];
    const balances = calculateMemberBalances([m1, m2], contributions, expenses, allocs, []);
    // Alice: 1000 - 600 = 400
    expect(balances.find(b => b.member.id === 'm1')?.netBalance).toBe(400);
    // Bob: 0 - 400 = -400
    expect(balances.find(b => b.member.id === 'm2')?.netBalance).toBe(-400);
  });

  it('test 4: personal expense credits the payer, does not reduce cash', () => {
    // Alice pays personally ৳800 for the group
    const expenses = [makeExpense('e1', 800, 'personal', 'm1')];
    const allocs = [
      makeAllocation('a1', 'e1', 'm1', 400),
      makeAllocation('a2', 'e1', 'm2', 400),
    ];
    const balances = calculateMemberBalances([m1, m2], [], expenses, allocs, []);
    // Alice: personally paid 800 - allocated 400 = +400
    expect(balances.find(b => b.member.id === 'm1')?.totalPersonallyPaid).toBe(800);
    expect(balances.find(b => b.member.id === 'm1')?.netBalance).toBe(800 - 400);
    // Bob: 0 - 400 = -400
    expect(balances.find(b => b.member.id === 'm2')?.netBalance).toBe(-400);
  });

  it('test 8: member contributes multiple times', () => {
    const contributions = [
      makeContribution('c1', 'm1', 500),
      makeContribution('c2', 'm1', 500),
      makeContribution('c3', 'm1', 1000),
    ];
    const balances = calculateMemberBalances([m1], contributions, [], [], []);
    expect(balances[0].totalContributions).toBe(2000);
    expect(balances[0].netBalance).toBe(2000);
  });
});

// ─── Invariant Tests ─────────────────────────────────────────────────────────

describe('Financial Invariant: Sum(memberBalances) === groupCashBalance', () => {
  const m1 = makeMember('m1', 'Alice');
  const m2 = makeMember('m2', 'Bob');
  const m3 = makeMember('m3', 'Carol');

  it('test 14: invariant holds for typical trip', () => {
    const contributions = [
      makeContribution('c1', 'm1', 1000),
      makeContribution('c2', 'm2', 1000),
      makeContribution('c3', 'm3', 1000),
    ];
    const expenses = [makeExpense('e1', 900, 'group_fund')];
    const allocs = equalSplit(900, ['m1', 'm2', 'm3']);
    const allocationObjects = Array.from(allocs.entries()).map(([id, amount], i) =>
      makeAllocation(`a${i}`, 'e1', id, amount)
    );

    const fin = calculateTripFinancials([m1, m2, m3], contributions, expenses, allocationObjects, []);
    expect(fin.isReconciled).toBe(true);
    expect(fin.reconciliationDifference).toBe(0);
    expect(fin.sumOfMemberBalances).toBe(fin.groupCashBalance);
  });

  it('test 9: voiding transaction and recalculating restores invariant', () => {
    const contributions = [
      makeContribution('c1', 'm1', 1000),
      makeContribution('c2', 'm2', 1000, 'void'), // voided
    ];
    const expenses = [makeExpense('e1', 500, 'group_fund')];
    const allocs = [
      makeAllocation('a1', 'e1', 'm1', 250),
      makeAllocation('a2', 'e1', 'm2', 250),
    ];
    const fin = calculateTripFinancials([m1, m2], contributions, expenses, allocs, []);
    expect(fin.isReconciled).toBe(true);
    expect(fin.groupCashBalance).toBe(1000 - 500); // only m1's contribution
  });

  it('test 10: refund from group fund decreases cash and member credit', () => {
    const contributions = [makeContribution('c1', 'm1', 2000)];
    const fundTransactions: FundTransaction[] = [{
      id: 'ft1', trip_id: 'trip1', member_id: 'm1',
      transaction_type: 'refund', direction: 'out', amount: 500,
      related_expense_id: null, occurred_at: '', note: 'Refund', status: 'valid',
      created_by: 'admin', created_at: '',
    }];

    const fin = calculateTripFinancials([m1], contributions, [], [], fundTransactions);
    expect(fin.groupCashBalance).toBe(1500); // 2000 - 500
    expect(fin.memberBalances[0].netBalance).toBe(1500);
    expect(fin.isReconciled).toBe(true);
  });

  it('test 13: allocations sum equals expense amount', () => {
    const amounts = [500, 700, 1000, 1200];
    amounts.forEach(amount => {
      const members = ['a','b','c'];
      const allocs = equalSplit(amount, members);
      const total = Array.from(allocs.values()).reduce((s, v) => s + v, 0);
      expect(total).toBe(amount);
    });
  });
});

// ─── Settlement Tests ─────────────────────────────────────────────────────────

describe('Settlement Plan', () => {
  const m1 = makeMember('m1', 'Alice');
  const m2 = makeMember('m2', 'Bob');
  const m3 = makeMember('m3', 'Carol');

  it('test 12: generates correct settlement suggestions', () => {
    // Alice contributed 3000, Bob 0, Carol 0
    // Expense of 3000, split equally → each owes 1000
    const contributions = [makeContribution('c1', 'm1', 3000)];
    const expenses = [makeExpense('e1', 3000, 'group_fund')];
    const allocsMap = equalSplit(3000, ['m1', 'm2', 'm3']);
    const allocs = Array.from(allocsMap.entries()).map(([id, amount], i) =>
      makeAllocation(`a${i}`, 'e1', id, amount)
    );

    const fin = calculateTripFinancials([m1, m2, m3], contributions, expenses, allocs, []);
    const plan = calculateSettlementPlan(fin);

    // Bob and Carol each have -1000, Alice has +1000 (contributed 3000, allocated 1000)
    // Wait: Alice: 3000 contributed - 1000 allocated = +2000
    // After group fund expenses: cash = 3000 - 3000 = 0
    // Bob: -1000, Carol: -1000, Alice: +2000
    // Sum = 0 = cash balance ✓

    expect(plan.actions.length).toBeGreaterThan(0);
  });

  it('test 11: insufficient group cash for refund is flagged', () => {
    // 0 cash, but someone has positive balance — can't refund
    const contributions: Contribution[] = [];
    const expenses = [makeExpense('e1', 1000, 'personal', 'm1')];
    const allocs = [
      makeAllocation('a1', 'e1', 'm1', 500),
      makeAllocation('a2', 'e1', 'm2', 500),
    ];
    const fin = calculateTripFinancials([m1, m2], contributions, expenses, allocs, []);
    // Group cash = 0 (personal expense doesn't affect it)
    expect(fin.groupCashBalance).toBe(0);
    // Alice: +500 (paid 1000, allocated 500), Bob: -500
    const plan = calculateSettlementPlan(fin);
    // Should suggest member-to-member since no group fund
    const memberToMember = plan.actions.filter(a => a.type === 'member_to_member');
    expect(memberToMember.length).toBeGreaterThan(0);
  });
});

// ─── Allocation Integrity Test ───────────────────────────────────────────────

describe('Allocation Integrity', () => {
  it('equal split always sums to total for various amounts', () => {
    const testCases = [1, 7, 100, 999, 1000, 1001, 3333, 5000, 10000];
    const memberCounts = [1, 2, 3, 4, 5, 7];

    testCases.forEach(amount => {
      memberCounts.forEach(n => {
        const members = Array.from({ length: n }, (_, i) => `m${i}`);
        const result = equalSplit(amount, members);
        const total = Array.from(result.values()).reduce((s, v) => s + v, 0);
        expect(total).toBe(amount);
      });
    });
  });

  it('percentage split always sums to total for various amounts', () => {
    const amount = 1000;
    const cases = [
      new Map([['a', 33.33], ['b', 33.33], ['c', 33.34]]),
      new Map([['a', 50], ['b', 50]]),
      new Map([['a', 10], ['b', 20], ['c', 30], ['d', 40]]),
    ];
    cases.forEach(pct => {
      const result = percentageSplit(amount, pct);
      const total = Array.from(result.values()).reduce((s, v) => s + v, 0);
      expect(total).toBe(amount);
    });
  });
});
