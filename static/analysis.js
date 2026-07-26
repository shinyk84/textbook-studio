const state = {
  analysis: null,
  standards: [],
  statistics: null,
  versions: [],
  sourceReadiness: null,
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

function formatDate(value) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderAnalysis() {
  const analysis = state.analysis;
  document.querySelector("#analysisTitle").value = analysis.title;
  document.querySelector("#overview").value = analysis.overview;
  document.querySelector("#band34Summary").value = analysis.grade_bands["3~4학년군"].summary;
  document.querySelector("#band34Focus").value = analysis.grade_bands["3~4학년군"].focus;
  document.querySelector("#band34Assessment").value = analysis.grade_bands["3~4학년군"].assessment;
  document.querySelector("#band56Summary").value = analysis.grade_bands["5~6학년군"].summary;
  document.querySelector("#band56Focus").value = analysis.grade_bands["5~6학년군"].focus;
  document.querySelector("#band56Assessment").value = analysis.grade_bands["5~6학년군"].assessment;
  document.querySelector("#domainMovement").value = analysis.domains["운동"];
  document.querySelector("#domainSports").value = analysis.domains["스포츠"];
  document.querySelector("#domainExpression").value = analysis.domains["표현"];
  document.querySelector("#analysisVersion").textContent = analysis.version;
  document.querySelector("#analysisStatus").textContent =
    analysis.status === "approved" ? "승인된 분석" : "편집 중인 초안";
  document.querySelector("#analysisSaveState").textContent = `v${analysis.version} · ${formatDate(analysis.updated_at)}`;
  renderImplications(analysis.editorial_implications);
}

function renderMetrics() {
  const stats = state.statistics;
  document.querySelector("#totalStandards").textContent = stats.total;
  document.querySelector("#standardTabCount").textContent = stats.total;
  document.querySelector("#band34Count").textContent = stats.grade_bands["3~4학년군"];
  document.querySelector("#band56Count").textContent = stats.grade_bands["5~6학년군"];
  const movement = stats.domains["운동"];
  const sports = stats.domains["스포츠"];
  const expression = stats.domains["표현"];
  document.querySelector("#movementCount").textContent = `${movement}개 기준`;
  document.querySelector("#sportsCount").textContent = `${sports}개 기준`;
  document.querySelector("#expressionCount").textContent = `${expression}개 기준`;
  document.querySelector("#traceMovement").textContent = movement;
  document.querySelector("#traceSports").textContent = sports;
  document.querySelector("#traceExpression").textContent = expression;
}

function renderGate() {
  const gate = document.querySelector("#analysisGate");
  const button = document.querySelector("#approveAnalysisButton");
  const ready = state.sourceReadiness.is_ready;
  gate.classList.toggle("ready", ready);
  button.disabled = !ready;
  document.querySelector("#gateTitle").textContent = ready
    ? state.analysis.status === "approved"
      ? "교육과정 분석이 승인되었습니다."
      : "교육과정 분석을 확정할 수 있습니다."
    : "공식 자료 승인 전 초안";
  document.querySelector("#gateDescription").textContent = ready
    ? "현재 분석을 승인하면 다음 단계인 교과서 개발 방향 설정에서 기준으로 사용합니다."
    : `1단계 공식 자료 ${state.sourceReadiness.approved}/${state.sourceReadiness.total}건 승인 · 초안 편집과 버전 저장은 가능합니다.`;
}

function renderImplications(items) {
  const list = document.querySelector("#implicationList");
  list.innerHTML = items
    .map(
      (item, index) => `
        <div class="implication-row">
          <span class="implication-number">${String(index + 1).padStart(2, "0")}</span>
          <input value="${escapeHtml(item)}" aria-label="집필 시사점 ${index + 1}" />
          <button class="remove-implication" type="button" aria-label="삭제">×</button>
        </div>
      `,
    )
    .join("");
  list.querySelectorAll(".remove-implication").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest(".implication-row").remove();
      renumberImplications();
    });
  });
}

function renumberImplications() {
  document.querySelectorAll(".implication-number").forEach((number, index) => {
    number.textContent = String(index + 1).padStart(2, "0");
  });
}

function addImplication() {
  const inputs = [...document.querySelectorAll(".implication-row input")].map((input) => input.value);
  if (inputs.length >= 20) {
    showToast("집필 시사점은 20개까지 추가할 수 있습니다.");
    return;
  }
  renderImplications([...inputs, "새로운 집필 시사점을 입력하세요."]);
  document.querySelector(".implication-row:last-child input").select();
}

function collectAnalysis() {
  return {
    title: document.querySelector("#analysisTitle").value,
    overview: document.querySelector("#overview").value,
    grade_bands: {
      "3~4학년군": {
        summary: document.querySelector("#band34Summary").value,
        focus: document.querySelector("#band34Focus").value,
        assessment: document.querySelector("#band34Assessment").value,
      },
      "5~6학년군": {
        summary: document.querySelector("#band56Summary").value,
        focus: document.querySelector("#band56Focus").value,
        assessment: document.querySelector("#band56Assessment").value,
      },
    },
    domains: {
      운동: document.querySelector("#domainMovement").value,
      스포츠: document.querySelector("#domainSports").value,
      표현: document.querySelector("#domainExpression").value,
    },
    editorial_implications: [...document.querySelectorAll(".implication-row input")].map(
      (input) => input.value,
    ),
    change_note: document.querySelector("#changeNote").value,
  };
}

async function saveAnalysis() {
  document.querySelector("#analysisSaveState").textContent = "저장 중…";
  try {
    const payload = await request("/api/analysis", {
      method: "PATCH",
      body: JSON.stringify(collectAnalysis()),
    });
    state.analysis = payload.analysis;
    document.querySelector("#changeNote").value = "";
    await refreshAuxiliaryData();
    renderAnalysis();
    renderGate();
    showToast(`교육과정 분석 v${state.analysis.version}을 저장했습니다.`);
  } catch (error) {
    document.querySelector("#analysisSaveState").textContent = "저장 실패";
    showToast(error.message);
  }
}

async function regenerateAnalysis(event) {
  event.preventDefault();
  try {
    const payload = await request("/api/analysis/generate", { method: "POST" });
    state.analysis = payload.analysis;
    document.querySelector("#confirmGenerateDialog").close();
    await refreshAuxiliaryData();
    renderAnalysis();
    renderGate();
    showToast(`AI 분석 초안 v${state.analysis.version}을 생성했습니다.`);
  } catch (error) {
    showToast(error.message);
  }
}

async function approveAnalysis() {
  try {
    const payload = await request("/api/analysis/approve", { method: "POST" });
    state.analysis = payload.analysis;
    await refreshAuxiliaryData();
    renderAnalysis();
    renderGate();
    showToast("교육과정 분석을 승인했습니다.");
  } catch (error) {
    showToast(error.message);
  }
}

function renderStandards() {
  const search = document.querySelector("#standardSearch").value.trim().toLowerCase();
  const band = document.querySelector("#bandFilter").value;
  const domain = document.querySelector("#domainFilter").value;
  const filtered = state.standards.filter((standard) => {
    const matchesSearch =
      !search ||
      standard.code.toLowerCase().includes(search) ||
      standard.statement.toLowerCase().includes(search) ||
      standard.explanation.toLowerCase().includes(search);
    return (
      matchesSearch &&
      (band === "all" || standard.grade_band === band) &&
      (domain === "all" || standard.domain === domain)
    );
  });
  const list = document.querySelector("#standardsList");
  list.innerHTML = filtered.length
    ? filtered
        .map(
          (standard) => `
            <article class="standard-row">
              <span class="standard-code">${escapeHtml(standard.code)}</span>
              <span class="standard-domain">${escapeHtml(standard.grade_band)} · ${escapeHtml(standard.domain)}</span>
              <div class="standard-content">
                <div class="standard-block">
                  <span class="standard-label">성취기준</span>
                  <p class="standard-statement">${escapeHtml(standard.statement)}</p>
                </div>
                <div class="standard-block explanation-block">
                  <span class="standard-label">성취기준 해설</span>
                  <p class="standard-explanation">${escapeHtml(standard.explanation)}</p>
                </div>
              </div>
              <span class="standard-source">
                성취기준 PDF ${standard.source_page}쪽<br />
                해설 PDF ${standard.explanation_source_page}쪽
              </span>
            </article>
          `,
        )
        .join("")
    : '<div class="no-results">조건에 맞는 성취기준이 없습니다.</div>';
}

function renderVersions() {
  const list = document.querySelector("#versionList");
  list.innerHTML = state.versions
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

function openTab(name) {
  document.querySelectorAll(".analysis-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === name);
  });
}

async function refreshAuxiliaryData() {
  const payload = await request("/api/analysis/bootstrap");
  state.versions = payload.versions;
  state.sourceReadiness = payload.source_readiness;
  renderVersions();
}

async function load() {
  const payload = await request("/api/analysis/bootstrap");
  state.analysis = payload.analysis;
  state.standards = payload.standards;
  state.statistics = payload.statistics;
  state.versions = payload.versions;
  state.sourceReadiness = payload.source_readiness;
  renderAnalysis();
  renderMetrics();
  renderGate();
  renderStandards();
  renderVersions();
}

document.querySelector("#saveAnalysisButton").addEventListener("click", saveAnalysis);
document.querySelector("#generateButton").addEventListener("click", () => {
  document.querySelector("#confirmGenerateDialog").showModal();
});
document.querySelector("#confirmGenerateButton").addEventListener("click", regenerateAnalysis);
document.querySelector("#approveAnalysisButton").addEventListener("click", approveAnalysis);
document.querySelector("#addImplicationButton").addEventListener("click", addImplication);
document.querySelectorAll(".analysis-tab").forEach((tab) => {
  tab.addEventListener("click", () => openTab(tab.dataset.tab));
});
document.querySelectorAll("[data-open-tab]").forEach((button) => {
  button.addEventListener("click", () => openTab(button.dataset.openTab));
});
["standardSearch", "bandFilter", "domainFilter"].forEach((id) => {
  document.querySelector(`#${id}`).addEventListener("input", renderStandards);
});

load().catch((error) => {
  document.querySelector("#analysisSaveState").textContent = "연결 실패";
  showToast(error.message);
});
