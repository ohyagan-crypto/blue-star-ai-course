const API_BASE = "https://d9689b58d30e372a-203-217-101-116.serveousercontent.com";
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
    throw new Error("送出失敗，請確認網路或重新整理頁面");
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.success) throw new Error(body.message || "送出失敗，請稍後再試");
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

async function loadRoster() {
  const stats = document.getElementById("stats");
  const roster = document.getElementById("rosterList");

  try {
    const res = await fetch(api("/api/roster"), { cache: "no-store" });
    const data = await res.json();
    const sheetLink = document.getElementById("sheetLink");
    if (sheetLink && data.googleSheetUrl) sheetLink.href = data.googleSheetUrl;

    stats.innerHTML = sessions.map((session) => {
      const item = data.counts[session] || { registered: 0, checkedIn: 0 };
      return `<div class="stat"><strong>${item.checkedIn}/${item.registered}</strong><span>${session} 報到/報名</span></div>`;
    }).join("");

    roster.innerHTML = sessions.map((session) => {
      const regs = data.registrations.filter((item) => item.session === session);
      const checks = data.checkins.filter((item) => item.session === session);
      const people = regs.map((reg, index) => {
        const checked = checks.some((item) => item.name === reg.name);
        return `<div class="person"><strong>${index + 1}. ${reg.name}</strong><span>${checked ? "已報到" : "未報到"}</span><small>${reg.note || reg.createdAt || ""}</small></div>`;
      }).join("") || `<div class="person">尚無資料</div>`;
      return `<section class="roster-card"><h3>${session}</h3>${people}</section>`;
    }).join("");
  } catch {
    stats.innerHTML = `<div class="stat"><strong>無法連線</strong><span>請重新整理頁面</span></div>`;
    roster.innerHTML = `<p class="message err">讀取名單失敗，請確認伺服器是否正常。</p>`;
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
