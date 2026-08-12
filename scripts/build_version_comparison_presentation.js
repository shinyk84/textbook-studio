const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const bundlePath = path.join(root, "static", "pptxgen.bundle.js");
const outputPath = process.argv[2]
  ? path.resolve(root, process.argv[2])
  : path.join(root, "presentations", "기존버전_vs_프로토타입_단계비교.pptx");

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
pptx.subject = "기존 운영 버전과 프로토타입의 단계 및 기능 비교";
pptx.title = "기존 버전 vs 프로토타입";
pptx.lang = "ko-KR";
pptx.theme = {
  headFontFace: "Malgun Gothic",
  bodyFontFace: "Malgun Gothic",
  lang: "ko-KR",
};

const C = {
  ink: "183029",
  green: "1F5D46",
  green2: "2F8060",
  mint: "E8F3ED",
  mint2: "D4E9DE",
  cream: "F7F4EC",
  white: "FFFFFF",
  line: "C8D8D0",
  gray: "65736D",
  light: "F2F5F3",
  coral: "E8775D",
  coralLight: "FBE8E2",
  gold: "D6A63C",
  goldLight: "FAF1D9",
  navy: "38556A",
  navyLight: "E7EEF3",
};

const S = pptx.ShapeType;
const FONT = "Malgun Gothic";

function addText(slide, text, x, y, w, h, options = {}) {
  slide.addText(text, {
    x, y, w, h,
    fontFace: FONT,
    fontSize: options.fontSize || 16,
    color: options.color || C.ink,
    bold: options.bold || false,
    align: options.align || "left",
    valign: options.valign || "mid",
    margin: options.margin === undefined ? 0 : options.margin,
    breakLine: false,
    fit: "shrink",
    ...options,
  });
}

function addRect(slide, x, y, w, h, fill, radius = 0.12, line = fill) {
  slide.addShape(radius ? S.roundRect : S.rect, {
    x, y, w, h,
    rectRadius: radius,
    fill: { color: fill },
    line: { color: line, width: 1 },
  });
}

function pill(slide, text, x, y, w, fill, color = C.white) {
  addRect(slide, x, y, w, 0.34, fill, 0.16, fill);
  addText(slide, text, x, y + 0.01, w, 0.3, { fontSize: 10.5, bold: true, color, align: "center" });
}

function header(slide, number, title, subtitle = "") {
  addText(slide, String(number).padStart(2, "0"), 0.55, 0.36, 0.52, 0.28, { fontSize: 11, bold: true, color: C.green2 });
  addText(slide, title, 1.08, 0.26, 11.65, 0.55, { fontSize: 25, bold: true });
  if (subtitle) addText(slide, subtitle, 1.1, 0.83, 11.4, 0.34, { fontSize: 11.5, color: C.gray });
  slide.addShape(S.line, { x: 0.55, y: 1.24, w: 12.2, h: 0, line: { color: C.line, width: 1.2 } });
}

function footer(slide, page) {
  addText(slide, "AI TEXTBOOK STUDIO · VERSION COMPARISON", 0.55, 7.16, 4.2, 0.18, { fontSize: 8.5, color: "87938E" });
  addText(slide, String(page).padStart(2, "0"), 12.25, 7.13, 0.52, 0.2, { fontSize: 8.5, color: "87938E", align: "right" });
}

function bulletList(slide, items, x, y, w, options = {}) {
  const gap = options.gap || 0.52;
  items.forEach((item, index) => {
    slide.addShape(S.ellipse, {
      x, y: y + index * gap + 0.15, w: 0.09, h: 0.09,
      fill: { color: options.dot || C.green2 }, line: { color: options.dot || C.green2 },
    });
    addText(slide, item, x + 0.2, y + index * gap, w - 0.2, gap - 0.02, {
      fontSize: options.fontSize || 13.5,
      color: options.color || C.ink,
      valign: "mid",
    });
  });
}

function metricCard(slide, x, y, w, number, label, note, fill, numberColor) {
  addRect(slide, x, y, w, 1.72, fill, 0.16, fill);
  addText(slide, number, x + 0.24, y + 0.18, w - 0.48, 0.62, { fontSize: 30, bold: true, color: numberColor });
  addText(slide, label, x + 0.24, y + 0.84, w - 0.48, 0.35, { fontSize: 14, bold: true });
  addText(slide, note, x + 0.24, y + 1.22, w - 0.48, 0.29, { fontSize: 10.5, color: C.gray });
}

function stageBox(slide, x, y, w, h, num, title, fill, color = C.ink) {
  addRect(slide, x, y, w, h, fill, 0.11, fill);
  addText(slide, num, x + 0.12, y + 0.12, 0.32, 0.24, { fontSize: 9.5, bold: true, color });
  addText(slide, title, x + 0.12, y + 0.39, w - 0.24, h - 0.48, { fontSize: 11.5, bold: true, color, valign: "top" });
}

function note(slide, text) {
  if (typeof slide.addNotes === "function") slide.addNotes(text);
}

// 1. Cover
{
  const slide = pptx.addSlide();
  slide.background = { color: C.cream };
  addRect(slide, 0, 0, 4.6, 7.5, C.green, 0, C.green);
  addText(slide, "AI TEXTBOOK\nSTUDIO", 0.68, 0.66, 3.25, 0.9, { fontSize: 15, bold: true, color: C.white, valign: "top" });
  addText(slide, "기존 9단계", 0.68, 4.28, 2.8, 0.44, { fontSize: 16, color: C.mint2 });
  slide.addShape(S.line, { x: 0.7, y: 4.88, w: 2.6, h: 0, line: { color: C.coral, width: 4, beginArrowType: "none", endArrowType: "triangle" } });
  addText(slide, "프로토타입 5단계", 0.68, 5.08, 3.25, 0.5, { fontSize: 19, bold: true, color: C.white });
  addText(slide, "단계를 줄이고, 판단 근거와 비교 과정을 강화", 0.68, 6.13, 3.25, 0.64, { fontSize: 11.5, color: C.mint2, valign: "top" });
  pill(slide, "VERSION COMPARISON", 5.25, 1.03, 1.86, C.coral);
  addText(slide, "기존 버전과\n프로토타입은\n무엇이 달라졌나", 5.25, 1.62, 7.05, 2.25, { fontSize: 35, bold: true, valign: "top", breakLine: true });
  addText(slide, "단계 구조 · 공식 근거 · 3개 초안 비교 · 협업 권한", 5.28, 4.22, 6.7, 0.46, { fontSize: 16, color: C.green2 });
  addText(slide, "2026. 08. 12", 5.28, 6.55, 2.2, 0.28, { fontSize: 10.5, color: C.gray });
  note(slide, "이번 발표는 기존 운영 버전의 장점을 버리는 것이 아니라, 초기 기획 단계의 판단 비용을 줄이는 프로토타입 구조가 무엇이 다른지 설명합니다.");
}

// 2. One-page summary
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  header(slide, 2, "한눈에 보는 변화", "화면 수를 줄인 것이 아니라 의사결정 순서를 다시 설계했습니다.");
  metricCard(slide, 0.72, 1.65, 3.72, "9 → 5", "단계 통합", "분석·배분·목차 설계를 묶어 중복 이동 축소", C.mint, C.green);
  metricCard(slide, 4.8, 1.65, 3.72, "앞 → 뒤", "개발 방향 결정 시점", "단원·소단원 구조를 정한 뒤 3개 체제안 비교", C.coralLight, C.coral);
  metricCard(slide, 8.88, 1.65, 3.72, "전체 → 선택", "초안 생성 범위", "선택한 소단원만 3안 생성해 API 비용 통제", C.goldLight, "A47718");
  addRect(slide, 0.72, 3.75, 11.88, 2.58, C.light, 0.16, C.light);
  addText(slide, "프로토타입의 핵심 원칙", 1.02, 4.02, 2.25, 0.35, { fontSize: 15, bold: true, color: C.green });
  bulletList(slide, [
    "공식 전처리 데이터가 먼저 들어오고, 사용자가 원문·원본 쪽수를 확인",
    "동일한 목차와 성취기준을 고정한 채 심사통과형·학교실행형·창의형을 비교",
    "팀장 승인 전에는 수정 가능, 승인 후에는 잠금되는 협업 흐름을 시뮬레이션",
  ], 1.02, 4.5, 10.95, { gap: 0.55, fontSize: 13.5 });
  footer(slide, 2);
  note(slide, "프로토타입은 9개 화면을 단순히 5개로 축약한 것이 아닙니다. 언제 무엇을 결정해야 하는지를 사용자의 실제 교과서 개발 순서에 맞췄습니다.");
}

// 3. Flow comparison
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  header(slide, 3, "단계 구조 비교", "기존의 분절된 설계를 프로토타입에서는 두 개의 핵심 설계 단계로 통합했습니다.");
  pill(slide, "기존 운영 버전", 0.68, 1.56, 1.5, C.navy);
  const old = [
    ["1", "프로젝트\n설정"], ["2", "교육과정\n분석"], ["3", "개발 방향"],
    ["4", "성취기준·\n차시 배분"], ["5", "내용·종목\n선정"], ["6", "목차·쪽수·\n차시 설계"],
    ["7", "단원 설계"], ["8", "원고 초안"], ["9", "자동검증·\n모의심사"],
  ];
  old.forEach(([num, title], i) => stageBox(slide, 0.68 + i * 1.36, 2.03, 1.16, 1.08, num, title, i === 2 ? C.coralLight : C.navyLight, i === 2 ? C.coral : C.navy));

  slide.addShape(S.chevron, { x: 6.08, y: 3.38, w: 1.15, h: 0.55, fill: { color: C.green2 }, line: { color: C.green2 } });
  addText(slide, "통합·이동", 6.0, 3.94, 1.32, 0.28, { fontSize: 10.5, bold: true, color: C.green2, align: "center" });

  pill(slide, "프로토타입", 0.68, 4.42, 1.24, C.green);
  const proto = [
    ["1", "프로젝트 설정", 1.55],
    ["2", "교육과정 확인", 2.05],
    ["3", "단원·차시 배분", 2.5],
    ["4", "체제안 선택", 2.08],
    ["5", "모의심사", 1.85],
  ];
  let px = 0.68;
  proto.forEach(([num, title, w], i) => {
    stageBox(slide, px, 4.9, w, 1.18, num, title, i === 3 ? C.coralLight : C.mint, i === 3 ? C.coral : C.green);
    px += w + 0.22;
  });
  addRect(slide, 11.2, 4.9, 1.42, 1.18, C.goldLight, 0.11, C.goldLight);
  addText(slide, "기준", 11.34, 5.02, 0.4, 0.22, { fontSize: 9.5, bold: true, color: "8A6819" });
  addText(slide, "검정·인정\n자동 구분", 11.34, 5.31, 1.13, 0.53, { fontSize: 11.5, bold: true, color: "8A6819", valign: "top" });
  addText(slide, "가장 큰 변화", 0.72, 6.43, 1.15, 0.28, { fontSize: 11, bold: true, color: C.coral });
  addText(slide, "개발 방향(기존 3단계)을 단원·목차가 정해진 뒤로 이동해 실제 초안 차이를 비교할 수 있게 함", 1.86, 6.37, 10.45, 0.42, { fontSize: 13, bold: true });
  footer(slide, 3);
  note(slide, "기존 3단계의 개발 방향은 비교할 단원 구조가 정해지기 전에 등장했습니다. 프로토타입에서는 단원과 차시를 먼저 확정하고 4단계에서 체제안을 비교합니다.");
}

// 4. Mapping table
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  header(slide, 4, "기존 단계가 어디로 이동했나", "유지·통합·이동·후속 연결을 기준으로 매핑했습니다.");
  const x = [0.7, 3.7, 6.75, 9.35];
  const w = [2.78, 2.82, 2.38, 3.28];
  const heads = ["기존 단계", "프로토타입", "처리 방식", "달라진 판단 기준"];
  heads.forEach((h, i) => {
    addRect(slide, x[i], 1.52, w[i], 0.54, C.green, 0, C.green);
    addText(slide, h, x[i] + 0.14, 1.62, w[i] - 0.28, 0.3, { fontSize: 11.5, bold: true, color: C.white });
  });
  const rows = [
    ["1 프로젝트 설정", "1 프로젝트 설정", "유지 + 확장", "책 프로젝트·분권 구조·공식 근거 자동 연결"],
    ["2 교육과정 분석", "2 교육과정 확인", "재정의", "분석 작업보다 성취기준·해설·예시 확인에 집중"],
    ["4·5·6·7", "3 단원·차시 배분", "통합", "대·중·소단원, 차시, 쪽수를 같은 맥락에서 조정"],
    ["3 개발 방향", "4 체제안 선택", "뒤로 이동", "정해진 소단원을 대상으로 3개 초안 비교"],
    ["8 원고 초안", "4 체제안 선택", "범위 축소", "전체가 아닌 선택 소단원만 3안으로 생성·비교"],
    ["9 자동검증·모의심사", "5 모의심사", "유지 + 분기", "초등 검정 22개·고등 인정 20개를 자동 구분"],
  ];
  rows.forEach((row, r) => {
    const yy = 2.06 + r * 0.73;
    const fill = r % 2 === 0 ? C.light : C.white;
    row.forEach((cell, i) => {
      addRect(slide, x[i], yy, w[i], 0.73, fill, 0, C.line);
      addText(slide, cell, x[i] + 0.14, yy + 0.08, w[i] - 0.28, 0.56, {
        fontSize: i === 3 ? 10.8 : 11.3,
        bold: i === 2,
        color: i === 2 && row[2] === "뒤로 이동" ? C.coral : C.ink,
        valign: "mid",
      });
    });
  });
  footer(slide, 4);
  note(slide, "이 표는 기존 기능이 삭제되었는지, 통합되었는지, 순서가 이동했는지를 설명하기 위한 핵심 슬라이드입니다.");
}

// 5. Step 1 comparison
{
  const slide = pptx.addSlide();
  slide.background = { color: C.cream };
  header(slide, 5, "1단계 비교 · 프로젝트 설정", "고정된 예시 입력 화면에서 책 프로젝트와 공식 데이터를 연결하는 시작점으로 바뀌었습니다.");
  addRect(slide, 0.72, 1.56, 5.7, 4.94, C.white, 0.16, C.line);
  pill(slide, "기존", 1.02, 1.87, 0.72, C.navy);
  addText(slide, "개별 프로젝트 입력", 1.02, 2.34, 4.75, 0.38, { fontSize: 18, bold: true });
  bulletList(slide, [
    "프로젝트명·학교급·학년·교과를 직접 입력",
    "초등 중심의 고정 예시값",
    "쪽수·차시 근거 확인이 별도",
    "프로젝트명 변경 시 저장 단위가 불명확",
  ], 1.02, 2.94, 4.75, { gap: 0.65, fontSize: 13.2, dot: C.navy });
  addRect(slide, 6.88, 1.56, 5.73, 4.94, C.white, 0.16, C.green2);
  pill(slide, "프로토타입", 7.18, 1.87, 1.12, C.green);
  addText(slide, "책 프로젝트를 먼저 선택", 7.18, 2.34, 4.78, 0.38, { fontSize: 18, bold: true, color: C.green });
  bulletList(slide, [
    "초·중·고 체육 관련 9개 프로젝트 카탈로그",
    "학년군 연계 + 학년별 분권 / 고등 단권 구조 구분",
    "학교급·과목·쪽수·차시를 전처리 데이터로 자동 입력",
    "원본 PDF 쪽수·인쇄면·추출 원문을 한 번에 확인",
    "자료 미연결 항목은 빈값·경고로 표시하고 편집 허용",
  ], 7.18, 2.94, 4.78, { gap: 0.55, fontSize: 12.5 });
  addRect(slide, 0.72, 6.68, 11.89, 0.34, C.mint2, 0.08, C.mint2);
  addText(slide, "결과  |  입력부터 시작 → 공식 근거를 확인하고 수정·승인하는 흐름", 0.96, 6.7, 11.35, 0.29, { fontSize: 12, bold: true, color: C.green });
  footer(slide, 5);
  note(slide, "1단계에서는 전처리 자료가 있는 값과 없는 값을 명확히 구분합니다. 공식자료가 없으면 임의값을 사실처럼 보여주지 않고 경고와 함께 사용자가 입력할 수 있게 했습니다.");
}

// 6. Curriculum + unit design comparison
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  header(slide, 6, "2~3단계 비교 · 교육과정 확인과 단원 배분", "기존의 여러 화면을 ‘근거 확인 → 구조 편집’ 두 흐름으로 정리했습니다.");
  addText(slide, "기존 운영 버전", 0.72, 1.55, 2.15, 0.34, { fontSize: 15, bold: true, color: C.navy });
  const oldFlow = ["교육과정\n분석", "성취기준·\n차시 배분", "내용·종목\n선정", "목차·쪽수·\n차시 설계", "단원 설계"];
  oldFlow.forEach((label, i) => {
    stageBox(slide, 0.72 + i * 1.26, 2.0, 1.08, 1.08, String([2, 4, 5, 6, 7][i]), label, C.navyLight, C.navy);
    if (i < oldFlow.length - 1) slide.addShape(S.chevron, { x: 1.83 + i * 1.26, y: 2.34, w: 0.13, h: 0.34, fill: { color: C.line }, line: { color: C.line } });
  });
  addText(slide, "정보가 단계별로 분리되어 차시·쪽수 조정 시 왕복이 많음", 0.72, 3.27, 6.22, 0.37, { fontSize: 11.8, color: C.gray });

  addText(slide, "프로토타입", 7.12, 1.55, 1.55, 0.34, { fontSize: 15, bold: true, color: C.green });
  stageBox(slide, 7.12, 2.0, 2.15, 1.08, "2", "교육과정 확인", C.mint, C.green);
  slide.addShape(S.chevron, { x: 9.48, y: 2.27, w: 0.48, h: 0.52, fill: { color: C.green2 }, line: { color: C.green2 } });
  stageBox(slide, 10.16, 2.0, 2.45, 1.08, "3", "단원·차시 배분", C.mint2, C.green);
  addText(slide, "성취기준·해설·내용 요소·신체활동 예시를 확인한 뒤 같은 카드 구조에서 편집", 7.12, 3.27, 5.49, 0.5, { fontSize: 11.8, color: C.gray, valign: "top" });

  addRect(slide, 0.72, 4.12, 11.89, 2.42, C.light, 0.16, C.light);
  addText(slide, "프로토타입에서 추가된 편집 방식", 1.02, 4.42, 2.65, 0.35, { fontSize: 15, bold: true, color: C.green });
  const features = [
    ["카드 편집", "대·중·소단원과 차시·쪽수를 한 화면에서 조정"],
    ["이동·복사", "집필 회의 중 구조를 빠르게 재배치"],
    ["배열표 미리보기", "쪽수 합계와 페이지 배치를 즉시 확인"],
    ["CSV 내보내기", "회의·검토용 데이터를 별도 활용"],
  ];
  features.forEach(([title, desc], i) => {
    const xx = 1.02 + i * 2.86;
    pill(slide, title, xx, 4.95, 1.05, i === 2 ? C.coral : C.green2);
    addText(slide, desc, xx, 5.42, 2.48, 0.72, { fontSize: 11.2, bold: true, valign: "top" });
  });
  footer(slide, 6);
  note(slide, "프로토타입의 2단계는 교육과정 전체를 확인하는 곳이고, 3단계는 실제 단원 구조와 차시를 함께 편집하는 곳입니다. 기존 5개 단계의 왕복을 줄였습니다.");
}

// 7. Draft comparison
{
  const slide = pptx.addSlide();
  slide.background = { color: C.cream };
  header(slide, 7, "4단계 비교 · 체제안과 원고 초안", "같은 목차·성취기준 안에서 구성 요소와 활동만 다르게 생성해 비교합니다.");
  addRect(slide, 0.7, 1.55, 3.05, 4.98, C.white, 0.16, C.line);
  pill(slide, "기존", 1.0, 1.87, 0.72, C.navy);
  addText(slide, "방향을 먼저 선택", 1.0, 2.34, 2.3, 0.36, { fontSize: 17.5, bold: true });
  bulletList(slide, [
    "단원 구조 확정 전 3개 방향 제시",
    "옵션별 결과 차이를 미리 보기 어려움",
    "활동 2개 형식으로 비슷하게 보임",
    "전체 원고 생성 시 API 사용량 증가 가능",
  ], 1.0, 2.95, 2.38, { gap: 0.66, fontSize: 12.2, dot: C.navy });
  slide.addShape(S.chevron, { x: 3.98, y: 3.56, w: 0.6, h: 0.75, fill: { color: C.coral }, line: { color: C.coral } });

  addRect(slide, 4.82, 1.55, 7.8, 4.98, C.white, 0.16, C.green2);
  pill(slide, "프로토타입", 5.12, 1.87, 1.12, C.green);
  addText(slide, "선택 소단원 하나를 3안으로 동시 비교", 5.12, 2.34, 6.78, 0.36, { fontSize: 18, bold: true, color: C.green });
  const drafts = [
    ["심사통과형", "성취기준·필수 요소를\n명확하게 드러내는 구성", C.navyLight, C.navy],
    ["학교실행형", "수업 시간·준비물·안전을\n현장에 맞춘 구성", C.mint, C.green],
    ["창의형", "재미와 참신한 활동을\n강화한 구성", C.coralLight, C.coral],
  ];
  drafts.forEach(([title, desc, fill, color], i) => {
    const xx = 5.12 + i * 2.35;
    addRect(slide, xx, 3.02, 2.08, 1.68, fill, 0.14, fill);
    addText(slide, title, xx + 0.18, 3.22, 1.72, 0.34, { fontSize: 14.5, bold: true, color, align: "center" });
    addText(slide, desc, xx + 0.18, 3.73, 1.72, 0.66, { fontSize: 10.8, align: "center", valign: "top" });
  });
  slide.addShape(S.line, { x: 5.34, y: 5.15, w: 6.45, h: 0, line: { color: C.line, width: 2, beginArrowType: "none", endArrowType: "triangle" } });
  addText(slide, "한 안 승인", 7.2, 5.27, 1.3, 0.31, { fontSize: 11.2, bold: true, color: C.coral, align: "center" });
  addText(slide, "선택안을 확정하고 생성 이력은 PPT로 내려받아 검토", 6.05, 5.68, 5.28, 0.38, { fontSize: 13, bold: true, align: "center" });
  addRect(slide, 0.7, 6.69, 11.92, 0.32, C.goldLight, 0.08, C.goldLight);
  addText(slide, "비용 원칙  |  전체 책이 아니라 사용자가 지정한 소단원만 생성", 0.95, 6.7, 11.35, 0.28, { fontSize: 11.8, bold: true, color: "8A6819" });
  footer(slide, 7);
  note(slide, "3안은 목차와 성취기준을 바꾸는 것이 아닙니다. 같은 소단원에서 페이지 구성과 활동 내용의 강조점을 달리해 비교합니다. 현재는 더미 생성이며 실제 API는 연결하지 않았습니다.");
}

// 8. Scope/technology matrix
{
  const slide = pptx.addSlide();
  slide.background = { color: C.white };
  header(slide, 8, "5단계 비교 · 프로젝트별 모의심사", "운영 기능을 건드리지 않고 선택 교과의 공식 심사기준 적용 흐름을 검증합니다.");
  const x = [0.72, 4.15, 7.1, 10.05];
  const w = [3.2, 2.72, 2.72, 2.58];
  ["구분", "기존 운영 버전", "현재 프로토타입", "판단"].forEach((h, i) => {
    addRect(slide, x[i], 1.53, w[i], 0.55, C.green, 0, C.green);
    addText(slide, h, x[i] + 0.14, 1.65, w[i] - 0.28, 0.27, { fontSize: 11.5, bold: true, color: C.white });
  });
  const rows = [
    ["실행 구조", "서버·DB 기반", "정적 HTML/CSS/JS", "독립 검증"],
    ["저장", "DB·협업 데이터", "브라우저 localStorage", "로컬 전용"],
    ["로그인·권한", "로그인/역할 연계", "역할·승인 흐름 시뮬레이션", "UX 검증"],
    ["AI 초안", "OpenAI 연계 가능", "더미 3안 생성", "API 미호출"],
    ["공식자료", "기능별 연결", "전처리값·원문·원본 쪽수 표시", "추적성 강화"],
    ["문서·심사", "초등 검정기준 중심", "초등 검정 22개·고등 인정 20개", "실제 API 채점"],
  ];
  rows.forEach((row, r) => {
    const yy = 2.08 + r * 0.69;
    const fill = r % 2 === 0 ? C.light : C.white;
    row.forEach((cell, i) => {
      addRect(slide, x[i], yy, w[i], 0.69, fill, 0, C.line);
      addText(slide, cell, x[i] + 0.14, yy + 0.07, w[i] - 0.28, 0.54, {
        fontSize: i === 0 ? 11.5 : 10.9,
        bold: i === 0 || i === 3,
        color: i === 3 ? (r < 4 ? C.coral : C.green) : C.ink,
      });
    });
  });
  addRect(slide, 0.72, 6.46, 11.91, 0.48, C.coralLight, 0.1, C.coralLight);
  addText(slide, "주의  |  3안 생성은 시뮬레이션이며, PDF 모의심사는 API 키와 사용 가능한 크레딧이 필요합니다.", 0.98, 6.52, 11.38, 0.33, { fontSize: 12, bold: true, color: C.coral });
  footer(slide, 8);
  note(slide, "현재 프로토타입의 3안 생성은 더미지만 PDF 모의심사는 실제 OpenAI API를 호출합니다. 스포츠 문화 등 고등 체육 인정도서는 20개 인정기준을 적용합니다.");
}

// 9. Closing
{
  const slide = pptx.addSlide();
  slide.background = { color: C.green };
  pill(slide, "CONCLUSION", 0.72, 0.65, 1.18, C.coral);
  addText(slide, "프로토타입이 바꾼 것은\n‘기능의 수’보다 ‘결정의 순서’입니다.", 0.72, 1.3, 11.5, 1.22, { fontSize: 30, bold: true, color: C.white, valign: "top" });
  const cards = [
    ["01", "근거부터", "프로젝트 선택 시 공식자료와\n원문 위치를 함께 확인"],
    ["02", "구조를 먼저", "단원·차시·쪽수를 정한 뒤\n개발 방향을 비교"],
    ["03", "작게 생성", "선택 소단원만 3안으로 만들어\nAPI 비용과 검토량을 통제"],
    ["04", "승인 후 확장", "검증된 UX만 운영 버전에\n단계적으로 반영"],
  ];
  cards.forEach(([num, title, desc], i) => {
    const xx = 0.72 + i * 3.08;
    addRect(slide, xx, 3.1, 2.72, 2.36, i === 2 ? C.coral : "2A6A52", 0.16, i === 2 ? C.coral : "2A6A52");
    addText(slide, num, xx + 0.22, 3.32, 0.48, 0.3, { fontSize: 10.5, bold: true, color: i === 2 ? C.white : C.mint2 });
    addText(slide, title, xx + 0.22, 3.86, 2.28, 0.4, { fontSize: 18, bold: true, color: C.white });
    addText(slide, desc, xx + 0.22, 4.46, 2.28, 0.7, { fontSize: 11.3, color: C.white, valign: "top" });
  });
  addText(slide, "다음 결정", 0.72, 6.1, 1.1, 0.3, { fontSize: 11.5, bold: true, color: C.mint2 });
  addText(slide, "5단계 흐름을 확정한 뒤 실제 API·권한·모의심사 연결 범위를 정한다.", 1.82, 6.02, 10.55, 0.48, { fontSize: 15, bold: true, color: C.white });
  addText(slide, "AI TEXTBOOK STUDIO", 0.72, 7.08, 2.5, 0.18, { fontSize: 8.5, color: C.mint2 });
  addText(slide, "09", 12.22, 7.05, 0.4, 0.2, { fontSize: 8.5, color: C.mint2, align: "right" });
  note(slide, "결론적으로 프로토타입은 공식 근거 확인, 구조 설계, 3안 비교, 승인 후 편집이라는 순서를 검증합니다. 다음 단계는 이 흐름의 승인 여부를 정하는 것입니다.");
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
pptx.writeFile({ fileName: outputPath, compression: true })
  .then(() => console.log(outputPath))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
