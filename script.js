const API_BASE = location.hostname.endsWith("loca.lt") ? location.origin : "https://eager-mails-glow.loca.lt";
const sessions = ["6/9 高雄場", "6/11 台北場", "6/13 台中場"];
const sessionInfo = {
  "6/9 高雄場": { title: "6/9（二）高雄場", address: "詳細地點待定", transit: "捷運" },
  "6/11 台北場": { title: "6/11（四）台北場", address: "台北市中正區忠孝東路一段150號6樓", transit: "捷運善導寺站5號出口" },
  "6/13 台中場": { title: "6/13（六）台中場", address: "詳細地點待定", transit: "捷運" }
};

let lastVoice = "";
let voiceUnlocked = false;

function api(path) {
  return `${API_BASE}${path}`;
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
  if (id === "roster") loadRoster();
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setMessage(el, ok, text) {
  el.className = `message ${ok ? "ok" : "err"}`;
  el.textContent = text;
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

function isCanceled(reg) {
  return reg.status === "cancelled" || reg.cancelled === true || Boolean(reg.cancelledAt);
}

function renderRosterData(data, fromFallback = false) {
  const stats = document.getElementById("stats");
  const roster = document.getElementById("rosterList");
  const sheetLink = document.getElementById("sheetLink");
  if (sheetLink && data.googleSheetUrl) sheetLink.href = data.googleSheetUrl;

  stats.innerHTML = sessions.map((session) => {
    const regs = (data.registrations || []).filter((item) => item.session === session && !isCanceled(item));
    const canceled = (data.registrations || []).filter((item) => item.session === session && isCanceled(item));
    const checks = (data.checkins || []).filter((item) => item.session === session);
    const checkedIn = checks.filter((check) => regs.some((reg) => reg.name === check.name)).length;
    return `<div class="stat"><strong>${checkedIn}/${regs.length}</strong><span>${session} 報到/有效報名</span><small>已取消 ${canceled.length} 位</small></div>`;
  }).join("");

  roster.innerHTML = `${fromFallback ? `<p class="message ok">目前顯示備援名單，報名與簽到資料恢復連線後會自動更新。</p>` : ""}${sessions.map((session) => {
    const regs = (data.registrations || []).filter((item) => item.session === session);
    const checks = (data.checkins || []).filter((item) => item.session === session);
    const people = regs.map((reg, index) => {
      const canceled = isCanceled(reg);
      const checked = checks.some((item) => item.name === reg.name);
      const status = canceled ? "已取消" : checked ? "已報到" : "未報到";
      const type = reg.participantType || reg.type || "未填身份";
      const note = canceled ? (reg.cancelReason || reg.reason || reg.cancelledAt || "") : (reg.note || reg.createdAt || "");
      return `<div class="person ${canceled ? "cancelled" : ""}"><strong>${index + 1}. ${reg.name}</strong><span>${status}</span><em>${type}</em><small>${note}</small></div>`;
    }).join("") || `<div class="person empty">尚無資料</div>`;
    return `<section class="roster-card"><h3>${session}</h3>${people}</section>`;
  }).join("")}`;
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
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

document.getElementById("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  unlockVoice();
  const form = event.currentTarget;
  const btn = form.querySelector("button");
  const msg = document.getElementById("registerMessage");
  btn.disabled = true;
  btn.textContent = "送出中...";
  try {
    const data = await postJson("/api/register", formData(form));
    setMessage(msg, true, `${data.name} 已完成 ${data.session} 報名`);
    form.reset();
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
    const text = `${data.name} 報到成功，歡迎參加 ${data.session} 藍星 AI 網紅進階班。`;
    setMessage(msg, true, "報到成功");
    document.getElementById("successText").textContent = text;
    box.hidden = false;
    speak(text);
    form.reset();
    await loadRoster();
  } catch (err) {
    box.hidden = true;
    setMessage(msg, false, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "送出簽到";
  }
});

document.getElementById("replayVoice").addEventListener("click", () => {
  if (lastVoice) speak(lastVoice);
});
document.getElementById("refreshRoster").addEventListener("click", loadRoster);

fillSessionSelects();
loadRoster();
