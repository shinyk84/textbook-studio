const state = {
  allocation: null,
  summary: null,
  standards: [],
  standardMap: new Map(),
  versions: [],
  prerequisite: null,
  gradeFilter: "all",
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function computeSummary() {
  const grades = {};
  [3, 4, 5, 6].forEach((grade) => {
    grades[String(grade)] = {
      target: Number(state.allocation.target_hours[String(grade)]),
      allocated: 0,
      standard_count: 0,
      domains: { 운동: 0, 스포츠: 0, 표현: 0 },
    };
  });
  state.allocation.assignments.forEach((assignment) => {
    const grade = grades[String(assignment.grade)];
    const standard = state.standardMap.get(assignment.code);
    grade.allocated += Number(assignment.hours);
    grade.standard_count += 1;
    grade.domains[standard.domain] += Number(assignment.hours);
  });
  Object.values(grades).forEach((grade) => {
    grade.difference = grade.allocated - grade.target;
    grade.is_balanced = grade.difference === 0;
  });
  state.summary = {
    grades,
    total_allocated: Object.values(grades).reduce((sum, grade) => sum + grade.allocated, 0),
    all_balanced: Object.values(grades).every((grade) => grade.is_balanced),
    zero_hour_codes: state.allocation.assignments
      .filter((assignment) => Number(assignment.hours) === 0)
      .map((assignment) => assignment.code),
  };
}

function gradeSummaryCard(grade) {
  const item = state.summary.grades[String(grade)];
  const ratio = Math.min(100, Math.round((item.allocated / item.target) * 100));
  const diffText = item.difference === 0 ? "일치" : `${item.difference > 0 ? "+" : ""}${item.difference}`;
  return `
    <article class="grade-summary ${item.is_balanced ? "balanced" : "invalid"}" data-filter-grade="${grade}">
      <div class="grade-top"><strong>${grade}학년</strong><span>${item.standard_count}개 성취기준</span></div>
      <div class="hours-line"><b>${item.allocated}</b><span>/ ${item.target}차시</span><em>${diffText}</em></div>
      <div class="progress-track"><i style="width:${ratio}%"></i></div>
      <div class="grade-domains">
        <span>운동 ${item.domains["운동"]}</span>
        <span>스포츠 ${item.domains["스포츠"]}</span>
        <span>표현 ${item.domains["표현"]}</span>
      </div>
    </article>
  `;
}

function renderSummary() {
  computeSummary();
  document.querySelector("#gradeSummaryGrid").innerHTML = [3, 4, 5, 6]
    .map(gradeSummaryCard)
    .join("");
  document.querySelector("#sidebarHours").textContent = state.summary.total_allocated;
  renderMatrix();
  renderValidation();
  renderGate();
}

function assignmentRow(assignment) {
  const standard = state.standardMap.get(assignment.code);
  const validGrades = standard.grade_band === "3~4학년군" ? [3, 4] : [5, 6];
  const gradeOptions = validGrades
    .map(
      (grade) =>
        `<option value="${grade}" ${assignment.grade === grade ? "selected" : ""}>${grade}학년</option>`,
    )
    .join("");
  const treatments = ["기본", "중점", "연계"]
    .map(
      (item) =>
        `<option value="${item}" ${assignment.treatment === item ? "selected" : ""}>${item}</option>`,
    )
    .join("");
  return `
    <article class="assignment-row" data-code="${escapeHtml(assignment.code)}">
      <div class="standard-main">
        <div class="standard-meta">
          <span class="standard-code">${escapeHtml(standard.code)}</span>
          <span class="domain-pill">${escapeHtml(standard.grade_band)} · ${escapeHtml(standard.domain)}</span>
        </div>
        <p>${escapeHtml(standard.statement)}</p>
        <button class="explanation-toggle" type="button">성취기준 해설 보기</button>
        <div class="standard-explanation">${escapeHtml(standard.explanation)}</div>
      </div>
      <select class="grade-input" aria-label="배정 학년">${gradeOptions}</select>
      <input class="hours-input" type="number" min="0" max="40" value="${assignment.hours}" aria-label="배정 차시" />
      <select class="treatment-input" aria-label="집중도">${treatments}</select>
      <input class="sequence-input" type="number" min="1" value="${assignment.sequence}" aria-label="학습 순서" />
      <input class="rationale-input" value="${escapeHtml(assignment.rationale)}" aria-label="배치 근거" />
    </article>
  `;
}

function renderAssignments() {
  const search = document.querySelector("#allocationSearch").value.trim().toLowerCase();
  const domain = document.querySelector("#allocationDomainFilter").value;
  const filtered = state.allocation.assignments.filter((assignment) => {
    const standard = state.standardMap.get(assignment.code);
    const searchText = `${standard.code} ${standard.statement} ${standard.explanation}`.toLowerCase();
    return (
      (state.gradeFilter === "all" || String(assignment.grade) === state.gradeFilter) &&
      (domain === "all" || standard.domain === domain) &&
      (!search || searchText.includes(search))
    );
  });
  const list = document.querySelector("#assignmentList");
  list.innerHTML = filtered.length
    ? filtered.map(assignmentRow).join("")
    : '<div class="empty-board">조건에 맞는 성취기준이 없습니다.</div>';
  bindAssignmentEvents();
}

function bindAssignmentEvents() {
  document.querySelectorAll(".assignment-row").forEach((row) => {
    const assignment = state.allocation.assignments.find(
      (item) => item.code === row.dataset.code,
    );
    row.querySelector(".explanation-toggle").addEventListener("click", (event) => {
      const explanation = row.querySelector(".standard-explanation");
      explanation.classList.toggle("open");
      event.currentTarget.textContent = explanation.classList.contains("open")
        ? "성취기준 해설 닫기"
        : "성취기준 해설 보기";
    });
    row.querySelector(".grade-input").addEventListener("change", (event) => {
      assignment.grade = Number(event.target.value);
      renderSummary();
      renderAssignments();
    });
    row.querySelector(".hours-input").addEventListener("input", (event) => {
      assignment.hours = Number(event.target.value || 0);
      renderSummary();
    });
    row.querySelector(".treatment-input").addEventListener("change", (event) => {
      assignment.treatment = event.target.value;
    });
    row.querySelector(".sequence-input").addEventListener("input", (event) => {
      assignment.sequence = Number(event.target.value || 1);
    });
    row.querySelector(".rationale-input").addEventListener("input", (event) => {
      assignment.rationale = event.target.value;
    });
  });
}

function renderMatrix() {
  const cells = ['<div class="matrix-cell header">영역</div>'];
  [3, 4, 5, 6].forEach((grade) => {
    cells.push(`<div class="matrix-cell header">${grade}학년</div>`);
  });
  ["운동", "스포츠", "표현", "합계"].forEach((domain) => {
    cells.push(`<div class="matrix-cell header">${domain}</div>`);
    [3, 4, 5, 6].forEach((grade) => {
      const data = state.summary.grades[String(grade)];
      const hours = domain === "합계" ? data.allocated : data.domains[domain];
      cells.push(
        `<div class="matrix-cell"><div><strong>${hours}</strong><small>차시</small></div></div>`,
      );
    });
  });
  document.querySelector("#domainMatrix").innerHTML = cells.join("");
}

function renderValidation() {
  const assignments = state.allocation.assignments;
  const checks = [
    { ok: assignments.length === 49, text: `성취기준 49개 배분 (${assignments.length}/49)` },
    {
      ok: new Set(assignments.map((item) => item.code)).size === 49,
      text: "성취기준 중복·누락 없음",
    },
    { ok: state.summary.all_balanced, text: "3~6학년 목표 차시 일치" },
    {
      ok: state.summary.zero_hour_codes.length === 0,
      text: `0차시 성취기준 없음 (${state.summary.zero_hour_codes.length}개)`,
    },
  ];
  document.querySelector("#validationChecks").innerHTML = checks
    .map(
      (check) => `
        <div class="validation-item ${check.ok ? "" : "fail"}">
          <i>${check.ok ? "✓" : "!"}</i><span>${check.text}</span>
        </div>
      `,
    )
    .join("");
}

function renderGate() {
  const prerequisiteReady = state.prerequisite.is_ready;
  const totalsReady = state.summary.all_balanced && state.summary.zero_hour_codes.length === 0;
  const button = document.querySelector("#approveAllocationButton");
  const gate = document.querySelector("#allocationGate");
  const ready = prerequisiteReady && totalsReady;
  button.disabled = !ready;
  gate.classList.toggle("ready", ready);
  if (!prerequisiteReady) {
    document.querySelector("#allocationGateTitle").textContent = "개발 방향 승인 전 초안";
    document.querySelector("#allocationGateDescription").textContent =
      `3단계 ${state.prerequisite.direction_name} v${state.prerequisite.direction_version}이 아직 승인되지 않았습니다.`;
  } else if (!totalsReady) {
    document.querySelector("#allocationGateTitle").textContent = "차시 불균형을 조정해 주세요.";
    document.querySelector("#allocationGateDescription").textContent =
      "각 학년 102차시와 0차시 성취기준 검사를 모두 통과해야 합니다.";
  } else {
    document.querySelector("#allocationGateTitle").textContent =
      state.allocation.status === "approved"
        ? "학년별 배분안이 승인되었습니다."
        : "학년별 배분안을 확정할 수 있습니다.";
    document.querySelector("#allocationGateDescription").textContent =
      "49개 성취기준과 학년별 목표 차시가 모두 일치합니다.";
  }
}

function collectAllocation() {
  return {
    title: document.querySelector("#allocationTitle").value,
    planning_note: document.querySelector("#planningNote").value,
    target_hours: state.allocation.target_hours,
    assignments: state.allocation.assignments,
    expected_version: state.allocation.version,
    change_note: document.querySelector("#allocationChangeNote").value,
  };
}

async function saveAllocation() {
  document.querySelector("#allocationSaveState").textContent = "저장 중…";
  try {
    const payload = await request("/api/allocation", {
      method: "PATCH",
      body: JSON.stringify(collectAllocation()),
    });
    state.allocation = payload.allocation;
    state.summary = payload.summary;
    document.querySelector("#allocationChangeNote").value = "";
    await refresh();
    renderAll();
    showToast(`배분안 v${state.allocation.version}을 저장했습니다.`);
  } catch (error) {
    document.querySelector("#allocationSaveState").textContent = "저장 실패";
    showToast(error.message);
  }
}

async function regenerateAllocation(event) {
  event.preventDefault();
  try {
    const payload = await request("/api/allocation/generate", { method: "POST" });
    state.allocation = payload.allocation;
    state.summary = payload.summary;
    document.querySelector("#allocationGenerateDialog").close();
    await refresh();
    renderAll();
    showToast(`AI 균형 배분안 v${state.allocation.version}을 생성했습니다.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function approveAllocation() {
  try {
    const payload = await request("/api/allocation/approve", { method: "POST" });
    state.allocation = payload.allocation;
    await refresh();
    renderAll();
    showToast("학년별 성취기준·차시 배분안을 확정했습니다.");
  } catch (error) {
    showToast(error.message);
  }
}

function renderVersions() {
  document.querySelector("#allocationVersionList").innerHTML = state.versions
    .map(
      (version) => `
        <div class="version-row">
          <strong>v${version.version}</strong>
          <span class="version-status ${version.status}">${version.status === "approved" ? "승인" : "초안"}</span>
          <span>${escapeHtml(version.change_note)}</span>
          <span class="version-date">${formatDate(version.created_at)}</span>
        </div>
      `,
    )
    .join("");
}

function renderHeader() {
  document.querySelector("#allocationTitle").value = state.allocation.title;
  document.querySelector("#planningNote").value = state.allocation.planning_note;
  document.querySelector("#allocationSaveState").textContent =
    `v${state.allocation.version} · ${formatDate(state.allocation.updated_at)}`;
  document.querySelector("#directionContext").textContent = state.prerequisite.direction_name;
  document.querySelector("#directionStatus").textContent =
    `${state.prerequisite.direction_status === "approved" ? "승인" : "초안"} · v${state.prerequisite.direction_version}`;
}

function renderAll() {
  renderHeader();
  renderSummary();
  renderAssignments();
  renderVersions();
}

async function refresh() {
  const payload = await request("/api/allocation/bootstrap");
  state.versions = payload.versions;
  state.prerequisite = payload.prerequisite;
}

function openTab(name) {
  document.querySelectorAll(".allocation-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".allocation-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === name);
  });
}

async function load() {
  const payload = await request("/api/allocation/bootstrap");
  state.allocation = payload.allocation;
  state.summary = payload.summary;
  state.standards = payload.standards;
  state.standardMap = new Map(payload.standards.map((standard) => [standard.code, standard]));
  state.versions = payload.versions;
  state.prerequisite = payload.prerequisite;
  renderAll();
}

document.querySelector("#saveAllocationButton").addEventListener("click", saveAllocation);
document.querySelector("#generateAllocationButton").addEventListener("click", () => {
  document.querySelector("#allocationGenerateDialog").showModal();
});
document.querySelector("#confirmAllocationGenerate").addEventListener("click", regenerateAllocation);
document.querySelector("#approveAllocationButton").addEventListener("click", approveAllocation);
document.querySelector("#allocationSearch").addEventListener("input", renderAssignments);
document.querySelector("#allocationDomainFilter").addEventListener("change", renderAssignments);
document.querySelectorAll("#gradeFilters button").forEach((button) => {
  button.addEventListener("click", () => {
    state.gradeFilter = button.dataset.grade;
    document.querySelectorAll("#gradeFilters button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    renderAssignments();
  });
});
document.querySelectorAll(".allocation-tab").forEach((tab) => {
  tab.addEventListener("click", () => openTab(tab.dataset.tab));
});

load().catch((error) => {
  document.querySelector("#allocationSaveState").textContent = "연결 실패";
  showToast(error.message);
});
