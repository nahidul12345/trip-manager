// Expenses section on trip.html: split equal / custom amount / percentage.
document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("expenseForm");
  if (!form) return;
  const tripId = getQueryId("id");
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session || !tripId) return;
  let members = [];

  async function loadMembers() {
    const { data } = await db.from("trip_members").select("id, profiles(email)").eq("trip_id", tripId).eq("status", "active");
    members = data || [];
    const payerSel = document.getElementById("expensePayer");
    if (payerSel) payerSel.innerHTML = members.map((m) => `<option value="${esc(m.id)}">${esc(m.profiles ? m.profiles.email : m.id)}</option>`).join("");
    renderSplitInputs();
  }

  function selectedIds() {
    return [...document.querySelectorAll(".split-check:checked")].map((c) => c.value);
  }
  function renderSplitInputs() {
    const box = document.getElementById("splitMembers");
    const method = document.getElementById("splitMethod").value;
    if (!box) return;
    box.innerHTML = members.map((m) => {
      const email = m.profiles ? m.profiles.email : m.id;
      let extra = "";
      if (method === "custom_amount") extra = `<input type="number" min="0" class="split-val" data-id="${esc(m.id)}" placeholder="Amount">`;
      if (method === "custom_percentage") extra = `<input type="number" min="0" max="100" class="split-val" data-id="${esc(m.id)}" placeholder="%">`;
      return `<label style="display:flex;gap:8px;align-items:center;"><input type="checkbox" class="split-check" value="${esc(m.id)}" checked style="width:auto;"> ${esc(email)} ${extra}</label>`;
    }).join("");
  }
  const methodSel = document.getElementById("splitMethod");
  if (methodSel) methodSel.addEventListener("change", renderSplitInputs);
  const sourceSel = document.getElementById("expenseSource");
  if (sourceSel) sourceSel.addEventListener("change", () => {
    document.getElementById("payerRow").style.display = sourceSel.value === "personal" ? "block" : "none";
  });

  async function loadList() {
    const { data, error } = await db.from("expenses").select("*, trip_members(profiles(email))")
      .eq("trip_id", tripId).eq("status", "valid").order("occurred_at", { ascending: false });
    const list = document.getElementById("expenseList");
    if (!list) return;
    if (error) { list.innerHTML = "<li>" + esc(error.message) + "</li>"; return; }
    if (!data || data.length === 0) { list.innerHTML = "<li>No expenses yet. / এখনো কোনো expense নেই।</li>"; return; }
    list.innerHTML = data.map((e2) => {
      const payer = e2.trip_members && e2.trip_members.profiles ? e2.trip_members.profiles.email : "";
      return `<li><span><strong>${esc(e2.title)}</strong> (${esc(e2.category)}) - ${esc(e2.payment_source)} ${payer ? "by " + esc(payer) : ""}<br><span class="small">${esc(e2.occurred_at || "")} ${esc(e2.description || "")}</span></span><strong>${fmt(e2.amount)}</strong></li>`;
    }).join("");
  }

  await loadMembers();
  await loadList();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { data: userData } = await db.auth.getUser();
    const amount = parseInt(document.getElementById("expenseAmount").value, 10);
    const method = methodSel.value;
    const ids = selectedIds();
    if (!amount || amount <= 0) return showMsg("expenseMsg", "Enter a correct amount. / ঠিক amount দিন।", true);
    if (ids.length === 0) return showMsg("expenseMsg", "Select at least one member. / অন্তত একজন মেম্বার সিলেক্ট করুন।", true);

    let allocations;
    if (method === "equal") {
      allocations = splitEqual(amount, ids);
    } else if (method === "custom_amount") {
      const splits = [...document.querySelectorAll(".split-val")].filter((i) => ids.includes(i.dataset.id))
        .map((i) => ({ member_id: i.dataset.id, amount: parseInt(i.value || "0", 10) }));
      const r = splitCustomAmount(amount, splits);
      if (!r.ok) return showMsg("expenseMsg", "Custom amounts must total the expense amount. Total now: / Custom amount-এর যোগফল মোট খরচের সমান হতে হবে। যোগফল: " + r.sum, true);
      allocations = r.allocations;
    } else {
      const splits = [...document.querySelectorAll(".split-val")].filter((i) => ids.includes(i.dataset.id))
        .map((i) => ({ member_id: i.dataset.id, percentage: parseFloat(i.value || "0") }));
      const r = splitPercentage(amount, splits);
      if (!r.ok) return showMsg("expenseMsg", "Percentages must total 100. Now: / Percentage-এর যোগফল ১০০ হতে হবে। এখন: " + r.sum, true);
      allocations = r.allocations;
    }

    const source = sourceSel.value;
    const { data: expense, error } = await db.from("expenses").insert({
      trip_id: tripId,
      title: document.getElementById("expenseTitle").value.trim(),
      category: document.getElementById("expenseCategory").value,
      amount,
      payment_source: source,
      payer_member_id: source === "personal" ? document.getElementById("expensePayer").value : null,
      occurred_at: document.getElementById("expenseDate").value || null,
      description: document.getElementById("expenseDesc").value.trim() || null,
      status: "valid",
      created_by: userData.user.id,
    }).select().single();
    if (error) return showMsg("expenseMsg", error.message, true);

    const { error: aErr } = await db.from("expense_allocations").insert(
      allocations.map((a) => ({ expense_id: expense.id, member_id: a.member_id, amount: a.amount }))
    );
    if (aErr) return showMsg("expenseMsg", "Expense saved, but there was a problem with allocation: / Expense হয়েছে, কিন্তু allocation-এ সমস্যা: " + aErr.message, true);
    form.reset();
    renderSplitInputs();
    await loadList();
    if (window.refreshBalances) window.refreshBalances();
    showMsg("expenseMsg", "Expense added. / Expense যোগ হয়েছে।", false);
  });
});
