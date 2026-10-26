// Login / Signup page logic.
document.addEventListener("DOMContentLoaded", async () => {
  const { data } = await db.auth.getSession();
  if (data.session) {
    // Already logged in: go to role choice, role page decides dashboard.
    window.location.href = "role.html";
    return;
  }

  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");

  document.getElementById("loginBtn").addEventListener("click", async () => {
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || !password) return showMsg("msg", "Email and password are required. / ইমেইল ও পাসওয়ার্ড দিন।", true);
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return showMsg("msg", error.message, true);
    window.location.href = "role.html";
  });

  document.getElementById("signupBtn").addEventListener("click", async () => {
    const email = emailEl.value.trim();
    const password = passEl.value;
    if (!email || password.length < 6) return showMsg("msg", "Enter a valid email and a password of at least 6 characters. / বৈধ ইমেইল ও কমপক্ষে ৬ অক্ষরের পাসওয়ার্ড দিন।", true);
    const { error } = await db.auth.signUp({ email, password });
    if (error) return showMsg("msg", error.message, true);
    showMsg("msg", "Signup done. If email confirmation is required, check your email, then log in. Otherwise click Login again. / সাইনআপ হয়েছে। ইমেইল কনফার্মেশন লাগলে ইমেইল চেক করুন, তারপর লগইন করুন।", false);
  });
});
