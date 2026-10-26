// Pure money calculations. Amounts are integer Taka (no decimals).
// Used by trip page and by the public share page.

function splitEqual(total, memberIds) {
  // Remainder goes to the first members, so sum == total always.
  const n = memberIds.length;
  if (n === 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return memberIds.map((id, i) => ({ member_id: id, amount: base + (i < rem ? 1 : 0) }));
}

function splitCustomAmount(total, splits) {
  // splits: [{member_id, amount}]
  const sum = splits.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  return { ok: sum === total, sum, allocations: splits };
}

function splitPercentage(total, splits) {
  // splits: [{member_id, percentage}]
  const pctSum = splits.reduce((s, x) => s + (Number(x.percentage) || 0), 0);
  if (pctSum !== 100) return { ok: false, sum: pctSum, allocations: [] };
  // Floor each, then give remainder to first members so sum == total.
  const raw = splits.map((x) => ({ member_id: x.member_id, amount: Math.floor((total * Number(x.percentage)) / 100) }));
  let rem = total - raw.reduce((s, x) => s + x.amount, 0);
  let i = 0;
  while (rem > 0 && raw.length > 0) { raw[i % raw.length].amount += 1; rem--; i++; }
  return { ok: true, sum: 100, allocations: raw };
}

function calculateBalances(members, contributions, expenses, allocations) {
  // members: [{id, email, role}] - id here is trip_members.id
  // contributions: [{member_id, amount}]
  // expenses: [{id, amount, payment_source, payer_member_id}]
  // allocations: [{expense_id, member_id, amount}]
  const byId = {};
  members.forEach((m) => {
    byId[m.id] = { member: m, totalContributions: 0, totalPersonallyPaid: 0, totalAllocated: 0, netBalance: 0 };
  });
  (contributions || []).forEach((c) => { if (byId[c.member_id]) byId[c.member_id].totalContributions += Number(c.amount) || 0; });
  const allocByExpense = {};
  (allocations || []).forEach((a) => {
    if (byId[a.member_id]) byId[a.member_id].totalAllocated += Number(a.amount) || 0;
    (allocByExpense[a.expense_id] = allocByExpense[a.expense_id] || []).push(a);
  });
  let totalGroupFundExpenses = 0, totalPersonalExpenses = 0, totalContributions = 0, groupCash = 0;
  (expenses || []).forEach((e) => {
    const amt = Number(e.amount) || 0;
    if (e.payment_source === "personal") {
      totalPersonalExpenses += amt;
      if (byId[e.payer_member_id]) byId[e.payer_member_id].totalPersonallyPaid += amt;
    } else {
      totalGroupFundExpenses += amt;
    }
  });
  totalContributions = (contributions || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);
  groupCash = totalContributions - totalGroupFundExpenses;
  const memberBalances = Object.values(byId).map((b) => {
    b.netBalance = b.totalContributions + b.totalPersonallyPaid - b.totalAllocated;
    return b;
  });
  const sumNet = memberBalances.reduce((s, b) => s + b.netBalance, 0);
  return {
    memberBalances, totalContributions, totalGroupFundExpenses, totalPersonalExpenses,
    groupCashBalance: groupCash, sumOfMemberBalances: sumNet,
    isReconciled: sumNet === groupCash,
  };
}

function settlementPlan(fin) {
  // Greedy: debtors (net < 0) pay creditors (net > 0), fewest transfers.
  // If group cash remains, it is refunded to creditors first in this simple version.
  const creditors = fin.memberBalances.filter((b) => b.netBalance > 0).map((b) => ({ ...b, left: b.netBalance }));
  const debtors = fin.memberBalances.filter((b) => b.netBalance < 0).map((b) => ({ ...b, left: -b.netBalance }));
  const actions = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].left, debtors[di].left);
    actions.push({ from: debtors[di].member, to: creditors[ci].member, amount: pay });
    creditors[ci].left -= pay; debtors[di].left -= pay;
    if (creditors[ci].left === 0) ci++;
    if (debtors[di].left === 0) di++;
  }
  const remainingCreditors = creditors.filter((c) => c.left > 0);
  const groupRefund = [];
  let cashLeft = fin.groupCashBalance;
  // Group fund surplus (if any) goes to remaining creditors, up to their credit.
  remainingCreditors.forEach((c) => {
    if (cashLeft <= 0) return;
    const pay = Math.min(c.left, cashLeft);
    groupRefund.push({ to: c.member, amount: pay });
    cashLeft -= pay;
  });
  return { actions, groupRefund, cashLeft };
}

function fmt(n) {
  return "৳" + Number(n || 0).toLocaleString("en-US");
}
