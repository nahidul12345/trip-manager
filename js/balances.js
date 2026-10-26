// Balances + Settlement + CSV export on trip.html.
window.refreshBalances = async function () {
  const tripId = getQueryId("id");
  const balanceBox = document.getElementById("balanceList");
  if (!tripId || !balanceBox) return;
  const [{ data: members }, { data: contribs }, { data: expenses }, { data: allocs }] = await Promise.all([
    db.from("trip_members").select("id, profiles(email)").eq("trip_id", tripId).eq("status", "active"),
    db.from("contributions").select("member_id, amount").eq("trip_id", tripId).eq("status", "valid"),
    db.from("expenses").select("id, amount, payment_source, payer_member_id").eq("trip_id", tripId).eq("status", "valid"),
    db.from("expense_allocations").select("expense_id, member_id, amount"),
  ]);
  // Allocations query above has no trip filter in SQL, so filter in JS by expense ids.
  const expenseIds = new Set((expenses || []).map((e) => e.id));
  const filteredAllocs = (allocs || []).filter((a) => expenseIds.has(a.expense_id));
  const memberList = (members || []).map((m) => ({ id: m.id, email: m.profiles ? m.profiles.email : m.id }));
  const fin = calculateBalances(memberList, contribs || [], expenses || [], filteredAllocs);
  window._lastFin = { fin, memberList, contribs, expenses, filteredAllocs };

  balanceBox.innerHTML = `
    <p>Total Contribution: <strong>${fmt(fin.totalContributions)}</strong> |
    Group Fund Expense: <strong>${fmt(fin.totalGroupFundExpenses)}</strong> |
    Group Cash: <strong>${fmt(fin.groupCashBalance)}</strong> |
    Reconciled: <strong>${fin.isReconciled ? "Yes" : "No - check data"}</strong></p>
    <ul class="list">${fin.memberBalances.map((b) => `
      <li><span>${esc(b.member.email)}<br><span class="small">Contrib ${fmt(b.totalContributions)} | Personal ${fmt(b.totalPersonallyPaid)} | Share ${fmt(b.totalAllocated)}</span></span>
      <strong>${b.netBalance >= 0 ? "পাবে / Will receive " : "দেবে / Owes "}${fmt(Math.abs(b.netBalance))}</strong></li>`).join("")}</ul>`;

  const plan = settlementPlan(fin);
  const settleBox = document.getElementById("settlementList");
  if (settleBox) {
    const lines = [];
    plan.actions.forEach((a) => lines.push(`<li>${esc(a.from.email)} → ${esc(a.to.email)} : <strong>${fmt(a.amount)}</strong></li>`));
    plan.groupRefund.forEach((r) => lines.push(`<li>Group Fund theke ${esc(r.to.email)} ke refund: <strong>${fmt(r.amount)}</strong></li>`));
    settleBox.innerHTML = lines.length ? lines.join("") : "<li>Nothing to settle - all accounts match. / সেটেল করার কিছু নেই - সব হিসাব মিলেছে।</li>";
  }
};

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("balanceList")) return;
  const { data: s } = await db.auth.getSession();
  if (!s.session) return;
  await window.refreshBalances();
  const csvBtn = document.getElementById("csvBtn");
  if (csvBtn) csvBtn.addEventListener("click", () => {
    const last = window._lastFin;
    if (!last) return;
    const rows = [["Member", "Contributions", "Personally Paid", "Allocated", "Net Balance"]];
    last.fin.memberBalances.forEach((b) => rows.push([b.member.email, b.totalContributions, b.totalPersonallyPaid, b.totalAllocated, b.netBalance]));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "trip-report.csv";
    a.click();
  });
});
