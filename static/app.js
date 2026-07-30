const state = {
  project: null,
  sources: [],
  readiness: null,
};

const numericFields = [
  "page_baseline",
  "page_min",
  "page_max",
  "supplement_max",
  "band_hours_34",
  "band_hours_56",
  "default_grade_hours",
];

const statusLabels = {
  pending: "검수 대기",
  approved: "사용 승인",
  rejected: "보완 필요",
};

const integrityLabels = {
  verified: "무결성 확인",
  processed_only: "전처리 자료 사용 가능",
  outputs_missing: "산출물 누락",
  source_missing: "원본 없음",
  hash_mismatch: "해시 불일치",
  page_mismatch: "페이지 불일치",
};

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  }
  return payload;
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function setSaveState(message) {
  document.querySelector("#saveState").textContent = message;
}

function renderProject() {
  const project = state.project;
  Object.entries(project).forEach(([key, value]) => {
    const input = document.querySelector(`[name="${key}"]`);
    if (input) input.value = value;
  });
  updateSummary();
  setSaveState(`최종 저장 ${formatDate(project.updated_at)}`);
}

function updateSummary() {
  const value = (id, fallback = 0) => Number(document.querySelector(`#${id}`)?.value || fallback);
  const baseline = value("page_baseline", 120);
  const min = value("page_min", 108);
  const max = value("page_max", 132);
  const supplement = value("supplement_max", 10);
  const bandHours = value("band_hours_34", 204);
  document.querySelector("#summaryBaseline").textContent = baseline;
  document.querySelector("#summaryRange").textContent = `${min}–${max}쪽`;
  document.querySelector("#summaryPhysicalMax").textContent = `${max + supplement}쪽`;
  document.querySelector("#summaryBandHours").textContent = bandHours;
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function sourceCard(source) {
  const warningText = source.warning_page_count
    ? `검토 표시 ${source.warning_page_count}쪽`
    : "검토 표시 없음";
  return `
    <article class="source-row">
      <div class="source-icon">PDF</div>
      <div class="source-name" title="${escapeHtml(source.title)}">
        <strong>${escapeHtml(source.title)}</strong>
        <small>${escapeHtml(source.document_type_label)} · ${warningText}</small>
      </div>
      <div class="source-stat">
        <strong>${source.page_count.toLocaleString()}쪽</strong>
        ${source.chunk_count.toLocaleString()}개 청크
      </div>
      <div>
        <span class="badge integrity">${integrityLabels[source.integrity_status] || source.integrity_status}</span>
      </div>
      <div>
        <span class="badge ${source.review_status}">${statusLabels[source.review_status]}</span>
        <button class="review-button" data-review-id="${encodeURIComponent(source.document_id)}" type="button">검수</button>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderSources() {
  const list = document.querySelector("#sourceList");
  list.innerHTML = state.sources.length
    ? state.sources.map(sourceCard).join("")
    : '<div class="empty-state">등록된 공식 자료가 없습니다.</div>';
  list.querySelectorAll("[data-review-id]").forEach((button) => {
    button.addEventListener("click", () => openReviewDialog(decodeURIComponent(button.dataset.reviewId)));
  });
}

function renderReadiness() {
  const readiness = state.readiness;
  const banner = document.querySelector("#statusBanner");
  banner.classList.toggle("ready", readiness.is_ready);
  document.querySelector("#statusTitle").textContent = readiness.is_ready
    ? "1단계가 완료되었습니다."
    : "공식 자료의 관리자 검수가 필요합니다.";
  document.querySelector("#statusDescription").textContent = readiness.is_ready
    ? readiness.processed_only
      ? `전처리 자료 ${readiness.processed_only}종으로 작업할 수 있습니다. 원본 PDF 대조는 원본이 있는 컴퓨터에서 진행하세요.`
      : "원본 PDF 해시까지 확인했습니다. 교육과정 분석 단계로 이동할 준비가 되었습니다."
    : `무결성 ${readiness.integrity_verified}/${readiness.total} 확인 · 승인되지 않은 자료 ${readiness.total - readiness.approved}건`;
  document.querySelector("#statusCount").textContent = `${readiness.approved} / ${readiness.total}`;
  document.querySelector(".status-icon").textContent = readiness.is_ready ? "✓" : "1";
}

async function loadBootstrap(showMessage = false) {
  setSaveState("자료 확인 중");
  const payload = await request("/api/bootstrap");
  state.project = payload.project;
  state.sources = payload.sources;
  state.readiness = payload.readiness;
  document.querySelector("#workspacePath").textContent = payload.workspace.processed;
  renderProject();
  renderSources();
  renderReadiness();
  if (showMessage) showToast("공식 자료와 원본 무결성을 다시 확인했습니다.");
}

async function saveProject() {
  const form = document.querySelector("#projectForm");
  const payload = { grades: [3, 4, 5, 6] };
  new FormData(form).forEach((value, key) => {
    payload[key] = numericFields.includes(key) ? Number(value) : value.trim();
  });
  setSaveState("저장 중…");
  try {
    const response = await request("/api/project", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.project = response.project;
    renderProject();
    showToast("프로젝트 설정을 저장했습니다.");
  } catch (error) {
    setSaveState("저장 실패");
    showToast(error.message);
  }
}

function openReviewDialog(documentId) {
  const source = state.sources.find((item) => item.document_id === documentId);
  if (!source) return;
  document.querySelector("#dialogTitle").textContent = source.title;
  document.querySelector("#reviewDocumentId").value = source.document_id;
  document.querySelector("#reviewStatus").value = source.review_status;
  document.querySelector("#reviewNote").value = source.review_note;
  document.querySelector("#reviewDialog").showModal();
}

async function saveReview(event) {
  event.preventDefault();
  const documentId = document.querySelector("#reviewDocumentId").value;
  const payload = {
    review_status: document.querySelector("#reviewStatus").value,
    review_note: document.querySelector("#reviewNote").value,
  };
  try {
    const response = await request(`/api/sources/${encodeURIComponent(documentId)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    state.sources = state.sources.map((source) =>
      source.document_id === documentId ? response.source : source,
    );
    state.readiness = response.readiness;
    renderSources();
    renderReadiness();
    document.querySelector("#reviewDialog").close();
    showToast("공식 자료 검수 결과를 저장했습니다.");
  } catch (error) {
    showToast(error.message);
  }
}

document.querySelector("#saveProjectButton").addEventListener("click", saveProject);
document.querySelector("#reloadButton").addEventListener("click", () => loadBootstrap(true));
document.querySelector("#reviewForm").addEventListener("submit", saveReview);
numericFields.forEach((field) => {
  document.querySelector(`#${field}`).addEventListener("input", updateSummary);
});

loadBootstrap().catch((error) => {
  setSaveState("연결 실패");
  showToast(error.message);
});
