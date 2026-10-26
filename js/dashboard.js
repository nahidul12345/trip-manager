// Dashboard: show preferred role and trips where user is a member.
document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireUser();
  if (!user) return;
  document.getElementById("userLine").textContent = "Logged in: " + user.email;

  const { data: profile } = await db.from("profiles").select("preferred_role").eq("id", user.id).maybeSingle();
  if (!profile || !profile.preferred_role) {
    window.location.href = "role.html";
    return;
  }
  document.getElementById("roleBadge").textContent = "Starting role: " + profile.preferred_role;

  const { data: memberships, error } = await db
    .from("trip_members")
    .select("role, trips(id, name, location, start_date, end_date, currency, status)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at", { ascending: false });

  const list = document.getElementById("tripList");
  if (error) {
    list.innerHTML = "<li>" + esc(error.message) + "</li>";
    return;
  }
  if (!memberships || memberships.length === 0) {
    list.innerHTML = "<li>You have not joined any trip yet. As a Manager, create a trip. As a Member, join with a Join Code. / আপনি এখনো কোনো ট্রিপে জয়েন করেননি। Manager হলে ট্রিপ বানান, Member হলে Join Code দিয়ে জয়েন করুন।</li>";
    return;
  }
  list.innerHTML = memberships.map((m) => {
    const t = m.trips;
    if (!t) return "";
    return `<li><span><strong>${esc(t.name)}</strong> <span class="badge">${esc(m.role)}</span><br><span class="small">${esc(t.location || "")} | ${esc(t.start_date || "")} to ${esc(t.end_date || "")} | ${esc(t.currency || "BDT")}</span></span><a class="btn" href="trip.html?id=${esc(t.id)}">Open</a></li>`;
  }).join("");
});
