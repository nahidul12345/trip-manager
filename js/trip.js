// Trip page: members, join code (manager only), promote, change manager, leave, archive.
document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireUser();
  if (!user) return;
  const tripId = getQueryId("id");
  if (!tripId) { window.location.href = "dashboard.html"; return; }

  const { data: membership, error: memErr } = await db.from("trip_members")
    .select("role").eq("trip_id", tripId).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (memErr || !membership) {
    showMsg("msg", "You do not have access to this trip. Join from the Dashboard. / এই ট্রিপে আপনার access নেই। ড্যাশবোর্ড থেকে জয়েন করুন।", true);
    document.getElementById("tripName").textContent = "No access / Access নেই";
    return;
  }
  const myRole = membership.role;
  document.getElementById("myRole").textContent = myRole;
  const isManager = myRole === "manager";

  const { data: trip } = await db.from("trips").select("*").eq("id", tripId).single();
  if (trip) {
    document.getElementById("tripName").textContent = trip.name;
    document.getElementById("tripMeta").textContent =
      (trip.location || "") + " | " + (trip.start_date || "") + " to " + (trip.end_date || "") + " | " + (trip.currency || "BDT") + " | " + trip.status;
  }

  if (isManager) {
    const { data: codeRow } = await db.from("trip_join_codes")
      .select("code").eq("trip_id", tripId).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (codeRow) {
      document.getElementById("codeCard").style.display = "block";
      document.getElementById("joinCode").textContent = codeRow.code;
    }
  } else {
    document.getElementById("archiveBtn").style.display = "none";
    const shareCard = document.getElementById("shareCard");
    if (shareCard) shareCard.style.display = "none";
  }

  async function loadMembers() {
    const { data: members, error } = await db.from("trip_members")
      .select("user_id, role, status, profiles(email)")
      .eq("trip_id", tripId).eq("status", "active").order("joined_at");
    const list = document.getElementById("memberList");
    if (error) { list.innerHTML = "<li>" + esc(error.message) + "</li>"; return; }
    list.innerHTML = (members || []).map((m) => {
      const email = m.profiles ? m.profiles.email : m.user_id;
      const promoteBtn = (isManager && m.role === "member")
        ? `<button class="secondary" data-promote="${esc(m.user_id)}">Make Manager</button>` : "";
      return `<li><span>${esc(email)} <span class="badge">${esc(m.role)}</span></span><span>${promoteBtn}</span></li>`;
    }).join("") || "<li>No members. / কোনো মেম্বার নেই।</li>";

    list.querySelectorAll("[data-promote]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Ei member ke Manager banabe? Tokhon tumi Group Member hoye jabe, ar Manager option gulo ar dekhabe na.")) return;
        // 1) Promote the selected member first, so trip never has zero managers.
        const { error: pErr } = await db.from("trip_members").update({ role: "manager" })
          .eq("trip_id", tripId).eq("user_id", btn.dataset.promote);
        if (pErr) return showMsg("msg", pErr.message, true);
        // 2) Demote current user to member.
        const { error: dErr } = await db.from("trip_members").update({ role: "member" })
          .eq("trip_id", tripId).eq("user_id", user.id);
        if (dErr) return showMsg("msg", dErr.message, true);
        window.location.reload();
      });
    });
  }
  await loadMembers();

  document.getElementById("leaveBtn").addEventListener("click", async () => {
    if (isManager) {
      const { count } = await db.from("trip_members")
        .select("*", { count: "exact", head: true })
        .eq("trip_id", tripId).eq("role", "manager").eq("status", "active");
      if (count <= 1) {
        showMsg("msg", "You are the only Manager. Promote someone to Manager first, then you can leave as a Member. / আপনি একমাত্র Manager। আগে কাউকে Manager বানান, তারপর Member হয়ে বের হতে পারবেন।", true);
        return;
      }
    }
    if (!confirm("Are you sure you want to leave this group? / আপনি কি সত্যিই এই গ্রুপ থেকে বের হতে চান?")) return;
    const { error } = await db.from("trip_members").update({ status: "inactive" })
      .eq("trip_id", tripId).eq("user_id", user.id);
    if (error) return showMsg("msg", error.message, true);
    window.location.href = "dashboard.html";
  });

  document.getElementById("archiveBtn").addEventListener("click", async () => {
    if (!isManager) return;
    const { error } = await db.from("trips").update({ status: "archived" }).eq("id", tripId);
    if (error) return showMsg("msg", error.message, true);
    window.location.reload();
  });
});
