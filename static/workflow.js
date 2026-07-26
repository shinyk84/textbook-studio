const stageKey = location.pathname.replace("/", "") || "outline";
const configs = {
  outline: {
    number: "06",
    heading: "목차·쪽수·차시 설계",
    subtitle: "목차를 구성하면서 학년별 102차시와 본문·부록 108~132쪽을 동시에 맞춥니다.",
    editorTitle: "학년별 목차와 분량",
    generate: "✦ AI 목차·배분 재생성",
    approve: "목차·배분 확정",
  },
  design: {
    number: "07",
    heading: "단원 설계",
    subtitle: "각 대단원에 목표·핵심 질문·수업 흐름·평가·안전·포용 설계를 연결합니다.",
    editorTitle: "학년별 단원 설계서",
    generate: "✦ AI 단원 설계 재생성",
    approve: "단원 설계 확정",
  },
  manuscript: {
    number: "08",
    heading: "원고 초안",
    subtitle: "승인된 단원 설계를 근거로 도입·본문·활동·평가·안전 원고를 편집합니다.",
    editorTitle: "교과서 원고 편집",
    generate: "✦ AI 원고 재생성",
    approve: "원고 초안 확정",
  },
  review: {
    number: "09",
    heading: "자동 검증·모의심사",
    subtitle: "앞 단계의 선호와 해명을 배제하고 공식 기준과 현재 산출물만 독립적으로 심사합니다.",
    editorTitle: "독립 모의심사 결과",
    generate: "↻ 모의심사 다시 실행",
    approve: "최종 검토 확정",
  },
};

const state = {
  stage: null,
  summary: null,
  versions: [],
  prerequisite: null,
  project: null,
  grade: 3,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

function setupShell() {
  const config = configs[stageKey];
  document.title = `${config.heading} · 교과서 제작 스튜디오`;
  document.querySelector("#stageEyebrow").textContent = `STEP ${config.number} · ${stageKey.toUpperCase()}`;
  document.querySelector("#stageHeading").textContent = config.heading;
  document.querySelector("#stageSubtitle").textContent = config.subtitle;
  document.querySelector("#editorTitle").textContent = config.editorTitle;
  document.querySelector("#generateButton").textContent = config.generate;
  document.querySelector("#approveButton").textContent = config.approve;
  document.querySelector(`[data-nav-stage="${stageKey}"]`).classList.add("active");
  document.querySelectorAll("[data-nav-stage]").forEach((item) => {
    const itemKey = item.dataset.navStage;
    if (Object.keys(configs).indexOf(itemKey) < Object.keys(configs).indexOf(stageKey)) {
      item.classList.add("completed");
      item.insertAdjacentHTML("beforeend", '<span class="step-check">✓</span>');
    }
  });
}

function renderGradeFilters() {
  const container = document.querySelector("#workflowGradeFilters");
  if (stageKey === "review") {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = [3, 4, 5, 6]
    .map((grade) => `<button class="${state.grade === grade ? "active" : ""}" data-grade="${grade}" type="button">${grade}학년</button>`)
    .join("");
  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.grade = Number(button.dataset.grade);
      renderAll();
    });
  });
}

function renderSummary() {
  const container = document.querySelector("#workflowSummary");
  if (stageKey === "outline") {
    container.innerHTML = [3, 4, 5, 6].map((grade) => {
      const item = state.summary.grades[String(grade)];
      return `
        <article class="summary-card ${item.hours_valid && item.page_valid ? "" : "invalid"}">
          <span>${grade}학년 · ${item.unit_count}개 단원</span>
          <strong>${item.hours}/${item.target_hours}차시</strong>
          <small>본문·부록 ${item.pages}쪽 · 허용 108~132쪽</small>
        </article>`;
    }).join("");
    document.querySelector("#sidebarSummary").textContent =
      state.summary.valid ? "4개 학년 분량 정상" : "분량 조정 필요";
  } else if (stageKey === "design") {
    container.innerHTML = `
      <article class="summary-card ${state.summary.valid ? "" : "invalid"}"><span>전체 단원</span><strong>${state.summary.total_units}</strong><small>목차에서 연결</small></article>
      <article class="summary-card ${state.summary.valid ? "" : "invalid"}"><span>설계 완료</span><strong>${state.summary.complete_units}</strong><small>목표·평가·안전·포용 포함</small></article>`;
    document.querySelector("#sidebarSummary").textContent = `${state.summary.complete_units}/${state.summary.total_units}개 설계`;
  } else if (stageKey === "manuscript") {
    container.innerHTML = `
      <article class="summary-card"><span>대단원 원고</span><strong>${state.summary.chapters}</strong><small>학년별 목차 연결</small></article>
      <article class="summary-card ${state.summary.valid ? "" : "invalid"}"><span>중단원 본문</span><strong>${state.summary.complete_sections}/${state.summary.sections}</strong><small>본문 작성 상태</small></article>`;
    document.querySelector("#sidebarSummary").textContent = `${state.summary.complete_sections}/${state.summary.sections}개 본문`;
  } else {
    container.innerHTML = `
      <article class="summary-card ${state.summary.valid ? "" : "invalid"}"><span>종합 점수</span><strong>${state.summary.overall_score}</strong><small>100점 기준</small></article>
      <article class="summary-card ${state.summary.critical_count ? "invalid" : ""}"><span>중대 결함</span><strong>${state.summary.critical_count}</strong><small>통과 전 필수 보완</small></article>
      <article class="summary-card"><span>전체 지적</span><strong>${state.summary.finding_count}</strong><small>독립 심사 결과</small></article>`;
    document.querySelector("#sidebarSummary").textContent = `${state.summary.overall_score}점 · ${state.stage.decision}`;
  }
}

function renderGate() {
  const ready = state.prerequisite.is_ready && state.summary.valid;
  const gate = document.querySelector("#workflowGate");
  gate.classList.toggle("ready", ready);
  document.querySelector("#approveButton").disabled = !ready;
  if (!state.prerequisite.is_ready) {
    document.querySelector("#gateTitle").textContent = `${state.prerequisite.label} 승인 전 초안`;
    document.querySelector("#gateDescription").textContent =
      `이전 단계 v${state.prerequisite.version}을 먼저 승인해야 이 단계를 확정할 수 있습니다. 편집과 저장은 가능합니다.`;
  } else if (!state.summary.valid) {
    document.querySelector("#gateTitle").textContent = "자동 검증 보완 필요";
    document.querySelector("#gateDescription").textContent = "현재 단계의 필수 조건을 모두 충족해야 확정할 수 있습니다.";
  } else {
    document.querySelector("#gateTitle").textContent =
      state.stage.status === "approved" ? "이 단계가 승인되었습니다." : "현재 단계를 확정할 수 있습니다.";
    document.querySelector("#gateDescription").textContent = "이전 단계 승인과 현재 단계 자동 검증을 통과했습니다.";
  }
}

function renderOutline() {
  const gradeData = state.stage.grades[String(state.grade)];
  const container = document.querySelector("#workflowWorkspace");
  container.innerHTML = `<div class="unit-stack">${gradeData.units.map((unit, unitIndex) => `
    <article class="outline-unit" data-unit-index="${unitIndex}">
      <div class="unit-heading">
        <div><span class="domain-chip">${escapeHtml(unit.domain)}</span><h3>${escapeHtml(unit.large_unit_title)} · ${escapeHtml(unit.subtitle)}</h3></div>
        <div class="unit-actions"><button data-action="up">↑</button><button data-action="down">↓</button><button data-action="duplicate">복제</button><button data-action="delete">삭제</button></div>
      </div>
      <div class="outline-fields">
        <div class="field"><label>대단원명</label><input data-field="large_unit_title" value="${escapeHtml(unit.large_unit_title)}" /></div>
        <div class="field"><label>대단원 부제</label><input data-field="subtitle" value="${escapeHtml(unit.subtitle)}" /></div>
        <div class="field"><label>차시</label><input data-field="hours" type="number" min="0" value="${unit.hours}" /></div>
        <div class="field"><label>쪽수</label><input data-field="pages" type="number" min="0" value="${unit.pages}" /></div>
      </div>
      <div class="toc-tree">${unit.middle_units.map((middle, middleIndex) => `
        <div class="toc-middle" data-middle-index="${middleIndex}">
          <input class="middle-title" value="${escapeHtml(middle.title)}" aria-label="중단원명" />
          <div class="toc-small-list">${middle.small_units.map((small, smallIndex) => `<input class="toc-small" data-small-index="${smallIndex}" value="${escapeHtml(small.title)}" aria-label="소단원명" />`).join("")}</div>
        </div>`).join("")}
      </div>
    </article>`).join("")}</div>`;
  container.querySelectorAll(".outline-unit").forEach((card) => {
    const index = Number(card.dataset.unitIndex);
    const unit = gradeData.units[index];
    card.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("input", () => {
        unit[input.dataset.field] = input.type === "number" ? Number(input.value) : input.value;
        if (input.type === "number") recalculateOutlineSummary();
      });
    });
    card.querySelectorAll(".toc-middle").forEach((row) => {
      const middle = unit.middle_units[Number(row.dataset.middleIndex)];
      row.querySelector(".middle-title").addEventListener("input", (event) => { middle.title = event.target.value; });
      row.querySelectorAll(".toc-small").forEach((input) => {
        input.addEventListener("input", () => { middle.small_units[Number(input.dataset.smallIndex)].title = input.value; });
      });
    });
    card.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.action;
        if (action === "duplicate") {
          const copy = JSON.parse(JSON.stringify(unit));
          copy.id = `${copy.id}-copy-${Date.now()}`;
          gradeData.units.splice(index + 1, 0, copy);
        } else if (action === "delete" && gradeData.units.length > 1) gradeData.units.splice(index, 1);
        else if (action === "up" && index > 0) [gradeData.units[index - 1], gradeData.units[index]] = [gradeData.units[index], gradeData.units[index - 1]];
        else if (action === "down" && index < gradeData.units.length - 1) [gradeData.units[index + 1], gradeData.units[index]] = [gradeData.units[index], gradeData.units[index + 1]];
        else return;
        recalculateOutlineSummary();
        renderAll();
      });
    });
  });
}

function recalculateOutlineSummary() {
  Object.entries(state.stage.grades).forEach(([grade, gradeData]) => {
    const item = state.summary.grades[grade];
    item.hours = gradeData.units.reduce((sum, unit) => sum + Number(unit.hours), 0);
    item.pages = gradeData.units.reduce((sum, unit) => sum + Number(unit.pages), 0);
    item.unit_count = gradeData.units.length;
    item.hours_valid = item.hours === state.project.default_grade_hours;
    item.page_valid = item.pages >= state.project.page_min && item.pages <= state.project.page_max;
  });
  state.summary.valid = Object.values(state.summary.grades).every((item) => item.hours_valid && item.page_valid && item.unit_count);
  renderSummary();
  renderGate();
}

function renderDesign() {
  const units = state.stage.units.filter((unit) => unit.grade === state.grade);
  const fields = [
    ["essential_question", "핵심 질문"], ["learning_goal", "학습 목표"],
    ["lesson_flow", "수업 흐름"], ["assessment", "평가 설계"],
    ["materials", "시설·교구"], ["safety", "안전 설계"],
    ["inclusion", "포용·대체 활동"],
  ];
  const container = document.querySelector("#workflowWorkspace");
  container.innerHTML = `<div class="unit-stack">${units.map((unit) => `
    <article class="design-unit" data-id="${escapeHtml(unit.id)}">
      <div class="unit-heading"><div><span class="domain-chip">${unit.grade}학년 · ${escapeHtml(unit.domain)}</span><h3>${escapeHtml(unit.large_unit_title)} · ${escapeHtml(unit.subtitle)}</h3></div><span>${unit.hours}차시 · ${unit.pages}쪽</span></div>
      <div class="design-grid">${fields.map(([field, label], index) => `<label class="${index >= 2 ? "wide" : ""}"><span>${label}</span><textarea data-field="${field}">${escapeHtml(unit[field])}</textarea></label>`).join("")}</div>
    </article>`).join("")}</div>`;
  container.querySelectorAll(".design-unit").forEach((card) => {
    const unit = state.stage.units.find((item) => item.id === card.dataset.id);
    card.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", () => { unit[input.dataset.field] = input.value; }));
  });
}

function renderManuscript() {
  const chapters = state.stage.chapters.filter((chapter) => chapter.grade === state.grade);
  const container = document.querySelector("#workflowWorkspace");
  container.innerHTML = `<div class="chapter-stack">${chapters.map((chapter) => `
    <article class="manuscript-chapter" data-id="${escapeHtml(chapter.id)}">
      <div class="chapter-heading"><div><span class="domain-chip">${chapter.grade}학년 · ${escapeHtml(chapter.domain)}</span><h3>${escapeHtml(chapter.large_unit_title)} · ${escapeHtml(chapter.subtitle)}</h3></div></div>
      <div class="manuscript-field"><label>대단원 도입</label><textarea data-field="opening">${escapeHtml(chapter.opening)}</textarea></div>
      ${chapter.sections.map((section, sectionIndex) => `
        <section class="manuscript-section" data-section-index="${sectionIndex}">
          <input class="section-title" value="${escapeHtml(section.title)}" aria-label="중단원명" />
          <div class="manuscript-field"><label>중단원 본문</label><textarea class="section-body">${escapeHtml(section.body)}</textarea></div>
          ${section.activities.map((activity, activityIndex) => `
            <div class="activity-draft" data-activity-index="${activityIndex}">
              <input class="activity-title" value="${escapeHtml(activity.title)}" aria-label="소단원명" />
              <textarea class="activity-instruction">${escapeHtml(activity.instruction)}</textarea>
            </div>`).join("")}
        </section>`).join("")}
      <div class="design-grid">
        <label><span>평가 상자</span><textarea data-field="assessment_box">${escapeHtml(chapter.assessment_box)}</textarea></label>
        <label><span>안전 상자</span><textarea data-field="safety_box">${escapeHtml(chapter.safety_box)}</textarea></label>
      </div>
    </article>`).join("")}</div>`;
  container.querySelectorAll(".manuscript-chapter").forEach((card) => {
    const chapter = state.stage.chapters.find((item) => item.id === card.dataset.id);
    card.querySelectorAll(":scope > [data-field], :scope > .design-grid [data-field], :scope > .manuscript-field [data-field]").forEach((input) => {
      input.addEventListener("input", () => { chapter[input.dataset.field] = input.value; });
    });
    card.querySelectorAll(".manuscript-section").forEach((sectionElement) => {
      const section = chapter.sections[Number(sectionElement.dataset.sectionIndex)];
      sectionElement.querySelector(".section-title").addEventListener("input", (event) => { section.title = event.target.value; });
      sectionElement.querySelector(".section-body").addEventListener("input", (event) => { section.body = event.target.value; });
      sectionElement.querySelectorAll(".activity-draft").forEach((activityElement) => {
        const activity = section.activities[Number(activityElement.dataset.activityIndex)];
        activityElement.querySelector(".activity-title").addEventListener("input", (event) => { activity.title = event.target.value; });
        activityElement.querySelector(".activity-instruction").addEventListener("input", (event) => { activity.instruction = event.target.value; });
      });
    });
  });
}

function renderReview() {
  const container = document.querySelector("#workflowWorkspace");
  const severityLabel = { critical: "중대", major: "주요", minor: "권고" };
  container.innerHTML = `
    <div class="review-overall">
      <div class="review-score">${state.stage.overall_score}</div>
      <div><p class="section-kicker">INDEPENDENT VERDICT</p><h2>${escapeHtml(state.stage.decision)}</h2><p>${escapeHtml(state.stage.review_note)}</p></div>
    </div>
    <div class="score-grid">${Object.entries(state.stage.scores).map(([label, score]) => `<article class="score-card"><span>${escapeHtml(label)}</span><strong>${score}</strong></article>`).join("")}</div>
    <section class="review-section">
      <div class="review-heading"><div><p class="section-kicker">FINDINGS</p><h2>심사 지적 사항</h2></div><span>${state.stage.findings.length}건</span></div>
      <div class="finding-list">${state.stage.findings.length ? state.stage.findings.map((finding) => `
        <article class="finding ${finding.severity}">
          <span class="severity">${severityLabel[finding.severity]}</span><strong>${escapeHtml(finding.category)} · ${escapeHtml(finding.location)}</strong>
          <p>${escapeHtml(finding.message)}<br /><b>개선:</b> ${escapeHtml(finding.suggestion)}</p>
        </article>`).join("") : '<p>현재 중대·주요 지적 사항이 없습니다.</p>'}</div>
    </section>
    <section class="review-section"><p class="section-kicker">REVIEW MEMO</p><label class="manuscript-field"><span>최종 검토 메모</span><textarea id="reviewNote">${escapeHtml(state.stage.review_note)}</textarea></label></section>`;
  document.querySelector("#reviewNote").addEventListener("input", (event) => { state.stage.review_note = event.target.value; });
}

function renderWorkspace() {
  if (stageKey === "outline") renderOutline();
  else if (stageKey === "design") renderDesign();
  else if (stageKey === "manuscript") renderManuscript();
  else renderReview();
}

function renderVersions() {
  document.querySelector("#versionList").innerHTML = state.versions.map((version) => `
    <div class="version-row"><strong>v${version.version}</strong><span class="version-status">${version.status === "approved" ? "승인" : "초안"}</span><span>${escapeHtml(version.change_note)}</span><span class="version-date">${formatDate(version.created_at)}</span></div>`).join("");
}

function renderAll() {
  renderGradeFilters();
  renderSummary();
  renderGate();
  renderWorkspace();
  renderVersions();
  document.querySelector("#saveState").textContent = `v${state.stage.version} · ${formatDate(state.stage.updated_at)}`;
}

async function load() {
  const payload = await request(`/api/${stageKey}/bootstrap`);
  state.stage = payload.stage;
  state.summary = payload.summary;
  state.versions = payload.versions;
  state.prerequisite = payload.prerequisite;
  state.project = payload.project;
  renderAll();
}

async function save() {
  document.querySelector("#saveState").textContent = "저장 중…";
  try {
    const body = JSON.parse(JSON.stringify(state.stage));
    body.change_note = document.querySelector("#changeNote").value;
    const payload = await request(`/api/${stageKey}`, { method: "PATCH", body: JSON.stringify(body) });
    state.stage = payload.stage;
    state.summary = payload.summary;
    document.querySelector("#changeNote").value = "";
    await load();
    showToast(`${configs[stageKey].heading} v${state.stage.version}을 저장했습니다.`);
  } catch (error) {
    document.querySelector("#saveState").textContent = "저장 실패";
    showToast(error.message);
  }
}

async function regenerate() {
  if (!confirm(`${configs[stageKey].heading} 초안을 현재 상위 단계 기준으로 다시 생성할까요?`)) return;
  try {
    await request(`/api/${stageKey}/generate`, { method: "POST" });
    await load();
    showToast(stageKey === "review" ? "독립 모의심사를 다시 실행했습니다." : "AI 초안을 다시 생성했습니다.");
  } catch (error) { showToast(error.message); }
}

async function approve() {
  try {
    await request(`/api/${stageKey}/approve`, { method: "POST" });
    await load();
    showToast(`${configs[stageKey].heading}을 확정했습니다.`);
  } catch (error) { showToast(error.message); }
}

setupShell();
document.querySelector("#saveButton").addEventListener("click", save);
document.querySelector("#generateButton").addEventListener("click", regenerate);
document.querySelector("#approveButton").addEventListener("click", approve);
document.querySelectorAll(".workflow-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".workflow-tab").forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll(".workflow-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab.dataset.tab));
  });
});
load().catch((error) => {
  document.querySelector("#saveState").textContent = "연결 실패";
  showToast(error.message);
});
