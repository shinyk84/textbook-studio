// 현장 의견 반영 · 조판 후 수정안 · 확정 교과서 → 지도서·부속 자료
// prototype.js보다 먼저 불러온다(함수 선언만 있고, prototype.js의 state·renderWorkspace 등은 호출될 때 쓴다).
//
// 흐름
//   04 현장 의견 분석: 의견 파일(엑셀·PDF·설문 캡처·스캔)과 직접 쓴 반영 사항 → AI가 쟁점으로 묶음 → 편집자가
//            반영할 쟁점을 고른다.
//   05 초안: 고른 쟁점과 추가 요청이 초안 생성 요청(feedbackNotes)으로 들어간다(화면에는 요약만).
//   06 조판 후 수정안: 같은 쟁점(또는 04에 새로 올린 검토·감수 의견)으로, 이미 조판한 원고에 대해 쟁점별 관련 쪽과
//            대폭·중간·미세 수정안을 만들고 편집자가 규모를 고른다.
//   07 부속 자료: 05단계에서 "교과서 확정"한 원고만 지도서·활동지·평가지·과정안을 만든다.

const FEEDBACK_ACCEPT = ".xlsx,.xlsm,.csv,.txt,.pdf,.png,.jpg,.jpeg,.webp";
const FEEDBACK_MAX_BYTES = 25 * 1024 * 1024;
const FEEDBACK_FILE_HELP = [
  ["올릴 수 있는 파일", "엑셀 xlsx·xlsm·csv(열 구성이 달라도 됨) · PDF(글자 PDF·스캔본 모두) · 이미지 jpg·png·webp(설문 캡처·사진) · 텍스트 txt"],
  ["여러 파일", "한꺼번에 여러 개를 고르거나 여러 번 나눠 올려도 모두 모입니다(합계 25MB까지)."],
  ["안 되는 파일", "옛 엑셀 xls, 한글 hwp·hwpx, 워드 docx, 파워포인트 pptx — xlsx나 PDF로 저장해서 올려 주세요."],
];
const DERIVED_KIND_LIST = [
  { id: "guide", label: "지도서" },
  { id: "worksheet", label: "활동지" },
  { id: "assessment", label: "평가지" },
  { id: "lesson_plan", label: "교수·학습 과정안" },
];
const REVISION_SCALES = ["대폭", "중간", "미세"];

let feedbackPendingFiles = [];
let feedbackBusy = "";
let revisionBusy = "";
const derivedBusy = new Set();

function fieldFeedback() {
  if (!state.fieldFeedback || typeof state.fieldFeedback !== "object") state.fieldFeedback = {};
  const feedback = state.fieldFeedback;
  if (!Array.isArray(feedback.items)) feedback.items = [];
  if (!Array.isArray(feedback.selectedIds)) feedback.selectedIds = [];
  if (!Array.isArray(feedback.sources)) feedback.sources = [];
  feedback.note ||= "";
  return feedback;
}

// 초안 생성 요청에 넣을 반영 사항: 고른 쟁점 + 직접 쓴 줄.
function selectedFeedbackNotes() {
  const feedback = fieldFeedback();
  const selected = new Set(feedback.selectedIds);
  const notes = feedback.items
    .filter((item) => selected.has(item.id))
    .map((item) => `[${item.kind}·우선순위 ${item.priority}] ${item.title} — ${item.reflect}${item.target && item.target !== "책 전반" ? ` (대상: ${item.target})` : ""}`);
  feedback.note.split(/\n+/).map((line) => line.trim()).filter(Boolean).forEach((line) => notes.push(`[편집자 메모] ${line}`));
  return notes;
}

function feedbackBookInfo() {
  const project = state.project || {};
  return {
    subject: [project.schoolLevel, project.subject].filter(Boolean).join(" "),
    grade: activeProject()?.activeBookKey || project.band || "",
    revision: "2022 개정 → 차기 개정",
  };
}

const FEEDBACK_KIND_CLASS = { "개선 요구": "need", "유지할 강점": "keep", "새 요구": "new", "기타": "etc" };

const FEEDBACK_KINDS = ["개선 요구", "새 요구", "유지할 강점", "기타"];
const FEEDBACK_PRIORITY_ORDER = { 상: 0, 중: 1, 하: 2 };
let feedbackKindFilter = "전체";

function sortedFeedbackItems(items) {
  return [...items].sort((a, b) => (FEEDBACK_PRIORITY_ORDER[a.priority] ?? 3) - (FEEDBACK_PRIORITY_ORDER[b.priority] ?? 3) || (Number(b.count) || 1) - (Number(a.count) || 1));
}

// 분석 결과: 성격별 탭 + 우선순위 순 표. 반영 방법은 한 칸, 근거 원문은 접어 둔다.
function renderFeedbackBoard(feedback) {
  if (!feedback.items.length) return "";
  const selected = new Set(feedback.selectedIds);
  const counts = Object.fromEntries(FEEDBACK_KINDS.map((kind) => [kind, feedback.items.filter((item) => item.kind === kind).length]));
  if (feedbackKindFilter !== "전체" && !counts[feedbackKindFilter]) feedbackKindFilter = "전체";
  const items = sortedFeedbackItems(feedback.items.filter((item) => feedbackKindFilter === "전체" || item.kind === feedbackKindFilter));
  const tabs = [["전체", feedback.items.length], ...FEEDBACK_KINDS.filter((kind) => counts[kind]).map((kind) => [kind, counts[kind]])];
  return `
    <section class="feedback-board">
      <div class="feedback-board-head">
        <div>
          <strong>분석 결과</strong>
          <small>${escapeHtml(formatDraftBatchTimestamp(feedback.analyzedAt))} · ${escapeHtml(feedback.sources.join(", ") || "직접 쓴 내용")}</small>
        </div>
        <span class="feedback-count">쟁점 ${feedback.items.length}개 중 <b>${selected.size}개 반영</b></span>
      </div>
      ${feedback.summary ? `<p class="feedback-summary">${escapeHtml(feedback.summary)}</p>` : ""}
      ${(feedback.notes || []).length ? `<p class="feedback-notes">${feedback.notes.map(escapeHtml).join(" · ")}</p>` : ""}
      <div class="feedback-board-toolbar">
        <div class="feedback-tabs" role="tablist">
          ${tabs.map(([kind, count]) => `<button type="button" role="tab" class="feedback-tab ${FEEDBACK_KIND_CLASS[kind] || ""} ${kind === feedbackKindFilter ? "active" : ""}" data-feedback-filter="${escapeHtml(kind)}" aria-selected="${kind === feedbackKindFilter}">${escapeHtml(kind)} <i>${count}</i></button>`).join("")}
        </div>
        <div class="feedback-board-actions">
          <button class="secondary-button" type="button" data-feedback-select="recommend">추천만 선택</button>
          <button class="secondary-button" type="button" data-feedback-select="none">선택 해제</button>
          <button class="tertiary-button" type="button" data-feedback-export>엑셀로 받기</button>
        </div>
      </div>
      <table class="feedback-table">
        <colgroup><col class="c-pick" /><col class="c-priority" /><col class="c-title" /><col class="c-reflect" /></colgroup>
        <thead><tr><th>반영</th><th>우선</th><th>쟁점 · 대상</th><th>반영 방법</th></tr></thead>
        <tbody>
          ${items.map((item) => {
            const evidence = item.evidence || [];
            return `<tr class="${selected.has(item.id) ? "selected" : ""}">
              <td class="c-pick"><input type="checkbox" data-feedback-pick="${item.id}" ${selected.has(item.id) ? "checked" : ""} aria-label="${escapeHtml(item.title)} 반영" /></td>
              <td class="c-priority"><i class="feedback-priority p${escapeHtml(item.priority)}">${escapeHtml(item.priority)}</i></td>
              <td class="c-title">
                <b>${escapeHtml(item.title)}</b>
                <span class="feedback-meta">${feedbackKindFilter === "전체" ? `<i class="feedback-kind ${FEEDBACK_KIND_CLASS[item.kind] || "etc"}">${escapeHtml(item.kind)}</i>` : ""}${escapeHtml(item.target && item.target !== item.scope ? item.target : item.scope)} · 의견 ${Number(item.count) || 1}건${item.recommend ? "" : " · <em>추천 안 함</em>"}</span>
                ${evidence.length ? `<details class="feedback-evidence"><summary>원문 ${evidence.length}개</summary>${evidence.map((quote) => `<q>${escapeHtml(quote)}</q>`).join("")}</details>` : ""}
              </td>
              <td class="c-reflect">${escapeHtml(item.reflect)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </section>`;
}

// 의견 올리기·직접 쓰기·분석 버튼(04 현장 의견 분석 단계에만 둔다).
function renderFeedbackInput() {
  const feedback = fieldFeedback();
  return `
    <section class="feedback-panel" id="feedbackPanel">
      <label class="editor-field feedback-note-field">
        <span>추가 요청·반영 사항 <small>컨셉, 현장 의견 등을 한 줄에 하나씩 — 분석하지 않아도 초안에 그대로 반영됩니다</small></span>
        <textarea id="feedbackNoteInput" rows="3" placeholder="예) 운동장이 좁은 학교용 대체 활동을 넣어 줘 / 뉴스포츠 교구를 활용해 줘 / 활동 설명이 길다는 의견이 많음 — 단계별 그림 위주로">${escapeHtml(feedback.note)}</textarea>
      </label>
      <div class="feedback-actions">
        <label class="feedback-drop" title="여러 파일을 한꺼번에 고르거나 여기로 끌어 놓을 수 있습니다">
          <input type="file" id="feedbackFileInput" multiple accept="${FEEDBACK_ACCEPT}" />
          <b>의견 파일 올리기</b>
          <span>xlsx · pdf · jpg · png</span>
        </label>
        ${renderStyleHelpTip(FEEDBACK_FILE_HELP)}
        <button class="primary-button ${feedbackBusy ? "is-busy" : ""}" type="button" id="feedbackAnalyzeButton" ${feedbackBusy ? "disabled" : ""} title="올린 파일과 위에 적은 내용을 AI가 쟁점별로 묶고 우선순위·반영 방법을 제안합니다. 반영할 쟁점만 골라 초고에 넣을 수 있습니다.">${feedbackBusy ? `<span class="btn-spinner" aria-hidden="true"></span>${escapeHtml(feedbackBusy)}` : feedback.items.length ? "다시 분석" : "의견 분석"}</button>
        ${feedback.items.length ? "<small>다시 분석하면 아래 결과가 새 결과로 바뀝니다.</small>" : ""}
      </div>
      <div class="feedback-dropzone" aria-hidden="true"><b>여기에 놓으세요</b><span>xlsx · pdf · jpg · png 파일을 놓으면 아래에 올린 파일로 쌓입니다</span></div>
      ${feedbackPendingFiles.length || feedback.sources.length ? `<ul class="feedback-files">
        ${feedbackPendingFiles.map((file, index) => `<li class="pending"><span>${escapeHtml(file.name)}</span><small>${Math.max(1, Math.round(file.size / 1024))}KB · 분석 전</small><button type="button" data-feedback-file-remove="${index}" aria-label="${escapeHtml(file.name)} 빼기">×</button></li>`).join("")}
        ${feedbackPendingFiles.length ? "" : feedback.sources.map((name) => `<li class="done"><span>${escapeHtml(name)}</span><small>분석 완료</small></li>`).join("")}
      </ul>` : ""}
    </section>`;
}

function renderFeedbackAnalysisStep() {
  const feedback = fieldFeedback();
  return `
    ${sectionHeading("FIELD FEEDBACK", "현장 의견 분석", "")}
    ${renderFeedbackInput()}
    ${feedback.items.length ? renderFeedbackBoard(feedback) : `<p class="empty-note">현장 만족도 조사·설문 캡처·검토 의견을 올리고 [의견 분석]을 누르면, 같은 내용끼리 쟁점으로 묶어 우선순위·반영 방법과 함께 보여 줍니다. 의견이 없으면 이 단계는 건너뛰어도 됩니다.</p>`}`;
}

// 05 초안·06 수정안에서는 고른 쟁점만 한 줄로 보여 주고, 고치기는 04단계로 보낸다.
function renderFeedbackDigest(purpose = "draft") {
  const feedback = fieldFeedback();
  const selected = new Set(feedback.selectedIds);
  const picked = sortedFeedbackItems(feedback.items.filter((item) => selected.has(item.id)));
  const noteLines = feedback.note.split(/\n+/).filter((line) => line.trim()).length;
  const empty = !picked.length && !noteLines;
  return `
    <section class="feedback-digest ${empty ? "empty" : ""}">
      <strong>${purpose === "draft" ? "반영할 현장 의견" : "수정안에 쓸 쟁점"}</strong>
      <span class="feedback-digest-list">
        ${empty ? `<small>${purpose === "draft" ? "고른 쟁점·추가 요청이 없습니다." : "고른 쟁점이 없습니다. 조판 후 검토·감수 의견도 04단계에 올려 분석하세요."}</small>` : ""}
        ${picked.slice(0, 6).map((item) => `<i class="p${escapeHtml(item.priority)}" title="${escapeHtml(item.reflect)}">${escapeHtml(item.title)}</i>`).join("")}
        ${picked.length > 6 ? `<i class="more">외 ${picked.length - 6}개</i>` : ""}
        ${noteLines && purpose === "draft" ? `<i class="note">추가 요청 ${noteLines}줄</i>` : ""}
      </span>
      <button class="tertiary-button" type="button" data-go-feedback-step>${empty ? "04 현장 의견에서 추가" : "04에서 바꾸기"}</button>
    </section>`;
}

function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error(`${file.name}을(를) 읽지 못했습니다.`));
    reader.readAsDataURL(file);
  });
}

async function studioPost(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `요청 실패(HTTP ${response.status})`);
  return payload.result;
}

async function runFeedbackAnalyze() {
  const feedback = fieldFeedback();
  const total = feedbackPendingFiles.reduce((sum, file) => sum + file.size, 0);
  if (!feedbackPendingFiles.length && !feedback.note.trim()) {
    showToast("의견 파일을 올리거나 반영 사항을 직접 적어 주세요.");
    return;
  }
  if (total > FEEDBACK_MAX_BYTES) {
    showToast("파일이 너무 큽니다(합계 25MB까지). 나눠서 분석해 주세요.");
    return;
  }
  try {
    feedbackBusy = "파일 읽는 중…";
    renderWorkspace();
    const files = [];
    for (const file of feedbackPendingFiles) files.push({ name: file.name, base64: await readFileBase64(file) });
    feedbackBusy = "AI가 의견을 분석하는 중…(1~3분)";
    renderWorkspace();
    const result = await studioPost("/api/prototype/feedback/analyze", { files, note: feedback.note, book: feedbackBookInfo() });
    feedback.items = result.items || [];
    feedback.summary = result.summary || "";
    feedback.notes = result.notes || [];
    feedback.analyzedAt = new Date().toISOString();
    feedback.sources = feedbackPendingFiles.map((file) => file.name);
    feedback.selectedIds = feedback.items.filter((item) => item.recommend && item.kind !== "유지할 강점").map((item) => item.id);
    feedbackPendingFiles = [];
    persistNow(`현장 의견 ${feedback.items.length}개 쟁점 분석됨`);
    showToast(`의견을 ${feedback.items.length}개 쟁점으로 묶었습니다. 반영할 쟁점을 확인해 주세요.`);
  } catch (error) {
    showToast(error?.message || "의견 분석에 실패했습니다.");
  } finally {
    feedbackBusy = "";
    renderWorkspace();
  }
}

async function postTableExport(table, format) {
  const response = await fetch("/api/prototype/table-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...table, format }) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "파일을 만들지 못했습니다.");
  }
  triggerBlobDownload(await response.blob(), `${table.filename}.${format}`);
}

// ── 현재 교과서 원고(대상마다 확정본, 없으면 최신 초안)와 쪽 번호 ──

function spreadPlainText(spread) {
  const manuscript = spread.textbook_manuscript || {};
  const lines = [manuscript.headline || spread.title, manuscript.learningGoal && `학습 목표: ${manuscript.learningGoal}`, manuscript.openingQuestion && `생각 열기: ${manuscript.openingQuestion}`, manuscript.deck];
  (manuscript.sections || []).forEach((section) => {
    lines.push(`■ ${[section.label, section.title].filter(Boolean).join(" ")}`);
    (section.paragraphs || []).forEach((paragraph) => lines.push(paragraph));
  });
  return lines.filter(Boolean).join("\n");
}

function draftTitleOf(batch) {
  return String(batch.smallUnitLabel || "").split(" · ").pop().replace(/^[\d-]+\.\s*/, "").trim();
}

function currentTextbookEntries() {
  const latest = new Map();
  (state.frameworkDraftLog || []).forEach((batch, batchIndex) => {
    (batch.entries || []).forEach((entry, entryIndex) => {
      const key = `${batch.targetKey || batch.smallUnitLabel}|${entryIndex}`;
      const previous = latest.get(key);
      // 확정본이 있으면 그 대상은 확정본을, 없으면 가장 최근 초안을 쓴다.
      if (!previous || (entry.approvedAt && !previous.entry.approvedAt) || (Boolean(entry.approvedAt) === Boolean(previous.entry.approvedAt) && batchIndex > previous.batchIndex)) {
        latest.set(key, { batch, batchIndex, entry, entryIndex });
      }
    });
  });
  const plan = buildPagePlan(state);
  // 대단원 도입·마무리는 대상 키(special:intro:<대단원 순번>)로 배열표의 같은 대단원 쪽을 찾는다.
  const specialPage = (key) => {
    const match = /^special:(intro|closing):(\d+)$/.exec(String(key || ""));
    if (!match) return null;
    const type = match[1] === "intro" ? "단원 도입" : "마무리";
    const groups = [...new Set(plan.filter((page) => String(page.group).startsWith("대단원")).map((page) => page.group))];
    const group = groups[Number(match[2])];
    return plan.find((page) => page.group === group && page.type === type) || null;
  };
  return [...latest.values()].map((row) => {
    const title = draftTitleOf(row.batch);
    // 예전 회차에는 대상 키가 없어 이름(예: "운동 단원 도입")으로도 찾는다.
    const role = /도입$/.test(title) ? "단원 도입" : /마무리$/.test(title) ? "마무리" : "";
    const domain = title.replace(/\s*단원\s*(도입|마무리)$/, "");
    const firstPage = specialPage(row.batch.targetKey)
      || (role ? plan.find((page) => page.type === role && String(page.unit).includes(domain)) : null)
      || (title ? plan.find((page) => page.type === "본문" && String(page.unit).includes(title)) : null);
    return { ...row, title: title || row.batch.smallUnitLabel, startPage: firstPage?.number || null };
  }).sort((a, b) => (a.startPage || 9999) - (b.startPage || 9999));
}

function textbookPagesForRevision() {
  return currentTextbookEntries().flatMap((row) => (row.entry.spreads || []).map((spread, spreadIndex) => {
    const left = row.startPage ? row.startPage + spreadIndex * 2 : spread.left_page;
    return { page: `${left}~${left + 1}`, label: row.title, text: spreadPlainText(spread) };
  }));
}

// ── 05 의견 반영·수정안 ──

function revisionRounds() {
  if (!Array.isArray(state.revisionRounds)) state.revisionRounds = [];
  return state.revisionRounds;
}

function renderRevisionRound(round, roundIndex) {
  const feedback = fieldFeedback();
  const byId = new Map(feedback.items.map((item) => [item.id, item]));
  const snapshot = new Map((round.issueSnapshot || []).map((item) => [item.id, item]));
  return `
    <article class="revision-round">
      <div class="revision-round-head">
        <b>${escapeHtml(round.roundLabel)} 수정안</b>
        <small>${escapeHtml(formatDraftBatchTimestamp(round.at))} · 쟁점 ${round.issues.length}개</small>
        <button class="tertiary-button" type="button" data-revision-export="${roundIndex}">고른 수정안 엑셀로 받기</button>
        <button class="tertiary-button" type="button" data-revision-delete="${roundIndex}">삭제</button>
      </div>
      ${round.issues.map((issue) => {
        const source = snapshot.get(issue.issue_id) || byId.get(issue.issue_id) || {};
        const chosen = round.chosen?.[issue.issue_id] || issue.recommended_scale;
        const option = (issue.options || []).find((item) => item.scale === chosen) || issue.options?.[0];
        return `
          <section class="revision-issue">
            <div class="revision-issue-head">
              <b>${escapeHtml(source.title || issue.issue_id)}</b>
              <span class="revision-pages">${(issue.related_pages || []).map((page) => `<i title="${escapeHtml(page.reason)}">${escapeHtml(page.page)}쪽</i>`).join("") || "<small>관련 쪽 없음</small>"}</span>
            </div>
            <p class="revision-recommend">추천 규모: <b>${escapeHtml(issue.recommended_scale)}</b> — ${escapeHtml(issue.scale_reason)}</p>
            <div class="revision-scales" role="radiogroup">
              ${REVISION_SCALES.map((scale) => `<button type="button" class="revision-scale ${scale === chosen ? "active" : ""}" data-revision-scale="${roundIndex}|${escapeHtml(issue.issue_id)}|${scale}">${scale} 수정</button>`).join("")}
            </div>
            ${option ? `
              <p class="revision-summary">${escapeHtml(option.summary)} <small>조판 영향: ${escapeHtml(option.layout_impact)}</small></p>
              <table class="revision-edits"><thead><tr><th>쪽</th><th>현재</th><th>수정안</th></tr></thead><tbody>
                ${(option.edits || []).map((edit) => `<tr><td>${escapeHtml(edit.page)}</td><td>${escapeHtml(edit.before)}</td><td>${escapeHtml(edit.after)}</td></tr>`).join("")}
              </tbody></table>` : ""}
          </section>`;
      }).join("")}
    </article>`;
}

function renderFeedbackStep() {
  const feedback = fieldFeedback();
  const pages = textbookPagesForRevision();
  const picked = feedback.items.filter((item) => feedback.selectedIds.includes(item.id));
  return `
    ${sectionHeading("REVISION", "조판 후 수정안", "")}
    ${renderFeedbackDigest("review")}
    <section class="revision-panel">
      <div class="feedback-panel-head">
        <div><strong>조판 후 수정안 만들기</strong></div>
      </div>
      <div class="feedback-actions">
        <label class="editor-field revision-round-field"><span>회차</span><input id="revisionRoundInput" value="${escapeHtml(state.revisionRoundLabel || "1차 조판")}" /></label>
        <button class="primary-button" type="button" id="revisionGenerateButton" ${revisionBusy || !picked.length || !pages.length ? "disabled" : ""}>${revisionBusy || `선택한 쟁점 ${picked.length}개로 수정안 만들기`}</button>
        ${!pages.length ? "<small>05단계에서 초안을 먼저 만드세요.</small>" : !picked.length ? "<small>04 현장 의견 분석에서 쟁점을 하나 이상 고르세요.</small>" : ""}
      </div>
      ${revisionRounds().map(renderRevisionRound).join("")}
    </section>`;
}

async function runRevisionGenerate() {
  const feedback = fieldFeedback();
  const issues = feedback.items.filter((item) => feedback.selectedIds.includes(item.id));
  const pages = textbookPagesForRevision();
  const roundLabel = document.querySelector("#revisionRoundInput")?.value.trim() || "1차 조판";
  state.revisionRoundLabel = roundLabel;
  try {
    revisionBusy = "관련 쪽을 찾고 수정안을 만드는 중…(1~4분)";
    renderWorkspace();
    const result = await studioPost("/api/prototype/feedback/revisions", { issues, pages, roundLabel });
    const chosen = {};
    (result.issues || []).forEach((issue) => { chosen[issue.issue_id] = issue.recommended_scale; });
    revisionRounds().unshift({ at: new Date().toISOString(), roundLabel, issues: result.issues || [], chosen, issueSnapshot: issues.map(({ id, title, kind, priority }) => ({ id, title, kind, priority })) });
    persistNow(`${roundLabel} 수정안 생성됨`);
    showToast(`쟁점 ${result.issues?.length || 0}개의 수정안을 만들었습니다.`);
  } catch (error) {
    showToast(error?.message || "수정안을 만들지 못했습니다.");
  } finally {
    revisionBusy = "";
    renderWorkspace();
  }
}

// ── 06 지도서·부속 자료 ──

function derivedPayload(row, kind) {
  const entry = row.entry;
  return {
    kind,
    unitLabel: row.batch.smallUnitLabel || row.title,
    gradeLabel: entry.gradeLabel || activeProject()?.activeBookKey || "",
    level: isElementaryPeProject() ? "elementary" : isSportsCultureProject() ? "sports-culture" : "",
    lessonRange: entry.lessonRange || "",
    standards: entry.traceability?.standardCodes || [],
    manuscript: textbookManuscriptText(entry),
  };
}

function renderDerivedPreview(kind, data) {
  if (!data) return "";
  const list = (items) => (items || []).length ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
  if (kind === "guide") {
    return `${data.unit_overview ? `<p>${escapeHtml(data.unit_overview)}</p>` : ""}${(data.lessons || []).map((lesson) => `
      <h5>${escapeHtml(lesson.lesson_label)} · ${escapeHtml(lesson.goal)}</h5>
      <table class="derived-table"><thead><tr><th>단계</th><th>시간</th><th>교사</th><th>학생</th></tr></thead><tbody>${(lesson.flow || []).map((step) => `<tr><td>${escapeHtml(step.stage)}</td><td>${Number(step.minutes) || ""}분</td><td>${escapeHtml(step.teacher)}</td><td>${escapeHtml(step.student)}</td></tr>`).join("")}</tbody></table>
      <p><b>발문</b></p>${list(lesson.questions)}<p><b>수준별 지도</b> ${escapeHtml(lesson.differentiation)}</p><p><b>대체 활동</b> ${escapeHtml(lesson.alternative_activity)}</p><p><b>안전</b> ${escapeHtml(lesson.safety)}</p><p><b>평가</b> ${escapeHtml(lesson.assessment)}</p>`).join("")}`;
  }
  if (kind === "worksheet") {
    return (data.sheets || []).map((sheet) => `<h5>${escapeHtml(sheet.title)} <small>${escapeHtml(sheet.lesson_label)}</small></h5><p>${escapeHtml(sheet.directions)}</p><ol>${(sheet.items || []).map((item) => `<li>${escapeHtml(item.prompt)} <small>[${escapeHtml(item.response_type)}]</small></li>`).join("")}</ol>${list(sheet.self_check)}`).join("");
  }
  if (kind === "assessment") {
    return `<ol>${(data.items || []).map((item) => `<li><small>[${escapeHtml(item.item_type)}]</small> ${escapeHtml(item.question)}${(item.choices || []).length ? `<ul>${item.choices.map((choice) => `<li>${escapeHtml(choice)}</li>`).join("")}</ul>` : ""}<p class="derived-answer">정답: ${escapeHtml(item.answer)} — ${escapeHtml(item.explanation)}</p></li>`).join("")}</ol>${data.performance_task?.task ? `<h5>수행평가</h5><p>${escapeHtml(data.performance_task.task)}</p>` : ""}`;
  }
  return (data.plans || []).map((plan) => `<h5>${escapeHtml(plan.lesson_label)} · ${escapeHtml(plan.goal)}</h5><table class="derived-table"><thead><tr><th>단계</th><th>시간</th><th>교수·학습 활동</th><th>유의점</th></tr></thead><tbody>${(plan.steps || []).map((step) => `<tr><td>${escapeHtml(step.stage)}</td><td>${Number(step.minutes) || ""}분</td><td>${escapeHtml(step.activity)}</td><td>${escapeHtml(step.teacher_notes)}</td></tr>`).join("")}</tbody></table>`).join("");
}

function renderDerivedStep() {
  const rows = currentTextbookEntries();
  const confirmed = rows.filter((row) => row.entry.approvedAt);
  return `
    ${sectionHeading("TEACHER MATERIALS", "지도서·부속 자료", "")}
    ${!rows.length ? `<p class="empty-note">아직 교과서 초안이 없습니다. 05단계에서 초안을 만들고 확정해 주세요.</p>` : ""}
    ${confirmed.length ? `<div class="feedback-actions">${DERIVED_KIND_LIST.map((kind) => `<button class="secondary-button" type="button" data-derived-all="${kind.id}">확정 원고 ${confirmed.length}개 ${kind.label} 모두 만들기</button>`).join("")}</div>` : ""}
    <div class="derived-list">
      ${rows.map((row) => {
        const key = `${row.batchIndex}:${row.entryIndex}`;
        const derived = row.entry.derived || {};
        return `
          <article class="derived-row ${row.entry.approvedAt ? "confirmed" : "locked"}">
            <div class="derived-row-head">
              <b>${row.startPage ? `${row.startPage}쪽~ · ` : ""}${escapeHtml(row.title)}</b>
              <small>${row.entry.approvedAt ? `교과서 확정 ${escapeHtml(formatDraftBatchTimestamp(row.entry.approvedAt))}` : "미확정"}</small>
            </div>
            ${row.entry.approvedAt ? `<div class="derived-kinds">${DERIVED_KIND_LIST.map((kind) => {
              const item = derived[kind.id];
              const busy = derivedBusy.has(`${key}|${kind.id}`);
              const stale = item && item.textbookApprovedAt !== row.entry.approvedAt;
              return `
                <div class="derived-kind ${item ? "ready" : ""}">
                  <div class="derived-kind-head">
                    <b>${kind.label}</b>
                    ${stale ? `<i class="derived-stale">교과서 변경됨</i>` : ""}
                    <button class="${item ? "tertiary-button" : "primary-button"}" type="button" data-derived-generate="${key}|${kind.id}" ${busy ? "disabled" : ""}>${busy ? "만드는 중…" : item ? "다시 만들기" : "만들기"}</button>
                    ${item ? `<button class="secondary-button" type="button" data-derived-hwpx="${key}|${kind.id}">HWPX</button>` : ""}
                  </div>
                  ${item ? `<details class="derived-preview"><summary>${escapeHtml(formatDraftBatchTimestamp(item.at))} 생성 · 미리 보기</summary>${renderDerivedPreview(kind.id, item.data)}</details>` : ""}
                </div>`;
            }).join("")}</div>` : ""}
          </article>`;
      }).join("")}
    </div>`;
}

function derivedRowByKey(key) {
  const [batchIndex, entryIndex] = key.split(":").map(Number);
  return currentTextbookEntries().find((row) => row.batchIndex === batchIndex && row.entryIndex === entryIndex);
}

async function runDerivedGenerate(key, kind) {
  const row = derivedRowByKey(key);
  if (!row?.entry.approvedAt) return;
  const busyKey = `${key}|${kind}`;
  derivedBusy.add(busyKey);
  renderWorkspace();
  try {
    const result = await studioPost("/api/prototype/derived", derivedPayload(row, kind));
    row.entry.derived ||= {};
    row.entry.derived[kind] = { data: result.data, at: new Date().toISOString(), textbookApprovedAt: row.entry.approvedAt };
    persistNow(`${row.title} ${result.label} 생성됨`);
  } catch (error) {
    showToast(`${row.title}: ${error?.message || "자료를 만들지 못했습니다."}`);
  } finally {
    derivedBusy.delete(busyKey);
    renderWorkspace();
  }
}

async function downloadDerivedHwpx(key, kind) {
  const row = derivedRowByKey(key);
  const item = row?.entry.derived?.[kind];
  if (!item) return;
  const response = await fetch("/api/prototype/derived/hwpx", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, data: item.data, unitLabel: row.title }) });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || "HWPX를 만들지 못했습니다.");
    return;
  }
  const label = DERIVED_KIND_LIST.find((entry) => entry.id === kind)?.label || kind;
  triggerBlobDownload(await response.blob(), `${row.title}_${label}.hwpx`.replace(/[\\/:*?"<>|]+/g, "_"));
}

function toggleTextbookConfirm(key) {
  const [batchIndex, entryIndex] = key.split(":").map(Number);
  const entry = state.frameworkDraftLog?.[batchIndex]?.entries?.[entryIndex];
  if (!entry) return;
  if (entry.approvedAt) {
    if (!window.confirm("교과서 확정을 취소할까요? 07단계에서 이 원고로 만든 지도서·부속 자료는 그대로 남지만 새로 만들 수 없게 됩니다.")) return;
    entry.approvedAt = null;
  } else {
    entry.approvedAt = new Date().toISOString();
  }
  persistNow(entry.approvedAt ? "교과서 원고 확정됨" : "교과서 확정 취소됨");
  renderWorkspace();
  if (entry.approvedAt) showToast("교과서를 확정했습니다. 07 지도서·부속 자료에서 지도서·활동지·평가지·과정안을 만들 수 있습니다.");
}

// 여러 번 나눠 골라도 모두 모은다(같은 이름·크기는 한 번만).
function addFeedbackFiles(files) {
  const known = new Set(feedbackPendingFiles.map((file) => `${file.name}|${file.size}`));
  const accepted = FEEDBACK_ACCEPT.split(",");
  let added = 0;
  const skipped = [];
  [...files].forEach((file) => {
    const ext = `.${String(file.name).split(".").pop().toLowerCase()}`;
    if (!accepted.includes(ext)) {
      skipped.push(file.name);
      return;
    }
    if (known.has(`${file.name}|${file.size}`)) return;
    known.add(`${file.name}|${file.size}`);
    feedbackPendingFiles.push(file);
    added += 1;
  });
  renderWorkspace();
  if (skipped.length) showToast(`올릴 수 없는 형식이라 뺐습니다: ${skipped.join(", ")} (xlsx·pdf·jpg·png로 저장해서 올려 주세요)`);
  else if (added) showToast(`파일 ${added}개를 올렸습니다. [의견 분석]을 누르면 분석합니다.`);
}

// 끌어 오는 동안 패널 전체를 놓을 자리로 표시한다(파일을 끌 때만).
let feedbackDragDepth = 0;
function feedbackDropPanel(event) {
  return event.dataTransfer?.types?.includes?.("Files") ? event.target.closest?.("#feedbackPanel") : null;
}
document.addEventListener("dragenter", (event) => {
  const panel = feedbackDropPanel(event);
  if (!panel) return;
  feedbackDragDepth += 1;
  panel.classList.add("dragging");
});
document.addEventListener("dragover", (event) => {
  if (!feedbackDropPanel(event)) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});
document.addEventListener("dragleave", (event) => {
  const panel = feedbackDropPanel(event);
  if (!panel) return;
  feedbackDragDepth = Math.max(0, feedbackDragDepth - 1);
  if (!feedbackDragDepth) panel.classList.remove("dragging");
});
document.addEventListener("drop", (event) => {
  const panel = feedbackDropPanel(event);
  if (!panel) return;
  event.preventDefault();
  feedbackDragDepth = 0;
  panel.classList.remove("dragging");
  addFeedbackFiles(event.dataTransfer.files);
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.id === "feedbackFileInput") {
    const files = [...target.files];
    target.value = "";
    addFeedbackFiles(files);
  } else if (target.matches?.("[data-feedback-pick]")) {
    const feedback = fieldFeedback();
    const id = target.dataset.feedbackPick;
    feedback.selectedIds = target.checked ? [...new Set([...feedback.selectedIds, id])] : feedback.selectedIds.filter((item) => item !== id);
    persist("반영할 현장 의견 선택 변경됨");
    renderWorkspace();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "feedbackNoteInput") {
    fieldFeedback().note = event.target.value;
    persist("현장 의견 메모 저장됨");
  }
});

document.addEventListener("click", (event) => {
  const removeButton = event.target.closest?.("[data-feedback-file-remove]");
  if (removeButton) {
    feedbackPendingFiles.splice(Number(removeButton.dataset.feedbackFileRemove), 1);
    renderWorkspace();
    return;
  }
  const button = event.target.closest?.("#feedbackAnalyzeButton, #revisionGenerateButton, [data-go-feedback-step], [data-feedback-filter], [data-feedback-select], [data-feedback-export], [data-revision-scale], [data-revision-export], [data-revision-delete], [data-textbook-confirm], [data-derived-generate], [data-derived-all], [data-derived-hwpx]");
  if (!button) return;
  const data = button.dataset;
  if (button.id === "feedbackAnalyzeButton") runFeedbackAnalyze();
  else if (button.id === "revisionGenerateButton") runRevisionGenerate();
  else if ("goFeedbackStep" in data) goToStep(FEEDBACK_STEP_INDEX);
  else if (data.feedbackFilter) {
    feedbackKindFilter = data.feedbackFilter;
    renderWorkspace();
  }
  else if (data.feedbackSelect) {
    const feedback = fieldFeedback();
    feedback.selectedIds = data.feedbackSelect === "recommend" ? feedback.items.filter((item) => item.recommend && item.kind !== "유지할 강점").map((item) => item.id) : [];
    persist("반영할 현장 의견 선택 변경됨");
    renderWorkspace();
  } else if ("feedbackExport" in data) {
    const feedback = fieldFeedback();
    postTableExport({
      title: "현장 의견 쟁점", filename: "현장의견_쟁점", columns: ["번호", "쟁점", "성격", "우선순위", "범위·대상", "의견 수", "반영 방법", "근거 의견", "반영 선택"],
      rows: sortedFeedbackItems(feedback.items).map((item, index) => [index + 1, item.title, item.kind, item.priority, `${item.scope} ${item.target || ""}`.trim(), item.count, item.reflect, (item.evidence || []).join(" / "), feedback.selectedIds.includes(item.id) ? "반영" : ""]),
      widths: [6, 28, 10, 8, 18, 7, 40, 40, 8],
    }, "xlsx").catch((error) => showToast(error.message));
  } else if (data.revisionScale) {
    const [roundIndex, issueId, scale] = data.revisionScale.split("|");
    const round = revisionRounds()[Number(roundIndex)];
    if (!round) return;
    round.chosen ||= {};
    round.chosen[issueId] = scale;
    persist("수정 규모 선택됨");
    renderWorkspace();
  } else if (data.revisionExport) {
    const round = revisionRounds()[Number(data.revisionExport)];
    if (!round) return;
    const titles = new Map((round.issueSnapshot || []).map((item) => [item.id, item.title]));
    const rows = round.issues.flatMap((issue) => {
      const scale = round.chosen?.[issue.issue_id] || issue.recommended_scale;
      const option = (issue.options || []).find((item) => item.scale === scale) || {};
      return (option.edits || []).map((edit) => [titles.get(issue.issue_id) || issue.issue_id, scale, edit.page, edit.before, edit.after, option.layout_impact || ""]);
    });
    postTableExport({ title: `${round.roundLabel} 수정 지시`, filename: `${round.roundLabel}_수정지시`, columns: ["쟁점", "규모", "쪽", "현재", "수정안", "조판 영향"], rows, widths: [24, 8, 8, 40, 40, 24] }, "xlsx").catch((error) => showToast(error.message));
  } else if (data.revisionDelete) {
    if (!window.confirm("이 회차 수정안을 삭제할까요?")) return;
    revisionRounds().splice(Number(data.revisionDelete), 1);
    persistNow("수정안 삭제됨");
    renderWorkspace();
  } else if (data.textbookConfirm) toggleTextbookConfirm(data.textbookConfirm);
  else if (data.derivedGenerate) {
    const [key, kind] = data.derivedGenerate.split("|");
    runDerivedGenerate(key, kind);
  } else if (data.derivedAll) {
    const kind = data.derivedAll;
    const rows = currentTextbookEntries().filter((row) => row.entry.approvedAt);
    if (!window.confirm(`확정 원고 ${rows.length}개의 ${DERIVED_KIND_LIST.find((item) => item.id === kind)?.label}를 만듭니다. 원고마다 AI 비용이 듭니다. 계속할까요?`)) return;
    (async () => {
      for (const row of rows) await runDerivedGenerate(`${row.batchIndex}:${row.entryIndex}`, kind);
    })();
  } else if (data.derivedHwpx) {
    const [key, kind] = data.derivedHwpx.split("|");
    downloadDerivedHwpx(key, kind);
  }
});
