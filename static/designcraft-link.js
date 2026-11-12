// DesignCraft 조판 연결: 05단계에서 만든 초고 펼침면을 책 순서대로 모아 로컬 서버로 보내면,
// 서버가 각자 컴퓨터에 설치된 DesignCraft로 텍스트·삽화·디자인이 들어간 조판 파일(.designcraft,
// 인디자인용 IDML, 미리보기 PDF)을 만든다. 사람은 "DesignCraft에서 열기"로 바로 미세 조정한다.
// prototype.js보다 먼저 읽히지만, 여기 함수들은 화면을 그릴 때(=prototype.js가 다 읽힌 뒤)만
// 불리므로 prototype.js의 전역(state, persist, manuscriptPageSplit 등)을 그대로 쓴다.

let designcraftStatus = null;
let designcraftStatusLoading = false;
let designcraftBusy = "";
let designcraftPreviewFolder = "";
let designcraftMockupIndex = 0;
let designcraftStop = false;
let designcraftScope = "all";
let designcraftProgress = null;

function loadDesigncraftStatus() {
  if (designcraftStatus || designcraftStatusLoading) return;
  designcraftStatusLoading = true;
  fetch("/api/prototype/designcraft/status")
    .then((response) => response.json())
    .then((payload) => { designcraftStatus = payload.result || { available: false }; })
    .catch(() => { designcraftStatus = { available: false, error: true }; })
    .finally(() => {
      designcraftStatusLoading = false;
      refreshDesigncraftPanel();
    });
}

function designcraftTargetLabels(target) {
  const base = `${target.domain} · ${target.middleTitle} · ${target.smallTitle}`;
  return [base, `${target.gradeLabel || ""} ${base}`.trim()];
}

// 책 순서: 대단원마다 도입 → 소단원들 → 확장 코너·특별 페이지 → 마무리. 어느 단원에도 못 붙은
// 항목은 맨 뒤에 둔다.
function designcraftOrderedTargets() {
  const targets = draftStudioTargets();
  const placed = new Set();
  const ordered = [];
  const take = (items) => items.forEach((item) => {
    if (placed.has(item.key)) return;
    placed.add(item.key);
    ordered.push(item);
  });
  state.units.forEach((_, unitIndex) => {
    const specials = targets.filter((item) => item.targetKind === "special" && String(item.key).split(":").pop() === String(unitIndex));
    take(specials.filter((item) => item.pageRole === "unit-intro"));
    take(targets.filter((item) => item.targetKind === "small-unit" && String(item.key).startsWith(`${unitIndex}:`)));
    take(specials.filter((item) => item.pageRole !== "unit-intro" && item.pageRole !== "unit-closing"));
    take(specials.filter((item) => item.pageRole === "unit-closing"));
  });
  take(targets);
  return ordered;
}

// 항목마다 가장 최근 초고를 고른다. 새 회차에는 targetKey가 있고, 예전 회차는 이름으로 맞춘다.
function designcraftLatestDrafts(targets) {
  const latest = new Map();
  (state.frameworkDraftLog || []).forEach((batch, batchIndex) => {
    (batch.entries || []).forEach((entry, entryIndex) => {
      if (!entry?.spreads?.length) return;
      let key = batch.targetKey;
      if (!key) {
        const match = targets.find((target) => designcraftTargetLabels(target).some((label) => label === batch.smallUnitLabel || label === entry.smallUnitLabel));
        key = match?.key;
      }
      if (key) latest.set(key, { batchIndex, entryIndex, entry });
    });
  });
  return latest;
}

function designcraftSelectedEntryKeys() {
  return new Set([...selectedDraftFiles].map((key) => key.split(":").slice(0, 2).join(":")));
}

function designcraftPlan() {
  const targets = designcraftOrderedTargets();
  const latest = designcraftLatestDrafts(targets);
  const selected = designcraftSelectedEntryKeys();
  const items = [];
  targets.forEach((target) => {
    const draft = latest.get(target.key);
    if (!draft) return;
    if (selected.size && !selected.has(`${draft.batchIndex}:${draft.entryIndex}`)) return;
    items.push({ target, ...draft });
  });
  // 선택한 초고가 책 목록과 이름이 안 맞으면(예: 단원명을 고친 뒤의 옛 초고) 맨 뒤에 붙인다.
  if (selected.size) {
    const used = new Set(items.map((item) => `${item.batchIndex}:${item.entryIndex}`));
    selected.forEach((key) => {
      if (used.has(key)) return;
      const [batchIndex, entryIndex] = key.split(":").map(Number);
      const entry = state.frameworkDraftLog?.[batchIndex]?.entries?.[entryIndex];
      if (entry?.spreads?.length) items.push({ target: null, batchIndex, entryIndex, entry });
    });
  }
  const missing = selected.size ? 0 : targets.filter((target) => !latest.has(target.key)).length;
  const spreads = items.reduce((sum, item) => sum + item.entry.spreads.length, 0);
  return { items, spreads, missing, total: targets.length, selectedMode: selected.size > 0 };
}

function designcraftVisualItems(plan) {
  const items = [];
  plan.items.forEach(({ entry }) => entry.spreads.forEach((spread) => {
    const manuscript = spread.textbook_manuscript || {};
    [0, 1].forEach((side) => manuscriptSideVisuals(manuscript, side).forEach((visual) => items.push(visual)));
  }));
  return items;
}

function designcraftGradeNumber() {
  return String(state.project?.grade || "").replace(/[^0-9]/g, "");
}

function designcraftSpreadPayload(item, spread) {
  const { target, entry } = item;
  const manuscript = spread.textbook_manuscript || {};
  const sections = Array.isArray(manuscript.sections) ? manuscript.sections : [];
  const split = manuscriptPageSplit(manuscript);
  const domain = target?.domain || String(entry.smallUnitLabel || "").split(" · ")[0].split(" ").pop() || "";
  const middle = target?.middleTitle || String(entry.smallUnitLabel || "").split(" · ")[1] || "";
  const visual = (side) => manuscriptSideVisuals(manuscript, side).map((visualItem) => ({
    size: visualItem.size || "small",
    placement: visualItem.placement || "bottom",
    description: visualItem.description || "",
    ...(visualItem.imageId ? { imageId: visualItem.imageId } : visualItem.imageBase64 ? { imageBase64: visualItem.imageBase64 } : {}),
  }));
  return {
    domain,
    runningHead: [state.project?.grade, domain, target?.targetKind === "special" ? "" : middle].filter(Boolean).join(" · "),
    subjectLabel: `${state.project?.subject || entrySubjectLabel(entry)} ${designcraftGradeNumber()}`.trim(),
    lessonLabel: spread.lesson_label || manuscript.lessonLabel || "",
    headline: manuscript.headline || spread.title || "",
    subtitle: manuscript.subtitle || "",
    styleLabel: state.frameworkDraftLog?.[item.batchIndex]?.styleLabel || "",
    pageRole: entry.pageRole || spread.page_role || target?.pageRole || "",
    learningGoal: manuscript.learningGoal || "",
    openingQuestion: manuscript.openingQuestion || "",
    roleLabel: [entry.primaryTypeLabel, spread.role].filter(Boolean).join(" · "),
    leftSections: sections.slice(0, split),
    rightSections: sections.slice(split),
    leftVisuals: visual(0),
    rightVisuals: visual(1),
  };
}

// ── 디자인 시안 ──
// 펼침면마다 AI가 참고 시안(design-references 폴더) 스타일로 완성 디자인 시안을 그린다. 시안 이미지는
// 서버 DB에 두고 state.designMockups에는 id만 남긴다. 키는 초고 회차(생성 시각·대상)·초고·펼침면 순번이라
// 초고를 다시 생성하면 새 펼침면으로 보고 시안도 새로 그린다. 한 번에 여러 대상을 생성하면 생성 시각이
// 같을 수 있어 대상 키(없으면 이름)도 함께 쓴다.
function designcraftMockupKey(item, spreadIndex) {
  const batch = state.frameworkDraftLog?.[item.batchIndex] || {};
  return [batch.generatedAt || item.batchIndex, batch.targetKey || batch.smallUnitLabel || "", item.entryIndex, spreadIndex].join("|");
}

function designcraftSpreadRows(plan) {
  let page = designcraftStartPage();
  const mockups = state.designMockups || {};
  const rows = [];
  plan.items.forEach((item) => item.entry.spreads.forEach((spread, spreadIndex) => {
    const payload = { ...designcraftSpreadPayload(item, spread), leftPage: page, rightPage: page + 1 };
    const key = designcraftMockupKey(item, spreadIndex);
    const label = item.target ? [item.target.middleTitle, item.target.smallTitle || item.target.label].filter(Boolean).join(" · ") : item.entry.smallUnitLabel || "";
    rows.push({ key, payload, page, unitIndex: designcraftUnitIndexOf(item.target), batchIndex: item.batchIndex, entryIndex: item.entryIndex, spreadIndex, label: `${label}${item.entry.spreads.length > 1 ? ` (${spreadIndex + 1}/${item.entry.spreads.length})` : ""}`, mockup: mockups[key] || null });
    page += 2;
  }));
  return rows;
}

function designcraftUnitIndexOf(target) {
  if (!target) return null;
  if (Number.isInteger(target.unitIndex)) return target.unitIndex;
  const parts = String(target.key || "").split(":");
  if (/^\d+$/.test(parts[0])) return Number(parts[0]);
  if (parts[0] === "special" && /^\d+$/.test(parts[2] || "")) return Number(parts[2]);
  const unitIndex = state.units.findIndex((unit) => unit.domain === target.domain);
  return unitIndex >= 0 ? unitIndex : null;
}

function designcraftMockupUrl(imageId) {
  return `/api/prototype/designcraft/mockup-image/${encodeURIComponent(imageId)}`;
}

// ── 디자인 기준 시안 ──
// 편집자가 마음에 드는 시안을 "디자인 기준"으로 정하면, 이후 그리는 시안은 그 시안을 함께 참고해
// 같은 책처럼(바탕색·서체·카드·캐릭터·쪽 머리) 맞춘다. 같은 지면 종류(도입·본문·마무리)의 기준을 먼저 쓴다.
function designStandards() {
  if (!Array.isArray(state.designStandards)) state.designStandards = [];
  return state.designStandards;
}

function designcraftStandardIdsFor(role, exceptImageId = "") {
  const list = designStandards().filter((item) => item.imageId && item.imageId !== exceptImageId);
  const same = list.filter((item) => item.role === role);
  return [...same, ...list.filter((item) => item.role !== role)].slice(0, 2).map((item) => item.imageId);
}

function toggleDesignStandard(row) {
  const list = designStandards();
  const index = list.findIndex((item) => item.imageId === row.mockup?.imageId);
  if (index >= 0) {
    list.splice(index, 1);
    showToast("디자인 기준에서 뺐습니다.");
  } else {
    if (!row.mockup?.imageId) return;
    list.unshift({ imageId: row.mockup.imageId, role: row.payload.pageRole || "", label: `${row.page}~${row.page + 1}쪽 ${row.label}`, at: new Date().toISOString() });
    state.designStandards = list.slice(0, 6);
    showToast("디자인 기준으로 정했습니다. 앞으로 그리는 시안은 이 디자인에 맞춥니다.");
  }
  persist("디자인 기준 시안 변경됨");
  refreshDesigncraftPanel();
}

function designcraftMockupViewer(rows, local) {
  if (!rows.length) return "";
  designcraftMockupIndex = Math.min(Math.max(0, designcraftMockupIndex), rows.length - 1);
  const current = rows[designcraftMockupIndex];
  return `
    <div class="mockup-viewer">
      <div class="mockup-toolbar">
        <button class="secondary-button" type="button" data-mockup-step="-1" ${designcraftMockupIndex ? "" : "disabled"}>◀ 이전</button>
        <span class="mockup-title"><b>${current.page}~${current.page + 1}쪽</b> ${escapeHtml(current.label)} <small>${designcraftMockupIndex + 1}/${rows.length}</small></span>
        <button class="secondary-button" type="button" data-mockup-step="1" ${designcraftMockupIndex < rows.length - 1 ? "" : "disabled"}>다음 ▶</button>
        <button class="secondary-button" type="button" data-mockup-redo="${designcraftMockupIndex}" ${local && !designcraftBusy ? "" : "disabled"} title="${designcraftBusy ? "작업 중에는 쓸 수 없습니다. 끝나거나 멈춘 뒤 누르세요." : "바꿀 점을 적으면 이 펼침면 시안만 새로 그립니다(이미지 1장 비용)."}">${current.mockup?.imageId ? "다시 그리기" : "시안 그리기"}</button>
        ${current.mockup?.imageId ? (() => {
          const isStandard = designStandards().some((item) => item.imageId === current.mockup.imageId);
          return `<button class="secondary-button ${isStandard ? "standard-on" : ""}" type="button" data-mockup-standard="${designcraftMockupIndex}" title="${isStandard ? "디자인 기준에서 뺍니다." : "이 시안의 디자인(바탕색·서체·카드·캐릭터·쪽 머리)을 이 책의 기준으로 삼아, 앞으로 그리는 시안이 같은 책처럼 보이게 합니다. 이미 그린 시안은 바뀌지 않습니다."}">${isStandard ? "★ 디자인 기준" : "☆ 디자인 기준으로"}</button>`;
        })() : ""}
        ${current.mockup?.imageId ? `<button class="secondary-button" type="button" data-mockup-edit="${current.batchIndex}:${current.entryIndex}:${current.spreadIndex}" ${local && !designcraftBusy ? "" : "disabled"} title="${designcraftBusy ? "작업 중에는 쓸 수 없습니다. 끝나거나 멈춘 뒤 누르세요." : "시안 위 글자를 직접 고칩니다. 처음 열 때 AI가 글 위치를 읽느라 1~3분 걸립니다."}">글 고치기</button>` : ""}
      </div>
      <div class="mockup-stage">
        ${current.mockup?.imageId
          ? `<div class="mockup-sheet"><img src="${designcraftMockupUrl(current.mockup.editedAt && current.mockup.previewId ? current.mockup.previewId : current.mockup.imageId)}" alt="${current.page}~${current.page + 1}쪽 디자인 시안" /><i class="mockup-fold" title="접히는 곳"></i></div>`
          : `<div class="mockup-empty">아직 시안이 없습니다.${current.mockup?.error ? `<small>${escapeHtml(current.mockup.error)}</small>` : ""}</div>`}
      </div>
      <div class="mockup-strip">
        ${rows.map((row, index) => `
          <button type="button" class="mockup-thumb ${index === designcraftMockupIndex ? "active" : ""} ${row.mockup?.imageId ? "" : "empty"}" data-mockup-go="${index}" title="${row.page}~${row.page + 1}쪽 ${escapeHtml(row.label)}">
            ${row.mockup?.imageId ? `<img loading="lazy" src="${designcraftMockupUrl(row.mockup.imageId)}" alt="" />` : "<i>시안 없음</i>"}
            ${row.mockup?.imageId && designStandards().some((item) => item.imageId === row.mockup.imageId) ? `<b class="mockup-standard-badge" title="디자인 기준">★</b>` : ""}
            <small>${row.page}~${row.page + 1}쪽</small>
          </button>`).join("")}
      </div>
    </div>`;
}

// ── 책 시안·조판 한 번에 ──
// 펼침면이 많아도(150~200쪽 = 75~100개 펼침면) 버튼 하나로 ① 시안 그리기 → ② 배치 읽기·글자 지우기 →
// ③ 조판을 차례로 처리한다. 끝난 단계는 펼침면마다 저장되므로 멈추거나 창을 닫았다가 다시 누르면 남은 것만 한다.
// 조판은 대단원마다 파일 하나로 나눈다(한 파일이 너무 커지지 않게, 대단원별로 따로 다듬기 쉽게).
function designcraftScopedRows(plan) {
  const rows = designcraftSpreadRows(plan);
  return designcraftScope === "all" ? rows : rows.filter((row) => String(row.unitIndex) === designcraftScope);
}

function designcraftPipelineCounts(rows) {
  const drawn = rows.filter((row) => row.mockup?.imageId).length;
  const read = rows.filter((row) => row.mockup?.imageId && row.mockup.layout).length;
  return { total: rows.length, drawn, read, toDraw: rows.length - drawn, toRead: rows.length - read };
}

function designcraftPipelineSection(plan, status) {
  const local = Boolean(status && status.local !== false);
  const canTypeset = Boolean(status?.available && local);
  const allRows = designcraftSpreadRows(plan);
  const rows = designcraftScopedRows(plan);
  const counts = designcraftPipelineCounts(rows);
  const references = status?.mockupReferences || [];
  const units = state.units.map((unit, unitIndex) => ({ unitIndex, label: `${unitIndex + 1}. ${unit.domain}`, count: allRows.filter((row) => row.unitIndex === unitIndex).length })).filter((unit) => unit.count);
  const drawMinutes = Math.ceil(counts.toDraw / 3) * 1.5;
  const buildMinutes = Math.ceil((counts.drawn - counts.read) / 3) * 2 + (counts.drawn ? Math.max(1, Math.ceil(counts.drawn / 20)) : 0);
  const builds = (state.designcraftBuilds || []).filter((build) => build.mockupKeysAt);
  const progress = designcraftProgress;
  const busy = Boolean(designcraftBusy);
  const failed = rows.filter((row) => !row.mockup?.imageId && row.mockup?.error).length;
  const standards = designStandards();
  let next;
  if (busy) next = `${designcraftBusyLabel(designcraftBusy)} — 이 창을 열어 두세요.`;
  else if (!counts.total) next = "먼저 위에서 초고를 생성하세요. 초고가 있는 펼침면만 시안을 그릴 수 있습니다.";
  else if (!counts.drawn) next = `<b>①</b> [시안 ${counts.toDraw}장 그리기]를 누르세요.`;
  else if (counts.toDraw) next = `<b>①</b> 남은 시안 ${counts.toDraw}장을 그리세요. 그린 시안은 <b>②</b>에서 한 장씩 볼 수 있습니다.`;
  else if (!builds.length) next = `<b>②</b> 아래에서 시안을 한 장씩 넘겨 보며 고친 뒤, <b>③</b> [조판하기]를 누르세요.`;
  else next = "아래 <b>만든 파일</b>에서 [DesignCraft에서 열기]로 열어 다듬으세요. 시안을 고쳤으면 <b>③</b> [조판하기]를 다시 누르면 새 파일이 생깁니다.";
  const card = (number, title, countText, done, body, action) => `
    <li class="pipeline-card ${done ? "done" : ""}">
      <div class="pipeline-card-head"><i>${done ? "✓" : number}</i><b>${title}</b>${countText ? `<span>${countText}</span>` : ""}</div>
      <p>${body}</p>
      ${action || ""}
    </li>`;
  return `
    <div class="pipeline">
      <div class="pipeline-row">
        <label class="pipeline-scope">범위
          <select id="mockupScope" ${busy ? "disabled" : ""}>
            <option value="all" ${designcraftScope === "all" ? "selected" : ""}>책 전체 · ${allRows.length}개 펼침면(${allRows.length * 2}쪽)</option>
            ${units.map((unit) => `<option value="${unit.unitIndex}" ${designcraftScope === String(unit.unitIndex) ? "selected" : ""}>${escapeHtml(unit.label)} · ${unit.count}개 펼침면</option>`).join("")}
          </select>
        </label>
        <span class="pipeline-note">${plan.missing && designcraftScope === "all" ? `초고 없는 ${plan.missing}개 항목은 빠짐 · ` : ""}${references.length ? `참고 시안 ${references.length}장` : "참고 시안 없음"}</span>
      </div>
      <p class="pipeline-next"><span>지금 할 일</span>${next}</p>
      ${busy ? `
        <div class="pipeline-busy">
          ${progress ? `<div class="pipeline-progress"><i style="width:${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%"></i></div>` : ""}
          <button class="secondary-button" type="button" id="mockupStopButton" ${designcraftStop ? "disabled" : ""}>${designcraftStop ? "지금 하던 장까지 마치고 멈춥니다…" : "멈추기"}</button>
          <small>멈추기: 지금 처리 중인 장까지만 마치고 멈춥니다. 끝난 것은 저장되고, 다시 누르면 남은 것부터 이어서 합니다. 작업 중에는 다른 버튼이 잠깁니다.</small>
        </div>` : ""}
      <ol class="pipeline-cards">
        ${card(1, "시안 그리기", `${counts.drawn}/${counts.total}장`, counts.total && !counts.toDraw,
          `초고 펼침면마다 AI가 교과서 지면 모양의 시안 그림을 그립니다(장마다 1~2분, 이미지 1장 비용). 초고 생성 때 <b>디자인 시안도 함께 그리기</b>로 그린 시안도 여기에 세므로, <b>이미 있는 시안은 다시 그리지 않고 없는 것만</b> 그립니다.${failed ? ` <em>실패한 ${failed}장 포함.</em>` : ""}<br>${standards.length ? `<b>디자인 기준 ${standards.length}장</b> — 앞으로 그리는 시안은 이 디자인에 맞춥니다.` : "②에서 마음에 드는 시안을 <b>☆ 디자인 기준으로</b> 정하면, 그 뒤에 그리는 시안이 같은 디자인을 따릅니다."}`,
          counts.toDraw ? `<button class="${counts.drawn ? "secondary-button" : "primary-button"}" type="button" id="mockupDrawButton" ${local && !busy ? "" : "disabled"}>${busy && designcraftBusy.includes("시안 그리기") ? designcraftBusyLabel("그리는 중") : `시안 ${counts.toDraw}장 그리기 <small>약 ${Math.max(1, Math.round(drawMinutes))}분</small>`}</button>` : "")}
        ${card(2, "시안 확인·고치기", counts.drawn ? `${counts.drawn}장` : "", false,
          "아래에서 한 장씩 넘겨 봅니다. <b>다시 그리기</b>: 바꿀 점을 적으면 그 펼침면만 새로 그립니다. <b>글 고치기</b>: 시안 위 글자를 직접 고칩니다.",
          counts.drawn ? `<button class="secondary-button" type="button" id="mockupBrowseToggle">${designcraftBrowseOpen ? "시안 닫기" : "시안 보기"}</button>` : "")}
        ${card(3, "조판 — DesignCraft 파일 만들기", builds.length ? `만든 파일 ${builds.length}개` : "", false,
          `대단원마다 DesignCraft 파일(.designcraft · 인디자인용 IDML · PDF)을 만듭니다. <b>개체로 나눠 조판</b>은 색 면·카드·띠·선·번호 원을 DesignCraft 상자와 선으로 다시 그려 크기·색·모서리를 고칠 수 있고, 삽화·캐릭터와 상자로 나타낼 수 없는 장식만 그림으로 넣습니다. <b>시안 그림 그대로</b>는 시안과 가장 똑같지만 상자는 그림이라 고칠 수 없습니다.${canTypeset ? "" : " <em>이 컴퓨터에서 DesignCraft를 찾지 못해 지금은 조판할 수 없습니다.</em>"}`,
          `<label class="pipeline-mode">조판 방식
            <select id="mockupBuildMode" ${busy ? "disabled" : ""}>
              <option value="objects" ${state.designcraftBuildMode !== "plate" ? "selected" : ""}>개체로 나눠 조판 — 상자·선·글을 고칠 수 있음(삽화만 그림)</option>
              <option value="plate" ${state.designcraftBuildMode === "plate" ? "selected" : ""}>시안 그림 그대로 — 바탕 그림 위에 글상자만</option>
            </select></label>
          <button class="${counts.drawn && !counts.toDraw ? "primary-button" : "secondary-button"}" type="button" id="mockupBuildUnitsButton" ${canTypeset && counts.drawn && !busy ? "" : "disabled"}>${busy && /^(배치 읽기|조판 중)/.test(designcraftBusy) ? designcraftBusyLabel(designcraftBusy.startsWith("조판 중") ? "조판 중" : "준비 중(글 위치 읽기)") : `조판하기${counts.drawn ? ` <small>시안 ${counts.drawn}장 · 약 ${Math.max(1, Math.round(buildMinutes))}분</small>` : ""}`}</button>`)}
      </ol>
      ${counts.drawn && designcraftBrowseOpen ? `<div class="mockup-browse">${designcraftMockupViewer(rows, local)}</div>` : ""}
      ${counts.total > 6 && counts.toDraw ? `<p class="pipeline-note pipeline-oneshot">쪽이 많아 한꺼번에 하려면 <button class="link-button" type="button" id="mockupPipelineButton" ${local && !busy ? "" : "disabled"}>①~③ 한 번에 하기</button> (확인 없이 시안·조판까지 이어서 합니다)</p>` : ""}
    </div>`;
}

let designcraftBrowseOpen = false;

async function designcraftReadLayouts(rows) {
  let cursor = 0;
  const errors = [];
  async function worker() {
    while (cursor < rows.length && !designcraftStop) {
      const row = rows[cursor];
      cursor += 1;
      try {
        await designcraftPost("/api/prototype/designcraft/mockup-layout", { imageId: row.mockup.imageId, spread: row.payload });
        state.designMockups[row.key] = { ...state.designMockups[row.key], layout: true };
      } catch (error) {
        errors.push(`${row.page}쪽: ${error?.message || "배치 읽기 실패"}`);
      }
      designcraftTick("배치 읽기·글자 지우기");
      if (designcraftProgress.done % 3 === 0) persist("시안 배치 읽는 중");
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, rows.length) }, () => worker()));
  persistNow("시안 배치 읽기 완료");
  return errors;
}

function designcraftTick(label) {
  designcraftProgress.done += 1;
  designcraftBusy = `${label} 중… ${designcraftProgress.done}/${designcraftProgress.total}`;
  refreshDesigncraftPanel();
}

async function runMockupPipeline(mode = "all") {
  const status = designcraftStatus;
  const freshRows = () => designcraftScopedRows(designcraftPlan());
  const counts = designcraftPipelineCounts(freshRows());
  if (!counts.total) return;
  const drawing = mode !== "build";
  const building = mode !== "draw";
  const toRead = drawing ? counts.toRead : counts.drawn - counts.read;
  const lines = [
    drawing && counts.toDraw ? `아직 시안이 없는 ${counts.toDraw}장 그리기(장마다 OpenAI 고품질 이미지 1장, 1~2분)${counts.drawn ? ` — 이미 있는 ${counts.drawn}장은 다시 그리지 않음` : ""}${designStandards().length ? " · 디자인 기준 시안에 맞춤" : ""}` : "",
    building && toRead ? `시안 ${toRead}장의 글 위치 읽기·글자 지우기(장마다 OpenAI 분석 1회, 그림 위 글자가 있으면 이미지 편집 1회)` : "",
    building ? (status?.available ? "DesignCraft 파일 만들기(대단원마다 파일 하나)" : "") : "",
  ].filter(Boolean);
  if (!lines.length) return;
  if (!window.confirm(`${lines.map((line) => `· ${line}`).join("\n")}\n\n3장씩 동시에 처리합니다. 이 창을 열어 두세요. 멈추거나 창을 닫아도 끝난 것은 저장되어 다음에 이어서 합니다. 계속할까요?`)) return;
  designcraftStop = false;
  const errors = [];
  try {
    let rows = drawing ? freshRows().filter((row) => !row.mockup?.imageId) : [];
    if (rows.length) {
      designcraftProgress = { done: 0, total: rows.length };
      designcraftBusy = `시안 그리기 중… 0/${rows.length}`;
      refreshDesigncraftPanel();
      const failed = await designcraftDrawMockups(rows);
      if (failed) errors.push(`시안 ${failed}장 실패`);
    }
    if (designcraftStop || !building) return;
    rows = freshRows().filter((row) => row.mockup?.imageId && !row.mockup.layout);
    if (rows.length) {
      designcraftProgress = { done: 0, total: rows.length };
      designcraftBusy = `배치 읽기·글자 지우기 중… 0/${rows.length}`;
      refreshDesigncraftPanel();
      errors.push(...await designcraftReadLayouts(rows));
    }
    if (designcraftStop || !status?.available) return;
    const ready = freshRows().filter((row) => row.mockup?.imageId && row.mockup.layout);
    const groups = new Map();
    ready.forEach((row) => {
      const key = row.unitIndex ?? "etc";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    designcraftProgress = { done: 0, total: groups.size };
    for (const [unitIndex, group] of groups) {
      if (designcraftStop) break;
      const unitLabel = Number.isInteger(unitIndex) ? `${unitIndex + 1}. ${state.units[unitIndex]?.domain || ""}` : "기타";
      designcraftBusy = `조판 중… ${unitLabel} (${designcraftProgress.done + 1}/${groups.size})`;
      refreshDesigncraftPanel();
      try {
        const result = await designcraftPost("/api/prototype/designcraft/mockup-build", {
          title: `${state.project?.name || "교과서"}_${unitLabel.replace(/[.\s]+/g, "_")}`,
          startPage: group[0].page,
          spreads: group.map((row) => ({ imageId: row.mockup.imageId })),
          mode: state.designcraftBuildMode === "plate" ? "plate" : "objects",
        });
        if (!Array.isArray(state.designcraftBuilds)) state.designcraftBuilds = [];
        state.designcraftBuilds.unshift({ at: new Date().toISOString(), scope: `디자인 시안 · ${unitLabel} · ${state.designcraftBuildMode === "plate" ? "시안 그림 그대로" : "개체 조판"}`, placeholders: 0, mockupKeysAt: true, ...result });
        state.designcraftBuilds = state.designcraftBuilds.slice(0, 20);
        persistNow(`${unitLabel} 조판 완료`);
      } catch (error) {
        errors.push(`${unitLabel} 조판: ${error?.message || "실패"}`);
      }
      designcraftProgress.done += 1;
    }
  } finally {
    const stopped = designcraftStop;
    designcraftBusy = "";
    designcraftStop = false;
    designcraftProgress = null;
    if (mode === "draw" && !stopped) designcraftBrowseOpen = true;
    refreshDesigncraftPanel();
    const doneText = mode === "draw" ? "시안을 그렸습니다. ② [시안 보기]에서 한 장씩 확인하세요." : "조판을 마쳤습니다. 아래 '만든 파일'에서 [DesignCraft에서 열기]를 누르세요.";
    showToast(stopped ? "멈췄습니다. 끝난 것은 저장되었고, 다시 누르면 남은 것부터 이어서 합니다." : errors.length ? `끝났지만 ${errors.length}건은 실패했습니다: ${errors[0]} — 다시 누르면 실패한 것만 다시 합니다.` : doneText);
  }
}

async function designcraftDrawMockups(rows, instruction = "") {
  let cursor = 0;
  let done = 0;
  let failed = 0;
  state.designMockups ||= {};
  async function worker() {
    while (cursor < rows.length && !designcraftStop) {
      const row = rows[cursor];
      cursor += 1;
      try {
        const result = await designcraftPost("/api/prototype/designcraft/mockup", { spread: row.payload, instruction, standardImageIds: designcraftStandardIdsFor(row.payload.pageRole, row.mockup?.imageId) });
        state.designMockups[row.key] = { imageId: result.imageId, at: new Date().toISOString(), layout: false, instruction: instruction || "" };
      } catch (error) {
        failed += 1;
        state.designMockups[row.key] = { ...(state.designMockups[row.key] || {}), error: error?.message || "시안 생성 실패" };
      }
      done += 1;
      if (designcraftProgress) designcraftProgress.done = done;
      designcraftBusy = `시안 그리기 중… ${done}/${rows.length}`;
      refreshDesigncraftPanel();
      if (done % 3 === 0) persist("디자인 시안 생성 중");
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, rows.length) }, () => worker()));
  persistNow(`디자인 시안 ${rows.length - failed}장 생성됨`);
  // 초고 생성 때 함께 그리기·미리보기의 다시 그리기처럼 일괄 작업(진행 막대) 밖에서 불렸으면
  // 여기서 "작업 중" 표시를 풀어야 한다. 안 풀면 조판하기 등 패널 버튼이 계속 잠긴다.
  if (!designcraftProgress) {
    designcraftBusy = "";
    refreshDesigncraftPanel();
  }
  return failed;
}

// 초고 한 개(회차·초고 번호)의 펼침면 시안 행. 책 순서 목록(designcraftPlan)에 있으면 그 쪽 번호를 쓰고,
// 같은 대상의 더 새 초고가 있어 목록에서 빠진 옛 초고는 앞부속 다음 쪽부터 번호를 붙인다.
function designcraftRowsForEntry(batchIndex, entryIndex) {
  const saved = new Set(selectedDraftFiles);
  selectedDraftFiles.clear();
  let rows;
  try {
    rows = designcraftSpreadRows(designcraftPlan()).filter((row) => row.batchIndex === batchIndex && row.entryIndex === entryIndex);
  } finally {
    saved.forEach((key) => selectedDraftFiles.add(key));
  }
  if (rows.length) return rows;
  const entry = state.frameworkDraftLog?.[batchIndex]?.entries?.[entryIndex];
  if (!entry?.spreads?.length) return [];
  const item = { target: null, batchIndex, entryIndex, entry };
  const mockups = state.designMockups || {};
  let page = designcraftStartPage();
  return entry.spreads.map((spread, spreadIndex) => {
    const key = designcraftMockupKey(item, spreadIndex);
    const row = { key, payload: { ...designcraftSpreadPayload(item, spread), leftPage: page, rightPage: page + 1 }, page, batchIndex, entryIndex, spreadIndex, label: entry.smallUnitLabel || "", mockup: mockups[key] || null };
    page += 2;
    return row;
  });
}

// 05단계 "디자인 시안도 함께 그리기": 방금 만든 회차들의 펼침면마다 시안을 그린다.
async function drawMockupsForBatches(batchIndexes) {
  const rows = batchIndexes.flatMap((batchIndex) => (state.frameworkDraftLog?.[batchIndex]?.entries || []).flatMap((_, entryIndex) => designcraftRowsForEntry(batchIndex, entryIndex)))
    .filter((row) => !row.mockup?.imageId);
  if (!rows.length) return 0;
  return designcraftDrawMockups(rows);
}

// 초고 미리보기의 "디자인 시안 그리기 / 다시 그리기"
async function drawMockupsForEntry(batchIndex, entryIndex, spreadIndex = null) {
  let rows = designcraftRowsForEntry(batchIndex, entryIndex);
  let instruction = "";
  if (spreadIndex !== null) {
    rows = rows.filter((row) => row.spreadIndex === spreadIndex);
    if (!rows.length) return;
    instruction = window.prompt("이 펼침면 시안을 다시 그립니다(OpenAI 이미지 비용 1장).\n바꾸고 싶은 점이 있으면 적어 주세요(비워 두면 그대로 다시 그립니다).", rows[0].mockup?.instruction || "");
    if (instruction === null) return;
  } else if (!window.confirm(`디자인 시안 ${rows.length}장을 그립니다. 장마다 OpenAI 이미지 비용이 들고 1~2분 걸립니다. 계속할까요?`)) {
    return;
  }
  showToast(`디자인 시안 ${rows.length}장을 그리는 중입니다…`);
  const failed = await designcraftDrawMockups(rows, instruction);
  renderWorkspace();
  showToast(failed ? `시안 ${rows.length - failed}장을 그렸고 ${failed}장은 실패했습니다.` : `시안 ${rows.length}장을 그렸습니다.`);
}

// ── 시안 화면 편집 ──
// 시안 그림에서 읽어 낸 배치(상자·그림·글 위치)를 조판될 모습 그대로 화면에 다시 그리고, 글상자는
// 바로 고칠 수 있게 한다. 저장한 글은 서버의 배치 명세에 들어가 "시안대로 조판"에 그대로 쓰인다.
let mockupEditor = null;

async function openMockupEditor(batchIndex, entryIndex, spreadIndex) {
  const row = designcraftRowsForEntry(batchIndex, entryIndex).find((item) => item.spreadIndex === spreadIndex);
  const mockup = row && state.designMockups?.[row.key];
  if (!mockup?.imageId) {
    showToast("먼저 디자인 시안을 그려 주세요.");
    return;
  }
  try {
    if (!mockup.layout) {
      if (!window.confirm("시안에서 상자·글·그림 위치를 AI가 읽어야 화면에서 고칠 수 있습니다(OpenAI 비용, 1~3분). 계속할까요?")) return;
      showToast("시안 배치를 읽는 중입니다…(1~3분)");
      await designcraftPost("/api/prototype/designcraft/mockup-layout", { imageId: mockup.imageId, spread: row.payload });
      mockup.layout = true;
      persistNow("시안 배치 읽기 완료");
    }
    const result = await designcraftPost("/api/prototype/designcraft/mockup-layout-get", { imageId: mockup.imageId });
    if (result.layout.previewId && mockup.previewId !== result.layout.previewId) {
      mockup.previewId = result.layout.previewId;
      persist("시안 바탕판 준비됨");
    }
    mockupEditor = { key: row.key, imageId: mockup.imageId, layout: result.layout, label: `${row.page}~${row.page + 1}쪽 ${row.label}`, original: false };
    renderMockupEditor();
  } catch (error) {
    showToast(error?.message || "시안 편집을 열지 못했습니다.");
  }
}

function mockupEditorItemHtml(item, index, scale) {
  const [x0, y0, x1, y1] = item.box;
  // 바탕판(글만 지운 시안)이 있으면 상자·그림은 바탕판에 이미 있으므로 글상자만 얹는다.
  if (mockupEditor.layout.plateId && item.kind !== "text") return "";
  const position = `left:${x0 * scale}px;top:${y0 * scale}px;width:${(x1 - x0) * scale}px;height:${(y1 - y0) * scale}px;z-index:${index + 1};`;
  if (item.kind === "box") {
    const radius = item.shape === "ellipse" ? "50%" : `${(Number(item.radius) || 0) * scale}px`;
    const corners = item.corners === "top" ? `border-radius:${radius} ${radius} 0 0;` : `border-radius:${radius};`;
    const border = item.stroke ? `border:${Math.max(1, (Number(item.strokeWidth) || 1) * scale)}px ${item.dashed ? "dashed" : "solid"} ${item.stroke};` : "";
    return `<div class="me-box" style="${position}${corners}${border}background:${item.fill || "transparent"};"></div>`;
  }
  if (item.kind === "art") {
    const [width, height] = mockupEditor.layout.size || [1536, 1024];
    return `<div class="me-art" title="${escapeHtml(item.label || "그림")}" style="${position}background-image:url('${designcraftMockupUrl(mockupEditor.imageId)}');background-size:${width * scale}px ${height * scale}px;background-position:-${x0 * scale}px -${y0 * scale}px;"></div>`;
  }
  if (item.kind === "qr") return `<div class="me-qr" style="${position}">QR</div>`;
  if (item.kind !== "text") return "";
  const weight = { heavy: 900, bold: 700, medium: 500 }[item.weight] || 400;
  const valign = { center: "center", bottom: "flex-end" }[item.valign] || "flex-start";
  return `<div class="me-text${item.font === "display" ? " display" : ""}" contenteditable="plaintext-only" spellcheck="false" data-me-index="${index}" title="${escapeHtml(item.role || "글")}" style="${position}font-size:${(Number(item.size) || 14) * scale}px;line-height:${Number(item.leading) || 1.3};color:${item.color || "#222222"};font-weight:${weight};text-align:${item.align || "left"};justify-content:${valign};">${escapeHtml(item.text || "")}</div>`;
}

function renderMockupEditor() {
  document.querySelector(".mockup-editor-overlay")?.remove();
  if (!mockupEditor) return;
  const { layout, imageId } = mockupEditor;
  const [width, height] = layout.size || [1536, 1024];
  const stageWidth = Math.min(window.innerWidth - 64, 1500);
  const scale = stageWidth / width;
  const lines = layout.items.map((item, index) => ({ item, index })).filter(({ item }) => item.kind === "line");
  const overlay = document.createElement("div");
  overlay.className = "mockup-editor-overlay";
  overlay.innerHTML = `
    <div class="mockup-editor" role="dialog" aria-label="시안 화면 편집">
      <header>
        <b>${escapeHtml(mockupEditor.label)}</b>
        <small>글상자를 눌러 바로 고칩니다. 저장하면 "시안대로 조판"에 그대로 들어갑니다.</small>
        <label><input type="checkbox" data-me-original ${mockupEditor.original ? "checked" : ""} /> 원본 시안 겹쳐 보기</label>
        <button class="primary-button" type="button" data-me-save>저장</button>
        <button class="secondary-button" type="button" data-me-close>닫기</button>
      </header>
      <div class="mockup-editor-stage" style="width:${stageWidth}px;height:${height * scale}px;background:${layout.background || "#FFFFFF"};">
        ${layout.items.map((item, index) => mockupEditorItemHtml(item, index, scale)).join("")}
        ${layout.plateId ? `<img class="me-plate" src="${designcraftMockupUrl(layout.plateId)}" alt="" />` : ""}
        ${lines.length && !layout.plateId ? `<svg class="me-lines" width="${stageWidth}" height="${height * scale}">${lines.map(({ item }) => `<line x1="${item.box[0] * scale}" y1="${item.box[1] * scale}" x2="${item.box[2] * scale}" y2="${item.box[3] * scale}" stroke="${item.stroke || item.color || "#999999"}" stroke-width="${Math.max(1, (Number(item.strokeWidth) || 1) * scale)}" ${item.dashed ? 'stroke-dasharray="4 3"' : ""} />`).join("")}</svg>` : ""}
        <i class="me-fold"></i>
        ${mockupEditor.original ? `<img class="me-original" src="${designcraftMockupUrl(imageId)}" alt="" />` : ""}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("[data-me-close]").addEventListener("click", () => {
    mockupEditor = null;
    overlay.remove();
  });
  overlay.querySelector("[data-me-original]").addEventListener("change", (event) => {
    collectMockupEditorTexts();
    mockupEditor.original = event.target.checked;
    renderMockupEditor();
  });
  overlay.querySelector("[data-me-save]").addEventListener("click", saveMockupEditor);
}

function collectMockupEditorTexts() {
  const texts = {};
  document.querySelectorAll(".mockup-editor [data-me-index]").forEach((element) => {
    const index = Number(element.dataset.meIndex);
    const text = element.innerText.replace(/\n$/, "");
    if (mockupEditor.layout.items[index] && mockupEditor.layout.items[index].text !== text) {
      mockupEditor.layout.items[index].text = text;
      texts[index] = text;
    }
  });
  mockupEditor.changed = { ...(mockupEditor.changed || {}), ...texts };
  return mockupEditor.changed;
}

async function saveMockupEditor() {
  const texts = collectMockupEditorTexts();
  if (!Object.keys(texts).length) {
    showToast("고친 글이 없습니다.");
    return;
  }
  try {
    const result = await designcraftPost("/api/prototype/designcraft/mockup-layout-save", { imageId: mockupEditor.imageId, texts });
    const mockup = state.designMockups?.[mockupEditor.key];
    if (mockup) {
      mockup.editedAt = new Date().toISOString();
      if (result?.previewId) mockup.previewId = result.previewId;
    }
    persistNow(`시안 글 ${Object.keys(texts).length}곳 고침`);
    showToast(`글 ${Object.keys(texts).length}곳을 저장했습니다. "시안대로 조판"에 반영됩니다.`);
    mockupEditor = null;
    document.querySelector(".mockup-editor-overlay")?.remove();
    renderWorkspace();
  } catch (error) {
    showToast(error?.message || "저장하지 못했습니다.");
  }
}

async function runMockupGenerate(onlyIndex = null) {
  const rows = designcraftScopedRows(designcraftPlan());
  let targets;
  let instruction = "";
  if (onlyIndex !== null) {
    const row = rows[onlyIndex];
    if (!row) return;
    instruction = window.prompt(`${row.page}~${row.page + 1}쪽 시안을 ${row.mockup?.imageId ? "다시 " : ""}그립니다(OpenAI 이미지 비용 1장).\n바꾸고 싶은 점이 있으면 적어 주세요(비워 두면 그대로 다시 그립니다).`, row.mockup?.instruction || "");
    if (instruction === null) return;
    targets = [row];
  } else {
    targets = rows.filter((row) => !row.mockup?.imageId);
    if (!targets.length) return;
    if (!window.confirm(`디자인 시안 ${targets.length}장을 그립니다. 장마다 OpenAI 이미지 비용(고품질)이 들고, 3장씩 동시에 그려 1장에 1~2분 걸립니다. 계속할까요?`)) return;
  }
  try {
    designcraftBusy = "시안 그리기 준비 중…";
    refreshDesigncraftPanel();
    const failed = await designcraftDrawMockups(targets, instruction);
    showToast(failed ? `시안 ${targets.length - failed}장을 그렸고 ${failed}장은 실패했습니다. 실패한 펼침면은 다시 그려 주세요.` : `시안 ${targets.length}장을 그렸습니다.`);
  } finally {
    designcraftBusy = "";
    refreshDesigncraftPanel();
  }
}

async function runMockupBuild() {
  const rows = designcraftSpreadRows(designcraftPlan()).filter((row) => row.mockup?.imageId);
  if (!rows.length) return;
  const unread = rows.filter((row) => !row.mockup.layout);
  if (unread.length && !window.confirm(`시안 ${unread.length}장의 배치(상자·글·그림 위치)를 AI가 읽은 뒤 조판합니다. 장마다 OpenAI 비용이 들고 1~3분 걸립니다. 계속할까요?`)) return;
  try {
    let cursor = 0;
    let done = 0;
    const errors = [];
    async function worker() {
      while (cursor < unread.length) {
        const row = unread[cursor];
        cursor += 1;
        try {
          await designcraftPost("/api/prototype/designcraft/mockup-layout", { imageId: row.mockup.imageId, spread: row.payload });
          state.designMockups[row.key] = { ...state.designMockups[row.key], layout: true };
        } catch (error) {
          errors.push(`${row.page}쪽: ${error?.message || "배치 읽기 실패"}`);
        }
        done += 1;
        designcraftBusy = `시안 배치 읽는 중… ${done}/${unread.length}`;
        refreshDesigncraftPanel();
      }
    }
    if (unread.length) {
      designcraftBusy = "시안 배치 읽기 준비 중…";
      refreshDesigncraftPanel();
      await Promise.all(Array.from({ length: Math.min(3, unread.length) }, () => worker()));
      persistNow("시안 배치 읽기 완료");
    }
    const buildable = rows.filter((row) => state.designMockups[row.key]?.layout);
    if (!buildable.length) throw new Error(errors[0] || "배치를 읽은 시안이 없습니다.");
    designcraftBusy = `시안 ${buildable.length}개 펼침면 조판 중…`;
    refreshDesigncraftPanel();
    const result = await designcraftPost("/api/prototype/designcraft/mockup-build", {
      title: `${state.project?.name || "교과서"}_디자인시안`,
      startPage: buildable[0].page,
      spreads: buildable.map((row) => ({ imageId: row.mockup.imageId })),
    });
    if (!Array.isArray(state.designcraftBuilds)) state.designcraftBuilds = [];
    state.designcraftBuilds.unshift({ at: new Date().toISOString(), scope: `디자인 시안 ${buildable.length}개 펼침면`, placeholders: 0, ...result });
    state.designcraftBuilds = state.designcraftBuilds.slice(0, 10);
    designcraftPreviewFolder = result.folder;
    persistNow("디자인 시안 조판 완료");
    const skipped = rows.length - buildable.length;
    showToast(`시안 ${result.spreads}개 펼침면을 조판했습니다.${skipped ? ` 배치를 읽지 못한 ${skipped}개는 빠졌습니다(${errors[0] || ""}).` : ""}`);
  } catch (error) {
    showToast(error?.message || "시안 조판에 실패했습니다.");
  } finally {
    designcraftBusy = "";
    refreshDesigncraftPanel();
  }
}

function designcraftStartPage() {
  const front = lineItemsTotalPages(state.frontMatterText);
  const start = front + 1;
  return start % 2 ? start + 1 : start;
}

function designcraftFileUrl(path) {
  return `/api/prototype/designcraft/file?path=${encodeURIComponent(path)}`;
}

function renderDesigncraftPanel() {
  loadDesigncraftStatus();
  return `<section class="designcraft-panel" id="designcraftPanel">${designcraftPanelInner()}</section>`;
}

// 작업 중 표시: 빙글 아이콘과 지난 시간. 조판처럼 한 단계가 수십 초 걸려도 멈춘 게 아님을 알 수 있게
// 1초마다 지난 시간만 고친다(패널 전체를 다시 그리지 않음).
let designcraftBusySince = 0;

function designcraftElapsedText() {
  const seconds = designcraftBusySince ? Math.round((Date.now() - designcraftBusySince) / 1000) : 0;
  return seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
}

function designcraftBusyLabel(text) {
  return `<span class="btn-spinner" aria-hidden="true"></span>${escapeHtml(text)} <small class="btn-elapsed" data-busy-elapsed>${designcraftElapsedText()}</small>`;
}

setInterval(() => {
  if (!designcraftBusy) return;
  const text = designcraftElapsedText();
  document.querySelectorAll("[data-busy-elapsed]").forEach((node) => { node.textContent = text; });
}, 1000);

function refreshDesigncraftPanel() {
  if (designcraftBusy && !designcraftBusySince) designcraftBusySince = Date.now();
  if (!designcraftBusy) designcraftBusySince = 0;
  const panel = document.querySelector("#designcraftPanel");
  if (panel) panel.innerHTML = designcraftPanelInner();
}

function designcraftPanelInner() {
  const status = designcraftStatus;
  const plan = designcraftPlan();
  const visuals = designcraftVisualItems(plan);
  const missingImages = visuals.filter((item) => !item.imageId && !item.imageBase64).length;
  const builds = Array.isArray(state.designcraftBuilds) ? state.designcraftBuilds : [];
  let statusHtml = `<span class="designcraft-status">설치 확인 중…</span>`;
  if (status) {
    if (status.available && status.local === false) statusHtml = `<span class="designcraft-status warn">이 화면은 다른 컴퓨터에서 접속 중입니다. 조판은 도구를 실행한 컴퓨터에서만 됩니다.</span>`;
    else if (status.available) statusHtml = `<span class="designcraft-status ok">${escapeHtml(status.version || "DesignCraft")} 연결됨</span>`;
    else statusHtml = `<span class="designcraft-status warn">이 컴퓨터에서 DesignCraft를 찾지 못했습니다. 설치 폴더를 환경 변수 DESIGNCRAFT_DIR로 알려 주세요.</span>`;
  }
  const scopeText = plan.selectedMode
    ? `선택한 초고 ${plan.items.length}개 · ${plan.spreads}개 펼침면(${plan.spreads * 2}쪽)`
    : `책 전체 · 초고가 있는 ${plan.items.length}/${plan.total}개 항목 · ${plan.spreads}개 펼침면(${plan.spreads * 2}쪽)${plan.missing ? ` · 초고 없는 ${plan.missing}개는 빠짐` : ""}`;
  const canBuild = Boolean(status?.available && status.local !== false && plan.spreads && !designcraftBusy);
  return `
    <div class="designcraft-head">
      <div><strong>시안·조판</strong></div>
      ${statusHtml}
    </div>
    <details class="designcraft-howto">
      <summary>이 도구와 DesignCraft는 어떻게 연결되나요?</summary>
      <ol>
        <li><b>이 도구</b>는 원고(글·활동·삽화 설명)와 시안 그림을 만듭니다. DesignCraft는 이 컴퓨터에 설치된 <b>조판 프로그램</b>(인디자인 같은 것)입니다. 따로 켤 필요가 없습니다.</li>
        <li>③ [조판하기]를 누르면 이 도구가 DesignCraft에 "쪽 만들기 → 시안 바탕 깔기 → 글상자에 원고 넣기 → 저장"을 대신 시킵니다. <b>.designcraft 파일·IDML(인디자인용)·PDF</b>가 <code>data/designcraft</code> 폴더에 생깁니다.</li>
        <li>다 만들어지면 아래 <b>만든 파일</b>의 [DesignCraft에서 열기]를 누르면 DesignCraft 창이 열립니다. 거기서 글·그림을 직접 다듬습니다. 인디자인을 쓰는 곳에는 IDML을 넘기면 됩니다.</li>
        <li>수정 조판: 06단계에서 고른 수정안대로 원고를 고친 뒤 다시 조판하면 새 회차 파일이 따로 생깁니다(이전 파일은 그대로 남음).</li>
      </ol>
    </details>
    ${designcraftPipelineSection(plan, status)}
    <details class="designcraft-basic"><summary>시안 없이 빠른 조판(원고 분량 확인용)</summary>
    <p class="pipeline-note">시안 그림 없이 정해진 기본 교과서 틀에 원고만 흘려 넣어 DesignCraft 파일을 만듭니다. AI 비용이 없고 1분 안에 끝나므로, 원고가 쪽에 넘치는지 빨리 확인할 때 씁니다. 디자인은 시안과 다릅니다.</p>
    <div class="designcraft-controls">
      <span class="designcraft-scope">${escapeHtml(scopeText)}</span>
      <label class="designcraft-option"><input type="checkbox" id="designcraftFillImages" ${missingImages ? "" : "disabled"} /> 그림이 없는 자리 ${missingImages}곳을 AI 삽화로 채운 뒤 조판 <small>(장당 비용·약 20~40초)</small></label>
      <button class="secondary-button" type="button" id="designcraftBuildButton" ${canBuild ? "" : "disabled"}>${designcraftBusy && !designcraftBusy.includes("시안") && !designcraftBusy.startsWith("배치") && !designcraftBusy.startsWith("조판 중") ? designcraftBusyLabel(designcraftBusy) : "기본 틀로 조판"}</button>
    </div>
    </details>
    ${builds.length ? `
      <h4 class="designcraft-builds-title">만든 파일 <small>[DesignCraft에서 열기]를 누르면 DesignCraft 창에서 열립니다</small></h4>
      <ul class="designcraft-builds">
        ${builds.map((build, index) => `
          <li class="${index === 0 ? "latest" : ""}">
            <div class="designcraft-build-meta">
              <b>${escapeHtml(formatDraftBatchTimestamp(build.at))}</b>
              <span>${escapeHtml(build.scope || "")} · ${build.spreads}개 펼침면 · ${build.startPage}~${build.startPage + build.pages - 1}쪽 · 삽화 ${build.images}장${build.placeholders ? ` · 그림 자리 ${build.placeholders}곳` : ""} · ${build.seconds}초</span>
              ${build.adjusted ? `<span class="designcraft-warn" title="시안에서 가운데 접히는 곳을 넘던 상자·그림·글을 한쪽 안으로 옮기거나 쪽마다 나눴습니다. DesignCraft에서 배치를 확인해 주세요.">쪽 나눔 조정 ${build.adjusted}곳</span>` : ""}
              ${build.overset?.length ? `<span class="designcraft-warn" title="${escapeHtml(build.overset.join(", "))}">글 넘침 ${build.overset.length}곳: ${escapeHtml(build.overset.slice(0, 6).join(", "))}${build.overset.length > 6 ? " …" : ""}</span>` : `<span class="designcraft-ok">글 넘침 없음</span>`}
              ${build.errors?.length ? `<span class="designcraft-warn" title="${escapeHtml(build.errors.join("\n"))}">명령 오류 ${build.errors.length}건</span>` : ""}
            </div>
            <div class="designcraft-build-actions">
              <button class="primary-button" type="button" data-designcraft-open="${index}">DesignCraft에서 열기</button>
              <button class="secondary-button" type="button" data-designcraft-preview="${index}">${designcraftPreviewFolder === build.folder ? "미리보기 닫기" : "미리보기"}</button>
              <a class="secondary-button" href="${designcraftFileUrl(build.files.idml)}">IDML(인디자인)</a>
              ${build.files.printPdf ? `<a class="secondary-button" href="${designcraftFileUrl(build.files.printPdf)}" target="_blank" rel="noopener">낱쪽 PDF</a>` : ""}
              <button class="secondary-button" type="button" data-designcraft-reveal="${index}">폴더 열기</button>
              <button class="tertiary-button" type="button" data-designcraft-forget="${index}" title="목록에서만 지웁니다(파일은 폴더에 남음)">목록에서 지우기</button>
            </div>
            ${designcraftPreviewFolder === build.folder ? `<iframe class="designcraft-preview" src="${designcraftFileUrl(build.files.pdf)}#view=FitH" title="조판 미리보기 PDF"></iframe>` : ""}
          </li>`).join("")}
      </ul>` : ""}`;
}

async function designcraftPost(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) throw new Error(payload.error || `요청 실패(HTTP ${response.status})`);
  return payload.result;
}

async function designcraftFillImages(plan) {
  const missing = designcraftVisualItems(plan).filter((item) => !item.imageId && !item.imageBase64 && item.description);
  if (!missing.length) return 0;
  if (!window.confirm(`그림이 없는 자리 ${missing.length}곳에 AI 삽화를 생성합니다. 장마다 OpenAI 이미지 비용이 들고 시간이 걸립니다. 계속할까요?`)) throw new Error("삽화 생성을 취소했습니다.");
  const audience = isElementaryPeProject() ? "elementary" : "";
  let cursor = 0;
  let done = 0;
  let failed = 0;
  async function worker() {
    while (cursor < missing.length) {
      const item = missing[cursor];
      cursor += 1;
      try {
        const result = await designcraftPost("/api/prototype/sports-culture-image", { description: item.description, size: item.size, audience });
        item.imageBase64 = result.imageBase64;
        item.imageId = result.imageId;
      } catch (error) {
        failed += 1;
        item.imageError = error?.message || "이미지 생성 실패";
      }
      done += 1;
      designcraftBusy = `삽화 생성 중… ${done}/${missing.length}`;
      refreshDesigncraftPanel();
      if (done % 5 === 0) persist("AI 삽화 생성 중");
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()));
  persistNow(`AI 삽화 ${missing.length - failed}장 생성됨`);
  return failed;
}

async function runDesigncraftBuild() {
  const plan = designcraftPlan();
  if (!plan.spreads) {
    showToast("조판할 초고가 없습니다. 먼저 초고를 생성해 주세요.");
    return;
  }
  const fillImages = document.querySelector("#designcraftFillImages")?.checked;
  try {
    if (fillImages) {
      designcraftBusy = "삽화 생성 준비 중…";
      refreshDesigncraftPanel();
      const failed = await designcraftFillImages(plan);
      if (failed) showToast(`삽화 ${failed}장은 생성하지 못해 그림 자리로 둡니다.`);
    }
    designcraftBusy = `${plan.spreads}개 펼침면 조판 중…`;
    refreshDesigncraftPanel();
    const spreads = plan.items.flatMap((item) => item.entry.spreads.map((spread) => designcraftSpreadPayload(item, spread)));
    const title = `${state.project?.name || "교과서"}${plan.selectedMode ? "_선택" : ""}`;
    const result = await designcraftPost("/api/prototype/designcraft/build", { title, startPage: designcraftStartPage(), spreads });
    if (!Array.isArray(state.designcraftBuilds)) state.designcraftBuilds = [];
    state.designcraftBuilds.unshift({
      at: new Date().toISOString(),
      scope: plan.selectedMode ? `선택 ${plan.items.length}개 항목` : `책 전체 ${plan.items.length}개 항목`,
      ...result,
    });
    state.designcraftBuilds = state.designcraftBuilds.slice(0, 10);
    designcraftPreviewFolder = result.folder;
    persistNow("DesignCraft 조판 완료");
    showToast(`${result.spreads}개 펼침면을 조판했습니다(${result.seconds}초).${result.overset.length ? ` 글 넘침 ${result.overset.length}곳은 DesignCraft에서 조정해 주세요.` : ""}`);
  } catch (error) {
    showToast(error?.message || "조판에 실패했습니다.");
  } finally {
    designcraftBusy = "";
    refreshDesigncraftPanel();
  }
}

function bindDesigncraftPanel() {
  // 아래 초고 표에서 고른 것이 바뀌면 조판 대상(책 전체 / 선택한 초고) 안내도 바로 바꾼다.
  document.querySelector("#workspace")?.addEventListener("change", (event) => {
    if (event.target.id === "mockupBuildMode") {
      state.designcraftBuildMode = event.target.value;
      persist("조판 방식 변경됨");
      refreshDesigncraftPanel();
      return;
    }
    if (event.target.id === "mockupScope") {
      designcraftScope = event.target.value;
      designcraftMockupIndex = 0;
      refreshDesigncraftPanel();
      return;
    }
    if (event.target.closest("[data-draft-file-checkbox], [data-draft-file-row-checkbox], [data-draft-file-column-checkbox], #draftFileSelectAll")) {
      setTimeout(refreshDesigncraftPanel, 0);
    }
  });
  document.querySelector("#workspace")?.addEventListener("click", async (event) => {
    const entryMockupButton = event.target.closest("[data-mockup-edit], [data-entry-mockup-draw], [data-entry-mockup-redo]");
    if (entryMockupButton) {
      const [batchIndex, entryIndex, spreadIndex] = (entryMockupButton.dataset.mockupEdit || entryMockupButton.dataset.entryMockupDraw || entryMockupButton.dataset.entryMockupRedo).split(":").map(Number);
      entryMockupButton.disabled = true;
      try {
        if (entryMockupButton.dataset.mockupEdit) await openMockupEditor(batchIndex, entryIndex, spreadIndex);
        else await drawMockupsForEntry(batchIndex, entryIndex, entryMockupButton.dataset.entryMockupRedo ? spreadIndex : null);
      } finally {
        entryMockupButton.disabled = false;
      }
      return;
    }
    if (event.target.closest("#mockupPipelineButton")) {
      await runMockupPipeline("all");
      return;
    }
    if (event.target.closest("#mockupDrawButton")) {
      await runMockupPipeline("draw");
      return;
    }
    if (event.target.closest("#mockupBuildUnitsButton")) {
      await runMockupPipeline("build");
      return;
    }
    if (event.target.closest("#mockupBrowseToggle")) {
      designcraftBrowseOpen = !designcraftBrowseOpen;
      refreshDesigncraftPanel();
      return;
    }
    if (event.target.closest("#mockupStopButton")) {
      designcraftStop = true;
      refreshDesigncraftPanel();
      return;
    }
    const standardButton = event.target.closest("[data-mockup-standard]");
    if (standardButton) {
      const row = designcraftScopedRows(designcraftPlan())[Number(standardButton.dataset.mockupStandard)];
      if (row) toggleDesignStandard(row);
      return;
    }
    const mockupButton = event.target.closest("[data-mockup-step], [data-mockup-go], [data-mockup-redo], #mockupGenerateButton, #mockupBuildButton");
    if (mockupButton) {
      if (mockupButton.id === "mockupGenerateButton") await runMockupGenerate();
      else if (mockupButton.id === "mockupBuildButton") await runMockupBuild();
      else if (mockupButton.dataset.mockupRedo !== undefined) await runMockupGenerate(Number(mockupButton.dataset.mockupRedo));
      else {
        designcraftMockupIndex = mockupButton.dataset.mockupGo !== undefined ? Number(mockupButton.dataset.mockupGo) : designcraftMockupIndex + Number(mockupButton.dataset.mockupStep);
        refreshDesigncraftPanel();
        document.querySelector(".mockup-thumb.active")?.scrollIntoView({ block: "nearest", inline: "center" });
      }
      return;
    }
    const button = event.target.closest("[data-designcraft-open], [data-designcraft-preview], [data-designcraft-reveal], [data-designcraft-forget], #designcraftBuildButton");
    if (!button) return;
    if (button.id === "designcraftBuildButton") {
      await runDesigncraftBuild();
      return;
    }
    const builds = Array.isArray(state.designcraftBuilds) ? state.designcraftBuilds : [];
    const index = Number(button.dataset.designcraftOpen ?? button.dataset.designcraftPreview ?? button.dataset.designcraftReveal ?? button.dataset.designcraftForget);
    const build = builds[index];
    if (!build) return;
    if (button.dataset.designcraftPreview !== undefined) {
      designcraftPreviewFolder = designcraftPreviewFolder === build.folder ? "" : build.folder;
      refreshDesigncraftPanel();
      return;
    }
    if (button.dataset.designcraftForget !== undefined) {
      builds.splice(index, 1);
      persist("조판 목록에서 지움");
      refreshDesigncraftPanel();
      return;
    }
    const original = button.textContent;
    button.disabled = true;
    try {
      if (button.dataset.designcraftOpen !== undefined) {
        button.textContent = "여는 중…";
        await designcraftPost("/api/prototype/designcraft/open", { path: build.files.designcraft });
        showToast("DesignCraft 창에서 문서를 열었습니다.");
      } else {
        await designcraftPost("/api/prototype/designcraft/reveal", { path: build.folder });
      }
    } catch (error) {
      showToast(error?.message || "요청에 실패했습니다.");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}
