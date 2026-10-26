// Language selector: Bangla (bn) or English (en).
// Usage: add data-i18n="key" to an element. Its text will be replaced
// with the translation for the selected language. Default: Bangla.
// Choice is saved in localStorage as ftm_lang, so it persists across pages.
// Elements without data-i18n keep their original text (bilingual labels
// in forms are left as-is, so nothing breaks if a key is missing).
const I18N = {
  bn: {
    app_title: "Friends Trip Manager",
    hero_subtitle: "তোমার গ্রুপ ট্রিপের খরচ ম্যানেজ করো",
    login_desc: "লগইন করুন অথবা নতুন অ্যাকাউন্ট খুলুন। সাইনআপের পর Manager / Member বেছে নিতে হবে।",
    email_label: "ইমেইল",
    password_label: "পাসওয়ার্ড",
    login_btn: "লগইন",
    signup_btn: "সাইনআপ",
    role_title: "আপনি কী হিসেবে শুরু করতে চান?",
    manager_title: "ম্যানেজার",
    manager_desc: "ট্রিপ বানাবেন, মেম্বার যোগ/রিমুভ করবেন, সব contribution/expense ম্যানেজ করবেন।",
    manager_btn: "আমি Manager",
    member_title: "গ্রুপ মেম্বার",
    member_desc: "Manager-এর দেওয়া Join Code দিয়ে কোনো ট্রিপে জয়েন করবেন। শুধু ওই ট্রিপটাই দেখতে পারবেন।",
    member_btn: "আমি Group Member",
    dashboard_title: "ড্যাশবোর্ড",
    my_trips: "আমার ট্রিপগুলো",
    create_trip_btn: "ট্রিপ বানান (Manager)",
    join_trip_btn: "ট্রিপে জয়েন করুন (Member)",
    role_change_btn: "রোল পরিবর্তন করুন",
    create_trip_title: "ট্রিপ বানান",
    create_trip_desc: "ট্রিপ বানানোর সময় Join Code দেখানো হবে না। ট্রিপ বানানোর পর ট্রিপ পেজে ঢুকলে Manager Join Code দেখতে পাবেন।",
    trip_name_label: "ট্রিপের নাম *",
    location_label: "জায়গা",
    start_label: "শুরুর তারিখ",
    end_label: "শেষের তারিখ",
    currency_label: "মুদ্রা",
    create_btn: "ট্রিপ বানান",
    back_dashboard: "ড্যাশবোর্ডে ফিরুন",
    join_trip_title: "ট্রিপে জয়েন করুন",
    join_trip_desc: "Manager-এর দেওয়া Join Code দিন। কোড ঠিক হলে ওই ট্রিপে Group Member হিসেবে জয়েন হবেন।",
    join_code_label: "জয়েন কোড",
    join_btn: "জয়েন করুন",
    members_title: "মেম্বাররা",
    contrib_title: "Contribution যোগ করুন (টাকা জমা)",
    expense_title: "Expense যোগ করুন",
    balance_title: "ব্যালান্স",
    settlement_title: "Settlement - কে কাকে কত দেবে",
    share_title: "শেয়ার লিংক (শুধু Manager)",
    actions_title: "কাজ",
    leave_btn: "গ্রুপ থেকে বের হয়ে যান",
    archive_btn: "ট্রিপ আর্কাইভ করুন (শুধু Manager)",
    logout_btn: "লগআউট",
    loading: "লোড হচ্ছে...",
    my_role: "আমার রোল",
    join_code_title: "জয়েন কোড (শুধু Manager)",
    add_contrib_btn: "জমা যোগ করুন",
    add_expense_btn: "খরচ যোগ করুন",
    csv_btn: "CSV রিপোর্ট ডাউনলোড",
    create_share_btn: "শেয়ার লিংক বানান"
  },
  en: {
    app_title: "Friends Trip Manager",
    hero_subtitle: "Manage your group trip finances",
    login_desc: "Log in or create a new account. After signup, choose Manager / Member.",
    email_label: "Email",
    password_label: "Password",
    login_btn: "Login",
    signup_btn: "Signup",
    role_title: "How do you want to start?",
    manager_title: "Manager",
    member_title: "Group Member",
    manager_desc: "Create trips, add/remove members, manage all contributions and expenses.",
    manager_btn: "I am a Manager",
    member_desc: "Join a trip with the Manager's Join Code. You will only see that trip.",
    member_btn: "I am a Group Member",
    dashboard_title: "Dashboard",
    my_trips: "My Trips",
    create_trip_btn: "Create Trip (Manager)",
    join_trip_btn: "Join Trip (Member)",
    role_change_btn: "Change Role",
    create_trip_title: "Create Trip",
    create_trip_desc: "The Join Code is not shown at creation time. After creating the trip, the Manager will see it on the trip page.",
    trip_name_label: "Trip Name *",
    location_label: "Location",
    start_label: "Start Date",
    end_label: "End Date",
    currency_label: "Currency",
    create_btn: "Create Trip",
    back_dashboard: "Back to Dashboard",
    join_trip_title: "Join Trip",
    join_trip_desc: "Enter the Join Code given by the Manager. If the code is correct, you will join that trip as a Group Member.",
    join_code_label: "Join Code",
    join_btn: "Join",
    members_title: "Members",
    contrib_title: "Add Contribution",
    expense_title: "Add Expense",
    balance_title: "Balance",
    settlement_title: "Settlement - Who pays whom",
    share_title: "Share Link (Manager only)",
    actions_title: "Actions",
    leave_btn: "Leave Group",
    archive_btn: "Archive Trip (Manager only)",
    logout_btn: "Logout",
    loading: "Loading...",
    my_role: "My role",
    join_code_title: "Join Code (Manager only)",
    add_contrib_btn: "Add Contribution",
    add_expense_btn: "Add Expense",
    csv_btn: "Download CSV Report",
    create_share_btn: "Create Share Link"
  }
};

function getLang() {
  const saved = localStorage.getItem("ftm_lang");
  return saved === "en" || saved === "bn" ? saved : "bn";
}
function setLang(lang) {
  localStorage.setItem("ftm_lang", lang);
  applyLang(lang);
}
function applyLang(lang) {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (I18N[lang] && I18N[lang][key]) el.textContent = I18N[lang][key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (I18N[lang] && I18N[lang][key]) el.placeholder = I18N[lang][key];
  });
  const sel = document.getElementById("langSelect");
  if (sel) sel.value = lang;
}
// Inject a language selector if the page does not have one yet.
function injectLangSelect() {
  if (document.getElementById("langSelect")) return;
  const sel = document.createElement("select");
  sel.id = "langSelect";
  sel.className = "lang-select";
  sel.innerHTML = '<option value="bn">বাংলা</option><option value="en">English</option>';
  sel.addEventListener("change", () => setLang(sel.value));
  const topbar = document.querySelector(".topbar");
  if (topbar) { topbar.appendChild(sel); return; }
  const firstCard = document.querySelector(".card");
  if (firstCard) firstCard.prepend(sel);
}
document.addEventListener("DOMContentLoaded", () => {
  injectLangSelect();
  applyLang(getLang());
});
