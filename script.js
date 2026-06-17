const courses = [
  {
    id: "ai-basic-july",
    category: "AI 自媒體",
    title: "藍星 AI 自媒體基礎班（七月）",
    subtitle: "AI 課程大升級，最強 AI 智能體「藍星龍蝦」震撼登場。",
    price: "新人 1,000 元｜複訓 100 元場地費",
    time: "7/6 台南、7/7 高雄、7/9 台北、7/11 台中｜13:00-17:00",
    place: "台南、高雄、台北、台中",
    tags: ["個人 IP", "AI 代理人", "自媒體", "智能體"],
    details: [
      "運用自媒體打造個人 IP 與人設品牌。",
      "打造私人 AI 代理人，協助自媒體、表單、簡報、剪輯與工作流程。",
      "學會用 AI 規劃產品賣點，提高成交率。",
      "新人參與、邀請 3 位新人，可獲藍星 AI 聚合平台 15 日。"
    ]
  },
  {
    id: "jianying-practical",
    category: "影音剪輯",
    title: "藍星科技｜剪映實戰班",
    subtitle: "學會剪映＋數字人克隆，打造抖音百萬觀看短視頻。",
    price: "藍星同學免費",
    time: "6/24、7/1｜14:00-16:00",
    place: "藍星台中公司",
    tags: ["剪映", "短視頻", "數字人克隆", "抖音"],
    details: [
      "不講理論，直接教實戰剪輯。",
      "包含剪映實戰、數字人克隆、爆款短視頻技巧。",
      "適合想做抖音、想做自媒體與提升影片流量的人。",
      "人數限制 30 位，請盡快報名。",
      "目前開放場次：6/24、7/1。"
    ]
  },
  {
    id: "ncn-wednesday",
    category: "NCN",
    title: "NCN 周三課程｜經濟模型",
    subtitle: "財富邏輯：NCN + 現金雙引擎價值螺旋。",
    price: "依課程公告",
    time: "周三 20:00 准時開講",
    place: "線上課程",
    tags: ["NCN", "經濟模型", "財富邏輯", "雙引擎"],
    details: [
      "主題聚焦 NCN 諾瓦交互協議與經濟模型。",
      "說明 NCN + 現金雙引擎價值螺旋。",
      "適合想理解平台機制、財富邏輯與價值流動的人。",
      "搭配深藍科技感、金幣、交易盤與火箭意象課程視覺。"
    ]
  }
];

const state = {
  query: "",
  category: "全部",
  cart: new Map()
};

const courseMenu = document.querySelector("#courseMenu");
const cartList = document.querySelector("#cartList");
const totalCount = document.querySelector("#totalCount");
const searchInput = document.querySelector("#searchInput");
const categorySelect = document.querySelector("#categorySelect");
const clearCart = document.querySelector("#clearCart");
const orderForm = document.querySelector("#orderForm");
const summaryDialog = document.querySelector("#summaryDialog");
const summaryText = document.querySelector("#summaryText");
const copySummary = document.querySelector("#copySummary");
const closeSummary = document.querySelector("#closeSummary");

function filteredCourses() {
  const query = state.query.trim().toLowerCase();
  return courses.filter((course) => {
    const matchCategory = state.category === "全部" || course.category === state.category;
    const haystack = [
      course.title,
      course.subtitle,
      course.price,
      course.time,
      course.place,
      course.category,
      ...course.tags,
      ...course.details
    ].join(" ").toLowerCase();
    return matchCategory && (!query || haystack.includes(query));
  });
}

function renderMenu() {
  const list = filteredCourses();
  courseMenu.innerHTML = "";
  if (!list.length) {
    courseMenu.innerHTML = `<div class="empty-state">沒有符合的課程</div>`;
    return;
  }

  list.forEach((course) => {
    const article = document.createElement("article");
    article.className = "course-card";
    article.innerHTML = `
      <div class="course-card-head">
        <span></span>
        <strong></strong>
      </div>
      <h3></h3>
      <p class="course-subtitle"></p>
      <ul></ul>
      <div class="course-info">
        <div><b>時間</b><span></span></div>
        <div><b>地點</b><span></span></div>
        <div><b>費用</b><span></span></div>
      </div>
      <div class="tag-row"></div>
      <button type="button" class="add-course">加入選課</button>
    `;
    article.querySelector(".course-card-head span").textContent = course.category;
    article.querySelector(".course-card-head strong").textContent = course.id.toUpperCase();
    article.querySelector("h3").textContent = course.title;
    article.querySelector(".course-subtitle").textContent = course.subtitle;
    article.querySelector("ul").innerHTML = course.details.map((item) => `<li>${item}</li>`).join("");
    const infoSpans = article.querySelectorAll(".course-info span");
    infoSpans[0].textContent = course.time;
    infoSpans[1].textContent = course.place;
    infoSpans[2].textContent = course.price;
    article.querySelector(".tag-row").innerHTML = course.tags.map((tag) => `<em>${tag}</em>`).join("");
    article.querySelector(".add-course").addEventListener("click", () => addCourse(course.id));
    courseMenu.appendChild(article);
  });
}

function addCourse(id) {
  const course = courses.find((item) => item.id === id);
  if (!course) return;
  state.cart.set(id, course);
  renderCart();
}

function removeCourse(id) {
  state.cart.delete(id);
  renderCart();
}

function renderCart() {
  const list = [...state.cart.values()];
  totalCount.textContent = list.length;
  cartList.innerHTML = "";

  if (!list.length) {
    cartList.className = "cart-list empty";
    cartList.textContent = "尚未加入課程";
    return;
  }

  cartList.className = "cart-list";
  list.forEach((course) => {
    const row = document.createElement("div");
    row.className = "cart-row";
    row.innerHTML = `
      <div>
        <strong></strong>
        <span></span>
      </div>
      <button type="button" aria-label="移除課程">移除</button>
    `;
    row.querySelector("strong").textContent = course.title;
    row.querySelector("span").textContent = course.time;
    row.querySelector("button").addEventListener("click", () => removeCourse(course.id));
    cartList.appendChild(row);
  });
}

function buildSummary(formData) {
  const selected = [...state.cart.values()];
  if (!selected.length) return "尚未選擇課程。";

  return [
    "藍新科技課程點餐單",
    `姓名：${formData.get("name") || "未填"}`,
    `聯絡方式：${formData.get("contact") || "未填"}`,
    "",
    "已選課程：",
    ...selected.map((course, index) => [
      `${index + 1}. ${course.title}`,
      `   分類：${course.category}`,
      `   時間：${course.time}`,
      `   地點：${course.place}`,
      `   費用：${course.price}`
    ].join("\n")),
    "",
    `備註：${formData.get("note") || "無"}`
  ].join("\n");
}

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderMenu();
});

categorySelect.addEventListener("change", (event) => {
  state.category = event.target.value;
  renderMenu();
});

clearCart.addEventListener("click", () => {
  state.cart.clear();
  renderCart();
});

orderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  summaryText.textContent = buildSummary(new FormData(orderForm));
  summaryDialog.showModal();
});

copySummary.addEventListener("click", async () => {
  await navigator.clipboard.writeText(summaryText.textContent);
  copySummary.textContent = "已複製";
  setTimeout(() => {
    copySummary.textContent = "複製摘要";
  }, 1200);
});

closeSummary.addEventListener("click", () => summaryDialog.close());

renderMenu();
renderCart();
