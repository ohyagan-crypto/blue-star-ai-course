const DEFAULT_API_BASE = location.hostname.endsWith("loca.lt") ? location.origin : "https://course-api.lanxingapi.com";
const API_REQUEST_TIMEOUT_MS = 12000;
const PIN_STORAGE_KEY = "blueCourseStaffPin";
let activeApiBase = DEFAULT_API_BASE;
let apiBases = [DEFAULT_API_BASE];
const sessions = ["11/16 台南場","11/17 高雄場","11/19 台北場","11/21 台中場"];
const sessionLabels = {
  "11/16 台南場": "11/16（一）台南場",
  "11/17 高雄場": "11/17（二）高雄場",
  "11/19 台北場": "11/19（四）台北場",
  "11/21 台中場": "11/21（六）台中場"
};
const MAX_CAPACITY = 999;

let rosterData = { registrations: [], checkins: [] };
const capacityBusySessions = new Set();
const capacityDrafts = new Map();

function normalizeApiBase(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

async function loadApiConfig() {
  if (location.hostname.endsWith("loca.lt")) return;
  try {
    const res = await fetch(`./api-config.json?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("api config unavailable");
    const config = await res.json();
    const candidates = [
      config.publicBase,
      ...(Array.isArray(config.publicBases) ? config.publicBases : []),
      DEFAULT_API_BASE
    ].map(normalizeApiBase).filter(Boolean);
    apiBases = [...new Set(candidates)];
    activeApiBase = apiBases[0] || DEFAULT_API_BASE;
  } catch {
    apiBases = [DEFAULT_API_BASE];
    activeApiBase = DEFAULT_API_BASE;
  }
}

const apiConfigReady = loadApiConfig();

function api(path, base = activeApiBase) {
  return `${base}${path}`;
}

async function fetchWithApiFallback(path, options = {}) {
  await apiConfigReady;
  let lastError = null;
  for (const base of apiBases) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(api(path, base), { ...options, signal: controller.signal });
      activeApiBase = base;
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastError = new Error(`API ${res.status}`);
    } catch (err) {
      lastError = err;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
  throw lastError || new Error("API unavailable");
}

function clean(value) {
  return String(value || "").trim();
}

function isCanceled(reg) {
  return reg.status === "cancelled" || reg.status === "replaced" || reg.cancelled === true || Boolean(reg.cancelledAt);
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

function participantDetails(reg) {
  const rawType = String(reg?.participantType || reg?.type || "").trim();
  const type = rawType.includes("新人") ? "新人" : /複訓|復訓/.test(rawType) ? "複訓" : "未填身分";
  if (type !== "新人") return type;
  const introducer = clean(reg?.introducer);
  return introducer ? `新人｜推薦人：${introducer}` : "新人";
}

function currentSession() {
  return document.getElementById("staffSession").value;
}

function getPin() {
  return clean(document.getElementById("staffPin").value);
}

function loadSavedPin() {
  try {
    return clean(localStorage.getItem(PIN_STORAGE_KEY));
  } catch {
    return "";
  }
}

function rememberPin(pin = getPin()) {
  const value = clean(pin);
  if (!value) return;
  try {
    localStorage.setItem(PIN_STORAGE_KEY, value);
  } catch {
    // Browser storage may be unavailable in private or restricted modes.
  }
}

function restoreSavedPin() {
  const savedPin = loadSavedPin();
  if (savedPin) document.getElementById("staffPin").value = savedPin;
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

function activeRegistrationCount(session) {
  return (rosterData.registrations || []).filter((item) => item.session === session && !isCanceled(item)).length;
}

function capacityFor(session) {
  return Number(rosterData.capacityBySession?.[session] || 0);
}

function setCapacityMessage(ok, text) {
  const el = document.getElementById("capacityMessage");
  if (!el) return;
  el.className = `message ${ok ? "ok" : "err"}`;
  el.textContent = text;
}

function renderCapacityPanel() {
  const rows = document.getElementById("capacityRows");
  if (!rows) return;
  rows.innerHTML = sessions.map((session) => {
    const capacity = capacityFor(session);
    const activeCount = activeRegistrationCount(session);
    const minimum = Math.max(1, activeCount);
    const remaining = Math.max(0, capacity - activeCount);
    const busy = capacityBusySessions.has(session);
    const unavailable = !Number.isInteger(capacity) || capacity < 1;
    const disabled = busy || unavailable;
    const value = capacityDrafts.has(session) ? capacityDrafts.get(session) : (capacity || "");
    const encodedSession = escapeHtml(session);
    return `
      <form class="capacity-row${busy ? " busy" : ""}" data-capacity-row="${encodedSession}" aria-label="${encodedSession} 名額管理">
        <div class="capacity-row-info">
          <strong>${escapeHtml(sessionLabels[session] || session)}</strong>
          <span>目前有效報名 <b>${activeCount}</b> 人 · 剩餘 <b>${remaining}</b> 人</span>
          <small>${unavailable ? "無法取得名額，請按重新整理。" : `可調整範圍 ${minimum}－${MAX_CAPACITY} 人`}</small>
        </div>
        <div class="capacity-row-controls">
          <button type="button" data-capacity-action="delta" data-session="${encodedSession}" data-delta="-1" aria-label="${encodedSession} 減少 1 位" title="減少 1 位" ${disabled || capacity <= minimum ? "disabled" : ""}>−</button>
          <label>
            <span>最高人數</span>
            <input type="number" data-capacity-input data-session="${encodedSession}" aria-label="${encodedSession} 最高人數" value="${escapeHtml(value)}" min="${minimum}" max="${MAX_CAPACITY}" step="1" inputmode="numeric" required ${disabled ? "disabled" : ""}>
          </label>
          <button type="button" data-capacity-action="delta" data-session="${encodedSession}" data-delta="1" aria-label="${encodedSession} 增加 1 位" title="增加 1 位" ${disabled || capacity >= MAX_CAPACITY ? "disabled" : ""}>＋</button>
          <button type="submit" class="capacity-save" aria-label="${encodedSession} 儲存名額" ${disabled ? "disabled" : ""}>${busy ? "儲存中…" : "儲存"}</button>
        </div>
      </form>
    `;
  }).join("");
}

async function postCapacity(payload) {
  const res = await fetchWithApiFallback("/api/admin/capacity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result.success) throw new Error(result.message || "名額調整失敗，請稍後再試。");
  return result;
}

async function changeCapacity(session, payload) {
  if (!sessions.includes(session) || capacityBusySessions.has(session)) return;
  const pin = getPin();
  if (!pin) {
    setCapacityMessage(false, "請先輸入管理員 PIN。");
    document.getElementById("staffPin").focus();
    return;
  }
  capacityBusySessions.add(session);
  renderCapacityPanel();
  try {
    const result = await postCapacity({
      ...payload,
      pin,
      session
    });
    capacityDrafts.delete(session);
    rosterData.capacityBySession = { ...rosterData.capacityBySession, [session]: result.capacity };
    rememberPin(pin);
    setCapacityMessage(true, `${result.session} 最高人數已調整為 ${result.capacity} 人。`);
    await loadRoster().catch(() => setMessage(false, "名額已儲存，但名單更新失敗，請按重新整理。"));
  } catch (err) {
    setCapacityMessage(false, err.message);
  } finally {
    capacityBusySessions.delete(session);
    renderCapacityPanel();
  }
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
    const details = escapeHtml(participantDetails(reg));
    const name = escapeHtml(reg.name);
    return `
      <article class="staff-row ${done ? "done" : ""}">
        <div>
          <strong>${index + 1}. ${name}</strong>
          <span>${details}${done ? " · 已報到" : " · 未報到"}</span>
        </div>
        <button type="button" data-name="${name}" ${done ? "disabled" : ""}>${done ? "已報到" : "報到"}</button>
      </article>
    `;
  }).join("") || `<p class="message err">沒有符合的學員。</p>`;
}

async function loadRoster() {
  setMessage(true, "讀取名單中...");
  const res = await fetchWithApiFallback("/api/roster", { cache: "no-store" });
  if (!res.ok) throw new Error("名單讀取失敗，請稍後再試。");
  rosterData = await res.json();
  renderStats();
  renderList();
  renderCapacityPanel();
  setMessage(true, "名單已更新。");
}

function checkinNameKey(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "");
}

function isMatchingActiveCheckin(item, payload) {
  return item?.status === "checked-in"
    && item.session === payload.session
    && checkinNameKey(item.name) === checkinNameKey(payload.name);
}

function applyConfirmedCheckin(entry) {
  const checkins = rosterData.checkins || [];
  if (!checkins.some((item) => item.id === entry.id || isMatchingActiveCheckin(item, entry))) {
    rosterData = { ...rosterData, checkins: [...checkins, entry] };
  }
  renderStats();
  renderList();
}

async function postCheckin(payload) {
  const res = await fetchWithApiFallback("/api/checkin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok || !result.success) throw new Error(result.message || "簽到失敗，請稍後再試。");
  applyConfirmedCheckin(result);
  return result;
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
    await postCheckin({ pin, session: currentSession(), name });
    setMessage(true, `${name} 報到成功。`);
    rememberPin(pin);
    button.textContent = "已報到";
  } catch (err) {
    setMessage(false, err.message);
    button.disabled = false;
    button.textContent = "報到";
  }
}

restoreSavedPin();
document.getElementById("staffSession").addEventListener("change", renderList);
document.getElementById("staffSearch").addEventListener("input", renderList);
document.getElementById("staffRefresh").addEventListener("click", () => loadRoster().catch((err) => setMessage(false, err.message)));
document.getElementById("capacityRows").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-capacity-action]");
  if (!button) return;
  changeCapacity(button.dataset.session, { delta: Number(button.dataset.delta) });
});
document.getElementById("capacityRows").addEventListener("input", (event) => {
  if (event.target.matches("[data-capacity-input]")) {
    capacityDrafts.set(event.target.dataset.session, event.target.value);
  }
});
document.getElementById("capacityRows").addEventListener("submit", (event) => {
  event.preventDefault();
  const row = event.target.closest("[data-capacity-row]");
  if (!row) return;
  const session = row.dataset.capacityRow;
  const input = row?.querySelector("[data-capacity-input]");
  const value = Number(input?.value);
  const minimum = activeRegistrationCount(session);
  if (!Number.isInteger(value) || value < Math.max(1, minimum) || value > MAX_CAPACITY) {
    setCapacityMessage(false, `${session} 最高人數必須是 ${Math.max(1, minimum)}－${MAX_CAPACITY} 的整數。`);
    return;
  }
  changeCapacity(session, { capacity: value });
});
document.getElementById("staffList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-name]");
  if (!button) return;
  checkIn(button.dataset.name, button);
});

loadRoster().catch((err) => setMessage(false, err.message));

