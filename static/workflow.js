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
    subtitle: "원하는 소단원만 불러와 펼침면 원고를 편집하고 AI로 다시 생성합니다.",
    editorTitle: "선택 소단원 원고 편집",
    generate: "✦ 선택 소단원 AI 생성",
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
  catalog: [],
  selectedSmallUnit: null,
  selection: { chapterId: "", sectionIndex: 0, smallUnitIndex: 0 },
  ai: null,
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
      if (stageKey === "manuscript") {
        state.selection = { chapterId: "", sectionIndex: 0, smallUnitIndex: 0 };
        state.selectedSmallUnit = null;
        renderAll();
        loadSelectedSmallUnit().catch((error) => showToast(error.message));
      } else {
        renderAll();
      }
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
      <article class="summary-card ${state.summary.page_count_valid ? "" : "invalid"}"><span>생성 쪽수</span><strong>${state.summary.generated_pages}/${state.summary.target_pages}</strong><small>목차 지정 쪽수와 대조</small></article>
      <article class="summary-card ${state.summary.valid ? "" : "invalid"}"><span>소단원 원고</span><strong>${state.summary.complete_small_units}/${state.summary.small_units}</strong><small>본문·활동·정리 포함</small></article>`;
    document.querySelector("#sidebarSummary").textContent = `${state.summary.generated_pages}/${state.summary.target_pages}쪽 생성`;
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
  const container = document.querySelector("#workflowWorkspace");
  const chapters = state.catalog.filter((chapter) => chapter.grade === state.grade);
  if (!state.selection.chapterId && chapters.length) state.selection.chapterId = chapters[0].id;
  const selectedChapter = chapters.find((chapter) => chapter.id === state.selection.chapterId) || chapters[0];
  const sections = selectedChapter?.sections || [];
  const selectedSection = sections[state.selection.sectionIndex] || sections[0];
  const smallUnits = selectedSection?.small_units || [];
  if (!smallUnits[state.selection.smallUnitIndex]) state.selection.smallUnitIndex = 0;
  const aiStatus = state.ai?.enabled
    ? `<span class="ai-ready">AI 연결됨 · ${escapeHtml(state.ai.model)}</span>`
    : '<span class="ai-missing">AI 키를 확인해 주세요</span>';
  const selector = `
    <section class="manuscript-selector">
      <div><p class="section-kicker">LOAD ONE SMALL UNIT</p><h2>편집할 소단원 선택</h2><small>선택한 소단원의 펼침면 원고만 불러옵니다.</small></div>
      <label><span>대단원</span><select id="chapterSelect">${chapters.map((chapter) => `<option value="${escapeHtml(chapter.id)}" ${chapter.id === selectedChapter?.id ? "selected" : ""}>${escapeHtml(chapter.large_unit_title)} · ${escapeHtml(chapter.subtitle)}</option>`).join("")}</select></label>
      <label><span>중단원</span><select id="sectionSelect">${sections.map((section) => `<option value="${section.index}" ${section.index === state.selection.sectionIndex ? "selected" : ""}>${escapeHtml(section.title)}</option>`).join("")}</select></label>
      <label><span>소단원</span><select id="smallUnitSelect">${smallUnits.map((unit) => `<option value="${unit.index}" ${unit.index === state.selection.smallUnitIndex ? "selected" : ""}>${escapeHtml(unit.title)} · ${unit.target_pages}쪽</option>`).join("")}</select></label>
      ${aiStatus}
      <button class="secondary-button" id="smallUnitExportButton" type="button" ${state.selectedSmallUnit ? "" : "disabled"}>⇩ 선택 소단원 HWPX 저장</button>
    </section>`;
  if (!state.selectedSmallUnit) {
    container.innerHTML = `${selector}<div class="small-unit-loading"><span class="loading-ring"></span><strong>선택한 소단원을 불러오는 중입니다.</strong></div>`;
    bindManuscriptSelectors(container);
    return;
  }
  const chapter = state.selectedSmallUnit.chapter;
  const section = state.selectedSmallUnit.section;
  const activity = state.selectedSmallUnit.small_unit;
  container.innerHTML = `${selector}
    <div class="chapter-stack"><article class="manuscript-chapter">
      <div class="chapter-heading"><div><span class="domain-chip">${chapter.grade}학년 · ${escapeHtml(chapter.domain)}</span><h3>${escapeHtml(chapter.large_unit_title)} · ${escapeHtml(chapter.subtitle)}</h3></div><span class="page-match">${activity.spreads?.length || 0}개 펼침면 · ${activity.target_pages}쪽</span></div>
      <section class="manuscript-section">
        <input class="section-title" value="${escapeHtml(section.title)}" aria-label="중단원명" disabled />
        <div class="manuscript-field"><label>중단원 본문</label><textarea class="section-body" disabled>${escapeHtml(section.body)}</textarea></div>
        <div class="activity-draft">
          <div class="small-unit-heading"><input class="activity-title" value="${escapeHtml(activity.title)}" aria-label="소단원명" /><span>${activity.spreads?.length || 0}개 펼침면 · ${activity.target_pages}쪽</span></div>
          <textarea class="activity-instruction">${escapeHtml(activity.instruction)}</textarea>
          <div class="spread-drafts selected-spreads">
            ${(activity.spreads || []).map((spread, spreadIndex) => `
              <article class="spread-draft" data-spread-index="${spreadIndex}">
                <div class="spread-heading">
                  <div><b>${spread.left_page}~${spread.right_page}쪽</b><span>${escapeHtml(spread.role)}</span></div>
                  <select class="spread-template" aria-label="펼침면 유형">${["기본 기능형","게임·적용형","탐구·평가형"].map((template) => `<option ${spread.layout_template === template ? "selected" : ""}>${template}</option>`).join("")}</select>
                </div>
                <input class="spread-title" value="${escapeHtml(spread.title)}" aria-label="펼침면 제목" />
                <textarea class="spread-intro" aria-label="펼침면 도입">${escapeHtml(spread.intro)}</textarea>
                <div class="spread-canvas">
                  ${["left", "right"].map((side) => `<section class="book-page ${side}">
                    <span class="book-page-number">${side === "left" ? spread.left_page : spread.right_page}쪽</span>
                    <div class="spread-activity-list">${spread.activities.filter((item) => item.placement === side).map((item) => {
                      const itemIndex = spread.activities.indexOf(item);
                      return `<article class="spread-activity" data-activity-index="${itemIndex}"><b>활동 ${item.number}</b><input class="spread-activity-title" value="${escapeHtml(item.title)}" /><textarea class="spread-activity-objective">${escapeHtml(item.objective)}</textarea><textarea class="spread-activity-method">${escapeHtml(item.method.join("\n"))}</textarea></article>`;
                    }).join("")}</div>
                    <div class="support-box-list">${spread.support_boxes.filter((_, index) => index % 2 === (side === "left" ? 0 : 1)).map((box) => {
                      const boxIndex = spread.support_boxes.indexOf(box);
                      return `<label class="support-box" data-support-index="${boxIndex}"><span>${escapeHtml(box.type)}</span><textarea>${escapeHtml(box.content)}</textarea></label>`;
                    }).join("")}</div>
                  </section>`).join("")}
                  <div class="across-spread">${spread.activities.filter((item) => item.placement === "across").map((item) => {
                    const itemIndex = spread.activities.indexOf(item);
                    return `<article class="spread-activity" data-activity-index="${itemIndex}"><b>활동 ${item.number} · 펼침면 공통</b><input class="spread-activity-title" value="${escapeHtml(item.title)}" /><textarea class="spread-activity-objective">${escapeHtml(item.objective)}</textarea><textarea class="spread-activity-method">${escapeHtml(item.method.join("\n"))}</textarea></article>`;
                  }).join("")}</div>
                </div>
                <textarea class="spread-wrap-up" aria-label="펼침면 정리">${escapeHtml(spread.wrap_up)}</textarea>
              </article>`).join("")}
          </div>
        </div>
      </section>
    </article></div>`;
  bindManuscriptSelectors(container);
  container.querySelector(".activity-title").addEventListener("input", (event) => { activity.title = event.target.value; });
  container.querySelector(".activity-instruction").addEventListener("input", (event) => { activity.instruction = event.target.value; });
  container.querySelectorAll(".spread-draft").forEach((spreadElement) => {
    const spread = activity.spreads[Number(spreadElement.dataset.spreadIndex)];
    spreadElement.querySelector(".spread-template").addEventListener("change", (event) => { spread.layout_template = event.target.value; });
    spreadElement.querySelector(".spread-title").addEventListener("input", (event) => { spread.title = event.target.value; });
    spreadElement.querySelector(".spread-intro").addEventListener("input", (event) => { spread.intro = event.target.value; });
    spreadElement.querySelector(".spread-wrap-up").addEventListener("input", (event) => { spread.wrap_up = event.target.value; });
    spreadElement.querySelectorAll(".spread-activity").forEach((itemElement) => {
      const item = spread.activities[Number(itemElement.dataset.activityIndex)];
      itemElement.querySelector(".spread-activity-title").addEventListener("input", (event) => { item.title = event.target.value; });
      itemElement.querySelector(".spread-activity-objective").addEventListener("input", (event) => { item.objective = event.target.value; });
      itemElement.querySelector(".spread-activity-method").addEventListener("input", (event) => { item.method = event.target.value.split("\n").filter(Boolean); });
    });
    spreadElement.querySelectorAll(".support-box").forEach((boxElement) => {
      const box = spread.support_boxes[Number(boxElement.dataset.supportIndex)];
      boxElement.querySelector("textarea").addEventListener("input", (event) => { box.content = event.target.value; });
    });
  });
}

function bindManuscriptSelectors(container) {
  const chapterSelect = container.querySelector("#chapterSelect");
  const sectionSelect = container.querySelector("#sectionSelect");
  const smallUnitSelect = container.querySelector("#smallUnitSelect");
  chapterSelect?.addEventListener("change", () => {
    state.selection = { chapterId: chapterSelect.value, sectionIndex: 0, smallUnitIndex: 0 };
    state.selectedSmallUnit = null;
    renderManuscript();
    loadSelectedSmallUnit().catch((error) => showToast(error.message));
  });
  sectionSelect?.addEventListener("change", () => {
    state.selection.sectionIndex = Number(sectionSelect.value);
    state.selection.smallUnitIndex = 0;
    state.selectedSmallUnit = null;
    renderManuscript();
    loadSelectedSmallUnit().catch((error) => showToast(error.message));
  });
  smallUnitSelect?.addEventListener("change", () => {
    state.selection.smallUnitIndex = Number(smallUnitSelect.value);
    state.selectedSmallUnit = null;
    renderManuscript();
    loadSelectedSmallUnit().catch((error) => showToast(error.message));
  });
  container.querySelector("#smallUnitExportButton")?.addEventListener("click", (event) => {
    exportSelectedSmallUnitHwpx(event.currentTarget);
  });
}

async function exportSelectedSmallUnitHwpx(button) {
  if (!state.selectedSmallUnit) return;
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "HWPX 생성 중…";
  try {
    const query = new URLSearchParams({
      chapter_id: state.selection.chapterId,
      section_index: state.selection.sectionIndex,
      small_unit_index: state.selection.smallUnitIndex,
    });
    const response = await fetch(`/api/manuscript/small-unit/export/hwpx?${query}`);
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || "HWPX 문서를 만들지 못했습니다.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("Content-Disposition") || "";
    const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const filename = encoded ? decodeURIComponent(encoded) : "소단원_원고초안.hwpx";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    showToast("선택한 소단원 원고를 HWPX로 저장했습니다.");
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function loadSelectedSmallUnit() {
  if (stageKey !== "manuscript") return;
  const chapters = state.catalog.filter((chapter) => chapter.grade === state.grade);
  const chapter = chapters.find((item) => item.id === state.selection.chapterId) || chapters[0];
  if (!chapter) return;
  state.selection.chapterId = chapter.id;
  const section = chapter.sections[state.selection.sectionIndex] || chapter.sections[0];
  state.selection.sectionIndex = section.index;
  const smallUnit = section.small_units[state.selection.smallUnitIndex] || section.small_units[0];
  state.selection.smallUnitIndex = smallUnit.index;
  const query = new URLSearchParams({
    chapter_id: state.selection.chapterId,
    section_index: state.selection.sectionIndex,
    small_unit_index: state.selection.smallUnitIndex,
  });
  state.selectedSmallUnit = await request(`/api/manuscript/small-unit?${query}`);
  renderManuscript();
}

function renderReview() {
  const container = document.querySelector("#workflowWorkspace");
  const severityLabel = { critical: "중대", major: "주요", minor: "권고" };
  const criterionStatus = { pass: "자동 확인", supplement: "보완 필요", manual: "인적 확인" };
  const scope = state.stage.review_scope || {};
  const scopeMode = ["all", "grade", "range"].includes(scope.mode) ? scope.mode : "all";
  container.innerHTML = `
    <section class="review-scope">
      <div><p class="section-kicker">REVIEW SCOPE</p><h2>심사할 원고 범위</h2><small>범위를 선택한 뒤 상단의 ‘모의심사 다시 실행’을 누르세요.</small></div>
      <label><span>범위</span><select id="reviewScopeMode"><option value="all" ${scopeMode === "all" ? "selected" : ""}>3~6학년 전체 원고</option><option value="grade" ${scopeMode === "grade" ? "selected" : ""}>한 학년 전체</option><option value="range" ${scopeMode === "range" ? "selected" : ""}>특정 쪽 범위</option></select></label>
      <label><span>학년</span><select id="reviewScopeGrade">${[3,4,5,6].map((grade) => `<option value="${grade}" ${Number(scope.grade || 3) === grade ? "selected" : ""}>${grade}학년</option>`).join("")}</select></label>
      <label><span>시작 쪽</span><input id="reviewStartPage" type="number" min="1" max="132" value="${scope.start_page || 1}" /></label>
      <label><span>끝 쪽</span><input id="reviewEndPage" type="number" min="1" max="132" value="${scope.end_page || 120}" /></label>
    </section>
    <div class="review-overall">
      <div class="review-score">${state.stage.overall_score}</div>
      <div><p class="section-kicker">OFFICIAL CRITERIA REVIEW</p><h2>${escapeHtml(state.stage.decision)}</h2><p>${escapeHtml(state.stage.review_note)}</p><small>심사 범위: ${escapeHtml(state.stage.review_scope?.label || "전체 원고")} · ${state.stage.review_scope?.pages_reviewed || 0}쪽 · 기준표 PDF ${escapeHtml(state.stage.criteria_source?.pdf_pages || "")}쪽 · ${state.stage.criteria_source?.item_count || 0}개 항목</small></div>
    </div>
    <div class="score-grid official-scores">${Object.entries(state.stage.scores).map(([label, score]) => `<article class="score-card"><span>${escapeHtml(label)}</span><strong>${score}<small>점</small></strong></article>`).join("")}</div>
    <section class="review-section">
      <div class="review-heading"><div><p class="section-kicker">22 REVIEW ITEMS</p><h2>검정기준 항목별 대조</h2></div><span>${state.stage.criteria_results?.length || 0}개</span></div>
      <div class="criteria-table-wrap"><table class="criteria-table"><thead><tr><th>번호</th><th>심사 영역·항목</th><th>판정</th><th>대조 근거</th></tr></thead><tbody>${(state.stage.criteria_results || []).map((item) => `
        <tr><td>${item.number}</td><td><small>${escapeHtml(item.area)}</small><strong>${escapeHtml(item.criterion)}</strong></td><td><span class="criterion-status ${item.status}">${criterionStatus[item.status]}</span></td><td>${escapeHtml(item.evidence)}<small>기준표 PDF ${item.source_page}쪽</small></td></tr>`).join("")}</tbody></table></div>
    </section>
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
  const syncScopeInputs = () => {
    const mode = document.querySelector("#reviewScopeMode").value;
    document.querySelector("#reviewScopeGrade").disabled = mode === "all";
    document.querySelector("#reviewStartPage").disabled = mode !== "range";
    document.querySelector("#reviewEndPage").disabled = mode !== "range";
  };
  document.querySelector("#reviewScopeMode").addEventListener("change", syncScopeInputs);
  syncScopeInputs();
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
  state.catalog = payload.catalog || [];
  state.ai = payload.ai || null;
  renderAll();
  if (stageKey === "manuscript") {
    await loadSelectedSmallUnit();
    document.querySelector("#generateButton").disabled = !state.ai?.enabled;
  }
}

async function save() {
  document.querySelector("#saveState").textContent = "저장 중…";
  try {
    if (stageKey === "manuscript") {
      if (!state.selectedSmallUnit) throw new Error("저장할 소단원을 먼저 선택해 주세요.");
      const body = {
        ...state.selection,
        chapter_id: state.selection.chapterId,
        section_index: state.selection.sectionIndex,
        small_unit_index: state.selection.smallUnitIndex,
        expected_version: state.selectedSmallUnit.manuscript_version,
        change_note: document.querySelector("#changeNote").value,
        small_unit: state.selectedSmallUnit.small_unit,
      };
      await request("/api/manuscript/small-unit", { method: "PATCH", body: JSON.stringify(body) });
      document.querySelector("#changeNote").value = "";
      await load();
      showToast(`선택한 소단원 원고를 v${state.stage.version}으로 저장했습니다.`);
      return;
    }
    const body = JSON.parse(JSON.stringify(state.stage));
    body.expected_version = state.stage.version;
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
  const selectedTitle = state.selectedSmallUnit?.small_unit?.title;
  const confirmation = stageKey === "manuscript"
    ? `‘${selectedTitle || "선택 소단원"}’ ${state.selectedSmallUnit?.small_unit?.target_pages || ""}쪽 원고만 AI로 다시 생성할까요?`
    : `${configs[stageKey].heading} 초안을 현재 상위 단계 기준으로 다시 생성할까요?`;
  if (!confirm(confirmation)) return;
  try {
    const options = { method: "POST" };
    let url = `/api/${stageKey}/generate`;
    if (stageKey === "manuscript") {
      if (!state.ai?.enabled) throw new Error("서버의 OpenAI API 키를 확인해 주세요.");
      if (!state.selectedSmallUnit) throw new Error("AI로 생성할 소단원을 먼저 선택해 주세요.");
      url = "/api/manuscript/small-unit/generate";
      options.body = JSON.stringify({
        chapter_id: state.selection.chapterId,
        section_index: state.selection.sectionIndex,
        small_unit_index: state.selection.smallUnitIndex,
        expected_version: state.selectedSmallUnit.manuscript_version,
      });
    } else if (stageKey === "review") {
      options.body = JSON.stringify({
        mode: document.querySelector("#reviewScopeMode").value,
        grade: Number(document.querySelector("#reviewScopeGrade").value),
        start_page: Number(document.querySelector("#reviewStartPage").value),
        end_page: Number(document.querySelector("#reviewEndPage").value),
      });
    }
    await request(url, options);
    await load();
    showToast(stageKey === "review"
      ? "독립 모의심사를 다시 실행했습니다."
      : stageKey === "manuscript"
        ? "선택한 소단원의 펼침면 원고를 AI로 생성했습니다."
        : "AI 초안을 다시 생성했습니다.");
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
