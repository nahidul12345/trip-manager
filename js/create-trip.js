// Create Trip: only a logged-in user can create. Creator becomes Manager.
// Join Code is created here in DB, but NOT shown on this page.
// It is shown on trip.html, when the Manager opens the trip.
document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireUser();
  if (!user) return;

  document.getElementById("createBtn").addEventListener("click", async () => {
    const name = document.getElementById("name").value.trim();
    const location = document.getElementById("location").value.trim();
    const start_date = document.getElementById("start").value || null;
    const end_date = document.getElementById("end").value || null;
    const currency = document.getElementById("currency").value.trim() || "BDT";
    if (!name) return showMsg("msg", "Enter a trip name. / ট্রিপের নাম দিন।", true);

    const { data: trip, error } = await db.from("trips").insert({
      owner_id: user.id, name, location, start_date, end_date, currency, status: "active",
    }).select().single();
    if (error) return showMsg("msg", error.message, true);

    const { error: mErr } = await db.from("trip_members").insert({
      trip_id: trip.id, user_id: user.id, role: "manager", status: "active",
    });
    if (mErr) return showMsg("msg", mErr.message, true);

    // Create a join code, retry once if code already exists.
    for (let i = 0; i < 3; i++) {
      const { error: cErr } = await db.from("trip_join_codes").insert({
        trip_id: trip.id, code: makeJoinCode(), created_by: user.id, is_active: true,
      });
      if (!cErr) break;
      if (i === 2) return showMsg("msg", "Trip created, but there was a problem creating the Join Code: / ট্রিপ হয়েছে, কিন্তু Join Code বানাতে সমস্যা: " + cErr.message, true);
    }

    // Go to trip page - code will be shown there to Managers only.
    window.location.href = "trip.html?id=" + trip.id;
  });
});
