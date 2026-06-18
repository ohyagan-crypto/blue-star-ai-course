const API_BASE = location.hostname.endsWith("loca.lt") ? location.origin : "https://humanities-retirement-pentium-slope.trycloudflare.com";
const sessions = ["6/24 剪映實戰班", "7/1 剪映實戰班"];
const sessionInfo = {
  "6/24 剪映實戰班": { title: "6/24（三）剪映實戰班", address: "藍星台中公司", transit: "14:00～16:00｜人數限制 30 位" },
  "7/1 剪映實戰班": { title: "7/1（三）剪映實戰班", address: "藍星台中公司", transit: "14:00～16:00｜人數限制 30 位" }
};

let rosterData = { registrations: [], checkins: [] };

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

function isCanceled(reg) {
  return reg.status === "cancelled" || reg.cancelled === true || Boolean(reg.cancelledAt);
}

function getActiveRegistrations(session) {
  return (rosterData.registrations || []).filter((item) => item.session === session && !isCanceled(item));
}

function renderRegistrationList(session) {
  const regs = getActiveRegistrations(session);
  if (!regs.length) return `<p class="modal-empty">目前這個場次尚無有效報名資料。</p>`;
  return `
    <div class="modal-list">
      ${regs.map((reg, index) => {
        const name = escapeHtml(reg.name);
        const type = escapeHtml(reg.participantType || reg.type || "未填身分");
        const note = escapeHtml(reg.createdAt || reg.note || "");
        return `
          <article class="modal-person">
            <strong>${index + 1}. ${name}</strong>
            <span>${type}</span>
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

function renderRosterData(data, fromFallback = false) {
  rosterData = data;
  const stats = document.getElementById("stats");
  const roster = document.getElementById("rosterList");
  const sheetLink = document.getElementById("sheetLink");
  if (sheetLink && data.googleSheetUrl) sheetLink.href = data.googleSheetUrl;

  stats.innerHTML = sessions.map((session) => {
    const regs = (data.registrations || []).filter((item) => item.session === session && !isCanceled(item));
    return `<button class="stat stat-button" type="button" data-session="${escapeHtml(session)}" aria-label="查看 ${escapeHtml(session)} 已報名名單"><strong>${regs.length}</strong><span>${session} 有效報名</span><small>點開看名單</small></button>`;
  }).join("");

  roster.innerHTML = `${fromFallback ? `<p class="message ok">目前顯示備援名單，報名資料恢復連線後會自動更新。</p>` : ""}${sessions.map((session) => {
    const regs = (data.registrations || []).filter((item) => item.session === session && !isCanceled(item));
    const people = regs.map((reg, index) => {
      const type = reg.participantType || reg.type || "未填身分";
      const note = reg.note || reg.createdAt || "";
      return `<div class="person"><strong>${index + 1}. ${escapeHtml(reg.name)}</strong><span>已報名</span><em>${escapeHtml(type)}</em><small>${escapeHtml(note)}</small></div>`;
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

document.querySelector("[data-jump-register]")?.addEventListener("click", () => {
  setView("register");
  document.getElementById("registerForm")?.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.querySelector('#registerForm select[name="participantType"]').addEventListener("change", (event) => {
  updateIntroducerRequirement(event.currentTarget.form);
});

document.getElementById("registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
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
    form.reset();
    await loadRoster();
  } catch (err) {
    setMessage(msg, false, err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "確認取消報名";
  }
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
  showModal({
    title: `${session} 已報名名單`,
    message: `目前有效報名 ${count} 位。`,
    body: renderRegistrationList(session),
    okIcon: false
  });
});

fillSessionSelects();
updateIntroducerRequirement();
loadRoster();
