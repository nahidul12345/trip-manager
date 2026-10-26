// Contributions section on trip.html. Runs on its own DOMContentLoaded,
// so it works alongside trip.js. Needs window.TRIP_CTX set by trip.js? No -
// it reads trip id from URL itself, so it also works if trip.js changes.
document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("contribForm");
  if (!form) return; // not on trip page
  const tripId = getQueryId("id");
  const { data: sessionData } = await db.auth.getSession();
  if (!sessionData.session || !tripId) return;

  async function loadMembersForSelect() {
    const { data } = await db.from("trip_members").select("id, profiles(email)").eq("trip_id", tripId).eq("status", "active");
    const sel = document.getElementById("contribMember");
    if (sel && data) {
      sel.innerHTML = data.map((m) => `<option value="${esc(m.id)}">${esc(m.profiles ? m.profiles.email : m.id)}</option>`).join("");
    }
  }
  async function loadList() {
    const { data, error } = await db.from("contributions").select("*, trip_members(profiles(email))")
      .eq("trip_id", tripId).eq("status", "valid").order("occurred_at", { ascending: false });
    const list = document.getElementById("contribList");
    if (!list) return;
    if (error) { list.innerHTML = "<li>" + esc(error.message) + "</li>"; return; }
    if (!data || data.length === 0) { list.innerHTML = "<li>No contributions yet. / এখনো কোনো contribution নেই।</li>"; return; }
    list.innerHTML = data.map((c) => {
      const who = c.trip_members && c.trip_members.profiles ? c.trip_members.profiles.email : "";
      return `<li><span>${esc(who)} - ${esc(c.payment_method)}<br><span class="small">${esc(c.occurred_at || "")} ${esc(c.note || "")} ${esc(c.reference || "")}</span></span><strong>${fmt(c.amount)}</strong></li>`;
    }).join("");
  }

  await loadMembersForSelect();
  await loadList();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const { data: userData } = await db.auth.getUser();
    const amount = parseInt(document.getElementById("contribAmount").value, 10);
    if (!amount || amount <= 0) return showMsg("contribMsg", "Enter a correct amount. / ঠিক amount দিন।", true);
    const { error } = await db.from("contributions").insert({
      trip_id: tripId,
      member_id: document.getElementById("contribMember").value,
      amount,
      occurred_at: document.getElementById("contribDate").value || null,
      payment_method: document.getElementById("contribMethod").value,
      note: document.getElementById("contribNote").value.trim() || null,
      reference: document.getElementById("contribRef").value.trim() || null,
      status: "valid",
      created_by: userData.user.id,
    });
    if (error) return showMsg("contribMsg", error.message, true);
    form.reset();
    await loadList();
    if (window.refreshBalances) window.refreshBalances();
    showMsg("contribMsg", "Contribution added. / Contribution যোগ হয়েছে।", false);
  });
});
