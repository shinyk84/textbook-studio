// 조판 편집기: 생성된 초고 펼침면을 실제 지면 크기(188×257mm, 4×6배판)로 앉혀 보고, 지면 위에서
// 바로 글을 고친다. 고친 글은 원고 데이터(spread.textbook_manuscript)에 그대로 들어가므로 TXT·PDF·
// PPT·폴더 저장이 모두 고친 내용을 따른다. 인디자인처럼 쪽마다 글이 넘치면(오버셋) 빨간 표시를
// 띄우고, 절을 다음 쪽으로 넘기거나 글자 크기를 줄여 맞춘다. 인쇄(PDF 저장)는 화면과 같은 판면으로
// 펼침면마다 한 장씩 나간다.
//
// prototype.js의 전역 함수·상태(state, persist, escapeHtml, manuscriptSideVisuals …)를 쓰므로
// prototype.js 다음에 불러온다.
(function attachLayoutEditor() {
  "use strict";

  const editor = { batchIndex: -1, entryIndex: -1, spreadIndex: 0, zoom: 3, selected: null };
  let saveTimer = null;
  let overlay = null;

  const entryOf = () => state.frameworkDraftLog?.[editor.batchIndex]?.entries?.[editor.entryIndex] || null;
  const batchOf = () => state.frameworkDraftLog?.[editor.batchIndex] || null;
  const spreadOf = () => entryOf()?.spreads?.[editor.spreadIndex] || null;

  function getAt(target, path) {
    return path.split(".").reduce((value, key) => (value == null ? value : value[key]), target);
  }

  function setAt(target, path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node?.[key], target);
    if (parent != null) parent[last] = value;
  }

  function field(path, text, tag = "p", className = "", placeholder = "") {
    return `<${tag} class="${className}" contenteditable="true" spellcheck="false" data-edit="${path}" data-placeholder="${escapeHtml(placeholder)}">${escapeHtml(text || "")}</${tag}>`;
  }

  // 삽화 설명도 지면 위에서 고칠 수 있게 원래 자리(visuals 또는 visualBriefs)의 경로를 붙인다.
  function sideVisualsWithPaths(manuscript, side) {
    if (manuscript.visuals) {
      return (manuscript.visuals[side] || []).map((item, index) => ({ item, path: `textbook_manuscript.visuals.${side}.${index}.description` }));
    }
    const briefs = manuscript.visualBriefs || [];
    const half = Math.ceil(briefs.length / 2);
    const offset = side === "left" ? 0 : half;
    return (side === "left" ? briefs.slice(0, half) : briefs.slice(half))
      .map((description, index) => ({ item: { description, size: "small" }, path: `textbook_manuscript.visualBriefs.${offset + index}` }));
  }

  function renderVisuals(list) {
    if (!list.length) return "";
    return `<div class="le-visuals">${list.map(({ item, path }) => `
      <figure class="le-visual size-${escapeHtml(item.size || "small")}${item.imageBase64 ? " has-image" : ""}">
        ${item.imageBase64 ? `<img src="data:image/png;base64,${item.imageBase64}" alt="" />` : ""}
        ${field(path, item.description, "figcaption", "", "삽화 설명")}
      </figure>`).join("")}</div>`;
  }

  function renderSection(section, index) {
    const base = `textbook_manuscript.sections.${index}`;
    const marker = section.label
      ? `<span class="le-section-label">${escapeHtml(section.label)}</span>`
      : `<span class="le-section-number">${escapeHtml(String(section.number ?? index + 1))}</span>`;
    return `
      <section class="le-frame${section.boxType ? " boxed" : ""}${editor.selected === index ? " selected" : ""}" data-section-index="${index}" style="--fs:${Number(section.fontScale) || 1}">
        <header>${marker}${field(`${base}.title`, section.title, "h3", "", "절 제목")}${section.boxType ? `<span class="le-boxtype">${escapeHtml(section.boxType)}</span>` : ""}</header>
        ${(section.paragraphs || []).map((paragraph, paragraphIndex) => field(`${base}.paragraphs.${paragraphIndex}`, paragraph, "p", "le-paragraph", "내용을 입력하세요")).join("")}
      </section>`;
  }

  function renderPage(entry, spread, side) {
    const manuscript = spread.textbook_manuscript || {};
    const sections = Array.isArray(manuscript.sections) ? manuscript.sections : [];
    const split = manuscriptPageSplit(manuscript);
    const indexes = sections.map((_, index) => index).filter((index) => (side === "left" ? index < split : index >= split));
    const pageNumber = side === "left" ? spread.left_page || 1 : spread.right_page || 2;
    const head = side === "left"
      ? `${spread.lesson_label ? `<span class="le-lesson">${escapeHtml(spread.lesson_label)}</span>` : ""}
         ${field("textbook_manuscript.headline", manuscript.headline || spread.title, "h2", "le-headline", "펼침면 제목")}
         <div class="le-goal"><b>학습 목표</b>${field("textbook_manuscript.learningGoal", manuscript.learningGoal || spread.intro, "span", "", "학습 목표")}</div>
         ${manuscript.openingQuestion != null ? `<div class="le-opening"><b>생각 열기</b>${field("textbook_manuscript.openingQuestion", manuscript.openingQuestion, "span", "", "생각 열기 질문")}</div>` : ""}`
      : `<p class="le-role">${escapeHtml(entry.primaryTypeLabel || entrySubjectLabel(entry))} · ${escapeHtml(spread.role || "")}</p>`;
    return `
      <div class="le-page le-page-${side}">
        <div class="le-page-body" data-page-side="${side}">
          ${head}
          ${indexes.map((index) => renderSection(sections[index], index)).join("")}
          ${renderVisuals(sideVisualsWithPaths(manuscript, side))}
        </div>
        <span class="le-overset" hidden>글 넘침</span>
        <span class="le-folio">${escapeHtml(String(pageNumber))} · ${escapeHtml(entrySubjectLabel(entry))}</span>
      </div>`;
  }

  function renderSpread(entry, spread) {
    const accent = { balanced: "balanced", activity: "activity", creative: "creative" }[entry.frameworkId] || "balanced";
    return `<div class="le-spread spread-accent-${accent}">${renderPage(entry, spread, "left")}<div class="le-gutter"></div>${renderPage(entry, spread, "right")}</div>`;
  }

  function toolbarHtml(entry) {
    const total = entry.spreads.length;
    const selected = editor.selected != null;
    const batch = batchOf();
    const canFolder = Boolean(batch?.folderPath && workspaceFolder?.isConnected());
    return `
      <div class="le-toolbar">
        <div class="le-title"><strong>조판 편집</strong><span>${escapeHtml(entry.smallUnitLabel || "")}</span></div>
        <div class="le-group">
          <button type="button" data-le="prev" ${editor.spreadIndex === 0 ? "disabled" : ""} aria-label="이전 펼침면">◀</button>
          <span>${editor.spreadIndex + 1} / ${total} 펼침면</span>
          <button type="button" data-le="next" ${editor.spreadIndex >= total - 1 ? "disabled" : ""} aria-label="다음 펼침면">▶</button>
        </div>
        <div class="le-group">
          <button type="button" data-le="zoom-out" aria-label="축소">−</button>
          <span>${Math.round((editor.zoom / 3) * 100)}%</span>
          <button type="button" data-le="zoom-in" aria-label="확대">＋</button>
        </div>
        <div class="le-group" title="${selected ? "선택한 절에 적용" : "지면에서 절을 눌러 선택하세요"}">
          <button type="button" data-le="font-down" ${selected ? "" : "disabled"}>가−</button>
          <button type="button" data-le="font-up" ${selected ? "" : "disabled"}>가＋</button>
          <button type="button" data-le="to-prev-page" ${selected ? "" : "disabled"}>앞 쪽으로</button>
          <button type="button" data-le="to-next-page" ${selected ? "" : "disabled"}>다음 쪽으로</button>
          <button type="button" data-le="add-paragraph" ${selected ? "" : "disabled"}>문단 추가</button>
        </div>
        <div class="le-group le-actions">
          <button type="button" data-le="print">PDF 저장(인쇄)</button>
          ${canFolder ? '<button type="button" data-le="folder">폴더 파일 갱신</button>' : ""}
          <button type="button" class="le-close" data-le="close">닫기</button>
        </div>
        <p class="le-status" data-le-status>글을 바로 고칠 수 있습니다. Enter는 새 문단, 문단 맨 앞에서 Backspace는 앞 문단과 합칩니다.</p>
      </div>`;
  }

  function render(focusPath = "", caretAtStart = false) {
    const entry = entryOf();
    const spread = spreadOf();
    if (!entry || !spread) {
      close();
      return;
    }
    overlay.style.setProperty("--mm", `${editor.zoom}px`);
    overlay.innerHTML = `${toolbarHtml(entry)}<div class="le-stage">${renderSpread(entry, spread)}</div>
      <div class="le-print-root">${entry.spreads.map((item) => renderSpread(entry, item)).join("")}</div>`;
    measureOverset();
    if (focusPath) {
      const target = overlay.querySelector(`.le-stage [data-edit="${focusPath}"]`);
      if (target) {
        target.focus();
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(caretAtStart);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }

  // 판면(쪽 높이)보다 글이 길면 인디자인의 오버셋처럼 그 쪽에 빨간 표시를 한다.
  function measureOverset() {
    let overflowing = 0;
    overlay.querySelectorAll(".le-stage .le-page").forEach((page) => {
      const body = page.querySelector(".le-page-body");
      const over = body.scrollHeight - body.clientHeight > 2;
      page.classList.toggle("is-overset", over);
      page.querySelector(".le-overset").hidden = !over;
      if (over) overflowing += 1;
    });
    const status = overlay.querySelector("[data-le-status]");
    if (status && overflowing) status.textContent = `글이 넘친 쪽이 ${overflowing}개 있습니다. 글을 줄이거나, 절을 다음 쪽으로 보내거나, 글자 크기를 줄여 주세요.`;
  }

  function scheduleSave(message = "조판 수정 저장됨") {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const entry = entryOf();
      if (entry) entry.editedAt = new Date().toISOString();
      persist(message);
    }, 600);
  }

  function flushSave() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    const entry = entryOf();
    if (entry) entry.editedAt = new Date().toISOString();
    persist("조판 수정 저장됨");
  }

  function caretOffset(element) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return 0;
    const range = selection.getRangeAt(0).cloneRange();
    range.selectNodeContents(element);
    range.setEnd(selection.getRangeAt(0).endContainer, selection.getRangeAt(0).endOffset);
    return range.toString().length;
  }

  function onInput(event) {
    const target = event.target.closest("[data-edit]");
    if (!target || !target.closest(".le-stage")) return;
    setAt(spreadOf(), target.dataset.edit, target.innerText.replace(/\n+$/, ""));
    measureOverset();
    scheduleSave();
  }

  function onKeydown(event) {
    if (event.key === "Escape") {
      close();
      return;
    }
    const target = event.target.closest(".le-stage [data-edit]");
    if (!target) return;
    const match = target.dataset.edit.match(/^textbook_manuscript\.sections\.(\d+)\.paragraphs\.(\d+)$/);
    if (event.key === "Enter") {
      event.preventDefault();
      if (!match) return;
      // 문단을 커서 위치에서 둘로 나눈다.
      const [sectionIndex, paragraphIndex] = [Number(match[1]), Number(match[2])];
      const text = target.innerText.replace(/\n+$/, "");
      const offset = caretOffset(target);
      const paragraphs = spreadOf().textbook_manuscript.sections[sectionIndex].paragraphs;
      paragraphs.splice(paragraphIndex, 1, text.slice(0, offset).trimEnd(), text.slice(offset).trimStart());
      editor.selected = sectionIndex;
      scheduleSave();
      render(`textbook_manuscript.sections.${sectionIndex}.paragraphs.${paragraphIndex + 1}`, true);
      return;
    }
    if (event.key === "Backspace" && match && Number(match[2]) > 0 && caretOffset(target) === 0 && !window.getSelection().toString()) {
      event.preventDefault();
      const [sectionIndex, paragraphIndex] = [Number(match[1]), Number(match[2])];
      const paragraphs = spreadOf().textbook_manuscript.sections[sectionIndex].paragraphs;
      const previous = paragraphs[paragraphIndex - 1] || "";
      paragraphs.splice(paragraphIndex - 1, 2, `${previous}${target.innerText.replace(/\n+$/, "")}`);
      scheduleSave();
      render(`textbook_manuscript.sections.${sectionIndex}.paragraphs.${paragraphIndex - 1}`, false);
    }
  }

  // 붙여 넣을 때 서식(글꼴·색)은 버리고 글자만 넣는다.
  function onPaste(event) {
    if (!event.target.closest(".le-stage [data-edit]")) return;
    event.preventDefault();
    const text = (event.clipboardData?.getData("text/plain") || "").replace(/\s*\n\s*/g, " ");
    document.execCommand("insertText", false, text);
  }

  async function saveToFolder(button) {
    const batch = batchOf();
    const entry = entryOf();
    if (!batch?.folderPath || !entry) return;
    flushSave();
    button.disabled = true;
    button.textContent = "저장 중…";
    try {
      const prefix = batch.entries.length > 1 ? `${sanitizeZipEntryName(entry.frameworkName)}_` : "";
      await writeEntryFilesToFolder(batch.folderPath, entry, prefix);
      showToast("수정한 원고로 폴더의 TXT·PDF·PNG·PPT·원고데이터를 다시 저장했습니다.");
    } catch (error) {
      showToast(`폴더에 저장하지 못했습니다: ${error?.message || error}`);
    }
    button.disabled = false;
    button.textContent = "폴더 파일 갱신";
  }

  function onClick(event) {
    const frame = event.target.closest(".le-stage .le-frame");
    if (frame && Number(frame.dataset.sectionIndex) !== editor.selected) {
      editor.selected = Number(frame.dataset.sectionIndex);
      overlay.querySelectorAll(".le-stage .le-frame").forEach((node) => node.classList.toggle("selected", node === frame));
      overlay.querySelector(".le-toolbar").outerHTML = toolbarHtml(entryOf());
    }
    const button = event.target.closest("[data-le]");
    if (!button) return;
    const action = button.dataset.le;
    const manuscript = spreadOf()?.textbook_manuscript;
    const section = editor.selected != null ? manuscript?.sections?.[editor.selected] : null;
    if (action === "close") return close();
    if (action === "print") {
      flushSave();
      window.print();
      return;
    }
    if (action === "folder") return saveToFolder(button);
    if (action === "prev" || action === "next") {
      editor.spreadIndex += action === "next" ? 1 : -1;
      editor.selected = null;
    } else if (action === "zoom-in" || action === "zoom-out") {
      editor.zoom = Math.max(1.5, Math.min(5, editor.zoom + (action === "zoom-in" ? 0.5 : -0.5)));
    } else if (section && (action === "font-up" || action === "font-down")) {
      const next = (Number(section.fontScale) || 1) + (action === "font-up" ? 0.05 : -0.05);
      section.fontScale = Math.round(Math.max(0.75, Math.min(1.4, next)) * 100) / 100;
      scheduleSave();
    } else if (section && (action === "to-next-page" || action === "to-prev-page")) {
      // 왼쪽·오른쪽 쪽의 경계(pageSplit)를 옮겨 이 절을 다른 쪽으로 흘려 보낸다.
      const split = manuscriptPageSplit(manuscript);
      if (action === "to-next-page" && editor.selected < split) manuscript.pageSplit = editor.selected;
      else if (action === "to-prev-page" && editor.selected >= split) manuscript.pageSplit = editor.selected + 1;
      else showToast(action === "to-next-page" ? "이미 오른쪽 쪽에 있는 절입니다." : "이미 왼쪽 쪽에 있는 절입니다.");
      scheduleSave();
    } else if (section && action === "add-paragraph") {
      section.paragraphs = [...(section.paragraphs || []), ""];
      scheduleSave();
      render(`textbook_manuscript.sections.${editor.selected}.paragraphs.${section.paragraphs.length - 1}`, true);
      return;
    }
    render();
  }

  function open(batchIndex, entryIndex, spreadIndex = 0) {
    if (!state.frameworkDraftLog?.[batchIndex]?.entries?.[entryIndex]) return;
    Object.assign(editor, { batchIndex, entryIndex, spreadIndex, selected: null });
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "layout-editor";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-label", "조판 편집");
      overlay.addEventListener("input", onInput);
      overlay.addEventListener("keydown", onKeydown);
      overlay.addEventListener("paste", onPaste);
      overlay.addEventListener("click", onClick);
      document.body.appendChild(overlay);
    }
    overlay.hidden = false;
    document.body.classList.add("layout-editor-open");
    render();
  }

  function close() {
    flushSave();
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("layout-editor-open");
    // 미리보기·PNG 캔버스가 고친 원고를 따르도록 다시 그린다.
    renderWorkspace();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-layout-editor]");
    if (!button) return;
    const [batchIndex, entryIndex, spreadIndex] = button.dataset.openLayoutEditor.split(":").map(Number);
    open(batchIndex, entryIndex, spreadIndex);
  });

  globalThis.LAYOUT_EDITOR = { open, close };
})();
