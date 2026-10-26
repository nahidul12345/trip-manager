// Join Trip by code. Member joins under the Manager's trip.
document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireUser();
  if (!user) return;

  document.getElementById("joinBtn").addEventListener("click", async () => {
    const code = document.getElementById("code").value.trim().toUpperCase();
    if (!code) return showMsg("msg", "Enter the Join Code. / Join Code দিন।", true);

    const { data: codeRow, error } = await db.from("trip_join_codes")
      .select("trip_id").eq("code", code).eq("is_active", true).maybeSingle();
    if (error) return showMsg("msg", error.message, true);
    if (!codeRow) return showMsg("msg", "Code is incorrect or not active. Ask the Manager to check the code again. / কোড ঠিক না, বা কোড active না। Manager-কে আবার কোডটা চেক করতে বলুন।", true);

    const { error: mErr } = await db.from("trip_members").upsert({
      trip_id: codeRow.trip_id, user_id: user.id, role: "member", status: "active",
    }, { onConflict: "trip_id,user_id" });
    if (mErr) return showMsg("msg", mErr.message, true);

    window.location.href = "trip.html?id=" + codeRow.trip_id;
  });
});
