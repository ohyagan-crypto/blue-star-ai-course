const API_BASE = location.hostname.endsWith("loca.lt") ? location.origin : "https://3454460dc812b626-203-217-101-116.serveousercontent.com";
const sessions = ["7/6 台南場","7/7 高雄場","7/9 台北場","7/11 台中場"];

let rosterData = { registrations: [], checkins: [] };

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

function getPin() {
  return clean(document.getElementById("staffPin").value);
}

function clearPin() {
  localStorage.removeItem("blueCourseStaffPin");
  document.getElementById("staffPin").value = "";
}

function checkedNames(session) {
  return new Set((rosterData.checkins || []).filter((item) => item.session === session).map((item) => item.name));
}

function renderStats() {
  const stats = document.getElementById("staffStats");
  stats.innerHTML = sessions.map((session) => {
    const regs = (rosterData.registrations || []).filter((item) => item.session === session && !isCanceled(item));
    const checked = checkedNames(session);
    const checkedIn = regs.filter((reg) => checked.has(reg.name)).length;
    return `<div class="stat"><strong>${checkedIn}/${regs.length}</strong><span>${session}</span></div>`;
  }).join("");
}

function renderList() {
  const session = currentSession();
  const keyword = clean(document.getElementById("staffSearch").value).toLowerCase();
  const checked = checkedNames(session);
  const regs = (rosterData.registrations || [])
    .filter((item) => item.session === session && !isCanceled(item))
    .filter((item) => !keyword || String(item.name || "").toLowerCase().includes(keyword));

  document.getElementById("staffList").innerHTML = regs.map((reg, index) => {
    const done = checked.has(reg.name);
    const type = reg.participantType || reg.type || "";
    const name = escapeHtml(reg.name);
    return `
      <article class="staff-row ${done ? "done" : ""}">
        <div>
          <strong>${index + 1}. ${name}</strong>
          <span>${escapeHtml(type || "未填身分")}${done ? " · 已報到" : " · 未報到"}</span>
        </div>
        <button type="button" data-name="${name}" ${done ? "disabled" : ""}>${done ? "已報到" : "報到"}</button>
      </article>
    `;
  }).join("") || `<p class="message err">沒有符合的學員。</p>`;
}

async function loadRoster() {
  setMessage(true, "讀取名單中...");
  const res = await fetch(api("/api/roster"), { cache: "no-store" });
  if (!res.ok) throw new Error("名單讀取失敗，請稍後再試。");
  rosterData = await res.json();
  renderStats();
  renderList();
  setMessage(true, "名單已更新。");
}

async function checkIn(name, button) {
  const pin = getPin();
  if (!pin) {
    setMessage(false, "請先輸入 PIN。");
    document.getElementById("staffPin").focus();
    return;
  }

  button.disabled = true;
  button.textContent = "簽到中...";
  try {
    const res = await fetch(api("/api/checkin"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, session: currentSession(), name })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) throw new Error(body.message || "簽到失敗，請稍後再試。");
    setMessage(true, `${name} 報到成功。`);
    clearPin();
    await loadRoster();
  } catch (err) {
    setMessage(false, err.message);
    button.disabled = false;
    button.textContent = "報到";
  }
}

clearPin();
document.getElementById("staffSession").addEventListener("change", renderList);
document.getElementById("staffSearch").addEventListener("input", renderList);
document.getElementById("staffRefresh").addEventListener("click", () => loadRoster().catch((err) => setMessage(false, err.message)));
document.getElementById("staffList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-name]");
  if (!button) return;
  checkIn(button.dataset.name, button);
});

loadRoster().catch((err) => setMessage(false, err.message));

