const state = {
  direction: null,
  versions: [],
  prerequisite: null,
  project: null,
};

const metricLabels = {
  curriculum: "교육과정",
  feasibility: "현장성",
  engagement: "흥미",
  novelty: "참신성",
  safety: "안전",
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

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

function optionCard(option, index) {
  const metrics = Object.entries(option.metrics)
    .map(
      ([key, value]) => `
        <label class="metric-row">
          <span>${metricLabels[key]}</span>
          <input type="range" min="1" max="5" value="${value}" data-metric="${key}" />
          <b>${value}</b>
        </label>
      `,
    )
    .join("");
  return `
    <article class="option-card ${state.direction.selected_option_id === option.id ? "selected" : ""}" data-option-id="${option.id}">
      <button class="option-select" type="button" aria-label="${escapeHtml(option.name)} 선택">✓</button>
      <span class="option-index">OPTION ${String(index + 1).padStart(2, "0")}</span>
      <input class="option-name" value="${escapeHtml(option.name)}" aria-label="방향 이름" />
      <input class="option-tagline" value="${escapeHtml(option.tagline)}" aria-label="방향 한 줄 설명" />
      <span class="option-subtitle">방향 요약</span>
      <textarea class="option-summary">${escapeHtml(option.summary)}</textarea>
      <span class="option-subtitle">우선순위 · 한 줄에 하나</span>
      <textarea class="priority-editor">${escapeHtml(option.priorities.join("\n"))}</textarea>
      <span class="option-subtitle">비교 지표</span>
      <div class="metric-list">${metrics}</div>
      <span class="option-subtitle">강점과 주의점</span>
      <div class="strength-risk">
        <textarea class="option-strength" aria-label="강점">${escapeHtml(option.strength)}</textarea>
        <textarea class="option-risk" aria-label="주의점">${escapeHtml(option.risk)}</textarea>
      </div>
    </article>
  `;
}

function renderOptions() {
  const grid = document.querySelector("#optionGrid");
  grid.innerHTML = state.direction.options.map(optionCard).join("");
  grid.querySelectorAll(".option-select").forEach((button) => {
    button.addEventListener("click", () => selectOption(button.closest(".option-card").dataset.optionId));
  });
  grid.querySelectorAll('input[type="range"]').forEach((input) => {
    input.addEventListener("input", () => {
      input.nextElementSibling.textContent = input.value;
    });
  });
  grid.querySelectorAll(".option-name, .option-summary").forEach((input) => {
    input.addEventListener("input", () => {
      if (input.closest(".option-card").classList.contains("selected")) {
        updateSelectedSummary();
      }
    });
  });
  updateSelectedSummary();
}

function selectOption(optionId) {
  state.direction.selected_option_id = optionId;
  document.querySelectorAll(".option-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.optionId === optionId);
  });
  updateSelectedSummary();
}

function updateSelectedSummary() {
  const selected = state.direction.options.find(
    (option) => option.id === state.direction.selected_option_id,
  );
  const selectedCard = document.querySelector(
    `.option-card[data-option-id="${state.direction.selected_option_id}"]`,
  );
  const selectedName = selectedCard?.querySelector(".option-name").value || selected.name;
  const selectedSummary = selectedCard?.querySelector(".option-summary").value || selected.summary;
  document.querySelector("#selectedDirectionName").textContent = selectedName;
  document.querySelector("#selectedDirectionReason").textContent = selectedSummary;
  document.querySelector("#policySelectedName").textContent = selectedName;
  document.querySelector("#sidebarSelection").textContent = selectedName;
}

function editableRows(items, type) {
  return items
    .map(
      (item, index) => `
        <div class="editable-row">
          <span class="editable-number">${String(index + 1).padStart(2, "0")}</span>
          <input value="${escapeHtml(item)}" aria-label="${type} ${index + 1}" />
          <button class="remove-row" type="button" aria-label="삭제">×</button>
        </div>
      `,
    )
    .join("");
}

function bindEditableList(list) {
  list.querySelectorAll(".remove-row").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".editable-row").remove();
      renumberList(list);
      updateCounts();
    });
  });
}

function renderLists() {
  const principles = document.querySelector("#principleList");
  const success = document.querySelector("#successList");
  principles.innerHTML = editableRows(state.direction.common_principles, "공통 개발 원칙");
  success.innerHTML = editableRows(state.direction.success_criteria, "성공 기준");
  bindEditableList(principles);
  bindEditableList(success);
  updateCounts();
}

function renumberList(list) {
  list.querySelectorAll(".editable-number").forEach((number, index) => {
    number.textContent = String(index + 1).padStart(2, "0");
  });
}

function addListItem(listId, placeholder) {
  const list = document.querySelector(`#${listId}`);
  const values = [...list.querySelectorAll("input")].map((input) => input.value);
  if (values.length >= 20) {
    showToast("항목은 20개까지 추가할 수 있습니다.");
    return;
  }
  list.innerHTML = editableRows([...values, placeholder], "새 항목");
  bindEditableList(list);
  list.querySelector(".editable-row:last-child input").select();
  updateCounts();
}

function updateCounts() {
  document.querySelector("#principleCount").textContent =
    `${document.querySelectorAll("#principleList input").length}개`;
  document.querySelector("#successCount").textContent =
    `${document.querySelectorAll("#successList input").length}개`;
}

function renderDirection() {
  const direction = state.direction;
  document.querySelector("#directionTitle").value = direction.title;
  document.querySelector("#directionPurpose").value = direction.purpose;
  document.querySelector("#targetLearner").value = direction.target_learner;
  document.querySelector("#policyLesson").value = direction.policies.lesson_experience;
  document.querySelector("#policySafety").value = direction.policies.safety_inclusion;
  document.querySelector("#policyAssessment").value = direction.policies.assessment;
  document.querySelector("#policyDigital").value = direction.policies.digital;
  document.querySelector("#policyLanguage").value = direction.policies.language_visual;
  document.querySelector("#directionVersion").textContent = direction.version;
  document.querySelector("#directionSaveState").textContent =
    `v${direction.version} · ${formatDate(direction.updated_at)}`;
  renderOptions();
  renderLists();
}

function renderContext() {
  document.querySelector("#analysisContext").textContent =
    `${state.prerequisite.analysis_title} · v${state.prerequisite.analysis_version}`;
  document.querySelector("#projectContext").textContent =
    `${state.project.school_level} ${state.project.subject} ${state.project.grades[0]}~${state.project.grades.at(-1)}학년`;
}

function renderGate() {
  const ready = state.prerequisite.is_ready;
  const gate = document.querySelector("#directionGate");
  gate.classList.toggle("ready", ready);
  document.querySelector("#approveDirectionButton").disabled = !ready;
  document.querySelector("#directionGateTitle").textContent = ready
    ? state.direction.status === "approved"
      ? "교과서 개발 방향이 승인되었습니다."
      : "개발 방향을 확정할 수 있습니다."
    : "교육과정 분석 승인 전 초안";
  document.querySelector("#directionGateDescription").textContent = ready
    ? "선택한 방향과 공통 정책을 확정하면 4단계의 기본 조건으로 사용합니다."
    : `2단계 교육과정 분석 v${state.prerequisite.analysis_version}이 아직 승인되지 않았습니다. 편집과 버전 저장은 가능합니다.`;
}

function collectOptions() {
  return [...document.querySelectorAll(".option-card")].map((card) => {
    const original = state.direction.options.find((option) => option.id === card.dataset.optionId);
    const metrics = {};
    card.querySelectorAll("[data-metric]").forEach((input) => {
      metrics[input.dataset.metric] = Number(input.value);
    });
    return {
      id: original.id,
      name: card.querySelector(".option-name").value,
      tagline: card.querySelector(".option-tagline").value,
      summary: card.querySelector(".option-summary").value,
      priorities: card
        .querySelector(".priority-editor")
        .value.split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      metrics,
      strength: card.querySelector(".option-strength").value,
      risk: card.querySelector(".option-risk").value,
    };
  });
}

function collectDirection() {
  return {
    title: document.querySelector("#directionTitle").value,
    purpose: document.querySelector("#directionPurpose").value,
    target_learner: document.querySelector("#targetLearner").value,
    selected_option_id: state.direction.selected_option_id,
    options: collectOptions(),
    common_principles: [...document.querySelectorAll("#principleList input")].map(
      (input) => input.value,
    ),
    policies: {
      lesson_experience: document.querySelector("#policyLesson").value,
      safety_inclusion: document.querySelector("#policySafety").value,
      assessment: document.querySelector("#policyAssessment").value,
      digital: document.querySelector("#policyDigital").value,
      language_visual: document.querySelector("#policyLanguage").value,
    },
    success_criteria: [...document.querySelectorAll("#successList input")].map(
      (input) => input.value,
    ),
    change_note: document.querySelector("#directionChangeNote").value,
  };
}

async function saveDirection() {
  document.querySelector("#directionSaveState").textContent = "저장 중…";
  try {
    const payload = await request("/api/direction", {
      method: "PATCH",
      body: JSON.stringify(collectDirection()),
    });
    state.direction = payload.direction;
    document.querySelector("#directionChangeNote").value = "";
    await refresh();
    renderDirection();
    renderGate();
    showToast(`개발 방향 v${state.direction.version}을 저장했습니다.`);
  } catch (error) {
    document.querySelector("#directionSaveState").textContent = "저장 실패";
    showToast(error.message);
  }
}

async function regenerateDirection(event) {
  event.preventDefault();
  try {
    const payload = await request("/api/direction/generate", { method: "POST" });
    state.direction = payload.direction;
    document.querySelector("#directionGenerateDialog").close();
    await refresh();
    renderDirection();
    renderGate();
    showToast(`개발 방향 3개 안 v${state.direction.version}을 생성했습니다.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function approveDirection() {
  try {
    const payload = await request("/api/direction/approve", { method: "POST" });
    state.direction = payload.direction;
    await refresh();
    renderDirection();
    renderGate();
    showToast("교과서 개발 방향을 확정했습니다.");
  } catch (error) {
    showToast(error.message);
  }
}

function openTab(name) {
  document.querySelectorAll(".direction-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".direction-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === name);
  });
}

function renderVersions() {
  document.querySelector("#directionVersionList").innerHTML = state.versions
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

async function refresh() {
  const payload = await request("/api/direction/bootstrap");
  state.versions = payload.versions;
  state.prerequisite = payload.prerequisite;
  renderVersions();
}

async function load() {
  const payload = await request("/api/direction/bootstrap");
  state.direction = payload.direction;
  state.versions = payload.versions;
  state.prerequisite = payload.prerequisite;
  state.project = payload.project;
  renderDirection();
  renderContext();
  renderGate();
  renderVersions();
}

document.querySelector("#saveDirectionButton").addEventListener("click", saveDirection);
document.querySelector("#generateDirectionButton").addEventListener("click", () => {
  document.querySelector("#directionGenerateDialog").showModal();
});
document.querySelector("#confirmDirectionGenerate").addEventListener("click", regenerateDirection);
document.querySelector("#approveDirectionButton").addEventListener("click", approveDirection);
document.querySelector("#addPrincipleButton").addEventListener("click", () => {
  addListItem("principleList", "새로운 공통 개발 원칙을 입력하세요.");
});
document.querySelector("#addSuccessButton").addEventListener("click", () => {
  addListItem("successList", "새로운 성공 기준을 입력하세요.");
});
document.querySelectorAll(".direction-tab").forEach((tab) => {
  tab.addEventListener("click", () => openTab(tab.dataset.tab));
});
document.querySelectorAll("[data-open-tab]").forEach((button) => {
  button.addEventListener("click", () => openTab(button.dataset.openTab));
});

load().catch((error) => {
  document.querySelector("#directionSaveState").textContent = "연결 실패";
  showToast(error.message);
});
