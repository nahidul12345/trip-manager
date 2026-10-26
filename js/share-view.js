// Public read-only share view. Calls the get_shared_trip RPC, no login needed.
document.addEventListener("DOMContentLoaded", async () => {
  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) { showMsg("msg", "No share token. Open the link given by the Manager correctly. / Share token নেই। Manager-এর দেওয়া লিংকটি ঠিকমতো খুলুন।", true); return; }
  const { data, error } = await db.rpc("get_shared_trip", { p_token: token });
  if (error) { showMsg("msg", error.message, true); return; }
  if (!data || data.error) { showMsg("msg", "This link is invalid or expired. / এই লিংকটি invalid বা expire হয়ে গেছে।", true); return; }

  document.getElementById("detailCard").style.display = "block";
  document.getElementById("tripName").textContent = data.trip.name;
  const members = (data.members || []).map((m) => ({ id: m.id, email: m.email }));
  // RPC members use trip_members.id? It returns tm.id as id, good for balances.
  // Contributions/expenses in RPC use member_id = trip_members.id as well.
  const fin = calculateBalances(members, data.contributions || [], data.expenses || [], data.allocations || []);
  document.getElementById("balanceList").innerHTML = `
    <p>Total Contribution: <strong>${fmt(fin.totalContributions)}</strong> | Group Cash: <strong>${fmt(fin.groupCashBalance)}</strong></p>
    <ul class="list">${fin.memberBalances.map((b) => `<li><span>${esc(b.member.email)}</span><strong>${b.netBalance >= 0 ? "পাবে / Will receive " : "দেবে / Owes "}${fmt(Math.abs(b.netBalance))}</strong></li>`).join("")}</ul>`;
  const plan = settlementPlan(fin);
  document.getElementById("settlementList").innerHTML =
    plan.actions.map((a) => `<li>${esc(a.from.email)} → ${esc(a.to.email)} : <strong>${fmt(a.amount)}</strong></li>`).join("") || "<li>Nothing to settle. / সেটেল করার কিছু নেই।</li>";
  document.getElementById("contribList").innerHTML = (data.contributions || []).map((c) => `<li><span>${esc(c.payment_method)} - ${esc(c.occurred_at || "")}</span><strong>${fmt(c.amount)}</strong></li>`).join("") || "<li>Nai.</li>";
  document.getElementById("expenseList").innerHTML = (data.expenses || []).map((e) => `<li><span><strong>${esc(e.title)}</strong> (${esc(e.category)})</span><strong>${fmt(e.amount)}</strong></li>`).join("") || "<li>Nai.</li>";
});
