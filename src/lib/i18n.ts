export type Lang = 'bn' | 'en';
export const LANG_KEY = 'ftm_lang';

const dict = {
  appTitle: { bn: 'Friends Trip Manager', en: 'Friends Trip Manager' },
  heroSubtitle: { bn: 'তোমার গ্রুপ ট্রিপের খরচ ম্যানেজ করো', en: 'Manage your group trip finances' },
  signinTitle: { bn: 'তোমার অ্যাকাউন্টে লগইন করো', en: 'Sign in to your account' },
  loginDesc: { bn: 'লগইন করুন অথবা নতুন অ্যাকাউন্ট খুলুন। সাইনআপের পর Manager / Member বেছে নিতে হবে।', en: 'Log in or create a new account. After signup, choose Manager / Member.' },
  email: { bn: 'ইমেইল', en: 'Email' },
  password: { bn: 'পাসওয়ার্ড', en: 'Password' },
  login: { bn: 'লগইন', en: 'Login' },
  signup: { bn: 'সাইনআপ', en: 'Signup' },
  logout: { bn: 'লগআউট', en: 'Logout' },
  dashboard: { bn: 'ড্যাশবোর্ড', en: 'Dashboard' },
  myTrips: { bn: 'আমার ট্রিপগুলো', en: 'My Trips' },
  createTrip: { bn: 'ট্রিপ বানান (Manager)', en: 'Create Trip (Manager)' },
  joinTrip: { bn: 'ট্রিপে জয়েন করুন (Member)', en: 'Join Trip (Member)' },
  roleTitle: { bn: 'আপনি কী হিসেবে শুরু করতে চান?', en: 'How do you want to start?' },
  manager: { bn: 'ম্যানেজার', en: 'Manager' },
  member: { bn: 'গ্রুপ মেম্বার', en: 'Group Member' },
  managerDesc: { bn: 'ট্রিপ বানাবেন, মেম্বার যোগ/রিমুভ করবেন, সব contribution/expense ম্যানেজ করবেন।', en: 'Create trips, add/remove members, manage all contributions and expenses.' },
  memberDesc: { bn: 'Manager-এর দেওয়া Join Code দিয়ে কোনো ট্রিপে জয়েন করবেন। শুধু ওই ট্রিপটাই দেখতে পারবেন।', en: 'Join a trip with the Manager\u2019s Join Code. You will only see that trip.' },
  iAmManager: { bn: 'আমি Manager', en: 'I am a Manager' },
  iAmMember: { bn: 'আমি Group Member', en: 'I am a Group Member' },
  loading: { bn: 'লোড হচ্ছে...', en: 'Loading...' },
  members: { bn: 'মেম্বাররা', en: 'Members' },
  contributions: { bn: 'Contribution', en: 'Contributions' },
  expenses: { bn: 'Expense', en: 'Expenses' },
  balance: { bn: 'ব্যালান্স', en: 'Balance' },
  settlement: { bn: 'Settlement - কে কাকে কত দেবে', en: 'Settlement - Who pays whom' },
  share: { bn: 'শেয়ার লিংক (শুধু Manager)', en: 'Share Link (Manager only)' },
  leave: { bn: 'গ্রুপ থেকে বের হয়ে যান', en: 'Leave Group' },
  archive: { bn: 'ট্রিপ আর্কাইভ করুন (শুধু Manager)', en: 'Archive Trip (Manager only)' },
  backDashboard: { bn: 'ড্যাশবোর্ডে ফিরুন', en: 'Back to Dashboard' },
} as const;

export type DictKey = keyof typeof dict;
export function t(lang: Lang, key: DictKey): string {
  return dict[key][lang];
}
export function getSavedLang(): Lang {
  const saved = localStorage.getItem(LANG_KEY);
  return saved === 'en' ? 'en' : 'bn';
}
