const API_BASE = location.hostname.endsWith("loca.lt") ? location.origin : "https://humanities-retirement-pentium-slope.trycloudflare.com";
const sessions = ["6/24 剪映實戰班", "7/1 剪映實戰班"];

let rosterData = { registrations: [] };

function api(path) {
  return `${API_BASE}${path}`;
}

function clean(value) {
  return String(value || "").trim();
}

function isCanceled(reg) {
  return reg.status === "cancelled" || reg.cancelled === true || Boolean(reg.cancelledAt);
}

function setMessage(ok, text) {
  const el = document.getElementById("staffMessage");
  el.className = `message ${ok ? "ok" : "err"}`;
  el.textContent = text;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function currentSession() {
  return document.getElementById("staffSession").value;
}

function renderStats() {
  const stats = document.getElementById("staffStats");
  stats.innerHTML = sessions.map((session) => {
    const regs = (rosterData.registrations || []).filter((item) => item.session === session && !isCanceled(item));
    return `<div class="stat"><strong>${regs.length}</strong><span>${session} 有效報名</span></div>`;
  }).join("");
}

function renderList() {
  const session = currentSession();
  const keyword = clean(document.getElementById("staffSearch").value).toLowerCase();
  const regs = (rosterData.registrations || [])
    .filter((item) => item.session === session && !isCanceled(item))
    .filter((item) => !keyword || String(item.name || "").toLowerCase().includes(keyword));

  document.getElementById("staffList").innerHTML = regs.map((reg, index) => {
    const type = reg.participantType || reg.type || "";
    const name = escapeHtml(reg.name);
    return `
      <article class="staff-row no-action">
        <div>
          <strong>${index + 1}. ${name}</strong>
          <span>${escapeHtml(type || "未填身份")} · 已報名</span>
        </div>
      </article>
    `;
  }).join("") || `<p class="message err">沒有符合的學員。</p>`;
}

function renderRosterData(data, fromFallback = false) {
  rosterData = data;
  renderStats();
  renderList();
  setMessage(true, fromFallback ? "目前顯示備援名單。" : "名單已更新。");
}

async function loadRoster() {
  setMessage(true, "讀取名單中...");
  try {
    const res = await fetch(api("/api/roster"), { cache: "no-store" });
    if (!res.ok) throw new Error("API unavailable");
    renderRosterData(await res.json());
  } catch {
    const fallbackRes = await fetch("./roster-fallback.json", { cache: "no-store" });
    if (!fallbackRes.ok) throw new Error("名單讀取失敗，請稍後再試。");
    renderRosterData(await fallbackRes.json(), true);
  }
}

document.getElementById("staffSession").addEventListener("change", renderList);
document.getElementById("staffSearch").addEventListener("input", renderList);
document.getElementById("staffRefresh").addEventListener("click", () => loadRoster().catch((err) => setMessage(false, err.message)));

loadRoster().catch((err) => setMessage(false, err.message));
