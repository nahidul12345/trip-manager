// Role choice after signup/login. Saves preferred_role in profiles.
// A user can later still create their own trip as Manager, or join as Member.
document.addEventListener("DOMContentLoaded", async () => {
  const user = await requireUser();
  if (!user) return;
  document.getElementById("userLine").textContent = "Logged in: " + user.email;

  async function choose(role) {
    const { error } = await db.from("profiles").upsert({
      id: user.id,
      email: user.email,
      preferred_role: role,
    }, { onConflict: "id" });
    if (error) return showMsg("msg", "Problem saving role: / রোল সেভ করতে সমস্যা: " + error.message, true);
    window.location.href = "dashboard.html";
  }

  document.getElementById("managerBtn").addEventListener("click", () => choose("manager"));
  document.getElementById("memberBtn").addEventListener("click", () => choose("member"));
});
