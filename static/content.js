const state = {
  content: null,
  summary: null,
  standards: [],
  standardMap: new Map(),
  assignments: [],
  versions: [],
  prerequisite: null,
  gradeFilter: "3",
  unitClipboard: null,
  smallUnitClipboard: null,
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
      selected_count: 0,
      domains: { 운동: 0, 스포츠: 0, 표현: 0 },
      high_risk_count: 0,
      covered_codes: new Set(),
    };
  });
  const assigned = new Map();
  state.assignments.forEach((assignment) => {
    const standard = state.standardMap.get(assignment.code);
    const key = `${assignment.grade}-${standard.domain}`;
    if (!assigned.has(key)) assigned.set(key, new Set());
    assigned.get(key).add(assignment.code);
  });
  state.content.candidates.forEach((candidate) => {
    candidate.selected_grades.forEach((grade) => {
      const gradeData = grades[String(grade)];
      gradeData.selected_count += 1;
      gradeData.domains[candidate.domain] += 1;
      if (candidate.safety_risk === "높음") gradeData.high_risk_count += 1;
      (assigned.get(`${grade}-${candidate.domain}`) || []).forEach((code) => {
        gradeData.covered_codes.add(code);
      });
    });
  });
  const allCovered = new Set();
  Object.values(grades).forEach((grade) => {
    grade.covered_codes.forEach((code) => allCovered.add(code));
    grade.covered_count = grade.covered_codes.size;
    grade.all_domains_selected = Object.values(grade.domains).every((count) => count > 0);
  });
  const allCodes = new Set(state.assignments.map((assignment) => assignment.code));
  state.summary = {
    grades,
    selected_candidate_count: state.content.candidates.filter(
      (candidate) => candidate.selected_grades.length,
    ).length,
    total_candidate_count: state.content.candidates.length,
    covered_standard_count: allCovered.size,
    uncovered_codes: [...allCodes].filter((code) => !allCovered.has(code)),
    all_domains_selected: Object.values(grades).every((grade) => grade.all_domains_selected),
  };
}

function renderGradeSummary() {
  computeSummary();
  document.querySelector("#sidebarSelected").textContent = state.summary.selected_candidate_count;
  document.querySelector("#contentGradeGrid").innerHTML = [3, 4, 5, 6]
    .map((grade) => {
      const data = state.summary.grades[String(grade)];
      const assignedCount = state.assignments.filter((item) => item.grade === grade).length;
      const percent = assignedCount ? Math.round((data.covered_count / assignedCount) * 100) : 0;
      return `
        <article class="content-grade-card ${data.all_domains_selected ? "" : "invalid"}">
          <div class="content-grade-top"><strong>${grade}학년</strong><span>성취기준 ${data.covered_count}/${assignedCount}</span></div>
          <div class="content-grade-count"><b>${data.selected_count}</b><span>개 세부 영역 선정</span></div>
          <div class="coverage-bar"><i style="width:${percent}%"></i></div>
          <div class="content-grade-domains">
            <span>운동 ${data.domains["운동"]}</span>
            <span>스포츠 ${data.domains["스포츠"]}</span>
            <span>표현 ${data.domains["표현"]}</span>
          </div>
        </article>
      `;
    })
    .join("");
  renderSelectionMap();
  renderValidation();
  renderGate();
}

function linkedCodes(candidate, targetGrade = null) {
  const codes = new Set();
  const grades = targetGrade === null ? candidate.selected_grades : [targetGrade];
  grades.forEach((grade) => {
    state.assignments.forEach((assignment) => {
      const standard = state.standardMap.get(assignment.code);
      if (assignment.grade === grade && standard.domain === candidate.domain) {
        codes.add(assignment.code);
      }
    });
  });
  return [...codes];
}

function candidateCard(candidate) {
  const activeGrade = Number(state.gradeFilter);
  const domainNumber = { 운동: 1, 스포츠: 2, 표현: 3 }[candidate.domain];
  const isSelected = candidate.selected_grades.includes(activeGrade);
  const selectionToggle = `
    <label class="candidate-selection-toggle ${isSelected ? "checked" : ""}">
      <input type="checkbox" value="${activeGrade}" ${isSelected ? "checked" : ""} />
      <span>${isSelected ? "✓ 선정됨" : "+ 선정하기"}</span>
    </label>
  `;
  const priorities = ["핵심", "선택", "대체"]
    .map(
      (item) => `<option ${candidate.priority === item ? "selected" : ""}>${item}</option>`,
    )
    .join("");
  const risks = ["낮음", "보통", "높음"]
    .map(
      (item) => `<option ${candidate.safety_risk === item ? "selected" : ""}>${item}</option>`,
    )
    .join("");
  const activityGroups = candidate.activity_groups
    .map(
      (group, groupIndex) => `
        <section class="unit-group" data-group-index="${groupIndex}">
          <div class="unit-level-label">
            <div><span>신체활동 예시 · 중단원 기초</span><strong>${escapeHtml(group.official_title)}</strong></div>
            <div class="unit-card-actions">
              <button type="button" data-group-action="up" title="위로 이동">↑</button>
              <button type="button" data-group-action="down" title="아래로 이동">↓</button>
              <button type="button" data-group-action="copy">복사</button>
              <button type="button" data-group-action="duplicate">중단원 복제</button>
              <button type="button" data-group-action="delete">삭제</button>
            </div>
          </div>
          <label class="unit-title-field">
            <span>중단원명</span>
            <input class="middle-unit-input" value="${escapeHtml(group.middle_unit_title)}" />
          </label>
          <div class="small-unit-list">
            ${group.small_units
              .map(
                (small, smallIndex) => `
                  <div class="small-unit-row ${small.selected ? "" : "excluded"}" data-small-index="${smallIndex}">
                    <input class="small-unit-selected" type="checkbox" ${small.selected ? "checked" : ""} />
                    <input class="source-activity" value="${escapeHtml(small.source_activity)}" aria-label="소단원 소재" />
                    <span class="unit-arrow">→</span>
                    <input class="small-unit-title" value="${escapeHtml(small.draft_title)}" aria-label="${escapeHtml(small.source_activity)} 소단원명" />
                    <div class="small-unit-actions">
                      <button type="button" data-small-action="up" title="위로 이동">↑</button>
                      <button type="button" data-small-action="down" title="아래로 이동">↓</button>
                      <button type="button" data-small-action="copy">복사</button>
                      <button type="button" data-small-action="duplicate">복제</button>
                      <button type="button" data-small-action="delete">삭제</button>
                    </div>
                  </div>
                `,
              )
              .join("")}
          </div>
          <div class="unit-add-actions">
            <button class="add-small-unit" type="button">+ 소단원 카드 추가</button>
            <button class="paste-small-unit" type="button">소단원 붙여넣기</button>
          </div>
        </section>
      `,
    )
    .join("");
  return `
    <article class="activity-card ${isSelected ? "" : "unselected"}" data-id="${candidate.id}">
      <div class="activity-top">
        <div>
          <div class="activity-meta">
            <span class="activity-domain">${candidate.grade_band} · ${domainNumber}. ${candidate.domain}</span>
            <span class="official-source">공식 PDF ${candidate.source_page}쪽</span>
          </div>
          <span class="hierarchy-guide">${activeGrade}학년 ${domainNumber}. ${candidate.domain} 대단원 부제</span>
          <input class="activity-name" value="${escapeHtml(candidate.subdomain)}" aria-label="대단원 부제" />
        </div>
        ${selectionToggle}
      </div>
      <div class="unit-groups">${activityGroups}</div>
      <div class="unit-add-actions">
        <button class="add-unit-group" type="button">+ 중단원 카드 추가</button>
        <button class="paste-unit-group" type="button">중단원 붙여넣기</button>
      </div>
      <div class="activity-controls">
        <select class="priority-input" aria-label="우선순위">${priorities}</select>
        <label class="feasibility-control">
          <input type="range" min="1" max="5" value="${candidate.feasibility}" aria-label="현장 실행 가능성" />
          <b>${candidate.feasibility}</b>
        </label>
        <select class="risk-input" aria-label="안전 위험도">${risks}</select>
      </div>
      <details class="activity-details">
        <summary>시설·안전·선정 근거 편집</summary>
        <div class="activity-details-grid">
          <div><label>시설·도구 조건</label><textarea class="facilities-input">${escapeHtml(candidate.facilities)}</textarea></div>
          <div><label>안전 대책</label><textarea class="safety-input">${escapeHtml(candidate.safety_note)}</textarea></div>
          <div class="wide"><label>선정 근거</label><input class="rationale-input" value="${escapeHtml(candidate.rationale)}" /></div>
        </div>
      </details>
      <span class="linked-count">이 학년에서 연결되는 성취기준 ${linkedCodes(candidate, activeGrade).length}개</span>
    </article>
  `;
}

function renderCandidates() {
  const search = document.querySelector("#contentSearch").value.trim().toLowerCase();
  const domain = document.querySelector("#contentDomainFilter").value;
  const selectedOnly = document.querySelector("#selectedOnly").checked;
  const activeGrade = Number(state.gradeFilter);
  const activeBand = activeGrade <= 4 ? "3~4학년군" : "5~6학년군";
  const filtered = state.content.candidates.filter((candidate) => {
    const hierarchyText = candidate.activity_groups
      .map((group) => `${group.official_title} ${group.middle_unit_title} ${group.small_units.map((small) => `${small.source_activity} ${small.draft_title}`).join(" ")}`)
      .join(" ");
    const text = `${candidate.subdomain} ${hierarchyText}`.toLowerCase();
    return (
      candidate.grade_band === activeBand &&
      (domain === "all" || candidate.domain === domain) &&
      (!selectedOnly || candidate.selected_grades.includes(activeGrade)) &&
      (!search || text.includes(search))
    );
  });
  const grid = document.querySelector("#candidateGrid");
  grid.innerHTML = filtered.length
    ? filtered.map(candidateCard).join("")
    : '<div class="empty-candidates">조건에 맞는 후보가 없습니다.</div>';
  bindCandidateEvents();
}

function bindCandidateEvents() {
  document.querySelectorAll(".activity-card").forEach((card) => {
    const candidate = state.content.candidates.find((item) => item.id === card.dataset.id);
    const checkbox = card.querySelector('.candidate-selection-toggle input[type="checkbox"]');
    checkbox.addEventListener("change", () => {
      const grade = Number(checkbox.value);
      candidate.selected_grades = checkbox.checked
        ? [grade]
        : candidate.selected_grades.filter((item) => item !== grade);
      const toggle = checkbox.closest("label");
      toggle.classList.toggle("checked", checkbox.checked);
      toggle.querySelector("span").textContent = checkbox.checked ? "✓ 선정됨" : "+ 선정하기";
      card.classList.toggle("unselected", !checkbox.checked);
      renderGradeSummary();
      if (document.querySelector("#selectedOnly").checked && !checkbox.checked) {
        renderCandidates();
      }
    });
    card.querySelector(".activity-name").addEventListener("input", (event) => {
      candidate.subdomain = event.target.value;
      candidate.name = event.target.value;
    });
    card.querySelectorAll(".unit-group").forEach((groupElement) => {
      const groupIndex = Number(groupElement.dataset.groupIndex);
      const group = candidate.activity_groups[groupIndex];
      groupElement.querySelector(".middle-unit-input").addEventListener("input", (event) => {
        group.middle_unit_title = event.target.value;
      });
      groupElement.querySelectorAll("[data-group-action]").forEach((button) => {
        button.addEventListener("click", () => {
          const action = button.dataset.groupAction;
          if (action === "copy") {
            state.unitClipboard = JSON.parse(JSON.stringify(group));
            showToast("중단원 카드를 복사했습니다.");
            return;
          } else if (action === "duplicate") {
            candidate.activity_groups.splice(
              groupIndex + 1,
              0,
              JSON.parse(JSON.stringify(group)),
            );
          } else if (action === "delete" && candidate.activity_groups.length > 1) {
            candidate.activity_groups.splice(groupIndex, 1);
          } else if (action === "up" && groupIndex > 0) {
            [candidate.activity_groups[groupIndex - 1], candidate.activity_groups[groupIndex]] =
              [candidate.activity_groups[groupIndex], candidate.activity_groups[groupIndex - 1]];
          } else if (action === "down" && groupIndex < candidate.activity_groups.length - 1) {
            [candidate.activity_groups[groupIndex + 1], candidate.activity_groups[groupIndex]] =
              [candidate.activity_groups[groupIndex], candidate.activity_groups[groupIndex + 1]];
          } else {
            return;
          }
          renderCandidates();
        });
      });
      groupElement.querySelectorAll(".small-unit-row").forEach((smallElement) => {
        const smallIndex = Number(smallElement.dataset.smallIndex);
        const small = group.small_units[smallIndex];
        smallElement.querySelector(".small-unit-selected").addEventListener("change", (event) => {
          small.selected = event.target.checked;
          smallElement.classList.toggle("excluded", !small.selected);
        });
        smallElement.querySelector(".source-activity").addEventListener("input", (event) => {
          small.source_activity = event.target.value;
        });
        smallElement.querySelector(".small-unit-title").addEventListener("input", (event) => {
          small.draft_title = event.target.value;
        });
        smallElement.querySelectorAll("[data-small-action]").forEach((button) => {
          button.addEventListener("click", () => {
            const action = button.dataset.smallAction;
            if (action === "copy") {
              state.smallUnitClipboard = JSON.parse(JSON.stringify(small));
              showToast("소단원 카드를 복사했습니다.");
              return;
            } else if (action === "duplicate") {
              group.small_units.splice(
                smallIndex + 1,
                0,
                JSON.parse(JSON.stringify(small)),
              );
            } else if (action === "delete" && group.small_units.length > 1) {
              group.small_units.splice(smallIndex, 1);
            } else if (action === "up" && smallIndex > 0) {
              [group.small_units[smallIndex - 1], group.small_units[smallIndex]] =
                [group.small_units[smallIndex], group.small_units[smallIndex - 1]];
            } else if (action === "down" && smallIndex < group.small_units.length - 1) {
              [group.small_units[smallIndex + 1], group.small_units[smallIndex]] =
                [group.small_units[smallIndex], group.small_units[smallIndex + 1]];
            } else {
              return;
            }
            renderCandidates();
          });
        });
      });
      groupElement.querySelector(".add-small-unit").addEventListener("click", () => {
        group.small_units.push({
          source_activity: "새 활동",
          draft_title: "새 소단원",
          selected: true,
        });
        renderCandidates();
      });
      groupElement.querySelector(".paste-small-unit").addEventListener("click", () => {
        if (!state.smallUnitClipboard) {
          showToast("먼저 소단원 카드를 복사해 주세요.");
          return;
        }
        group.small_units.push(JSON.parse(JSON.stringify(state.smallUnitClipboard)));
        renderCandidates();
      });
    });
    card.querySelector(".add-unit-group").addEventListener("click", () => {
      candidate.activity_groups.push({
        official_title: "사용자 구성",
        middle_unit_title: "새 중단원",
        small_units: [
          { source_activity: "새 활동", draft_title: "새 소단원", selected: true },
        ],
      });
      renderCandidates();
    });
    card.querySelector(".paste-unit-group").addEventListener("click", () => {
      if (!state.unitClipboard) {
        showToast("먼저 중단원 카드를 복사해 주세요.");
        return;
      }
      candidate.activity_groups.push(JSON.parse(JSON.stringify(state.unitClipboard)));
      renderCandidates();
    });
    card.querySelector(".priority-input").addEventListener("change", (event) => {
      candidate.priority = event.target.value;
    });
    const range = card.querySelector(".feasibility-control input");
    range.addEventListener("input", () => {
      candidate.feasibility = Number(range.value);
      range.nextElementSibling.textContent = range.value;
    });
    card.querySelector(".risk-input").addEventListener("change", (event) => {
      candidate.safety_risk = event.target.value;
      renderGradeSummary();
    });
    card.querySelector(".facilities-input").addEventListener("input", (event) => {
      candidate.facilities = event.target.value;
    });
    card.querySelector(".safety-input").addEventListener("input", (event) => {
      candidate.safety_note = event.target.value;
    });
    card.querySelector(".rationale-input").addEventListener("input", (event) => {
      candidate.rationale = event.target.value;
    });
  });
}

function renderSelectionMap() {
  document.querySelector("#selectionMap").innerHTML = [3, 4, 5, 6]
    .map((grade) => {
      const rows = ["운동", "스포츠", "표현"]
        .map((domain) => {
          const names = state.content.candidates
            .filter(
              (candidate) =>
                candidate.domain === domain && candidate.selected_grades.includes(grade),
            )
            .map((candidate) => candidate.subdomain);
          const standards = state.assignments.filter(
            (assignment) =>
              assignment.grade === grade &&
              state.standardMap.get(assignment.code).domain === domain,
          );
          return `
            <div class="selection-domain-row">
              <strong>${domain}</strong>
              <p>${names.length ? names.map(escapeHtml).join(" · ") : "선정된 내용 없음"}</p>
              <span>성취기준 ${names.length ? standards.length : 0}/${standards.length}</span>
            </div>
          `;
        })
        .join("");
      const gradeData = state.summary.grades[String(grade)];
      return `
        <article class="selection-grade">
          <header><strong>${grade}학년</strong><span>${gradeData.selected_count}개 선택 · 고위험 ${gradeData.high_risk_count}개</span></header>
          ${rows}
        </article>
      `;
    })
    .join("");
}

function renderValidation() {
  const checks = [
    {
      ok: state.summary.all_domains_selected,
      text: "3~6학년 운동·스포츠·표현 영역 포함",
    },
    {
      ok: state.summary.uncovered_codes.length === 0,
      text: `성취기준 49개 연결 (${state.summary.covered_standard_count}/49)`,
    },
    {
      ok: state.content.candidates
        .filter((candidate) => candidate.selected_grades.length && candidate.safety_risk === "높음")
        .every((candidate) => candidate.safety_note.trim()),
      text: "고위험 활동 안전 대책 작성",
    },
    {
      ok: state.content.candidates
        .filter((candidate) => candidate.selected_grades.length)
        .every((candidate) => candidate.feasibility >= 1),
      text: "선택 후보 현장 실행 가능성 평가",
    },
  ];
  document.querySelector("#contentValidation").innerHTML = checks
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
  const contentReady =
    state.summary.all_domains_selected && state.summary.uncovered_codes.length === 0;
  const ready = state.prerequisite.is_ready && contentReady;
  document.querySelector("#approveContentButton").disabled = !ready;
  document.querySelector("#contentGate").classList.toggle("ready", ready);
  if (!state.prerequisite.is_ready) {
    document.querySelector("#contentGateTitle").textContent = "차시 배분 승인 전 초안";
    document.querySelector("#contentGateDescription").textContent =
      `4단계 배분안 v${state.prerequisite.allocation_version}이 아직 승인되지 않았습니다.`;
  } else if (!contentReady) {
    document.querySelector("#contentGateTitle").textContent = "선정 결과를 보완해 주세요.";
    document.querySelector("#contentGateDescription").textContent =
      "각 학년의 세 영역과 성취기준 연결 검사를 통과해야 합니다.";
  } else {
    document.querySelector("#contentGateTitle").textContent =
      state.content.status === "approved"
        ? "내용·종목 선정안이 승인되었습니다."
        : "내용·종목 선정안을 확정할 수 있습니다.";
    document.querySelector("#contentGateDescription").textContent =
      "학년별 영역과 49개 성취기준이 모두 연결되었습니다.";
  }
}

function renderHeader() {
  document.querySelector("#contentTitle").value = state.content.title;
  document.querySelector("#selectionNote").value = state.content.selection_note;
  document.querySelector("#contentSaveState").textContent =
    `v${state.content.version} · ${formatDate(state.content.updated_at)}`;
}

function renderVersions() {
  document.querySelector("#contentVersionList").innerHTML = state.versions
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

function renderAll() {
  renderHeader();
  renderGradeSummary();
  renderCandidates();
  renderVersions();
}

function collectContent() {
  return {
    title: document.querySelector("#contentTitle").value,
    selection_note: document.querySelector("#selectionNote").value,
    candidates: state.content.candidates,
    change_note: document.querySelector("#contentChangeNote").value,
  };
}

async function saveContent() {
  document.querySelector("#contentSaveState").textContent = "저장 중…";
  try {
    const payload = await request("/api/content", {
      method: "PATCH",
      body: JSON.stringify(collectContent()),
    });
    state.content = payload.content;
    state.summary = payload.summary;
    document.querySelector("#contentChangeNote").value = "";
    await refresh();
    renderAll();
    showToast(`내용·종목 선정안 v${state.content.version}을 저장했습니다.`);
  } catch (error) {
    document.querySelector("#contentSaveState").textContent = "저장 실패";
    showToast(error.message);
  }
}

async function regenerateContent(event) {
  event.preventDefault();
  try {
    const payload = await request("/api/content/generate", { method: "POST" });
    state.content = payload.content;
    state.summary = payload.summary;
    document.querySelector("#contentGenerateDialog").close();
    await refresh();
    renderAll();
    showToast(`AI 내용·종목 후보안 v${state.content.version}을 생성했습니다.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function approveContent() {
  try {
    const payload = await request("/api/content/approve", { method: "POST" });
    state.content = payload.content;
    await refresh();
    renderAll();
    showToast("학년별 내용·종목 선정안을 확정했습니다.");
  } catch (error) {
    showToast(error.message);
  }
}

async function refresh() {
  const payload = await request("/api/content/bootstrap");
  state.versions = payload.versions;
  state.prerequisite = payload.prerequisite;
}

function openTab(name) {
  document.querySelectorAll(".content-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".content-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === name);
  });
}

async function load() {
  const payload = await request("/api/content/bootstrap");
  state.content = payload.content;
  state.summary = payload.summary;
  state.standards = payload.standards;
  state.standardMap = new Map(payload.standards.map((standard) => [standard.code, standard]));
  state.assignments = payload.allocation_assignments;
  state.versions = payload.versions;
  state.prerequisite = payload.prerequisite;
  renderAll();
}

document.querySelector("#saveContentButton").addEventListener("click", saveContent);
document.querySelector("#generateContentButton").addEventListener("click", () => {
  document.querySelector("#contentGenerateDialog").showModal();
});
document.querySelector("#confirmContentGenerate").addEventListener("click", regenerateContent);
document.querySelector("#approveContentButton").addEventListener("click", approveContent);
document.querySelector("#contentSearch").addEventListener("input", renderCandidates);
document.querySelector("#contentDomainFilter").addEventListener("change", renderCandidates);
document.querySelector("#selectedOnly").addEventListener("change", renderCandidates);
document.querySelectorAll("#contentGradeFilters button").forEach((button) => {
  button.addEventListener("click", () => {
    state.gradeFilter = button.dataset.grade;
    document.querySelectorAll("#contentGradeFilters button").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    renderCandidates();
  });
});
document.querySelectorAll(".content-tab").forEach((tab) => {
  tab.addEventListener("click", () => openTab(tab.dataset.tab));
});

load().catch((error) => {
  document.querySelector("#contentSaveState").textContent = "연결 실패";
  showToast(error.message);
});
