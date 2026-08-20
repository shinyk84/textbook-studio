const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const bundlePath = path.join(root, "static", "pptxgen.bundle.js");
const outputPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, "presentations", "스포츠_문화_초고_비교.pptx");

function loadPptxGen() {
  const context = { console, require, Buffer, process, setTimeout, clearTimeout };
  context.global = context;
  context.self = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(bundlePath, "utf8"), context);
  return context.PptxGenJS;
}

const PptxGenJS = loadPptxGen();
const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "AI Textbook Studio";
pptx.company = "YBM";
pptx.subject = "스포츠 문화 초고 생성 — 결과물 비교";
pptx.title = "스포츠 문화 초고 비교";
pptx.lang = "ko-KR";
pptx.theme = { headFontFace: "Malgun Gothic", bodyFontFace: "Malgun Gothic", lang: "ko-KR" };

const C = {
  ink: "1F2A24",
  inkSoft: "4C5850",
  paper: "F2F3EC",
  raised: "FBFBF7",
  line: "D7DBCD",
  accent: "2B6E63",
  accentDark: "1E4E46",
  warn: "A8631F",
  warnSoft: "F3E6D3",
  old: "8A8F83",
  white: "FFFFFF",
};

const S = pptx.ShapeType;
const FONT = "Malgun Gothic";
const MONO = "Consolas";

function addText(slide, text, x, y, w, h, options = {}) {
  slide.addText(text, {
    x, y, w, h,
    fontFace: FONT,
    fontSize: options.fontSize || 14,
    color: options.color || C.ink,
    bold: options.bold || false,
    align: options.align || "left",
    valign: options.valign || "top",
    margin: options.margin === undefined ? 0 : options.margin,
    breakLine: false,
    ...options,
  });
}

function addRect(slide, x, y, w, h, fill, radius = 0, line = fill) {
  slide.addShape(radius ? S.roundRect : S.rect, {
    x, y, w, h,
    rectRadius: radius,
    fill: { color: fill },
    line: { color: line, width: 1 },
  });
}

function slideMark(slide, label) {
  addText(slide, label, 11.6, 0.42, 1.2, 0.3, {
    fontFace: MONO, fontSize: 13, color: C.accent, align: "right",
  });
}

function heading(slide, text) {
  addText(slide, text, 0.75, 0.62, 10.5, 0.6, { fontSize: 28, bold: true, color: C.ink });
  slide.addShape(S.line, { x: 0.75, y: 1.32, w: 11.85, h: 0, line: { color: C.line, width: 1 } });
}

function note(slide, text) {
  if (typeof slide.addNotes === "function") slide.addNotes(text);
}

function newSlide() {
  const slide = pptx.addSlide();
  slide.background = { color: C.paper };
  return slide;
}

// 0. Title
{
  const slide = newSlide();
  addText(slide, "프로토타입 v0.1", 0.9, 0.85, 4, 0.3, {
    fontSize: 12, bold: true, color: C.accent, charSpacing: 2,
  });
  addText(slide, "스포츠 문화 초고 생성,\n무엇이 달라졌나", 0.9, 1.35, 10.5, 1.9, {
    fontSize: 42, bold: true, color: C.ink, breakLine: true,
  });
  addText(
    slide,
    "기존 단계 중 불필요한 부분을 줄여 5단계로 다시 짰고, 그 과정에서 4개 출판사의 교과서·지도서 자료를\n더 폭넓게 살펴 실제 교과서가 쓰는 집필 방식을 초고 생성에 반영했다.",
    0.9, 3.4, 9.8, 0.9,
    { fontSize: 15, color: C.inkSoft, breakLine: true },
  );
  addText(slide, "기존 9단계 → 5단계로 재구성 · 2026. 8. 20", 0.9, 6.75, 8, 0.3, {
    fontSize: 11, color: C.inkSoft,
  });
  note(slide, "표지: 스포츠 문화 초고 생성 프로토타입 결과 비교 발표.");
}

// 1. Result comparison table
{
  const slide = newSlide();
  slideMark(slide, "01 / 05");
  heading(slide, "결과물 비교");

  const x = [0.75, 3.3, 7.3, 7.75];
  const w = [2.4, 3.75, 0.4, 4.7];
  ["구분", "이전", "", "지금"].forEach((h, i) => {
    if (!h) return;
    addText(slide, h, x[i], 1.55, w[i], 0.3, {
      fontSize: 11, bold: true, color: C.inkSoft, charSpacing: 1,
    });
  });
  slide.addShape(S.line, { x: 0.75, y: 1.92, w: 11.85, h: 0, line: { color: C.line, width: 0.75 } });

  const rows = [
    ["문장", "같은 조건이면 항상 같은 문장", "매번 새로 집필돼 문장이 달라짐"],
    ["절 구성", "소단원과 무관하게 같은 제목 4개 반복", '소단원마다 다른 제목 — 예: "도구가 만들어 낸 경기의 언어"'],
    ["단원 마무리", "본문과 똑같은 설명글", '복습·체크리스트·활동 중심 — 예: "나의 배움 점검표"'],
    ["실기형", "이론형과 내용 구분이 거의 없음", "역할 수행·참여 활동 중심으로 차별화"],
    ["삽화", "내용과 무관한 고정 틀", "내용에 맞는 이미지를 직접 생성(선택 사항)"],
  ];
  const rowH = 0.98;
  rows.forEach((row, i) => {
    const y = 2.05 + i * rowH;
    addText(slide, row[0], x[0], y, w[0], rowH - 0.1, { fontSize: 13.5, bold: true, valign: "mid" });
    addText(slide, row[1], x[1], y, w[1], rowH - 0.1, { fontSize: 12.5, color: C.old, valign: "mid" });
    addText(slide, "→", x[2], y, w[2], rowH - 0.1, { fontSize: 15, bold: true, color: C.accent, align: "center", valign: "mid" });
    addText(slide, row[3], x[3], y, w[3], rowH - 0.1, { fontSize: 13, valign: "mid" });
    if (i < rows.length - 1) {
      slide.addShape(S.line, { x: 0.75, y: y + rowH - 0.05, w: 11.85, h: 0, line: { color: C.line, width: 0.5 } });
    }
  });
  note(slide, "실제 생성 예시를 인용한 결과물 비교표.");
}

// 2. Top-5 errors
{
  const slide = newSlide();
  slideMark(slide, "02 / 05");
  heading(slide, "개발 중 발견한 주요 오류");

  const items = [
    "전체 스타일 3종 중 2종이 실제로는 같은 결과로 나옴",
    "절 제목이 내용과 무관하게 항상 같은 틀로 고정됨",
    '"실기형"을 골라도 "이론형"과 똑같이 생성됨',
    "절 개수가 늘어나면서 일부 절 내용이 화면에서 빠짐",
    "생성한 삽화가 다른 컴퓨터에서는 보이지 않음",
  ];
  const rowH = 0.78;
  items.forEach((text, i) => {
    const y = 1.65 + i * rowH;
    slide.addShape(S.ellipse, {
      x: 0.78, y: y + 0.06, w: 0.42, h: 0.42,
      fill: { color: C.accent }, line: { color: C.accent },
    });
    addText(slide, String(i + 1), 0.78, y + 0.06, 0.42, 0.42, {
      fontFace: MONO, fontSize: 15, color: C.raised, align: "center", valign: "mid",
    });
    addText(slide, text, 1.4, y, 10.9, rowH - 0.08, { fontSize: 16, valign: "mid" });
    if (i < items.length - 1) {
      slide.addShape(S.line, { x: 0.78, y: y + rowH - 0.06, w: 11.8, h: 0, line: { color: C.line, width: 0.5 } });
    }
  });
  addText(
    slide,
    "자료가 최종 원고까지 전달되는 여러 단계에서 값이 누락·왜곡되던 지점들 — 모두 확인 후 수정 완료.",
    0.78, 6.35, 11.6, 0.4,
    { fontSize: 12, color: C.inkSoft },
  );
  note(slide, "자료 → 원고 전달 과정에서 발견된 상위 5개 오류.");
}

// 3. Remaining tasks
{
  const slide = newSlide();
  slideMark(slide, "03 / 05");
  heading(slide, "아직 남은 과제");

  const items = [
    ["종목·스타일·유형 전체 조합은 다 확인하지 못함", "(대표 사례 위주로 검토)"],
    ["모의심사(5단계) 미실행", "— AI 초고 자체를 심사하는 기능이 아니라, 편집자가 수정을 마친 최종본을 올려 심사받는 용도. 이 흐름은 아직 검증 전"],
    ["휴대폰 화면에서 일부가 잘려 보이는 문제", "— 수정 중"],
    ["PPT로 내보내면 화면 배치와 100% 같지는 않음", ""],
  ];
  const rowH = 1.15;
  items.forEach(([bold, rest], i) => {
    const y = 1.65 + i * rowH;
    slide.addShape(S.line, { x: 0.78, y: y + 0.12, w: 0.3, h: 0, line: { color: C.accent, width: 2 } });
    addText(slide, [{ text: bold + " ", options: { bold: true } }, { text: rest }], 1.2, y, 11.1, rowH - 0.15, {
      fontSize: 15.5, valign: "top",
    });
    if (i < items.length - 1) {
      slide.addShape(S.line, { x: 0.78, y: y + rowH - 0.1, w: 11.8, h: 0, line: { color: C.line, width: 0.5 } });
    }
  });
  note(slide, "다음 라운드에서 이어서 검증·수정할 항목들.");
}

// 4. Cost
{
  const slide = newSlide();
  slideMark(slide, "04 / 05");
  heading(slide, "180쪽 전체 1회 생성 비용");

  addText(slide, "$20–30", 0.78, 1.7, 4, 1.1, { fontFace: MONO, fontSize: 56, bold: true, color: C.accent });
  addText(slide, "내외 · 근사치", 0.85, 2.85, 4, 0.35, { fontSize: 13, color: C.inkSoft });

  addText(
    slide,
    "펼침면 90개 기준 — 텍스트 90회 생성 + 삽화 평균 3장(총 약 270장).\n실제 시세: 이미지 장당 3~8센트, 텍스트는 백만 토큰당 입력 $5 · 출력 $30(최상위 등급 기준).",
    0.78, 3.4, 11.5, 0.75,
    { fontSize: 13.5, color: C.inkSoft, breakLine: true },
  );

  addRect(slide, 0.78, 4.35, 11.5, 0.85, C.warnSoft, 0.08, C.warnSoft);
  slide.addShape(S.rect, { x: 0.78, y: 4.35, w: 0.06, h: 0.85, fill: { color: C.warn }, line: { color: C.warn } });
  addText(slide, [
    { text: "결과가 만족스러울 때까지 ", options: { bold: true, color: C.warn } },
    { text: "보통 여러 번 다시 만들게 됨 — 2~3회 재생성 시 비용도 2~3배 이상.", options: { color: C.ink } },
  ], 1.05, 4.5, 11.0, 0.55, { fontSize: 14, valign: "mid" });

  addText(
    slide,
    "3자 집계 기준 · 발표 전 실제 청구 내역 재확인 권장 (WaveSpeed / Unifically / Finout 블로그 집계)",
    0.78, 5.45, 11.5, 0.32,
    { fontSize: 10, color: C.inkSoft },
  );
  note(slide, "180쪽 전체를 이미지 포함해 1회 생성할 때의 근사 비용. 재생성 시 배수로 늘어남을 강조.");
}

// 5. Time + closing
{
  const slide = newSlide();
  slideMark(slide, "05 / 05");
  heading(slide, "개발에 걸린 시간");

  addText(slide, "16–22", 0.78, 1.55, 3.6, 1.1, { fontFace: MONO, fontSize: 56, bold: true, color: C.accent });
  addText(slide, "시간 — 실제 순수 작업 시간 추정", 4.3, 1.95, 4.5, 0.5, { fontSize: 13.5, color: C.inkSoft, valign: "mid" });

  const stats = [["10일", "전체 기간(8/10~8/20)"], ["5일", "실제 작업일"], ["21건", "관련 커밋"]];
  stats.forEach(([num, label], i) => {
    const x = 0.78 + i * 3.0;
    addText(slide, num, x, 2.85, 2.6, 0.5, { fontFace: MONO, fontSize: 22, bold: true, color: C.ink });
    addText(slide, label, x, 3.35, 2.6, 0.3, { fontSize: 11, color: C.inkSoft });
  });

  addText(
    slide,
    "최초 프로토타입(8/10) → 5단계 배포(8/12) 약 2일, 이후 지금 형태로 다듬는 데 약 10일.\n순수 작업량은 약 2~3일치 근무시간.",
    0.78, 3.95, 11.5, 0.7,
    { fontSize: 12.5, color: C.inkSoft, breakLine: true },
  );

  slide.addShape(S.line, { x: 0.78, y: 5.1, w: 11.5, h: 0, line: { color: C.ink, width: 1.5 } });
  addText(
    slide,
    '"고정된 결과물에서, 근거에 기반해 매번 새로 만들어지는 결과물로."',
    0.78, 5.3, 11.5, 0.9,
    { fontSize: 22, italic: false, color: C.ink },
  );
  note(slide, "마무리 슬라이드 — 개발 기간·작업량과 핵심 메시지.");
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
pptx.writeFile({ fileName: outputPath, compression: true })
  .then(() => console.log(outputPath))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
