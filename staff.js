const DEFAULT_API_BASE = location.hostname.endsWith("loca.lt") ? location.origin : "https://carroll-wan-player-delhi.trycloudflare.com";
const PIN_STORAGE_KEY = "blueCourseStaffPin";
const CHECKIN_CONFIRM_DELAY_MS = 350;
const CHECKIN_CONFIRM_TIMEOUT_MS = 8000;
const CHECKIN_CONFIRM_INTERVAL_MS = 250;
let activeApiBase = DEFAULT_API_BASE;
let apiBases = [DEFAULT_API_BASE];
const sessions = ["9/14 台南場","9/15 高雄場","9/17 台北場","9/19 台中場"];

let rosterData = { registrations: [], checkins: [] };

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
    try {
      const res = await fetch(api(path, base), options);
      activeApiBase = base;
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastError = new Error(`API ${res.status}`);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("API unavailable");
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
  setMessage(true, "名單已更新。");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForPersistedCheckin(payload, knownIds, requestState) {
  await delay(CHECKIN_CONFIRM_DELAY_MS);
  const deadline = Date.now() + CHECKIN_CONFIRM_TIMEOUT_MS;

  while (!requestState.settled && Date.now() < deadline) {
    try {
      const res = await fetchWithApiFallback("/api/roster", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const entry = [...(data.checkins || [])].reverse().find((item) => (
          item.id && !knownIds.has(String(item.id)) && isMatchingActiveCheckin(item, payload)
        ));
        if (entry) {
          rosterData = data;
          renderStats();
          renderList();
          return { success: true, ...entry };
        }
      }
    } catch {
      // The original POST remains authoritative if a polling request fails.
    }
    await delay(CHECKIN_CONFIRM_INTERVAL_MS);
  }
  return null;
}

async function postCheckin(payload) {
  const knownIds = new Set((rosterData.checkins || []).map((item) => String(item.id || "")).filter(Boolean));
  const requestState = { settled: false };
  const request = (async () => {
    const res = await fetchWithApiFallback("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success) throw new Error(body.message || "簽到失敗，請稍後再試。");
    return body;
  })();
  request.then(
    () => { requestState.settled = true; },
    () => { requestState.settled = true; }
  );

  const persisted = waitForPersistedCheckin(payload, knownIds, requestState);
  const result = await Promise.race([
    request,
    persisted.then((entry) => entry || request)
  ]);
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
document.getElementById("staffList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-name]");
  if (!button) return;
  checkIn(button.dataset.name, button);
});

loadRoster().catch((err) => setMessage(false, err.message));

