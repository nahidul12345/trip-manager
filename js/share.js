// Share link generation on trip.html (Manager only).
document.addEventListener("DOMContentLoaded", async () => {
  const btn = document.getElementById("shareBtn");
  if (!btn) return;
  const tripId = getQueryId("id");
  const { data: s } = await db.auth.getSession();
  if (!s.session || !tripId) return;
  const { data: userData } = await db.auth.getUser();

  btn.addEventListener("click", async () => {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await db.from("trip_share_links").insert({
      trip_id: tripId, token, expires_at: expires, created_by: userData.user.id,
    });
    if (error) return showMsg("shareMsg", error.message, true);
    const url = window.location.origin + window.location.pathname.replace("trip.html", "share.html") + "?token=" + token;
    document.getElementById("shareLink").innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a><p class="small">Link 30 din por expire hobe. / This link expires after 30 days. Revoke korte chaile Supabase table-e revoked_at set koro. / To revoke, set revoked_at in the Supabase table.</p>`;
    showMsg("shareMsg", "Share link created. / Share link তৈরি হয়েছে।", false);
  });
});
