// "분석" 보기(읽기 전용): 개정·책 프로젝트별 교육과정 구조와 출판사 교과서·지도서의 쪽수·차시.
// 자료는 revision-reference-data.js(scripts/build_revision_reference.py)에서 온다.
// "개발"(01~06 단계)이 새 책을 만드는 곳이라면, "분석"은 이미 나온 책(2009·2015·2022 개정)을 차기 개정
// 개발의 근거로 살펴보는 곳이다. 2009·2015 개정은 분석만, 2022 개정은 개발(검증용)과 분석을 함께 쓴다.

// 개정마다 분석할 수 있는 책 프로젝트(카탈로그 id). 초등 개발에 고등 자료가 섞이지 않게 프로젝트로 나눈다.
const ANALYSIS_PROJECTS = {
  "2015": ["elementary-3-4", "elementary-5-6"],
  "2009": ["elementary-3-4", "elementary-5-6", "high-sports-culture"],
};
const ANALYSIS_BANDS = { "elementary-3-4": { band: "3-4", label: "3~4학년군", grades: [3, 4] }, "elementary-5-6": { band: "5-6", label: "5~6학년군", grades: [5, 6] } };

let referenceGrade = "all";

function referenceData(revisionId) {
  return globalThis.REVISION_REFERENCE?.revisions?.[revisionId] || null;
}

function hasRevisionReference(revisionId) {
  return Boolean(referenceData(revisionId));
}

function analysisProjectIds(revisionId) {
  return ANALYSIS_PROJECTS[revisionId] || null;
}

function referenceStat(label, value, note = "") {
  return `<span class="analysis-stat"><small>${escapeHtml(label)}</small> ${escapeHtml(value)}${note ? ` <small>(${escapeHtml(note)})</small>` : ""}</span>`;
}

function referenceAverage(values) {
  const numbers = values.filter((value) => typeof value === "number");
  return numbers.length ? Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length) : null;
}

function referenceBookTable(books, areaKeys) {
  const total = (book, key) => book.units.reduce((sum, unit) => (typeof unit[key] === "number" ? sum + unit[key] : sum), 0);
  const hasHours = (book) => book.units.every((unit) => typeof unit.hours === "number");
  const extraAreas = [...new Set(books.flatMap((book) => book.units.map((unit) => unit.area)).filter((area) => !areaKeys.includes(area)))];
  const columns = [...areaKeys, ...extraAreas];
  const cell = (unit) => (unit ? `${unit.hours ?? "?"}<small>차시</small> ${unit.pages ?? "?"}<small>쪽</small>` : "—");
  const rows = books.map((book) => {
    const byArea = Object.fromEntries(book.units.map((unit) => [unit.area, unit]));
    return `<tr>
      <td><b>${escapeHtml(book.publisher)}</b></td><td>${book.grade}학년</td>
      <td>${book.textbook_pages ?? "—"}</td><td>${book.guide_pages ?? "—"}</td>
      ${columns.map((key) => `<td>${cell(byArea[key])}</td>`).join("")}
      <td><b>${hasHours(book) ? total(book, "hours") : "?"}</b><small>차시</small> <b>${total(book, "pages")}</b><small>쪽</small></td>
      <td class="reference-note">${escapeHtml([book.chasi_note, book.pdf_scope].filter(Boolean).join(" · "))}</td>
    </tr>`;
  }).join("");
  const average = `<tr class="reference-average">
    <td colspan="2">평균</td>
    <td>${referenceAverage(books.map((book) => book.textbook_pages)) ?? "—"}</td><td>${referenceAverage(books.map((book) => book.guide_pages)) ?? "—"}</td>
    ${columns.map((key) => {
      const units = books.map((book) => book.units.find((unit) => unit.area === key)).filter(Boolean);
      return `<td>${units.length ? `${referenceAverage(units.map((unit) => unit.hours)) ?? "?"}<small>차시</small> ${referenceAverage(units.map((unit) => unit.pages)) ?? "?"}<small>쪽</small>` : "—"}</td>`;
    }).join("")}
    <td>${referenceAverage(books.filter(hasHours).map((book) => total(book, "hours"))) ?? "?"}<small>차시</small> ${referenceAverage(books.map((book) => total(book, "pages"))) ?? "?"}<small>쪽</small></td><td></td>
  </tr>`;
  return `<div class="reference-table-wrap"><table class="reference-table">
    <thead><tr><th>출판사</th><th>학년</th><th>교과서(쪽)</th><th>지도서(쪽)</th>${columns.map((key) => `<th>${escapeHtml(key)}</th>`).join("")}<th>단원 합계</th><th>비고</th></tr></thead>
    <tbody>${rows}${books.length > 1 ? average : ""}</tbody></table></div>`;
}

function renderElementaryCurriculum(data, revisionId, bandInfo) {
  const elementary = data.elementary;
  if (revisionId === "2009") {
    return `
      <section class="analysis-section">
        <h3>교육과정 구조</h3>
        <div class="analysis-stats">
          <b class="analysis-band">${bandInfo.label}</b>
          ${referenceStat("기준 시수", `${elementary.hoursPerBand}시간`, `학년당 ${elementary.hoursPerGrade}차시`)}
          ${referenceStat("대영역", `${elementary.areas.length}개`, "중영역 2개씩")}
          ${referenceStat("성취기준", `${elementary.standardsPerBand}개`)}
        </div>
        <table class="reference-table compact"><thead><tr><th>대영역</th><th>${bandInfo.label} 중영역</th></tr></thead>
          <tbody>${elementary.areas.map((area) => `<tr><td><b>${escapeHtml(area.key)}</b></td><td>${escapeHtml(area.middle[bandInfo.band].join(" · "))}</td></tr>`).join("")}</tbody></table>
      </section>`;
  }
  const areas = elementary.areas;
  const standardTotal = areas.reduce((sum, area) => sum + (area.standards?.[bandInfo.band] || 0), 0);
  return `
    <section class="analysis-section">
      <h3>교육과정 구조</h3>
      <div class="analysis-stats">
        <b class="analysis-band">${bandInfo.label}</b>
        ${referenceStat("기준 시수", `${elementary.hoursPerBand}시간`, `학년당 ${elementary.hoursPerGrade}차시`)}
        ${referenceStat("영역", `${areas.length}개`, areas.map((area) => area.key).join("·"))}
        ${referenceStat("성취기준", `${standardTotal}개`, areas.map((area) => `${area.key} ${area.standards?.[bandInfo.band] ?? "?"}`).join(" · "))}
      </div>
      ${elementary.note ? `<p class="reference-note">${escapeHtml(elementary.note)}</p>` : ""}
    </section>`;
}

function renderElementaryBooks(data, revisionId, bandInfo) {
  const areaKeys = (data.elementary.areas || []).map((area) => area.key);
  const bandBooks = (data.books || []).filter((book) => bandInfo.grades.includes(book.grade));
  if (!bandBooks.length) {
    return `<section class="analysis-section"><h3>교과서·지도서</h3><p class="reference-note">${escapeHtml(data.label)} 초등 ${bandInfo.label} 교과서·지도서는 전처리 자료에 없습니다.</p></section>`;
  }
  const grade = bandInfo.grades.map(String).includes(referenceGrade) ? referenceGrade : "all";
  const books = bandBooks.filter((book) => grade === "all" || String(book.grade) === grade);
  const other = revisionId === "2022" ? "2015" : "2022";
  const otherBooks = (referenceData(other)?.books || []).filter((book) => bandInfo.grades.includes(book.grade) && (grade === "all" || String(book.grade) === grade));
  const otherAverage = referenceAverage(otherBooks.map((book) => book.textbook_pages));
  return `
    <section class="analysis-section">
      <div class="analysis-section-head">
        <h3>교과서·지도서 쪽수와 차시</h3>
        <div class="reference-grade-tabs">${["all", ...bandInfo.grades.map(String)].map((value) => `<button type="button" class="${value === grade ? "active" : ""}" data-reference-grade="${value}">${value === "all" ? "전체" : `${value}학년`}</button>`).join("")}</div>
        <button class="secondary-button" type="button" data-reference-export="${revisionId}">엑셀로 받기</button>
      </div>
      ${referenceBookTable(books, areaKeys)}
      ${otherAverage ? `<p class="reference-compare">같은 학년 ${other} 개정 교과서 ${otherBooks.length}종 평균 ${otherAverage}쪽</p>` : ""}
    </section>`;
}

function renderSportsCultureAnalysis(data, revisionId) {
  const documents = data.sportsCultureDocuments || [];
  const sports = revisionId === "2009" ? data.highSportsCulture : null;
  let lastLarge = "";
  const unitTable = sports ? `
    <section class="analysis-section">
      <div class="analysis-section-head">
        <h3>${escapeHtml(sports.title)} 단원 구조</h3>
        <button class="secondary-button" type="button" data-reference-export="2009">엑셀로 받기</button>
      </div>
      <div class="analysis-stats">
        ${referenceStat("교과서", `${sports.textbookPages}쪽`, `부록 ${sports.appendixPages}쪽 포함`)}
        ${referenceStat("지도서", `${sports.guidePages}쪽`)}
        ${referenceStat("연간 차시", `${sports.units.reduce((sum, unit) => sum + unit.hours, 0)}차시`, `6단위 예시 · 최소 ${sports.minimumHours}차시`)}
      </div>
      <div class="reference-table-wrap"><table class="reference-table">
        <thead><tr><th>대단원</th><th>소단원</th><th>시작 쪽</th><th>쪽수</th><th>차시</th></tr></thead>
        <tbody>${sports.units.map((unit) => {
          const large = unit.large === lastLarge ? "" : unit.large;
          lastLarge = unit.large;
          return `<tr><td><b>${escapeHtml(large)}</b></td><td>${escapeHtml(unit.title)}</td><td>${unit.startPage}</td><td>${unit.pages}</td><td>${unit.hours}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
      <p class="reference-note">${escapeHtml(sports.note)}</p>
    </section>` : "";
  const publishers = [...new Set(documents.map((item) => item.publisher))];
  const docTable = documents.length ? `
    <section class="analysis-section">
      <h3>교과서·지도서</h3>
      <table class="reference-table compact"><thead><tr><th>출판사</th><th>교과서(PDF 쪽)</th><th>지도서(PDF 쪽)</th></tr></thead>
        <tbody>${publishers.map((publisher) => {
          const find = (kind) => documents.find((item) => item.publisher === publisher && item.kind === kind)?.pdfPages;
          return `<tr><td><b>${escapeHtml(publisher)}</b></td><td>${find("교과서") ?? "—"}</td><td>${find("지도서") ?? "—"}</td></tr>`;
        }).join("")}</tbody></table>
      ${revisionId === "2022" ? `<p class="reference-note">단원별 쪽수·차시 분석은 아직 하지 않았습니다(PDF 쪽수만 표시).</p>` : ""}
    </section>` : `<p class="reference-note">${escapeHtml(data.label)} 고등 스포츠 문화 자료는 전처리 자료에 없습니다.</p>`;
  return unitTable + (sports ? "" : docTable);
}

// 분석 보기 그리기. catalogId는 책 프로젝트(초등 3~4·5~6, 고등 스포츠 문화 …).
function renderAnalysisView(revisionId, catalogId) {
  const data = referenceData(revisionId);
  const item = PROJECT_CATALOG.find((candidate) => candidate.id === catalogId);
  document.querySelector("#stepHeading").textContent = `${data?.label || revisionId} 분석 · ${item?.label || ""}`;
  document.querySelector("#stepNavigation").style.display = "none";
  document.querySelector(".prototype-footer").style.display = "none";
  const workspace = document.querySelector("#workspace");
  const bandInfo = ANALYSIS_BANDS[catalogId];
  let body = "";
  if (!data) body = `<p class="reference-note">이 개정의 분석 자료가 없습니다.</p>`;
  else if (bandInfo) body = renderElementaryCurriculum(data, revisionId, bandInfo) + renderElementaryBooks(data, revisionId, bandInfo);
  else if (catalogId === "high-sports-culture") body = renderSportsCultureAnalysis(data, revisionId);
  else body = `<p class="reference-note">${escapeHtml(item?.label || "이 과목")}은 아직 분석 자료가 없습니다.</p>`;
  workspace.innerHTML = body;
}

function leaveAnalysisView() {
  document.querySelector("#stepNavigation").style.display = "";
  document.querySelector(".prototype-footer").style.display = "";
}

function referenceExportTable(revisionId) {
  const data = referenceData(revisionId);
  if (revisionId === "2009") {
    const sports = data.highSportsCulture;
    return {
      title: `2009 개정 ${sports.title} 단원 구조`, filename: "2009개정_스포츠문화_단원구조",
      columns: ["대단원", "소단원", "시작 쪽", "쪽수", "차시"],
      rows: sports.units.map((unit) => [unit.large, unit.title, unit.startPage, unit.pages, unit.hours]),
      widths: [20, 36, 8, 8, 8],
    };
  }
  const areas = [...new Set(data.books.flatMap((book) => book.units.map((unit) => unit.area)))];
  return {
    title: `${data.label} 초등 체육 출판사별 쪽수·차시`, filename: `${revisionId}개정_초등체육_쪽수차시`,
    columns: ["출판사", "학년", "교과서(쪽)", "지도서(쪽)", ...areas.flatMap((key) => [`${key} 차시`, `${key} 쪽`]), "비고"],
    rows: data.books.map((book) => {
      const byArea = Object.fromEntries(book.units.map((unit) => [unit.area, unit]));
      return [book.publisher, book.grade, book.textbook_pages ?? "", book.guide_pages ?? "", ...areas.flatMap((key) => [byArea[key]?.hours ?? "", byArea[key]?.pages ?? ""]), [book.chasi_note, book.pdf_scope].filter(Boolean).join(" · ")];
    }),
  };
}

document.addEventListener("click", (event) => {
  const button = event.target.closest?.("[data-reference-grade], [data-reference-export]");
  if (!button) return;
  if (button.dataset.referenceGrade) {
    referenceGrade = button.dataset.referenceGrade;
    render();
  } else if (button.dataset.referenceExport) {
    postTableExport(referenceExportTable(button.dataset.referenceExport), "xlsx").catch((error) => showToast(error.message));
  }
});
