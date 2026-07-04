const API_BASE = location.hostname.endsWith("loca.lt") ? location.origin : "https://3454460dc812b626-203-217-101-116.serveousercontent.com";
const sessions = ["7/6 台南場","7/7 高雄場","7/9 台北場","7/11 台中場"];
const sessionCapacities = {
  "7/6 台南場": 70,
  "7/7 高雄場": 140,
  "7/9 台北場": 140,
  "7/11 台中場": 150
};
const sessionInfo = {
  "7/6 台南場": { title: "7/6（一）台南場", address: "台南市中西區南美里民生路一段167號3F", transit: "13:00-17:00" },
  "7/7 高雄場": { title: "7/7（二）高雄場", address: "高雄市前鎮區中山二路2號12樓之7", transit: "捷運獅甲站3號出口｜13:00-17:00" },
  "7/9 台北場": { title: "7/9（四）台北場", address: "台北市中正區館前路36號8樓", transit: "捷運台北車站 M6 出口｜13:00-17:00" },
  "7/11 台中場": { title: "7/11（六）台中場", address: "台中市南屯區大墩六街208號", transit: "捷運南屯站｜13:00-17:00" }
};
const SCRIPT_VERSION = "20260704145648";

let lastVoice = "";
let voiceUnlocked = false;
let rosterData = { registrations: [], checkins: [] };
let lastCheckin = null;

function api(path) {
  return `${API_BASE}${path}`;
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

function unlockVoice() {
  if (!window.speechSynthesis || voiceUnlocked) return;
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.lang = "zh-TW";
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
  voiceUnlocked = true;
}

function fillSessionSelects() {
  const options = `<option value="">請選擇</option>${sessions.map((session) => `<option value="${session}">${session}</option>`).join("")}`;
  document.querySelectorAll('select[name="session"]').forEach((select) => {
    select.innerHTML = options;
  });

  document.getElementById("sessionList").innerHTML = sessions.map((session) => {
    const info = sessionInfo[session];
    return `<div><strong>${info.title}</strong><span>${info.address}</span><small>${info.transit}</small></div>`;
  }).join("");
}

function setView(id) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === id));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.id === id));
  if (id === "roster" || id === "checkin") loadRoster();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function updateIntroducerRequirement(form = document.getElementById("registerForm")) {
  const type = form?.elements.participantType?.value || "";
  const input = form?.elements.introducer;
  const label = document.getElementById("introducerLabel");
  if (!input || !label) return;
  const required = type === "新人";
  input.required = required;
  input.placeholder = required ? "新人必填，請填寫介紹人" : "複訓選填";
  label.firstChild.textContent = required ? "介紹人（新人必填）" : "介紹人（複訓選填）";
}

function setMessage(el, ok, text) {
  el.className = `message ${ok ? "ok" : "err"}`;
  el.textContent = text;
}

function showModal({ title, message = "", body = "", okIcon = true }) {
  const modal = document.getElementById("appModal");
  const card = modal?.querySelector(".modal-card");
  if (!modal || !card) return;
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent = message;
  document.getElementById("modalBody").innerHTML = body;
  document.querySelector(".modal-ok").hidden = !okIcon;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  card.focus();
}

function closeModal() {
  const modal = document.getElementById("appModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
}

function getActiveRegistrations(session) {
  return (rosterData.registrations || []).filter((item) => item.session === session && !isCanceled(item));
}

function getSessionCheckins(session) {
  return (rosterData.checkins || []).filter((item) => item.session === session);
}

function renderRegistrationList(session) {
  const regs = getActiveRegistrations(session);
  const checked = new Set(getSessionCheckins(session).map((item) => item.name));
  if (!regs.length) return `<p class="modal-empty">目前這個場次尚無有效報名資料。</p>`;
  return `
    <div class="modal-list">
      ${regs.map((reg, index) => {
        const name = escapeHtml(reg.name);
        const type = escapeHtml(reg.participantType || reg.type || "未填身分");
        const status = checked.has(reg.name) ? "已報到" : "未報到";
        const note = escapeHtml(reg.createdAt || reg.note || "");
        return `
          <article class="modal-person">
            <strong>${index + 1}. ${name}</strong>
            <span>${type} · ${status}</span>
            ${note ? `<small>${note}</small>` : ""}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

async function postJson(path, data) {
  let res;
  try {
    res = await fetch(api(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  } catch {
    throw new Error("送出失敗，請確認網路或後端服務是否正常。");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.message || "送出失敗，請稍後再試。");
  return body;
}

function speak(text) {
  lastVoice = text;
  if (!window.speechSynthesis) {
    alert(text);
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW";
  utterance.rate = 0.92;
  utterance.pitch = 1.05;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function checkinVoiceText(data) {
  return `${data.name} 報到成功`;
}

function isCanceled(reg) {
  return reg.status === "cancelled" || reg.cancelled === true || Boolean(reg.cancelledAt);
}

function getSessionCapacity(session) {
  return Number(rosterData?.capacityBySession?.[session] || sessionCapacities[session] || 0);
}

function getRemainingSeats(session, regs) {
  const capacity = getSessionCapacity(session);
  if (!capacity) return null;
  return Math.max(0, capacity - regs.length);
}

function renderRosterData(data, fromFallback = false) {
  rosterData = data;
  const stats = document.getElementById("stats");
  const roster = document.getElementById("rosterList");
  const sheetLink = document.getElementById("sheetLink");
  if (sheetLink && data.googleSheetUrl) sheetLink.href = data.googleSheetUrl;

  stats.innerHTML = sessions.map((session) => {
    const regs = (data.registrations || []).filter((item) => item.session === session && !isCanceled(item));
    const checks = (data.checkins || []).filter((item) => item.session === session);
    const checkedIn = checks.filter((check) => regs.some((reg) => reg.name === check.name)).length;
    const capacity = getSessionCapacity(session);
    const remaining = getRemainingSeats(session, regs);
    const seatText = capacity ? `${regs.length} / ${capacity}` : regs.length;
    const hintText = remaining === 0 ? "已額滿，點開看名單" : remaining === null ? "點開看名單" : `剩餘 ${remaining} 位，點開看名單`;
    return `<button class="stat stat-button" type="button" data-session="${escapeHtml(session)}" aria-label="查看 ${escapeHtml(session)} 已報名名單"><strong>${seatText}</strong><span>${session} 有效報名</span><small>${hintText}</small></button>`;
  }).join("");

  roster.innerHTML = `${fromFallback ? `<p class="message ok">目前顯示備援名單，報名與簽到資料恢復連線後會自動更新。</p>` : ""}${sessions.map((session) => {
    const regs = (data.registrations || []).filter((item) => item.session === session && !isCanceled(item));
    const checks = (data.checkins || []).filter((item) => item.session === session);
    const people = regs.map((reg, index) => {
      const checked = checks.some((item) => item.name === reg.name);
      const status = checked ? "已報到" : "未報到";
      const type = reg.participantType || reg.type || "未填身份";
      const note = reg.note || reg.createdAt || "";
      return `<div class="person"><strong>${index + 1}. ${reg.name}</strong><span>${status}</span><em>${type}</em><small>${note}</small></div>`;
    }).join("") || `<div class="person empty">尚無資料</div>`;
    return `<section class="roster-card"><h3>${session}</h3>${people}</section>`;
  }).join("")}`;
  renderQuickCheckin();
}

async function loadRoster() {
  try {
    const res = await fetch(api("/api/roster"), { cache: "no-store" });
    if (!res.ok) throw new Error("API unavailable");
    renderRosterData(await res.json());
  } catch {
    try {
      const fallbackRes = await fetch("./roster-fallback.json", { cache: "no-store" });
      if (!fallbackRes.ok) throw new Error("Fallback unavailable");
      renderRosterData(await fallbackRes.json(), true);
    } catch {
      document.getElementById("stats").innerHTML = `<div class="stat wide"><strong>名單暫時無法讀取</strong><span>請稍後重新整理頁面。</span></div>`;
      document.getElementById("rosterList").innerHTML = `<p class="message err">名單讀取失敗，請稍後再試。</p>`;
    }
  }
}

function getCheckinPin() {
  const pinInput = document.querySelector('#checkinForm input[name="pin"]');
  return String(pinInput?.value || "").trim();
}

function clearCheckinPin() {
  localStorage.removeItem("blueCourseStaffPin");
  const pinInput = document.querySelector('#checkinForm input[name="pin"]');
  if (pinInput) pinInput.value = "";
}

function checkedNames(session) {
  return new Set((rosterData.checkins || []).filter((item) => item.session === session).map((item) => item.name));
}

function setQuickMessage(ok, text) {
  const el = document.getElementById("quickMessage");
  if (!el) return;
  el.className = `message ${ok ? "ok" : "err"}`;
  el.textContent = text;
}

function setLastCheckin(data) {
  lastCheckin = data ? { name: data.name, session: data.session } : null;
  const box = document.getElementById("undoCheckinBox");
  const text = document.getElementById("undoCheckinText");
  if (!box || !text) return;
  if (!lastCheckin) {
    box.hidden = true;
    text.textContent = "";
    return;
  }
  text.textContent = `上一筆：${lastCheckin.session}／${lastCheckin.name}`;
  box.hidden = false;
}

function renderQuickCheckin() {
  const list = document.getElementById("quickList");
  const sessionSelect = document.querySelector('#checkinForm select[name="session"]');
  if (!list || !sessionSelect) return;
  const session = sessionSelect.value || sessions[0];
  const keyword = String(document.querySelector('#checkinForm input[name="name"]')?.value || "").trim().toLowerCase();
  const checked = checkedNames(session);
  const regs = (rosterData.registrations || [])
    .filter((item) => item.session === session && !isCanceled(item))
    .filter((item) => !keyword || String(item.name || "").toLowerCase().includes(keyword));

  list.innerHTML = regs.map((reg, index) => {
    const done = checked.has(reg.name);
    const name = escapeHtml(reg.name);
    const type = escapeHtml(reg.participantType || reg.type || "未填身分");
    return `
      <article class="staff-row ${done ? "done" : ""}">
        <div>
          <strong>${index + 1}. ${name}</strong>
          <span>${type}${done ? " · 已報到" : " · 未報到"}</span>
        </div>
        <button type="button" data-name="${name}" ${done ? "disabled" : ""}>${done ? "已報到" : "報到"}</button>
      </article>
    `;
  }).join("") || `<p class="message err">沒有符合的學員。</p>`;
}
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

document.querySelector('#registerForm select[name="participantType"]').addEventListener("change", (event) => {
  updateIntroducerRequirement(event.currentTarget.form);
});

document.getElementById("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  unlockVoice();
  const form = event.currentTarget;
  const btn = form.querySelector("button");
  const msg = document.getElementById("registerMessage");
  const payload = formData(form);
  if (payload.participantType === "新人" && !String(payload.introducer || "").trim()) {
    setMessage(msg, false, "新人報名請填寫介紹人；複訓可選填。");
    form.elements.introducer.focus();
    return;
  }
  btn.disabled = true;
  btn.textContent = "送出中...";
  try {
    const data = await postJson("/api/register", payload);
    setMessage(msg, true, `${data.name} 已完成 ${data.session} 報名`);
    showModal({
      title: "已報名成功",
      message: `${data.name} 已完成 ${data.session} 報名。`
    });
    form.reset();
    updateIntroducerRequirement(form);
    await loadRoster();
  } catch (err) {
    setMessage(msg, false, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "送出報名";
  }
});

document.getElementById("cancelForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const btn = form.querySelector("button");
  const msg = document.getElementById("cancelMessage");
  btn.disabled = true;
  btn.textContent = "取消中...";
  try {
    const data = await postJson("/api/cancel", formData(form));
    setMessage(msg, true, `${data.name} 已取消 ${data.session} 報名`);
    showModal({
      title: "已取消報名",
      message: `${data.name} 已取消 ${data.session} 報名。`
    });
    form.reset();
    await loadRoster();
  } catch (err) {
    setMessage(msg, false, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "確認取消報名";
  }
});

document.getElementById("checkinForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  unlockVoice();
  const form = event.currentTarget;
  const btn = form.querySelector("button");
  const msg = document.getElementById("checkinMessage");
  const box = document.getElementById("successBox");
  btn.disabled = true;
  btn.textContent = "簽到中...";
  try {
    const data = await postJson("/api/checkin", formData(form));
    const text = checkinVoiceText(data);
    setMessage(msg, true, "報到成功");
    document.getElementById("successText").textContent = text;
    box.hidden = false;
    setLastCheckin(data);
    speak(text);
    form.reset();
    clearCheckinPin();
    await loadRoster();
  } catch (err) {
    box.hidden = true;
    setMessage(msg, false, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "送出簽到";
  }
});

const checkinPinInput = document.querySelector('#checkinForm input[name="pin"]');
clearCheckinPin();
document.querySelector('#checkinForm select[name="session"]').addEventListener("change", renderQuickCheckin);
document.querySelector('#checkinForm input[name="name"]').addEventListener("input", renderQuickCheckin);
document.getElementById("quickRefresh").addEventListener("click", () => loadRoster().catch(() => setQuickMessage(false, "名單讀取失敗，請稍後再試。")));
document.getElementById("quickList").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-name]");
  if (!button) return;
  const pin = getCheckinPin();
  if (!pin) {
    setQuickMessage(false, "請先在上方 PIN 欄輸入 PIN。");
    checkinPinInput.focus();
    return;
  }
  button.disabled = true;
  button.textContent = "簽到中...";
  try {
    const data = await postJson("/api/checkin", {
      pin,
      session: document.querySelector('#checkinForm select[name="session"]').value,
      name: button.dataset.name
    });
    const text = checkinVoiceText(data);
    setQuickMessage(true, `${data.name} 報到成功。`);
    document.getElementById("successText").textContent = text;
    document.getElementById("successBox").hidden = false;
    setLastCheckin(data);
    speak(text);
    clearCheckinPin();
    await loadRoster();
  } catch (err) {
    setQuickMessage(false, err.message);
    button.disabled = false;
    button.textContent = "報到";
  }
});

document.getElementById("undoCheckin").addEventListener("click", async () => {
  if (!lastCheckin) {
    setQuickMessage(false, "目前沒有可返回的上一筆報到。");
    return;
  }
  const pin = getCheckinPin();
  if (!pin) {
    setQuickMessage(false, "請先在上方 PIN 欄輸入 PIN。");
    checkinPinInput.focus();
    return;
  }
  const undoButton = document.getElementById("undoCheckin");
  undoButton.disabled = true;
  undoButton.textContent = "返回中...";
  try {
    const data = await postJson("/api/checkin/undo", {
      pin,
      session: lastCheckin.session,
      name: lastCheckin.name
    });
    setQuickMessage(true, `${data.name} 已返回為未報到。`);
    document.getElementById("successBox").hidden = true;
    setLastCheckin(null);
    clearCheckinPin();
    await loadRoster();
  } catch (err) {
    setQuickMessage(false, err.message);
  } finally {
    undoButton.disabled = false;
    undoButton.textContent = "返回上一筆報到";
  }
});

document.getElementById("quickReplayVoice").addEventListener("click", () => {
  if (lastVoice) speak(lastVoice);
  else setQuickMessage(false, "目前沒有可播放的報到語音。");
});

document.getElementById("replayVoice").addEventListener("click", () => {
  if (lastVoice) speak(lastVoice);
});
document.getElementById("refreshRoster").addEventListener("click", loadRoster);
document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", closeModal);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});
document.getElementById("stats").addEventListener("click", (event) => {
  const button = event.target.closest("[data-session]");
  if (!button) return;
  const session = button.dataset.session;
  const count = getActiveRegistrations(session).length;
  const capacity = getSessionCapacity(session);
  const remaining = Math.max(0, capacity - count);
  showModal({
    title: `${session} 已報名名單`,
    message: capacity ? `目前有效報名 ${count} / ${capacity} 位，剩餘 ${remaining} 位。` : `目前有效報名 ${count} 位。`,
    body: renderRegistrationList(session),
    okIcon: false
  });
});

fillSessionSelects();
updateIntroducerRequirement();
loadRoster();

