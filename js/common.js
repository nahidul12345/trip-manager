// Shared helpers: session check, messages, logout, safe text output.
function showMsg(id, text, isError) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = isError ? "msg error" : "msg ok";
}

function esc(s) {
  return String(s == null ? "" : s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function requireUser() {
  const { data } = await db.auth.getUser();
  if (!data.user) {
    window.location.href = "auth.html";
    return null;
  }
  return data.user;
}

async function logout() {
  await db.auth.signOut();
  window.location.href = "auth.html";
}

function makeJoinCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function getQueryId(name) {
  return new URLSearchParams(window.location.search).get(name);
}
