const STORAGE_KEY = "ai-textbook-studio:v0.1";
const PROJECTS_STORAGE_KEY = "ai-textbook-studio:v0.2:projects";
const PROJECTS_STORAGE_VERSION = 1;
const CORRECTION_STORAGE_KEY = "ai-textbook-studio:v0.1:source-corrections";
const curriculumData = window.PROTOTYPE_CURRICULUM_DATA || { standards: [], considerations: [] };
const secondaryCourses = curriculumData.secondary_courses || {};
const pagePolicies = curriculumData.page_policies || {
  elementary_pe: { baseline_pages: 120, minimum_pages: 108, maximum_pages: 132, supplementary_maximum_pages: 10, group_hours: 204, default_book_hours: 102, source_document_id: "체육_2022편찬상의_유의점_및_검정기준", source_page: 19, source_printed_page: 45, supplementary_source_document_id: "검정도서개발가이드라인_평가원_검토용", supplementary_source_page: 5, hours_source_document_id: "초등학교_교육과정", hours_source_page: 25, hours_source_printed_page: 17 },
  sports_culture: { baseline_pages: 180, minimum_pages: 162, maximum_pages: 198, supplementary_maximum_pages: 0, supplementary_status: "unverified", default_credits: 2, minimum_credits: 1, lessons_per_credit: 16, default_hours: 32, minimum_hours: 16, maximum_hours: 32, source_document_id: "인정도서_편찬상의_유의점_및_인정기준", source_location: "스포츠 문화 4. 기타 (8)", hours_source_document_id: "고등학교_교육과정", hours_source_location: "보통 교과 학점 배당과 별표 과목 감축 규정" },
};

const sourceExcerpts = {
  "criteria-page-19": pagePolicies.elementary_pe.excerpt || "교과서 분량은 부록을 포함하여 책별 120쪽이며, 10% 범위 내에서 증감할 수 있다.",
  "guideline-page-4": `ㅇ교과서분량은기준쪽수, 10% 범위내증감, 부속ARE 구성됨.

- (기준쪽수편찬상의유의점에서제시한쪽수로학습활동과직접관련되어

있으며, 본문과부록을포함(붙임딱지, 카드동의준비물꾸러미최소화)

- (중감) 편찬상의유의점기준쪽수기준으로10% 범위내증감가능`,
  "guideline-page-5": `- (부속자료) 교과서의머리말, 책의구성및특징, 차례, 판권, daa 소개©

으로10쪽을넘지않도록구성

※ 부록과부속자료범위및위치는출판사재량

ㅇ전체쪽수VAL 겉표지를제외한모든쪽수: 기준쪽수+ 중감분량+ 부

속자료`,
  "sports-culture-recognition": pagePolicies.sports_culture.excerpt || "교과서 분량은 부록을 포함하여 180쪽이며, 10% 범위 내에서 증감할 수 있다.",
};

const SPORTS_CULTURE_STANDARDS = [
  { code: "[12스문01-01]", domain: "스포츠 인문 문화", statement: "스포츠 인문 문화의 개념 및 특성을 이해하고, 스포츠 대회에 다양한 방식으로 참여한다." },
  { code: "[12스문01-02]", domain: "스포츠 인문 문화", statement: "스포츠의 역사와 철학을 탐구하고, 스포츠의 문화를 비판적으로 분석한다." },
  { code: "[12스문01-03]", domain: "스포츠 인문 문화", statement: "스포츠를 주제로 한 다양한 문학과 예술을 비교·분석하고, 스포츠 인문 문화 분야 진로를 설계한다." },
  { code: "[12스문02-01]", domain: "스포츠 경기 문화", statement: "스포츠 경기 문화의 개념 및 특성을 이해하고, 스포츠 대회에 다양한 역할로 참여한다." },
  { code: "[12스문02-02]", domain: "스포츠 경기 문화", statement: "스포츠 경기 문화의 구성 체계 및 방법에 따라 스포츠 대회를 기획하고 운영하며, 스포츠 경기 문화 분야 진로를 설계한다." },
  { code: "[12스문02-03]", domain: "스포츠 경기 문화", statement: "스포츠 경기 문화의 가치를 이해하고, 스포츠 경기 문화를 다양한 분야와 접목한다." },
];

const SPORTS_CULTURE_SPORT_OPTIONS = [
  "축구", "농구", "야구", "배구", "배드민턴", "탁구",
  "육상", "태권도", "골프", "스키", "보디빌딩", "테니스",
];

// 4개사 전처리 교과서의 "본문 코너 범례" 페이지(미래엔 "디지털 체육"·"스포츠와 융합"·
// "경기 수행 능력쏙쏙", 지학사 "디지털 기술 활용하기"·"Tip! 아름다운 경기 문화"·
// "팀워크 향상 활동" 등)에서 확인한 실제 박스형 구성요소를 근거로 추천한 기본 목록.
const SPORTS_CULTURE_CONCEPT_OPTIONS = [
  "디지털활용 활동", "안전 팁", "진로·직업 정보", "응용·전략 활동",
  "협동·팀워크 활동", "자기 점검", "심화 읽기자료", "인성·매너 팁", "과학·타교과 융합 팁",
];

const SPORTS_CULTURE_CONTENT_TYPES = [
  { id: "theory", label: "이론형", description: "개념·역사·철학·사회 사례를 충분한 설명글로 구성" },
  { id: "practice", label: "실기형", description: "종목의 시설·용구·규칙·동작·전술·안전을 단계별로 구성" },
];

const SPORTS_CULTURE_SUPPORT_MODES = [
  { id: "", label: "기본 구성" },
  { id: "activity", label: "활동 포함", forType: "theory" },
  { id: "concept", label: "개념 설명 포함", forType: "practice" },
];

const SPORTS_CULTURE_SPORT_MODES = [
  { id: "none", label: "종목 없음", description: "개념 자체를 설명하며 특정 종목을 중심에 두지 않음" },
  { id: "examples", label: "여러 종목 사례", description: "복수 종목을 비교·사례·자료로만 사용" },
  { id: "primary", label: "주 종목 중심", description: "한 종목의 시설·규칙·동작·전술을 체계적으로 전개" },
];

const SPORTS_CULTURE_SPECIAL_PAGE_TYPES = [
  { id: "reading", label: "읽을거리" },
  { id: "career", label: "인물·진로" },
  { id: "safety", label: "안전" },
  { id: "critique", label: "문화 비평" },
  { id: "project", label: "프로젝트" },
  { id: "assessment", label: "수행평가" },
];

function inferSportsCultureContentType(smallUnit) {
  const text = `${smallUnit?.middleTitle || ""} ${smallUnit?.smallTitle || ""}`;
  if (/시설|장비|규칙|전략|역할|참여|대회|기획|운영|심판/.test(text)) return "practice";
  return "theory";
}

function inferSportsCultureSportMode(smallUnit) {
  const text = `${smallUnit?.middleTitle || ""} ${smallUnit?.smallTitle || ""}`;
  if (/종목 참여|시설|장비|용구|규칙|전략|참여자의 역할|대회|기획|운영|심판/.test(text)) return "primary";
  if (/역사|철학|윤리|비판|문학|영화|음악|미술|예술|인문·사회|과학|디지털|융합|지속 가능/.test(text)) return "examples";
  return "none";
}

function recommendedSportsForSmallUnit(smallUnit, availableSports, modeOverride = "") {
  const mode = ["none", "examples", "primary"].includes(modeOverride) ? modeOverride : inferSportsCultureSportMode(smallUnit);
  if (mode === "none" || !availableSports.length) return [];
  const text = `${smallUnit?.middleTitle || ""} ${smallUnit?.smallTitle || ""}`;
  const preference = /문학|영화|음악|미술|예술/.test(text)
    ? ["야구", "축구", "농구", "배구"]
    : /역사|철학|윤리|비판/.test(text)
      ? ["축구", "육상", "탁구"]
      : /과학|디지털|융합|지속/.test(text)
        ? ["테니스", "야구", "육상"]
        : ["배구", "배드민턴", "농구", "축구"];
  const ordered = [...preference.filter((sport) => availableSports.includes(sport)), ...availableSports.filter((sport) => !preference.includes(sport))];
  return mode === "primary" ? ordered.slice(0, 1) : ordered.slice(0, 3);
}

function sportsCultureSportModeLabel(mode) {
  return SPORTS_CULTURE_SPORT_MODES.find((item) => item.id === mode)?.label || "종목 없음";
}

const SPORTS_CULTURE_STYLE_CHOICES = [
  { value: 15, id: "balanced", label: "안정·정석형", summary: "개념 설명과 교육과정 근거를 충분히 제시합니다." },
  { value: 50, id: "activity", label: "균형형", summary: "설명, 자료, 활동과 시각 요소를 균형 있게 배치합니다." },
  { value: 85, id: "creative", label: "참신·활동형", summary: "질문, 사례, 학생 활동과 시각 자료의 비중을 높입니다." },
];

function sportsCultureStyleProfile(value) {
  const styleValue = Math.max(0, Math.min(100, Number(value) || 0));
  if (styleValue < 34) return SPORTS_CULTURE_STYLE_CHOICES[0];
  if (styleValue < 67) return SPORTS_CULTURE_STYLE_CHOICES[1];
  return SPORTS_CULTURE_STYLE_CHOICES[2];
}

function sportsCultureStyleMetrics(value) {
  const ratio = Math.max(0, Math.min(100, Number(value) || 0)) / 100;
  return {
    curriculum: 5,
    feasibility: Math.round(5 - ratio * 2),
    engagement: Math.round(3 + ratio * 2),
    novelty: Math.round(2 + ratio * 3),
    safety: 5,
  };
}

const steps = [
  ["프로젝트 설정", "기본 조건 설정"],
  ["교육과정 확인", "성취기준 확인"],
  ["단원·차시 배분", "단원·차시·쪽수 편집"],
  ["현장 의견 분석", "현장 만족도·검토 의견을 쟁점으로 묶고 반영할 쟁점 고르기"],
  ["초안·시안·조판", "현장 의견을 반영한 초안 생성과 조판"],
  ["조판 후 수정안", "고른 쟁점으로 조판한 원고의 수정안 만들기"],
  ["지도서·부속 자료", "확정 교과서로 지도서·활동지·평가지·과정안 생성"],
];

// 단계 번호(0부터). 04 현장 의견 분석을 새로 끼우면서 초안 이후 단계가 하나씩 밀렸다.
const FEEDBACK_STEP_INDEX = 3;
const DRAFT_STEP_INDEX = 4;
const STEP_LAYOUT_VERSION = 2;

const frameworks = [
  {
    id: "balanced",
    name: "균형형",
    summary: "설명, 활동, 정리를 고르게 배치하는 안정적인 교과서 체제",
    strengths: ["교육과정 흐름이 명확함", "기능과 성찰의 균형", "편집 구조가 안정적"],
    pages: "기준 쪽수 유지",
    metrics: { curriculum: 5, feasibility: 4, engagement: 4, novelty: 3, safety: 4 },
  },
  {
    id: "activity",
    name: "활동 강화형",
    summary: "학생이 직접 움직이는 활동과 도전 과제를 크게 보여주는 체제",
    strengths: ["실기 활동 중심", "활동 절차를 시각적으로 강조", "학생 참여도가 높음"],
    pages: "활동 지면 비중 확대",
    metrics: { curriculum: 4, feasibility: 3, engagement: 5, novelty: 4, safety: 3 },
  },
  {
    id: "creative",
    name: "창의형",
    summary: "학생의 창의적 발상과 표현을 중심에 두고 매 차시 새로운 활동을 시도하는 체제",
    strengths: ["창의적 문제해결 활동 중심", "다양한 표현·전략을 자유롭게 시도", "매 차시 새로운 구성 요소 도입"],
    pages: "창의 활동 지면 확대",
    metrics: { curriculum: 3, feasibility: 3, engagement: 4, novelty: 5, safety: 3 },
  },
];

const SPORTS_CULTURE_FRAMEWORKS = [
  {
    id: "balanced",
    name: "탐구·참여 균형형",
    summary: "문화 개념과 자료 탐구를 실제 스포츠 참여·성찰과 균형 있게 연결하는 체제",
    strengths: ["6개 성취기준 추적이 명확함", "직접·간접 참여의 균형", "과정과 결과 평가 연계"],
    pages: "개념→자료→참여→성찰의 순환",
    metrics: { curriculum: 5, feasibility: 4, engagement: 4, novelty: 3, safety: 5 },
  },
  {
    id: "activity",
    name: "대회 프로젝트형",
    summary: "선수·심판·기획·운영·기록·미디어 역할과 학생 주도 대회 운영을 중심에 두는 체제",
    strengths: ["다양한 역할 참여", "대회 기획·운영 산출물", "현장 실행과 협력 강조"],
    pages: "역할 수행·프로젝트 지면 확대",
    metrics: { curriculum: 5, feasibility: 4, engagement: 5, novelty: 4, safety: 5 },
  },
  {
    id: "creative",
    name: "문화 융합형",
    summary: "역사·철학·문학·예술·과학·미디어를 스포츠 참여와 접목해 새 문화를 만드는 체제",
    strengths: ["비평과 창작 강화", "타 분야 융합", "문화·진로 포트폴리오"],
    pages: "비평·창작·융합 지면 확대",
    metrics: { curriculum: 5, feasibility: 3, engagement: 4, novelty: 5, safety: 4 },
  },
];

const FRAMEWORK_METRIC_LABELS = {
  curriculum: "교육과정 충실도",
  feasibility: "실행 용이성",
  engagement: "흥미도",
  novelty: "참신성",
  safety: "안전성",
};

function defaultFrameworkMetrics(options = frameworks) {
  return Object.fromEntries(options.map((framework) => [framework.id, { ...framework.metrics }]));
}

const DOMAIN_ORDER = ["운동", "스포츠", "표현"];
const SPORTS_CULTURE_DOMAIN_ORDER = ["스포츠 인문 문화", "스포츠 경기 문화"];

// 좌측 맨 위 구분은 교육과정 개정 연도다(개정 → 교과 → 책 프로젝트). 지금 책 프로젝트는 모두 2022 개정
// 교육과정 기준이고, 2015·2009 개정은 전처리 교과서·지도서를 근거 검색 참고 자료로만 쓴다. 차기 개정은
// 교육과정 원문을 전처리해 등록하면 이 목록에 프로젝트가 생긴다.
const CURRICULUM_REVISIONS = [
  { id: "next", label: "차기 개정", note: "교육과정 등록 전" },
  { id: "2022", label: "2022 개정" },
  { id: "2015", label: "2015 개정", note: "분석" },
  { id: "2009", label: "2009 개정", note: "분석" },
];

// subjectArea는 개별 과목명(subject)보다 한 단계 위의 큰 교과 분류다 — 지금은 전부 "체육"뿐이지만,
// 나중에 영어·수학·음악 등 타교과가 추가될 때 좌측 "교과" 드롭다운이 이 값으로 목록을 나눈다.
const PROJECT_CATALOG = [
  { id: "elementary-3-4", group: "초등학교", label: "초등 체육 3~4학년군", schoolLevel: "초등학교", revision: "2022", subjectArea: "체육", subject: "체육", band: "3~4학년군", connected: true },
  { id: "elementary-5-6", group: "초등학교", label: "초등 체육 5~6학년군", schoolLevel: "초등학교", revision: "2022", subjectArea: "체육", subject: "체육", band: "5~6학년군", connected: true },
  { id: "middle-pe", group: "중학교", label: "중등체육", schoolLevel: "중학교", revision: "2022", subjectArea: "체육", subject: "중등체육", connected: false, partial: secondaryCourses["중등 체육"]?.status === "partial" },
  { id: "high-pe", group: "고등학교", label: "고등 체육", schoolLevel: "고등학교", revision: "2022", subjectArea: "체육", subject: "체육1·체육2", connected: secondaryCourses["체육1"]?.status === "connected" && secondaryCourses["체육2"]?.status === "connected" },
  { id: "high-exercise-health", group: "고등학교", label: "고등 운동과 건강", schoolLevel: "고등학교", revision: "2022", subjectArea: "체육", subject: "운동과 건강", connected: secondaryCourses["운동과 건강"]?.status === "connected" },
  { id: "high-sports-culture", group: "고등학교", label: "고등 스포츠 문화", schoolLevel: "고등학교", revision: "2022", subjectArea: "체육", subject: "스포츠 문화", connected: true },
  { id: "high-sports-science", group: "고등학교", label: "고등 스포츠 과학", schoolLevel: "고등학교", revision: "2022", subjectArea: "체육", subject: "스포츠 과학", connected: secondaryCourses["스포츠 과학"]?.status === "connected" },
  { id: "high-sports-life-1", group: "고등학교", label: "고등 스포츠 생활1", schoolLevel: "고등학교", revision: "2022", subjectArea: "체육", subject: "스포츠 생활1", connected: secondaryCourses["스포츠 생활1"]?.status === "connected" },
  { id: "high-sports-life-2", group: "고등학교", label: "고등 스포츠 생활2", schoolLevel: "고등학교", revision: "2022", subjectArea: "체육", subject: "스포츠 생활2", connected: secondaryCourses["스포츠 생활2"]?.status === "connected" },
];

const DEFAULT_INTRO_PAGES = 2;
const DEFAULT_WRAP_UP_PAGES = 2;
const DEFAULT_SMALL_UNIT_PAGES = 2;

function unitsForGrade(gradeLabel) {
  const grade = Number.parseInt(gradeLabel, 10) || 3;
  const candidates = (curriculumData.content_candidates || []).filter((candidate) =>
    (candidate.selected_grades || []).includes(grade)
  );
  const units = DOMAIN_ORDER.map((domain) => ({
    domain,
    introPages: DEFAULT_INTRO_PAGES,
    wrapUpPages: DEFAULT_WRAP_UP_PAGES,
    subdomainGroups: candidates
      .filter((candidate) => candidate.domain === domain)
      .map((candidate) => ({
        id: candidate.id,
        subtitle: candidate.subdomain,
        sourcePage: candidate.source_page,
        middleUnits: candidate.activity_groups.map((group) => ({
          title: group.middle_unit_title,
          smallUnits: group.small_units
            .filter((small) => small.selected)
            .map((small) => ({ title: small.draft_title, sourceActivity: small.source_activity, hours: 0, pages: DEFAULT_SMALL_UNIT_PAGES })),
        })),
      })),
  }));
  const smallUnitCount = units.reduce(
    (sum, unit) => sum + unit.subdomainGroups.reduce(
      (s, group) => s + group.middleUnits.reduce((ss, middle) => ss + middle.smallUnits.length, 0),
      0
    ),
    0
  );
  const hourCounts = allocateCounts(102, Array(smallUnitCount).fill(1));
  let cursor = 0;
  units.forEach((unit) => unit.subdomainGroups.forEach((group) => group.middleUnits.forEach((middle) => middle.smallUnits.forEach((small) => {
    small.hours = hourCounts[cursor];
    cursor += 1;
  }))));
  return units;
}

function unitsForSportsCulture() {
  const definitions = [
    {
      domain: "스포츠 인문 문화",
      subtitle: "스포츠를 인문적으로 읽고 참여하기",
      sourcePage: "체육과 교육과정 87~90",
      items: [
        ["스포츠 인문 문화의 이해", "[12스문01-01]", [
          ["스포츠 문화의 의미와 형성", 1, 6],
          ["스포츠 인문 문화의 개념과 특성", 1, 8],
          ["종목 참여로 인문 문화 읽기", 2, 8],
        ]],
        ["스포츠의 역사와 철학", "[12스문01-02]", [
          ["시대와 사회에 따른 스포츠의 변화", 2, 10],
          ["스포츠에 담긴 철학과 윤리", 2, 10],
          ["스포츠 문화 현상 비판하기", 1, 6],
        ]],
        ["스포츠 문학과 예술", "[12스문01-03]", [
          ["문학 속 스포츠 경험과 삶", 2, 8],
          ["영화·음악·미술 속 스포츠 표현", 2, 8],
          ["문학과 예술 비교·창작 및 진로 탐색", 1, 8],
        ]],
      ],
    },
    {
      domain: "스포츠 경기 문화",
      subtitle: "스포츠 대회를 함께 만들고 확장하기",
      sourcePage: "체육과 교육과정 90~92",
      items: [
        ["스포츠 경기 문화의 이해", "[12스문02-01]", [
          ["시설·장비와 스포츠 물질문화", 1, 8],
          ["규칙·제도와 스포츠 제도문화", 2, 10],
          ["가치·전략과 경기 참여자의 역할", 2, 8],
        ]],
        ["스포츠 대회 기획과 운영", "[12스문02-02]", [
          ["우리 반 스포츠 대회 기획하기", 3, 10],
          ["선수·심판·운영·미디어 역할로 참여하기", 4, 14],
          ["대회 운영 결과 평가와 진로 탐색", 2, 8],
        ]],
        ["스포츠 경기 문화의 융합과 확산", "[12스문02-03]", [
          ["스포츠와 인문·사회 분야의 만남", 1, 10],
          ["스포츠와 과학·디지털 미디어의 만남", 1, 8],
          ["지속 가능한 스포츠 문화 창작하기", 2, 12],
        ]],
      ],
    },
  ];
  return definitions.map((definition) => ({
    domain: definition.domain,
    introPages: 4,
    wrapUpPages: 4,
    subdomainGroups: [{
      id: definition.domain,
      subtitle: definition.subtitle,
      sourcePage: definition.sourcePage,
      middleUnits: definition.items.map(([title, standardCode, smallUnits]) => ({
        title,
        smallUnits: smallUnits.map(([smallTitle, hours, pages]) => ({
          title: smallTitle,
          sourceActivity: `${title} · 교육과정과 4개사 공통 구성 패턴`,
          hours,
          pages,
          standardCodes: [standardCode],
        })),
      })),
    }],
  }));
}

function courseMetaFor(targetState = state) {
  const subject = targetState?.project?.subject;
  if (targetState?.project?.schoolLevel === "중학교") return secondaryCourses["중등 체육"] || null;
  return secondaryCourses[subject] || null;
}

function unitsForSecondaryCourse(meta) {
  const domains = [...new Set((meta.standards || []).map((standard) => standard.domain))];
  const standards = meta.standards || [];
  const hourCounts = allocateCounts(meta.default_hours, standards.map(() => 1));
  const fixedPages = domains.length * (DEFAULT_INTRO_PAGES + DEFAULT_WRAP_UP_PAGES) + 4;
  const pageCounts = allocateCounts(Math.max(0, meta.page_policy.baseline_pages - fixedPages), standards.map(() => 1));
  let cursor = 0;
  return domains.map((domain) => ({
    domain,
    introPages: DEFAULT_INTRO_PAGES,
    wrapUpPages: DEFAULT_WRAP_UP_PAGES,
    subdomainGroups: [{
      id: `${meta.catalog_id}-${domain}`,
      subtitle: `${domain} 성취기준`,
      sourcePage: "체육과 교육과정",
      middleUnits: standards.filter((standard) => standard.domain === domain).map((standard) => {
        const index = cursor;
        cursor += 1;
        return {
          title: standard.code,
          smallUnits: [{
            title: standard.statement,
            sourceActivity: standard.statement,
            hours: hourCounts[index],
            pages: pageCounts[index],
          }],
        };
      }),
    }],
  }));
}

function isSportsCultureProject(targetState = state) {
  return targetState.project.schoolLevel === "고등학교" && targetState.project.subject === "스포츠 문화";
}

function frameworkOptions(targetState = state) {
  return isSportsCultureProject(targetState) ? SPORTS_CULTURE_FRAMEWORKS : frameworks;
}

function ensureSportsCultureDraftSettings(book) {
  if (!book || !isSportsCultureProject(book)) return book;
  book.generationProviderId = "external-ai-v1";
  if (!Array.isArray(book.selectedSports)) {
    const previousSports = String(book.carrierSport || "배드민턴").split(/[,·/]/).map((item) => item.trim()).filter(Boolean);
    book.selectedSports = previousSports.filter((sport) => SPORTS_CULTURE_SPORT_OPTIONS.includes(sport));
    book.customSports ||= previousSports.filter((sport) => !SPORTS_CULTURE_SPORT_OPTIONS.includes(sport)).join(", ");
  }
  if (!book.selectedSports.length && !String(book.customSports || "").trim()) book.selectedSports = ["배드민턴"];
  book.carrierSport = selectedSportsFor(book).join(", ");
  if (!Array.isArray(book.selectedConcepts)) book.selectedConcepts = [];
  book.customConcepts ||= "";
  if (!["theory", "practice"].includes(book.draftPrimaryType)) {
    book.draftPrimaryType = ["participation", "project"].includes(book.draftPrimaryType) ? "practice" : "theory";
  }
  book.bookStyleValue = Math.max(0, Math.min(100, Number(book.bookStyleValue ?? 50)));
  book.includeImages = Boolean(book.includeImages);
  if (!Array.isArray(book.selectedDraftSmallUnitKeys)) book.selectedDraftSmallUnitKeys = [];
  if (!Array.isArray(book.specialPages)) book.specialPages = [];
  if (!book.sportsCultureUnitStructureVersion && isLegacySportsCultureDefault(book.units)) {
    book.units = unitsForSportsCulture();
    book.sportsCultureUnitStructureVersion = 2;
    book.pages = buildPagePlan(book);
  }
  const migrateSportUsage = Number(book.sportsCultureSportUsageVersion || 0) < 2;
  book.units?.forEach((unit) => unit.subdomainGroups?.forEach((group) => group.middleUnits?.forEach((middle) => middle.smallUnits?.forEach((small) => {
    if (!Array.isArray(small.standardCodes) || !small.standardCodes.length) {
      small.standardCodes = globalThis.TEXTBOOK_DRAFT_ENGINE?.resolveStandardCodes({
        domain: unit.domain,
        middleTitle: middle.title,
        smallTitle: small.title,
      }) || [];
    }
    const availableSports = selectedSportsFor(book);
    if (migrateSportUsage || !["none", "examples", "primary"].includes(small.sportMode)) {
      small.sportMode = inferSportsCultureSportMode({ middleTitle: middle.title, smallTitle: small.title });
      small.sports = recommendedSportsForSmallUnit({ middleTitle: middle.title, smallTitle: small.title }, availableSports);
      small.sportSettingSource = "recommended";
    } else {
      small.sports = (Array.isArray(small.sports) ? small.sports : []).filter((sport) => availableSports.includes(sport));
      if (small.sportMode === "none") small.sports = [];
      if (small.sportMode === "primary") small.sports = small.sports.slice(0, 1);
      small.sportSettingSource ||= "user";
    }
    if (!["theory", "practice"].includes(small.contentType)) small.contentType = inferSportsCultureContentType({ middleTitle: middle.title, smallTitle: small.title });
    if (!["", "activity", "concept"].includes(small.supportMode)) small.supportMode = "";
  }))));
  book.sportsCultureSportUsageVersion = 2;
  return book;
}

function selectedSportsFor(book = state) {
  const selected = Array.isArray(book?.selectedSports) ? book.selectedSports : [];
  const custom = String(book?.customSports || "").split(/[,·/]/).map((item) => item.trim()).filter(Boolean);
  return [...new Set([...selected, ...custom])];
}

function selectedConceptsFor(book = state) {
  const selected = Array.isArray(book?.selectedConcepts) ? book.selectedConcepts : [];
  const custom = String(book?.customConcepts || "").split(/[,·/]/).map((item) => item.trim()).filter(Boolean);
  return [...new Set([...selected, ...custom])];
}

function isLegacySportsCultureDefault(units) {
  if (!Array.isArray(units) || units.length !== 2) return false;
  const smallUnits = units.flatMap((unit) => unit.subdomainGroups?.flatMap((group) =>
    group.middleUnits?.flatMap((middle) => middle.smallUnits || []) || []) || []);
  const legacyTitles = [
    "문화의 개념과 특성을 경기 참여와 연결하기",
    "스포츠의 역사·철학을 탐구하고 비판하기",
    "문학과 예술을 비교하고 관련 진로 설계하기",
    "경기 문화의 특성을 이해하고 다양한 역할로 참여하기",
    "학생 주도 스포츠 대회를 기획·운영하고 진로 탐색하기",
    "스포츠 경기 문화를 인문·사회·과학 분야와 접목하기",
  ];
  return smallUnits.length === legacyTitles.length
    && smallUnits.every((small, index) => small.title === legacyTitles[index]);
}

function isHighSchoolProject(targetState = state) {
  return targetState.project.schoolLevel === "고등학교" && Boolean(courseMetaFor(targetState));
}

function pagePolicyFor(targetState = state) {
  if (targetState.project.schoolLevel === "초등학교" && targetState.project.subject === "체육") {
    return pagePolicies.elementary_pe;
  }
  if (targetState.project.schoolLevel === "중학교") {
    return {
      verified: false,
      minimum_pages: 0,
      maximum_pages: 999,
      supplementary_maximum_pages: 999,
      group_hours: secondaryCourses["중등 체육"]?.hours || 272,
    };
  }
  if (isHighSchoolProject(targetState)) return courseMetaFor(targetState).page_policy || null;
  return null;
}

function projectDomainOrder(targetState = state) {
  const meta = courseMetaFor(targetState);
  return meta?.standards?.length ? [...new Set(meta.standards.map((standard) => standard.domain))] : DOMAIN_ORDER;
}

function projectTargetHours(targetState = state) {
  return Number(targetState.project.targetHours) || courseMetaFor(targetState)?.default_hours || 102;
}

function secondaryDomainSourceLabel(domain, targetState = state) {
  const standards = (courseMetaFor(targetState)?.standards || []).filter((standard) => standard.domain === domain);
  const pages = standards.flatMap((standard) => [standard.source_page, standard.explanation_source_page]).filter(Boolean);
  if (!pages.length) return "「체육과 교육과정」 원본 쪽수 확인 필요";
  const first = Math.min(...pages);
  const last = Math.max(...pages);
  return `「체육과 교육과정」 PDF ${first}${first === last ? "" : `~${last}`}쪽 · 인쇄면 ${first - 6}${first === last ? "" : `~${last - 6}`}쪽`;
}

function stripManualUnitNumberPrefix(value) {
  return String(value || "").replace(/^\s*\d+(?:\s*-\s*\d+){0,2}\s*[.)]\s*/, "").trim();
}

function normalizeAutomaticUnitNumbering(book = state) {
  if (!book || Number(book.automaticUnitNumberVersion || 0) >= 1) return;
  (book.units || []).forEach((unit) => unit.subdomainGroups?.forEach((group) => {
    group.subtitle = stripManualUnitNumberPrefix(group.subtitle);
    group.middleUnits?.forEach((middle) => {
      middle.title = stripManualUnitNumberPrefix(middle.title);
      middle.smallUnits?.forEach((small) => { small.title = stripManualUnitNumberPrefix(small.title); });
    });
  }));
  book.automaticUnitNumberVersion = 1;
}

function middleUnitPosition(unit, groupIndex, middleIndex) {
  return unit.subdomainGroups
    .slice(0, groupIndex)
    .reduce((sum, group) => sum + group.middleUnits.length, 0) + middleIndex + 1;
}

function unitNumberLabel(unitIndex, middleIndex = null, smallIndex = null) {
  return [unitIndex + 1, middleIndex, smallIndex].filter((value) => value !== null).join("-");
}

function unitsTotalHours(units) {
  return units.reduce(
    (sum, unit) => sum + unit.subdomainGroups.reduce(
      (s, group) => s + group.middleUnits.reduce(
        (ss, middle) => ss + middle.smallUnits.reduce((sss, small) => sss + Number(small.hours || 0), 0),
        0
      ),
      0
    ),
    0
  );
}

function unitsTotalPages(units) {
  return units.reduce(
    (sum, unit) => sum
      + Number(unit.introPages || 0)
      + Number(unit.wrapUpPages || 0)
      + unit.subdomainGroups.reduce(
        (s, group) => s + group.middleUnits.reduce(
          (ss, middle) => ss + middle.smallUnits.reduce((sss, small) => sss + Number(small.pages || 0), 0),
          0
        ),
        0
      ),
    0
  );
}

function specialPagesTotal(targetState = state, domain = "") {
  return (targetState.specialPages || [])
    .filter((page) => !domain || page.domain === domain)
    .reduce((sum, page) => sum + Math.max(0, Number(page.pages) || 0), 0);
}

// 초등 체육의 확장 코너(디지털 체육·생활 속 체육·안전 특집·융합·시민·영역 통합 프로젝트)도 같은
// 특별 페이지 목록(state.specialPages)에 두어 03단계 쪽수 배분에 함께 잡힌다. 대단원 이름이 없는
// 항목(domain "")은 책 전체 통합 코너로 마지막 대단원 뒤에 놓인다.
function elementaryCornerPageTypes() {
  return (globalThis.ELEMENTARY_DRAFT_ENGINE?.cornerTypes() || []).map((corner) => ({ id: corner.id, label: corner.label }));
}

function specialPageTypes(targetState = state) {
  return isSportsCultureProject(targetState) ? SPORTS_CULTURE_SPECIAL_PAGE_TYPES : elementaryCornerPageTypes();
}

function sportsCultureSpecialPageTypeLabel(typeId) {
  return [...SPORTS_CULTURE_SPECIAL_PAGE_TYPES, ...elementaryCornerPageTypes()].find((type) => type.id === typeId)?.label || "특별 페이지";
}

function parseLineItems(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [titlePart, pagesPart] = line.split(",");
      return {
        title: (titlePart || "").trim() || "이름 없음",
        pages: Math.max(0, Number.parseInt(pagesPart, 10) || 0),
      };
    });
}

function lineItemsTotalPages(text) {
  return parseLineItems(text).reduce((sum, item) => sum + item.pages, 0);
}

function sampleState() {
  const project = {
    name: "초등 체육 3학년 교과서",
    schoolLevel: "초등학교",
    grade: "3학년",
    subject: "체육",
    corePages: 132,
    supplementaryPages: 10,
    targetHours: 102,
  };
  return {
    version: 11,
    currentStep: 0,
    stepLayout: STEP_LAYOUT_VERSION,
    selectedPages: [1],
    curriculumDomain: "전체",
    unitDomainFilter: "전체",
    project,
    units: unitsForGrade(project.grade),
    frontMatterText: "속표지, 1\n구성과 특징, 2\n목차, 2",
    backMatterText: "참고문헌, 1\n집필자 소개, 1\n판권, 1",
    appendixText: "",
    pages: [],
    frameworkId: "balanced",
    frameworkMetrics: defaultFrameworkMetrics(),
    previewSmallUnitKey: "",
    frameworkDraftLog: [],
    frameworkApproval: { status: "draft", frameworkId: null, approvedAt: null },
  };
}

let projectStore = loadProjectStore();
let state = activeBookState();
normalizeAutomaticUnitNumbering(state);
let sourceCorrections = loadSourceCorrections();
let editingSourceId = null;
let pagePreviewOpen = false;
let moveMenuOpenPath = null;
let evidenceDetailsOpen = false;
// 체크박스를 하나만 눌러도 화면 전체가 다시 그려지므로, state가 아닌 일반 변수에 담아
// 재렌더가 일어나도 지금까지 입력한 내용이 지워지지 않게 한다.
let sportsCultureAdditionalConcept = "";
// 좌측 "교과" 드롭다운에서 고른 값 — 지금 활성 프로젝트가 속한 교과로 시작하고, 이후엔
// 사용자가 고른 값을 따로 기억한다(프로젝트 자체의 데이터가 아니라 화면 필터일 뿐이라
// state/projectStore에는 안 담는다).
let selectedSubjectArea = null;
// 좌측 "교육과정" 드롭다운에서 고른 개정(화면 필터, 위와 같은 이유로 state에 안 담음).
let selectedRevision = null;
// 개발(01~06 단계) / 분석(이미 나온 책의 구조 보기). 2009·2015 개정은 분석만.
let workMode = "develop";
let analysisCatalogId = null;
let selectedDraftBatches = new Set();
let expandedDraftBatches = new Set();
// 스포츠 문화 "전체 스타일·초고" 표는 회차 단위가 아니라 파일 단위(PPT/교과서/지도서/이미지)로
// 선택한다. 키 형식: "{batchIndex}:{entryIndex}:{type}". 미리보기 펼침도 회차가 아니라
// 회차:체제 단위로 따로 관리한다("{batchIndex}:{entryIndex}").
let selectedDraftFiles = new Set();
let expandedDraftFilePreviews = new Set();

function projectId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function initializedElementaryState(gradeLabel, projectName) {
  const initial = sampleState();
  initial.project.name = projectName;
  initial.project.grade = gradeLabel;
  initial.project.targetHours = pagePolicies.elementary_pe.default_book_hours;
  initial.units = unitsForGrade(gradeLabel);
  initial.pages = buildPagePlan(initial);
  return initial;
}

function initializedSportsCultureState(projectName) {
  const initial = sampleState();
  initial.project = {
    name: projectName,
    schoolLevel: "고등학교",
    grade: "",
    subject: "스포츠 문화",
    corePages: 180,
    supplementaryPages: 0,
    targetHours: pagePolicies.sports_culture.default_hours,
  };
  initial.units = unitsForSportsCulture();
  initial.sportsCultureUnitStructureVersion = 2;
  initial.frontMatterText = "속표지, 1\n이 책의 구성과 특징, 2\n목차, 2";
  initial.backMatterText = "참고문헌, 1\n집필자 소개, 1\n판권, 1";
  initial.appendixText = "자료 출처와 찾아보기, 4";
  initial.frameworkMetrics = defaultFrameworkMetrics(SPORTS_CULTURE_FRAMEWORKS);
  initial.generationProviderId = "external-ai-v1";
  initial.selectedSports = ["배드민턴"];
  initial.customSports = "";
  initial.carrierSport = "배드민턴";
  initial.pages = buildPagePlan(initial);
  return ensureSportsCultureDraftSettings(initial);
}

function initializedSecondaryState(item, projectName) {
  if (item.id === "high-sports-culture") return initializedSportsCultureState(projectName);
  const meta = secondaryCourses[item.subject];
  const initial = sampleState();
  initial.project = {
    name: projectName,
    schoolLevel: item.schoolLevel,
    grade: "",
    subject: item.subject,
    corePages: meta.page_policy.baseline_pages,
    supplementaryPages: 0,
    targetHours: meta.default_hours,
  };
  initial.units = unitsForSecondaryCourse(meta);
  initial.frontMatterText = "속표지, 1\n이 책의 구성과 특징, 2\n목차, 2";
  initial.backMatterText = "참고문헌, 1\n집필자 소개, 1\n판권, 1";
  initial.appendixText = "자료 출처와 찾아보기, 4";
  initial.pages = buildPagePlan(initial);
  return initial;
}

function elementaryBandProject(band, name, id = projectId()) {
  const grades = band === "5~6학년군" ? ["5학년", "6학년"] : ["3학년", "4학년"];
  const now = new Date().toISOString();
  return {
    id,
    catalogId: band === "5~6학년군" ? "elementary-5-6" : "elementary-3-4",
    type: "elementary-band",
    name,
    band,
    activeBookKey: grades[0],
    viewMode: "book",
    books: Object.fromEntries(grades.map((grade) => [grade, initializedElementaryState(grade, name)])),
    createdAt: now,
    updatedAt: now,
    setupApproval: { status: "draft", version: 0, approvedAt: null, approvedSnapshot: null },
  };
}

function isPairedProject(project) {
  return project.type === "elementary-band" || project.type === "middle-pe-band" || project.type === "high-pe-band";
}

function isPlaceholderProject(project) {
  return project.type === "unavailable";
}

function initializedMiddlePeBookState(bookLabel) {
  const book = sampleState();
  book.project = {
    name: bookLabel,
    schoolLevel: "중학교",
    grade: "",
    subject: bookLabel,
    corePages: 0,
    supplementaryPages: 0,
    targetHours: 0,
  };
  book.units = [];
  book.pages = [];
  book.frontMatterText = "";
  book.backMatterText = "";
  book.appendixText = "";
  return book;
}

function middlePeBandProject(name, id = projectId()) {
  const now = new Date().toISOString();
  const bookKeys = ["중등체육1", "중등체육2"];
  return {
    id,
    catalogId: "middle-pe",
    type: "middle-pe-band",
    name,
    pairLabel: "중등체육1·중등체육2",
    activeBookKey: bookKeys[0],
    viewMode: "book",
    books: Object.fromEntries(bookKeys.map((key) => [key, initializedMiddlePeBookState(key)])),
    createdAt: now,
    updatedAt: now,
    setupApproval: { status: "draft", version: 0, approvedAt: null, approvedSnapshot: null },
  };
}

function highPeBandProject(name, id = projectId()) {
  const now = new Date().toISOString();
  const items = [
    { subject: "체육1", schoolLevel: "고등학교" },
    { subject: "체육2", schoolLevel: "고등학교" },
  ];
  return {
    id,
    catalogId: "high-pe",
    type: "high-pe-band",
    name,
    pairLabel: "체육1·체육2",
    activeBookKey: items[0].subject,
    viewMode: "book",
    books: Object.fromEntries(items.map((item) => [item.subject, initializedSecondaryState(item, name)])),
    createdAt: now,
    updatedAt: now,
    setupApproval: { status: "draft", version: 0, approvedAt: null, approvedSnapshot: null },
  };
}

function sportsCultureProject(name, id = projectId()) {
  const now = new Date().toISOString();
  return {
    id,
    catalogId: "high-sports-culture",
    type: "single-book",
    name,
    subject: "스포츠 문화",
    activeBookKey: "스포츠 문화",
    viewMode: "book",
    books: { "스포츠 문화": initializedSportsCultureState(name) },
    createdAt: now,
    updatedAt: now,
    setupApproval: { status: "draft", version: 0, approvedAt: null, approvedSnapshot: null },
  };
}

function secondaryProject(item, id = projectId(), name = item.label) {
  const now = new Date().toISOString();
  return {
    id,
    catalogId: item.id,
    type: "single-book",
    name,
    subject: item.subject,
    activeBookKey: item.subject,
    viewMode: "book",
    books: { [item.subject]: initializedSecondaryState(item, name) },
    createdAt: now,
    updatedAt: now,
    setupApproval: { status: "draft", version: 0, approvedAt: null, approvedSnapshot: null },
  };
}

function unavailableCatalogProject(item, id = projectId()) {
  const now = new Date().toISOString();
  const partialMeta = item.partial ? secondaryCourses["중등 체육"] : null;
  const book = sampleState();
  book.project = {
    name: item.label,
    schoolLevel: item.schoolLevel,
    grade: "",
    subject: item.subject,
    corePages: null,
    supplementaryPages: null,
    targetHours: partialMeta?.hours || null,
  };
  book.units = [];
  book.pages = [];
  book.frontMatterText = "";
  book.backMatterText = "";
  book.appendixText = "";
  return {
    id,
    catalogId: item.id,
    type: "unavailable",
    name: item.label,
    subject: item.subject,
    activeBookKey: item.subject,
    viewMode: "book",
    books: { [item.subject]: book },
    createdAt: now,
    updatedAt: now,
    setupApproval: { status: "draft", version: 0, approvedAt: null, approvedSnapshot: null },
  };
}

function inferredCatalogId(project) {
  if (project.catalogId) return project.catalogId;
  if (project.type === "elementary-band") return project.band === "5~6학년군" ? "elementary-5-6" : "elementary-3-4";
  const subject = Object.values(project.books || {})[0]?.project?.subject;
  return PROJECT_CATALOG.find((item) => item.subject === subject && item.schoolLevel === Object.values(project.books || {})[0]?.project?.schoolLevel)?.id || null;
}

function hydrateCatalogProject(project, item = PROJECT_CATALOG.find((candidate) => candidate.id === inferredCatalogId(project))) {
  if (!item?.connected || item.schoolLevel !== "고등학교") return project;
  if (project.type === "unavailable" || !Object.keys(project.books || {}).length) {
    const upgraded = secondaryProject(item, project.id, project.name || item.label);
    upgraded.createdAt = project.createdAt || upgraded.createdAt;
    return upgraded;
  }
  Object.values(project.books).forEach((book) => {
    const meta = secondaryCourses[book.project.subject];
    if (!meta) return;
    if (book.project.corePages === null || book.project.corePages === "" || book.project.corePages === undefined) {
      book.project.corePages = meta.page_policy.baseline_pages;
    }
    if (book.project.supplementaryPages === null || book.project.supplementaryPages === "" || book.project.supplementaryPages === undefined) {
      book.project.supplementaryPages = 0;
    }
    if (!Number(book.project.targetHours)) book.project.targetHours = meta.default_hours;
    if (!Array.isArray(book.units) || !book.units.length) {
      const bookItem = { subject: book.project.subject, schoolLevel: book.project.schoolLevel };
      const template = initializedSecondaryState(bookItem, project.name || item.label);
      book.units = template.units;
      book.frontMatterText ||= template.frontMatterText;
      book.backMatterText ||= template.backMatterText;
      book.appendixText ||= template.appendixText;
      book.pages = buildPagePlan(book);
      book.selectedPages = [1];
    } else if (!Array.isArray(book.pages) || !book.pages.length) {
      book.pages = buildPagePlan(book);
      book.selectedPages = [1];
    }
    ensureSportsCultureDraftSettings(book);
  });
  project.catalogId = item.id;
  return project;
}

function projectForCatalog(item) {
  const existing = projectStore.projects.find((project) => inferredCatalogId(project) === item.id);
  if (existing) {
    const hydrated = hydrateCatalogProject(existing, item);
    const index = projectStore.projects.findIndex((project) => project.id === existing.id);
    projectStore.projects[index] = hydrated;
    return hydrated;
  }
  if (item.id === "elementary-3-4" || item.id === "elementary-5-6") return elementaryBandProject(item.band, item.label);
  if (item.id === "high-pe") return highPeBandProject(item.label);
  if (item.id === "middle-pe") return middlePeBandProject(item.label);
  if (item.connected && item.schoolLevel === "고등학교") return secondaryProject(item);
  return unavailableCatalogProject(item);
}

function legacyState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.version === 10 || saved?.version === 11) {
      saved.version = 11;
      return saved;
    }
  } catch {
    // 손상된 구형 저장값은 새 프로젝트 기본값으로 대체한다.
  }
  return null;
}

function migrateLegacyProject(saved) {
  saved.project.targetHours ||= courseMetaFor(saved)?.default_hours || pagePolicies.elementary_pe.default_book_hours;
  if (isSportsCultureProject(saved)) {
    const migrated = sportsCultureProject(saved.project.name || "고등학교 스포츠 문화");
    migrated.books["스포츠 문화"] = ensureSportsCultureDraftSettings(saved);
    return migrated;
  }
  const grade = [3, 4, 5, 6].includes(Number.parseInt(saved.project?.grade, 10))
    ? `${Number.parseInt(saved.project.grade, 10)}학년`
    : "3학년";
  const band = [5, 6].includes(Number.parseInt(grade, 10)) ? "5~6학년군" : "3~4학년군";
  const name = saved.project?.name || `초등 체육 ${band}`;
  const migrated = elementaryBandProject(band, name);
  migrated.activeBookKey = grade;
  migrated.books[grade] = saved;
  Object.values(migrated.books).forEach((book) => { book.project.name = name; });
  return migrated;
}

function migratePairedCatalogProjects(projects) {
  const legacyPe1 = projects.find((project) => project.catalogId === "high-pe-1" && project.type === "single-book");
  const legacyPe2 = projects.find((project) => project.catalogId === "high-pe-2" && project.type === "single-book");
  let next = projects;
  if (legacyPe1 || legacyPe2) {
    const survivor = legacyPe1 || legacyPe2;
    const merged = highPeBandProject(survivor.name || "고등 체육1·2", survivor.id);
    merged.createdAt = survivor.createdAt;
    if (legacyPe1) merged.books["체육1"] = Object.values(legacyPe1.books)[0];
    if (legacyPe2) merged.books["체육2"] = Object.values(legacyPe2.books)[0];
    merged.activeBookKey = legacyPe1 ? "체육1" : "체육2";
    next = next.filter((project) => project !== legacyPe1 && project !== legacyPe2).concat(merged);
  }
  next = next.map((project) => {
    if (project.type === "high-pe-band" && project.catalogId !== "high-pe") return { ...project, catalogId: "high-pe" };
    if (project.type === "middle-pe-band" && project.catalogId !== "middle-pe") return { ...project, catalogId: "middle-pe" };
    return project;
  });
  const legacyMiddle = next.find((project) => project.catalogId === "middle-pe" && project.type === "unavailable");
  if (legacyMiddle) {
    const merged = middlePeBandProject(legacyMiddle.name || "중등체육1·중등체육2", legacyMiddle.id);
    merged.createdAt = legacyMiddle.createdAt;
    next = next.map((project) => (project === legacyMiddle ? merged : project));
  }
  return next;
}

// 프로젝트 하나(예: 스포츠 문화)를 다듬다가 오류가 나도 다른 프로젝트(예: 초등 3~4학년군)
// 초안까지 통째로 사라지면 안 된다 — 예전에는 이 map 콜백 전체가 바깥 try/catch 하나로만
// 싸여 있어서, 프로젝트 하나만 잘못돼도 saved.projects 전체가 버려지고 loadProjectStore()가
// 빈 기본 프로젝트로 대체해 버렸다(그 뒤 사용자가 뭔가 저장하면 서버의 실제 데이터까지
// 그 빈 기본값으로 덮어써질 위험이 있었다). 프로젝트마다 따로 감싸서, 하나가 실패해도
// 그 프로젝트는 다듬기 전 원본 그대로 남기고 나머지는 정상 처리한다.
function hydrateSingleCatalogProject(project) {
  try {
    project.catalogId ||= inferredCatalogId(project);
    project.setupApproval ||= { status: "draft", version: 0, approvedAt: null, approvedSnapshot: null };
    Object.values(project.books || {}).forEach((book) => {
      if (!isPlaceholderProject(project) && book.project.schoolLevel !== "중학교") {
        book.project.targetHours ||= courseMetaFor(book)?.default_hours || pagePolicies.elementary_pe.default_book_hours;
      }
    });
    return hydrateCatalogProject(project);
  } catch (error) {
    console.error("프로젝트 하나를 다듬는 중 오류가 나서 원본 그대로 남깁니다:", project?.id, error);
    return project;
  }
}

function hydrateProjectStorePayload(saved) {
  try {
    if (saved?.version === PROJECTS_STORAGE_VERSION && Array.isArray(saved.projects) && saved.projects.length) {
      saved.projects = migratePairedCatalogProjects(saved.projects).map(hydrateSingleCatalogProject);
      const activeExists = saved.projects.some((project) => project.id === saved.activeProjectId);
      if (!activeExists) saved.activeProjectId = saved.projects[0].id;
      return saved;
    }
  } catch {
    // 손상된 다중 프로젝트 저장값은 구형 데이터 이전 또는 기본 프로젝트로 대체한다.
  }
  return null;
}

function loadProjectStore() {
  let parsed = null;
  try {
    parsed = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY) || "null");
  } catch {
    // 손상된 저장값은 무시하고 구형 데이터 이전 또는 기본 프로젝트로 대체한다.
  }
  const hydrated = hydrateProjectStorePayload(parsed);
  if (hydrated) return hydrated;
  const oldState = legacyState();
  const firstProject = oldState
    ? migrateLegacyProject(oldState)
    : elementaryBandProject("3~4학년군", "초등 체육 3~4학년군");
  return { version: PROJECTS_STORAGE_VERSION, activeProjectId: firstProject.id, projects: [firstProject] };
}

let serverStateVersion = null;
let serverSyncTimer = null;
let serverSyncInFlight = false;

// 삽화 이미지는 저장·동기화 시 imageId만 남고 imageBase64는 빠진다(위 store 설명 참고).
// 어느 컴퓨터에서 열든, 화면에 없는 imageBase64를 이 id로 다시 받아와 채운다.
function collectAllVisualItems() {
  const items = [];
  (projectStore.projects || []).forEach((project) => {
    Object.values(project.books || {}).forEach((book) => {
      (book.frameworkDraftLog || []).forEach((batch) => {
        (batch.entries || []).forEach((entry) => {
          (entry.spreads || []).forEach((spread) => {
            const visuals = spread.textbook_manuscript?.visuals;
            if (!visuals) return;
            ["left", "right"].forEach((side) => {
              (visuals[side] || []).forEach((item) => items.push(item));
            });
          });
        });
      });
    });
  });
  return items;
}

async function rehydrateMissingImages() {
  const items = collectAllVisualItems().filter((item) => (item.imageId || item.folderImagePath) && !item.imageBase64);
  if (!items.length) return;
  let cursor = 0;
  let restored = 0;
  async function worker() {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      if (item.folderImagePath && workspaceFolder?.isConnected()) {
        const file = await workspaceFolder.readFile(item.folderImagePath);
        if (file) {
          item.imageBase64 = await blobToBase64(file);
          restored += 1;
          continue;
        }
      }
      if (!item.imageId) continue;
      try {
        const response = await fetch(`/api/prototype/image/${encodeURIComponent(item.imageId)}`);
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.result?.imageBase64) {
          item.imageBase64 = data.result.imageBase64;
          restored += 1;
        }
      } catch {
        // 네트워크 오류면 이번엔 건너뛰고 다음에 다시 시도한다.
      }
    }
  }
  const workerCount = Math.min(3, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (restored) renderWorkspace();
}

async function syncProjectStoreFromServer({ silent = true } = {}) {
  try {
    const response = await fetch("/api/prototype/state");
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error || !data.result?.payload) return;
    const hydrated = hydrateProjectStorePayload(data.result.payload);
    if (!hydrated) return;
    // 지금 보고 있는 책 프로젝트는 이 브라우저의 선택을 유지한다. 서버 값의 activeProjectId를 따르면
    // 다른 컴퓨터에서 마지막으로 연 과목(예: 스포츠 문화)으로 화면이 바뀌어 버린다.
    const localActive = projectStore ? activeProject() : null;
    const keepActive = localActive && (hydrated.projects.find((project) => project.id === localActive.id)
      || hydrated.projects.find((project) => project.catalogId && project.catalogId === localActive.catalogId));
    if (keepActive) hydrated.activeProjectId = keepActive.id;
    projectStore = hydrated;
    serverStateVersion = data.result.version;
    useActiveBookState();
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, serializeProjectStoreForStorage(projectStore));
    } catch {
      // 저장 용량 초과 등으로 로컬 저장에 실패해도 서버에서 불러온 값은 화면에 반영한다.
    }
    // 본문만 다시 그리면 왼쪽 프로젝트 선택·단계 제목은 이전 프로젝트로 남아 화면이 어긋난다.
    render();
    if (!silent) showToast("다른 컴퓨터에서 저장된 최신 내용을 불러왔습니다.");
  } catch {
    // 오프라인이거나 서버에 연결하지 못하면 로컬 저장값을 그대로 사용한다.
  } finally {
    rehydrateMissingImages();
  }
}

async function pushProjectStoreToServer() {
  if (serverSyncInFlight) {
    scheduleServerSync();
    return;
  }
  serverSyncInFlight = true;
  try {
    const response = await fetch("/api/prototype/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload: projectStore, expectedVersion: serverStateVersion }, stripEmbeddedImages),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      if (response.status === 409) await syncProjectStoreFromServer({ silent: false });
      return;
    }
    serverStateVersion = data.result?.version ?? serverStateVersion;
  } catch {
    // 오프라인이거나 서버에 연결하지 못하면 다음 저장 때 다시 시도한다.
  } finally {
    serverSyncInFlight = false;
  }
}

function scheduleServerSync() {
  clearTimeout(serverSyncTimer);
  serverSyncTimer = setTimeout(pushProjectStoreToServer, 2000);
}

// 초고 생성처럼 결과를 잃으면 안 되는 중요한 저장 시점에는 2초 디바운스를 기다리지 않고
// 곧바로 서버에 동기화한다(로그인 상태라면 "지금 저장"을 따로 누르지 않아도 됨).
function persistNow(message) {
  const saved = persist(message);
  clearTimeout(serverSyncTimer);
  pushProjectStoreToServer();
  return saved;
}

// ── 작업 폴더 저장 ──
// 폴더를 연결하면 (1) 프로젝트 전체 저장본, (2) 초고 회차별 파일(교과서·지도서 TXT/PDF, 펼침면 PNG,
// 삽화 원본, 원고 데이터 JSON), (3) 생성 이력(CSV·JSONL)을 그 폴더에 직접 쓴다. 브라우저 저장소와
// 서버 동기화는 그대로 두고, 폴더 저장은 그 위에 덧붙이는 가장 확실한 보관 경로로 쓴다.
const workspaceFolder = globalThis.WORKSPACE_FOLDER || null;
const FOLDER_DATA_DIR = "_작업데이터";
// 이전 버전(작업자 구분 전)의 단일 저장본. 공용 폴더를 여러 컴퓨터가 함께 쓰면 서로 덮어쓰므로
// 지금은 작업자별 파일(프로젝트저장본_<작업자>.json)에 저장하고, 이 파일은 읽기만 한다.
const LEGACY_FOLDER_SNAPSHOT_PATH = `${FOLDER_DATA_DIR}/프로젝트저장본.json`;
const DRAFT_HISTORY_CSV_HEADER = "﻿회차,생성일시,작업자,책,대단원·중단원,소단원,유형,차시,쪽수,제공자,스타일,폴더\n";

function folderWorker() {
  return workspaceFolder?.workerName() || "작업자";
}

function folderSnapshotPath(worker = folderWorker()) {
  return `${FOLDER_DATA_DIR}/프로젝트저장본_${workspaceFolder.safeSegment(worker)}.json`;
}

// 공용 폴더에서 누가 만든 파일인지 구분하려고 컴퓨터마다 작업자 이름을 한 번 받는다.
function ensureFolderWorkerName(force = false) {
  if (!workspaceFolder) return "";
  if (!force && workspaceFolder.workerName()) return workspaceFolder.workerName();
  const answer = prompt("공용 폴더에서 이 컴퓨터의 작업을 구분할 작업자 이름을 적어 주세요(예: 홍길동).", workspaceFolder.workerName() || "");
  if (answer === null) return workspaceFolder.workerName();
  return workspaceFolder.setWorkerName(answer.trim() || "작업자");
}
let folderSnapshotTimer = null;
let folderStatusMessage = "";

function folderStamp(isoString = new Date().toISOString()) {
  const date = new Date(isoString);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function renderWorkspaceFolderPanel(message = folderStatusMessage) {
  folderStatusMessage = message;
  const panel = document.querySelector("#workspaceFolderPanel");
  if (!panel) return;
  const info = workspaceFolder?.status() || { status: "unavailable", name: "" };
  const title = {
    checking: "확인 중…",
    connected: `📁 ${info.name}`,
    none: "작업 폴더를 골라 주세요",
    remote: `📁 ${info.name}`,
    unavailable: "확인할 수 없음",
  }[info.status] || "작업 폴더";
  const detail = {
    connected: "초고·시안·조판 결과와 원고 파일이 모두 이 폴더에 저장됩니다. 다른 컴퓨터로 옮길 때는 도구를 끄고 이 폴더를 통째로 복사한 뒤, 그 컴퓨터에서 같은 폴더를 고르세요.",
    none: "지금은 도구 폴더 안에 저장됩니다. 폴더를 고르면 지금까지의 작업을 그 폴더로 옮기고, 이후 만드는 것도 모두 그 폴더에 저장합니다.",
    remote: "다른 컴퓨터에서 접속 중입니다. 작업 폴더는 도구를 실행한 컴퓨터에서만 바꿀 수 있습니다.",
    unavailable: "서버에 연결되지 않았습니다.",
  }[info.status] || "";
  panel.querySelector("[data-folder-title]").textContent = title;
  // 연결된 뒤의 긴 설명은 사이드바가 길어지지 않게 마우스를 올렸을 때만 보인다.
  panel.querySelector("[data-folder-title]").title = [info.path, info.status === "connected" ? detail : ""].filter(Boolean).join(" — ");
  const shownDetail = message || (info.status === "connected" ? "" : detail);
  const detailLine = panel.querySelector("[data-folder-detail]");
  detailLine.textContent = shownDetail;
  detailLine.hidden = !shownDetail;
  const workerLine = panel.querySelector("[data-folder-worker]");
  if (workerLine) {
    workerLine.hidden = info.status !== "connected";
    workerLine.querySelector("b").textContent = folderWorker();
  }
  const pick = panel.querySelector("#connectWorkspaceFolderButton");
  pick.hidden = !(info.local && info.editable && ["connected", "none"].includes(info.status));
  pick.textContent = info.status === "connected" ? "다른 폴더로" : "작업 폴더 고르기";
  pick.title = info.status === "connected" ? "다른 작업 폴더를 고릅니다. 빈 폴더면 지금 작업을 그 폴더로 옮기고, 작업이 있는 폴더면 그것을 엽니다." : "";
  panel.querySelector("#reconnectWorkspaceFolderButton").hidden = true;
  panel.querySelector("#exportDraftsToFolderButton").hidden = info.status !== "connected";
  panel.querySelector("#loadFolderSnapshotButton").hidden = true;
}

function scheduleFolderSnapshot() {
  if (!workspaceFolder?.isConnected()) return;
  clearTimeout(folderSnapshotTimer);
  folderSnapshotTimer = setTimeout(writeFolderSnapshot, 1500);
}

async function writeFolderSnapshot() {
  if (!workspaceFolder?.isConnected()) return;
  try {
    const savedAt = new Date().toISOString();
    const body = JSON.stringify({ savedAt, store: JSON.parse(serializeProjectStoreForStorage(projectStore)) });
    await workspaceFolder.writeFile(folderSnapshotPath(), body);
    // 날짜별 저장본도 하나씩 남겨, 잘못 덮어써도 그날 처음 상태로 되돌릴 수 있게 한다.
    await workspaceFolder.writeFile(`${FOLDER_DATA_DIR}/저장본/프로젝트저장본_${workspaceFolder.safeSegment(folderWorker())}_${folderStamp(savedAt).slice(0, 8)}.json`, body);
    renderWorkspaceFolderPanel(`프로젝트 저장 ${new Date(savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
  } catch (error) {
    renderWorkspaceFolderPanel(`폴더 저장 실패: ${error?.message || error}`);
  }
}

function bookFolderPath(project = activeProject()) {
  const parts = [workspaceFolder.safeSegment(project.name)];
  const bookKeys = Object.keys(project.books || {});
  if (bookKeys.length > 1 && project.activeBookKey) parts.push(workspaceFolder.safeSegment(project.activeBookKey));
  return parts.join("/");
}

function base64ToBlob(base64, type = "image/png") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function writeEntryFilesToFolder(directory, entry, prefix) {
  const write = (name, data) => workspaceFolder.writeFile(`${directory}/${prefix}${name}`, data);
  await write("교과서원고.txt", textbookManuscriptText(entry));
  await write("지도서원고.txt", teacherGuideManuscriptText(entry));
  await write("교과서원고.pdf", canvasPagesToPdfBlob(buildTextbookManuscriptPdfPages(entry)));
  await write("지도서원고.pdf", canvasPagesToPdfBlob(buildTeacherGuideManuscriptPdfPages(entry)));
  for (const [spreadIndex, spread] of (entry.spreads || []).entries()) {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 900;
    await drawDraftSpreadCanvas(canvas, entry, spread);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob) await write(`펼침면_${String(spreadIndex + 1).padStart(2, "0")}.png`, blob);
    const columns = manuscriptVisualColumns(spread.textbook_manuscript || {});
    for (const [side, sideLabel] of [["left", "좌"], ["right", "우"]]) {
      for (const [visualIndex, visual] of (columns[side] || []).entries()) {
        if (!visual.imageBase64) continue;
        const name = `이미지/${String(spreadIndex + 1).padStart(2, "0")}_${sideLabel}_${visualIndex + 1}.png`;
        await write(name, base64ToBlob(visual.imageBase64));
        visual.folderImagePath = `${directory}/${prefix}${name}`;
      }
    }
  }
  try {
    const pptBlob = await spreadsToPptx(entry).write({ outputType: "blob" });
    await write("편집시안.pptx", pptBlob);
  } catch {
    // PPT 변환 실패는 나머지 파일 저장을 막지 않는다.
  }
  try {
    await write("교수학습과정안.hwpx", await fetchLessonPlanHwpxBlob(entry));
  } catch {
    // HWPX는 서버가 만들므로 오프라인이면 건너뛴다(화면의 다운로드 버튼으로 다시 받을 수 있다).
  }
  await write("원고데이터.json", JSON.stringify(entry, stripEmbeddedImages, 1));
}

async function saveDraftBatchToFolder(batch, batchIndex) {
  if (!workspaceFolder?.isConnected() || !batch) return null;
  const base = bookFolderPath();
  const labelParts = String(batch.smallUnitLabel || "").split(" · ");
  const worker = folderWorker();
  // 여러 컴퓨터가 같은 폴더에 쓰므로 회차 번호 대신 생성 시각·작업자로 폴더 이름이 겹치지 않게 한다.
  const folderName = workspaceFolder.safeSegment(`${folderStamp(batch.generatedAt)}_${worker}_${labelParts[labelParts.length - 1] || "초고"}`);
  const directory = `${base}/초안/${folderName}`;
  for (const entry of batch.entries || []) {
    const prefix = batch.entries.length > 1 ? `${sanitizeZipEntryName(entry.frameworkName)}_` : "";
    await writeEntryFilesToFolder(directory, entry, prefix);
  }
  const entry = batch.entries?.[0] || {};
  const row = {
    batch: batchIndex + 1,
    generatedAt: batch.generatedAt,
    worker,
    book: activeProject().activeBookKey || state.project.grade || "",
    unit: labelParts.slice(0, -1).join(" · "),
    smallUnit: labelParts[labelParts.length - 1] || "",
    type: entry.primaryTypeLabel || "",
    lessons: entry.lessonRange || "",
    pages: (entry.spreads || []).length * 2,
    provider: batch.provider?.label || "",
    style: batch.styleLabel || "",
    folder: `초안/${folderName}`,
  };
  // 이력 파일도 작업자별로 따로 쓴다 — 클라우드 동기화 중 두 컴퓨터가 같은 파일에 덧붙이면
  // 한쪽 줄이 사라지거나 충돌 사본이 생긴다. 화면의 "공용 이력"이 모든 작업자 파일을 합쳐 보여 준다.
  const historyName = `초안이력_${workspaceFolder.safeSegment(worker)}`;
  await workspaceFolder.appendText(`${base}/${historyName}.jsonl`, JSON.stringify(row));
  await workspaceFolder.appendText(
    `${base}/${historyName}.csv`,
    [row.batch, row.generatedAt, row.worker, row.book, row.unit, row.smallUnit, row.type, row.lessons, row.pages, row.provider, row.style, row.folder].map(csvEscape).join(","),
    DRAFT_HISTORY_CSV_HEADER,
  );
  batch.folderPath = directory;
  return directory;
}

async function saveNewDraftBatchesToFolder(fromIndex) {
  if (!workspaceFolder?.isConnected()) return 0;
  let saved = 0;
  for (let index = fromIndex; index < (state.frameworkDraftLog || []).length; index += 1) {
    const batch = state.frameworkDraftLog[index];
    if (batch.folderPath) continue;
    try {
      await saveDraftBatchToFolder(batch, index);
      saved += 1;
    } catch (error) {
      renderWorkspaceFolderPanel(`초고 폴더 저장 실패: ${error?.message || error}`);
      showToast(`초고는 생성됐지만 폴더 저장에 실패했습니다: ${error?.message || error}`);
      return saved;
    }
  }
  if (saved) renderWorkspaceFolderPanel(`초고 ${saved}개 회차를 폴더에 저장 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
  return saved;
}

// ── 공용 폴더 이력 ──
// 클라우드 동기화 폴더를 여러 컴퓨터가 함께 연결하면, 각자 쓴 초안이력_<작업자>.jsonl을 합쳐
// 이 책의 모든 생성 이력을 보여 주고, 다른 사람이 만든 초고도 원고데이터.json으로 가져와 연다.
let sharedFolderHistory = { bookPath: "", rows: null, loading: false, error: "" };

async function loadSharedFolderHistory() {
  if (!workspaceFolder?.isConnected()) return;
  const base = bookFolderPath();
  sharedFolderHistory = { bookPath: base, rows: sharedFolderHistory.bookPath === base ? sharedFolderHistory.rows : null, loading: true, error: "" };
  renderWorkspace();
  try {
    const names = (await workspaceFolder.list(base, "file")).filter((name) => /^초안이력.*\.jsonl$/.test(name));
    const rows = [];
    for (const name of names) {
      const fallbackWorker = name.replace(/^초안이력_?/, "").replace(/\.jsonl$/, "") || "이전 기록";
      for (const line of String(await workspaceFolder.readText(`${base}/${name}`) || "").split("\n")) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          rows.push({ ...row, worker: row.worker || fallbackWorker });
        } catch {
          // 동기화 중 잘린 줄은 건너뛴다.
        }
      }
    }
    rows.sort((a, b) => String(b.generatedAt).localeCompare(String(a.generatedAt)));
    sharedFolderHistory = { bookPath: base, rows, loading: false, error: "" };
  } catch (error) {
    sharedFolderHistory = { bookPath: base, rows: [], loading: false, error: error?.message || String(error) };
  }
  renderWorkspace();
}

function isSharedDraftImported(row) {
  return (state.frameworkDraftLog || []).some((batch) => String(batch.folderPath || "").endsWith(`/${row.folder}`));
}

async function importSharedDraft(row) {
  const directory = `${bookFolderPath()}/${row.folder}`;
  const names = (await workspaceFolder.list(directory, "file")).filter((name) => name.endsWith("원고데이터.json"));
  const entries = [];
  for (const name of names) {
    try {
      entries.push(JSON.parse(await workspaceFolder.readText(`${directory}/${name}`)));
    } catch {
      // 읽을 수 없는 원고 파일은 건너뛴다.
    }
  }
  if (!entries.length) {
    showToast("그 회차 폴더에서 원고데이터.json을 찾지 못했습니다. 클라우드 동기화가 끝났는지 확인해 주세요.");
    return;
  }
  state.frameworkDraftLog ||= [];
  state.frameworkDraftLog.push({
    generatedAt: row.generatedAt,
    smallUnitLabel: [row.unit, row.smallUnit].filter(Boolean).join(" · ") || entries[0].smallUnitLabel,
    styleLabel: row.style || "",
    provider: { label: row.provider || "" },
    entries,
    folderPath: directory,
    importedFrom: row.worker,
  });
  persist(`${row.worker} 초고 가져옴`);
  renderWorkspace();
  rehydrateMissingImages();
  showToast(`${row.worker}님의 '${row.smallUnit}' 초고를 화면으로 가져왔습니다.`);
}

function renderSharedFolderHistory() {
  if (!workspaceFolder?.isConnected()) return "";
  const current = sharedFolderHistory.bookPath === bookFolderPath() ? sharedFolderHistory : { rows: null, loading: false, error: "" };
  const rows = current.rows;
  const workers = rows ? [...new Set(rows.map((row) => row.worker))] : [];
  return `
    <section class="shared-history-panel">
      <div class="draft-target-heading">
        <div><strong>공용 폴더 이력</strong><small>여러 사람이 같은 폴더(클라우드 동기화 폴더)를 연결해 쓸 때, 모든 작업자가 이 책에서 만든 초고 목록입니다. 다른 사람이 만든 초고를 내 화면으로 가져올 수 있습니다. 혼자 쓰면 볼 필요 없습니다.${rows ? ` · ${rows.length}건 · 작업자 ${workers.length}명` : ""}</small></div>
        <button class="secondary-button" type="button" data-shared-history-refresh ${current.loading ? "disabled" : ""}>${current.loading ? "읽는 중…" : rows ? "새로 고침" : "공용 이력 보기"}</button>
      </div>
      ${current.error ? `<p class="shared-history-empty">이력을 읽지 못했습니다: ${escapeHtml(current.error)}</p>` : ""}
      ${rows && !rows.length ? `<p class="shared-history-empty">아직 폴더에 남은 생성 이력이 없습니다.</p>` : ""}
      ${rows?.length ? `<div class="shared-history-table-wrap"><table class="shared-history-table">
        <thead><tr><th>생성 일시</th><th>작업자</th><th>소단원·페이지</th><th>유형</th><th>차시</th><th>제공자</th><th></th></tr></thead>
        <tbody>${rows.map((row, index) => `<tr>
          <td>${escapeHtml(new Date(row.generatedAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }))}</td>
          <td>${escapeHtml(row.worker)}${row.worker === folderWorker() ? " (나)" : ""}</td>
          <td>${escapeHtml(row.smallUnit || "")}</td>
          <td>${escapeHtml(row.type || "")}</td>
          <td>${escapeHtml(row.lessons || "")}</td>
          <td>${escapeHtml(row.provider || "")}</td>
          <td>${isSharedDraftImported(row) ? "<small>화면에 있음</small>" : `<button class="secondary-button" type="button" data-shared-history-import="${index}">화면으로 가져오기</button>`}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : ""}
    </section>`;
}

async function applyFolderSnapshot({ askFirst = true, path = "" } = {}) {
  const text = path
    ? await workspaceFolder?.readText(path)
    : (await workspaceFolder?.readText(folderSnapshotPath())) ?? (await workspaceFolder?.readText(LEGACY_FOLDER_SNAPSHOT_PATH));
  if (!text) return false;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    showToast("폴더의 프로젝트 저장본을 읽지 못했습니다.");
    return false;
  }
  const hydrated = hydrateProjectStorePayload(parsed.store || parsed);
  if (!hydrated) return false;
  const savedAt = parsed.savedAt ? new Date(parsed.savedAt).toLocaleString("ko-KR") : "시각 미상";
  if (askFirst && !confirm(`작업 폴더에 ${savedAt} 저장본(프로젝트 ${hydrated.projects.length}개)이 있습니다. 이 저장본으로 지금 화면을 바꿀까요?\n취소하면 지금 화면 내용을 폴더에 저장합니다.`)) return false;
  projectStore = hydrated;
  useActiveBookState();
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, serializeProjectStoreForStorage(projectStore));
  } catch {
    // 저장 용량 초과 등으로 로컬 저장에 실패해도 폴더 저장본은 화면에 반영한다.
  }
  render();
  rehydrateMissingImages();
  showToast("작업 폴더의 저장본을 불러왔습니다.");
  return true;
}

async function connectWorkspaceFolder() {
  const button = document.querySelector("#connectWorkspaceFolderButton");
  if (button) button.disabled = true;
  renderWorkspaceFolderPanel("폴더 고르기 창이 열렸습니다. 안 보이면 작업 표시줄을 확인해 주세요.");
  let result;
  try {
    // 바꾸기 전에 지금 화면의 작업을 서버에 먼저 저장해 둔다(옮길 때 빠지지 않게).
    clearTimeout(serverSyncTimer);
    await pushProjectStoreToServer();
    result = await workspaceFolder.connect();
  } catch (error) {
    renderWorkspaceFolderPanel(error?.message || "작업 폴더를 고르지 못했습니다.");
    return;
  } finally {
    if (button) button.disabled = false;
  }
  if (result.mode === "cancelled") {
    renderWorkspaceFolderPanel("");
    return;
  }
  if (result.mode === "same") {
    renderWorkspaceFolderPanel("이미 이 폴더를 쓰고 있습니다.");
    return;
  }
  ensureFolderWorkerName();
  renderWorkspaceFolderPanel(result.mode === "moved" ? "지금까지의 작업을 이 폴더로 옮겼습니다. 화면을 다시 엽니다…" : "이 폴더에 저장된 작업을 엽니다…");
  setTimeout(() => location.reload(), 1200);
}

function bindWorkspaceFolderPanel() {
  if (!workspaceFolder) return;
  workspaceFolder.subscribe(() => renderWorkspaceFolderPanel());
  document.querySelector("#connectWorkspaceFolderButton")?.addEventListener("click", () => connectWorkspaceFolder());
  document.querySelector("#loadFolderSnapshotButton")?.addEventListener("click", async () => {
    // 공용 폴더에는 작업자별 저장본이 여러 개 있으므로 고를 수 있게 한다.
    const names = (await workspaceFolder.list(FOLDER_DATA_DIR, "file")).filter((name) => /^프로젝트저장본.*\.json$/.test(name));
    if (!names.length) {
      showToast("폴더에 불러올 저장본이 없습니다.");
      return;
    }
    let chosen = names[0];
    if (names.length > 1) {
      const mine = names.indexOf(folderSnapshotPath().split("/").pop());
      const answer = prompt(`불러올 저장본 번호를 적어 주세요.\n${names.map((name, index) => `${index + 1}. ${name}`).join("\n")}`, String(Math.max(1, mine + 1)));
      if (answer === null) return;
      chosen = names[Number(answer) - 1];
      if (!chosen) {
        showToast("번호를 다시 확인해 주세요.");
        return;
      }
    }
    if (!await applyFolderSnapshot({ askFirst: true, path: `${FOLDER_DATA_DIR}/${chosen}` })) showToast("저장본을 불러오지 않았습니다.");
  });
  // 공용 이력 버튼은 본문을 다시 그릴 때마다 새로 생기므로 #workspace에 한 번만 위임해 둔다.
  document.querySelector("#workspace")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-shared-history-refresh]")) {
      loadSharedFolderHistory();
      return;
    }
    const importButton = event.target.closest("[data-shared-history-import]");
    if (importButton) {
      const row = sharedFolderHistory.rows?.[Number(importButton.dataset.sharedHistoryImport)];
      if (row) {
        importButton.disabled = true;
        importSharedDraft(row);
      }
    }
  });
  document.querySelector("#changeFolderWorkerButton")?.addEventListener("click", () => {
    ensureFolderWorkerName(true);
    renderWorkspaceFolderPanel();
    scheduleFolderSnapshot();
  });
  document.querySelector("#exportDraftsToFolderButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const saved = await saveNewDraftBatchesToFolder(0);
    button.disabled = false;
    persist("초고 폴더 저장 위치 기록됨");
    showToast(saved ? `이 책의 초고 ${saved}개 회차를 폴더에 저장했습니다.` : "폴더에 새로 저장할 초고가 없습니다.");
  });
  workspaceFolder.init().then((info) => {
    renderWorkspaceFolderPanel();
    if (info.status === "connected") rehydrateMissingImages();
  });
}

// ── AI 생성 키(컴퓨터별) ──
// 키는 브라우저에 두지 않고, 이 컴퓨터에서 실행 중인 서버가 .env.local에 저장한다. 화면에는
// 설정 여부와 끝 4자리만 보인다. 한 번 저장하면 서버를 다시 켜도 계속 쓴다.
let aiKeyStatus = null;

function renderAiKeyPanel(message = "") {
  const panel = document.querySelector("#aiKeyPanel");
  if (!panel) return;
  const info = aiKeyStatus;
  const title = !info ? "확인할 수 없음" : info.configured ? `설정됨 ${info.masked}` : "설정 안 됨";
  let detail = message;
  if (!detail && info) {
    if (info.source === "environment") detail = "컴퓨터 환경 변수의 키를 쓰는 중입니다. 화면에서 바꾸려면 환경 변수를 먼저 지워야 합니다.";
    else if (!info.editable) detail = "온라인 배포본은 관리자가 설정한 키를 씁니다.";
    else if (!info.local) detail = "키는 도구를 실행한 그 컴퓨터(127.0.0.1)에서만 입력할 수 있습니다.";
    else detail = info.configured ? "" : "OpenAI API 키를 한 번 입력해 주세요.";
  }
  if (!info && !message) detail = "서버에 연결되지 않았습니다.";
  panel.querySelector("[data-ai-key-title]").textContent = title;
  panel.querySelector("[data-ai-key-detail]").textContent = detail;
  const canEdit = Boolean(info?.editable && info?.local && info?.source !== "environment");
  const formOpen = !panel.querySelector("#aiKeyForm").hidden;
  panel.querySelector("#openAiKeyFormButton").hidden = !canEdit || formOpen;
  panel.querySelector("#removeAiKeyButton").hidden = !info?.configured;
}

async function refreshAiKeyStatus() {
  try {
    const response = await fetch("/api/settings/openai-key");
    const data = await response.json().catch(() => ({}));
    aiKeyStatus = response.ok ? data.result : null;
  } catch {
    aiKeyStatus = null;
  }
  renderAiKeyPanel();
}

async function submitAiKey(key) {
  const response = await fetch("/api/settings/openai-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || "키를 저장하지 못했습니다.");
  aiKeyStatus = { ...aiKeyStatus, ...data.result };
  return data.result;
}

// ── 도구 끄기 ──
// 브라우저 창을 닫아도 서버(파이썬)는 계속 켜져 있다. 작업 폴더를 복사하기 전 등에는 이 버튼으로 서버까지 끈다.
function bindQuitStudioButton() {
  const button = document.querySelector("#quitStudioButton");
  if (!button) return;
  button.addEventListener("click", async () => {
    const busy = typeof designcraftBusy !== "undefined" && designcraftBusy ? `\n\n지금 "${designcraftBusy}" 작업이 진행 중입니다. 끄면 그 작업은 멈춥니다(이미 끝난 것은 저장되어 있습니다).` : "";
    if (!confirm(`도구를 끌까요?\n\n작업 내용은 저장한 뒤 끕니다. 다시 쓰려면 바탕화면의 'YBM 교과서 스튜디오' 아이콘(또는 start-studio.cmd)을 누르세요.${busy}`)) return;
    button.disabled = true;
    button.textContent = "저장 후 끄는 중…";
    clearTimeout(serverSyncTimer);
    try { persist("자동 저장됨"); } catch { /* 저장 표시 실패는 무시 */ }
    clearTimeout(serverSyncTimer);
    await pushProjectStoreToServer();
    try {
      const response = await fetch("/api/server/shutdown", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || "도구를 끄지 못했습니다.");
    } catch (error) {
      button.disabled = false;
      button.textContent = "도구 끄기";
      showToast(error?.message || "도구를 끄지 못했습니다.");
      return;
    }
    document.body.innerHTML = `<div class="studio-stopped"><strong>도구를 껐습니다.</strong><p>이 창은 닫아도 됩니다. 작업 폴더를 복사하거나 옮겨도 안전합니다.</p><p>다시 쓰려면 바탕화면의 <b>YBM 교과서 스튜디오</b> 아이콘(또는 도구 폴더의 <b>start-studio.cmd</b>)을 누르세요.</p></div>`;
  });
}

function bindAiKeyPanel() {
  const panel = document.querySelector("#aiKeyPanel");
  if (!panel) return;
  const form = panel.querySelector("#aiKeyForm");
  const input = panel.querySelector("#aiKeyInput");
  const closeForm = () => {
    input.value = "";
    form.hidden = true;
  };
  panel.querySelector("#openAiKeyFormButton").addEventListener("click", () => {
    form.hidden = false;
    renderAiKeyPanel();
    input.focus();
  });
  panel.querySelector("#cancelAiKeyButton").addEventListener("click", () => {
    closeForm();
    renderAiKeyPanel();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = input.value.trim();
    if (!key) return;
    renderAiKeyPanel("키를 확인하는 중…");
    try {
      const result = await submitAiKey(key);
      closeForm();
      renderAiKeyPanel(result.verification === "unverified" ? "저장했습니다. 인터넷 연결 문제로 키가 유효한지는 확인하지 못했습니다." : "저장했습니다. 이제 AI 실시간 생성을 쓸 수 있습니다.");
    } catch (error) {
      renderAiKeyPanel(error.message);
    }
  });
  panel.querySelector("#removeAiKeyButton").addEventListener("click", async () => {
    if (!confirm("이 컴퓨터에 저장된 OpenAI API 키를 삭제할까요?")) return;
    try {
      await submitAiKey("");
      closeForm();
      renderAiKeyPanel("키를 삭제했습니다.");
    } catch (error) {
      renderAiKeyPanel(error.message);
    }
  });
  refreshAiKeyStatus();
}

function activeProject() {
  return projectStore.projects.find((project) => project.id === projectStore.activeProjectId) || projectStore.projects[0];
}

function activeBookState() {
  const project = activeProject();
  return project.books[project.activeBookKey] || Object.values(project.books)[0];
}

function useActiveBookState() {
  state = activeBookState();
  normalizeAutomaticUnitNumbering(state);
}

function syncProjectName(name) {
  const project = activeProject();
  project.name = name;
  Object.values(project.books).forEach((book) => { book.project.name = name; });
}

function loadSourceCorrections() {
  try {
    const saved = JSON.parse(localStorage.getItem(CORRECTION_STORAGE_KEY)) || {};
    return Object.fromEntries(Object.entries(saved).map(([sourceId, value]) => {
      if (Array.isArray(value?.versions)) return [sourceId, value];
      if (value?.correctedText) {
        return [sourceId, {
          versions: [{
            text: value.correctedText,
            note: value.reason || "기존 정정안에서 이전",
            savedAt: value.updatedAt || new Date().toISOString(),
          }],
        }];
      }
      return [sourceId, { versions: [] }];
    }));
  } catch {
    return {};
  }
}

function pageTotals(targetState = state) {
  const toPageNumber = (value) => value === "" || value === null || value === undefined ? NaN : Number(value);
  const core = toPageNumber(targetState.project.corePages);
  const supplementary = toPageNumber(targetState.project.supplementaryPages);
  return {
    core,
    supplementary,
    total: core + supplementary,
  };
}

function pageValidation(targetState = state) {
  const totals = pageTotals(targetState);
  const errors = [];
  const isElementary = targetState.project.schoolLevel === "초등학교";
  const isHighSchool = isHighSchoolProject(targetState);
  const policy = pagePolicyFor(targetState);
  if (!policy) {
    errors.push("현재 전처리 자료에는 선택한 학교급의 공식 분량 기준이 없습니다. 관련 파일 전처리 후 연결할 예정입니다.");
    return { valid: false, unavailable: true, errors, totals };
  }
  if ([totals.core, totals.supplementary].some((value) => !Number.isInteger(value) || value < 0)) {
    errors.push("본문·부록 합계와 부속자료 쪽수는 0 이상의 정수로 입력해야 합니다.");
  }
  if (isHighSchool) {
    if (totals.core < policy.minimum_pages || totals.core > policy.maximum_pages) {
      errors.push(`교과서·부록 합계 ${totals.core}쪽: 공식 허용 범위 ${policy.minimum_pages}~${policy.maximum_pages}쪽을 벗어났습니다.`);
    }
  } else {
    if (totals.core < policy.minimum_pages || totals.core > policy.maximum_pages) {
      errors.push(`본문·부록 합계 ${totals.core}쪽: 공식 허용 범위 ${policy.minimum_pages}~${policy.maximum_pages}쪽을 벗어났습니다.`);
    }
    if (totals.supplementary > policy.supplementary_maximum_pages) {
      errors.push(`부속자료 ${totals.supplementary}쪽: 최대 ${policy.supplementary_maximum_pages}쪽을 초과했습니다.`);
    }
    const maximumTotal = policy.maximum_pages + policy.supplementary_maximum_pages;
    if (totals.total > maximumTotal) {
      errors.push(`전체 ${totals.total}쪽: 겉표지를 제외한 최대 ${maximumTotal}쪽을 초과했습니다.`);
    }
  }
  return { valid: errors.length === 0, errors, totals };
}

function projectSetupValidation(project = activeProject()) {
  const errors = [];
  if (isPlaceholderProject(project)) {
    return {
      valid: false,
      unavailable: true,
      errors: ["이 교과목은 교육과정 목록에서 확인되지만 쪽수·차시·편찬 기준 데이터가 아직 연결되지 않았습니다."],
      bookResults: {},
    };
  }
  const bookResults = Object.fromEntries(Object.entries(project.books).map(([bookKey, book]) => {
    const result = pageValidation(book);
    result.errors.forEach((error) => errors.push(`${bookKey}: ${error}`));
    const hours = Number(book.project.targetHours);
    if (!Number.isInteger(hours) || hours <= 0) errors.push(`${bookKey}: 차시는 1 이상의 정수여야 합니다.`);
    return [bookKey, result];
  }));
  if (project.type === "elementary-band") {
    const totalHours = Object.values(project.books).reduce((sum, book) => sum + Number(book.project.targetHours || 0), 0);
    if (totalHours !== pagePolicies.elementary_pe.group_hours) {
      errors.push(`두 학년책의 차시 합계는 학년군 기준 ${pagePolicies.elementary_pe.group_hours}차시여야 합니다. 현재 ${totalHours}차시입니다.`);
    }
  } else if (project.type === "middle-pe-band") {
    const totalHours = Object.values(project.books).reduce((sum, book) => sum + Number(book.project.targetHours || 0), 0);
    const targetHours = secondaryCourses["중등 체육"]?.hours || 272;
    if (totalHours !== targetHours) {
      errors.push(`두 책의 차시 합계는 중학교 3개년 기준 ${targetHours}차시여야 합니다. 현재 ${totalHours}차시입니다.`);
    }
  } else {
    Object.values(project.books).forEach((book) => {
      const hours = Number(book.project.targetHours);
      const policy = courseMetaFor(book);
      if (hours < policy.minimum_hours || hours > policy.maximum_hours) {
        errors.push(`${book.project.subject} 차시는 ${policy.minimum_hours}~${policy.maximum_hours}차시 범위로 설정해야 합니다.`);
      }
    });
  }
  return { valid: errors.length === 0, errors, bookResults };
}

function redistributeUnitHours(book, targetHours) {
  const smallUnits = book.units.flatMap((unit) => unit.subdomainGroups.flatMap((group) => group.middleUnits.flatMap((middle) => middle.smallUnits)));
  const counts = allocateCounts(targetHours, smallUnits.map((small) => Number(small.hours) || 1));
  smallUnits.forEach((small, index) => { small.hours = counts[index]; });
}

function setupSnapshot(project = activeProject()) {
  return {
    name: project.name,
    band: project.band || null,
    books: Object.fromEntries(Object.entries(project.books).map(([bookKey, book]) => [bookKey, {
      schoolLevel: book.project.schoolLevel,
      subject: book.project.subject,
      grade: book.project.grade,
      corePages: book.project.corePages,
      supplementaryPages: book.project.supplementaryPages,
      targetHours: book.project.targetHours,
    }])),
  };
}

function setupIsEditable(project = activeProject()) {
  return project.setupApproval?.status === "draft";
}

function activeStageValidation() {
  return state.currentStep === 0 ? projectSetupValidation() : pageValidation();
}

// AI로 생성한 삽화(imageBase64)는 장당 수 MB에 달해 localStorage 용량 제한(QuotaExceededError)과
// 서버 동기화 요청 크기 제한을 쉽게 넘긴다. 현재 세션 화면 표시에는 필요하지만, 저장·동기화되는
// 값에서는 항상 제외한다 — 새로고침하면 이미지는 사라지고 다시 생성해야 하지만, 원고 자체와
// 목록은 안전하게 유지된다.
function stripEmbeddedImages(key, value) {
  return key === "imageBase64" ? undefined : value;
}

function serializeProjectStoreForStorage(store) {
  return JSON.stringify(store, stripEmbeddedImages);
}

function persist(message = "자동 저장됨") {
  const validation = state.currentStep === 0 ? projectSetupValidation() : pageValidation();
  const saveState = document.querySelector("#saveState");
  activeProject().updatedAt = new Date().toISOString();
  scheduleServerSync();
  scheduleFolderSnapshot();
  if (validation.unavailable) {
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, serializeProjectStoreForStorage(projectStore));
    } catch {
      // 저장 용량 초과 등으로 로컬 저장에 실패해도, 방금 만든 초안이 화면에서 사라지면 안 된다.
    }
    saveState.textContent = "임시 저장됨 · 공식 자료 미연결";
    saveState.classList.add("invalid");
    return true;
  }
  if (!validation.valid) {
    saveState.textContent = "저장 안 됨 · 분량 기준 확인";
    saveState.classList.add("invalid");
    return false;
  }
  saveState.classList.remove("invalid");
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, serializeProjectStoreForStorage(projectStore));
  } catch {
    // 저장 용량 초과 등으로 로컬 저장에 실패해도, 방금 만든 초안이 화면에서 사라지면 안 된다.
  }
  saveState.textContent = `${message} · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
  return true;
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function entryHeaderLines(entry) {
  if (isElementaryEntry(entry)) {
    return [
      `수업 유형: ${entry.primaryTypeLabel || ""}`,
      ...(entry.carrierSport ? [`원 활동: ${entry.carrierSport}`] : []),
      `차시: ${entry.lessonRange || ""}`,
    ];
  }
  return [
    `종목 사용 방식: ${sportsCultureSportModeLabel(entry.sportMode)}`,
    `종목: ${entry.carrierSport || "특정 종목 없음"}`,
  ];
}

function manuscriptSectionHeading(section) {
  const tag = section.boxType ? (section.boxType === section.title ? " [코너]" : ` [구성요소: ${section.boxType}]`) : "";
  return `${section.label || section.number}. ${section.title}${tag}`;
}

function textbookManuscriptText(entry) {
  const lines = [
    `[${entrySubjectLabel(entry)} 교과서 원고]`,
    `체제안: ${entry.frameworkName}`,
    `소단원: ${entry.smallUnitLabel}`,
    ...(isElementaryEntry(entry) ? [] : [`소단원 성격: ${entry.primaryTypeLabel}`]),
    ...entryHeaderLines(entry),
    `성취기준: ${(entry.traceability?.standardCodes || []).join(", ")}`,
    "",
  ];
  entry.spreads.forEach((spread, index) => {
    const manuscript = spread.textbook_manuscript || {};
    lines.push(`===== 펼침면 ${index + 1} · ${spread.left_page}~${spread.right_page}쪽${spread.lesson_label ? ` · ${spread.lesson_label}` : ""} =====`);
    lines.push(`# ${manuscript.headline || spread.title}`);
    lines.push(`학습 목표: ${manuscript.learningGoal || ""}`);
    lines.push(`생각 열기: ${manuscript.openingQuestion || ""}`);
    lines.push(`도입문: ${manuscript.deck || spread.intro}`, "");
    (manuscript.sections || []).forEach((section) => {
      lines.push(manuscriptSectionHeading(section));
      (section.paragraphs || []).forEach((paragraph) => lines.push(paragraph));
      lines.push("");
    });
    const visualLines = manuscript.visuals
      ? [
          ...(manuscript.visuals.left || []).map((item) => `- (좌) [${item.size}/${item.placement}] ${item.description}`),
          ...(manuscript.visuals.right || []).map((item) => `- (우) [${item.size}/${item.placement}] ${item.description}`),
        ]
      : (manuscript.visualBriefs || []).map((brief) => `- ${brief}`);
    lines.push("[사진·삽화·정보 그래픽 발주]", ...visualLines, "");
  });
  return lines.join("\r\n");
}

function teacherGuideManuscriptText(entry) {
  const lines = [
    `[${entrySubjectLabel(entry)} 지도서 원고]`,
    `연계 교과서: ${entry.smallUnitLabel}`,
    `체제안: ${entry.frameworkName}`,
    ...entryHeaderLines(entry),
    `성취기준: ${(entry.traceability?.standardCodes || []).join(", ")}`,
    `차시·분량: ${entry.teacherGuide?.annualPlanLink || ""}`,
    "",
  ];
  entry.spreads.forEach((spread, index) => {
    const guide = spread.teacher_guide || {};
    lines.push(`===== ${spread.lesson_label || `${index + 1}차시군`} · 교과서 ${spread.left_page}~${spread.right_page}쪽 =====`);
    lines.push("[수업 목표]", ...(guide.lessonGoals || []).map((item) => `- ${item}`));
    lines.push("", `[준비물] ${(guide.preparation || []).join(" · ")}`);
    lines.push("", "[수업 흐름]", ...(guide.lessonFlow || []).map((item) => `- ${item.stage}: ${item.guidance}`));
    lines.push("", "[지도상의 유의점]", ...(guide.teachingNotes || []).map((item) => `- ${item}`));
    lines.push("", "[핵심 발문]", ...(guide.questions || []).map((item) => `- ${item}`));
    lines.push("", "[예상 답변]", ...(guide.expectedResponses || []).map((item) => `- ${item}`));
    lines.push("", `[${isElementaryEntry(entry) ? "수준별 지도·대체 활동" : "개별화·대체 참여"}]`, ...(guide.differentiation || []).map((item) => `- ${item}`));
    lines.push("", `[${isElementaryEntry(entry) ? "안전 지도" : "안전·포용"}] ${guide.safety || ""}`);
    lines.push("", `[평가] ${(guide.assessment || []).join(" · ")}`, "");
  });
  return lines.join("\r\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadCsvFile(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  downloadTextFile(filename, "﻿" + csv, "text/csv;charset=utf-8");
}

function curriculumDownloadRows() {
  const rows = [["영역", "코드", "성취기준", "해설"]];
  if (isHighSchoolProject()) {
    const meta = courseMetaFor();
    const standards = meta?.standards?.length ? meta.standards : sportsCultureStandards();
    standards.forEach((standard) => rows.push([standard.domain, standard.code, standard.statement, standard.explanation || ""]));
    return rows;
  }
  if (state.project.schoolLevel === "중학교") {
    const standards = secondaryCourses["중등 체육"]?.standards || [];
    standards.forEach((standard) => rows.push([standard.domain, standard.code, standard.statement, standard.explanation || ""]));
    return rows;
  }
  const grade = Number.parseInt(state.project.grade, 10) || 3;
  const gradeBand = grade <= 4 ? "3~4학년군" : "5~6학년군";
  const bandStandards = curriculumData.standards.filter((item) => item.grade_band === gradeBand);
  ["운동", "스포츠", "표현"].forEach((domain) => {
    bandStandards.filter((item) => item.domain === domain).forEach((standard) => {
      rows.push([domain, standard.code, standard.statement, standard.explanation]);
    });
    const consideration = curriculumData.considerations.find((item) => item.grade_band === gradeBand && item.domain === domain);
    if (consideration) rows.push([domain, "적용 시 고려 사항", consideration.text, ""]);
  });
  return rows;
}

function unitsTocRows() {
  const rows = [["구분", "대단원", "이름", "종목 사용 방식", "종목", "구성요소", "차시", "쪽수"]];
  parseLineItems(state.frontMatterText).forEach((item) => rows.push(["앞부속", "", item.title, "", "", "", "", item.pages]));
  const placedSpecialIds = new Set();
  state.units.forEach((unit, unitIndex) => {
    const largeNumber = unitNumberLabel(unitIndex);
    const largeTitle = `${largeNumber}. ${unit.domain}`;
    if (Number(unit.introPages)) rows.push(["도입", largeTitle, `${largeTitle} 도입`, "", "", "", "", unit.introPages]);
    unit.subdomainGroups.forEach((group, groupIndex) => {
      group.middleUnits.forEach((middle, middleIndex) => {
        const middlePosition = middleUnitPosition(unit, groupIndex, middleIndex);
        const middleNumber = unitNumberLabel(unitIndex, middlePosition);
        rows.push(["중단원", largeTitle, `${middleNumber}. ${group.subtitle ? `${group.subtitle} · ` : ""}${middle.title}`, "", "", "", "", ""]);
        middle.smallUnits.forEach((small, smallIndex) => {
          const smallNumber = unitNumberLabel(unitIndex, middlePosition, smallIndex + 1);
          rows.push(["소단원", largeTitle, `${smallNumber}. ${small.title}`, sportsCultureSportModeLabel(small.sportMode), Array.isArray(small.sports) ? small.sports.join(", ") : "", Array.isArray(small.concepts) ? small.concepts.join(", ") : "", small.hours, small.pages]);
        });
      });
    });
    (state.specialPages || []).filter((page) => page.domain === unit.domain).forEach((page) => {
      rows.push(["특별페이지", largeTitle, `${largeNumber}. ${page.title}`, sportsCultureSpecialPageTypeLabel(page.type), "", "", "", page.pages]);
      placedSpecialIds.add(page.id);
    });
    if (Number(unit.wrapUpPages)) rows.push(["마무리", largeTitle, `${largeTitle} 마무리`, "", "", "", "", unit.wrapUpPages]);
  });
  (state.specialPages || []).filter((page) => !placedSpecialIds.has(page.id)).forEach((page) => {
    rows.push(["특별페이지", page.domain || "", page.title, sportsCultureSpecialPageTypeLabel(page.type), "", "", "", page.pages]);
  });
  parseLineItems(state.backMatterText).forEach((item) => rows.push(["뒷부속", "", item.title, "", "", "", "", item.pages]));
  parseLineItems(state.appendixText).forEach((item) => rows.push(["부록", "", item.title, "", "", "", "", item.pages]));
  // 종목 사용 방식·종목·구성요소는 고등 스포츠 문화에서만 정하는 값이라 초등 목차에서는 열을 뺀다.
  if (!isSportsCultureProject()) return rows.map((row) => [row[0] === "특별페이지" ? "확장 코너" : row[0], ...row.slice(1, 3), ...row.slice(6)]);
  return rows;
}

function pagePlanRows(pages) {
  const rows = [["쪽", "구성", "영역", "단원", "유형", "상태"]];
  pages.forEach((page) => rows.push([page.number, page.group, page.area, page.unit, page.type, page.status]));
  return rows;
}

// smallUnitLabel은 "대단원 · 중단원 · 소단원" 형식으로 조립돼 있어 리스트 한 줄에 그대로
// 쓰면 너무 길다. 마지막 " · " 구간(소단원, 실제로 각 회차를 구분하는 정보)만 굵은 제목으로
// 분리하고 나머지(대단원·중단원 경로)는 위에 작은 보조 줄로 둔다.
function splitSmallUnitLabel(label) {
  const text = String(label || "");
  const parts = text.split(" · ");
  if (parts.length <= 1) return { breadcrumb: "", title: text };
  const title = parts.pop();
  return { breadcrumb: parts.join(" · "), title };
}

// 표의 "단원명 | 소단원명" 두 열용 — 대단원명만 단원명으로 쓰고 중단원명은 버린다.
// 중단원명이 보통 대단원명을 그대로 앞에 붙인 문구("스포츠 경기 문화 · 2-3. 스포츠 경기
// 문화의 융합과 확산")라서 그대로 두 열에 나누면 대단원명이 두 번 보인다. 소단원명 자체에
// 이미 번호(2-3-3.)가 있어 어느 중단원 소속인지는 그걸로 알 수 있다.
function splitSmallUnitLabelForTable(label) {
  const text = String(label || "");
  const parts = text.split(" · ");
  if (parts.length <= 1) return { unitName: "", smallTitle: text };
  return { unitName: parts[0], smallTitle: parts[parts.length - 1] };
}

function formatDraftBatchTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function pptxTruncate(text, maxLength = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

// 두 생성 제공자의 원고 모양이 다르다 — 외부 AI는 visuals:{left,right}(크기·배치·설명)를,
// 내부 규칙 기반 제공자는 visualBriefs(문자열 3개)를 준다. PPT는 둘 다 같은 모양으로 맞춰서 쓴다.
function manuscriptVisualColumns(manuscript) {
  if (manuscript.visuals) return { left: manuscript.visuals.left || [], right: manuscript.visuals.right || [] };
  const briefs = (manuscript.visualBriefs || []).map((description) => ({ description }));
  const half = Math.ceil(briefs.length / 2);
  return { left: briefs.slice(0, half), right: briefs.slice(half) };
}

function pptxAddSectionBlock(slide, section, x, y, w, h) {
  const headerH = Math.min(0.35, h * 0.3);
  const headerLabel = section.boxType ? `${section.number}. ${section.title} [${section.boxType}]` : `${section.number}. ${section.title}`;
  slide.addText(headerLabel, {
    x, y, w, h: headerH, bold: true, color: "FFFFFF", fontSize: 11, fill: { color: section.boxType ? "B5651D" : "2E6B8A" },
  });
  slide.addText(pptxTruncate((section.paragraphs || []).join(" ")), {
    x, y: y + headerH, w, h: Math.max(0.3, h - headerH - 0.05), fontSize: 9.5, color: "333333",
    fill: { color: section.boxType ? "FDF6EA" : "FFFFFF" }, line: { color: "D5DDD7" }, valign: "top",
  });
}

function pptxAddVisualBlock(slide, visual, x, y, w, h) {
  if (visual.imageBase64) {
    const captionH = Math.min(0.3, h * 0.3);
    const imageH = Math.max(0.3, h - captionH);
    slide.addImage({
      data: `data:image/png;base64,${visual.imageBase64}`,
      x, y, w, h: imageH,
      sizing: { type: "contain", w, h: imageH },
    });
    slide.addText(pptxTruncate(visual.description, 90), {
      x, y: y + h - captionH, w, h: captionH, fontSize: 8, italic: true, color: "5B6B60", valign: "top",
    });
    return;
  }
  slide.addText(`[삽화] ${pptxTruncate(visual.description, 150)}`, {
    x, y, w, h, fontSize: 9, italic: true, color: "5B6B60",
    fill: { color: "F4F6F4" }, line: { color: "D5DDD7", dashType: "dash" }, valign: "top",
  });
}

function pptxStackManuscriptBlocks(slide, blocks, x, y, w, bottom) {
  const height = blocks.length ? (bottom - y) / blocks.length : bottom - y;
  blocks.forEach((block) => {
    if (block.kind === "section") pptxAddSectionBlock(slide, block.data, x, y, w, height);
    else pptxAddVisualBlock(slide, block.data, x, y, w, height);
    y += height;
  });
}

// 펼침면 1개 = 슬라이드 1장, 실제 책처럼 왼쪽 쪽과 오른쪽 쪽으로 나눔. 두 쪽 모두
// spread.textbook_manuscript(화면 미리보기·TXT 내보내기가 쓰는 것과 같은 원고)를 그대로
// 반영한다 — 절 개수는 매 생성마다 AI가 정하므로 절을 좌우로 균등 배분하고, 삽화는
// 이미지가 있으면 실제로 삽입하고 없으면 설명 문구만 보여 준다.
function addEntrySlidesToPptx(pres, entry, headingPrefix = "") {
  const leftX = 0.35;
  const rightX = 6.95;
  const colWidth = 6.0;
  const top = 0.25;
  const bottom = 7.3;

  entry.spreads.forEach((spread) => {
    const manuscript = spread.textbook_manuscript;
    const slide = pres.addSlide();
    slide.addShape(pres.ShapeType.line, { x: 6.65, y: 0.15, w: 0, h: 7.2, line: { color: "CFD9D2", width: 1 } });

    let y = top;
    slide.addText(`${headingPrefix}${entry.frameworkName} · ${entry.smallUnitLabel}`, {
      x: leftX, y, w: colWidth, h: 0.28, fontSize: 10, color: "6B7A70",
    });
    y += 0.3;
    slide.addText(manuscript.headline || "", {
      x: leftX, y, w: colWidth, h: 0.55, fontSize: 15, bold: true, color: "215B3D", valign: "top",
    });
    y += 0.6;
    const openingLine = manuscript.openingQuestion ? `${manuscript.learningGoal}\n→ ${manuscript.openingQuestion}` : manuscript.learningGoal;
    slide.addText(pptxTruncate(openingLine, 260), {
      x: leftX, y, w: colWidth, h: 0.9, fontSize: 9.5, color: "333333", valign: "top",
      fill: { color: "F4F6F4" }, line: { color: "D5DDD7" },
    });
    y += 1.0;

    const sections = (manuscript.sections || []).map((section) => ({ data: section, kind: "section" }));
    const half = manuscriptPageSplit(manuscript);
    const visualColumns = manuscriptVisualColumns(manuscript);

    pptxStackManuscriptBlocks(
      slide,
      [...sections.slice(0, half), ...visualColumns.left.map((visual) => ({ data: visual, kind: "visual" }))],
      leftX, y, colWidth, bottom,
    );
    pptxStackManuscriptBlocks(
      slide,
      [...sections.slice(half), ...visualColumns.right.map((visual) => ({ data: visual, kind: "visual" }))],
      rightX, top, colWidth, bottom,
    );
  });
}

function spreadsToPptx(entry) {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "SPREAD", width: 13.33, height: 7.5 });
  pres.layout = "SPREAD";
  addEntrySlidesToPptx(pres, entry);
  return pres;
}

function draftBatchesToPptx(rounds) {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "SPREAD", width: 13.33, height: 7.5 });
  pres.layout = "SPREAD";
  rounds.forEach(({ roundNumber, batch }) => {
    batch.entries.forEach((entry) => addEntrySlidesToPptx(pres, entry, `${roundNumber}회차 · `));
  });
  return pres;
}

function sanitizeZipEntryName(name) {
  return String(name || "").replace(/[\\/:*?"<>|]/g, "_").trim() || "무제";
}

// entry.spreads[*].textbook_manuscript.visuals(외부 AI 제공자만 실제 이미지를 채움)에서
// 삽화 원본 PNG만 모은다 — PPT/미리보기용 와이어프레임이 아니라 gpt-image-2가 그린 실제 파일.
function entryVisualImages(entry) {
  const images = [];
  (entry.spreads || []).forEach((spread, spreadIndex) => {
    const columns = manuscriptVisualColumns(spread.textbook_manuscript || {});
    [["left", "좌"], ["right", "우"]].forEach(([side, sideLabel]) => {
      (columns[side] || []).forEach((visual, visualIndex) => {
        if (!visual.imageBase64) return;
        images.push({
          base64: visual.imageBase64,
          filename: `${String(spreadIndex + 1).padStart(2, "0")}_${sideLabel}_${visualIndex + 1}.png`,
        });
      });
    });
  });
  return images;
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function buildEntryImagesZip(entry) {
  const images = entryVisualImages(entry);
  if (!images.length) return null;
  const zip = new JSZip();
  images.forEach((image) => zip.file(image.filename, image.base64, { base64: true }));
  return zip.generateAsync({ type: "blob" });
}

const DRAFT_FILE_TYPES = [
  { id: "pptx", label: "PPT" },
  { id: "textbook", label: "교과서 TXT" },
  { id: "textbook_pdf", label: "교과서 PDF" },
  { id: "images", label: "이미지" },
];

function canvasPagesToPdfBlob(canvases) {
  const { jsPDF } = globalThis.jspdf;
  // 가로로 그린 쪽(캔버스 폭 > 높이)은 가로 A4로 넣는다.
  const sizeOf = (canvas) => (canvas.width > canvas.height ? [1123, 794] : [794, 1123]);
  const first = sizeOf(canvases[0]);
  const pdf = new jsPDF({ unit: "px", format: first, orientation: first[0] > first[1] ? "landscape" : "portrait", compress: true });
  canvases.forEach((canvas, index) => {
    const [width, height] = sizeOf(canvas);
    if (index > 0) pdf.addPage([width, height], width > height ? "landscape" : "portrait");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, width, height);
  });
  return pdf.output("blob");
}

// 교수학습과정안(HWPX)은 서버의 hwpx_export.build_hwpx로 만든다 — 클라이언트가 이미 갖고
// 있는 지도서 데이터(teacher_guide)를 그대로 보내면 서버가 교사들이 흔히 쓰는 지도안
// 표 형식(단계·교수학습활동·시간, 발문·예상답변, 평가계획 등)으로 정리해 HWPX로 반환한다.
async function fetchLessonPlanHwpxBlob(entry) {
  const spreads = entry.spreads.map((spread, index) => {
    const guide = spread.teacher_guide || {};
    return {
      spreadLabel: `${spread.lesson_label || `${index + 1}차시군`} · 교과서 ${spread.left_page}~${spread.right_page}쪽`,
      lessonGoals: guide.lessonGoals || [],
      preparation: guide.preparation || [],
      lessonFlow: guide.lessonFlow || [],
      teachingNotes: guide.teachingNotes || [],
      questions: guide.questions || [],
      expectedResponses: guide.expectedResponses || [],
      differentiation: guide.differentiation || [],
      safety: guide.safety || "",
      assessment: guide.assessment || [],
    };
  });
  const response = await fetch("/api/prototype/lesson-plan-hwpx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      unitLabel: entry.smallUnitLabel,
      frameworkName: entry.frameworkName,
      carrierSport: entry.carrierSport,
      standardCodes: entry.traceability?.standardCodes || [],
      spreads,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `교수학습과정안 생성에 실패했습니다(HTTP ${response.status}).`);
  }
  return response.blob();
}

function entryHasFileType(entry, type) {
  if (type === "images") return entryVisualImages(entry).length > 0;
  return true;
}

async function addEntryFileToZipFolder(folder, entry, type) {
  const safeName = sanitizeZipEntryName(entry.frameworkName);
  if (type === "pptx") {
    const pres = spreadsToPptx(entry);
    const blob = await pres.write({ outputType: "blob" });
    folder.file(`${safeName}.pptx`, blob);
  } else if (type === "textbook") {
    folder.file(`${safeName}_교과서원고.txt`, textbookManuscriptText(entry));
  } else if (type === "guide") {
    folder.file(`${safeName}_지도서원고.txt`, teacherGuideManuscriptText(entry));
  } else if (type === "textbook_pdf") {
    folder.file(`${safeName}_교과서원고.pdf`, canvasPagesToPdfBlob(buildTextbookManuscriptPdfPages(entry)));
  } else if (type === "guide_pdf") {
    folder.file(`${safeName}_지도서원고.pdf`, canvasPagesToPdfBlob(buildTeacherGuideManuscriptPdfPages(entry)));
  } else if (type === "lesson_plan_hwpx") {
    folder.file(`${safeName}_교수학습과정안.hwpx`, await fetchLessonPlanHwpxBlob(entry));
  } else if (type === "images") {
    const images = entryVisualImages(entry);
    if (!images.length) return;
    const imageFolder = folder.folder("이미지");
    images.forEach((image) => imageFolder.file(image.filename, image.base64, { base64: true }));
  }
}

// fileKeys: "{batchIndex}:{entryIndex}:{type}" 문자열 배열 — 리스트의 개별 체크박스 선택,
// 또는 "유형별 전체 다운로드"에서 한 타입만 모아 전달한다. 회차별 폴더 아래 체제 폴더를
// 두고(체제가 1개면 회차 폴더에 바로) 선택된 타입의 파일만 채운다.
async function buildFilesZip(fileKeys) {
  const zip = new JSZip();
  for (const key of fileKeys) {
    const [batchIndexText, entryIndexText, type] = key.split(":");
    const batchIndex = Number(batchIndexText);
    const entryIndex = Number(entryIndexText);
    const batch = state.frameworkDraftLog[batchIndex];
    const entry = batch?.entries?.[entryIndex];
    if (!batch || !entry || !entryHasFileType(entry, type)) continue;
    const batchFolder = zip.folder(`${batchIndex + 1}회차_${sanitizeZipEntryName(batch.smallUnitLabel)}`);
    const entryFolder = batch.entries.length > 1 ? batchFolder.folder(sanitizeZipEntryName(entry.frameworkName)) : batchFolder;
    await addEntryFileToZipFolder(entryFolder, entry, type);
  }
  return zip.generateAsync({ type: "blob" });
}

async function buildTypeOnlyZip(type) {
  const keys = [];
  (state.frameworkDraftLog || []).forEach((batch, batchIndex) => {
    batch.entries.forEach((entry, entryIndex) => {
      if (entryHasFileType(entry, type)) keys.push(`${batchIndex}:${entryIndex}:${type}`);
    });
  });
  return buildFilesZip(keys);
}

// renderFrameworks()의 예전 회차 단위 목록(선택 다운로드)은 그대로 회차 인덱스만 받는다 —
// 그 회차에 속한 모든 체제·모든 파일 타입을 buildFilesZip에 넘겨 동일한 zip 구조로 만든다.
async function buildSelectedDraftsZip(batchIndices) {
  const keys = [];
  batchIndices.forEach((batchIndex) => {
    const batch = state.frameworkDraftLog[batchIndex];
    if (!batch) return;
    batch.entries.forEach((entry, entryIndex) => {
      DRAFT_FILE_TYPES.forEach((type) => {
        if (entryHasFileType(entry, type.id)) keys.push(`${batchIndex}:${entryIndex}:${type.id}`);
      });
    });
  });
  return buildFilesZip(keys);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function allocateCounts(total, weights) {
  if (total <= 0) return weights.map(() => 0);
  const sum = weights.reduce((acc, value) => acc + Math.max(0, value), 0) || weights.length;
  const raw = weights.map((value) => total * (Math.max(0, value) || (sum === weights.length ? 1 : 0)) / sum);
  const counts = raw.map(Math.floor);
  let remainder = total - counts.reduce((acc, value) => acc + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - counts[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let index = 0; index < remainder; index += 1) counts[order[index % order.length].index] += 1;
  return counts;
}

// ── 기준 쪽수에 맞춘 기본 배분 ──
// 01단계 "본문·부록 합계"와 "부속자료"를 목표로, 03단계 기본값을 미리 맞춘다.
// · 부속자료(앞·뒷부속): 흔히 쓰는 항목을 차례로 더하고, 넘치면 뒤에서부터 줄인다.
// · 본문·부록: 단원 도입·마무리·특별 페이지·부록은 그대로 두고, 남은 쪽을 소단원에 펼침면(2쪽) 단위로
//   차시가 많은 소단원부터 더 준다(소단원 최소 2쪽). 홀수로 남는 1쪽은 부록에 붙인다.
const FRONT_MATTER_DEFAULTS = [["속표지", 1], ["이 책의 구성과 특징", 2], ["차례", 2]];
const BACK_MATTER_DEFAULTS = [["찾아보기", 2], ["사진·자료 출처", 1], ["판권", 1]];

function lineItemsToText(items) {
  return items.filter((item) => item.pages > 0).map((item) => `${item.title}, ${item.pages}`).join("\n");
}

function fitSupplementaryPages(book) {
  const target = Math.max(0, Number(book.project.supplementaryPages) || 0);
  const front = parseLineItems(book.frontMatterText);
  const back = parseLineItems(book.backMatterText);
  const total = () => [...front, ...back].reduce((sum, item) => sum + item.pages, 0);
  const has = (items, title) => items.some((item) => item.title.replace(/\s/g, "").includes(title.replace(/\s/g, "")) || title.replace(/\s/g, "").includes(item.title.replace(/\s/g, "")));
  const candidates = [];
  for (let index = 0; index < Math.max(FRONT_MATTER_DEFAULTS.length, BACK_MATTER_DEFAULTS.length); index += 1) {
    if (FRONT_MATTER_DEFAULTS[index]) candidates.push([front, ...FRONT_MATTER_DEFAULTS[index]]);
    if (BACK_MATTER_DEFAULTS[index]) candidates.push([back, ...BACK_MATTER_DEFAULTS[index]]);
  }
  for (const [items, title, pages] of candidates) {
    const missing = target - total();
    if (missing <= 0) break;
    if (!has(items, title)) items.push({ title, pages: Math.min(pages, missing) });
  }
  if (total() < target) {
    const filler = front.length ? front[front.length - 1] : (front.push({ title: "차례", pages: 0 }), front[0]);
    filler.pages += target - total();
  }
  for (const items of [back, front]) {
    for (let index = items.length - 1; index >= 0 && total() > target; index -= 1) {
      items[index].pages -= Math.min(items[index].pages, total() - target);
    }
  }
  book.frontMatterText = lineItemsToText(front);
  book.backMatterText = lineItemsToText(back);
}

function fitCorePages(book) {
  const target = Math.max(0, Number(book.project.corePages) || 0);
  const smallUnits = (book.units || []).flatMap((unit) => unit.subdomainGroups.flatMap((group) => group.middleUnits.flatMap((middle) => middle.smallUnits)));
  if (!target || !smallUnits.length) return;
  const introWrap = (book.units || []).reduce((sum, unit) => sum + Number(unit.introPages || 0) + Number(unit.wrapUpPages || 0), 0);
  const appendix = parseLineItems(book.appendixText);
  const appendixTotal = appendix.reduce((sum, item) => sum + item.pages, 0);
  const forSmallUnits = target - introWrap - specialPagesTotal(book) - appendixTotal;
  if (forSmallUnits < smallUnits.length * 2) return;
  const extraSpreads = Math.floor((forSmallUnits - smallUnits.length * 2) / 2);
  const counts = allocateCounts(extraSpreads, smallUnits.map((small) => Number(small.hours) || 1));
  smallUnits.forEach((small, index) => { small.pages = 2 + counts[index] * 2; });
  const leftover = forSmallUnits - smallUnits.reduce((sum, small) => sum + small.pages, 0);
  if (leftover > 0) {
    if (appendix.length) appendix[appendix.length - 1].pages += leftover;
    else appendix.push({ title: "부록", pages: leftover });
    book.appendixText = lineItemsToText(appendix);
  }
}

function fitBookPagesToTargets(book) {
  if (!pagePolicyFor(book) || !book.units?.length) return false;
  fitSupplementaryPages(book);
  fitCorePages(book);
  book.pages = buildPagePlan(book);
  book.selectedPages = [1];
  return true;
}

// 기본값이 기준 쪽수와 안 맞는 책은 처음 한 번 자동으로 맞춘다(이후 편집자가 고친 값은 건드리지 않음).
const PAGE_FIT_VERSION = 1;
function ensurePagesFitTargets(book) {
  if (!book || book.pageFitVersion === PAGE_FIT_VERSION) return false;
  const changed = fitBookPagesToTargets(book);
  book.pageFitVersion = PAGE_FIT_VERSION;
  return changed;
}

function buildPagePlan(targetState = state) {
  const pages = [];
  const placedSpecialIds = new Set();
  const addPage = (area, unit, type, group, status = "배정") => {
    pages.push({ number: pages.length + 1, area, unit, type, group, status });
  };

  parseLineItems(targetState.frontMatterText).forEach((item) => {
    for (let index = 0; index < item.pages; index += 1) addPage("앞부속", item.title, "앞부속", "앞부속");
  });

  targetState.units.forEach((unit, unitIndex) => {
    const largeNumber = unitNumberLabel(unitIndex);
    const group = `대단원 ${largeNumber} · ${unit.domain}`;
    for (let index = 0; index < Number(unit.introPages || 0); index += 1) {
      addPage(unit.domain, `${largeNumber}. ${unit.domain} 도입`, "단원 도입", group);
    }
    unit.subdomainGroups.forEach((subGroup, groupIndex) => {
      subGroup.middleUnits.forEach((middle, middleIndex) => {
        const middlePosition = middleUnitPosition(unit, groupIndex, middleIndex);
        middle.smallUnits.forEach((small, smallIndex) => {
          const smallNumber = unitNumberLabel(unitIndex, middlePosition, smallIndex + 1);
          for (let index = 0; index < Number(small.pages || 0); index += 1) {
            addPage(unit.domain, `${smallNumber}. ${small.title}`, "본문", group);
          }
        });
      });
    });
    (targetState.specialPages || []).filter((page) => page.domain === unit.domain).forEach((page) => {
      for (let index = 0; index < Math.max(0, Number(page.pages) || 0); index += 1) {
        addPage(unit.domain, page.title, sportsCultureSpecialPageTypeLabel(page.type), group);
      }
      placedSpecialIds.add(page.id);
    });
    for (let index = 0; index < Number(unit.wrapUpPages || 0); index += 1) {
      addPage(unit.domain, `${largeNumber}. ${unit.domain} 마무리`, "마무리", group);
    }
  });

  (targetState.specialPages || []).filter((page) => !placedSpecialIds.has(page.id)).forEach((page) => {
    for (let index = 0; index < Math.max(0, Number(page.pages) || 0); index += 1) {
      addPage(page.domain || "특별 페이지", page.title, sportsCultureSpecialPageTypeLabel(page.type), "특별 페이지");
    }
  });

  parseLineItems(targetState.backMatterText).forEach((item) => {
    for (let index = 0; index < item.pages; index += 1) addPage("뒷부속", item.title, "뒷부속", "뒷부속");
  });

  parseLineItems(targetState.appendixText).forEach((item) => {
    for (let index = 0; index < item.pages; index += 1) addPage("부록", item.title, "부록", "부록");
  });

  return pages;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// 대단원·앞뒤부속을 배경색만으로 구분하면 한눈에 안 들어온다는 피드백이 있어, 연속된
// 같은 구성(group)끼리 묶어 구간 제목(쪽수 범위 포함)을 먼저 보여주고 그 아래에 셀을 둔다.
function groupPagePlanForPreview(preview) {
  const sections = [];
  preview.forEach((page) => {
    const last = sections[sections.length - 1];
    if (last && last.group === page.group) {
      last.pages.push(page);
    } else {
      sections.push({ group: page.group, pages: [page] });
    }
  });
  return sections;
}

function renderPagePreviewModal() {
  if (!pagePreviewOpen) return "";
  const preview = buildPagePlan(state);
  const sections = groupPagePlanForPreview(preview);
  return `
    <div class="modal-overlay" id="pagePreviewOverlay">
      <div class="modal-box">
        <header>
          <h3>배열표 미리보기 · 총 ${preview.length}쪽</h3>
          <div class="section-actions">
            <button class="secondary-button" id="downloadPagePlanButton" type="button">배열표 다운로드</button>
            <button class="secondary-button" id="closePagePreview" type="button" aria-label="배열표 미리보기 닫기, Esc 키 사용 가능">닫기 · Esc</button>
          </div>
        </header>
        <p class="bulk-edit-note">3단계에 입력한 쪽수 배정으로 만든 확인용 미리보기입니다. 인쇄 시 8쪽 단위(전지)로 지면을 세므로, 한 줄에 8쪽씩 앞부속부터 부록까지 이어서 배치했습니다.</p>
        <div class="page-grid">
          ${sections.map((section) => `
            <div class="page-plan-section-header" data-area="${escapeHtml(section.pages[0].area)}">
              <b>${escapeHtml(section.group)}</b>
              <span>${section.pages[0].number}~${section.pages[section.pages.length - 1].number}쪽 · ${section.pages.length}쪽</span>
            </div>
            ${section.pages.map((page) => `
              <div class="page-cell" data-area="${escapeHtml(page.area)}" title="${escapeHtml(page.unit)} · ${page.type}">
                <b>${page.number}쪽</b><span>${escapeHtml(page.type)}</span>
              </div>`).join("")}`).join("")}
        </div>
      </div>
    </div>`;
}

function renderNavigation() {
  document.querySelector("#stepNavigation").innerHTML = steps.map(([defaultLabel], index) => {
    const label = defaultLabel;
    return `
    <button class="prototype-step ${index === state.currentStep ? "active" : ""} ${index < state.currentStep ? "completed" : ""}" data-step="${index}" type="button">
      <span class="step-index">${String(index + 1).padStart(2, "0")}</span>
      <b>${label}</b>
      <small>${index < state.currentStep ? "✓" : ""}</small>
    </button>
  `; }).join("");
  document.querySelectorAll("[data-step]").forEach((button) => {
    button.addEventListener("click", () => goToStep(Number(button.dataset.step)));
  });
}

function renderHeader() {
  let [heading, subtitle] = steps[state.currentStep];
  if (usesDraftStudio() && state.currentStep === DRAFT_STEP_INDEX) {
    heading = "초안·시안·조판";
    subtitle = isSportsCultureProject()
      ? "전체 편집 방향을 정하고 소단원과 특별 페이지의 초고를 단일 또는 일괄 생성합니다."
      : "전체 편집 방향을 정하고 소단원·대단원 도입·마무리·확장 코너 초고를 차시 구조에 맞춰 단일 또는 일괄 생성합니다.";
  }
  document.querySelector("#stepHeading").textContent = heading;
  document.querySelector("#previousButton").disabled = state.currentStep === 0;
  const nextButton = document.querySelector("#nextButton");
  nextButton.style.display = state.currentStep === steps.length - 1 ? "none" : "";
  nextButton.textContent = state.currentStep === steps.length - 1 ? "완료" : "다음";
}

function sectionHeading(kicker, title, description, action = "") {
  return action ? `<div class="section-heading actions-only"><div class="section-actions">${action}</div></div>` : "";
}

function renderEditableSource(sourceId, label, suppliedOriginalText) {
  if (suppliedOriginalText !== undefined) sourceExcerpts[sourceId] = suppliedOriginalText;
  const originalText = sourceExcerpts[sourceId] || "";
  const versions = sourceCorrections[sourceId]?.versions || [];
  const currentText = versions.at(-1)?.text || originalText;
  const currentVersion = versions.length;
  const isEditing = editingSourceId === sourceId;
  const history = [
    { text: originalText, note: "전처리 추출 원문", savedAt: null },
    ...versions,
  ];
  return `
    <div class="editable-source">
      <div class="source-heading">
        <p class="evidence-label">${label}${currentVersion ? ` · 수정본 v${currentVersion}` : ""}</p>
        ${isEditing ? "" : `<button class="source-edit-button" data-edit-source="${sourceId}" type="button">수정</button>`}
      </div>
      ${isEditing ? `
        <div class="source-inline-editor">
          <textarea data-inline-source="${sourceId}" rows="7">${escapeHtml(currentText)}</textarea>
          <input data-inline-note="${sourceId}" placeholder="수정 이유 또는 확인 메모" />
          <div><button class="secondary-button" data-cancel-source="${sourceId}" type="button">취소</button><button class="primary-button" data-save-source="${sourceId}" type="button">수정 저장</button></div>
        </div>`
        : `<blockquote class="source-excerpt">${escapeHtml(currentText).replaceAll("\n", "<br>")}</blockquote>`}
      ${versions.length ? `
        <details class="source-history">
          <summary>원본 및 수정 이력 ${history.length}개</summary>
          <div>
            ${history.map((item, index) => `
              <article>
                <header><b>v${index}${index === history.length - 1 ? " · 현재" : ""}</b><span>${item.savedAt ? new Date(item.savedAt).toLocaleString("ko-KR") : "전처리 원문"}</span></header>
                <p>${escapeHtml(item.note || "수정 메모 없음")}</p>
                <pre>${escapeHtml(item.text)}</pre>
                ${index === history.length - 1 ? "" : `<button class="secondary-button" data-restore-source="${sourceId}" data-version-index="${index - 1}" type="button">이 버전으로 복원</button>`}
              </article>`).join("")}
          </div>
        </details>` : ""}
    </div>`;
}

function renderProject() {
  const portfolio = activeProject();
  const representative = Object.values(portfolio.books)[0];
  if (isPlaceholderProject(portfolio)) {
    const placeholderBookCards = Object.values(portfolio.books).map((book) => `<article class="setup-book-card invalid"><header><div><span>교과서 기본값</span><h3>${escapeHtml(book.project.subject)}</h3></div><b>공식자료 미연결</b></header><div class="setup-book-fields"><label><span>교과서·부록 합계</span><input placeholder="공식 분량 자료 필요" disabled /></label><label><span>부속자료</span><input placeholder="확인되지 않음" disabled /></label><label><span>공식 기준 시수</span><input value="${book.project.targetHours || ""}" placeholder="확인되지 않음" disabled /></label></div></article>`).join("");
    return `
      ${sectionHeading("PROJECT PROFILE", "프로젝트 기본 조건", "교육과정의 체육 관련 과목 목록에서 선택했습니다. 공식 편찬 기준 데이터가 연결되면 쪽수·차시가 자동 입력됩니다.")}
      <div class="setup-book-grid ${isPairedProject(portfolio) ? "paired" : "single"}">${placeholderBookCards}</div>
      <div class="validation-box invalid"><strong>공식 편찬 기준 자료가 연결되기 전에는 다음 단계로 이동할 수 없습니다.</strong><ul><li>선택한 과목의 쪽수·차시 편찬 기준이 현재 전처리 자료에서 확인되지 않았습니다.</li></ul></div>`;
  }
  const isElementary = portfolio.type === "elementary-band";
  const isMiddleBand = portfolio.type === "middle-pe-band";
  const isPaired = isPairedProject(portfolio);
  const policy = isElementary ? pagePolicies.elementary_pe : pagePolicyFor(representative);
  const courseMeta = isElementary || isMiddleBand ? null : courseMetaFor(representative);
  const validation = projectSetupValidation(portfolio);
  const approval = portfolio.setupApproval;
  const editable = setupIsEditable(portfolio);
  const statusLabels = { draft: "편집 중", pending: "팀장 승인 대기", approved: `승인 완료 · v${approval.version}` };
  const bookCards = Object.entries(portfolio.books).map(([bookKey, book]) => {
    const result = validation.bookResults[bookKey];
    const totals = result.totals;
    const sports = isHighSchoolProject(book);
    const bookCourseMeta = sports ? courseMetaFor(book) : null;
    return `
      <article class="setup-book-card ${result.valid ? "valid" : "invalid"}">
        <header>
          <div><span>${isPaired ? "분권 교과서" : "단권 교과서"}</span><h3>${escapeHtml(bookKey)} <strong class="book-total-badge">${totals.total}쪽 · ${book.project.targetHours}차시</strong></h3></div>
          <b>${result.valid ? "기준 충족" : "확인 필요"}</b>
        </header>
        <div class="setup-book-fields">
          <label><span>${sports ? "교과서·부록 합계" : "본문·부록 합계"}</span><input data-setup-book-field="${bookKey}:corePages" type="number" min="${policy.minimum_pages}" max="${policy.maximum_pages}" value="${book.project.corePages}" ${editable ? "" : "disabled"} /></label>
          <label><span>부속자료${sports ? " (임시)" : ""}</span><input data-setup-book-field="${bookKey}:supplementaryPages" type="number" min="0" ${isElementary ? `max="${policy.supplementary_maximum_pages}"` : ""} value="${book.project.supplementaryPages}" ${editable ? "" : "disabled"} /></label>
          <label><span>기준 차시</span><input data-setup-book-field="${bookKey}:targetHours" type="number" min="${sports ? bookCourseMeta.minimum_hours : 1}" max="${sports ? bookCourseMeta.maximum_hours : policy.group_hours}" value="${book.project.targetHours}" ${editable ? "" : "disabled"} /></label>
        </div>
        ${result.errors.length ? `<ul class="setup-errors">${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : ""}
      </article>`;
  }).join("");
  const approvalActions = approval.status === "draft"
    ? `<button class="primary-button" id="requestSetupApproval" type="button" ${validation.valid ? "" : "disabled"}>팀장 승인 요청</button>`
    : approval.status === "pending"
      ? `<button class="secondary-button" id="cancelSetupApproval" type="button">요청 취소</button><button class="primary-button" id="approveSetup" type="button">팀장 승인</button>`
      : `<button class="secondary-button" id="reviseSetup" type="button">수정본 만들기</button>`;
  return `
    ${sectionHeading("PROJECT PROFILE", "프로젝트 기본 조건", "")}
    <div class="official-policy-banner ${isMiddleBand ? "unverified" : ""}">
      ${isMiddleBand ? `<div class="policy-banner-title">공식 쪽수 자료 미연결 — 직접 입력한 값입니다</div>` : ""}
      <div class="policy-stat-grid">
        ${(isElementary ? [
          { label: "교과서·부록 기준", value: `${policy.baseline_pages}쪽`, note: `허용 ${policy.minimum_pages}~${policy.maximum_pages}쪽` },
          { label: "부속자료", value: `0~${policy.supplementary_maximum_pages}쪽` },
          { label: "학년군 기준 시수", value: `${policy.group_hours}시간` },
          { label: "현재 두 책 합계", value: `${Object.values(portfolio.books).reduce((sum, book) => sum + Number(book.project.targetHours || 0), 0)}차시` },
        ] : isMiddleBand ? [
          { label: "학년군 기준 시수", value: `${policy.group_hours}시간`, note: "중학교 1~3학년 합계" },
          { label: "현재 두 책 합계", value: `${Object.values(portfolio.books).reduce((sum, book) => sum + Number(book.project.targetHours || 0), 0)}차시` },
        ] : [
          { label: "교과서·부록 기준", value: `${policy.baseline_pages}쪽`, note: `허용 ${policy.minimum_pages}~${policy.maximum_pages}쪽` },
          { label: "부속자료", value: "0쪽", note: "편집자 임시값 · 공식 기준 미확인" },
          { label: "기본 수업량", value: `${courseMeta.default_hours}차시`, note: `${courseMeta.credits}학점 × ${courseMeta.lessons_per_credit}회` },
          { label: "허용 범위", value: `${courseMeta.minimum_hours}~${courseMeta.maximum_hours}차시` },
        ]).map((stat) => `
          <div class="policy-stat">
            <span>${stat.label}</span>
            <b>${stat.value}</b>
            ${stat.note ? `<small>${stat.note}</small>` : ""}
          </div>`).join("")}
      </div>
    </div>
    <div class="setup-book-grid ${isPaired ? "paired" : "single"}">${bookCards}</div>
    <div class="validation-box ${validation.valid ? "valid" : "invalid"}">
      <strong>${validation.valid ? "✓ 모든 책의 쪽수·차시 조건이 기준을 충족합니다." : "다음 단계로 이동하기 전에 설정값을 확인해 주세요."}</strong>
      ${validation.errors.length ? `<ul>${validation.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : ""}
    </div>
    <div class="setup-approval-bar"><div><b>설정 승인</b><strong class="setup-status ${approval.status}">${approval.status === "approved" ? "승인 완료" : statusLabels[approval.status]}</strong></div><div>${approvalActions}</div></div>
    ${isElementary ? `<div class="evidence-grid">
      <details data-evidence-details ${evidenceDetailsOpen ? "open" : ""}><summary>쪽수·차시 근거 한 번에 보기</summary>
        <div class="combined-evidence-grid">
          <section class="combined-evidence-section"><h4>쪽수와 부속자료 근거</h4><p class="evidence-label">자료 색인</p><p>「${escapeHtml(policy.source_document_id)}」 · PDF ${policy.source_page}쪽 · 인쇄면 ${policy.source_printed_page}쪽</p>${renderEditableSource("criteria-page-19", "전처리 추출 원문")}<p>「${escapeHtml(policy.supplementary_source_document_id)}」 · PDF 4~${policy.supplementary_source_page}쪽 · OCR 원본 대조 필요</p><div class="calculation-box"><b>책별 최대 합계</b><span>${policy.maximum_pages} + ${policy.supplementary_maximum_pages} = ${policy.maximum_pages + policy.supplementary_maximum_pages}쪽</span></div></section>
          <section class="combined-evidence-section"><h4>학년군 204시간 근거</h4><p>「${escapeHtml(policy.hours_source_document_id)}」 · PDF ${policy.hours_source_page}쪽 · 인쇄면 ${policy.hours_source_printed_page}쪽</p>${renderEditableSource("elementary-pe-group-hours-banner", "전처리 추출 원문", "체육 3~4학년군 및 5~6학년군 기준 수업 시수는 각각 204시간이다. 학년별 배분은 프로젝트에서 조정한다.")}</section>
        </div>
      </details>
    </div>` : isMiddleBand ? `<div class="evidence-grid">
      <details data-evidence-details ${evidenceDetailsOpen ? "open" : ""}><summary>쪽수·차시 근거 한 번에 보기</summary>
        <div class="combined-evidence-grid">
          <section class="combined-evidence-section"><h4>쪽수 근거</h4><p class="source-page-warning">중학교 체육 교과서의 분권·분량 기준은 관련 편찬자료 연결 후 적용합니다. 현재는 공식 분량 자료가 연결되지 않아 직접 입력한 값입니다.</p>${renderEditableSource("middle-pe-pages", "전처리 추출 원문 (미연결)", "관련 편찬자료 연결 후 원문을 이곳에 채워 넣습니다.")}</section>
          <section class="combined-evidence-section"><h4>기준 시수 근거</h4><p>「${escapeHtml(secondaryCourses["중등 체육"]?.hours_source_document_id || "초·중등학교 교육과정 총론")}」 · PDF 원본 ${secondaryCourses["중등 체육"]?.hours_source_page || 28}쪽 · 문서 인쇄면 ${secondaryCourses["중등 체육"]?.hours_source_printed_page || 20}쪽 · 중학교 시간 배당 기준 &lt;표 2&gt;</p>${renderEditableSource("middle-pe-hours", "전처리 추출 원문", secondaryCourses["중등 체육"]?.hours_excerpt || "체육 272시간")}</section>
        </div>
      </details>
    </div>` : `<div class="evidence-grid">
      <details data-evidence-details ${evidenceDetailsOpen ? "open" : ""}><summary>쪽수·차시 근거 한 번에 보기</summary>
        <div class="combined-evidence-grid">
          ${Object.entries(portfolio.books).map(([bookKey, book]) => {
            const bookPolicy = pagePolicyFor(book);
            const bookMeta = courseMetaFor(book);
            const sourceSuffix = isPaired ? `-${bookKey}` : "";
            return `
          <section class="combined-evidence-section"><h4>${escapeHtml(book.project.subject)} 쪽수 근거</h4><p>「${escapeHtml(bookPolicy.source_document_id)}」 · 원본 인쇄면 ${escapeHtml(bookPolicy.source_printed_pages || "20~45")}쪽 · ${escapeHtml(bookPolicy.source_location)}</p><p class="source-page-warning">${escapeHtml(bookPolicy.source_page_note || "HWP 목차에서 확인한 고등학교 체육 전체 범위입니다. 과목별 소제목과 원문을 함께 대조해 주세요.")}</p>${renderEditableSource(`high-recognition-${portfolio.catalogId}${sourceSuffix}`, "전처리 추출 원문", bookPolicy.excerpt)}</section>
          <section class="combined-evidence-section"><h4>${escapeHtml(book.project.subject)} 학점과 차시 근거</h4><p>「${escapeHtml(bookMeta.hours_source_document_id)}」 · PDF 원본 ${bookMeta.hours_source_page}쪽 · 문서 인쇄면 ${bookMeta.hours_source_printed_page}쪽 · ${escapeHtml(bookMeta.hours_source_location)}</p>${renderEditableSource(`high-hours-${portfolio.catalogId}${sourceSuffix}`, "전처리 추출 원문", bookMeta.hours_excerpt)}</section>`;
          }).join("")}
        </div>
      </details>
    </div>`}`;
}

function renderProjectSwitcher() {
  const project = activeProject();
  const container = document.querySelector("#projectSwitcher");
  const bookKeys = Object.keys(project.books);
  const catalogId = inferredCatalogId(project) || PROJECT_CATALOG[0].id;
  const activeCatalogItem = PROJECT_CATALOG.find((item) => item.id === catalogId);
  if (!selectedRevision) selectedRevision = activeCatalogItem?.revision || "2022";
  if (!selectedSubjectArea) selectedSubjectArea = activeCatalogItem?.subjectArea || PROJECT_CATALOG[0].subjectArea;
  // 2015·2009 개정은 분석만 있다. 책 프로젝트 목록은 그 개정에 분석 자료가 있는 것만 보여 준다.
  const analysisOnly = isAnalysisOnlyRevision();
  const analysisView = inAnalysisView();
  const shownCatalogId = analysisOnly ? analysisCatalogFor() : catalogId;
  const revisionCatalog = analysisOnly
    ? PROJECT_CATALOG.filter((item) => analysisProjectIds(selectedRevision).includes(item.id))
    : PROJECT_CATALOG.filter((item) => item.revision === selectedRevision);
  const subjectAreas = [...new Set(revisionCatalog.map((item) => item.subjectArea))];
  const visibleCatalog = revisionCatalog.filter((item) => item.subjectArea === selectedSubjectArea);
  const groups = ["초등학교", "중학교", "고등학교"];
  container.innerHTML = `
    <label for="curriculumRevisionSelect">교육과정</label>
    <select id="curriculumRevisionSelect" class="revision-select">${CURRICULUM_REVISIONS.map((revision) => {
      const available = PROJECT_CATALOG.some((item) => item.revision === revision.id) || hasRevisionReference(revision.id);
      return `<option value="${revision.id}" ${revision.id === selectedRevision ? "selected" : ""} ${available ? "" : "disabled"}>${escapeHtml(revision.label)}${revision.note ? ` · ${escapeHtml(revision.note)}` : ""}</option>`;
    }).join("")}</select>
    <label for="subjectAreaSelect">교과</label>
    <select id="subjectAreaSelect">${subjectAreas.map((area) => `<option value="${escapeHtml(area)}" ${area === selectedSubjectArea ? "selected" : ""}>${escapeHtml(area)}</option>`).join("")}</select>
    <label for="activeProjectSelect">책 프로젝트</label>
    <select id="activeProjectSelect">${groups.map((group) => {
      const itemsInGroup = visibleCatalog.filter((item) => item.group === group);
      if (!itemsInGroup.length) return "";
      return `<optgroup label="${group}">${itemsInGroup.map((item) => `<option value="${item.id}" ${item.id === shownCatalogId ? "selected" : ""}>${escapeHtml(item.label)}${analysisOnly || item.connected ? "" : item.partial ? " · 쪽수 기준 미연결" : " · 공식자료 미연결"}</option>`).join("")}</optgroup>`;
    }).join("")}</select>
    <div class="work-mode-tabs" role="tablist" aria-label="개발·분석">
      <button type="button" role="tab" data-work-mode="develop" class="${analysisView ? "" : "active"}" ${analysisOnly ? "disabled title=\"이 개정은 분석만 합니다\"" : ""}>개발</button>
      <button type="button" role="tab" data-work-mode="analysis" class="${analysisView ? "active" : ""}">분석</button>
    </div>
    ${!analysisView && isPairedProject(project) && state.currentStep > 0 ? `<div class="book-mode-tabs" aria-label="학년책과 비교 보기">
      ${bookKeys.map((bookKey) => `<button class="${project.viewMode === "book" && project.activeBookKey === bookKey ? "active" : ""}" data-book-key="${bookKey}" type="button">${bookKey.replace("학년", "")}</button>`).join("")}
      <button class="compare ${project.viewMode === "compare" ? "active" : ""}" id="compareBooksButton" type="button">${bookKeys.map((bookKey) => bookKey.replace("학년", "")).join("·")} 비교</button>
    </div>` : ""}`;

  container.querySelector("#curriculumRevisionSelect").addEventListener("change", (event) => {
    selectedRevision = event.target.value;
    if (isAnalysisOnlyRevision()) {
      render();
      return;
    }
    // 개정을 바꾸면 그 개정의 첫 번째 교과·프로젝트로 전환한다.
    const firstItem = PROJECT_CATALOG.find((item) => item.revision === selectedRevision);
    if (firstItem) {
      selectedSubjectArea = firstItem.subjectArea;
      const selectedProject = projectForCatalog(firstItem);
      if (!projectStore.projects.some((candidate) => candidate.id === selectedProject.id)) projectStore.projects.push(selectedProject);
      projectStore.activeProjectId = selectedProject.id;
      useActiveBookState();
      persist("교육과정 개정 전환됨");
    }
    render();
  });

  container.querySelector("#subjectAreaSelect").addEventListener("change", (event) => {
    selectedSubjectArea = event.target.value;
    // 교과를 바꾸면 그 교과의 첫 번째 항목으로 자동 전환한다(빈 목록 상태를 안 만들기 위함).
    const firstItem = PROJECT_CATALOG.find((item) => item.revision === selectedRevision && item.subjectArea === selectedSubjectArea);
    if (firstItem) {
      const selectedProject = projectForCatalog(firstItem);
      if (!projectStore.projects.some((candidate) => candidate.id === selectedProject.id)) projectStore.projects.push(selectedProject);
      projectStore.activeProjectId = selectedProject.id;
      useActiveBookState();
      persist("교과 전환됨");
    }
    render();
  });

  container.querySelectorAll("[data-work-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      workMode = button.dataset.workMode;
      render();
    });
  });

  container.querySelector("#activeProjectSelect")?.addEventListener("change", (event) => {
    if (isAnalysisOnlyRevision()) {
      analysisCatalogId = event.target.value;
      render();
      return;
    }
    persist();
    const item = PROJECT_CATALOG.find((candidate) => candidate.id === event.target.value);
    if (!item) return;
    const selectedProject = projectForCatalog(item);
    if (!projectStore.projects.some((candidate) => candidate.id === selectedProject.id)) projectStore.projects.push(selectedProject);
    projectStore.activeProjectId = selectedProject.id;
    useActiveBookState();
    persist("프로젝트 전환됨");
    render();
  });
  container.querySelectorAll("[data-book-key]").forEach((button) => {
    button.addEventListener("click", () => {
      const validation = pageValidation();
      if (!validation.valid && !validation.unavailable) {
        showToast("현재 학년책의 분량 기준을 먼저 맞춰 주세요.");
        return;
      }
      persist();
      project.activeBookKey = button.dataset.bookKey;
      project.viewMode = "book";
      useActiveBookState();
      persist("학년책 전환됨");
      render();
    });
  });
  container.querySelector("#compareBooksButton")?.addEventListener("click", () => {
    if (!Object.values(project.books).every((book) => {
      const validation = pageValidation(book);
      return validation.valid || validation.unavailable;
    })) {
      showToast("두 학년책의 분량 기준을 모두 맞춘 뒤 비교할 수 있습니다.");
      return;
    }
    project.viewMode = "compare";
    persist("비교 보기");
    render();
  });
}

function sportsCultureStandards() {
  return curriculumData.sports_culture_standards?.length
    ? curriculumData.sports_culture_standards
    : SPORTS_CULTURE_STANDARDS;
}

// 스포츠 문화는 2022 개정에서 신설된 과목이라 "이전 교육과정 대비 변화"가 초등처럼 단순
// 명칭 변경이 아닐 수 있다 — 실제 2009 개정 원문 대조로 확인한 내용만 담는다(과목 키로
// 조회, 없으면 카드 자체를 표시하지 않는다).
const SECONDARY_CURRICULUM_DEVELOPMENT_NOTES = {
  "스포츠 문화": {
    "스포츠 인문 문화": {
      changes: [
        { keyword: "예술성 탐구 범위 확장(문학·영화 포함)", detail: "2009 개정에도 동일 과목명 '스포츠 문화'가 있었고 그중 '스포츠 정신 문화' 영역(2009 개정 p.63~64)이 유사하나, 예술성 탐구가 '몸짓 자체의 미적 특성'에 국한됐던 반면 2022는 시·소설·영화 등 스포츠를 소재로 한 문학·예술 작품의 비교·창작으로 범위를 넓힘([12스문01-03], p.88)." },
        { keyword: "4단위·34주→1~2학점으로 압축", detail: "2009는 4단위·34주 편성 예시(2009 개정 p.73 <표8>)의 정규 선택 과목이었으나, 2022는 1~2학점(최대 32시간)의 진로 선택 과목으로 축소되어, 훨씬 압축된 분량 안에 역사·철학·문학예술·진로설계를 모두 다뤄야 함." },
      ],
      emphasis: [
        { keyword: "진로 설계는 실제 산출물로", detail: "[12스문01-03](p.88)은 문학과 예술을 '비교·분석'하고 진로를 '설계'하라고 명시하는데, 진로 정보 수집을 가벼운 카드 활동으로 끝내지 말고 실제 비교·비평 결과물과 구체적 진로 계획 산출물을 요구해야 함." },
        { keyword: "비판적 분석은 구체적 논쟁 사례로", detail: "[12스문01-02](p.88)의 '비판적 분석'은 역사 연대기 나열이 아닌 가치 판단을 요구하는데, 구체적 논쟁 사례(예: 고의 지연 플레이) 중심으로 다뤄야 추상화를 피할 수 있음." },
      ],
    },
    "스포츠 경기 문화": {
      changes: [
        { keyword: "경기 문화+축제 문화 통합", detail: "2009 개정에는 '스포츠 경기 문화'(2009 개정 p.63~65, 용어·규칙·역할·전략·운영)와 별도로 '스포츠 축제 문화'(2009 개정 p.65~66, 행사·미디어·팬덤)가 있었으나, 2022는 두 영역을 '스포츠 경기 문화' 하나로 통합·압축함([12스문02], p.90)." },
        { keyword: "대회 기획·운영 실행형 성취기준 신설", detail: "2009는 경기 규칙·전술의 '이해'에 머물렀으나, 2022는 대회를 직접 '기획·운영'하고 그 경험을 진로 설계로 연결하는 실행형 성취기준을 신설함([12스문02-02], p.90)." },
      ],
      emphasis: [
        { keyword: "기획서는 실제 운영 가능하게", detail: "[12스문02-02](p.90)는 물질·제도·관념문화 3요소를 반영한 대회 '기획과 운영'을 요구하므로, 대진표·규칙·역할분담이 포함된 실제 운영 가능한 기획서 산출물로 다뤄야 개념 설명에 그치지 않음." },
        { keyword: "역할에 AI·미디어까지 포함", detail: "[12스문02-01](p.90)의 '다양한 역할 참여'는 2009의 선수·감독·심판·운영자 역할에서 더 나아가, AI 판정·중계·미디어 콘텐츠 제작 등 기술·미디어 역할까지 포함해야 최신 스포츠 경기 문화를 반영함." },
      ],
    },
  },
};

function renderSecondaryCurriculum() {
  const meta = courseMetaFor();
  const standards = meta?.standards?.length ? meta.standards : sportsCultureStandards();
  const domains = [...new Set(standards.map((standard) => standard.domain))];
  const subject = state.project.subject;
  const selectedDomain = domains.includes(state.curriculumDomain) ? state.curriculumDomain : "전체";
  const visibleDomains = selectedDomain === "전체" ? domains : [selectedDomain];
  const sourcePages = standards.flatMap((item) => [item.source_page, item.explanation_source_page]).filter(Boolean);
  const pageRange = sourcePages.length ? `${Math.min(...sourcePages)}~${Math.max(...sourcePages)}쪽` : "확인 필요";
  const printedPageRange = sourcePages.length ? `${Math.min(...sourcePages) - 6}~${Math.max(...sourcePages) - 6}쪽` : "확인 필요";
  return `
    ${sectionHeading("CURRICULUM", `${subject} 교육과정 확인`, "", `<button class="secondary-button" id="downloadCurriculumButton" type="button">성취기준·고려사항 PDF</button>${SECONDARY_CURRICULUM_DEVELOPMENT_NOTES[subject] ? '<button class="secondary-button" id="downloadCurriculumNoteButton" type="button">분석 내용 PDF로 저장</button>' : ""}`)}
    <div class="band-overview">
      <div class="band-overview-row">
        <b class="band-overview-name">${escapeHtml(subject)} <small>${escapeHtml(meta.category)}</small></b>
        <span><small>학점</small> ${meta.credits}학점 <small>(${meta.minimum_credits}~${meta.maximum_credits})</small></span>
        <span><small>수업량</small> ${meta.default_hours}차시 <small>(허용 ${meta.minimum_hours}~${meta.maximum_hours})</small></span>
        <span><small>성취기준</small> ${standards.length}개 <small>(${domains.length}개 영역)</small></span>
        ${subject === "스포츠 문화" ? `<span><small>종목</small> 지정 없음 <small>(택 1 이상)</small></span>` : ""}
      </div>
    </div>
    <details class="curriculum-evidence">
      <summary>과목 분류·학점·성취기준 자료 색인 보기</summary>
      <p><b>과목 분류·학점:</b> 「${escapeHtml(meta.hours_source_document_id)}」 · PDF 원본 ${meta.hours_source_page}쪽 · 문서 인쇄면 ${meta.hours_source_printed_page}쪽 · ${escapeHtml(meta.hours_source_location)}</p>
      ${renderEditableSource(`curriculum-hours-${meta.catalog_id}`, "전처리 추출 원문", meta.hours_excerpt)}
      <p><b>성취기준·해설:</b> 「체육과 교육과정」 · PDF 원본 ${pageRange} · 문서 인쇄면 ${printedPageRange}</p>
    </details>
    <div class="curriculum-domain-tabs">
      ${["전체", ...domains].map((domain) => {
        const count = domain === "전체" ? standards.length : standards.filter((item) => item.domain === domain).length;
        return `<button class="${selectedDomain === domain ? "active" : ""}" data-curriculum-domain="${domain}" type="button">${domain} <span>${count}</span></button>`;
      }).join("")}
    </div>
    <div class="curriculum-domain-list">
      ${visibleDomains.map((domain) => {
        const developmentNote = SECONDARY_CURRICULUM_DEVELOPMENT_NOTES[subject]?.[domain];
        return `
        <section class="curriculum-domain-section">
          <header><span class="domain-badge ${domain}">${domain}</span><b>성취기준 ${standards.filter((item) => item.domain === domain).length}개</b></header>
          ${developmentNote ? `
            <div class="curriculum-development-note">
              <div>
                <b>이전 개정 대비</b>
                <ul>${renderDevelopmentNoteItems(developmentNote.changes)}</ul>
              </div>
              <div>
                <b>집필 시 강조할 점</b>
                <ul>${renderDevelopmentNoteItems(developmentNote.emphasis)}</ul>
              </div>
            </div>` : ""}
          <div class="curriculum-standard-list">
            ${standards.filter((item) => item.domain === domain).map((standard) => `
              <details class="curriculum-standard">
                <summary><b>${escapeHtml(standard.code)}</b><span>${escapeHtml(standard.statement)}</span><small>PDF ${standard.source_page || "확인"}쪽 · 인쇄면 ${standard.source_printed_page || (standard.source_page ? standard.source_page - 6 : "확인")}쪽</small></summary>
                ${renderEditableSource(`standard-${standard.code}-statement`, "성취기준 원문", standard.statement)}
                ${standard.explanation ? renderEditableSource(`standard-${standard.code}-explanation`, `성취기준 해설 · PDF ${standard.explanation_source_page || "확인"}쪽 · 인쇄면 ${standard.explanation_source_printed_page || (standard.explanation_source_page ? standard.explanation_source_page - 6 : "확인")}쪽`, standard.explanation) : ""}
              </details>`).join("")}
          </div>
        </section>`;
      }).join("")}
    </div>`;
}

function renderMiddleCurriculum() {
  const meta = secondaryCourses["중등 체육"];
  const standards = meta?.standards || [];
  const domains = [...new Set(standards.map((standard) => standard.domain))];
  const selectedDomain = domains.includes(state.curriculumDomain) ? state.curriculumDomain : "전체";
  const visibleDomains = selectedDomain === "전체" ? domains : [selectedDomain];
  const sourcePages = standards.flatMap((item) => [item.source_page, item.explanation_source_page]).filter(Boolean);
  const pageRange = sourcePages.length ? `${Math.min(...sourcePages)}~${Math.max(...sourcePages)}쪽` : "확인 필요";
  const printedPageRange = sourcePages.length ? `${Math.min(...sourcePages) - 6}~${Math.max(...sourcePages) - 6}쪽` : "확인 필요";
  return `
    ${sectionHeading("CURRICULUM", "중등체육 교육과정 확인", "", '<button class="secondary-button" id="downloadCurriculumButton" type="button">성취기준·고려사항 PDF</button>')}
    ${renderGradeBandOverview("중학교 1~3학년", `${meta?.hours || 272}시간`, standards.length, `${domains.length}개 영역 · 쪽수 기준 미연결`)}
    <details class="curriculum-evidence">
      <summary>기준 시수·성취기준 자료 색인 보기</summary>
      <p><b>기준 시수:</b> 「${escapeHtml(meta?.hours_source_document_id || "초·중등학교 교육과정 총론")}」 · PDF 원본 ${meta?.hours_source_page || 28}쪽 · 문서 인쇄면 ${meta?.hours_source_printed_page || 20}쪽 · 중학교 시간 배당 기준 &lt;표 2&gt;</p>
      ${renderEditableSource("middle-pe-hours-curriculum", "전처리 추출 원문", meta?.hours_excerpt || "체육 272시간")}
      <p><b>성취기준·해설:</b> 「체육과 교육과정」 · PDF 원본 ${pageRange} · 문서 인쇄면 ${printedPageRange}</p>
    </details>
    <div class="curriculum-domain-tabs">
      ${["전체", ...domains].map((domain) => {
        const count = domain === "전체" ? standards.length : standards.filter((item) => item.domain === domain).length;
        return `<button class="${selectedDomain === domain ? "active" : ""}" data-curriculum-domain="${domain}" type="button">${domain} <span>${count}</span></button>`;
      }).join("")}
    </div>
    <div class="curriculum-domain-list">
      ${visibleDomains.map((domain) => `
        <section class="curriculum-domain-section">
          <header><span class="domain-badge ${domain}">${domain}</span><b>성취기준 ${standards.filter((item) => item.domain === domain).length}개</b></header>
          <div class="curriculum-standard-list">
            ${standards.filter((item) => item.domain === domain).map((standard) => `
              <details class="curriculum-standard">
                <summary><b>${escapeHtml(standard.code)}</b><span>${escapeHtml(standard.statement)}</span><small>PDF ${standard.source_page || "확인"}쪽 · 인쇄면 ${standard.source_printed_page || (standard.source_page ? standard.source_page - 6 : "확인")}쪽</small></summary>
                ${renderEditableSource(`standard-${standard.code}-statement`, "성취기준 원문", standard.statement)}
                ${standard.explanation ? renderEditableSource(`standard-${standard.code}-explanation`, `성취기준 해설 · PDF ${standard.explanation_source_page || "확인"}쪽 · 인쇄면 ${standard.explanation_source_printed_page || (standard.explanation_source_page ? standard.explanation_source_page - 6 : "확인")}쪽`, standard.explanation) : ""}
              </details>`).join("")}
          </div>
        </section>`).join("")}
    </div>`;
}

// 2009 개정(현재 디지털화된 자료 중 가장 최근 이전 개정판) 체육과 교육과정 원문과
// 2022 개정 성취기준·고려사항을 직접 대조해 뽑은 내용 — 근거 쪽수를 각 항목에 그대로
// 남겨 편집자·집필자가 원문에서 바로 확인할 수 있게 한다. 초등만 다룬다(중·고는 별도
// 렌더러를 쓰고, 이 자료도 초등 원문 대조로 만들어졌다).
const CURRICULUM_DEVELOPMENT_NOTES = {
  "3~4학년군": {
    "운동": {
      changes: [
        { keyword: "'건강 활동'→'운동' 영역 통합", detail: "2009 개정 '건강 활동' 대영역(p.12~13)이 '운동' 영역으로 명칭이 바뀌고, 체력·건강이 6개 성취기준(2022 p.16)으로 통합됨." },
        { keyword: "안전사고 예방→태도로 압축", detail: "2009는 '가정의 안전사고 예방', '학교의 안전사고 예방'을 각각 별도 항목으로 명시했으나(p.13), 2022는 '안전하게 활동한다'([4체01-05], p.16)는 태도 수준으로 압축됨." },
      ],
      emphasis: [
        { keyword: "안전사고는 나열 말고 태도로 녹여 쓰기", detail: "가정·학교 안전사고 사례를 별도 단원처럼 나열하지 말고, 체력·건강 실천 내용 속 태도로 자연스럽게 녹여 쓸 것([4체01-05], p.16)." },
        { keyword: "운동·체력·건강, 하나의 흐름으로", detail: "체력과 건강을 별개로 설명하지 말고, 운동-체력-건강의 관계([4체01-01][4체01-03], p.16)를 하나의 흐름으로 연결해 서술할 것." },
      ],
    },
    "스포츠": {
      changes: [
        { keyword: "'피하기형 경쟁' 범주 폐지", detail: "2009의 '피하기형 경쟁'이라는 범주는 2022의 스포츠 분류 체계(기술형·전략형·생태형)에서 완전히 사라짐(2009 p.14, 2022 p.18~19)." },
        { keyword: "여가 활동→생태형 스포츠 흡수", detail: "2009 '여가 활동'(전통 놀이와 여가: 스케이팅·자전거·등산, p.15~16)에 속했던 자연 체험형 내용이, 2022에서는 '생태형 스포츠'([4체02-07], p.18~19)로 흡수됨." },
      ],
      emphasis: [
        { keyword: "종목 규칙보다 기본 움직임 먼저", detail: "축구·농구 같은 특정 구기 종목 규칙부터 설명하지 말고, [4체02-02]~[4체02-04](p.18)의 '기본 움직임 기술' 습득을 먼저 다룰 것." },
        { keyword: "생태형 스포츠는 신체 기능 관점으로", detail: "'생태형 스포츠'(균형 잡고 이동하기·타고 버티기·잡고 오르기 등, p.18~19)는 새 하위유형이므로, 옛 여가 단원 소재를 신체 기능 학습 관점으로 재구성해 쓸 것." },
      ],
    },
    "표현": {
      changes: [
        { keyword: "표현 2종→4종 세분화", detail: "2009 3~4학년군 표현 활동은 '움직임 표현'·'리듬 표현' 2개뿐이었으나(p.15), 2022는 모방·추상·리듬·도구 표현 4가지로 세분화됨([4체03-01]~[4체03-07], p.20~21)." },
        { keyword: "도구 표현, 독립 성취기준으로 승격", detail: "2009는 도구 활용을 리듬 표현의 예시(곤봉·공·리본체조, p.16)로만 다뤘지만, 2022는 '도구 표현'을 독립 성취기준([4체03-06], p.20)으로 승격함." },
      ],
      emphasis: [
        { keyword: "모방 표현과 추상 표현 구분해서 집필", detail: "모방 표현(사물·자연 관찰 기반)과 추상 표현(느낌·생각의 자유표현) 예시가 섞이지 않도록 구분해서 집필할 것([4체03-03][4체03-04], p.20~21)." },
        { keyword: "도구 표현엔 안전 사용법 필수", detail: "도구 표현([4체03-06], p.20~21)을 다룰 때는 안전한 도구 사용법 안내를 반드시 포함할 것(고려사항, p.21~22)." },
      ],
    },
  },
  "5~6학년군": {
    "운동": {
      changes: [
        { keyword: "건강·운동 체력, 한 성취기준으로 통합", detail: "2009는 '건강 체력'과 '운동 체력'을 별도 하위영역(p.17~18)으로 나눴으나, 2022 [6체01-01]~[6체01-02](p.23)는 두 체력 유형을 한 성취기준 안에서 함께 이해·측정하도록 통합함." },
        { keyword: "양성평등·인권 보호 관점 신설", detail: "2022 고려사항(p.24)에 '양성평등 감수성', '인권 보호' 문구가 새로 추가됨 — 2009의 '자기이해'·'상황판단력'(p.17) 서술에는 없던 관점." },
      ],
      emphasis: [
        { keyword: "체력, 한 흐름에서 비교·측정하도록", detail: "체력을 '건강 체력'과 '운동 체력'으로 나눠 별도 단원처럼 쓰지 말고, [6체01-01]~[6체01-02](p.23)처럼 한 흐름에서 비교·측정하도록 구성할 것." },
        { keyword: "2차 성징엔 양성평등 관점 필수", detail: "2차 성징·신체 차이를 다룰 때 '양성평등 감수성'·'인권 보호' 관점을 반드시 반영할 것(고려사항, p.24) — 2009식 단순 신체 변화 설명에 그치지 말 것." },
      ],
    },
    "스포츠": {
      changes: [
        { keyword: "도전·경쟁→기술형·전략형 스포츠 통합", detail: "2009는 도전(거리·표적/투기)과 경쟁(필드형·네트형)이 별개 대영역이었으나(p.17~19), 2022는 이를 '기술형·전략형 스포츠'로 통합해 '스포츠' 한 영역에 배치함([6체02-01]~[6체02-06], p.25~26)." },
        { keyword: "역사·과학적 원리 요소 삭제", detail: "2009는 종목마다 '역사 및 과학적 원리' 학습을 명시했으나(p.17~19), 2022 5~6학년군 스포츠 성취기준에는 역사·원리 요소가 빠지고 기능·전략 수행에 집중함." },
      ],
      emphasis: [
        { keyword: "역사·원리보다 기능·전략 수행에 집중", detail: "종목 역사나 과학적 원리 해설에 지면을 쓰지 말고, 기본 기능·전략 수행([6체02-02][6체02-05][6체02-08], p.26~27)에 집중해 쓸 것 — 2009식 역사/원리 서술은 불필요." },
        { keyword: "여가 소재는 기능 학습 관점으로 재구성", detail: "'생태형 스포츠' 집필 시 옛 여가 단원 소재(등산·자전거·캠핑 등)를 재활용하되, 여가·취미가 아니라 '기본 기능과 활동방법' 학습 관점으로 재구성할 것([6체02-08][6체02-09], p.27)." },
      ],
    },
    "표현": {
      changes: [
        { keyword: "민속·주제→전통·현대 표현 개편", detail: "2009 5~6학년군 표현 활동은 민속표현·주제표현 2개였으나(p.19~20), 2022는 스포츠표현·전통표현·현대표현 3유형으로 재편됨([6체03-01]~[6체03-08], p.29~30)." },
        { keyword: "'스포츠 표현' 신설(구 동작 도전)", detail: "'스포츠 표현'([6체03-02][6체03-03], p.29)은 2009에 없던 새 하위유형 — 2009 '동작 도전'(p.13~14)의 '아름다운 동작' 개념을 표현 영역으로 옮겨 예술적 표현으로 재정의함." },
      ],
      emphasis: [
        { keyword: "스포츠 표현은 구성·발표·감상까지", detail: "'스포츠 표현'([6체03-02][6체03-03], p.29)은 완전히 새로운 하위유형이므로, 체조·리듬 등 동작 소재를 '심미적 표현'과 '작품 구성·발표·감상'까지 포함해 다룰 것." },
        { keyword: "현대표현은 자유로운 형식에 방점", detail: "'현대표현'(구 주제표현)은 정형화된 절차보다 '틀에 얽매이지 않는 자유로움'([6체03-06], p.29~30)에 방점을 찍어 서술할 것." },
      ],
    },
  },
};

// 키워드를 먼저 굵게 보여주고 부가설명을 뒤에 붙인다 — 문장을 통째로 읽지 않아도
// 핵심만 훑을 수 있게 하기 위함(편집자 피드백: "키워드 형태로, 부가설명은 뒤에").
function renderDevelopmentNoteItems(items) {
  return items.map((item) => `<li><b>${escapeHtml(item.keyword)}</b><span>${escapeHtml(item.detail)}</span></li>`).join("");
}

function renderCurriculum() {
  if (isHighSchoolProject()) return renderSecondaryCurriculum();
  if (state.project.schoolLevel === "중학교") return renderMiddleCurriculum();
  const grade = Number.parseInt(state.project.grade, 10) || 3;
  const gradeBand = grade <= 4 ? "3~4학년군" : "5~6학년군";
  const bandStandards = curriculumData.standards.filter((item) => item.grade_band === gradeBand);
  const domains = ["운동", "스포츠", "표현"];
  const selectedDomain = domains.includes(state.curriculumDomain) ? state.curriculumDomain : "전체";
  const visibleDomains = selectedDomain === "전체" ? domains : [selectedDomain];
  const sourcePages = bandStandards.flatMap((item) => [item.source_page, item.explanation_source_page]).filter(Boolean);
  const pageRange = sourcePages.length ? `${Math.min(...sourcePages)}~${Math.max(...sourcePages)}쪽` : "확인 필요";
  const printedPageRange = sourcePages.length ? `${Math.min(...sourcePages) - 6}~${Math.max(...sourcePages) - 6}쪽` : "확인 필요";
  return `
    ${sectionHeading("CURRICULUM", "교육과정 원문 확인", "", `<button class="secondary-button" id="downloadCurriculumButton" type="button">성취기준·고려사항 PDF</button>${CURRICULUM_DEVELOPMENT_NOTES[gradeBand] ? '<button class="secondary-button" id="downloadCurriculumNoteButton" type="button">분석 내용 PDF로 저장</button>' : ""}`)}
    ${renderGradeBandOverview(gradeBand, "204시간", bandStandards.length, domains.map((domain) => `${domain} ${bandStandards.filter((item) => item.domain === domain).length}`).join(" · "))}
    <details class="curriculum-evidence">
      <summary>204시간과 성취기준 자료 색인 보기</summary>
      <p><b>기준 시수:</b> 「초등학교 교육과정」 PDF 원본 25쪽, 문서 인쇄면 17쪽</p>
      ${renderEditableSource("elementary-pe-hours-page-25", "전처리 추출 원문", `|  | 체육 |  | 204 | 204 |\n\n② 학년군의 교과(군)별 및 창의적 체험활동 시간 배당은 연간 34주를 기준으로 2년간의 기준 수업 시수를 나타낸 것이다.`)}
      <p><b>성취기준·해설:</b> 「체육과 교육과정」 · PDF 원본 ${pageRange} · 문서 인쇄면 ${printedPageRange}</p>
    </details>
    <div class="curriculum-domain-tabs">
      ${["전체", ...domains].map((domain) => {
        const count = domain === "전체" ? bandStandards.length : bandStandards.filter((item) => item.domain === domain).length;
        return `<button class="${selectedDomain === domain ? "active" : ""}" data-curriculum-domain="${domain}" type="button">${domain} <span>${count}</span></button>`;
      }).join("")}
    </div>
    <div class="curriculum-domain-list">
      ${visibleDomains.map((domain) => {
        const standards = bandStandards.filter((item) => item.domain === domain);
        const consideration = curriculumData.considerations.find((item) => item.grade_band === gradeBand && item.domain === domain);
        const developmentNote = CURRICULUM_DEVELOPMENT_NOTES[gradeBand]?.[domain];
        return `
          <section class="curriculum-domain-section">
            <header><span class="domain-badge ${domain}">${domain}</span><b>성취기준 ${standards.length}개</b></header>
            ${developmentNote ? `
              <div class="curriculum-development-note">
                <div>
                  <b>2009 개정 대비 달라진 점</b>
                  <ul>${renderDevelopmentNoteItems(developmentNote.changes)}</ul>
                </div>
                <div>
                  <b>집필 시 강조할 점</b>
                  <ul>${renderDevelopmentNoteItems(developmentNote.emphasis)}</ul>
                </div>
              </div>` : ""}
            <div class="curriculum-standard-list">
              ${standards.map((standard) => {
                const codeKey = standard.code.slice(1, -1);
                return `
                  <details class="curriculum-standard">
                    <summary><b>${escapeHtml(standard.code)}</b><span>${escapeHtml(standard.statement)}</span><small>PDF ${standard.source_page}쪽 · 인쇄면 ${standard.source_page - 6}쪽</small></summary>
                    ${renderEditableSource(`standard-${codeKey}-statement`, "성취기준 원문", standard.statement)}
                    ${renderEditableSource(`standard-${codeKey}-explanation`, `성취기준 해설 · PDF ${standard.explanation_source_page}쪽 · 인쇄면 ${standard.explanation_source_page - 6}쪽`, standard.explanation)}
                  </details>`;
              }).join("")}
            </div>
            ${consideration ? `
              <details class="curriculum-consideration">
                <summary>성취기준 적용 시 고려 사항 전체 보기</summary>
                ${renderEditableSource(`consideration-${gradeBand}-${domain}`, `적용 시 고려 사항 · PDF ${consideration.source_page}~${consideration.source_page_end}쪽 · 인쇄면 ${consideration.source_page - 6}~${consideration.source_page_end - 6}쪽`, consideration.text)}
              </details>` : ""}
          </section>`;
      }).join("")}
    </div>`;
}

// 02단계 맨 위 요약: 학년군(기준 시수·성취기준) 아래에 학년책별 차시가 오는 위계로 보여 준다.
// 성취기준은 학년군 단위라 두 학년이 같고, 차시만 학년책마다 따로 정한다.
function renderGradeBandOverview(bandLabel, bandHours, standardCount, standardBreakdown) {
  const project = activeProject();
  const currentKey = project.activeBookKey;
  const books = Object.entries(project.books || {});
  return `
    <div class="band-overview">
      <div class="band-overview-row">
        <b class="band-overview-name">${escapeHtml(bandLabel)}</b>
        <span><small>기준 시수</small> ${escapeHtml(bandHours)}</span>
        <span><small>성취기준</small> ${standardCount}개${standardBreakdown ? ` <small>(${escapeHtml(standardBreakdown)})</small>` : ""}</span>
      </div>
      ${books.length > 1 ? `<ul class="band-overview-grades">${books.map(([bookKey, book]) => `<li class="${bookKey === currentKey ? "current" : ""}"><b>${escapeHtml(bookKey)}</b> ${Number(book.project.targetHours) || 0}차시</li>`).join("")}</ul>` : ""}
    </div>`;
}

// ── 초등 체육 단원명 AI 제안 ──
// 교육과정 내용 요소로 만든 기본 소단원명("○○에 도전해요")은 자리만 잡아 둔 이름이다. 새 교과서의
// 중단원·소단원명은 AI가 기존 교과서 제목의 말투만 참고해 새로 짓고, 편집자가 항목별로 골라 적용한다.
// 받은 제안은 책마다 state.unitTitleProposalLog에 이력으로 남겨, 나중에 다시 열어 다른 후보로 바꾸거나
// 적용을 되돌리고, 엑셀·PDF·한글·워드로 내려받을 수 있다.
let unitTitleProposal = { bookKey: "", loading: false, error: "", openId: "" };

function unitTitleProposalBookKey() {
  return `${activeProject().id}:${activeProject().activeBookKey || ""}`;
}

function unitTitleProposalLog() {
  if (!Array.isArray(state.unitTitleProposalLog)) state.unitTitleProposalLog = [];
  return state.unitTitleProposalLog;
}

function unitTitleProposalRequest() {
  const band = String(activeProject().band || "");
  const grade = Number.parseInt(state.project.grade, 10) || 3;
  const bandLabel = band || (grade <= 4 ? "3~4학년군" : "5~6학년군");
  const middles = [];
  state.units.forEach((unit, unitIndex) => unit.subdomainGroups.forEach((group, groupIndex) => group.middleUnits.forEach((middle, middleIndex) => {
    middles.push({
      key: `${unitIndex}:${groupIndex}:${middleIndex}`,
      domain: unit.domain,
      subdomain: group.subtitle || "",
      officialTitle: stripManualUnitNumberPrefix(middle.officialTitle || middle.title || ""),
      currentTitle: middle.title || "",
      smalls: middle.smallUnits.map((small, smallIndex) => ({
        key: `${unitIndex}:${groupIndex}:${middleIndex}:${smallIndex}`,
        sourceActivity: small.sourceActivity || "",
        currentTitle: small.title || "",
        hours: Number(small.hours) || 0,
      })),
    });
  })));
  const domains = new Set(state.units.map((unit) => unit.domain));
  const standards = (curriculumData.standards || [])
    .filter((item) => item.grade_band === bandLabel && domains.has(item.domain))
    .map((item) => `${item.code} ${item.statement}`);
  return { gradeLabel: state.project.grade, band: bandLabel, standards, middles, concept: sportsCultureAdditionalConcept.trim() };
}

async function requestUnitTitleProposal() {
  const bookKey = unitTitleProposalBookKey();
  const book = state;
  const request = unitTitleProposalRequest();
  unitTitleProposal = { bookKey, loading: true, error: "", openId: "" };
  renderWorkspace();
  try {
    const response = await fetch("/api/prototype/elementary-unit-titles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || "단원명 제안을 받지 못했습니다.");
    // 제안 당시의 이름·영역·원 활동을 함께 남겨, 단원 구성이 바뀐 뒤에도 무엇을 제안했는지 알 수 있게 한다.
    const meta = {};
    request.middles.forEach((middle) => {
      meta[middle.key] = { kind: "중단원", domain: middle.domain, source: middle.officialTitle, before: middle.currentTitle };
      middle.smalls.forEach((small) => {
        meta[small.key] = { kind: "소단원", domain: middle.domain, source: small.sourceActivity, before: small.currentTitle };
      });
    });
    const record = {
      id: `utp-${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      model: data.result.model || "",
      gradeLabel: request.gradeLabel,
      concept: request.concept,
      meta,
      middles: data.result.middles || [],
      applications: [],
    };
    if (!Array.isArray(book.unitTitleProposalLog)) book.unitTitleProposalLog = [];
    book.unitTitleProposalLog.push(record);
    persist("단원명 제안 이력 저장됨");
    unitTitleProposal = { bookKey, loading: false, error: "", openId: record.id };
  } catch (error) {
    unitTitleProposal = { bookKey, loading: false, error: error.message, openId: "" };
  }
  if (unitTitleProposalBookKey() === bookKey) renderWorkspace();
}

function unitTitleTarget(key) {
  const [unitIndex, groupIndex, middleIndex, smallIndex] = key.split(":").map(Number);
  const middle = state.units[unitIndex]?.subdomainGroups[groupIndex]?.middleUnits[middleIndex];
  if (!middle) return null;
  return Number.isInteger(smallIndex) ? middle.smallUnits[smallIndex] || null : middle;
}

function unitTitleProposalRows(record) {
  return (record.middles || []).flatMap((middle) => [
    { key: middle.key, title: middle.title, alternatives: middle.alternatives || [], reason: "" },
    ...(middle.smalls || []).map((small) => ({ key: small.key, title: small.title, alternatives: small.alternatives || [], reason: small.reason || "" })),
  ]);
}

function renderUnitTitleChoiceRow(record, row) {
  const target = unitTitleTarget(row.key);
  const meta = record.meta?.[row.key] || {};
  const isMiddle = !row.key.split(":")[3];
  if (!target) {
    return `<tr class="${isMiddle ? "is-middle" : ""} is-missing"><td>${isMiddle ? "중" : "소"}</td><td>${escapeHtml(meta.before || "")}</td><td colspan="2"><small>지금 단원 구성에는 이 항목이 없습니다.</small></td></tr>`;
  }
  const candidates = [...new Set([row.title, ...row.alternatives].filter(Boolean))];
  // 이미 후보 중 하나를 적용했다면 그 후보를 선택한 상태로 보여 준다.
  const selected = candidates.includes(target.title) ? target.title : candidates[0];
  return `
    <tr class="${isMiddle ? "is-middle" : ""}">
      <td>${isMiddle ? "중" : "소"}</td>
      <td class="unit-title-now" title="${escapeHtml(meta.source ? `원 활동·내용 요소: ${meta.source}` : "")}">${escapeHtml(target.title || "(제목 없음)")}</td>
      <td><select data-unit-title-choice="${row.key}">
        ${candidates.map((text) => `<option value="${escapeHtml(text)}" ${text === selected ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}
        <option value="">지금 이름 유지</option>
      </select></td>
      <td class="unit-title-reason" title="${escapeHtml(row.reason)}">${escapeHtml(row.reason)}</td>
    </tr>`;
}

function unitTitleRecordLabel(record) {
  return new Date(record.createdAt).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function renderUnitTitleProposal() {
  if (!isElementaryPeProject()) return "";
  const current = unitTitleProposal.bookKey === unitTitleProposalBookKey() ? unitTitleProposal : { error: "", openId: "" };
  const log = unitTitleProposalLog();
  const record = log.find((item) => item.id === current.openId);
  const lastApplication = record?.applications?.filter((item) => !item.revertedAt).at(-1);
  return `
    ${current.error ? `<div class="validation-box invalid unit-title-proposal"><strong>단원명 제안을 받지 못했습니다.</strong><p>${escapeHtml(current.error)}</p></div>` : ""}
    ${record ? `
      <section class="unit-title-proposal">
        <div class="unit-title-proposal-head">
          <div><strong>AI 단원명 제안 · ${escapeHtml(unitTitleRecordLabel(record))}</strong><small>후보를 고르고 적용하세요. 기존 교과서 제목은 말투만 참고했습니다. 적용 후에도 아래 입력칸에서 직접 고칠 수 있습니다.</small></div>
          <div class="unit-title-proposal-actions">
            ${lastApplication ? `<button class="secondary-button" type="button" data-unit-title-revert="${record.id}">마지막 적용 되돌리기</button>` : ""}
            <button class="secondary-button" type="button" data-unit-title-dismiss>닫기</button>
            <button class="primary-button" type="button" data-unit-title-apply="${record.id}">선택한 이름 적용</button>
          </div>
        </div>
        <div class="unit-title-table-wrap"><table class="unit-title-table">
          <thead><tr><th></th><th>지금 이름</th><th>새 이름 후보</th><th>까닭</th></tr></thead>
          <tbody>${unitTitleProposalRows(record).map((row) => renderUnitTitleChoiceRow(record, row)).join("")}</tbody>
        </table></div>
      </section>` : ""}
    ${log.length ? `
      <details class="unit-title-history" ${record ? "" : "open"}>
        <summary>AI 단원명 제안 이력 <span>${log.length}건</span></summary>
        <table class="unit-title-history-table">
          <tbody>${log.slice().reverse().map((item) => {
            const applied = (item.applications || []).filter((application) => !application.revertedAt);
            const changed = applied.reduce((sum, application) => sum + application.changes.length, 0);
            return `<tr class="${item.id === record?.id ? "is-open" : ""}">
              <td>${escapeHtml(unitTitleRecordLabel(item))}</td>
              <td>${escapeHtml(item.gradeLabel || "")} · ${unitTitleProposalRows(item).length}개 항목</td>
              <td>${changed ? `적용 ${changed}개` : "<small>미적용</small>"}</td>
              <td class="unit-title-history-actions">
                <button type="button" data-unit-title-open="${item.id}">${item.id === record?.id ? "열림" : "열기"}</button>
                ${["xlsx:엑셀", "pdf:PDF", "hwpx:한글", "docx:워드"].map((pair) => {
                  const [format, label] = pair.split(":");
                  return `<button type="button" data-unit-title-export="${item.id}:${format}">${label}</button>`;
                }).join("")}
                <button type="button" data-unit-title-delete="${item.id}" aria-label="이력 삭제">삭제</button>
              </td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </details>` : ""}`;
}

function applyUnitTitleProposal(recordId) {
  const record = unitTitleProposalLog().find((item) => item.id === recordId);
  if (!record) return;
  const changes = [];
  document.querySelectorAll("[data-unit-title-choice]").forEach((select) => {
    const key = select.dataset.unitTitleChoice;
    const target = unitTitleTarget(key);
    if (!target || !select.value || select.value === target.title) return;
    // 공식 내용 요소 이름은 다시 제안할 때 근거로 쓰도록 처음 한 번만 보관한다.
    if (!key.split(":")[3] && !target.officialTitle) target.officialTitle = target.title;
    changes.push({ key, from: target.title, to: select.value });
    target.title = select.value;
  });
  if (changes.length) record.applications = [...(record.applications || []), { at: new Date().toISOString(), changes }];
  persist("단원명 제안 적용됨");
  renderWorkspace();
  showToast(changes.length ? `단원명 ${changes.length}개를 바꿨습니다. 이력에서 다시 열어 되돌릴 수 있습니다.` : "바꾼 단원명이 없습니다.");
}

function revertUnitTitleProposal(recordId) {
  const record = unitTitleProposalLog().find((item) => item.id === recordId);
  const application = record?.applications?.filter((item) => !item.revertedAt).at(-1);
  if (!application) return;
  let reverted = 0;
  let skipped = 0;
  application.changes.forEach((change) => {
    const target = unitTitleTarget(change.key);
    // 적용 뒤에 편집자가 직접 고친 이름은 덮어쓰지 않는다.
    if (target && target.title === change.to) {
      target.title = change.from;
      reverted += 1;
    } else skipped += 1;
  });
  application.revertedAt = new Date().toISOString();
  persist("단원명 적용 되돌림");
  renderWorkspace();
  showToast(`단원명 ${reverted}개를 되돌렸습니다.${skipped ? ` 적용 뒤 직접 고친 ${skipped}개는 그대로 두었습니다.` : ""}`);
}

function unitTitleExportTable(record) {
  const columns = ["구분", "영역", "원 활동·내용 요소", "제안 당시 이름", "AI 제안", "대안 1", "대안 2", "까닭", "지금 이름"];
  const rows = unitTitleProposalRows(record).map((row) => {
    const meta = record.meta?.[row.key] || {};
    return [
      meta.kind || (row.key.split(":")[3] ? "소단원" : "중단원"),
      meta.domain || "",
      meta.source || "",
      meta.before || "",
      row.title || "",
      row.alternatives[0] || "",
      row.alternatives[1] || "",
      row.reason || "",
      unitTitleTarget(row.key)?.title || "",
    ];
  });
  return {
    title: `${record.gradeLabel || ""} 단원명 제안`.trim(),
    subtitle: `${activeProject().name} · ${new Date(record.createdAt).toLocaleString("ko-KR")} · ${record.model || "AI"}${record.concept ? ` · 추가 지침: ${record.concept}` : ""}`,
    columns,
    rows,
    widths: [6, 6, 14, 18, 20, 18, 18, 28, 18],
    filename: `${activeProject().name}_${record.gradeLabel || ""}_단원명제안_${folderStamp(record.createdAt).slice(0, 13)}`,
  };
}

// PDF는 한글 글꼴을 서버에 두지 않고, 화면 글꼴로 캔버스에 표를 그려 A4 가로 쪽으로 묶는다.
function tableToPdfBlob({ title, subtitle, columns, rows, widths }) {
  const pageWidth = 1123;
  const pageHeight = 794;
  const margin = 40;
  const total = widths.reduce((sum, value) => sum + value, 0);
  const colWidths = widths.map((value) => ((pageWidth - margin * 2) * value) / total);
  const font = "13px 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = font;
  const wrap = (text, width) => {
    const lines = [];
    String(text || "").split("\n").forEach((paragraph) => {
      let line = "";
      for (const char of paragraph) {
        if (measure.measureText(line + char).width > width - 10 && line) {
          lines.push(line);
          line = char;
        } else line += char;
      }
      lines.push(line);
    });
    return lines;
  };
  const pages = [];
  let context = null;
  let y = 0;
  const lineHeight = 18;
  const drawRow = (values, header) => {
    const wrapped = values.map((value, index) => wrap(value, colWidths[index]));
    const height = Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + 10;
    let x = margin;
    if (header) {
      context.fillStyle = "#ddebe3";
      context.fillRect(margin, y, pageWidth - margin * 2, height);
    }
    context.strokeStyle = "#c9d3cc";
    context.fillStyle = "#202a26";
    context.font = header ? `bold ${font}` : font;
    wrapped.forEach((lines, index) => {
      context.strokeRect(x, y, colWidths[index], height);
      lines.forEach((line, lineIndex) => context.fillText(line, x + 5, y + 18 + lineIndex * lineHeight));
      x += colWidths[index];
    });
    y += height;
    return height;
  };
  const newPage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    pages.push(canvas);
    y = margin;
    if (pages.length === 1) {
      context.fillStyle = "#176b4f";
      context.font = "bold 20px 'Malgun Gothic', sans-serif";
      context.fillText(title, margin, y + 18);
      context.fillStyle = "#5b6b60";
      context.font = "12px 'Malgun Gothic', sans-serif";
      context.fillText(subtitle, margin, y + 40);
      y += 56;
    }
    drawRow(columns, true);
  };
  newPage();
  rows.forEach((row) => {
    const needed = Math.max(...row.map((value, index) => wrap(value, colWidths[index]).length)) * lineHeight + 10;
    if (y + needed > pageHeight - margin) newPage();
    drawRow(row, false);
  });
  const { jsPDF } = globalThis.jspdf;
  const pdf = new jsPDF({ unit: "px", format: [pageWidth, pageHeight], orientation: "landscape", compress: true });
  pages.forEach((canvas, index) => {
    if (index > 0) pdf.addPage([pageWidth, pageHeight], "landscape");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageWidth, pageHeight);
  });
  return pdf.output("blob");
}

async function exportUnitTitleProposal(recordId, format) {
  const record = unitTitleProposalLog().find((item) => item.id === recordId);
  if (!record) return;
  const table = unitTitleExportTable(record);
  if (format === "pdf") {
    triggerBlobDownload(tableToPdfBlob(table), `${table.filename}.pdf`);
    return;
  }
  const response = await fetch("/api/prototype/table-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...table, format }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    showToast(data.error || "파일을 만들지 못했습니다.");
    return;
  }
  triggerBlobDownload(await response.blob(), `${table.filename}.${format}`);
}

function bindUnitTitleProposal() {
  document.querySelector("#workspace")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-unit-title-propose], [data-unit-title-dismiss], [data-unit-title-apply], [data-unit-title-revert], [data-unit-title-open], [data-unit-title-export], [data-unit-title-delete]");
    if (!button) return;
    const data = button.dataset;
    if ("unitTitlePropose" in data) requestUnitTitleProposal();
    else if ("unitTitleDismiss" in data) {
      unitTitleProposal = { ...unitTitleProposal, openId: "", error: "" };
      renderWorkspace();
    } else if (data.unitTitleApply) applyUnitTitleProposal(data.unitTitleApply);
    else if (data.unitTitleRevert) revertUnitTitleProposal(data.unitTitleRevert);
    else if (data.unitTitleOpen) {
      unitTitleProposal = { bookKey: unitTitleProposalBookKey(), loading: false, error: "", openId: data.unitTitleOpen };
      renderWorkspace();
      document.querySelector(".unit-title-proposal")?.scrollIntoView({ block: "start", behavior: "smooth" });
    } else if (data.unitTitleExport) {
      const [id, format] = data.unitTitleExport.split(":");
      exportUnitTitleProposal(id, format);
    } else if (data.unitTitleDelete && confirm("이 단원명 제안 이력을 삭제할까요? 이미 적용한 단원명은 그대로 남습니다.")) {
      state.unitTitleProposalLog = unitTitleProposalLog().filter((item) => item.id !== data.unitTitleDelete);
      if (unitTitleProposal.openId === data.unitTitleDelete) unitTitleProposal = { ...unitTitleProposal, openId: "" };
      persist("단원명 제안 이력 삭제됨");
      renderWorkspace();
    }
  });
}

function renderUnits() {
  const sportsCulture = isSportsCultureProject();
  if (sportsCulture) ensureSportsCultureDraftSettings(state);
  if (isElementaryPeProject()) ensureElementaryDraftSettings(state);
  normalizeAutomaticUnitNumbering(state);
  const allocatedHours = unitsTotalHours(state.units);
  const targetHours = projectTargetHours();
  const hourDifference = targetHours - allocatedHours;
  const domainOrder = sportsCulture ? [...new Set(state.units.map((unit) => unit.domain))] : projectDomainOrder();
  const secondaryCourse = isHighSchoolProject();
  const frontMatterTotal = lineItemsTotalPages(state.frontMatterText);
  const backMatterTotal = lineItemsTotalPages(state.backMatterText);
  const frontBackTotal = frontMatterTotal + backMatterTotal;
  const appendixTotal = lineItemsTotalPages(state.appendixText);
  const plannedSpecialPages = specialPagesTotal(state);
  const coreAllocated = unitsTotalPages(state.units) + plannedSpecialPages + appendixTotal;
  const coreTarget = Number(state.project.corePages) || 0;
  const supplementaryTarget = Number(state.project.supplementaryPages) || 0;
  const coreDifference = coreTarget - coreAllocated;
  const frontBackDifference = supplementaryTarget - frontBackTotal;
  const selectedDomain = domainOrder.includes(state.unitDomainFilter) ? state.unitDomainFilter : "전체";
  const smallUnitCountOf = (unit) => unit.subdomainGroups.reduce(
    (sum, group) => sum + group.middleUnits.reduce((s, middle) => s + middle.smallUnits.length, 0),
    0
  );
  return `
    ${sectionHeading("UNIT STRUCTURE", "단원 구성·차시 배분", "", `${isSportsCultureProject() ? '<button class="secondary-button" id="applySportsCultureDetailedUnits" type="button">18개 소단원 초기안 적용</button>' : ''}${isElementaryPeProject() ? `<button class="secondary-button" type="button" data-unit-title-propose ${unitTitleProposal.loading ? "disabled" : ""}>${unitTitleProposal.loading ? "AI가 단원명을 짓는 중…" : "AI로 단원명 새로 제안"}</button>` : ""}<button class="secondary-button" id="openPagePreview" type="button">배열표 미리보기</button><button class="secondary-button" id="downloadTocButton" type="button">목차 다운로드</button>`)}
    ${renderUnitTitleProposal()}
    <div class="unit-summary-row">
      <div class="unit-summary-item ${allocatedHours === targetHours ? "valid" : "invalid"}">
        <span>차시</span><strong>${allocatedHours}</strong><small>/ ${targetHours}차시${hourDifference === 0 ? "" : hourDifference > 0 ? ` · ${hourDifference}차시 추가 필요` : ` · ${Math.abs(hourDifference)}차시 초과`}</small>
      </div>
      <div class="unit-summary-item ${coreDifference === 0 ? "valid" : "invalid"}">
        <span>${secondaryCourse ? "교과서·부록 쪽수" : "본문·부록 쪽수"}</span><strong>${coreAllocated}</strong><small>/ ${coreTarget}쪽${coreDifference === 0 ? "" : coreDifference > 0 ? ` · ${coreDifference}쪽 추가 필요` : ` · ${Math.abs(coreDifference)}쪽 초과`}</small>
      </div>
      <div class="unit-summary-item ${frontBackDifference === 0 ? "valid" : "invalid"}">
        <span>부속자료 쪽수</span><strong>${frontBackTotal}</strong><small>/ ${supplementaryTarget}쪽${frontBackDifference === 0 ? "" : frontBackDifference > 0 ? ` · ${frontBackDifference}쪽 추가 필요` : ` · ${Math.abs(frontBackDifference)}쪽 초과`}</small>
      </div>
    </div>
    ${coreDifference || frontBackDifference ? `<div class="page-fit-bar"><span>쪽수가 기준과 다릅니다.</span><button class="secondary-button" type="button" id="fitPagesButton">기준 쪽수에 맞게 배분</button></div>` : ""}
    <div class="domain-summary-row">
      ${domainOrder.map((domain) => {
        const domainUnits = state.units.filter((item) => item.domain === domain);
        if (!domainUnits.length) return "";
        const domainHours = unitsTotalHours(domainUnits);
        const domainPages = unitsTotalPages(domainUnits) + specialPagesTotal(state, domain);
        return `<div class="domain-summary-item"><span class="domain-badge ${escapeHtml(domain)}">${escapeHtml(domain)}</span><b>${domainHours}차시</b><b>${domainPages}쪽</b></div>`;
      }).join("")}
    </div>
    ${sportsCulture ? `
      <section class="sports-selection-panel">
        <div class="sports-selection-heading">
          <div>
            <strong>책의 종목 후보 <span>1개 이상 필수</span></strong>
          </div>
          <b>${escapeHtml(selectedSportsFor(state).join(", ") || "선택 없음")}</b>
        </div>
        <div class="sports-option-grid">
          ${SPORTS_CULTURE_SPORT_OPTIONS.map((sport) => `
            <label class="sports-option ${state.selectedSports.includes(sport) ? "selected" : ""}">
              <input type="checkbox" data-sport-option="${escapeHtml(sport)}" ${state.selectedSports.includes(sport) ? "checked" : ""} />
              <span>${escapeHtml(sport)}</span>
            </label>`).join("")}
        </div>
        <label class="custom-sports-field">
          <span>그 밖의 종목</span>
          <input id="customSportsInput" value="${escapeHtml(state.customSports || "")}" placeholder="예: 플로어볼, 크리켓 (쉼표로 구분)" />
        </label>
      </section>
      <section class="sports-selection-panel">
        <div class="sports-selection-heading">
          <div>
            <strong>구성요소 후보 <span>다른 출판사 사례 기반 추천, 선택 사항</span></strong>
          </div>
          <b>${escapeHtml(selectedConceptsFor(state).join(", ") || "선택 없음")}</b>
        </div>
        <div class="sports-option-grid">
          ${SPORTS_CULTURE_CONCEPT_OPTIONS.map((concept) => `
            <label class="sports-option ${state.selectedConcepts.includes(concept) ? "selected" : ""}">
              <input type="checkbox" data-concept-option="${escapeHtml(concept)}" ${state.selectedConcepts.includes(concept) ? "checked" : ""} />
              <span>${escapeHtml(concept)}</span>
            </label>`).join("")}
        </div>
        <label class="custom-sports-field">
          <span>그 밖의 구성요소</span>
          <input id="customConceptsInput" value="${escapeHtml(state.customConcepts || "")}" placeholder="예: 과학팁, 인성팁 (쉼표로 구분)" />
        </label>
      </section>` : ""}
    <div class="front-back-matter-grid">
      <div class="front-back-matter-card">
        <p class="small-unit-label">앞부속 <small>이름, 쪽수</small></p>
        <textarea data-front-matter-text rows="4" placeholder="속표지, 1">${escapeHtml(state.frontMatterText)}</textarea>
      </div>
      <div class="front-back-matter-card">
        <p class="small-unit-label">뒷부속 <small>이름, 쪽수</small></p>
        <textarea data-back-matter-text rows="4" placeholder="참고문헌, 1">${escapeHtml(state.backMatterText)}</textarea>
      </div>
      <div class="front-back-matter-card">
        <p class="small-unit-label">부록 <small>이름, 쪽수</small></p>
        <textarea data-appendix-text rows="4" placeholder="예: 안전 수칙 안내, 2">${escapeHtml(state.appendixText)}</textarea>
      </div>
    </div>
    ${sportsCulture || isElementaryPeProject() ? `
      <section class="special-page-panel toc-special-page-panel">
        <div class="draft-target-heading"><div><strong>${sportsCulture ? "특별페이지 구성" : "확장 코너·통합 프로젝트"}</strong><p>${sportsCulture ? "본문 뒤·마무리 앞에 배치" : "대단원 마무리 앞, 또는 책 전체(모든 단원 통합)로 마지막 단원 뒤에 배치"}</p></div><b>${plannedSpecialPages}쪽</b></div>
        <div class="special-page-add">
          <select id="tocSpecialPageTypeSelect" aria-label="유형">${specialPageTypes().map((type) => `<option value="${type.id}">${type.label}</option>`).join("")}</select>
          <select id="tocSpecialPageDomainSelect" aria-label="배치">${state.units.map((unit) => `<option value="${escapeHtml(unit.domain)}">${escapeHtml(unit.domain)}</option>`).join("")}${sportsCulture ? "" : '<option value="">책 전체(통합)</option>'}</select>
          <button class="secondary-button" id="addTocSpecialPageButton" type="button">${sportsCulture ? "특별페이지 추가" : "코너 추가"}</button>
        </div>
        <div class="special-page-list">
          ${(state.specialPages || []).length ? state.specialPages.map((page) => `
            <article class="toc-special-page-row">
              <label><span>유형</span><select data-toc-special-type="${page.id}">${specialPageTypes().map((type) => `<option value="${type.id}" ${type.id === page.type ? "selected" : ""}>${type.label}</option>`).join("")}</select></label>
              <label class="toc-special-title"><span>이름</span><input data-toc-special-title="${page.id}" value="${escapeHtml(page.title)}" /></label>
              <label><span>배치</span><select data-toc-special-domain="${page.id}">${state.units.map((unit) => `<option value="${escapeHtml(unit.domain)}" ${unit.domain === page.domain ? "selected" : ""}>${escapeHtml(unit.domain)}</option>`).join("")}${sportsCulture ? "" : `<option value="" ${state.units.some((unit) => unit.domain === page.domain) ? "" : "selected"}>책 전체(통합)</option>`}</select></label>
              <label class="small-unit-hours-field"><span>쪽수</span><input data-toc-special-pages="${page.id}" type="number" min="1" value="${Math.max(1, Number(page.pages) || 2)}" /></label>
              <button class="secondary-button" data-delete-toc-special-page="${page.id}" type="button">삭제</button>
            </article>`).join("") : `<p class="bulk-edit-note">추가한 ${sportsCulture ? "특별페이지" : "코너"}가 없습니다. 필요한 경우 여기에서 먼저 쪽수를 배정하세요.</p>`}
        </div>
      </section>` : ""}
    <div class="curriculum-domain-tabs">
      ${["전체", ...domainOrder].map((domain) => {
        const count = domain === "전체"
          ? state.units.reduce((sum, unit) => sum + smallUnitCountOf(unit), 0)
          : state.units.filter((unit) => unit.domain === domain).reduce((sum, unit) => sum + smallUnitCountOf(unit), 0);
        return `<button class="${selectedDomain === domain ? "active" : ""}" data-unit-domain-filter="${escapeHtml(domain)}" type="button">${escapeHtml(domain)} <span>${count}</span></button>`;
      }).join("")}
    </div>
    <div class="unit-list">
      ${state.units.map((unit, unitIndex) => {
        if (selectedDomain !== "전체" && unit.domain !== selectedDomain) return "";
        const unitTotalPages = unitsTotalPages([unit]) + specialPagesTotal(state, unit.domain);
        return `
          <article class="unit-card" data-drop-kind="unit" data-drop-path="${unitIndex}">
            <div class="unit-top-row">
              ${sportsCulture ? dragHandle("unit", unitIndex, "대단원") : ""}
              <span class="automatic-unit-number">${unitNumberLabel(unitIndex)}</span>
              <span class="domain-badge ${escapeHtml(unit.domain)}">${sportsCulture ? `<input class="domain-name-input" data-unit-domain="${unitIndex}" value="${escapeHtml(unit.domain)}" aria-label="대단원명" />` : escapeHtml(unit.domain)}</span>
              ${unit.subdomainGroups.map((group, groupIndex) => `<div class="numbered-unit-title"><input class="unit-subtitle-input" data-unit-subtitle="${unitIndex}:${groupIndex}" value="${escapeHtml(group.subtitle)}" aria-label="${unit.domain} 대단원 부제" title="대단원 부제(세부 영역)" /></div>`).join("")}
              <label class="small-unit-hours-field"><span>도입 쪽수</span><input data-unit-intro="${unitIndex}" type="number" min="0" value="${unit.introPages}" aria-label="${unit.domain} 도입 쪽수" /></label>
              <label class="small-unit-hours-field"><span>마무리 쪽수</span><input data-unit-wrapup="${unitIndex}" type="number" min="0" value="${unit.wrapUpPages}" aria-label="${unit.domain} 마무리 쪽수" /></label>
              <div class="unit-total-pages" aria-label="${unit.domain} 전체 쪽수"><span>전체 쪽수</span><strong>${unitTotalPages}</strong></div>
              ${sportsCulture ? `<div class="unit-card-actions">
                <button type="button" data-unit-action="delete" data-unit-index="${unitIndex}">삭제</button>
                <button type="button" data-unit-action="duplicate" data-unit-index="${unitIndex}">대단원 복제</button>
              </div>` : ""}
            </div>
            ${unit.subdomainGroups.map((group, groupIndex) => `
              <div class="subdomain-group">
                <small class="unit-source-note">${secondaryCourse ? `${secondaryDomainSourceLabel(unit.domain)} · 성취기준 기준` : `「체육과 교육과정」 PDF ${group.sourcePage}쪽 · 인쇄면 ${Number(group.sourcePage) - 6}쪽 · 신체활동 예시 기준`}</small>
                ${group.middleUnits.map((middle, middleIndex) => {
                  const middlePath = `${unitIndex}:${groupIndex}:${middleIndex}`;
                  const middlePosition = middleUnitPosition(unit, groupIndex, middleIndex);
                  const middleNumber = unitNumberLabel(unitIndex, middlePosition);
                  const moveTargets = unit.subdomainGroups.flatMap((g, gIdx) =>
                    g.middleUnits.map((m, mIdx) => ({ groupIndex: gIdx, middleIndex: mIdx, title: m.title }))
                  ).filter((t) => !(t.groupIndex === groupIndex && t.middleIndex === middleIndex));
                  return `
                  <div class="middle-unit-block" data-drop-kind="middle" data-drop-path="${middlePath}">
                    <div class="numbered-middle-title">
                      ${dragHandle("middle", middlePath, "중단원")}
                      <span class="automatic-unit-number">${middleNumber}</span>
                      <input data-middle-title="${middlePath}" value="${escapeHtml(middle.title)}" aria-label="${unit.domain} 중단원명" />
                      <div class="unit-card-actions">
                        <button type="button" data-middle-action="delete" data-middle-path="${middlePath}">삭제</button>
                        <button type="button" data-middle-action="duplicate" data-middle-path="${middlePath}">중단원 복제</button>
                      </div>
                    </div>
                    <div class="small-unit-grid">
                      ${middle.smallUnits.map((smallUnit, smallIndex) => {
                        const smallPath = `${middlePath}:${smallIndex}`;
                        const smallNumber = unitNumberLabel(unitIndex, middlePosition, smallIndex + 1);
                        return `
                        <div class="small-unit-card" data-drop-kind="small" data-drop-path="${smallPath}">
                          <div class="small-unit-meta">
                            <small class="small-unit-source">${isSportsCultureProject() ? "구성 근거" : "원 활동"}: ${escapeHtml(smallUnit.sourceActivity)}</small>
                            ${isSportsCultureProject() && Array.isArray(smallUnit.standardCodes) ? `<small class="small-unit-source standard-link">성취기준: ${escapeHtml(smallUnit.standardCodes.join(", "))}</small>` : ""}
                          </div>
                          <label class="small-unit-title-field">${dragHandle("small", smallPath, "소단원")}<b class="automatic-unit-number">${smallNumber}</b><input class="small-unit-title" data-small-title="${smallPath}" value="${escapeHtml(smallUnit.title)}" aria-label="소단원명" /></label>
                          <label class="small-unit-hours-field"><span>차시</span><input data-small-hours="${smallPath}" type="number" min="1" value="${smallUnit.hours}" aria-label="소단원 차시" /></label>
                          <label class="small-unit-hours-field"><span>쪽수</span><input data-small-pages="${smallPath}" type="number" min="0" value="${smallUnit.pages}" aria-label="소단원 쪽수" /></label>
                          <div class="small-unit-actions" aria-label="소단원 편집 작업">
                            <button type="button" data-small-action="delete" data-small-path="${smallPath}">삭제</button>
                            <button type="button" data-small-action="duplicate" data-small-path="${smallPath}">복제</button>
                            <button type="button" data-toggle-move="${smallPath}">이동</button>
                          </div>
                          ${sportsCulture ? `<div class="small-unit-sports-field">
                            <div class="small-unit-sport-mode-row"><label class="small-unit-sport-mode"><span>종목 사용 방식</span><select data-small-sport-mode="${smallPath}">${SPORTS_CULTURE_SPORT_MODES.map((mode) => `<option value="${mode.id}" ${smallUnit.sportMode === mode.id ? "selected" : ""}>${mode.label}</option>`).join("")}</select></label><button class="secondary-button" data-recommend-small-sports="${smallPath}" type="button">현재 목차명으로 다시 추천</button></div>
                            ${smallUnit.sportMode !== "none" ? `<div class="small-unit-sport-options">
                              ${selectedSportsFor(state).map((sport) => `<label class="small-unit-sport-chip ${smallUnit.sports?.includes(sport) ? "selected" : ""}">
                                <input type="${smallUnit.sportMode === "primary" ? "radio" : "checkbox"}" name="small-sport-${smallPath}" data-small-sport="${smallPath}" value="${escapeHtml(sport)}" ${smallUnit.sports?.includes(sport) ? "checked" : ""} />
                                <span>${escapeHtml(sport)}</span>
                              </label>`).join("") || '<small>위에서 후보 종목을 먼저 선택하세요.</small>'}
                            </div>` : ""}
                            <small>${smallUnit.sportMode === "primary" && smallUnit.sports?.length ? `목차·시설·규칙·동작에 ${escapeHtml(smallUnit.sports[0])}을 주 종목으로 반영` : smallUnit.sportMode === "examples" && smallUnit.sports?.length ? `${escapeHtml(smallUnit.sports.join(", "))}은 본문 비교 사례로만 사용하며 목차명에는 강제하지 않음` : "특정 종목 없이 개념 자체를 설명"} · ${smallUnit.sportSettingSource === "user" ? "사용자 설정" : "전처리 목차 기반 추천"}</small>
                          </div>` : ""}
                          ${sportsCulture && selectedConceptsFor(state).length ? `<div class="small-unit-sports-field">
                            <p class="small-unit-label">적용 구성요소 <small>선택 시 원고 생성 때 해당 성격의 절 포함 요청</small></p>
                            <div class="small-unit-sport-options">
                              ${selectedConceptsFor(state).map((concept) => `<label class="small-unit-sport-chip ${smallUnit.concepts?.includes(concept) ? "selected" : ""}">
                                <input type="checkbox" data-small-concept="${smallPath}" value="${escapeHtml(concept)}" ${smallUnit.concepts?.includes(concept) ? "checked" : ""} />
                                <span>${escapeHtml(concept)}</span>
                              </label>`).join("")}
                            </div>
                          </div>` : ""}
                          ${moveMenuOpenPath === smallPath ? `
                          <div class="move-menu">
                            <p class="small-unit-label">이동할 중단원 선택</p>
                            ${moveTargets.length ? moveTargets.map((target) => `
                              <button type="button" class="move-menu-option" data-move-source="${smallPath}" data-move-target="${unitIndex}:${target.groupIndex}:${target.middleIndex}">${escapeHtml(target.title)}</button>`).join("")
                              : '<p class="bulk-edit-note">이 대단원에는 옮길 다른 중단원이 없습니다.</p>'}
                          </div>` : ""}
                        </div>`;
                      }).join("")}
                    </div>
                    <div class="unit-add-actions">
                      <button class="add-small-unit" type="button" data-add-small="${middlePath}">+ 소단원 카드 추가</button>
                    </div>
                  </div>`;
                }).join("")}
                <div class="unit-add-actions">
                  <button class="add-unit-group" type="button" data-add-middle="${unitIndex}:${groupIndex}">+ 중단원 카드 추가</button>
                </div>
              </div>`).join("")}
        </article>`;
      }).join("")}
    </div>
    ${sportsCulture ? `<div class="unit-add-actions"><button class="add-unit-group" type="button" id="addUnitDomainButton">+ 대단원 카드 추가</button></div>` : ""}
    ${renderPagePreviewModal()}`;
}

// ── 03단계 단원 순서: 손잡이(⠿)를 끌어 놓아 옮긴다 ──
// 대단원끼리, 같은 대단원 안의 중단원끼리, 같은 대단원 안의 소단원끼리 옮길 수 있다.
// 소단원을 다른 중단원 제목 위에 놓으면 그 중단원 맨 끝으로 들어간다.
let unitDragSource = null;

function dragHandle(kind, path, label) {
  return `<span class="drag-handle" draggable="true" data-drag-kind="${kind}" data-drag-path="${path}" title="끌어서 ${label} 순서 바꾸기" aria-label="${label} 끌어서 옮기기">⠿</span>`;
}

function unitListAt(kind, path) {
  const [unitIndex, groupIndex, middleIndex, smallIndex] = String(path).split(":").map(Number);
  if (kind === "unit") return { list: state.units, index: unitIndex, unitIndex };
  const group = state.units[unitIndex].subdomainGroups[groupIndex];
  if (kind === "middle") return { list: group.middleUnits, index: middleIndex, unitIndex };
  return { list: group.middleUnits[middleIndex].smallUnits, index: smallIndex, unitIndex };
}

function canDropUnitItem(source, target) {
  if (!source) return false;
  const targetKind = target.dataset.dropKind;
  const sameUnit = () => source.path.split(":")[0] === target.dataset.dropPath.split(":")[0];
  if (source.kind === "unit") return targetKind === "unit";
  if (source.kind === "middle") return targetKind === "middle" && sameUnit();
  return (targetKind === "small" || targetKind === "middle") && sameUnit();
}

function clearUnitDropMarks() {
  document.querySelectorAll(".drop-before, .drop-after, .drop-into, .dragging").forEach((element) => element.classList.remove("drop-before", "drop-after", "drop-into", "dragging"));
}

function dropUnitItem(source, targetKind, targetPath, after) {
  const from = unitListAt(source.kind, source.path);
  let to;
  let insertAt;
  if (source.kind === "small" && targetKind === "middle") {
    to = unitListAt("small", `${targetPath}:0`);
    insertAt = to.list.length;
  } else {
    to = unitListAt(targetKind, targetPath);
    insertAt = to.index + (after ? 1 : 0);
  }
  if (from.list === to.list && from.index < insertAt) insertAt -= 1;
  if (from.list === to.list && from.index === insertAt) return;
  if (from.list !== to.list && from.list.length <= 1) {
    showToast(source.kind === "small" ? "중단원에는 소단원이 하나 이상 있어야 합니다." : "세부 영역에는 중단원이 하나 이상 있어야 합니다.");
    return;
  }
  const [item] = from.list.splice(from.index, 1);
  to.list.splice(insertAt, 0, item);
  moveMenuOpenPath = null;
  persist(source.kind === "unit" ? "대단원 순서 변경됨" : source.kind === "middle" ? "중단원 순서 변경됨" : "소단원 순서 변경됨");
  renderWorkspace();
}

function bindUnitDragAndDrop() {
  document.querySelectorAll("[data-drag-kind]").forEach((handle) => {
    handle.addEventListener("dragstart", (event) => {
      const block = handle.closest("[data-drop-kind]");
      unitDragSource = { kind: handle.dataset.dragKind, path: handle.dataset.dragPath };
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", unitDragSource.path);
      if (block) {
        event.dataTransfer.setDragImage(block, 24, 20);
        block.classList.add("dragging");
      }
    });
    handle.addEventListener("dragend", () => {
      unitDragSource = null;
      clearUnitDropMarks();
    });
  });
  document.querySelectorAll("[data-drop-kind]").forEach((target) => {
    const placement = (event) => {
      if (unitDragSource?.kind === "small" && target.dataset.dropKind === "middle") return "drop-into";
      const rect = target.getBoundingClientRect();
      return event.clientY > rect.top + rect.height / 2 ? "drop-after" : "drop-before";
    };
    target.addEventListener("dragover", (event) => {
      if (!canDropUnitItem(unitDragSource, target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".drop-before, .drop-after, .drop-into").forEach((element) => element.classList.remove("drop-before", "drop-after", "drop-into"));
      target.classList.add(placement(event));
    });
    target.addEventListener("dragleave", (event) => {
      if (!target.contains(event.relatedTarget)) target.classList.remove("drop-before", "drop-after", "drop-into");
    });
    target.addEventListener("drop", (event) => {
      if (!canDropUnitItem(unitDragSource, target)) return;
      event.preventDefault();
      event.stopPropagation();
      const source = unitDragSource;
      const mark = placement(event);
      unitDragSource = null;
      clearUnitDropMarks();
      dropUnitItem(source, target.dataset.dropKind, target.dataset.dropPath, mark === "drop-after");
    });
  });
}

function smallUnitOptions() {
  const options = [];
  state.units.forEach((unit, unitIndex) => {
    unit.subdomainGroups.forEach((group, groupIndex) => {
      group.middleUnits.forEach((middle, middleIndex) => {
        const middlePosition = middleUnitPosition(unit, groupIndex, middleIndex);
        const middleNumber = unitNumberLabel(unitIndex, middlePosition);
        middle.smallUnits.forEach((small, smallIndex) => {
          const smallNumber = unitNumberLabel(unitIndex, middlePosition, smallIndex + 1);
          options.push({
            key: `${unitIndex}:${groupIndex}:${middleIndex}:${smallIndex}`,
            domain: unit.domain,
            middleTitle: `${middleNumber}. ${middle.title}`,
            smallTitle: `${smallNumber}. ${small.title}`,
            sourceActivity: small.sourceActivity,
            subdomain: group.subtitle || "",
            lessonType: small.lessonType || "",
            pages: small.pages,
            hours: small.hours,
            standardCodes: Array.isArray(small.standardCodes) ? [...small.standardCodes] : [],
            sports: Array.isArray(small.sports) ? [...small.sports] : [],
            concepts: Array.isArray(small.concepts) ? [...small.concepts] : [],
            sportMode: ["none", "examples", "primary"].includes(small.sportMode) ? small.sportMode : inferSportsCultureSportMode({ middleTitle: middle.title, smallTitle: small.title }),
            contentType: ["theory", "practice"].includes(small.contentType) ? small.contentType : inferSportsCultureContentType({ middleTitle: middle.title, smallTitle: small.title }),
            supportMode: ["activity", "concept"].includes(small.supportMode) ? small.supportMode : "",
          });
        });
      });
    });
  });
  return options;
}

function canvasWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  });
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => {
    const clipped = index === maxLines - 1 && lines.length > maxLines ? `${item.replace(/[.…]?$/, "")}…` : item;
    context.fillText(clipped, x, y + index * lineHeight);
  });
  return y + Math.min(lines.length, maxLines) * lineHeight;
}

function drawRoundedRect(context, x, y, width, height, radius, fill, stroke = null) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.stroke();
  }
}

// canvasWrappedText와 달리 줄 수를 제한하지 않고 전체 줄을 배열로 반환한다 — 원고 PDF는
// 미리보기가 아니라 전체 본문을 다 보여줘야 하므로 잘라내면 안 된다.
function wrapTextLines(context, text, maxWidth) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  });
  if (line) lines.push(line);
  return lines;
}

// 원고 PDF(교과서·지도서)는 HWPX처럼 서버·외부 서비스 없이, 이미 PNG 저장에 쓰던 것과 같은
// <canvas> 텍스트 그리기를 재사용해 A4 여러 쪽에 흘려 넣은 뒤 jsPDF로 이미지째 붙인다(한글
// 폰트를 PDF에 임베드할 필요 없이 시스템 폰트로 그려서 그대로 이미지화하는 방식).
// 구글 문서·시트에서 흔히 보이는 팔레트 — 파랑 강조, 옅은 회색 격자선, 진회색 본문.
const PRINT_DOC_PALETTE = {
  accent: "#1a73e8",
  accentSoft: "#e8f0fe",
  border: "#dadce0",
  text: "#202124",
  muted: "#5f6368",
  boxTint: "#fef7e0",
  boxAccent: "#f9ab00",
  boxAccentText: "#7f5300",
};
const PRINT_DOC_FONT_STACK = "'Roboto','Google Sans','Malgun Gothic',sans-serif";

function createPrintDocument() {
  const pageWidth = 794;
  const pageHeight = 1123;
  const margin = 50;
  const scale = 2;
  const contentWidth = pageWidth - margin * 2;
  const canvases = [];
  let context = null;
  let y = margin;

  function newPage() {
    const canvas = document.createElement("canvas");
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = PRINT_DOC_PALETTE.accent;
    context.fillRect(0, 0, pageWidth, 6);
    canvases.push(canvas);
    y = margin;
  }
  newPage();

  function ensureSpace(height) {
    if (y + height > pageHeight - margin) newPage();
  }

  // 문서 제목 — 구글 문서 제목처럼 굵은 큰 글씨 + 파란 밑줄 하나.
  function title(text) {
    ensureSpace(34);
    context.font = `700 22px ${PRINT_DOC_FONT_STACK}`;
    context.fillStyle = PRINT_DOC_PALETTE.text;
    context.fillText(text, margin, y + 18);
    y += 26;
    context.strokeStyle = PRINT_DOC_PALETTE.accent;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(margin, y);
    context.lineTo(margin + 64, y);
    context.stroke();
    y += 18;
  }

  // 파란 바탕의 굵은 구획 제목줄 — 구글 사이트 도구의 섹션 헤더 느낌.
  function sectionBar(text) {
    ensureSpace(30);
    drawRoundedRect(context, margin, y, contentWidth, 26, 5, PRINT_DOC_PALETTE.accent);
    context.fillStyle = "#ffffff";
    context.font = `700 12.5px ${PRINT_DOC_FONT_STACK}`;
    context.fillText(text, margin + 12, y + 17);
    y += 26 + 10;
  }

  function paragraph(text, { size = 10.5, color = PRINT_DOC_PALETTE.muted, indent = 0 } = {}) {
    if (!text) return;
    context.font = `${size}px ${PRINT_DOC_FONT_STACK}`;
    const lineHeight = size * 1.55;
    const lines = wrapTextLines(context, text, contentWidth - indent);
    lines.forEach((line) => {
      ensureSpace(lineHeight);
      context.fillStyle = color;
      context.fillText(line, margin + indent, y + size);
      y += lineHeight;
    });
    y += lineHeight * 0.3;
  }

  function gap(height = 12) {
    y += height;
  }

  // 구획 안의 소제목 — 띠 없이 굵은 파란 글씨만.
  function subheading(text) {
    ensureSpace(30);
    context.font = `700 12px ${PRINT_DOC_FONT_STACK}`;
    context.fillStyle = PRINT_DOC_PALETTE.accent;
    context.fillText(text, margin, y + 13);
    y += 22;
  }

  // 글머리 항목: 굵은 첫 줄(핵심어) 아래에 설명을 들여 쓴다. 표 칸 없이 읽기 쉽게.
  function bulletItem(lead, detail = "", { indent = 16 } = {}) {
    const size = 10.5;
    const lineHeight = size * 1.6;
    context.font = `700 ${size}px ${PRINT_DOC_FONT_STACK}`;
    const leadLines = wrapTextLines(context, lead || "", contentWidth - indent);
    context.font = `${size}px ${PRINT_DOC_FONT_STACK}`;
    const detailLines = detail ? wrapTextLines(context, detail, contentWidth - indent) : [];
    ensureSpace(lineHeight * Math.min(3, leadLines.length + detailLines.length));
    context.fillStyle = PRINT_DOC_PALETTE.accent;
    context.font = `700 ${size}px ${PRINT_DOC_FONT_STACK}`;
    context.fillText("•", margin + 3, y + size);
    leadLines.forEach((line) => {
      ensureSpace(lineHeight);
      context.font = `700 ${size}px ${PRINT_DOC_FONT_STACK}`;
      context.fillStyle = PRINT_DOC_PALETTE.text;
      context.fillText(line, margin + indent, y + size);
      y += lineHeight;
    });
    detailLines.forEach((line) => {
      ensureSpace(lineHeight);
      context.font = `${size}px ${PRINT_DOC_FONT_STACK}`;
      context.fillStyle = PRINT_DOC_PALETTE.muted;
      context.fillText(line, margin + indent, y + size);
      y += lineHeight;
    });
    y += 6;
  }

  // 표 한 행 — cells: [{ text, width, bold, color, tag }] 또는 { items: [...], width, ... }.
  // items를 주면 항목 하나하나를 따로 줄바꿈해 "· 항목"으로 각자 새 줄에서 시작한다(지도안
  // 표처럼 문장이 한 덩어리로 붙지 않도록). 구글 시트 느낌의 옅은 회색 격자선과 헤더 행 옅은
  // 파랑 배경을 쓴다. tag가 있으면 그 칸 오른쪽에 작은 색 배지를 하나 더 그린다.
  function tableRow(cells, { header = false, tint = null } = {}) {
    const paddingX = 10;
    const paddingY = 7;
    const fontSize = header ? 11 : 10.5;
    const lineHeight = fontSize * 1.5;
    const fontFor = (bold) => `${bold ? "700 " : ""}${fontSize}px ${PRINT_DOC_FONT_STACK}`;
    const wrapped = cells.map((cell) => {
      context.font = fontFor(header || cell.bold);
      const innerWidth = cell.width - paddingX * 2;
      if (Array.isArray(cell.items)) {
        return cell.items.flatMap((item) => wrapTextLines(context, `· ${item}`, innerWidth));
      }
      return wrapTextLines(context, cell.text || "", innerWidth);
    });
    const rowHeight = Math.max(...wrapped.map((lines) => Math.max(1, lines.length) * lineHeight)) + paddingY * 2;
    ensureSpace(rowHeight);
    const rowTop = y;
    context.fillStyle = header ? PRINT_DOC_PALETTE.accentSoft : (tint || "#ffffff");
    context.fillRect(margin, rowTop, contentWidth, rowHeight);
    let cx = margin;
    cells.forEach((cell, index) => {
      context.font = fontFor(header || cell.bold);
      context.fillStyle = header ? PRINT_DOC_PALETTE.accent : (cell.color || PRINT_DOC_PALETTE.text);
      wrapped[index].forEach((line, lineIndex) => {
        context.fillText(line, cx + paddingX, rowTop + paddingY + fontSize + lineIndex * lineHeight);
      });
      if (cell.tag) {
        context.font = `700 8.5px ${PRINT_DOC_FONT_STACK}`;
        const tagWidth = context.measureText(cell.tag).width + 12;
        const tagX = cx + cell.width - paddingX - tagWidth;
        drawRoundedRect(context, tagX, rowTop + paddingY - 2, tagWidth, 15, 7.5, PRINT_DOC_PALETTE.boxAccent);
        context.fillStyle = "#ffffff";
        context.fillText(cell.tag, tagX + 6, rowTop + paddingY + 9);
      }
      cx += cell.width;
    });
    context.strokeStyle = PRINT_DOC_PALETTE.border;
    context.lineWidth = 1;
    context.strokeRect(margin, rowTop, contentWidth, rowHeight);
    let vx = margin;
    cells.slice(0, -1).forEach((cell) => {
      vx += cell.width;
      context.beginPath();
      context.moveTo(vx, rowTop);
      context.lineTo(vx, rowTop + rowHeight);
      context.stroke();
    });
    y = rowTop + rowHeight;
  }

  // 키-값 표(지도서 항목, 프로젝트 메타정보 등) 한 줄을 그린다. bulletItems가 있으면 내용 칸에
  // 줄바꿈된 항목 목록으로 채운다(문장 하나 다 이어붙이지 않고 지도안 표처럼 항목별로 분리).
  function keyValueRow(label, value, { bulletItems = null, tint = null, tag = null } = {}) {
    const labelWidth = 108;
    const valueWidth = contentWidth - labelWidth;
    tableRow(
      [
        { text: label, width: labelWidth, bold: true, color: PRINT_DOC_PALETTE.accent },
        bulletItems ? { items: bulletItems, width: valueWidth, tag } : { text: value || "", width: valueWidth, tag },
      ],
      { tint },
    );
  }

  return { canvases, title, sectionBar, subheading, bulletItem, paragraph, gap, tableRow, keyValueRow, ensureSpace, contentWidth };
}

function downloadCanvasPagesAsPdf(filename, canvases) {
  triggerBlobDownload(canvasPagesToPdfBlob(canvases), filename);
}

// 02단계 "이전 개정 대비 달라진 점 / 집필 시 강조할 점" 카드를 화면과 같은 내용으로
// PDF로 내보낸다 — 초등은 학년군, 고등은 과목명으로 해당하는 분석 자료를 찾는다.
function currentCurriculumDevelopmentNotes() {
  if (isHighSchoolProject()) return SECONDARY_CURRICULUM_DEVELOPMENT_NOTES[state.project.subject] || null;
  if (state.project.schoolLevel === "중학교") return null;
  const grade = Number.parseInt(state.project.grade, 10) || 3;
  const gradeBand = grade <= 4 ? "3~4학년군" : "5~6학년군";
  return CURRICULUM_DEVELOPMENT_NOTES[gradeBand] || null;
}

// 02단계 "성취기준·고려사항" 문서: 영역마다 성취기준(코드·문장 → 해설)과 적용 시 고려 사항을 차례로.
function buildCurriculumStandardsPdfPages() {
  const rows = curriculumDownloadRows().slice(1);
  if (!rows.length) return null;
  const doc = createPrintDocument();
  const grade = Number.parseInt(state.project.grade, 10) || 3;
  const scope = isHighSchoolProject() || state.project.schoolLevel === "중학교" ? state.project.subject : grade <= 4 ? "3~4학년군" : "5~6학년군";
  doc.title(`성취기준과 적용 시 고려 사항 · ${scope}`);
  const domains = [...new Set(rows.map((row) => row[0]))];
  domains.forEach((domain, index) => {
    const domainRows = rows.filter((row) => row[0] === domain);
    const standards = domainRows.filter((row) => row[1] !== "적용 시 고려 사항");
    const considerations = domainRows.filter((row) => row[1] === "적용 시 고려 사항");
    if (index) doc.gap(10);
    doc.sectionBar(`${domain} · 성취기준 ${standards.length}개`);
    standards.forEach(([, code, statement, explanation]) => doc.bulletItem(`${code} ${statement}`, explanation ? `해설: ${explanation}` : ""));
    considerations.forEach(([, , text]) => {
      doc.gap(4);
      doc.subheading("적용 시 고려 사항");
      String(text || "").split(/\n+/).map((line) => line.trim()).filter(Boolean).forEach((line) => doc.paragraph(line, { indent: 16, color: PRINT_DOC_PALETTE.text }));
    });
  });
  return doc.canvases;
}

function buildCurriculumDevelopmentNotePdfPages() {
  const notesByDomain = currentCurriculumDevelopmentNotes();
  if (!notesByDomain) return null;
  const doc = createPrintDocument();
  const keywordWidth = 210;
  const detailWidth = doc.contentWidth - keywordWidth;
  const noteRow = (item) => doc.tableRow([
    { text: item.keyword, width: keywordWidth, bold: true, color: PRINT_DOC_PALETTE.accent },
    { text: item.detail, width: detailWidth },
  ]);
  void noteRow;
  doc.title(`교육과정 분석 및 집필 방향 · ${state.project.name || "프로젝트"}`);
  Object.entries(notesByDomain).forEach(([domain, note], index) => {
    if (index) doc.gap(10);
    doc.sectionBar(domain);
    doc.subheading("1. 이전 개정 대비 달라진 점");
    note.changes.forEach((item) => doc.bulletItem(item.keyword, item.detail));
    doc.gap(6);
    doc.subheading("2. 집필 시 강조할 점");
    note.emphasis.forEach((item) => doc.bulletItem(item.keyword, item.detail));
  });
  return doc.canvases;
}

function buildTextbookManuscriptPdfPages(entry) {
  const doc = createPrintDocument();
  doc.title(`${entrySubjectLabel(entry)} 교과서 원고`);
  doc.keyValueRow("체제안", entry.frameworkName);
  doc.keyValueRow("소단원", entry.smallUnitLabel);
  doc.keyValueRow(isElementaryEntry(entry) ? "수업 유형" : "소단원 성격", entry.primaryTypeLabel);
  if (isElementaryEntry(entry)) doc.keyValueRow("차시", entry.lessonRange || "");
  else doc.keyValueRow("종목", `${sportsCultureSportModeLabel(entry.sportMode)} · ${entry.carrierSport || "특정 종목 없음"}`);
  doc.keyValueRow("성취기준", (entry.traceability?.standardCodes || []).join(", "));
  doc.gap(14);
  entry.spreads.forEach((spread, index) => {
    const manuscript = spread.textbook_manuscript || {};
    doc.sectionBar(`펼침면 ${index + 1} · ${spread.left_page}~${spread.right_page}쪽${spread.lesson_label ? ` · ${spread.lesson_label}` : ""} — ${manuscript.headline || spread.title || ""}`);
    doc.keyValueRow("학습 목표", manuscript.learningGoal || "");
    if (manuscript.openingQuestion) doc.keyValueRow("생각 열기", manuscript.openingQuestion);
    if (manuscript.deck) doc.keyValueRow("도입문", manuscript.deck);
    doc.gap(6);
    const numberWidth = 34;
    const titleWidth = 148;
    const bodyWidth = doc.contentWidth - numberWidth - titleWidth;
    (manuscript.sections || []).forEach((section) => {
      doc.tableRow([
        { text: String(section.label ? section.label.replace("활동 ", "활동\n") : section.number ?? ""), width: numberWidth, bold: true, color: PRINT_DOC_PALETTE.accent },
        { text: section.title || "", width: titleWidth, bold: true, tag: section.boxType || null },
        { items: (section.paragraphs || []).filter(Boolean), width: bodyWidth },
      ], { tint: section.boxType ? PRINT_DOC_PALETTE.boxTint : null });
    });
    doc.gap(6);
    const visualLines = manuscript.visuals
      ? [
          ...(manuscript.visuals.left || []).map((item) => `(좌) [${item.size}/${item.placement}] ${item.description}`),
          ...(manuscript.visuals.right || []).map((item) => `(우) [${item.size}/${item.placement}] ${item.description}`),
        ]
      : (manuscript.visualBriefs || []).map((brief) => brief);
    if (visualLines.length) doc.keyValueRow("사진·삽화 발주", null, { bulletItems: visualLines });
    doc.gap(18);
  });
  return doc.canvases;
}

function buildTeacherGuideManuscriptPdfPages(entry) {
  const doc = createPrintDocument();
  doc.title(`${entrySubjectLabel(entry)} 지도서 원고`);
  doc.keyValueRow("연계 교과서", entry.smallUnitLabel);
  doc.keyValueRow("체제안", entry.frameworkName);
  if (isElementaryEntry(entry)) doc.keyValueRow("수업 유형", `${entry.primaryTypeLabel || ""} · 원 활동 ${entry.carrierSport || ""}`);
  else doc.keyValueRow("종목", `${sportsCultureSportModeLabel(entry.sportMode)} · ${entry.carrierSport || "특정 종목 없음"}`);
  doc.keyValueRow("성취기준", (entry.traceability?.standardCodes || []).join(", "));
  if (entry.teacherGuide?.annualPlanLink) doc.keyValueRow("차시·분량", entry.teacherGuide.annualPlanLink);
  doc.gap(14);
  entry.spreads.forEach((spread, index) => {
    const guide = spread.teacher_guide || {};
    doc.sectionBar(`${spread.lesson_label || `${index + 1}차시군`} · 교과서 ${spread.left_page}~${spread.right_page}쪽`);
    doc.keyValueRow("수업 목표", null, { bulletItems: guide.lessonGoals || [] });
    doc.keyValueRow("준비물", (guide.preparation || []).join(" · "));
    doc.keyValueRow("수업 흐름", null, { bulletItems: (guide.lessonFlow || []).map((item) => `${item.stage}: ${item.guidance}`) });
    doc.keyValueRow("지도상의 유의점", null, { bulletItems: guide.teachingNotes || [] });
    doc.keyValueRow("핵심 발문", null, { bulletItems: guide.questions || [] });
    doc.keyValueRow("예상 답변", null, { bulletItems: guide.expectedResponses || [] });
    doc.keyValueRow(isElementaryEntry(entry) ? "수준별 지도·대체 활동" : "개별화·대체 참여", null, { bulletItems: guide.differentiation || [] });
    doc.keyValueRow(isElementaryEntry(entry) ? "안전 지도" : "안전·포용", guide.safety || "");
    doc.keyValueRow("평가", (guide.assessment || []).join(" · "));
    doc.gap(18);
  });
  return doc.canvases;
}

// 두 생성 제공자의 삽화 모양이 다르다 — 외부 AI는 visuals:{left,right}(크기·배치·설명·이미지)를,
// 내부 규칙 기반 제공자는 visualBriefs(문자열 배열)를 준다. PNG 미리보기도 PPT와 같은 규칙으로 맞춘다.
function manuscriptPageVisuals(manuscript, pageIndex) {
  if (manuscript.visuals) return (pageIndex === 0 ? manuscript.visuals.left : manuscript.visuals.right) || [];
  const briefs = manuscript.visualBriefs || [];
  const half = Math.ceil(briefs.length / 2);
  return (pageIndex === 0 ? briefs.slice(0, half) : briefs.slice(half)).map((description) => ({ description }));
}

function loadCanvasImage(base64) {
  return new Promise((resolve) => {
    if (!base64) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `data:image/png;base64,${base64}`;
  });
}

async function drawDraftSpreadCanvas(canvas, entry, spread) {
  const context = canvas.getContext("2d");
  const accent = { balanced: "#596fc1", activity: "#db7048", creative: "#347f72" }[entry.frameworkId] || "#596fc1";
  const accentDark = { balanced: "#3e53a4", activity: "#ae4931", creative: "#236457" }[entry.frameworkId] || "#3e53a4";
  const pale = { balanced: "#eef1fb", activity: "#fff1eb", creative: "#eaf6f2" }[entry.frameworkId] || "#eef1fb";
  const manuscript = spread.textbook_manuscript || {};
  const sections = Array.isArray(manuscript.sections) ? manuscript.sections : [];
  const sectionSplit = manuscriptPageSplit(manuscript);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#cfd4dc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const pages = [
    { x: 18, sections: sections.slice(0, sectionSplit), visuals: manuscriptPageVisuals(manuscript, 0) },
    { x: 704, sections: sections.slice(sectionSplit), visuals: manuscriptPageVisuals(manuscript, 1) },
  ];
  const allVisuals = pages.flatMap((page) => page.visuals);
  const loadedImages = await Promise.all(allVisuals.map((visual) => loadCanvasImage(visual.imageBase64)));
  const imageByVisual = new Map(allVisuals.map((visual, index) => [visual, loadedImages[index]]));
  pages.forEach((page, pageIndex) => {
    drawRoundedRect(context, page.x, 18, 678, 864, 5, "#ffffff", "#c3c8d0");
    if (pageIndex === 0) {
      context.fillStyle = accent;
      context.fillRect(page.x, 18, 62, 864);
      drawRoundedRect(context, page.x + 35, 18, 130, 178, 48, "#ffffff");
      context.fillStyle = accent;
      context.font = "900 66px 'Malgun Gothic', sans-serif";
      context.fillText(String((spread.left_page || 1)).padStart(2, "0"), page.x + 72, 133);
      context.save();
      context.translate(page.x + 26, 400);
      context.rotate(-Math.PI / 2);
      context.fillStyle = "#ffffff";
      context.font = "800 15px 'Malgun Gothic', sans-serif";
      context.fillText(entry.smallUnitLabel || entrySubjectLabel(entry), 0, 0);
      context.restore();
    }
    const contentX = page.x + (pageIndex === 0 ? 94 : 42);
    const contentWidth = pageIndex === 0 ? 544 : 594;
    let y = 62;
    if (pageIndex === 0) {
      context.fillStyle = "#171b21";
      context.font = "900 32px 'Malgun Gothic', sans-serif";
      y = canvasWrappedText(context, manuscript.headline || spread.title, contentX, y, contentWidth, 39, 2) + 7;
      context.fillStyle = accentDark;
      context.font = "700 13px 'Malgun Gothic', sans-serif";
      context.fillText(`${spread.lesson_label ? `${spread.lesson_label}  ·  ` : ""}학습 목표  |  ${manuscript.learningGoal || spread.intro}`.slice(0, 82), contentX, y);
      y += 30;
      drawRoundedRect(context, contentX, y, contentWidth, 44, 8, pale);
      context.fillStyle = accentDark;
      context.font = "700 13px 'Malgun Gothic', sans-serif";
      canvasWrappedText(context, `생각 열기  |  ${manuscript.openingQuestion || spread.intro}`, contentX + 14, y + 18, contentWidth - 28, 17, 2);
      y += 66;
    } else {
      context.save();
      context.fillStyle = accentDark;
      context.globalAlpha = 0.6;
      context.font = "700 10px 'Malgun Gothic', sans-serif";
      context.textAlign = "right";
      context.fillText(`${entry.primaryTypeLabel || entrySubjectLabel(entry)} · ${spread.role}`, page.x + 664, 34);
      context.restore();
    }
    page.sections.forEach((section) => {
      const boxTop = y - 10;
      context.fillStyle = accent;
      context.beginPath();
      context.arc(contentX + 12, y + 3, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#ffffff";
      context.font = "800 12px 'Malgun Gothic', sans-serif";
      context.textAlign = "center";
      context.fillText(section.number, contentX + 12, y + 7);
      context.textAlign = "left";
      context.fillStyle = "#24272c";
      context.font = "800 19px 'Malgun Gothic', sans-serif";
      context.fillText(section.label ? `${section.label}  ${section.title}` : section.title, contentX + 34, y + 7);
      if (section.boxType) {
        context.font = "800 10px 'Malgun Gothic', sans-serif";
        const tagWidth = context.measureText(section.boxType).width + 14;
        drawRoundedRect(context, contentX + contentWidth - tagWidth, y - 8, tagWidth, 18, 9, "#b5651d");
        context.fillStyle = "#ffffff";
        context.fillText(section.boxType, contentX + contentWidth - tagWidth + 7, y + 5);
      }
      y += 31;
      (section.paragraphs || []).slice(0, 5).forEach((paragraph) => {
        context.fillStyle = "#30343a";
        context.font = "11px 'Malgun Gothic', sans-serif";
        y = canvasWrappedText(context, paragraph, contentX, y, contentWidth, 15, 2) + 5;
      });
      if (section.boxType) {
        context.strokeStyle = "#d7a34a";
        context.lineWidth = 1.5;
        context.strokeRect(contentX - 8, boxTop, contentWidth + 16, y - boxTop + 4);
      }
      y += 7;
    });
    const visualY = Math.max(675, Math.min(725, y + 8));
    context.fillStyle = pale;
    context.beginPath();
    context.moveTo(page.x, visualY + 60);
    context.bezierCurveTo(page.x + 180, visualY - 25, page.x + 420, visualY + 55, page.x + 678, visualY - 5);
    context.lineTo(page.x + 678, 882);
    context.lineTo(page.x, 882);
    context.closePath();
    context.fill();
    const visuals = page.visuals;
    if (visuals.length) {
      const gap = 14;
      const boxWidth = (594 - gap * (visuals.length - 1)) / visuals.length;
      const boxHeight = 108;
      visuals.forEach((visual, visualIndex) => {
        const boxX = page.x + 42 + visualIndex * (boxWidth + gap);
        const boxY = visualY + 50;
        const image = imageByVisual.get(visual);
        if (image) {
          context.drawImage(image, boxX, boxY, boxWidth, boxHeight);
          context.strokeStyle = "#c3c8d0";
          context.strokeRect(boxX, boxY, boxWidth, boxHeight);
        } else {
          drawRoundedRect(context, boxX, boxY, boxWidth, boxHeight, 8, visualIndex % 2 === 0 ? accentDark : accent);
          context.fillStyle = "rgba(255,255,255,.2)";
          context.fillRect(boxX + 10, boxY + 10, boxWidth - 20, 48);
        }
        context.fillStyle = "#263039";
        context.font = "700 11px 'Malgun Gothic', sans-serif";
        canvasWrappedText(context, visual.description || "편집 이미지 영역", boxX, boxY + boxHeight + 16, boxWidth, 14, 3);
      });
    }
    context.fillStyle = "#697078";
    context.font = "12px 'Malgun Gothic', sans-serif";
    context.fillText(`${pageIndex === 0 ? spread.left_page : spread.right_page}  |  ${entrySubjectLabel(entry)}`, page.x + 292, 858);
  });
  context.fillStyle = "rgba(0,0,0,.08)";
  context.fillRect(695, 24, 8, 852);
}

// 화면 미리보기·출력물에서 과목 이름을 쓰는 곳(스포츠 문화/초등 체육 공용).
function entrySubjectLabel(entry) {
  return entry?.subjectLabel || "스포츠 문화";
}

function isElementaryEntry(entry) {
  return entry?.profileId === "elementary-pe-2022";
}

function renderSpreadSectionHtml(section) {
  return `
    <div class="spread-section${section.boxType ? " spread-section-boxed" : ""}">
      <div class="spread-section-head">
        ${section.label ? `<span class="spread-section-label">${escapeHtml(section.label)}</span>` : `<span class="spread-section-number">${escapeHtml(String(section.number ?? ""))}</span>`}<h3>${escapeHtml(section.title || "")}</h3>
        ${section.boxType ? `<span class="spread-section-boxtype">${escapeHtml(section.boxType)}</span>` : ""}
      </div>
      ${(section.paragraphs || []).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </div>`;
}

// AI-generated manuscripts decide their own per-page visual layout (variable count/size/
// placement); the older rule-based engine still emits a fixed 3-box visualBriefs array.
// Normalize both into the same {size, placement, description, imageBase64} item shape.
function manuscriptSideVisuals(manuscript, pageIndex) {
  if (manuscript.visuals) {
    const side = pageIndex === 0 ? "left" : "right";
    return manuscript.visuals[side] || [];
  }
  const briefs = manuscript.visualBriefs || [];
  const half = Math.ceil(briefs.length / 2);
  return (pageIndex === 0 ? briefs.slice(0, half) : briefs.slice(half)).map((description) => ({ description, placement: "bottom" }));
}

function renderVisualItemHtml(item) {
  return `
    <div class="spread-visual-item size-${escapeHtml(item.size || "small")} placement-${escapeHtml(item.placement || "bottom")}${item.imageBase64 ? " has-image" : ""}">
      ${item.imageBase64 ? `<img src="data:image/png;base64,${item.imageBase64}" alt="${escapeHtml(item.description || "")}" />` : ""}
      <span>${escapeHtml(item.description || "편집 이미지 영역")}</span>
    </div>`;
}

function renderSpreadVisualGroup(items) {
  if (!items.length) return "";
  return `<div class="spread-visual-flex">${items.map(renderVisualItemHtml).join("")}</div>`;
}

// placement이 실제 지면 위치에도 반영되도록 나눈다: top은 본문 위, background(실제 이미지가
// 있을 때만)는 페이지 전체 배경, 나머지(bottom/left/right/inline 및 이미지 없는 background)는
// 본문 아래 한 줄에 놓는다.
function splitVisualsByPlacement(items) {
  const backgroundItem = items.find((item) => item.placement === "background" && item.imageBase64);
  const remaining = items.filter((item) => item !== backgroundItem);
  const topItems = remaining.filter((item) => item.placement === "top");
  const bottomItems = remaining.filter((item) => item.placement !== "top");
  return { backgroundItem, topItems, bottomItems };
}

function renderSpreadPageVisuals(items) {
  const { backgroundItem, topItems, bottomItems } = splitVisualsByPlacement(items);
  return {
    backgroundHtml: backgroundItem
      ? `<img class="spread-page-background-image" src="data:image/png;base64,${backgroundItem.imageBase64}" alt="" aria-hidden="true" />`
      : "",
    topHtml: renderSpreadVisualGroup(topItems),
    bottomHtml: renderSpreadVisualGroup(bottomItems),
  };
}

// 왼쪽 쪽에 놓을 절 개수. 조판 편집기에서 절을 다음 쪽으로 넘기면 pageSplit에 기록되고,
// 미리보기·PNG·PPT도 같은 경계를 따른다. 기록이 없으면 절을 반씩 나눈다.
function manuscriptPageSplit(manuscript) {
  const count = Array.isArray(manuscript?.sections) ? manuscript.sections.length : 0;
  const split = Number(manuscript?.pageSplit);
  return Number.isInteger(split) && split >= 0 && split <= count ? split : Math.ceil(count / 2);
}

function renderSpreadPageView(entry, spread) {
  const accentKey = { balanced: "balanced", activity: "activity", creative: "creative" }[entry.frameworkId] ? entry.frameworkId : "balanced";
  const manuscript = spread.textbook_manuscript || {};
  const sections = Array.isArray(manuscript.sections) ? manuscript.sections : [];
  const sectionSplit = manuscriptPageSplit(manuscript);
  const leftSections = sections.slice(0, sectionSplit);
  const rightSections = sections.slice(sectionSplit);
  const leftVisuals = renderSpreadPageVisuals(manuscriptSideVisuals(manuscript, 0));
  const rightVisuals = renderSpreadPageVisuals(manuscriptSideVisuals(manuscript, 1));
  return `
    <div class="spread-page-view spread-accent-${accentKey}">
      <div class="spread-page spread-page-left">
        <div class="spread-spine">
          <span class="spread-page-number">${String(spread.left_page || 1).padStart(2, "0")}</span>
          <span class="spread-spine-label">${escapeHtml(entry.smallUnitLabel || entrySubjectLabel(entry))}</span>
        </div>
        <div class="spread-page-body">
          ${leftVisuals.backgroundHtml}
          <h2 class="spread-headline">${escapeHtml(manuscript.headline || spread.title || "")}</h2>
          ${manuscript.subtitle ? `<p class="spread-subtitle">${escapeHtml(manuscript.subtitle)}</p>` : ""}
          <p class="spread-goal">${spread.lesson_label ? `<span class="spread-lesson-label">${escapeHtml(spread.lesson_label)}</span> ` : ""}<b>학습 목표</b> ${escapeHtml(manuscript.learningGoal || spread.intro || "")}</p>
          ${manuscript.openingQuestion ? `<div class="spread-opening-question"><b>생각 열기</b> ${escapeHtml(manuscript.openingQuestion)}</div>` : ""}
          ${leftVisuals.topHtml}
          ${leftSections.map(renderSpreadSectionHtml).join("")}
          ${leftVisuals.bottomHtml}
          <div class="spread-page-footer">${escapeHtml(String(spread.left_page || 1))} · ${escapeHtml(entrySubjectLabel(entry))}</div>
        </div>
      </div>
      <div class="spread-gutter"></div>
      <div class="spread-page spread-page-right">
        <div class="spread-page-body">
          ${rightVisuals.backgroundHtml}
          <p class="spread-role-label">${escapeHtml(entry.primaryTypeLabel || entrySubjectLabel(entry))} · ${escapeHtml(spread.role || "")}</p>
          ${rightVisuals.topHtml}
          ${rightSections.map(renderSpreadSectionHtml).join("")}
          ${rightVisuals.bottomHtml}
          <div class="spread-page-footer">${escapeHtml(String(spread.right_page || 2))} · ${escapeHtml(entrySubjectLabel(entry))}</div>
        </div>
      </div>
    </div>`;
}

// 렌더된 HTML에는 체크박스 checked만 넣었고 "부분 선택" 표시(indeterminate)는 DOM
// 속성으로만 줄 수 있어 렌더 후 여기서 계산한다. 행의 유형 체크박스가 하나도 없으면
// 그 행 자체가 없는 상태이므로 다루지 않는다.
function syncDraftFileRowCheckboxes() {
  document.querySelectorAll("[data-draft-file-row-checkbox]").forEach((rowCheckbox) => {
    const row = rowCheckbox.closest("tr");
    const typeBoxes = row ? [...row.querySelectorAll("[data-draft-file-checkbox]")] : [];
    if (!typeBoxes.length) {
      rowCheckbox.checked = false;
      rowCheckbox.indeterminate = false;
      return;
    }
    const checkedCount = typeBoxes.filter((box) => box.checked).length;
    rowCheckbox.checked = checkedCount === typeBoxes.length;
    rowCheckbox.indeterminate = checkedCount > 0 && checkedCount < typeBoxes.length;
  });
}

// 열 헤더 체크박스(PPT/교과서/지도서/이미지 앞)도 같은 방식 — 그 유형의 파일이 전부
// 선택돼 있으면 체크, 일부만 선택돼 있으면 부분 선택(대시) 표시.
function syncDraftFileColumnCheckboxes() {
  const allTypeCheckboxes = [...document.querySelectorAll("[data-draft-file-checkbox]")];
  document.querySelectorAll("[data-draft-file-column-checkbox]").forEach((columnCheckbox) => {
    const type = columnCheckbox.dataset.draftFileColumnCheckbox;
    const boxes = allTypeCheckboxes.filter((box) => box.dataset.draftFileCheckbox.split(":")[2] === type);
    if (!boxes.length) {
      columnCheckbox.checked = false;
      columnCheckbox.indeterminate = false;
      return;
    }
    const checkedCount = boxes.filter((box) => box.checked).length;
    columnCheckbox.checked = checkedCount === boxes.length;
    columnCheckbox.indeterminate = checkedCount > 0 && checkedCount < boxes.length;
  });
}

function renderDraftCanvases() {
  document.querySelectorAll("[data-draft-canvas]").forEach((canvas) => {
    const [batchIndex, entryIndex, spreadIndex] = canvas.dataset.draftCanvas.split(":").map(Number);
    const entry = state.frameworkDraftLog?.[batchIndex]?.entries?.[entryIndex];
    const spread = entry?.spreads?.[spreadIndex];
    if (entry && spread) drawDraftSpreadCanvas(canvas, entry, spread);
  });
}

// 디자인 시안이 있으면 시안을, 없으면 원고 미리보기(기본 틀)를 보여 준다.
function renderDraftMockupViews(entry, batchIndex, entryIndex) {
  const mockups = state.designMockups || {};
  const keys = entry.spreads.map((_, spreadIndex) => designcraftMockupKey({ batchIndex, entryIndex }, spreadIndex));
  if (!keys.some((key) => mockups[key]?.imageId)) {
    const failure = keys.map((key) => mockups[key]?.error).find(Boolean);
    return `<div class="draft-mockup-missing ${failure ? "failed" : ""}"><span>${failure ? `디자인 시안을 그리지 못했습니다: ${escapeHtml(failure)} — 다시 눌러 그려 주세요.` : "아직 디자인 시안이 없습니다."} 아래는 원고 배치 미리보기입니다.</span><button class="secondary-button" type="button" data-entry-mockup-draw="${batchIndex}:${entryIndex}">디자인 시안 그리기 (${entry.spreads.length}장)</button></div>`;
  }
  return `
    <div class="draft-mockup-list">
      ${entry.spreads.map((spread, spreadIndex) => {
        const mockup = mockups[keys[spreadIndex]];
        return `<figure class="draft-mockup">
          ${mockup?.imageId ? `<img src="${designcraftMockupUrl(mockup.editedAt && mockup.previewId ? mockup.previewId : mockup.imageId)}" alt="${spreadIndex + 1}번째 펼침면 디자인 시안" />` : `<div class="mockup-empty">시안 없음${mockup?.error ? `<small>${escapeHtml(mockup.error)}</small>` : ""}</div>`}
          <figcaption>
            <span>${spreadIndex + 1}번째 펼침면${mockup?.editedAt ? " · 고친 글 반영 미리보기" : ""}</span>
            <span class="draft-image-actions">
              ${mockup?.imageId ? `<button type="button" data-mockup-edit="${batchIndex}:${entryIndex}:${spreadIndex}" title="시안 위 글자를 직접 고칩니다. 처음 열 때 AI가 글 위치를 읽느라 1~3분 걸립니다.">글 고치기</button><a href="${designcraftMockupUrl(mockup.imageId)}" target="_blank" rel="noopener">크게 보기</a>` : ""}
              <button type="button" data-entry-mockup-redo="${batchIndex}:${entryIndex}:${spreadIndex}">${mockup?.imageId ? "다시 그리기" : "시안 그리기"}</button>
            </span>
          </figcaption>
        </figure>`;
      }).join("")}
    </div>`;
}

function renderSportsDraftImages(entry, batchIndex, entryIndex) {
  const mockupView = isElementaryPeProject() ? renderDraftMockupViews(entry, batchIndex, entryIndex) : "";
  if (mockupView.includes("draft-mockup-list")) return mockupView;
  return `${mockupView}
    <div class="draft-image-comparison-card">
      <div class="draft-image-meta">
        <b>${escapeHtml(entry.primaryTypeLabel || "스포츠 문화형")}</b>
        ${entry.secondaryTypeLabel ? `<span>+ ${escapeHtml(SPORTS_CULTURE_ACTIVITY_MODES.find((mode) => mode.id === entry.secondaryType)?.label || entry.secondaryTypeLabel)}</span>` : ""}
        <small>편집디자인 시안 · ${entry.spreads.length}개 펼침면 · 사진 영역은 발주 지시로 표시</small>
      </div>
      <div class="draft-spread-image-strip">
        ${entry.spreads.map((spread, spreadIndex) => `
          <figure class="draft-spread-image">
            ${renderSpreadPageView(entry, spread)}
            <canvas width="1400" height="900" class="draft-spread-export-canvas" data-draft-canvas="${batchIndex}:${entryIndex}:${spreadIndex}" aria-label="${escapeHtml(entry.frameworkName)} ${spreadIndex + 1}번 펼침면 PNG 저장용" aria-hidden="true"></canvas>
            <figcaption>
              <span>${spreadIndex + 1}번째 펼침면 · ${escapeHtml(spread.role)}</span>
              <span class="draft-image-actions"><button type="button" class="layout-editor-open-button" data-open-layout-editor="${batchIndex}:${entryIndex}:${spreadIndex}">조판 편집</button><button type="button" data-enlarge-draft-image>크게 보기</button><button type="button" data-download-draft-png="${batchIndex}:${entryIndex}:${spreadIndex}">PNG 저장</button></span>
            </figcaption>
          </figure>`).join("")}
      </div>
    </div>`;
}

function renderDraftTraceability(entry) {
  if (!entry?.traceability) return "";
  const trace = entry.traceability;
  const evidence = Array.isArray(entry.sourceEvidence) ? entry.sourceEvidence : [];
  return `
    <details class="draft-traceability">
      <summary>교육과정·근거·지도서 연결</summary>
      <div class="draft-traceability-grid">
        <section>
          <span>성취기준</span>
          <strong>${escapeHtml((trace.standardCodes || []).join(", "))}</strong>
          <small>지식·이해: ${escapeHtml((trace.knowledge || []).join(" · "))}</small>
          <small>과정·기능: ${escapeHtml((trace.process || []).join(" · "))}</small>
          <small>가치·태도: ${escapeHtml((trace.values || []).join(" · "))}</small>
        </section>
        <section>
          <span>평가 증거</span>
          <strong>${escapeHtml((trace.assessmentEvidence || []).join(" · "))}</strong>
          <small>${escapeHtml(entry.teacherGuide?.principle || "교과서 펼침면에서 지도서 수업 정보를 파생합니다.")}</small>
          <small>${escapeHtml(entry.teacherGuide?.annualPlanLink || "")}</small>
        </section>
      </div>
      <div class="draft-evidence-list">
        ${evidence.map((source) => `<span><b>${escapeHtml(source.id)}</b> · ${escapeHtml(source.role)}</span>`).join("")}
      </div>
    </details>`;
}

function sportsCultureSpecialDraftTargets() {
  const unitTargets = state.units.flatMap((unit, unitIndex) => {
    const standards = smallUnitOptions().filter((item) => item.domain === unit.domain).flatMap((item) => item.standardCodes || []);
    const base = { domain: unit.domain, middleTitle: unit.title || unit.domain, hours: 0, standardCodes: [...new Set(standards)], sportMode: "none", sports: [] };
    return [
      { ...base, key: `special:intro:${unitIndex}`, targetKind: "special", pageRole: "unit-intro", smallTitle: `${unit.domain} 단원 도입`, pages: Number(unit.introPages) || 2, specialTypeLabel: "대단원 도입" },
      { ...base, key: `special:closing:${unitIndex}`, targetKind: "special", pageRole: "unit-closing", smallTitle: `${unit.domain} 단원 마무리`, pages: Number(unit.wrapUpPages) || 2, specialTypeLabel: "대단원 마무리" },
    ];
  });
  const customTargets = (state.specialPages || []).map((page) => ({
    key: `special:custom:${page.id}`,
    targetKind: "special",
    pageRole: `special-${page.type}`,
    domain: page.domain || state.units[0]?.domain || "스포츠 문화",
    middleTitle: "특별 페이지",
    smallTitle: page.title,
    sourceActivity: page.title,
    hours: 0,
    pages: Number(page.pages) || 2,
    standardCodes: [],
    sportMode: "examples",
    sports: selectedSportsFor(state).slice(0, 3),
    specialTypeLabel: SPORTS_CULTURE_SPECIAL_PAGE_TYPES.find((type) => type.id === page.type)?.label || "특별 페이지",
    customId: page.id,
  }));
  return [...unitTargets, ...customTargets];
}

function sportsCultureDraftTargets() {
  return [
    ...smallUnitOptions().map((item) => ({ ...item, targetKind: "small-unit", pageRole: "small-unit" })),
    ...sportsCultureSpecialDraftTargets(),
  ];
}

function sportsCultureSmallUnitRecord(key) {
  if (!/^\d+:\d+:\d+:\d+$/.test(key || "")) return null;
  const [unitIndex, groupIndex, middleIndex, smallIndex] = key.split(":").map(Number);
  return state.units?.[unitIndex]?.subdomainGroups?.[groupIndex]?.middleUnits?.[middleIndex]?.smallUnits?.[smallIndex] || null;
}

function draftFileActionAttr(type, batchIndex, entryIndex) {
  if (type === "pptx") return `data-download-pptx="${batchIndex}:${entryIndex}"`;
  if (type === "textbook") return `data-download-textbook-text="${batchIndex}:${entryIndex}"`;
  if (type === "guide") return `data-download-guide-text="${batchIndex}:${entryIndex}"`;
  if (type === "textbook_pdf") return `data-download-textbook-pdf="${batchIndex}:${entryIndex}"`;
  if (type === "guide_pdf") return `data-download-guide-pdf="${batchIndex}:${entryIndex}"`;
  if (type === "lesson_plan_hwpx") return `data-download-lesson-plan-hwpx="${batchIndex}:${entryIndex}"`;
  return `data-download-images-zip="${batchIndex}:${entryIndex}"`;
}

// 일반 폴더 창처럼 좌측 제목·끝 날짜로 열을 맞추고, PPT/교과서/지도서/이미지는 각각 자기
// 열을 가진다(행이 아니라 열로 구분). 회차 하나 = 표의 한 행. 없는 파일 유형(이미지 미생성)은
// 그 칸에 체크박스 없이 "—"만 남는다.
function renderSportsCultureDraftHistory(draftLog) {
  if (!draftLog.length) return "";
  const groups = [];
  draftLog.forEach((batch, batchIndex) => {
    batch.entries.forEach((entry, entryIndex) => {
      groups.push({ batch, batchIndex, entry, entryIndex });
    });
  });
  const totalFiles = groups.reduce(
    (sum, group) => sum + DRAFT_FILE_TYPES.filter((type) => entryHasFileType(group.entry, type.id)).length,
    0,
  );

  const rowsHtml = [...groups].reverse().map((group) => {
    const { batch, batchIndex, entry, entryIndex } = group;
    const { unitName, smallTitle } = splitSmallUnitLabelForTable(batch.smallUnitLabel);
    const previewKey = `${batchIndex}:${entryIndex}`;
    const isOpen = expandedDraftFilePreviews.has(previewKey);
    const noCell = `<td class="col-no">${batchIndex + 1}</td>`;
    const unitCell = `
      <td class="col-unit">
        <div class="draft-file-row-select">
          <input type="checkbox" data-draft-file-row-checkbox="${previewKey}" />
          <span class="draft-file-unit-name" data-draft-file-preview-toggle="${previewKey}">${escapeHtml(unitName)}</span>
        </div>
      </td>`;
    const smallTitleCell = `
      <td class="col-small-title">
        <span class="draft-file-small-title" data-draft-file-preview-toggle="${previewKey}">${escapeHtml(smallTitle)}</span>
        ${batch.entries.length > 1 ? `<span class="draft-file-framework">${escapeHtml(entry.frameworkName)}</span>` : ""}
      </td>`;
    const typeCells = DRAFT_FILE_TYPES.map((type) => {
      if (!entryHasFileType(entry, type.id)) return `<td class="col-type-cell type-${type.id}"><span class="draft-file-cell-empty">—</span></td>`;
      const fileKey = `${batchIndex}:${entryIndex}:${type.id}`;
      return `
        <td class="col-type-cell type-${type.id}">
          <label class="draft-file-cell">
            <input type="checkbox" data-draft-file-checkbox="${fileKey}" ${selectedDraftFiles.has(fileKey) ? "checked" : ""} />
            <button type="button" class="tertiary-button" ${draftFileActionAttr(type.id, batchIndex, entryIndex)}>다운로드</button>
          </label>
        </td>`;
    }).join("");
    const dateCell = `<td class="col-date">${formatDraftBatchTimestamp(batch.generatedAt)}</td>`;
    const confirmCell = `<td class="col-confirm">${entry.approvedAt
      ? `<button type="button" class="confirm-chip done" data-textbook-confirm="${previewKey}" title="${escapeHtml(formatDraftBatchTimestamp(entry.approvedAt))} 확정 · 누르면 확정 취소">확정됨</button>`
      : `<button type="button" class="confirm-chip" data-textbook-confirm="${previewKey}" title="이 원고를 교과서 확정본으로 정합니다. 확정해야 07단계에서 지도서·활동지·평가지·과정안을 만들 수 있습니다.">확정</button>`}</td>`;
    const mainRow = `<tr class="draft-file-row${isOpen ? " open" : ""}${entry.approvedAt ? " confirmed" : ""}">${noCell}${unitCell}${smallTitleCell}${typeCells}${confirmCell}${dateCell}</tr>`;
    const previewRow = isOpen ? `
      <tr class="draft-file-preview-row">
        <td colspan="${5 + DRAFT_FILE_TYPES.length}">
          ${renderSportsDraftImages(entry, batchIndex, entryIndex)}
          <details class="sports-draft-text-details"><summary>원고 글·근거 보기</summary>${renderDraftTraceability(entry)}<pre class="manuscript-preview">${escapeHtml(textbookManuscriptText(entry))}</pre></details>
        </td>
      </tr>` : "";
    return mainRow + previewRow;
  }).join("");

  return `
    <div class="draft-log-list">
      <div class="draft-log-toolbar">
        <label class="draft-log-select-all"><input type="checkbox" id="draftFileSelectAll" ${selectedDraftFiles.size && selectedDraftFiles.size === totalFiles ? "checked" : ""} /><span>전체 선택</span></label>
        <span class="draft-log-count">${selectedDraftFiles.size}개 선택 · 총 ${totalFiles}개 파일</span>
        <div class="section-actions">
          <button class="secondary-button" id="downloadSelectedDraftFilesButton" type="button" ${selectedDraftFiles.size ? "" : "disabled"}>선택 다운로드</button>
          <button class="secondary-button" id="deleteSelectedDraftFilesButton" type="button" ${selectedDraftFiles.size ? "" : "disabled"}>선택 삭제</button>
        </div>
      </div>
      <div class="draft-file-table-wrap">
        <table class="draft-file-table draft-file-table-columns">
          <thead>
            <tr>
              <th class="col-no">No.</th>
              <th class="col-unit">단원명</th>
              <th class="col-small-title">소단원명</th>
              ${DRAFT_FILE_TYPES.map((type) => `
                <th class="col-type-cell type-${type.id}">
                  <label class="draft-file-column-header">
                    <input type="checkbox" data-draft-file-column-checkbox="${type.id}" />
                    <span>${type.label}</span>
                  </label>
                </th>`).join("")}
              <th class="col-confirm" title="확정한 원고로 07단계 지도서·부속 자료를 만듭니다">교과서 확정</th>
              <th class="col-date">날짜</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;
}

function renderSportsCultureDraftStudio() {
  ensureSportsCultureDraftSettings(state);
  const targets = sportsCultureDraftTargets();
  const selectedKeys = new Set(state.selectedDraftSmallUnitKeys || []);
  const style = sportsCultureStyleProfile(state.bookStyleValue);
  const smallTargets = targets.filter((item) => item.targetKind === "small-unit");
  const specialTargets = targets.filter((item) => item.targetKind === "special");
  return `
    ${sectionHeading("DRAFT STUDIO", "전체 스타일·초고 생성", "")}
    <section class="book-style-panel">
      <div class="book-style-heading"><div><strong>전체 스타일</strong><span>${escapeHtml(style.summary)}</span></div></div>
      <div class="book-style-options" role="radiogroup" aria-label="전체 스타일">
        ${SPORTS_CULTURE_STYLE_CHOICES.map((choice) => `<button type="button" class="book-style-option${choice.value === style.value ? " active" : ""}" data-book-style-value="${choice.value}" role="radio" aria-checked="${choice.value === style.value}">${escapeHtml(choice.label)}</button>`).join("")}
      </div>
      <label class="editor-field">
        <span>추가 컨셉(선택)</span>
        <textarea id="draftAdditionalConceptInput" placeholder="이번에 생성할 소단원·특별페이지에 반영할 내용을 자유롭게 적어 주세요(예: 최근 e스포츠 사례를 강조해줘).">${escapeHtml(sportsCultureAdditionalConcept)}</textarea>
      </label>
    </section>
    ${renderFeedbackDigest("draft")}
    <div class="generation-settings-grid compact-grid">
      <div class="editor-field generation-mode-note"><span>생성 방식</span><b>근거 검색 + AI</b></div>
      <label class="editor-field toggle-editor-field"><span>삽화 이미지</span><span class="toggle-editor-control"><input type="checkbox" id="includeImagesToggle" ${state.includeImages ? "checked" : ""} /> 삽화도 함께 생성</span></label>
    </div>
    <section class="draft-target-panel">
      <div class="draft-target-heading"><div><strong>소단원 유형과 생성 대상</strong></div><span id="draftTargetSelectedCount">${selectedKeys.size}개 선택</span></div>
      <div class="draft-target-toolbar"><button class="secondary-button" id="selectAllSmallDraftTargets" type="button">소단원 전체 선택</button><button class="secondary-button" id="clearDraftTargets" type="button">선택 해제</button></div>
      <div class="draft-target-list">
        ${smallTargets.map((item) => {
          const supportOptions = item.contentType === "theory" ? [{ id: "", label: "기본 구성" }, { id: "activity", label: "활동 포함" }] : [{ id: "", label: "기본 구성" }, { id: "concept", label: "개념 설명 포함" }];
          return `<article class="draft-target-row">
            <input type="checkbox" data-draft-target="${item.key}" ${selectedKeys.has(item.key) ? "checked" : ""} aria-label="${escapeHtml(item.smallTitle)} 생성 선택" />
            <div class="draft-target-title"><b>${escapeHtml(item.smallTitle)}</b><small>${escapeHtml(item.domain)} · ${escapeHtml(item.middleTitle)} · ${item.pages}쪽 · ${sportsCultureSportModeLabel(item.sportMode)}${item.sports?.length ? ` · ${escapeHtml(item.sports.join(", "))}` : ""}</small></div>
            <label><span>유형</span><select data-draft-content-type="${item.key}">${SPORTS_CULTURE_CONTENT_TYPES.map((type) => `<option value="${type.id}" ${type.id === item.contentType ? "selected" : ""}>${type.label}</option>`).join("")}</select></label>
            <label><span>보조 구성</span><select data-draft-support-mode="${item.key}">${supportOptions.map((mode) => `<option value="${mode.id}" ${mode.id === item.supportMode ? "selected" : ""}>${mode.label}</option>`).join("")}</select></label>
          </article>`;
        }).join("")}
      </div>
    </section>
    <section class="special-page-panel">
      <div class="draft-target-heading"><div><strong>단원 도입·마무리·특별페이지 초고</strong></div></div>
      <div class="draft-target-toolbar"><button class="secondary-button" id="selectAllSpecialDraftTargets" type="button">도입·마무리·특별페이지 전체 선택</button><button class="secondary-button" id="clearSpecialDraftTargets" type="button">선택 해제</button></div>
      <div class="special-page-list">${specialTargets.map((item) => `<label class="special-page-row"><input type="checkbox" data-draft-target="${item.key}" ${selectedKeys.has(item.key) ? "checked" : ""} /><span><b>${escapeHtml(item.smallTitle)}</b><small>${escapeHtml(item.specialTypeLabel)} · ${item.pages}쪽${item.customId ? " · 3단계 배열표 반영" : ""}</small></span></label>`).join("")}</div>
    </section>
    <div class="curriculum-notice compact"><strong>분량</strong><span>이론 1,400~1,800자 · 실기 900~1,400자 · 도입 300~700자 · 마무리 700~1,200자 · 특별 600~1,400자</span></div>
    <div class="draft-generate-bar"><span id="draftGenerateSelectionSummary">선택한 ${selectedKeys.size}개 항목</span><button class="primary-button" id="generateDraftButton" type="button" ${selectedKeys.size ? "" : "disabled"}>${selectedKeys.size > 1 ? `${selectedKeys.size}개 초고 일괄 생성` : "선택 초고 생성"}</button></div>
    ${renderDesigncraftPanel()}
    ${renderSportsCultureDraftHistory(state.frameworkDraftLog || [])}
    ${renderSharedFolderHistory()}`;
}

// ── 초등 체육 초고 생성 ──
// 업무 흐름(전체 스타일 → 생성 제공자 → 대상 일괄 선택 → 회차 이력·파일 출력)은 스포츠 문화와
// 같이 쓰고, 대상 목록과 원고 구조만 초등 체육(차시·활동 카드·확장 코너)에 맞춘다.
const ELEMENTARY_STYLE_SUMMARIES = {
  balanced: "기본 기능과 바른 자세를 차근차근 익히는 정석 구성 · 펼침면당 활동 2개",
  activity: "활동 2개와 안전·도움말 코너를 균형 있게 배치",
  creative: "놀이·게임·모둠 도전을 늘린 구성 · 펼침면당 활동 3개",
};

function isElementaryPeProject(targetState = state) {
  return targetState.project.schoolLevel === "초등학교" && targetState.project.subject === "체육";
}

function usesDraftStudio(targetState = state) {
  return isSportsCultureProject(targetState) || (isElementaryPeProject(targetState) && Boolean(globalThis.ELEMENTARY_DRAFT_ENGINE));
}

function ensureElementaryDraftSettings(book) {
  if (!book || !isElementaryPeProject(book)) return book;
  book.generationProviderId = "external-ai-v1";
  book.bookStyleValue = Math.max(0, Math.min(100, Number(book.bookStyleValue ?? 50)));
  book.includeImages = Boolean(book.includeImages);
  if (!Array.isArray(book.selectedDraftSmallUnitKeys)) book.selectedDraftSmallUnitKeys = [];
  if (!book.elementaryCornerTypes || typeof book.elementaryCornerTypes !== "object") book.elementaryCornerTypes = {};
  if (typeof book.includeMockups !== "boolean") book.includeMockups = true;
  // 예전에는 04단계에서 대단원별 확장 코너를 골랐고 쪽수에 잡히지 않았다. 03단계 특별 페이지(2쪽)로 옮긴다.
  const legacyCorners = Object.entries(book.elementaryCornerTypes);
  if (legacyCorners.length) {
    if (!Array.isArray(book.specialPages)) book.specialPages = [];
    legacyCorners.forEach(([unitIndex, type]) => {
      const unit = book.units?.[Number(unitIndex)];
      if (!unit || book.specialPages.some((page) => page.id === `corner-${unitIndex}-${type}`)) return;
      book.specialPages.push({ id: `corner-${unitIndex}-${type}`, type, domain: unit.domain, title: `${unit.domain} ${sportsCultureSpecialPageTypeLabel(type)}`, pages: 2 });
    });
    book.elementaryCornerTypes = {};
    book.selectedDraftSmallUnitKeys = book.selectedDraftSmallUnitKeys.filter((key) => !String(key).startsWith("special:corner:"));
  }
  return book;
}

function elementarySpecialDraftTargets() {
  const options = smallUnitOptions();
  const corners = globalThis.ELEMENTARY_DRAFT_ENGINE?.cornerTypes() || [];
  const specialPages = state.specialPages || [];
  const cornerTarget = (base, page, unitIndex) => {
    const corner = corners.find((item) => item.id === page.type) || corners[0];
    return { ...base, key: `special:custom:${page.id}`, pageRole: `corner-${corner?.id || "project"}`, middleTitle: "확장 코너", smallTitle: page.title, pages: Math.max(1, Number(page.pages) || 2), specialTypeLabel: corner?.label || "확장 코너", customId: page.id, unitIndex };
  };
  const unitTargets = state.units.flatMap((unit, unitIndex) => {
    const outline = [];
    options.filter((item) => item.key.startsWith(`${unitIndex}:`)).forEach((item) => {
      let middle = outline.find((entry) => entry.middleTitle === item.middleTitle);
      if (!middle) {
        middle = { middleTitle: item.middleTitle, smallTitles: [], activities: [] };
        outline.push(middle);
      }
      middle.smallTitles.push(item.smallTitle);
      middle.activities.push(item.sourceActivity);
    });
    const unitSubtitle = [...new Set(unit.subdomainGroups.map((group) => group.subtitle).filter(Boolean))].join("·");
    const base = {
      domain: unit.domain,
      middleTitle: "단원 도입·마무리",
      hours: 0,
      gradeLabel: state.project.grade,
      unitTitle: `${unitIndex + 1}. ${unit.domain}`,
      unitSubtitle,
      unitOutline: outline,
      standardCodes: [],
      targetKind: "special",
    };
    return [
      { ...base, key: `special:intro:${unitIndex}`, pageRole: "unit-intro", smallTitle: `${unit.domain} 단원 도입`, pages: Number(unit.introPages) || 2, specialTypeLabel: "대단원 도입", unitIndex },
      ...specialPages.filter((page) => page.domain === unit.domain).map((page) => cornerTarget(base, page, unitIndex)),
      { ...base, key: `special:closing:${unitIndex}`, pageRole: "unit-closing", smallTitle: `${unit.domain} 단원 마무리`, pages: Number(unit.wrapUpPages) || 2, specialTypeLabel: "대단원 마무리", unitIndex },
    ];
  });
  // 책 전체 통합 코너: 모든 대단원의 중단원·소단원을 개요로 넘긴다.
  const bookPages = specialPages.filter((page) => !state.units.some((unit) => unit.domain === page.domain));
  if (!bookPages.length) return unitTargets;
  const bookOutline = state.units.map((unit, unitIndex) => {
    const items = options.filter((item) => item.key.startsWith(`${unitIndex}:`));
    return { middleTitle: `${unitIndex + 1}. ${unit.domain}`, smallTitles: items.map((item) => item.smallTitle), activities: items.map((item) => item.sourceActivity) };
  });
  const bookBase = {
    domain: state.units.map((unit) => unit.domain).join("·"),
    middleTitle: "책 전체",
    hours: 0,
    gradeLabel: state.project.grade,
    unitTitle: "책 전체(모든 단원 통합)",
    unitSubtitle: "",
    unitOutline: bookOutline,
    standardCodes: [],
    targetKind: "special",
  };
  return [...unitTargets, ...bookPages.map((page) => cornerTarget(bookBase, page, null))];
}

function elementaryDraftTargets() {
  const engine = globalThis.ELEMENTARY_DRAFT_ENGINE;
  let lessonCursor = 1;
  const smallTargets = smallUnitOptions().map((item) => {
    const lessonStart = lessonCursor;
    lessonCursor += Number(item.hours) || 0;
    const target = { ...item, targetKind: "small-unit", pageRole: "small-unit", gradeLabel: state.project.grade, lessonStart };
    target.lessonType = item.lessonType || engine?.inferLessonType(target) || "skill";
    return target;
  });
  return [...smallTargets, ...elementarySpecialDraftTargets()];
}

function specialDraftTargets() {
  return isSportsCultureProject() ? sportsCultureSpecialDraftTargets() : elementarySpecialDraftTargets();
}

function draftStudioTargets() {
  return isSportsCultureProject() ? sportsCultureDraftTargets() : elementaryDraftTargets();
}

function elementaryLessonRangeLabel(item) {
  const hours = Number(item.hours) || 0;
  if (!hours) return "차시 미배정";
  return hours === 1 ? `${item.lessonStart}차시` : `${item.lessonStart}~${item.lessonStart + hours - 1}차시`;
}

// 전체 스타일 세 가지의 차이(초등 엔진 styleKind와 서버 지침 9번이 실제로 다르게 만든다).
// 개수(활동·코너)는 정하지 않고 방향만 준다. 원고 지침(서버 9번)과 시안 디자인 방향에 함께 쓰인다.
const ELEMENTARY_STYLE_HELP = [
  ["안정·정석형", "동작 원리와 바른 자세를 단계별로 차근차근 익히고 확인하는 정돈된 교과서. 시안은 1→2→3 단계 그림, 고른 카드, 넉넉한 여백."],
  ["균형형", "기능 익히기·활동·안전·생활 연계가 고르게 어우러진 교과서. 시안은 단계 그림·활동 카드·안전 상자를 균형 있게."],
  ["참신·활동형", "이야기·미션·게임·모둠 도전으로 학생이 규칙을 바꾸고 만들어 가는 놀이 중심 교과서. 시안은 큰 활동 장면, 미션 카드, 말풍선으로 역동적으로."],
];

function renderStyleHelpTip(lines) {
  return `<span class="help-tip" tabindex="0" aria-label="스타일 차이 보기">?<span class="help-tip-body">${lines.map(([label, text]) => `<b>${escapeHtml(label)}</b> ${escapeHtml(text)}`).join("<br />")}</span></span>`;
}

// 생성 대상: 대단원 → (도입) → 중단원 → 소단원 → (확장 코너) → (마무리) 순서로 묶고,
// 대단원·중단원 줄의 체크박스로 그 아래를 한꺼번에 고른다.
function renderElementaryTargetTree(smallTargets, specialTargets, selectedKeys, engine) {
  const groupBox = (keys, label, level) => `<label class="target-group-head ${level}"><input type="checkbox" data-draft-group="${escapeHtml(keys.join("|"))}" />${label}</label>`;
  const specialRow = (item) => `<label class="target-row special"><input type="checkbox" data-draft-target="${item.key}" ${selectedKeys.has(item.key) ? "checked" : ""} /><span class="target-name">${escapeHtml(item.specialTypeLabel)}${item.middleTitle === "확장 코너" ? ` · ${escapeHtml(item.smallTitle)}` : ""}</span><small>${item.pages}쪽</small></label>`;
  // 수업 유형 선택은 소단원명 앞에 둔다(폭이 일정해 이름 줄이 가지런하고, 오른쪽 끝까지 눈을 옮기지 않아도 된다).
  const smallRow = (item) => `<div class="target-row"><input type="checkbox" id="draft-target-${item.key}" data-draft-target="${item.key}" ${selectedKeys.has(item.key) ? "checked" : ""} /><select data-elementary-lesson-type="${item.key}" aria-label="수업 유형">${engine.lessonTypeOptions(item.domain).map((type) => `<option value="${type.id}" ${type.id === item.lessonType ? "selected" : ""} title="${escapeHtml(type.description)}">${escapeHtml(type.label)}</option>`).join("")}</select><label class="target-name" for="draft-target-${item.key}">${escapeHtml(item.smallTitle)}</label><small>${item.pages}쪽</small></div>`;
  const units = state.units.map((unit, unitIndex) => {
    const smalls = smallTargets.filter((item) => item.key.startsWith(`${unitIndex}:`));
    const specials = specialTargets.filter((item) => item.unitIndex === unitIndex);
    const intro = specials.filter((item) => item.pageRole === "unit-intro");
    const closing = specials.filter((item) => item.pageRole === "unit-closing");
    const corners = specials.filter((item) => item.pageRole !== "unit-intro" && item.pageRole !== "unit-closing");
    const middles = [];
    smalls.forEach((item) => {
      const middleKey = item.key.split(":").slice(0, 3).join(":");
      let middle = middles.find((entry) => entry.key === middleKey);
      if (!middle) middles.push(middle = { key: middleKey, title: item.middleTitle, items: [] });
      middle.items.push(item);
    });
    const allKeys = [...intro, ...smalls, ...corners, ...closing].map((item) => item.key);
    return `
      <div class="target-group">
        ${groupBox(allKeys, `<b>${unitIndex + 1}. ${escapeHtml(unit.domain)}</b><small>${allKeys.length}개</small>`, "large")}
        ${intro.map(specialRow).join("")}
        ${middles.map((middle) => `
          <div class="target-middle">
            ${groupBox(middle.items.map((item) => item.key), `<span>${escapeHtml(middle.title)}</span>`, "middle")}
            ${middle.items.map(smallRow).join("")}
          </div>`).join("")}
        ${corners.map(specialRow).join("")}
        ${closing.map(specialRow).join("")}
      </div>`;
  }).join("");
  const bookCorners = specialTargets.filter((item) => item.unitIndex === null || item.unitIndex === undefined);
  return units + (bookCorners.length ? `
    <div class="target-group">
      ${groupBox(bookCorners.map((item) => item.key), "<b>책 전체</b>", "large")}
      ${bookCorners.map(specialRow).join("")}
    </div>` : "");
}

function syncDraftGroupCheckboxes() {
  const selected = new Set(state.selectedDraftSmallUnitKeys || []);
  document.querySelectorAll("[data-draft-group]").forEach((box) => {
    const keys = box.dataset.draftGroup.split("|").filter(Boolean);
    const count = keys.filter((key) => selected.has(key)).length;
    box.checked = Boolean(keys.length) && count === keys.length;
    box.indeterminate = count > 0 && count < keys.length;
  });
}

function renderElementaryDraftStudio() {
  ensureElementaryDraftSettings(state);
  const engine = globalThis.ELEMENTARY_DRAFT_ENGINE;
  const targets = elementaryDraftTargets();
  const selectedKeys = new Set(state.selectedDraftSmallUnitKeys || []);
  const style = sportsCultureStyleProfile(state.bookStyleValue);
  const smallTargets = targets.filter((item) => item.targetKind === "small-unit");
  const specialTargets = targets.filter((item) => item.targetKind === "special");
  return `
    ${sectionHeading("DRAFT STUDIO", "전체 스타일·초고 생성", "")}
    ${renderFeedbackDigest("draft")}
    <section class="book-style-panel compact">
      <strong>전체 스타일</strong>${renderStyleHelpTip(ELEMENTARY_STYLE_HELP)}
      <div class="book-style-options" role="radiogroup" aria-label="전체 스타일">
        ${SPORTS_CULTURE_STYLE_CHOICES.map((choice) => `<button type="button" class="book-style-option${choice.value === style.value ? " active" : ""}" data-book-style-value="${choice.value}" role="radio" aria-checked="${choice.value === style.value}" title="${escapeHtml(ELEMENTARY_STYLE_HELP.find(([label]) => label === choice.label)?.[1] || "")}">${escapeHtml(choice.label)}</button>`).join("")}
      </div>
    </section>
    <section class="draft-target-panel">
      <div class="draft-target-heading"><div><strong>생성할 단원</strong></div><div class="draft-target-toolbar"><button class="secondary-button" id="selectAllDraftTargets" type="button">전체 선택</button><button class="secondary-button" id="clearDraftTargets" type="button">선택 해제</button></div></div>
      <div class="draft-target-tree">${renderElementaryTargetTree(smallTargets, specialTargets, selectedKeys, engine)}</div>
    </section>
    <div class="draft-generate-bar">
      <span id="draftGenerateSelectionSummary">선택한 ${selectedKeys.size}개 항목</span>
      <label class="draft-mockup-toggle" title="원고를 만든 뒤 펼침면마다 참고 시안(design-references 폴더) 디자인으로 완성 시안을 그립니다. 펼침면마다 OpenAI 이미지 1장 비용이 들고 1~2분 걸립니다."><input type="checkbox" id="includeMockupsToggle" ${state.includeMockups ? "checked" : ""} /> 디자인 시안도 함께 그리기</label>
      <button class="primary-button" id="generateDraftButton" type="button" ${selectedKeys.size ? "" : "disabled"}>${selectedKeys.size > 1 ? `${selectedKeys.size}개 초고 일괄 생성` : "선택 초고 생성"}</button>
    </div>
    ${renderDesigncraftPanel()}
    ${renderSportsCultureDraftHistory(state.frameworkDraftLog || [])}
    ${renderSharedFolderHistory()}`;
}

// 오래 걸리는 버튼: 빙글 도는 아이콘과 지난 시간을 보여 줘 멈춘 게 아니라 일하는 중임을 알린다.
function startButtonBusy(button) {
  const started = Date.now();
  let label = "";
  const paint = () => {
    if (!button.isConnected) return;
    const seconds = Math.round((Date.now() - started) / 1000);
    const elapsed = seconds < 60 ? `${seconds}초` : `${Math.floor(seconds / 60)}분 ${seconds % 60}초`;
    button.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${escapeHtml(label)} <small class="btn-elapsed">${elapsed}</small>`;
  };
  const timer = setInterval(paint, 1000);
  button.classList.add("is-busy");
  button.setAttribute("aria-busy", "true");
  return {
    set(text) { label = text; paint(); },
    stop() {
      clearInterval(timer);
      button.classList.remove("is-busy");
      button.removeAttribute("aria-busy");
    },
  };
}

function refreshDraftSelectionControls() {
  const count = (state.selectedDraftSmallUnitKeys || []).length;
  const countLabel = document.querySelector("#draftTargetSelectedCount");
  const summary = document.querySelector("#draftGenerateSelectionSummary");
  const generateButton = document.querySelector("#generateDraftButton");
  if (countLabel) countLabel.textContent = `${count}개 선택`;
  syncDraftGroupCheckboxes();
  if (summary) summary.textContent = `선택한 ${count}개 항목`;
  if (generateButton) {
    generateButton.disabled = count === 0;
    generateButton.textContent = count > 1 ? `${count}개 초고 일괄 생성` : "선택 초고 생성";
  }
}

function renderFrameworks() {
  if (!state.frameworkMetrics) state.frameworkMetrics = defaultFrameworkMetrics(frameworkOptions());
  if (!Array.isArray(state.frameworkDraftLog)) state.frameworkDraftLog = [];
  if (state.frameworkDraftLog.some((batch) => !Array.isArray(batch?.entries))) state.frameworkDraftLog = [];
  selectedDraftBatches.forEach((index) => { if (index >= state.frameworkDraftLog.length) selectedDraftBatches.delete(index); });
  expandedDraftBatches.forEach((index) => { if (index >= state.frameworkDraftLog.length) expandedDraftBatches.delete(index); });
  const draftFileKeyStillValid = (key) => {
    const [batchIndex, entryIndex] = key.split(":").map(Number);
    return Boolean(state.frameworkDraftLog[batchIndex]?.entries?.[entryIndex]);
  };
  selectedDraftFiles.forEach((key) => { if (!draftFileKeyStillValid(key.split(":").slice(0, 2).join(":"))) selectedDraftFiles.delete(key); });
  expandedDraftFilePreviews.forEach((key) => { if (!draftFileKeyStillValid(key)) expandedDraftFilePreviews.delete(key); });
  if (!state.frameworkApproval) state.frameworkApproval = { status: "draft", frameworkId: null, approvedAt: null };
  const sportsCulture = isSportsCultureProject();
  if (sportsCulture) ensureSportsCultureDraftSettings(state);
  if (sportsCulture) return renderSportsCultureDraftStudio();
  if (usesDraftStudio()) return renderElementaryDraftStudio();
  return `
    ${sectionHeading("DRAFT STUDIO", "초안·시안·조판", "")}
    <div class="curriculum-notice"><strong>아직 초안 프로필이 없는 과목입니다</strong><span>지금은 초등 체육(3~6학년)과 고등 스포츠 문화만 근거 검색 + AI 초안을 만들 수 있습니다. 이 과목은 01~03단계(구성안)까지 쓸 수 있습니다.</span></div>`;
}

// 드롭다운·체크박스를 바꿀 때마다 전체 화면을 다시 그리므로, 그대로 두면 스크롤 위치가
// 매번 맨 위로 초기화된다(특히 소단원 목록처럼 자체 스크롤이 있는 영역). 다시 그리기 전의
// 창·목록 스크롤 위치를 기억했다가 다시 그린 뒤 그대로 복원한다.
function renderWorkspace() {
  const renderers = [renderProject, renderCurriculum, renderUnits, renderFeedbackAnalysisStep, renderFrameworks, renderFeedbackStep, renderDerivedStep];
  const workspace = document.querySelector("#workspace");
  const windowScrollY = window.scrollY;
  const innerScrollTops = Array.from(workspace.querySelectorAll(".draft-target-list, .special-page-list")).map((el) => el.scrollTop);
  const restoreScroll = () => {
    window.scrollTo(0, windowScrollY);
    workspace.querySelectorAll(".draft-target-list, .special-page-list").forEach((el, index) => {
      if (innerScrollTops[index] != null) el.scrollTop = innerScrollTops[index];
    });
  };
  workspace.replaceChildren();
  const project = activeProject();
  // 02 교육과정은 학년군 단위라 두 학년책 내용이 같다 — 비교 보기에서도 한 번만 그린다.
  if (state.currentStep > 1 && isPairedProject(project) && project.viewMode === "compare") {
    const originalState = state;
    const currentStep = originalState.currentStep;
    // 비교 보기에서는 고칠 수 없으므로 입력 화면 대신 데이터만 보여 준다(03은 단원표, 04~06은 입력값을 글자로).
    const unitsStep = renderers[currentStep] === renderUnits;
    let panels = "";
    let filterBar = "";
    try {
      panels = Object.entries(project.books).map(([bookKey, bookState]) => {
        state = bookState;
        const content = unitsStep ? renderUnitsComparison() : renderers[currentStep]();
        return `<article class="book-comparison-panel${unitsStep ? " units-compare" : ""}" data-compare-book="${escapeHtml(bookKey)}"><h3>${escapeHtml(bookKey)}</h3>${content}</article>`;
      }).join("");
      if (unitsStep) filterBar = renderUnitsComparisonFilter(Object.values(project.books));
    } finally {
      state = originalState;
    }
    document.querySelector("#workspace").innerHTML = `${filterBar}<div class="book-comparison-grid">${panels}</div>`;
    bindComparisonPanels();
    document.querySelectorAll("[data-units-compare-export]").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.unitsCompareExport === "pdf") {
        downloadCanvasPagesAsPdf(`${unitsComparisonExportTable().filename}.pdf`, buildUnitsComparisonPdfPages());
        showToast("학년군 단원표를 PDF로 저장했습니다.");
        return;
      }
      postTableExport(unitsComparisonExportTable(), button.dataset.unitsCompareExport)
        .then(() => showToast("학년군 단원표를 내려받았습니다."))
        .catch((error) => showToast(error.message));
    }));
    restoreScroll();
    return;
  }
  document.querySelector("#workspace").innerHTML = renderers[state.currentStep]();
  bindWorkspace();
  renderDraftCanvases();
  syncDraftFileRowCheckboxes();
  syncDraftFileColumnCheckboxes();
  restoreScroll();
}

// 03단계 비교용 단원표: 대단원 → 중단원 → 소단원을 한 줄씩, 차시·쪽수만 오른쪽 열에.
function renderUnitsComparison() {
  normalizeAutomaticUnitNumbering(state);
  const filter = state.unitDomainFilter || "전체";
  const coreAllocated = unitsTotalPages(state.units) + specialPagesTotal(state) + lineItemsTotalPages(state.appendixText);
  const supplementary = lineItemsTotalPages(state.frontMatterText) + lineItemsTotalPages(state.backMatterText);
  const sumHours = (smallUnits) => smallUnits.reduce((sum, small) => sum + (Number(small.hours) || 0), 0);
  const sumPages = (smallUnits) => smallUnits.reduce((sum, small) => sum + (Number(small.pages) || 0), 0);
  const rows = state.units.map((unit, unitIndex) => {
    if (filter !== "전체" && unit.domain !== filter) return "";
    const subtitle = unit.subdomainGroups.map((group) => group.subtitle).filter(Boolean).join(" · ");
    const unitPages = unitsTotalPages([unit]) + specialPagesTotal(state, unit.domain);
    const middleRows = unit.subdomainGroups.flatMap((group, groupIndex) => group.middleUnits.map((middle, middleIndex) => {
      const position = middleUnitPosition(unit, groupIndex, middleIndex);
      const smallRows = middle.smallUnits.map((small, smallIndex) => `
        <tr class="cmp-small"><td><b>${unitNumberLabel(unitIndex, position, smallIndex + 1)}</b> ${escapeHtml(small.title)}</td><td>${Number(small.hours) || 0}</td><td>${Number(small.pages) || 0}</td></tr>`).join("");
      return `<tr class="cmp-middle"><td><b>${unitNumberLabel(unitIndex, position)}</b> ${escapeHtml(middle.title)}</td><td>${sumHours(middle.smallUnits)}</td><td>${sumPages(middle.smallUnits)}</td></tr>${smallRows}`;
    })).join("");
    return `
      <tr class="cmp-large"><td><b>${unitNumberLabel(unitIndex)}</b> <span class="domain-badge ${escapeHtml(unit.domain)}">${escapeHtml(unit.domain)}</span> ${escapeHtml(subtitle)}<small>도입 ${Number(unit.introPages) || 0} · 마무리 ${Number(unit.wrapUpPages) || 0}쪽</small></td><td>${unitsTotalHours([unit])}</td><td>${unitPages}</td></tr>
      ${middleRows}`;
  }).join("");
  return `
    <p class="cmp-summary"><span>차시 <b>${unitsTotalHours(state.units)}</b>/${projectTargetHours()}</span><span>본문·부록 <b>${coreAllocated}</b>/${Number(state.project.corePages) || 0}쪽</span><span>부속자료 <b>${supplementary}</b>/${Number(state.project.supplementaryPages) || 0}쪽</span></p>
    <table class="cmp-unit-table"><thead><tr><th>단원</th><th>차시</th><th>쪽수</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// 03단계 비교 보기의 영역 필터는 두 책 위에 한 번만 두고, 오른쪽에 학년군 단원표 내려받기를 둔다.
function renderUnitsComparisonFilter(books) {
  const domains = [...new Set(books.flatMap((book) => (book.units || []).map((unit) => unit.domain)))];
  const selected = books[0]?.unitDomainFilter || "전체";
  return `<div class="compare-toolbar"><div class="curriculum-domain-tabs">${["전체", ...domains].map((domain) => `<button class="${selected === domain ? "active" : ""}" data-unit-domain-filter="${escapeHtml(domain)}" type="button">${escapeHtml(domain)}</button>`).join("")}</div>
    <span class="compare-download">학년군 단원표 <button class="secondary-button" type="button" data-units-compare-export="pdf">PDF</button><button class="secondary-button" type="button" data-units-compare-export="xlsx">엑셀</button></span></div>`;
}

// 학년책 하나의 단원표 행: 대단원마다 묶어 [단원, 차시, 쪽수]. 비교 파일에서 대단원 시작 줄을 맞추는 데 쓴다.
function unitsComparisonBlocks(book) {
  normalizeAutomaticUnitNumbering(book);
  const sum = (smallUnits, field) => smallUnits.reduce((total, small) => total + (Number(small[field]) || 0), 0);
  return (book.units || []).map((unit, unitIndex) => {
    const subtitle = unit.subdomainGroups.map((group) => group.subtitle).filter(Boolean).join(" · ");
    const rows = [[`${unitNumberLabel(unitIndex)}. ${unit.domain}${subtitle ? ` · ${subtitle}` : ""}`, unitsTotalHours([unit]), unitsTotalPages([unit]) + specialPagesTotal(book, unit.domain), 0, `도입 ${Number(unit.introPages) || 0}·마무리 ${Number(unit.wrapUpPages) || 0}쪽`]];
    unit.subdomainGroups.forEach((group, groupIndex) => group.middleUnits.forEach((middle, middleIndex) => {
      const position = middleUnitPosition(unit, groupIndex, middleIndex);
      rows.push([`${unitNumberLabel(unitIndex, position)}. ${middle.title}`, sum(middle.smallUnits, "hours"), sum(middle.smallUnits, "pages"), 1]);
      middle.smallUnits.forEach((small, smallIndex) => rows.push([`${unitNumberLabel(unitIndex, position, smallIndex + 1)}. ${small.title}`, Number(small.hours) || 0, Number(small.pages) || 0, 2]));
    }));
    return rows;
  });
}

function buildUnitsComparisonPdfPages() {
  const project = activeProject();
  const entries = Object.entries(project.books || {});
  const blocks = entries.map(([, book]) => unitsComparisonBlocks(book));
  const pageWidth = 1123;
  const pageHeight = 794;
  const margin = 36;
  const columnGap = 22;
  const scale = 2;
  const columnWidth = (pageWidth - margin * 2 - columnGap * (entries.length - 1)) / entries.length;
  const numberWidth = 42;
  const palette = { brand: "#1e4a9a", brandSoft: "#edf2fb", brandTint: "#c9d7f0", text: "#1f2633", muted: "#667085", line: "#e3e7ee" };
  const font = (weight, size) => `${weight} ${size}px 'Malgun Gothic','Apple SD Gothic Neo',sans-serif`;
  const heights = [30, 22, 19];
  const canvases = [];
  let context = null;
  let y = 0;
  const fit = (text, width) => {
    let value = String(text);
    if (context.measureText(value).width <= width) return value;
    while (value.length > 1 && context.measureText(`${value}…`).width > width) value = value.slice(0, -1);
    return `${value}…`;
  };
  const newPage = () => {
    const canvas = document.createElement("canvas");
    canvas.width = pageWidth * scale;
    canvas.height = pageHeight * scale;
    context = canvas.getContext("2d");
    context.scale(scale, scale);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, pageWidth, pageHeight);
    context.fillStyle = palette.brand;
    context.fillRect(0, 0, pageWidth, 5);
    canvases.push(canvas);
    y = margin;
    context.font = font(800, 17);
    context.fillStyle = palette.text;
    context.fillText(`${project.band || project.pairLabel || project.name || "학년군"} 단원·차시 배분`, margin, y + 12);
    context.font = font(400, 10);
    context.fillStyle = palette.muted;
    context.textAlign = "right";
    context.fillText(`${canvases.length}쪽`, pageWidth - margin, y + 12);
    context.textAlign = "left";
    y += 30;
    entries.forEach(([bookKey, book], index) => {
      const x = margin + index * (columnWidth + columnGap);
      const core = unitsTotalPages(book.units) + specialPagesTotal(book) + lineItemsTotalPages(book.appendixText);
      context.font = font(800, 14);
      context.fillStyle = palette.brand;
      context.fillText(bookKey, x, y + 12);
      context.font = font(400, 10.5);
      context.fillStyle = palette.muted;
      context.fillText(`차시 ${unitsTotalHours(book.units)}/${Number(book.project.targetHours) || 0} · 본문·부록 ${core}/${Number(book.project.corePages) || 0}쪽`, x + 52, y + 12);
      context.fillStyle = palette.brand;
      context.fillRect(x, y + 20, columnWidth, 1.5);
      context.font = font(700, 9.5);
      context.fillStyle = palette.muted;
      context.fillText("단원", x + 4, y + 33);
      context.textAlign = "right";
      context.fillText("차시", x + columnWidth - numberWidth - 6, y + 33);
      context.fillText("쪽수", x + columnWidth - 6, y + 33);
      context.textAlign = "left";
    });
    y += 42;
  };
  const drawRow = (row, x, height) => {
    const [label, hours, pages, level, note] = row;
    const top = y;
    if (level === 0) {
      context.fillStyle = palette.brandSoft;
      context.fillRect(x, top + 6, columnWidth, height - 6);
      context.fillStyle = palette.brand;
      context.fillRect(x, top + 6, 3, height - 6);
    } else if (level === 1) {
      context.fillStyle = "#f6f8fc";
      context.fillRect(x, top, columnWidth, height);
    }
    const indent = [10, 10, 24][level];
    const baseline = top + height - (level === 0 ? 8 : 6);
    context.font = level === 0 ? font(800, 12) : level === 1 ? font(700, 10.8) : font(400, 10.5);
    context.fillStyle = level === 2 ? palette.text : palette.brand;
    const labelWidth = columnWidth - numberWidth * 2 - indent - 8;
    const noteText = note ? `  ${note}` : "";
    context.fillText(fit(label, labelWidth - (noteText ? 90 : 0)), x + indent, baseline);
    if (noteText) {
      const used = context.measureText(fit(label, labelWidth - 90)).width;
      context.font = font(400, 9.5);
      context.fillStyle = palette.muted;
      context.fillText(noteText, x + indent + used, baseline);
    }
    context.font = level === 2 ? font(400, 10.5) : font(700, 11);
    context.fillStyle = palette.text;
    context.textAlign = "right";
    context.fillText(String(hours), x + columnWidth - numberWidth - 6, baseline);
    context.fillText(String(pages), x + columnWidth - 6, baseline);
    context.textAlign = "left";
    if (level !== 0) {
      context.fillStyle = palette.line;
      context.fillRect(x, top + height - 0.5, columnWidth, 0.5);
    }
  };
  newPage();
  const unitCount = Math.max(...blocks.map((list) => list.length));
  for (let unitIndex = 0; unitIndex < unitCount; unitIndex += 1) {
    const lineCount = Math.max(...blocks.map((list) => list[unitIndex]?.length || 0));
    if (unitIndex) y += 12;
    for (let line = 0; line < lineCount; line += 1) {
      const rows = blocks.map((list) => list[unitIndex]?.[line] || null);
      const height = Math.max(...rows.map((row) => (row ? heights[row[3]] : 0)));
      if (y + height > pageHeight - margin) newPage();
      rows.forEach((row, index) => { if (row) drawRow(row, margin + index * (columnWidth + columnGap), height); });
      y += height;
    }
  }
  return canvases;
}

// 학년군 두 책을 한 표로: 학년마다 [단원, 차시, 쪽수] 세 열을 나란히 두고, 대단원 시작 줄을 맞춘다.
function unitsComparisonExportTable() {
  const project = activeProject();
  const entries = Object.entries(project.books || {});
  const blocks = entries.map(([, book]) => unitsComparisonBlocks(book));
  const columns = entries.flatMap(([bookKey]) => [`${bookKey} 단원`, "차시", "쪽수"]);
  const rows = [];
  const unitCount = Math.max(...blocks.map((list) => list.length));
  for (let unitIndex = 0; unitIndex < unitCount; unitIndex += 1) {
    const height = Math.max(...blocks.map((list) => list[unitIndex]?.length || 0));
    for (let line = 0; line < height; line += 1) {
      rows.push(blocks.flatMap((list) => {
        const row = list[unitIndex]?.[line];
        if (!row) return ["", "", ""];
        const [label, hours, pages, level, note] = row;
        return [`${["", "  ", "      "][level]}${label}${note ? ` (${note})` : ""}`, hours, pages];
      }));
    }
    if (unitIndex < unitCount - 1) rows.push(columns.map(() => ""));
  }
  rows.push(entries.flatMap(([, book]) => {
    const core = unitsTotalPages(book.units) + specialPagesTotal(book) + lineItemsTotalPages(book.appendixText);
    return [`합계 (본문·부록 ${core}/${Number(book.project.corePages) || 0}쪽)`, unitsTotalHours(book.units), unitsTotalPages(book.units)];
  }));
  const name = `${project.band || project.pairLabel || project.name || "학년군"}_단원·차시 배분`;
  return { title: name, filename: name, columns, rows, widths: entries.flatMap(() => [46, 7, 7]) };
}

// 비교 보기는 읽기 전용이다. 입력칸은 값만 글자로 바꾸고 작업 버튼은 숨기며,
// 영역 필터 버튼만 두 학년책에 함께 적용한다.
function bindComparisonPanels() {
  const filterSelector = "[data-curriculum-domain], [data-unit-domain-filter]";
  document.querySelectorAll(".book-comparison-panel").forEach((panel) => {
    // 입력용으로만 있는 구획(파일 올리기·생성 방식·삽화 켜기)과 선택 체크박스는 비교할 데이터가 아니다.
    panel.querySelectorAll(".feedback-drop, .feedback-note-field, .draft-mockup-toggle, .help-tip, .generation-mode-note, .toggle-editor-field").forEach((element) => element.remove());
    panel.querySelectorAll("input, select, textarea").forEach((element) => {
      if (element.type === "checkbox" || element.type === "radio" || element.type === "file" || element.type === "hidden") {
        element.remove();
        return;
      }
      const value = element.tagName === "SELECT" ? element.selectedOptions[0]?.textContent || "" : element.value;
      const text = document.createElement("span");
      text.className = "compare-value";
      text.textContent = value;
      element.replaceWith(text);
    });
    panel.querySelectorAll("button").forEach((button) => {
      if (!button.matches(filterSelector)) button.remove();
    });
    // 비어 있는 입력칸은 이름표째 뺀다.
    panel.querySelectorAll(".editor-field").forEach((field) => {
      const values = field.querySelectorAll(".compare-value");
      if (values.length && [...values].every((value) => !value.textContent.trim())) field.remove();
    });
  });
  document.querySelectorAll(`:is(.book-comparison-panel, .compare-toolbar) :is(${filterSelector})`).forEach((button) => {
    button.addEventListener("click", () => {
      Object.values(activeProject().books).forEach((book) => {
        if ("curriculumDomain" in button.dataset) book.curriculumDomain = button.dataset.curriculumDomain;
        if ("unitDomainFilter" in button.dataset) book.unitDomainFilter = button.dataset.unitDomainFilter;
      });
      persist();
      renderWorkspace();
    });
  });
}

function bindWorkspace() {
  document.querySelectorAll("[data-project]").forEach((input) => {
    input.addEventListener("input", () => {
      const field = input.dataset.project;
      state.project[field] = input.type === "checkbox"
        ? input.checked
        : input.type === "number"
          ? Math.max(12, Number(input.value) || 12)
          : input.value;
      if (field === "name") {
        syncProjectName(input.value);
        persist();
        renderProjectSwitcher();
        return;
      }
      if (field === "schoolLevel") {
        const isElementary = input.value === "초등학교";
        const isHighSchool = input.value === "고등학교";
        state.project.grade = isElementary ? "3학년" : "";
        state.project.subject = isElementary ? "체육" : isHighSchool ? "스포츠 문화" : "체육";
        state.project.name = isElementary ? "초등 체육 3학년 교과서" : isHighSchool ? "고등학교 스포츠 문화 교과서" : "중학교 체육 교과서";
        state.project.corePages = isElementary ? 132 : isHighSchool ? 180 : null;
        state.project.supplementaryPages = isElementary ? 10 : isHighSchool ? 0 : null;
        state.frontMatterText = isElementary ? "속표지, 1\n구성과 특징, 2\n목차, 2" : "";
        state.backMatterText = isElementary ? "참고문헌, 1\n집필자 소개, 1\n판권, 1" : "";
        state.appendixText = isHighSchool ? "자료 출처와 찾아보기, 4" : "";
        state.units = isElementary ? unitsForGrade(state.project.grade) : isHighSchool ? unitsForSportsCulture() : [];
        state.curriculumDomain = "전체";
        state.unitDomainFilter = "전체";
        state.pages = pageValidation().valid ? buildPagePlan() : [];
        state.selectedPages = [1];
        persist();
        renderWorkspace();
        return;
      }
      if (field === "subject" && isSportsCultureProject()) {
        state.project.name = "고등학교 스포츠 문화 교과서";
        state.project.corePages = 180;
        state.project.supplementaryPages = 0;
        state.units = unitsForSportsCulture();
        state.sportsCultureUnitStructureVersion = 2;
        state.selectedSports = ["배드민턴"];
        state.customSports = "";
        state.carrierSport = "배드민턴";
        state.frontMatterText = "";
        state.backMatterText = "";
        state.appendixText = "자료 출처와 찾아보기, 4";
        state.pages = buildPagePlan();
        state.selectedPages = [1];
        persist();
        renderWorkspace();
        return;
      }
      if (field === "grade") {
        state.units = unitsForGrade(input.value);
        if (pageValidation().valid) {
          state.pages = buildPagePlan();
          state.selectedPages = [1];
        }
        persist();
        renderWorkspace();
        return;
      }
      persist();
    });
  });

  document.querySelectorAll("[data-setup-book-field]").forEach((input) => {
    input.addEventListener("change", () => {
      const [bookKey, field] = input.dataset.setupBookField.split(":");
      const book = activeProject().books[bookKey];
      const value = Number(input.value);
      book.project[field] = value;
      if (field === "targetHours" && Number.isInteger(value) && value > 0) redistributeUnitHours(book, value);
      if (["corePages", "supplementaryPages"].includes(field) && pageValidation(book).valid) {
        fitBookPagesToTargets(book);
      }
      persist();
      renderWorkspace();
    });
  });

  document.querySelector("#requestSetupApproval")?.addEventListener("click", () => {
    const project = activeProject();
    if (!projectSetupValidation(project).valid) return;
    project.setupApproval.status = "pending";
    persist("승인 요청 저장됨");
    render();
    showToast("팀장 승인 대기로 전환했습니다.");
  });
  document.querySelector("#cancelSetupApproval")?.addEventListener("click", () => {
    activeProject().setupApproval.status = "draft";
    persist("승인 요청 취소됨");
    render();
  });
  document.querySelector("#approveSetup")?.addEventListener("click", () => {
    const project = activeProject();
    if (!projectSetupValidation(project).valid) return;
    project.setupApproval.status = "approved";
    project.setupApproval.version += 1;
    project.setupApproval.approvedAt = new Date().toISOString();
    project.setupApproval.approvedSnapshot = setupSnapshot(project);
    persist("프로젝트 설정 승인됨");
    render();
    showToast(`프로젝트 설정 v${project.setupApproval.version}을 승인했습니다.`);
  });
  document.querySelector("#reviseSetup")?.addEventListener("click", () => {
    activeProject().setupApproval.status = "draft";
    persist("수정본 시작됨");
    render();
    showToast("승인본을 보존하고 새 수정본을 시작했습니다.");
  });

  document.querySelectorAll("[data-page-count]").forEach((input) => {
    input.addEventListener("change", () => {
      state.project[input.dataset.pageCount] = Number(input.value);
      if (pageValidation().valid) {
        state.pages = buildPagePlan();
        state.selectedPages = [1];
      }
      persist();
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-curriculum-domain]").forEach((button) => {
    button.addEventListener("click", () => {
      state.curriculumDomain = button.dataset.curriculumDomain;
      persist();
      renderWorkspace();
    });
  });

  document.querySelector("#downloadCurriculumButton")?.addEventListener("click", () => {
    const canvases = buildCurriculumStandardsPdfPages();
    if (!canvases) {
      showToast("내려받을 성취기준이 없습니다.");
      return;
    }
    downloadCanvasPagesAsPdf(`${state.project.name || "교육과정"}_성취기준과_고려사항.pdf`, canvases);
    showToast("성취기준·고려사항을 PDF로 저장했습니다.");
  });

  document.querySelector("#downloadCurriculumNoteButton")?.addEventListener("click", () => {
    const canvases = buildCurriculumDevelopmentNotePdfPages();
    if (!canvases) {
      showToast("아직 이 과목의 분석 자료가 준비되지 않았습니다.");
      return;
    }
    downloadCanvasPagesAsPdf(`${state.project.name || "교육과정"}_분석및집필방향.pdf`, canvases);
    showToast("분석 내용을 PDF로 저장했습니다.");
  });

  document.querySelector("#fitPagesButton")?.addEventListener("click", () => {
    if (!window.confirm("소단원 쪽수와 앞·뒷부속을 기준 쪽수에 맞게 다시 배분합니다. 직접 고친 쪽수도 바뀝니다. 계속할까요?")) return;
    if (!fitBookPagesToTargets(state)) {
      showToast("이 책은 공식 쪽수 기준이 없어 자동 배분할 수 없습니다.");
      return;
    }
    persist("기준 쪽수에 맞게 쪽수 배분됨");
    renderWorkspace();
    showToast("기준 쪽수에 맞게 배분했습니다.");
  });

  document.querySelector("#downloadTocButton")?.addEventListener("click", () => {
    downloadCsvFile(`${state.project.name || "목차"}_목차.csv`, unitsTocRows());
    showToast("목차를 다운로드했습니다.");
  });

  document.querySelector("#addTocSpecialPageButton")?.addEventListener("click", () => {
    const type = document.querySelector("#tocSpecialPageTypeSelect")?.value || specialPageTypes()[0]?.id || "reading";
    const domainSelect = document.querySelector("#tocSpecialPageDomainSelect");
    const domain = domainSelect ? domainSelect.value : state.units[0]?.domain || "";
    const label = sportsCultureSpecialPageTypeLabel(type);
    state.specialPages ||= [];
    state.specialPages.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, domain, title: domain ? `${domain} ${label}` : `통합 ${label}`, pages: 2 });
    state.pages = buildPagePlan(state);
    persist("3단계 특별페이지 추가됨");
    renderWorkspace();
    showToast("2쪽을 배열표에 반영했습니다. 기준 쪽수와 달라졌으면 '기준 쪽수에 맞게 배분'을 눌러 주세요.");
  });

  document.querySelectorAll("[data-toc-special-title]").forEach((input) => {
    input.addEventListener("change", () => {
      const page = (state.specialPages || []).find((item) => item.id === input.dataset.tocSpecialTitle);
      if (!page) return;
      page.title = input.value.trim() || sportsCultureSpecialPageTypeLabel(page.type);
      state.pages = buildPagePlan(state);
      persist("특별페이지 이름 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-toc-special-type]").forEach((select) => {
    select.addEventListener("change", () => {
      const page = (state.specialPages || []).find((item) => item.id === select.dataset.tocSpecialType);
      if (!page) return;
      page.type = select.value;
      state.pages = buildPagePlan(state);
      persist("특별페이지 유형 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-toc-special-domain]").forEach((select) => {
    select.addEventListener("change", () => {
      const page = (state.specialPages || []).find((item) => item.id === select.dataset.tocSpecialDomain);
      if (!page) return;
      page.domain = select.value;
      state.pages = buildPagePlan(state);
      persist("특별페이지 배치 대단원 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-toc-special-pages]").forEach((input) => {
    input.addEventListener("change", () => {
      const page = (state.specialPages || []).find((item) => item.id === input.dataset.tocSpecialPages);
      if (!page) return;
      page.pages = Math.max(1, Number(input.value) || 1);
      state.pages = buildPagePlan(state);
      persist("특별페이지 쪽수 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-delete-toc-special-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.deleteTocSpecialPage;
      state.specialPages = (state.specialPages || []).filter((page) => page.id !== id);
      state.selectedDraftSmallUnitKeys = (state.selectedDraftSmallUnitKeys || []).filter((key) => key !== `special:custom:${id}`);
      state.pages = buildPagePlan(state);
      persist("3단계 특별페이지 삭제됨");
      renderWorkspace();
    });
  });

  document.querySelector("#applySportsCultureDetailedUnits")?.addEventListener("click", () => {
    const confirmed = window.confirm("현재 단원·차시·쪽수 편집값을 전처리 자료 기반 18개 소단원 초기안으로 바꿀까요?");
    if (!confirmed) return;
    state.units = unitsForSportsCulture();
    state.sportsCultureUnitStructureVersion = 2;
    state.pages = buildPagePlan();
    state.selectedPages = [1];
    persist("스포츠 문화 세분화 초기안 적용됨");
    renderWorkspace();
    showToast("18개 소단원 초기안을 적용했습니다.");
  });

  document.querySelectorAll("[data-sport-option]").forEach((input) => {
    input.addEventListener("change", () => {
      const selected = new Set(state.selectedSports || []);
      if (input.checked) selected.add(input.dataset.sportOption);
      else selected.delete(input.dataset.sportOption);
      state.selectedSports = SPORTS_CULTURE_SPORT_OPTIONS.filter((sport) => selected.has(sport));
      state.carrierSport = selectedSportsFor(state).join(", ");
      ensureSportsCultureDraftSettings(state);
      persist("스포츠 문화 후보 종목 변경됨");
      renderWorkspace();
    });
  });

  document.querySelector("#customSportsInput")?.addEventListener("change", (event) => {
    state.customSports = event.target.value.trim();
    state.carrierSport = selectedSportsFor(state).join(", ");
    ensureSportsCultureDraftSettings(state);
    persist("스포츠 문화 기타 종목 변경됨");
    renderWorkspace();
  });

  document.querySelectorAll("[data-concept-option]").forEach((input) => {
    input.addEventListener("change", () => {
      const selected = new Set(state.selectedConcepts || []);
      if (input.checked) selected.add(input.dataset.conceptOption);
      else selected.delete(input.dataset.conceptOption);
      state.selectedConcepts = SPORTS_CULTURE_CONCEPT_OPTIONS.filter((concept) => selected.has(concept));
      persist("구성요소 후보 변경됨");
      renderWorkspace();
    });
  });

  document.querySelector("#customConceptsInput")?.addEventListener("change", (event) => {
    state.customConcepts = event.target.value.trim();
    persist("기타 구성요소 변경됨");
    renderWorkspace();
  });

  document.querySelector("#downloadPagePlanButton")?.addEventListener("click", () => {
    downloadCsvFile(`${state.project.name || "배열표"}_배열표.csv`, pagePlanRows(buildPagePlan(state)));
    showToast("배열표를 다운로드했습니다.");
  });

  document.querySelectorAll("[data-unit-domain-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.unitDomainFilter = button.dataset.unitDomainFilter;
      persist();
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-unit-subtitle]").forEach((input) => {
    input.addEventListener("input", () => {
      const [unitIndex, groupIndex] = input.dataset.unitSubtitle.split(":").map(Number);
      state.units[unitIndex].subdomainGroups[groupIndex].subtitle = input.value;
      persist();
    });
  });

  document.querySelectorAll("[data-middle-title]").forEach((input) => {
    input.addEventListener("input", () => {
      const [unitIndex, groupIndex, middleIndex] = input.dataset.middleTitle.split(":").map(Number);
      state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].title = input.value;
      persist();
    });
  });

  document.querySelectorAll("[data-small-title]").forEach((input) => {
    input.addEventListener("input", () => {
      const [unitIndex, groupIndex, middleIndex, smallIndex] = input.dataset.smallTitle.split(":").map(Number);
      state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].smallUnits[smallIndex].title = input.value;
      persist();
    });
  });

  document.querySelectorAll("[data-small-sport-mode]").forEach((select) => {
    select.addEventListener("change", () => {
      const [unitIndex, groupIndex, middleIndex, smallIndex] = select.dataset.smallSportMode.split(":").map(Number);
      const small = state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].smallUnits[smallIndex];
      small.sportMode = select.value;
      small.sportSettingSource = "user";
      if (small.sportMode === "none") small.sports = [];
      else if (small.sportMode === "primary") small.sports = (small.sports || []).slice(0, 1);
      if (small.sportMode !== "none" && !small.sports?.length) {
        small.sports = recommendedSportsForSmallUnit({ middleTitle: state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].title, smallTitle: small.title }, selectedSportsFor(state), small.sportMode);
        if (small.sportMode === "primary") small.sports = small.sports.slice(0, 1);
      }
      persist("소단원 종목 사용 방식 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-recommend-small-sports]").forEach((button) => {
    button.addEventListener("click", () => {
      const [unitIndex, groupIndex, middleIndex, smallIndex] = button.dataset.recommendSmallSports.split(":").map(Number);
      const middle = state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex];
      const small = middle.smallUnits[smallIndex];
      small.sportMode = inferSportsCultureSportMode({ middleTitle: middle.title, smallTitle: small.title });
      small.sports = recommendedSportsForSmallUnit({ middleTitle: middle.title, smallTitle: small.title }, selectedSportsFor(state));
      small.sportSettingSource = "recommended";
      persist("수정한 목차명 기준 종목 방식 다시 추천됨");
      renderWorkspace();
      showToast("현재 중·소단원명을 기준으로 종목 사용 방식을 다시 추천했습니다.");
    });
  });

  document.querySelectorAll("[data-small-sport]").forEach((input) => {
    input.addEventListener("change", () => {
      const [unitIndex, groupIndex, middleIndex, smallIndex] = input.dataset.smallSport.split(":").map(Number);
      const small = state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].smallUnits[smallIndex];
      if (small.sportMode === "primary") {
        small.sports = input.checked ? [input.value] : [];
      } else {
        const assigned = new Set(Array.isArray(small.sports) ? small.sports : []);
        if (input.checked) assigned.add(input.value);
        else assigned.delete(input.value);
        small.sports = selectedSportsFor(state).filter((sport) => assigned.has(sport));
      }
      small.sportSettingSource = "user";
      persist("소단원 종목 설정 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-small-concept]").forEach((input) => {
    input.addEventListener("change", () => {
      const [unitIndex, groupIndex, middleIndex, smallIndex] = input.dataset.smallConcept.split(":").map(Number);
      const small = state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].smallUnits[smallIndex];
      const assigned = new Set(Array.isArray(small.concepts) ? small.concepts : []);
      if (input.checked) assigned.add(input.value);
      else assigned.delete(input.value);
      small.concepts = selectedConceptsFor(state).filter((concept) => assigned.has(concept));
      persist("소단원 적용 구성요소 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-small-hours]").forEach((input) => {
    input.addEventListener("change", () => {
      const [unitIndex, groupIndex, middleIndex, smallIndex] = input.dataset.smallHours.split(":").map(Number);
      state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].smallUnits[smallIndex].hours = Number(input.value) || 0;
      persist();
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-small-pages]").forEach((input) => {
    input.addEventListener("change", () => {
      const [unitIndex, groupIndex, middleIndex, smallIndex] = input.dataset.smallPages.split(":").map(Number);
      state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].smallUnits[smallIndex].pages = Math.max(0, Number(input.value) || 0);
      persist();
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-unit-intro]").forEach((input) => {
    input.addEventListener("change", () => {
      state.units[Number(input.dataset.unitIntro)].introPages = Math.max(0, Number(input.value) || 0);
      persist();
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-unit-wrapup]").forEach((input) => {
    input.addEventListener("change", () => {
      state.units[Number(input.dataset.unitWrapup)].wrapUpPages = Math.max(0, Number(input.value) || 0);
      persist();
      renderWorkspace();
    });
  });

  document.querySelector("[data-front-matter-text]")?.addEventListener("change", (event) => {
    state.frontMatterText = event.target.value;
    persist();
    renderWorkspace();
  });

  document.querySelector("[data-back-matter-text]")?.addEventListener("change", (event) => {
    state.backMatterText = event.target.value;
    persist();
    renderWorkspace();
  });

  document.querySelector("[data-appendix-text]")?.addEventListener("change", (event) => {
    state.appendixText = event.target.value;
    persist();
    renderWorkspace();
  });

  document.querySelector("#openPagePreview")?.addEventListener("click", () => {
    pagePreviewOpen = true;
    renderWorkspace();
  });

  document.querySelector("#closePagePreview")?.addEventListener("click", () => {
    pagePreviewOpen = false;
    renderWorkspace();
  });

  document.querySelectorAll("[data-unit-domain]").forEach((input) => {
    input.addEventListener("input", () => {
      state.units[Number(input.dataset.unitDomain)].domain = input.value;
      persist();
    });
  });

  document.querySelectorAll("[data-unit-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const unitIndex = Number(button.dataset.unitIndex);
      const action = button.dataset.unitAction;
      if (action === "duplicate") {
        const copy = JSON.parse(JSON.stringify(state.units[unitIndex]));
        copy.domain = `${copy.domain} 사본`;
        state.units.splice(unitIndex + 1, 0, copy);
      } else if (action === "delete" && state.units.length > 1) {
        state.units.splice(unitIndex, 1);
      } else {
        return;
      }
      persist("대단원 구성 변경됨");
      renderWorkspace();
    });
  });

  document.querySelector("#addUnitDomainButton")?.addEventListener("click", () => {
    state.units.push({
      domain: "새 대단원",
      introPages: 4,
      wrapUpPages: 4,
      subdomainGroups: [{
        id: `sports-culture-domain-${Date.now()}`,
        subtitle: "새 대단원 부제",
        sourcePage: "",
        middleUnits: [{
          title: "새 중단원",
          smallUnits: [{ title: "새 소단원", sourceActivity: "새 활동", hours: 1, pages: 1, standardCodes: [] }],
        }],
      }],
    });
    persist("대단원 추가됨");
    renderWorkspace();
  });

  document.querySelectorAll("[data-middle-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const [unitIndex, groupIndex, middleIndex] = button.dataset.middlePath.split(":").map(Number);
      const group = state.units[unitIndex].subdomainGroups[groupIndex];
      const action = button.dataset.middleAction;
      if (action === "duplicate") {
        group.middleUnits.splice(middleIndex + 1, 0, JSON.parse(JSON.stringify(group.middleUnits[middleIndex])));
      } else if (action === "delete" && group.middleUnits.length > 1) {
        group.middleUnits.splice(middleIndex, 1);
      } else {
        return;
      }
      persist();
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-small-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const [unitIndex, groupIndex, middleIndex, smallIndex] = button.dataset.smallPath.split(":").map(Number);
      const middle = state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex];
      const action = button.dataset.smallAction;
      if (action === "duplicate") {
        middle.smallUnits.splice(smallIndex + 1, 0, JSON.parse(JSON.stringify(middle.smallUnits[smallIndex])));
      } else if (action === "delete" && middle.smallUnits.length > 1) {
        middle.smallUnits.splice(smallIndex, 1);
      } else {
        return;
      }
      persist();
      renderWorkspace();
    });
  });

  bindUnitDragAndDrop();

  document.querySelectorAll("[data-toggle-move]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.toggleMove;
      moveMenuOpenPath = moveMenuOpenPath === path ? null : path;
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-move-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const [sourceUnitIndex, sourceGroupIndex, sourceMiddleIndex, sourceSmallIndex] = button.dataset.moveSource.split(":").map(Number);
      const [targetUnitIndex, targetGroupIndex, targetMiddleIndex] = button.dataset.moveTarget.split(":").map(Number);
      const sourceMiddle = state.units[sourceUnitIndex].subdomainGroups[sourceGroupIndex].middleUnits[sourceMiddleIndex];
      const [smallUnit] = sourceMiddle.smallUnits.splice(sourceSmallIndex, 1);
      state.units[targetUnitIndex].subdomainGroups[targetGroupIndex].middleUnits[targetMiddleIndex].smallUnits.push(smallUnit);
      moveMenuOpenPath = null;
      persist("소단원 이동됨");
      renderWorkspace();
      showToast("다른 중단원으로 이동했습니다.");
    });
  });

  document.querySelectorAll("[data-add-middle]").forEach((button) => {
    button.addEventListener("click", () => {
      const [unitIndex, groupIndex] = button.dataset.addMiddle.split(":").map(Number);
      state.units[unitIndex].subdomainGroups[groupIndex].middleUnits.push({
        title: "새 중단원",
        smallUnits: [{ title: "새 소단원", sourceActivity: "새 활동", hours: 1, pages: 1 }],
      });
      persist();
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-add-small]").forEach((button) => {
    button.addEventListener("click", () => {
      const [unitIndex, groupIndex, middleIndex] = button.dataset.addSmall.split(":").map(Number);
      state.units[unitIndex].subdomainGroups[groupIndex].middleUnits[middleIndex].smallUnits.push({
        title: "새 소단원",
        sourceActivity: "새 활동",
        hours: 1,
        pages: 1,
      });
      persist();
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-book-style-value]").forEach((button) => {
    button.addEventListener("click", () => {
      state.bookStyleValue = Number(button.dataset.bookStyleValue);
      persist("전체 스타일 변경됨");
      renderWorkspace();
    });
  });

  document.querySelector("#draftAdditionalConceptInput")?.addEventListener("input", (event) => {
    sportsCultureAdditionalConcept = event.target.value;
  });

  document.querySelectorAll("[data-draft-target]").forEach((input) => {
    input.addEventListener("change", () => {
      const selected = new Set(state.selectedDraftSmallUnitKeys || []);
      if (input.checked) selected.add(input.dataset.draftTarget);
      else selected.delete(input.dataset.draftTarget);
      state.selectedDraftSmallUnitKeys = [...selected];
      persist("초고 생성 대상 변경됨");
      refreshDraftSelectionControls();
    });
  });

  document.querySelectorAll("[data-draft-group]").forEach((box) => {
    box.addEventListener("change", () => {
      const keys = box.dataset.draftGroup.split("|").filter(Boolean);
      const selected = new Set(state.selectedDraftSmallUnitKeys || []);
      keys.forEach((key) => (box.checked ? selected.add(key) : selected.delete(key)));
      state.selectedDraftSmallUnitKeys = [...selected];
      document.querySelectorAll("[data-draft-target]").forEach((input) => { input.checked = selected.has(input.dataset.draftTarget); });
      persist("초고 생성 대상 변경됨");
      refreshDraftSelectionControls();
    });
  });
  syncDraftGroupCheckboxes();

  document.querySelector("#selectAllDraftTargets")?.addEventListener("click", () => {
    state.selectedDraftSmallUnitKeys = draftStudioTargets().map((item) => item.key);
    document.querySelectorAll("[data-draft-target]").forEach((input) => { input.checked = true; });
    persist("전체 단원 생성 대상으로 선택됨");
    refreshDraftSelectionControls();
  });

  document.querySelector("#includeMockupsToggle")?.addEventListener("change", (event) => {
    state.includeMockups = event.target.checked;
    persist("디자인 시안 함께 그리기 변경됨");
  });

  document.querySelectorAll("[data-draft-content-type]").forEach((select) => {
    select.addEventListener("change", () => {
      const small = sportsCultureSmallUnitRecord(select.dataset.draftContentType);
      if (!small) return;
      small.contentType = select.value;
      small.supportMode = "";
      persist("소단원 이론·실기 유형 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-draft-support-mode]").forEach((select) => {
    select.addEventListener("change", () => {
      const small = sportsCultureSmallUnitRecord(select.dataset.draftSupportMode);
      if (!small) return;
      small.supportMode = select.value;
      persist("소단원 보조 구성 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-elementary-lesson-type]").forEach((select) => {
    select.addEventListener("change", () => {
      const small = sportsCultureSmallUnitRecord(select.dataset.elementaryLessonType);
      if (!small) return;
      small.lessonType = select.value;
      persist("소단원 수업 유형 변경됨");
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-elementary-corner]").forEach((select) => {
    select.addEventListener("change", () => {
      const unitIndex = select.dataset.elementaryCorner;
      state.elementaryCornerTypes ||= {};
      if (select.value) state.elementaryCornerTypes[unitIndex] = select.value;
      else delete state.elementaryCornerTypes[unitIndex];
      if (!select.value) state.selectedDraftSmallUnitKeys = (state.selectedDraftSmallUnitKeys || []).filter((key) => key !== `special:corner:${unitIndex}`);
      persist("확장 코너 변경됨");
      renderWorkspace();
    });
  });

  document.querySelector("#selectAllSmallDraftTargets")?.addEventListener("click", () => {
    state.selectedDraftSmallUnitKeys = smallUnitOptions().map((item) => item.key);
    document.querySelectorAll("[data-draft-target]").forEach((input) => { input.checked = state.selectedDraftSmallUnitKeys.includes(input.dataset.draftTarget); });
    persist("전체 소단원 생성 대상으로 선택됨");
    refreshDraftSelectionControls();
  });

  document.querySelector("#clearDraftTargets")?.addEventListener("click", () => {
    state.selectedDraftSmallUnitKeys = [];
    document.querySelectorAll("[data-draft-target]").forEach((input) => { input.checked = false; });
    persist("초고 생성 대상 선택 해제됨");
    refreshDraftSelectionControls();
  });

  document.querySelector("#selectAllSpecialDraftTargets")?.addEventListener("click", () => {
    const specialKeys = specialDraftTargets().map((item) => item.key);
    const current = new Set(state.selectedDraftSmallUnitKeys || []);
    specialKeys.forEach((key) => current.add(key));
    state.selectedDraftSmallUnitKeys = [...current];
    document.querySelectorAll("[data-draft-target]").forEach((input) => { input.checked = state.selectedDraftSmallUnitKeys.includes(input.dataset.draftTarget); });
    persist("전체 도입·마무리·특별페이지를 생성 대상으로 선택됨");
    refreshDraftSelectionControls();
  });

  document.querySelector("#clearSpecialDraftTargets")?.addEventListener("click", () => {
    const specialKeys = new Set(specialDraftTargets().map((item) => item.key));
    state.selectedDraftSmallUnitKeys = (state.selectedDraftSmallUnitKeys || []).filter((key) => !specialKeys.has(key));
    document.querySelectorAll("[data-draft-target]").forEach((input) => { input.checked = state.selectedDraftSmallUnitKeys.includes(input.dataset.draftTarget); });
    persist("도입·마무리·특별페이지 선택 해제됨");
    refreshDraftSelectionControls();
  });

  document.querySelector("#includeImagesToggle")?.addEventListener("change", (event) => {
    state.includeImages = event.target.checked;
    persist("삽화 이미지 포함 여부 변경됨");
  });

  document.querySelector("#generateDraftButton")?.addEventListener("click", async (event) => {
    if (usesDraftStudio()) {
      const sportsCultureMode = isSportsCultureProject();
      const targetsByKey = new Map(draftStudioTargets().map((item) => [item.key, item]));
      const targets = (state.selectedDraftSmallUnitKeys || []).map((key) => targetsByKey.get(key)).filter(Boolean);
      if (!targets.length) {
        showToast("먼저 생성할 소단원이나 특별 페이지를 선택해 주세요.");
        return;
      }
      const engine = globalThis.TEXTBOOK_DRAFT_ENGINE;
      if (!engine) {
        showToast("내부 초안 생성 모듈을 불러오지 못했습니다.");
        return;
      }
      const button = event.currentTarget;
      const originalLabel = button.textContent;
      button.disabled = true;
      const busy = startButtonBusy(button);
      const busyNote = document.querySelector("#draftGenerateSelectionSummary");
      if (busyNote) busyNote.textContent = `AI가 펼침면마다 원고를 쓰는 중입니다(항목 하나에 1~2분${state.includeMockups && !isSportsCultureProject() ? ", 시안까지 그리면 2~4분" : ""}). 이 창을 열어 두세요.`;
      let completedCount = 0;
      let failedMockups = 0;
      let mockupError = "";
      const firstNewBatchIndex = state.frameworkDraftLog.length;
      try {
        const style = sportsCultureStyleProfile(state.bookStyleValue);
        const framework = { id: style.id, name: `전체 스타일 · ${style.label}`, summary: style.summary };
        const metrics = sportsCultureStyleMetrics(state.bookStyleValue);
        const additionalConcept = sportsCultureAdditionalConcept.trim();
        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          busy.set(`${index + 1}/${targets.length} 초고 구성 중…`);
          if (!sportsCultureMode) {
            const result = await engine.generateDraftSet({
              profileId: globalThis.ELEMENTARY_DRAFT_ENGINE.profileId,
              imageAudience: "elementary",
              providerId: engine.externalAiProviderId,
              styleValue: state.bookStyleValue,
              additionalConcept: "",
              feedbackNotes: selectedFeedbackNotes(),
              includeImages: false,
              onImageProgress: (done, total) => {
                busy.set(`${index + 1}/${targets.length} 초고 구성 중… (이미지 ${done}/${total})`);
              },
              smallUnit: target,
              frameworks: [framework],
              metricsByFramework: { [framework.id]: metrics },
            });
            state.frameworkDraftLog.push({
              generatedAt: new Date().toISOString(),
              targetKey: target.key,
              smallUnitLabel: result.entries[0]?.smallUnitLabel || `${target.domain} · ${target.middleTitle} · ${target.smallTitle}`,
              lessonType: target.lessonType || null,
              pageRole: target.pageRole,
              styleValue: state.bookStyleValue,
              styleLabel: style.label,
              provider: result.provider,
              entries: result.entries,
            });
            completedCount = index + 1;
            if (state.includeMockups) {
              busy.set(`${index + 1}/${targets.length} 디자인 시안 그리는 중…`);
              persistNow("초고 생성됨");
              const failed = await drawMockupsForBatches([state.frameworkDraftLog.length - 1]);
              if (failed) {
                failedMockups += failed;
                const lastIndex = state.frameworkDraftLog.length - 1;
                mockupError ||= Object.entries(state.designMockups || {}).find(([key, value]) => key.startsWith(`${state.frameworkDraftLog[lastIndex].generatedAt}|`) && value?.error)?.[1]?.error || "";
              }
            }
            continue;
          }
          const sportMode = target.sportMode || "none";
          const targetSports = sportMode === "none" ? [] : (target.sports || []);
          if (sportMode !== "none" && !targetSports.length) throw new Error(`${target.smallTitle}: ${sportsCultureSportModeLabel(sportMode)}에 사용할 종목을 지정해 주세요.`);
          const carrierSport = targetSports.join(", ");
          const primaryType = target.targetKind === "small-unit" ? target.contentType : "theory";
          const supportMode = target.targetKind === "small-unit" ? target.supportMode : "";
          const result = await engine.generateDraftSet({
            profileId: engine.sportsCultureProfile().id,
            providerId: engine.externalAiProviderId,
            carrierSport,
            sportMode,
            sports: targetSports,
            primaryType,
            supportMode,
            pageRole: target.pageRole,
            styleValue: state.bookStyleValue,
            additionalConcept,
            feedbackNotes: selectedFeedbackNotes(),
            includeImages: Boolean(state.includeImages),
            onImageProgress: (done, total) => {
              busy.set(`${index + 1}/${targets.length} 초고 구성 중… (이미지 ${done}/${total})`);
            },
            smallUnit: target,
            frameworks: [framework],
            metricsByFramework: { [framework.id]: metrics },
          });
          state.frameworkDraftLog.push({
            generatedAt: new Date().toISOString(),
            targetKey: target.key,
            smallUnitLabel: `${target.domain} · ${target.middleTitle} · ${target.smallTitle}`,
            carrierSport,
            sportMode,
            primaryType,
            supportMode,
            pageRole: target.pageRole,
            styleValue: state.bookStyleValue,
            styleLabel: style.label,
            provider: result.provider,
            entries: result.entries,
          });
          completedCount = index + 1;
        }
        busy.stop();
        expandedDraftBatches = new Set([state.frameworkDraftLog.length - 1]);
        {
          const lastBatchIndex = state.frameworkDraftLog.length - 1;
          const lastBatch = state.frameworkDraftLog[lastBatchIndex];
          expandedDraftFilePreviews = new Set((lastBatch?.entries || []).map((_, entryIndex) => `${lastBatchIndex}:${entryIndex}`));
        }
        persistNow(`${targets.length}개 초고 생성됨`);
        renderWorkspace();
        showToast(failedMockups ? `${targets.length}개 항목의 초고를 생성했지만 디자인 시안 ${failedMockups}장은 그리지 못했습니다${mockupError ? `: ${mockupError}` : ""}. 미리보기에서 [디자인 시안 그리기]로 다시 그려 주세요.` : `${targets.length}개 항목의 초고를 생성했습니다.`);
        if (await saveNewDraftBatchesToFolder(firstNewBatchIndex)) persist("초고 폴더 저장 위치 기록됨");
      } catch (error) {
        busy.stop();
        button.disabled = false;
        button.textContent = originalLabel;
        if (busyNote) busyNote.textContent = `선택한 ${(state.selectedDraftSmallUnitKeys || []).length}개 항목`;
        // 여러 항목을 순서대로 생성하다가 중간에 실패해도, 이미 성공한 항목까지는
        // 화면에서 사라지지 않고 그대로 저장·표시되게 한다(예전엔 실패 시 catch에서
        // persist/render를 안 불러서, 앞서 성공한 항목까지 화면에 반영도 저장도 안 된
        // 채 사라진 것처럼 보이는 문제가 있었다).
        if (completedCount > 0) {
          const lastBatchIndex = state.frameworkDraftLog.length - 1;
          const lastBatch = state.frameworkDraftLog[lastBatchIndex];
          expandedDraftBatches = new Set([lastBatchIndex]);
          expandedDraftFilePreviews = new Set((lastBatch?.entries || []).map((_, entryIndex) => `${lastBatchIndex}:${entryIndex}`));
          persistNow(`${completedCount}개 초고 생성됨(이후 실패)`);
          renderWorkspace();
          if (await saveNewDraftBatchesToFolder(firstNewBatchIndex)) persist("초고 폴더 저장 위치 기록됨");
        }
        showToast(`${completedCount}/${targets.length}개까지 생성 후 실패: ${error?.message || "초고 생성에 실패했습니다."}`);
      }
      return;
    }
    showToast("이 과목은 아직 초안을 만들 수 없습니다.");
  });

  document.querySelectorAll("[data-download-pptx]").forEach((button) => {
    button.addEventListener("click", () => {
      const [roundIndex, entryIndex] = button.dataset.downloadPptx.split(":").map(Number);
      const entry = state.frameworkDraftLog[roundIndex]?.entries[entryIndex];
      if (!entry) return;
      const pres = spreadsToPptx(entry);
      pres.writeFile({ fileName: `${entry.frameworkName}_${entry.smallUnitLabel}.pptx` });
      showToast("PPT를 다운로드했습니다.");
    });
  });

  document.querySelectorAll("[data-download-textbook-text]").forEach((button) => {
    button.addEventListener("click", () => {
      const [roundIndex, entryIndex] = button.dataset.downloadTextbookText.split(":").map(Number);
      const entry = state.frameworkDraftLog?.[roundIndex]?.entries?.[entryIndex];
      if (!entry) return;
      downloadTextFile(`${entry.frameworkName}_${entry.smallUnitLabel}_교과서원고.txt`, textbookManuscriptText(entry));
      showToast("교과서 원고를 다운로드했습니다.");
    });
  });

  document.querySelectorAll("[data-download-guide-text]").forEach((button) => {
    button.addEventListener("click", () => {
      const [roundIndex, entryIndex] = button.dataset.downloadGuideText.split(":").map(Number);
      const entry = state.frameworkDraftLog?.[roundIndex]?.entries?.[entryIndex];
      if (!entry) return;
      downloadTextFile(`${entry.frameworkName}_${entry.smallUnitLabel}_지도서원고.txt`, teacherGuideManuscriptText(entry));
      showToast("지도서 원고를 다운로드했습니다.");
    });
  });

  document.querySelectorAll("[data-download-textbook-pdf]").forEach((button) => {
    button.addEventListener("click", () => {
      const [roundIndex, entryIndex] = button.dataset.downloadTextbookPdf.split(":").map(Number);
      const entry = state.frameworkDraftLog?.[roundIndex]?.entries?.[entryIndex];
      if (!entry) return;
      downloadCanvasPagesAsPdf(`${entry.frameworkName}_${entry.smallUnitLabel}_교과서원고.pdf`, buildTextbookManuscriptPdfPages(entry));
      showToast("교과서 원고 PDF를 다운로드했습니다.");
    });
  });

  document.querySelectorAll("[data-download-guide-pdf]").forEach((button) => {
    button.addEventListener("click", () => {
      const [roundIndex, entryIndex] = button.dataset.downloadGuidePdf.split(":").map(Number);
      const entry = state.frameworkDraftLog?.[roundIndex]?.entries?.[entryIndex];
      if (!entry) return;
      downloadCanvasPagesAsPdf(`${entry.frameworkName}_${entry.smallUnitLabel}_지도서원고.pdf`, buildTeacherGuideManuscriptPdfPages(entry));
      showToast("지도서 원고 PDF를 다운로드했습니다.");
    });
  });

  document.querySelectorAll("[data-download-lesson-plan-hwpx]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [roundIndex, entryIndex] = button.dataset.downloadLessonPlanHwpx.split(":").map(Number);
      const entry = state.frameworkDraftLog?.[roundIndex]?.entries?.[entryIndex];
      if (!entry) return;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "생성 중...";
      try {
        const blob = await fetchLessonPlanHwpxBlob(entry);
        triggerBlobDownload(blob, `${entry.frameworkName}_${entry.smallUnitLabel}_교수학습과정안.hwpx`);
        showToast("교수학습과정안 HWPX를 다운로드했습니다.");
      } catch (error) {
        showToast(error.message || "교수학습과정안 생성에 실패했습니다.");
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  });

  document.querySelectorAll("[data-download-images-zip]").forEach((button) => {
    button.addEventListener("click", async () => {
      const [roundIndex, entryIndex] = button.dataset.downloadImagesZip.split(":").map(Number);
      const entry = state.frameworkDraftLog?.[roundIndex]?.entries?.[entryIndex];
      if (!entry) return;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "압축 중…";
      try {
        const blob = await buildEntryImagesZip(entry);
        if (!blob) {
          showToast("이 체제에는 저장된 삽화 이미지가 없습니다. (삽화 이미지 옵션을 켜고 생성해야 포함됩니다)");
          return;
        }
        triggerBlobDownload(blob, `${entry.frameworkName}_${entry.smallUnitLabel}_이미지.zip`);
        showToast("삽화 이미지를 zip으로 다운로드했습니다.");
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  });

  document.querySelectorAll("[data-download-draft-png]").forEach((button) => {
    button.addEventListener("click", () => {
      const path = button.dataset.downloadDraftPng;
      const canvas = document.querySelector(`[data-draft-canvas="${path}"]`);
      if (!canvas) return;
      const [batchIndex, entryIndex, spreadIndex] = path.split(":").map(Number);
      const entry = state.frameworkDraftLog?.[batchIndex]?.entries?.[entryIndex];
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `${entry?.frameworkName || "스포츠문화"}_${spreadIndex + 1}번째_펼침면.png`;
      link.click();
      showToast("펼침면 PNG를 저장했습니다.");
    });
  });

  document.querySelectorAll("[data-enlarge-draft-image]").forEach((button) => {
    button.addEventListener("click", () => {
      const figure = button.closest(".draft-spread-image");
      const expanded = figure?.classList.toggle("expanded");
      button.textContent = expanded ? "닫기" : "크게 보기";
    });
  });

  document.querySelector("#reviseFrameworkApproval")?.addEventListener("click", () => {
    state.frameworkApproval = { status: "draft", frameworkId: state.frameworkApproval?.frameworkId || null, approvedAt: null };
    persist("체제 승인 취소됨");
    renderWorkspace();
  });

  document.querySelector("#draftLogSelectAll")?.addEventListener("change", (event) => {
    if (event.target.checked) state.frameworkDraftLog.forEach((_, index) => selectedDraftBatches.add(index));
    else selectedDraftBatches.clear();
    renderWorkspace();
  });

  document.querySelectorAll("[data-draft-log-checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", (event) => {
      const index = Number(checkbox.dataset.draftLogCheckbox);
      if (event.target.checked) selectedDraftBatches.add(index);
      else selectedDraftBatches.delete(index);
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-draft-log-index]").forEach((details) => {
    details.addEventListener("toggle", () => {
      const index = Number(details.dataset.draftLogIndex);
      if (details.open) expandedDraftBatches.add(index);
      else expandedDraftBatches.delete(index);
    });
  });

  document.querySelector("#downloadSelectedDraftsButton")?.addEventListener("click", async (event) => {
    const indices = [...selectedDraftBatches].sort((a, b) => a - b);
    if (!indices.length) return;
    const button = event.currentTarget;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "압축 중…";
    try {
      const blob = await buildSelectedDraftsZip(indices);
      triggerBlobDownload(blob, `${state.project.name || "초안"}_선택${indices.length}건.zip`);
      showToast(`${indices.length}개 회차(PPT·원고 TXT·삽화 이미지)를 zip 1개로 다운로드했습니다.`);
    } catch (error) {
      console.error(error);
      showToast("다운로드 중 오류가 발생했습니다.");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  document.querySelector("#deleteSelectedDraftsButton")?.addEventListener("click", () => {
    const indices = [...selectedDraftBatches];
    if (!indices.length) return;
    if (!confirm(`선택한 ${indices.length}개 회차를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    state.frameworkDraftLog = state.frameworkDraftLog.filter((_, index) => !selectedDraftBatches.has(index));
    selectedDraftBatches.clear();
    persist("생성 이력 삭제됨");
    renderWorkspace();
    showToast("선택한 회차를 삭제했습니다.");
  });

  // --- 스포츠 문화 "전체 스타일·초고" 표: 회차가 아니라 PPT/교과서/지도서/이미지 파일 단위로 선택한다 ---

  function allDraftFileKeys() {
    const keys = [];
    (state.frameworkDraftLog || []).forEach((batch, batchIndex) => {
      batch.entries.forEach((entry, entryIndex) => {
        DRAFT_FILE_TYPES.forEach((type) => {
          if (entryHasFileType(entry, type.id)) keys.push(`${batchIndex}:${entryIndex}:${type.id}`);
        });
      });
    });
    return keys;
  }

  document.querySelector("#draftFileSelectAll")?.addEventListener("change", (event) => {
    if (event.target.checked) allDraftFileKeys().forEach((key) => selectedDraftFiles.add(key));
    else selectedDraftFiles.clear();
    renderWorkspace();
  });

  document.querySelectorAll("[data-draft-file-checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const key = checkbox.dataset.draftFileCheckbox;
      if (event.target.checked) selectedDraftFiles.add(key);
      else selectedDraftFiles.delete(key);
      renderWorkspace();
    });
  });

  // 제목 앞 체크박스: 그 행에 실제로 있는 유형(이미지 없으면 3개, 있으면 4개) 체크박스를
  // 한 번에 켜고 끈다. 유형별 체크박스는 이후에도 각자 따로 끄고 켤 수 있다.
  document.querySelectorAll("[data-draft-file-row-checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const row = checkbox.closest("tr");
      const checked = event.target.checked;
      row?.querySelectorAll("[data-draft-file-checkbox]").forEach((cell) => {
        const key = cell.dataset.draftFileCheckbox;
        if (checked) selectedDraftFiles.add(key);
        else selectedDraftFiles.delete(key);
      });
      renderWorkspace();
    });
  });

  // 열 헤더 체크박스: PPT/교과서/지도서/이미지 앞 체크박스 하나로 그 유형 전체(이미지가
  // 없는 항목은 제외) 파일을 한 번에 선택/해제한다.
  document.querySelectorAll("[data-draft-file-column-checkbox]").forEach((checkbox) => {
    checkbox.addEventListener("change", (event) => {
      const type = checkbox.dataset.draftFileColumnCheckbox;
      const checked = event.target.checked;
      document.querySelectorAll("[data-draft-file-checkbox]").forEach((cell) => {
        const key = cell.dataset.draftFileCheckbox;
        if (key.split(":")[2] !== type) return;
        if (checked) selectedDraftFiles.add(key);
        else selectedDraftFiles.delete(key);
      });
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-draft-file-preview-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.draftFilePreviewToggle;
      if (expandedDraftFilePreviews.has(key)) expandedDraftFilePreviews.delete(key);
      else expandedDraftFilePreviews.add(key);
      renderWorkspace();
    });
  });

  document.querySelector("#downloadSelectedDraftFilesButton")?.addEventListener("click", async (event) => {
    const keys = [...selectedDraftFiles];
    if (!keys.length) return;
    const button = event.currentTarget;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "압축 중…";
    try {
      const blob = await buildFilesZip(keys);
      triggerBlobDownload(blob, `${state.project.name || "초안"}_선택${keys.length}개파일.zip`);
      showToast(`${keys.length}개 파일을 zip 1개로 다운로드했습니다.`);
    } catch (error) {
      console.error(error);
      showToast("다운로드 중 오류가 발생했습니다.");
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });

  document.querySelector("#deleteSelectedDraftFilesButton")?.addEventListener("click", () => {
    const batchIndices = new Set([...selectedDraftFiles].map((key) => Number(key.split(":")[0])));
    if (!batchIndices.size) return;
    if (!confirm(`선택한 파일이 속한 ${batchIndices.size}개 회차 전체를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    state.frameworkDraftLog = state.frameworkDraftLog.filter((_, index) => !batchIndices.has(index));
    selectedDraftFiles.clear();
    persist("생성 이력 삭제됨");
    renderWorkspace();
    showToast("선택한 회차를 삭제했습니다.");
  });

  document.querySelectorAll("[data-download-type]").forEach((button) => {
    button.addEventListener("click", async () => {
      const type = button.dataset.downloadType;
      const typeLabel = DRAFT_FILE_TYPES.find((item) => item.id === type)?.label || type;
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "압축 중…";
      try {
        const blob = await buildTypeOnlyZip(type);
        triggerBlobDownload(blob, `${state.project.name || "초안"}_${typeLabel}_전체.zip`);
        showToast(`${typeLabel} 전체를 zip으로 다운로드했습니다.`);
      } catch (error) {
        console.error(error);
        showToast("다운로드 중 오류가 발생했습니다.");
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  });

  document.querySelectorAll("[data-edit-source]").forEach((button) => {
    button.addEventListener("click", () => {
      editingSourceId = button.dataset.editSource;
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-evidence-details]").forEach((details) => {
    details.addEventListener("toggle", () => {
      evidenceDetailsOpen = details.open;
    });
  });

  document.querySelectorAll("[data-cancel-source]").forEach((button) => {
    button.addEventListener("click", () => {
      editingSourceId = null;
      renderWorkspace();
    });
  });

  document.querySelectorAll("[data-save-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const sourceId = button.dataset.saveSource;
      const text = document.querySelector(`[data-inline-source="${sourceId}"]`).value.trim();
      const note = document.querySelector(`[data-inline-note="${sourceId}"]`).value.trim();
      if (!text) {
        showToast("수정할 원문을 입력해 주세요.");
        return;
      }
      const versions = sourceCorrections[sourceId]?.versions || [];
      const currentText = versions.at(-1)?.text || sourceExcerpts[sourceId];
      if (text === currentText) {
        showToast("변경된 내용이 없어 새 버전을 만들지 않았습니다.");
        return;
      }
      sourceCorrections[sourceId] = { versions: [...versions, { text, note, savedAt: new Date().toISOString() }] };
      localStorage.setItem(CORRECTION_STORAGE_KEY, JSON.stringify(sourceCorrections));
      editingSourceId = null;
      renderWorkspace();
      showToast(`수정본 v${sourceCorrections[sourceId].versions.length}을 저장했습니다.`);
    });
  });

  document.querySelectorAll("[data-restore-source]").forEach((button) => {
    button.addEventListener("click", () => {
      const sourceId = button.dataset.restoreSource;
      const versionIndex = Number(button.dataset.versionIndex);
      const versions = sourceCorrections[sourceId]?.versions || [];
      const restoredText = versionIndex < 0 ? sourceExcerpts[sourceId] : versions[versionIndex]?.text;
      if (!restoredText) return;
      sourceCorrections[sourceId] = {
        versions: [...versions, {
          text: restoredText,
          note: versionIndex < 0 ? "전처리 원문으로 복원" : `v${versionIndex + 1}에서 복원`,
          savedAt: new Date().toISOString(),
        }],
      };
      localStorage.setItem(CORRECTION_STORAGE_KEY, JSON.stringify(sourceCorrections));
      renderWorkspace();
      showToast(`이전 내용을 v${sourceCorrections[sourceId].versions.length}로 복원했습니다.`);
    });
  });
}

function goToStep(index) {
  const nextIndex = Math.max(0, Math.min(steps.length - 1, index));
  const validation = activeStageValidation();
  if (nextIndex > state.currentStep && !validation.valid) {
    state.currentStep = 0;
    render();
    showToast(validation.unavailable
      ? "해당 학교급은 공식 자료 전처리 후 다음 단계를 열 수 있습니다."
      : "공식 분량 범위를 통과해야 다음 단계로 이동할 수 있습니다.");
    return;
  }
  if (state.currentStep === 0 && nextIndex > 0 && activeProject().setupApproval.status !== "approved") {
    showToast("프로젝트 기본 조건을 팀장 승인한 뒤 다음 단계로 이동할 수 있습니다.");
    return;
  }
  state.currentStep = nextIndex;
  persist();
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// 2009·2015 개정은 분석만 한다(개발 단계 없음).
function isAnalysisOnlyRevision() {
  return Boolean(analysisProjectIds(selectedRevision));
}

function inAnalysisView() {
  return isAnalysisOnlyRevision() || (workMode === "analysis" && hasRevisionReference(selectedRevision));
}

function analysisCatalogFor() {
  if (!isAnalysisOnlyRevision()) return inferredCatalogId(activeProject());
  const ids = analysisProjectIds(selectedRevision);
  if (!ids.includes(analysisCatalogId)) {
    const current = inferredCatalogId(activeProject());
    analysisCatalogId = ids.includes(current) ? current : ids[0];
  }
  return analysisCatalogId;
}

function render() {
  if (inAnalysisView()) {
    renderProjectSwitcher();
    renderAnalysisView(selectedRevision, analysisCatalogFor());
    return;
  }
  leaveAnalysisView();
  const fitted = Object.values(activeProject().books || {}).map(ensurePagesFitTargets).some(Boolean);
  if (fitted) persist("기준 쪽수에 맞게 기본 쪽수 배분됨");
  // 04 현장 의견 분석 단계를 끼우기 전에 저장된 책은 초안 이후 단계 번호를 하나씩 민다.
  if ((state.stepLayout || 1) < STEP_LAYOUT_VERSION) {
    if (state.currentStep >= FEEDBACK_STEP_INDEX) state.currentStep += 1;
    state.stepLayout = STEP_LAYOUT_VERSION;
  }
  // 05 모의심사 단계를 없앴으므로, 그 단계에 머문 채 저장된 책은 마지막 단계로 돌린다.
  if (!(state.currentStep < steps.length)) state.currentStep = steps.length - 1;
  renderProjectSwitcher();
  renderNavigation();
  renderHeader();
  renderWorkspace();
}

document.querySelector("#previousButton").addEventListener("click", () => goToStep(state.currentStep - 1));
document.querySelector("#nextButton").addEventListener("click", () => {
  const validation = activeStageValidation();
  if (!validation.valid) {
    state.currentStep = 0;
    render();
    showToast(validation.unavailable
      ? "선택한 학교급·과목의 공식 자료가 아직 연결되지 않아 확정할 수 없습니다."
      : "본문·부록 합계와 부속자료 쪽수를 공식 범위 안으로 수정해 주세요.");
    return;
  }
  if (state.currentStep === 0 && activeProject().setupApproval.status !== "approved") {
    showToast("프로젝트 기본 조건을 팀장 승인한 뒤 다음 단계로 이동할 수 있습니다.");
    return;
  }
  if (state.currentStep === steps.length - 1) {
    persist("프로토타입 저장 완료");
    showToast("전체 흐름을 확인하고 저장했습니다.");
    return;
  }
  goToStep(state.currentStep + 1);
});
document.querySelector("#saveButton").addEventListener("click", () => {
  if (persist("직접 저장됨")) {
    showToast("현재 작업을 이 브라우저에 저장했습니다.");
  } else {
    showToast("분량 기준을 벗어나 저장하지 않았습니다.");
  }
});
document.querySelector("#backupAllProjectsButton").addEventListener("click", () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blob = new Blob([JSON.stringify(projectStore, null, 2)], { type: "application/json" });
  triggerBlobDownload(blob, `textbook-studio-backup_${stamp}.json`);
  showToast("모든 프로젝트를 JSON 파일로 내려받았습니다.");
});
document.querySelector("#restoreAllProjectsButton").addEventListener("click", () => {
  document.querySelector("#restoreAllProjectsInput").click();
});
document.querySelector("#restoreAllProjectsInput").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      showToast("올바른 JSON 파일이 아닙니다.");
      return;
    }
    // hydrateProjectStorePayload는 프로젝트별로 오류를 따로 감싸므로(위 hydrateSingleCatalogProject
    // 참고), 백업 파일 일부가 낡았거나 이상해도 나머지 프로젝트는 그대로 복구된다.
    const hydrated = hydrateProjectStorePayload(parsed);
    if (!hydrated) {
      showToast("이 파일은 백업 형식(전체 백업 다운로드로 받은 JSON)이 아닙니다.");
      return;
    }
    if (!confirm(`이 백업 파일 안의 프로젝트 ${hydrated.projects.length}개로 지금 화면의 모든 프로젝트를 완전히 바꿀까요? 현재 화면에만 있고 백업에는 없는 내용은 사라집니다.`)) return;
    projectStore = hydrated;
    useActiveBookState();
    try {
      localStorage.setItem(PROJECTS_STORAGE_KEY, serializeProjectStoreForStorage(projectStore));
    } catch {
      // 저장 용량 초과 등으로 로컬 저장에 실패해도 화면 반영과 서버 동기화는 계속 진행한다.
    }
    render();
    pushProjectStoreToServer();
    showToast("백업 파일을 불러왔습니다.");
  };
  reader.readAsText(file);
});
document.querySelector("#resetButton").addEventListener("click", () => {
  const project = activeProject();
  if (!confirm(`'${project.name}' 프로젝트의 모든 학년책 입력과 페이지 편집을 초기화할까요? 다른 프로젝트는 유지됩니다.`)) return;
  const catalogItem = PROJECT_CATALOG.find((item) => item.id === project.catalogId);
  const resetProject = project.type === "elementary-band"
    ? elementaryBandProject(project.band, project.name, project.id)
    : project.type === "high-pe-band"
      ? highPeBandProject(project.name, project.id)
      : project.type === "middle-pe-band"
        ? middlePeBandProject(project.name, project.id)
        : project.type === "single-book"
          ? secondaryProject(catalogItem, project.id, project.name)
          : unavailableCatalogProject(catalogItem, project.id);
  resetProject.createdAt = project.createdAt;
  projectStore.projects[projectStore.projects.findIndex((item) => item.id === project.id)] = resetProject;
  projectStore.activeProjectId = resetProject.id;
  useActiveBookState();
  editingSourceId = null;
  persist("초기 상태 저장됨");
  render();
  showToast("현재 프로젝트만 초기화했습니다.");
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !pagePreviewOpen) return;
  pagePreviewOpen = false;
  renderWorkspace();
});

bindWorkspaceFolderPanel();
bindAiKeyPanel();
bindQuitStudioButton();
bindUnitTitleProposal();
bindDesigncraftPanel();
render();
persist("자동 저장됨");
clearTimeout(serverSyncTimer);
syncProjectStoreFromServer();
