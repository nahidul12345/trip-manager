export type Member = { id: string; user_id: string; role: 'manager' | 'member'; email?: string | null };
export type Contribution = { id: string; member_id: string; amount: number; status: string };
export type Expense = { id: string; amount: number; payment_source: 'group_fund' | 'personal'; payer_member_id: string | null; status: string };
export type Allocation = { expense_id: string; member_id: string; amount: number };

export type MemberBalance = {
  member: Member;
  contributed: number;
  personalPaid: number;
  share: number;
  balance: number; // contributed + personalPaid - share; >0 = owed to them, <0 = they owe
};

export function computeBalances(
  members: Member[],
  contributions: Contribution[],
  expenses: Expense[],
  allocations: Allocation[],
): { balances: MemberBalance[]; totalContributed: number; totalGroupFundExpenses: number; fundBalance: number } {
  const active = members;
  const balances: MemberBalance[] = active.map((member) => {
    const contributed = contributions
      .filter((c) => c.member_id === member.id && c.status === 'valid')
      .reduce((s, c) => s + c.amount, 0);
    const personalPaid = expenses
      .filter((e) => e.payment_source === 'personal' && e.payer_member_id === member.id && e.status === 'valid')
      .reduce((s, e) => s + e.amount, 0);
    const share = allocations
      .filter((a) => a.member_id === member.id)
      .reduce((s, a) => s + a.amount, 0);
    return { member, contributed, personalPaid, share, balance: contributed + personalPaid - share };
  });
  const totalContributed = contributions.filter((c) => c.status === 'valid').reduce((s, c) => s + c.amount, 0);
  const totalGroupFundExpenses = expenses
    .filter((e) => e.payment_source === 'group_fund' && e.status === 'valid')
    .reduce((s, e) => s + e.amount, 0);
  return { balances, totalContributed, totalGroupFundExpenses, fundBalance: totalContributed - totalGroupFundExpenses };
}

export type Settlement = { from: Member; to: Member; amount: number };

export function greedySettlement(balances: MemberBalance[]): Settlement[] {
  const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ ...b })).sort((a, b) => b.balance - a.balance);
  const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ ...b, balance: -b.balance })).sort((a, b) => b.balance - a.balance);
  const out: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < creditors.length && j < debtors.length) {
    const amount = Math.min(creditors[i].balance, debtors[j].balance);
    if (amount > 0) out.push({ from: debtors[j].member, to: creditors[i].member, amount });
    creditors[i].balance -= amount;
    debtors[j].balance -= amount;
    if (creditors[i].balance === 0) i++;
    if (debtors[j].balance === 0) j++;
  }
  return out;
}

/** Split an expense amount across members. Throws a message on invalid custom input. */
export function buildAllocations(
  splitType: 'equal' | 'custom_amount' | 'custom_percentage',
  amount: number,
  members: Member[],
  custom: Record<string, number>,
): { member_id: string; amount: number }[] {
  if (splitType === 'equal') {
    const base = Math.floor(amount / members.length);
    const remainder = amount - base * members.length;
    return members.map((m, idx) => ({ member_id: m.id, amount: base + (idx < remainder ? 1 : 0) }));
  }
  if (splitType === 'custom_amount') {
    const total = members.reduce((s, m) => s + (custom[m.id] ?? 0), 0);
    if (total !== amount) throw new Error(`Custom amounts must add up to ${amount} (now ${total}).`);
    return members.map((m) => ({ member_id: m.id, amount: custom[m.id] ?? 0 }));
  }
  const totalPct = members.reduce((s, m) => s + (custom[m.id] ?? 0), 0);
  if (totalPct !== 100) throw new Error(`Custom percentages must add up to 100 (now ${totalPct}).`);
  // Largest-remainder so the split always sums exactly to amount.
  const raw = members.map((m) => ({ member_id: m.id, raw: (amount * (custom[m.id] ?? 0)) / 100 }));
  const floors = raw.map((r) => ({ ...r, amount: Math.floor(r.raw) }));
  let left = amount - floors.reduce((s, f) => s + f.amount, 0);
  const order = [...floors].sort((a, b) => b.raw - Math.floor(b.raw) - (a.raw - Math.floor(a.raw)));
  for (const f of order) {
    if (left <= 0) break;
    f.amount += 1;
    left -= 1;
  }
  return floors.map((f) => ({ member_id: f.member_id, amount: f.amount }));
}

export function makeJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
export function makeToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
