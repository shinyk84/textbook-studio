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
  ["체제안 선택", "스타일·초고 생성"],
  ["모의심사", "PDF 모의심사"],
];

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

const PROJECT_CATALOG = [
  { id: "elementary-3-4", group: "초등학교", label: "초등 체육 3~4학년군", schoolLevel: "초등학교", subject: "체육", band: "3~4학년군", connected: true },
  { id: "elementary-5-6", group: "초등학교", label: "초등 체육 5~6학년군", schoolLevel: "초등학교", subject: "체육", band: "5~6학년군", connected: true },
  { id: "middle-pe", group: "중학교", label: "중등체육", schoolLevel: "중학교", subject: "중등체육", connected: false, partial: secondaryCourses["중등 체육"]?.status === "partial" },
  { id: "high-pe", group: "고등학교", label: "고등 체육", schoolLevel: "고등학교", subject: "체육1·체육2", connected: secondaryCourses["체육1"]?.status === "connected" && secondaryCourses["체육2"]?.status === "connected" },
  { id: "high-exercise-health", group: "고등학교", label: "고등 운동과 건강", schoolLevel: "고등학교", subject: "운동과 건강", connected: secondaryCourses["운동과 건강"]?.status === "connected" },
  { id: "high-sports-culture", group: "고등학교", label: "고등 스포츠 문화", schoolLevel: "고등학교", subject: "스포츠 문화", connected: true },
  { id: "high-sports-science", group: "고등학교", label: "고등 스포츠 과학", schoolLevel: "고등학교", subject: "스포츠 과학", connected: secondaryCourses["스포츠 과학"]?.status === "connected" },
  { id: "high-sports-life-1", group: "고등학교", label: "고등 스포츠 생활1", schoolLevel: "고등학교", subject: "스포츠 생활1", connected: secondaryCourses["스포츠 생활1"]?.status === "connected" },
  { id: "high-sports-life-2", group: "고등학교", label: "고등 스포츠 생활2", schoolLevel: "고등학교", subject: "스포츠 생활2", connected: secondaryCourses["스포츠 생활2"]?.status === "connected" },
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
  book.generationProviderId ||= globalThis.TEXTBOOK_DRAFT_ENGINE?.internalProviderId || "internal-rules-v1";
  if (!Array.isArray(book.selectedSports)) {
    const previousSports = String(book.carrierSport || "배드민턴").split(/[,·/]/).map((item) => item.trim()).filter(Boolean);
    book.selectedSports = previousSports.filter((sport) => SPORTS_CULTURE_SPORT_OPTIONS.includes(sport));
    book.customSports ||= previousSports.filter((sport) => !SPORTS_CULTURE_SPORT_OPTIONS.includes(sport)).join(", ");
  }
  if (!book.selectedSports.length && !String(book.customSports || "").trim()) book.selectedSports = ["배드민턴"];
  book.carrierSport = selectedSportsFor(book).join(", ");
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

function sportsCultureSpecialPageTypeLabel(typeId) {
  return SPORTS_CULTURE_SPECIAL_PAGE_TYPES.find((type) => type.id === typeId)?.label || "특별 페이지";
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
    mockReview: null,
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
let selectedDraftBatches = new Set();
let expandedDraftBatches = new Set();

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
  initial.frontMatterText = "";
  initial.backMatterText = "";
  initial.appendixText = "자료 출처와 찾아보기, 4";
  initial.frameworkMetrics = defaultFrameworkMetrics(SPORTS_CULTURE_FRAMEWORKS);
  initial.generationProviderId = globalThis.TEXTBOOK_DRAFT_ENGINE?.internalProviderId || "internal-rules-v1";
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
  initial.frontMatterText = "";
  initial.backMatterText = "";
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

function loadProjectStore() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROJECTS_STORAGE_KEY));
    if (saved?.version === PROJECTS_STORAGE_VERSION && Array.isArray(saved.projects) && saved.projects.length) {
      saved.projects = migratePairedCatalogProjects(saved.projects).map((project) => {
        project.catalogId ||= inferredCatalogId(project);
        project.setupApproval ||= { status: "draft", version: 0, approvedAt: null, approvedSnapshot: null };
        Object.values(project.books || {}).forEach((book) => {
          if (!isPlaceholderProject(project) && book.project.schoolLevel !== "중학교") {
            book.project.targetHours ||= courseMetaFor(book)?.default_hours || pagePolicies.elementary_pe.default_book_hours;
          }
        });
        return hydrateCatalogProject(project);
      });
      const activeExists = saved.projects.some((project) => project.id === saved.activeProjectId);
      if (!activeExists) saved.activeProjectId = saved.projects[0].id;
      return saved;
    }
  } catch {
    // 손상된 다중 프로젝트 저장값은 구형 데이터 이전 또는 기본 프로젝트로 대체한다.
  }
  const oldState = legacyState();
  const firstProject = oldState
    ? migrateLegacyProject(oldState)
    : elementaryBandProject("3~4학년군", "초등 체육 3~4학년군");
  return { version: PROJECTS_STORAGE_VERSION, activeProjectId: firstProject.id, projects: [firstProject] };
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

function persist(message = "자동 저장됨") {
  const validation = state.currentStep === 0 ? projectSetupValidation() : pageValidation();
  const saveState = document.querySelector("#saveState");
  activeProject().updatedAt = new Date().toISOString();
  if (validation.unavailable) {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projectStore));
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
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projectStore));
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

function textbookManuscriptText(entry) {
  const lines = [
    "[스포츠 문화 교과서 원고]",
    `체제안: ${entry.frameworkName}`,
    `소단원: ${entry.smallUnitLabel}`,
    `소단원 성격: ${entry.primaryTypeLabel}`,
    `종목 사용 방식: ${sportsCultureSportModeLabel(entry.sportMode)}`,
    `종목: ${entry.carrierSport || "특정 종목 없음"}`,
    `성취기준: ${(entry.traceability?.standardCodes || []).join(", ")}`,
    "",
  ];
  entry.spreads.forEach((spread, index) => {
    const manuscript = spread.textbook_manuscript || {};
    lines.push(`===== 펼침면 ${index + 1} · ${spread.left_page}~${spread.right_page}쪽 =====`);
    lines.push(`# ${manuscript.headline || spread.title}`);
    lines.push(`학습 목표: ${manuscript.learningGoal || ""}`);
    lines.push(`생각 열기: ${manuscript.openingQuestion || ""}`);
    lines.push(`도입문: ${manuscript.deck || spread.intro}`, "");
    (manuscript.sections || []).forEach((section) => {
      lines.push(`${section.number}. ${section.title}`);
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
    "[스포츠 문화 지도서 원고]",
    `연계 교과서: ${entry.smallUnitLabel}`,
    `체제안: ${entry.frameworkName}`,
    `종목 사용 방식: ${sportsCultureSportModeLabel(entry.sportMode)}`,
    `종목: ${entry.carrierSport || "특정 종목 없음"}`,
    `성취기준: ${(entry.traceability?.standardCodes || []).join(", ")}`,
    `차시·분량: ${entry.teacherGuide?.annualPlanLink || ""}`,
    "",
  ];
  entry.spreads.forEach((spread, index) => {
    const guide = spread.teacher_guide || {};
    lines.push(`===== ${index + 1}차시군 · 교과서 ${spread.left_page}~${spread.right_page}쪽 =====`);
    lines.push("[수업 목표]", ...(guide.lessonGoals || []).map((item) => `- ${item}`));
    lines.push("", `[준비물] ${(guide.preparation || []).join(" · ")}`);
    lines.push("", "[수업 흐름]", ...(guide.lessonFlow || []).map((item) => `- ${item.stage}: ${item.guidance}`));
    lines.push("", "[지도상의 유의점]", ...(guide.teachingNotes || []).map((item) => `- ${item}`));
    lines.push("", "[핵심 발문]", ...(guide.questions || []).map((item) => `- ${item}`));
    lines.push("", "[예상 답변]", ...(guide.expectedResponses || []).map((item) => `- ${item}`));
    lines.push("", "[개별화·대체 참여]", ...(guide.differentiation || []).map((item) => `- ${item}`));
    lines.push("", `[안전·포용] ${guide.safety || ""}`);
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
  const rows = [["구분", "대단원", "이름", "종목 사용 방식", "종목", "차시", "쪽수"]];
  parseLineItems(state.frontMatterText).forEach((item) => rows.push(["앞부속", "", item.title, "", "", "", item.pages]));
  const placedSpecialIds = new Set();
  state.units.forEach((unit, unitIndex) => {
    const largeNumber = unitNumberLabel(unitIndex);
    const largeTitle = `${largeNumber}. ${unit.domain}`;
    if (Number(unit.introPages)) rows.push(["도입", largeTitle, `${largeTitle} 도입`, "", "", "", unit.introPages]);
    unit.subdomainGroups.forEach((group, groupIndex) => {
      group.middleUnits.forEach((middle, middleIndex) => {
        const middlePosition = middleUnitPosition(unit, groupIndex, middleIndex);
        const middleNumber = unitNumberLabel(unitIndex, middlePosition);
        rows.push(["중단원", largeTitle, `${middleNumber}. ${group.subtitle ? `${group.subtitle} · ` : ""}${middle.title}`, "", "", "", ""]);
        middle.smallUnits.forEach((small, smallIndex) => {
          const smallNumber = unitNumberLabel(unitIndex, middlePosition, smallIndex + 1);
          rows.push(["소단원", largeTitle, `${smallNumber}. ${small.title}`, sportsCultureSportModeLabel(small.sportMode), Array.isArray(small.sports) ? small.sports.join(", ") : "", small.hours, small.pages]);
        });
      });
    });
    (state.specialPages || []).filter((page) => page.domain === unit.domain).forEach((page) => {
      rows.push(["특별페이지", largeTitle, `${largeNumber}. ${page.title}`, sportsCultureSpecialPageTypeLabel(page.type), "", "", page.pages]);
      placedSpecialIds.add(page.id);
    });
    if (Number(unit.wrapUpPages)) rows.push(["마무리", largeTitle, `${largeTitle} 마무리`, "", "", "", unit.wrapUpPages]);
  });
  (state.specialPages || []).filter((page) => !placedSpecialIds.has(page.id)).forEach((page) => {
    rows.push(["특별페이지", page.domain || "", page.title, sportsCultureSpecialPageTypeLabel(page.type), "", "", page.pages]);
  });
  parseLineItems(state.backMatterText).forEach((item) => rows.push(["뒷부속", "", item.title, "", "", "", item.pages]));
  parseLineItems(state.appendixText).forEach((item) => rows.push(["부록", "", item.title, "", "", "", item.pages]));
  return rows;
}

function pagePlanRows(pages) {
  const rows = [["쪽", "영역", "단원", "유형", "상태"]];
  pages.forEach((page) => rows.push([page.number, page.area, page.unit, page.type, page.status]));
  return rows;
}

function formatDraftBatchTimestamp(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const PPTX_SUPPORT_BOX_COLORS = ["4F8A5B", "C2622B", "2E6B8A", "7A4FA3", "A3742E"];

function pptxAddActivityBlock(slide, activity, x, y, w, h) {
  const headerH = Math.min(0.4, h * 0.3);
  slide.addText(`활동 ${activity.number}  ${activity.title}`, {
    x, y, w, h: headerH, bold: true, color: "FFFFFF", fontSize: 12, fill: { color: "2E6B8A" },
  });
  slide.addText(`${activity.objective}\n${activity.method.join(" → ")}`, {
    x, y: y + headerH, w, h: Math.max(0.3, h - headerH - 0.05), fontSize: 10, color: "333333",
    fill: { color: "FFFFFF" }, line: { color: "D5DDD7" }, valign: "top",
  });
}

function pptxAddBoxBlock(slide, box, x, y, w, h, color) {
  const headerH = Math.min(0.35, h * 0.3);
  slide.addText(`[${box.type}]`, {
    x, y, w, h: headerH, bold: true, color: "FFFFFF", fontSize: 11, fill: { color },
  });
  slide.addText(box.content, {
    x, y: y + headerH, w, h: Math.max(0.3, h - headerH - 0.05), fontSize: 10, color: "333333",
    fill: { color: "FFFFFF" }, line: { color: "D5DDD7" }, valign: "top",
  });
}

function pptxStackBlocks(slide, blocks, x, y, w, bottom) {
  const height = blocks.length ? (bottom - y) / blocks.length : bottom - y;
  blocks.forEach((block) => {
    if (block.kind === "activity") pptxAddActivityBlock(slide, block.data, x, y, w, height);
    else pptxAddBoxBlock(slide, block.data, x, y, w, height, block.color);
    y += height;
  });
}

// 펼침면 1개 = 슬라이드 1장, 실제 책처럼 왼쪽 쪽(소단원명·본문·활동1)과 오른쪽 쪽(나머지 활동·마무리)으로
// 나눔. 보조단은 화면(renderSpreadDraft의 renderSupportBoxes)과 같은 규칙(인덱스 짝/홀수)으로 좌우에
// 나눠 배치 — 실제로는 내용에 맞는 배치를 AI가 판단해야 하므로, 실제 API 연동 시 이 배치 규칙을
// "어느 쪽에 놓을지"까지 모델이 정하게 바꿀 수 있음(예: support_boxes[].side를 응답에 포함).
function addEntrySlidesToPptx(pres, entry, headingPrefix = "") {
  const leftX = 0.35;
  const rightX = 6.95;
  const colWidth = 6.0;
  const top = 0.25;
  const bottom = 7.3;
  const wrapUpHeight = 0.9;

  entry.spreads.forEach((spread) => {
    const slide = pres.addSlide();
    slide.addShape(pres.ShapeType.line, { x: 6.65, y: 0.15, w: 0, h: 7.2, line: { color: "CFD9D2", width: 1 } });

    const coloredBoxes = spread.support_boxes.map((box, index) => ({
      data: box,
      kind: "box",
      color: PPTX_SUPPORT_BOX_COLORS[index % PPTX_SUPPORT_BOX_COLORS.length],
      side: index % 2 === 0 ? "left" : "right",
    }));

    let y = top;
    slide.addText(`${headingPrefix}${entry.frameworkName} · ${entry.smallUnitLabel}`, { x: leftX, y, w: colWidth, h: 0.45, fontSize: 14, bold: true, color: "215B3D" });
    y += 0.5;
    slide.addText(spread.intro, {
      x: leftX, y, w: colWidth, h: 1.0, fontSize: 10.5, color: "333333", valign: "top",
      fill: { color: "F4F6F4" }, line: { color: "D5DDD7" },
    });
    y += 1.1;
    const leftBlocks = [
      { data: spread.activities[0], kind: "activity" },
      ...coloredBoxes.filter((box) => box.side === "left"),
    ];
    pptxStackBlocks(slide, leftBlocks, leftX, y, colWidth, bottom);

    const rightBlocks = [
      ...spread.activities.slice(1).map((activity) => ({ data: activity, kind: "activity" })),
      ...coloredBoxes.filter((box) => box.side === "right"),
    ];
    pptxStackBlocks(slide, rightBlocks, rightX, top, colWidth, bottom - wrapUpHeight - 0.1);
    slide.addText(`마무리: ${spread.wrap_up}`, {
      x: rightX, y: bottom - wrapUpHeight, w: colWidth, h: wrapUpHeight, fontSize: 10.5, italic: true, color: "215B3D",
      fill: { color: "EDF5F0" }, valign: "top",
    });
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

function buildPagePlan(targetState = state) {
  const pages = [];
  const placedSpecialIds = new Set();
  const addPage = (area, unit, type, status = "배정") => {
    pages.push({ number: pages.length + 1, area, unit, type, status });
  };

  parseLineItems(targetState.frontMatterText).forEach((item) => {
    for (let index = 0; index < item.pages; index += 1) addPage("부속자료", item.title, "부속자료");
  });

  targetState.units.forEach((unit, unitIndex) => {
    const largeNumber = unitNumberLabel(unitIndex);
    for (let index = 0; index < Number(unit.introPages || 0); index += 1) {
      addPage(unit.domain, `${largeNumber}. ${unit.domain} 도입`, "단원 도입");
    }
    unit.subdomainGroups.forEach((group, groupIndex) => {
      group.middleUnits.forEach((middle, middleIndex) => {
        const middlePosition = middleUnitPosition(unit, groupIndex, middleIndex);
        middle.smallUnits.forEach((small, smallIndex) => {
          const smallNumber = unitNumberLabel(unitIndex, middlePosition, smallIndex + 1);
          for (let index = 0; index < Number(small.pages || 0); index += 1) {
            addPage(unit.domain, `${smallNumber}. ${small.title}`, "본문");
          }
        });
      });
    });
    (targetState.specialPages || []).filter((page) => page.domain === unit.domain).forEach((page) => {
      for (let index = 0; index < Math.max(0, Number(page.pages) || 0); index += 1) {
        addPage(unit.domain, page.title, sportsCultureSpecialPageTypeLabel(page.type));
      }
      placedSpecialIds.add(page.id);
    });
    for (let index = 0; index < Number(unit.wrapUpPages || 0); index += 1) {
      addPage(unit.domain, `${largeNumber}. ${unit.domain} 마무리`, "마무리");
    }
  });

  (targetState.specialPages || []).filter((page) => !placedSpecialIds.has(page.id)).forEach((page) => {
    for (let index = 0; index < Math.max(0, Number(page.pages) || 0); index += 1) {
      addPage(page.domain || "특별 페이지", page.title, sportsCultureSpecialPageTypeLabel(page.type));
    }
  });

  parseLineItems(targetState.backMatterText).forEach((item) => {
    for (let index = 0; index < item.pages; index += 1) addPage("부속자료", item.title, "부속자료");
  });

  parseLineItems(targetState.appendixText).forEach((item) => {
    for (let index = 0; index < item.pages; index += 1) addPage("부록", item.title, "부록");
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

function renderPagePreviewModal() {
  if (!pagePreviewOpen) return "";
  const preview = buildPagePlan(state);
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
        <p class="bulk-edit-note">3단계에 입력한 쪽수 배정으로 만든 확인용 미리보기입니다.</p>
        <div class="page-grid">
          ${preview.map((page) => `
            <div class="page-cell" data-area="${page.area}" title="${escapeHtml(page.unit)} · ${page.type}">
              <b>${page.number}쪽</b><span>${escapeHtml(page.area)}</span>
            </div>`).join("")}
        </div>
      </div>
    </div>`;
}

function renderNavigation() {
  document.querySelector("#stepNavigation").innerHTML = steps.map(([defaultLabel], index) => {
    const label = isSportsCultureProject() && index === 3 ? "전체 스타일·초고" : defaultLabel;
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
  if (isSportsCultureProject() && state.currentStep === 3) {
    heading = "전체 스타일·초고 생성";
    subtitle = "전체 편집 방향을 정하고 소단원과 특별 페이지의 초고를 단일 또는 일괄 생성합니다.";
  }
  document.querySelector("#stepEyebrow").textContent = `PROTOTYPE STEP ${String(state.currentStep + 1).padStart(2, "0")}`;
  document.querySelector("#stepHeading").textContent = heading;
  document.querySelector("#stepSubtitle").textContent = subtitle;
  document.querySelector("#progressText").textContent = `${state.currentStep + 1}/${steps.length}`;
  document.querySelector("#progressLabel").textContent = heading;
  document.querySelector("#progressBar").style.width = `${((state.currentStep + 1) / steps.length) * 100}%`;
  document.querySelector("#previousButton").disabled = state.currentStep === 0;
  const nextButton = document.querySelector("#nextButton");
  nextButton.textContent = state.currentStep === steps.length - 1 ? "완료" : "다음";
}

function sectionHeading(kicker, title, description, action = "") {
  return `
    <div class="section-heading">
      <div><p class="section-kicker">${kicker}</p><h2>${title}</h2></div>
      ${description ? `<p>${description}</p>` : ""}
      ${action ? `<div class="section-actions">${action}</div>` : ""}
    </div>`;
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
      <div class="setup-profile-strip"><span>${portfolio.pairLabel || representative.project.subject} · ${isPairedProject(portfolio) ? "분권형" : "단권형"}</span><strong class="setup-status draft">공식자료 대기</strong><small>교육과정 과목명만 확인됨</small></div>
      <div class="form-grid project-form-grid setup-common-fields">
        <label class="project-name"><span>프로젝트명</span><input data-project="name" maxlength="80" value="${escapeHtml(portfolio.name)}" /></label>
      </div>
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
    <div class="setup-profile-strip">
      <span>${isElementary ? "학년군 분권형" : isMiddleBand ? "분권형 · 쪽수 미검증" : isPaired ? `${courseMeta.category} 분권형` : `${courseMeta.category} 단권형`}</span>
      <strong class="setup-status ${approval.status}">${statusLabels[approval.status]}</strong>
      <small>${approval.approvedAt ? `최근 승인 ${new Date(approval.approvedAt).toLocaleString("ko-KR")}` : "아직 승인된 설정 없음"}</small>
    </div>
    <div class="form-grid project-form-grid setup-common-fields">
      <label class="project-name"><span>프로젝트명</span><input data-project="name" maxlength="80" value="${escapeHtml(portfolio.name)}" ${editable ? "" : "disabled"} /></label>
    </div>
    <div class="official-policy-banner ${isMiddleBand ? "unverified" : ""}">
      <div class="policy-banner-title">${isMiddleBand ? "공식 쪽수 자료 미연결 — 직접 입력한 값입니다" : "전처리 공식자료 연결됨"}</div>
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
    <div class="setup-approval-bar"><div><b>설정 승인</b><span>승인 후 값이 잠깁니다.</span></div><div>${approvalActions}</div></div>
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
  const groups = ["초등학교", "중학교", "고등학교"];
  container.innerHTML = `
    <label for="activeProjectSelect">책 프로젝트</label>
    <select id="activeProjectSelect">${groups.map((group) => `<optgroup label="${group}">${PROJECT_CATALOG.filter((item) => item.group === group).map((item) => `<option value="${item.id}" ${item.id === catalogId ? "selected" : ""}>${escapeHtml(item.label)}${item.connected ? "" : item.partial ? " · 쪽수 기준 미연결" : " · 공식자료 미연결"}</option>`).join("")}</optgroup>`).join("")}</select>
    ${isPairedProject(project) && state.currentStep > 0 ? `<div class="book-mode-tabs" aria-label="학년책과 비교 보기">
      ${bookKeys.map((bookKey) => `<button class="${project.viewMode === "book" && project.activeBookKey === bookKey ? "active" : ""}" data-book-key="${bookKey}" type="button">${bookKey.replace("학년", "")}</button>`).join("")}
      <button class="${project.viewMode === "compare" ? "active" : ""}" id="compareBooksButton" type="button">비교</button>
    </div>` : ""}`;

  container.querySelector("#activeProjectSelect").addEventListener("change", (event) => {
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
    ${sectionHeading("CURRICULUM", `${subject} 교육과정 확인`, "", '<button class="secondary-button" id="downloadCurriculumButton" type="button">성취기준·고려사항 다운로드</button>')}
    <div class="curriculum-summary">
      <article><span>과목 분류</span><strong>${meta.category}</strong><small>고등학교 체육</small></article>
      <article><span>기본 학점</span><strong>${meta.credits}학점</strong><small>${meta.minimum_credits}~${meta.maximum_credits}학점</small></article>
      <article><span>기본 수업량</span><strong>${meta.default_hours}차시</strong><small>50분 × 16회 × ${meta.credits}학점</small></article>
      <article><span>성취기준</span><strong>${standards.length}개</strong><small>${domains.length}개 영역</small></article>
    </div>
    <div class="curriculum-notice">
      <strong>기본 ${meta.default_hours}차시</strong>
      <span>허용 ${meta.minimum_hours}~${meta.maximum_hours}차시</span>
    </div>
    ${subject === "스포츠 문화" ? `<div class="curriculum-notice"><strong>종목 지정 없음</strong><span>스포츠 종목 중 택 1 이상</span></div>` : ""}
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
    ${sectionHeading("CURRICULUM", "중등체육 교육과정 확인", "", '<button class="secondary-button" id="downloadCurriculumButton" type="button">성취기준·고려사항 다운로드</button>')}
    <div class="curriculum-summary">
      <article><span>학교급</span><strong>중학교</strong><small>1~3학년</small></article>
      <article><span>기준 시수</span><strong>${meta?.hours || 272}시간</strong><small>3개년 합계</small></article>
      <article><span>성취기준</span><strong>${standards.length}개</strong><small>${domains.length}개 영역</small></article>
      <article><span>쪽수 기준</span><strong>미연결</strong><small>1단계에서 직접 입력</small></article>
    </div>
    <div class="curriculum-notice">
      <strong>쪽수 기준 미연결</strong><span>1단계 입력값 사용</span>
    </div>
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
    ${sectionHeading("CURRICULUM", "교육과정 원문 확인", "", '<button class="secondary-button" id="downloadCurriculumButton" type="button">성취기준·고려사항 다운로드</button>')}
    <div class="curriculum-summary">
      <article><span>선택 학년</span><strong>${grade}학년</strong><small>${gradeBand}</small></article>
      <article><span>공식 기준 시수</span><strong>204시간</strong><small>학년군 2년 합계</small></article>
      <article><span>학년 배분안</span><strong>102차시</strong><small>프로젝트 기본값</small></article>
      <article><span>성취기준</span><strong>${bandStandards.length}개</strong><small>운동·스포츠·표현 전체</small></article>
    </div>
    <div class="curriculum-notice">
      <strong>공식 204시간</strong><span>학년별 102차시는 프로젝트 배분안</span>
    </div>
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
        return `
          <section class="curriculum-domain-section">
            <header><span class="domain-badge ${domain}">${domain}</span><b>성취기준 ${standards.length}개</b></header>
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

function renderUnits() {
  const sportsCulture = isSportsCultureProject();
  if (sportsCulture) ensureSportsCultureDraftSettings(state);
  normalizeAutomaticUnitNumbering(state);
  const allocatedHours = unitsTotalHours(state.units);
  const targetHours = projectTargetHours();
  const hourDifference = targetHours - allocatedHours;
  const domainOrder = projectDomainOrder();
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
    ${sectionHeading("UNIT STRUCTURE", "단원 구성·차시 배분", "", `${isSportsCultureProject() ? '<button class="secondary-button" id="applySportsCultureDetailedUnits" type="button">18개 소단원 초기안 적용</button>' : ''}<button class="secondary-button" id="openPagePreview" type="button">배열표 미리보기</button><button class="secondary-button" id="downloadTocButton" type="button">목차 다운로드</button>`)}
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
    <div class="domain-summary-row">
      ${domainOrder.map((domain) => {
        const unit = state.units.find((item) => item.domain === domain);
        if (!unit) return "";
        const domainHours = unitsTotalHours([unit]);
        const domainPages = unitsTotalPages([unit]) + specialPagesTotal(state, unit.domain);
        return `<div class="domain-summary-item"><span class="domain-badge ${domain}">${domain}</span><b>${domainHours}차시</b><b>${domainPages}쪽</b></div>`;
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
    ${sportsCulture ? `
      <section class="special-page-panel toc-special-page-panel">
        <div class="draft-target-heading"><div><strong>특별페이지 구성</strong><p>본문 뒤·마무리 앞에 배치</p></div><b>${plannedSpecialPages}쪽</b></div>
        <div class="special-page-add">
          <select id="tocSpecialPageTypeSelect" aria-label="특별페이지 유형">${SPORTS_CULTURE_SPECIAL_PAGE_TYPES.map((type) => `<option value="${type.id}">${type.label}</option>`).join("")}</select>
          <select id="tocSpecialPageDomainSelect" aria-label="특별페이지 대단원">${state.units.map((unit) => `<option value="${escapeHtml(unit.domain)}">${escapeHtml(unit.domain)}</option>`).join("")}</select>
          <button class="secondary-button" id="addTocSpecialPageButton" type="button">특별페이지 추가</button>
        </div>
        <div class="special-page-list">
          ${(state.specialPages || []).length ? state.specialPages.map((page) => `
            <article class="toc-special-page-row">
              <label><span>유형</span><select data-toc-special-type="${page.id}">${SPORTS_CULTURE_SPECIAL_PAGE_TYPES.map((type) => `<option value="${type.id}" ${type.id === page.type ? "selected" : ""}>${type.label}</option>`).join("")}</select></label>
              <label class="toc-special-title"><span>이름</span><input data-toc-special-title="${page.id}" value="${escapeHtml(page.title)}" /></label>
              <label><span>대단원</span><select data-toc-special-domain="${page.id}">${state.units.map((unit) => `<option value="${escapeHtml(unit.domain)}" ${unit.domain === page.domain ? "selected" : ""}>${escapeHtml(unit.domain)}</option>`).join("")}</select></label>
              <label class="small-unit-hours-field"><span>쪽수</span><input data-toc-special-pages="${page.id}" type="number" min="1" value="${Math.max(1, Number(page.pages) || 2)}" /></label>
              <button class="secondary-button" data-delete-toc-special-page="${page.id}" type="button">삭제</button>
            </article>`).join("") : '<p class="bulk-edit-note">추가한 특별페이지가 없습니다. 필요한 경우 여기에서 먼저 쪽수를 배정하세요.</p>'}
        </div>
      </section>` : ""}
    <div class="curriculum-domain-tabs">
      ${["전체", ...domainOrder].map((domain) => {
        const count = domain === "전체"
          ? state.units.reduce((sum, unit) => sum + smallUnitCountOf(unit), 0)
          : smallUnitCountOf(state.units.find((unit) => unit.domain === domain) || { subdomainGroups: [] });
        return `<button class="${selectedDomain === domain ? "active" : ""}" data-unit-domain-filter="${domain}" type="button">${domain} <span>${count}</span></button>`;
      }).join("")}
    </div>
    <div class="unit-list">
      ${state.units.map((unit, unitIndex) => {
        if (selectedDomain !== "전체" && unit.domain !== selectedDomain) return "";
        const unitTotalPages = unitsTotalPages([unit]) + specialPagesTotal(state, unit.domain);
        return `
          <article class="unit-card">
            <div class="unit-top-row">
              <span class="domain-badge ${unit.domain}">${unit.domain}</span>
              ${unit.subdomainGroups.map((group, groupIndex) => `<div class="numbered-unit-title"><span class="automatic-unit-number">${unitNumberLabel(unitIndex)}</span><input class="unit-subtitle-input" data-unit-subtitle="${unitIndex}:${groupIndex}" value="${escapeHtml(group.subtitle)}" aria-label="${unit.domain} 대단원 부제" title="대단원 부제(세부 영역)" /></div>`).join("")}
              <label class="small-unit-hours-field"><span>도입 쪽수</span><input data-unit-intro="${unitIndex}" type="number" min="0" value="${unit.introPages}" aria-label="${unit.domain} 도입 쪽수" /></label>
              <label class="small-unit-hours-field"><span>마무리 쪽수</span><input data-unit-wrapup="${unitIndex}" type="number" min="0" value="${unit.wrapUpPages}" aria-label="${unit.domain} 마무리 쪽수" /></label>
              <div class="unit-total-pages" aria-label="${unit.domain} 전체 쪽수"><span>전체 쪽수</span><strong>${unitTotalPages}</strong></div>
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
                  <div class="middle-unit-block">
                    <div class="unit-level-label">
                      <span>중단원</span>
                      <div class="unit-card-actions">
                        <button type="button" data-middle-action="up" data-middle-path="${middlePath}" title="위로 이동">↑</button>
                        <button type="button" data-middle-action="down" data-middle-path="${middlePath}" title="아래로 이동">↓</button>
                        <button type="button" data-middle-action="delete" data-middle-path="${middlePath}">삭제</button>
                        <button type="button" data-middle-action="duplicate" data-middle-path="${middlePath}">중단원 복제</button>
                      </div>
                    </div>
                    <div class="numbered-middle-title"><span class="automatic-unit-number">${middleNumber}</span><input data-middle-title="${middlePath}" value="${escapeHtml(middle.title)}" aria-label="${unit.domain} 중단원명" /></div>
                    <p class="small-unit-label">소단원과 차시</p>
                    <div class="small-unit-grid">
                      ${middle.smallUnits.map((smallUnit, smallIndex) => {
                        const smallPath = `${middlePath}:${smallIndex}`;
                        const smallNumber = unitNumberLabel(unitIndex, middlePosition, smallIndex + 1);
                        return `
                        <div class="small-unit-card">
                          <div class="small-unit-meta">
                            <small class="small-unit-source">${isSportsCultureProject() ? "구성 근거" : "원 활동"}: ${escapeHtml(smallUnit.sourceActivity)}</small>
                            ${isSportsCultureProject() && Array.isArray(smallUnit.standardCodes) ? `<small class="small-unit-source standard-link">성취기준: ${escapeHtml(smallUnit.standardCodes.join(", "))}</small>` : ""}
                          </div>
                          <label class="small-unit-title-field"><span>소단원명</span><b class="automatic-unit-number">${smallNumber}</b><input class="small-unit-title" data-small-title="${smallPath}" value="${escapeHtml(smallUnit.title)}" aria-label="소단원명" /></label>
                          <label class="small-unit-hours-field"><span>차시</span><input data-small-hours="${smallPath}" type="number" min="1" value="${smallUnit.hours}" aria-label="소단원 차시" /></label>
                          <label class="small-unit-hours-field"><span>쪽수</span><input data-small-pages="${smallPath}" type="number" min="0" value="${smallUnit.pages}" aria-label="소단원 쪽수" /></label>
                          <div class="small-unit-actions" aria-label="소단원 편집 작업">
                            <button type="button" data-small-action="up" data-small-path="${smallPath}" title="위로 이동">↑</button>
                            <button type="button" data-small-action="down" data-small-path="${smallPath}" title="아래로 이동">↓</button>
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
    ${renderPagePreviewModal()}`;
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
            pages: small.pages,
            hours: small.hours,
            standardCodes: Array.isArray(small.standardCodes) ? [...small.standardCodes] : [],
            sports: Array.isArray(small.sports) ? [...small.sports] : [],
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

// 실제 API 연동 시 이 두 함수(simulatedSpreadDraft/simulatedManuscriptDraft)를 아래 프롬프트로 만든
// 실제 API 호출로 교체하면 됨. 화면(renderSpreadDraft 등)·PPT 출력(spreadsToPptx)은 반환값 모양만
// 같으면 수정 불필요 — activities/support_boxes 개수를 고정하지 않고 그대로 반복해서 그리는 구조라서다.
// 소단원 하나당 스프레드 전체를 한 번에 요청(호출 비용·지연 절감). 지금 시뮬레이션은 FRAMEWORK_SPREAD_
// STRUCTURE로 체제별 활동 개수·보조단 종류를 하드코딩해 흉내만 낸 것이고, 실제 연동 시에는 이 표 대신
// 모델이 지표를 보고 매번 자유롭게 개수·종류를 정하게 해야 진짜 다양성이 나옴.
//
// [system]
// 당신은 초등학교 체육 교과서 원고를 쓰는 AI 저자입니다. 주어진 체제(포맷) 설명과 편집 지표를 반영해
// 소단원의 펼침면 원고 전체를 작성하세요. 보조단(준비물/안전/전략/도움말 등)은 정해진 항목이 아니라
// 체제·지표에 맞게 개수와 종류를 자유롭게 정하세요. 안전성 지표가 높으면 안전 보조단을 반드시 포함하고,
// 참신성 지표가 높으면 기존에 없던 새로운 유형의 보조단을 만들어도 됩니다.
//
// [user] (아래 값은 실제 호출 시 framework/metrics/smallUnit/spreadCount로 채움)
// [체제 정보]
// 이름: {framework.name} / 설명: {framework.summary} / 강점: {framework.strengths.join(', ')}
// [편집 지표 (1~5, 높을수록 그 요소를 강하게 반영)]
// 교육과정 충실도: {metrics.curriculum} / 실행 용이성: {metrics.feasibility} /
// 흥미도: {metrics.engagement} / 참신성: {metrics.novelty} / 안전성: {metrics.safety}
// [소단원 정보]
// 영역: {smallUnit.domain} / 중단원: {smallUnit.middleTitle} / 소단원: {smallUnit.smallTitle} /
// 원 신체활동 예시: {smallUnit.sourceActivity} / 배정 쪽수: {smallUnit.pages}
// [요청] 이 소단원을 {spreadCount}개의 펼침면으로 나눠 원고를 작성하세요. 1번째 펼침면은 도입·기능
// 익히기, 마지막 펼침면은 적용·정리, 중간 펼침면은 도전·전략 적용 역할로 구성하세요. 아래 JSON 스키마의
// spreads 배열로만 응답하세요(각 항목: intro, activities[{title, objective, method[]}],
// support_boxes[{type, content}], wrap_up) — 실제 응답 파싱은 구조화 출력(도구 사용/JSON 스키마 강제)으로
// 처리해 형식이 깨지지 않게 함.
const FRAMEWORK_SPREAD_STRUCTURE = {
  balanced: { baseActivityCount: 2, boxTypes: ["준비물", "안전", "전략", "도움말"] },
  activity: { baseActivityCount: 3, boxTypes: ["준비물", "안전", "도움말"] },
  creative: { baseActivityCount: 2, boxTypes: ["준비물", "안전", "창의 발상", "도움말"] },
};

function supportBoxContent(type, smallUnit, emphasisLabel) {
  switch (type) {
    case "준비물": return `${smallUnit.sourceActivity}에 필요한 기본 교구와 기록 도구`;
    case "안전": return "활동 간격을 유지하고 충돌 위험이 있는 이동 방향을 미리 확인합니다.";
    case "전략": case "점검": return "친구의 움직임을 관찰하고 성공한 방법과 바꿀 점을 정리합니다.";
    case "창의 발상": return "이 활동을 나만의 방식으로 바꾼다면 어떤 규칙이나 동작을 추가하고 싶은지 자유롭게 생각해 봅니다.";
    case "도움말": return `이번 체제안에서는 ${emphasisLabel}을(를) 우선 강조합니다.`;
    default: return "";
  }
}

function deriveSpreadMeta(spreadIndex, spreadCount, smallUnit) {
  let template;
  let role;
  let focus;
  if (spreadIndex === 0) {
    template = "기본 기능형";
    role = "도입·기능 익히기";
    focus = `${smallUnit.sourceActivity}의 특징과 기본 움직임을 익혀 봅시다.`;
  } else if (spreadIndex === spreadCount - 1) {
    template = "탐구·평가형";
    role = "적용·정리";
    focus = `${smallUnit.sourceActivity}을 적용하고 활동 결과를 돌아봅시다.`;
  } else {
    template = "게임·적용형";
    role = "도전·전략 적용";
    focus = `친구와 함께 ${smallUnit.sourceActivity}에 도전하며 전략을 찾아봅시다.`;
  }
  return {
    template,
    role,
    focus,
    left_page: 1 + spreadIndex * 2,
    right_page: 2 + spreadIndex * 2,
    title: `${smallUnit.smallTitle} · ${role}`,
  };
}

function simulatedSpreadDraft(spreadIndex, spreadCount, smallUnit, framework, emphasisLabel) {
  const meta = deriveSpreadMeta(spreadIndex, spreadCount, smallUnit);
  const structure = FRAMEWORK_SPREAD_STRUCTURE[framework.id] || FRAMEWORK_SPREAD_STRUCTURE.balanced;
  const activityCount = structure.baseActivityCount + (spreadCount > 1 && spreadIndex === spreadCount - 1 ? 1 : 0);
  const activityTitles = [
    `${smallUnit.smallTitle} 기본 움직임 익히기`,
    `${smallUnit.smallTitle} 상황에 맞게 도전하기`,
    `${smallUnit.smallTitle} 전략 만들기`,
    `${smallUnit.smallTitle} 응용하여 확장하기`,
  ];
  const activities = Array.from({ length: activityCount }, (_, index) => ({
    number: index + 1,
    title: activityTitles[index] || `${smallUnit.smallTitle} 활동 ${index + 1}`,
    placement: index === 0 ? "left" : "right",
    objective: `${smallUnit.sourceActivity}의 방법을 이해하고 자신의 수준에 맞게 수행할 수 있다.`,
    method: [
      "모둠을 정하고 활동 공간과 준비물을 확인합니다.",
      `${smallUnit.sourceActivity}의 핵심 움직임을 단계에 따라 수행합니다.`,
      "친구와 결과를 비교하고 더 나은 방법을 찾아 다시 활동합니다.",
    ],
  }));
  const support_boxes = structure.boxTypes.map((type) => {
    const resolvedType = type === "전략" && meta.role === "적용·정리" ? "점검" : type;
    return { type: resolvedType, content: supportBoxContent(resolvedType, smallUnit, emphasisLabel) };
  });
  return {
    left_page: meta.left_page,
    right_page: meta.right_page,
    layout_template: meta.template,
    role: meta.role,
    title: meta.title,
    intro: `${smallUnit.middleTitle}에서 배운 내용을 바탕으로 ${meta.focus} 활동 전에는 공간과 도구를 확인하고 모둠의 안전 약속을 정합니다.`,
    activities,
    support_boxes,
    wrap_up: `${smallUnit.sourceActivity}에서 잘된 점과 다음 활동에서 바꿀 점을 한 가지씩 적어 봅시다.`,
  };
}

function simulatedManuscriptDraft(framework, metrics, smallUnit) {
  const emphasisKey = Object.entries(metrics).sort((a, b) => b[1] - a[1])[0][0];
  const emphasisLabel = FRAMEWORK_METRIC_LABELS[emphasisKey];
  const spreadCount = Math.max(1, Math.round((Number(smallUnit.pages) || 2) / 2));
  return {
    frameworkName: framework.name,
    smallUnitLabel: `${smallUnit.domain} · ${smallUnit.middleTitle} · ${smallUnit.smallTitle}`,
    instruction: `${smallUnit.sourceActivity}의 핵심 동작을 탐색하고, 자신의 수준에 맞게 연습한 뒤 친구와 결과를 나눠 봅시다.`,
    spreads: Array.from(
      { length: spreadCount },
      (_, index) => simulatedSpreadDraft(index, spreadCount, smallUnit, framework, emphasisLabel)
    ),
  };
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

function drawDraftSpreadCanvas(canvas, entry, spread) {
  const context = canvas.getContext("2d");
  const accent = { balanced: "#596fc1", activity: "#db7048", creative: "#347f72" }[entry.frameworkId] || "#596fc1";
  const accentDark = { balanced: "#3e53a4", activity: "#ae4931", creative: "#236457" }[entry.frameworkId] || "#3e53a4";
  const pale = { balanced: "#eef1fb", activity: "#fff1eb", creative: "#eaf6f2" }[entry.frameworkId] || "#eef1fb";
  const manuscript = spread.textbook_manuscript || {};
  const sections = Array.isArray(manuscript.sections) ? manuscript.sections : [];
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#cfd4dc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const pages = [{ x: 18, sections: sections.slice(0, 2) }, { x: 704, sections: sections.slice(2, 4) }];
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
      context.fillText(entry.smallUnitLabel || "스포츠 문화", 0, 0);
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
      context.fillText(`학습 목표  |  ${manuscript.learningGoal || spread.intro}`.slice(0, 82), contentX, y);
      y += 30;
      drawRoundedRect(context, contentX, y, contentWidth, 44, 8, pale);
      context.fillStyle = accentDark;
      context.font = "700 13px 'Malgun Gothic', sans-serif";
      canvasWrappedText(context, `생각 열기  |  ${manuscript.openingQuestion || spread.intro}`, contentX + 14, y + 18, contentWidth - 28, 17, 2);
      y += 66;
    } else {
      context.fillStyle = accentDark;
      context.font = "800 14px 'Malgun Gothic', sans-serif";
      context.fillText(`${entry.primaryTypeLabel || "스포츠 문화"}  ·  ${spread.role}`, contentX, y);
      y += 28;
    }
    page.sections.forEach((section) => {
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
      context.fillText(section.title, contentX + 34, y + 7);
      y += 31;
      (section.paragraphs || []).slice(0, 5).forEach((paragraph) => {
        context.fillStyle = "#30343a";
        context.font = "11px 'Malgun Gothic', sans-serif";
        y = canvasWrappedText(context, paragraph, contentX, y, contentWidth, 15, 2) + 5;
      });
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
    const briefs = manuscript.visualBriefs || [];
    [0, 1, 2].forEach((visualIndex) => {
      const boxX = page.x + 42 + visualIndex * 205;
      const boxY = visualY + 50 + (visualIndex === 1 ? 18 : 0);
      const boxWidth = 178;
      const boxHeight = 108;
      drawRoundedRect(context, boxX, boxY, boxWidth, boxHeight, 8, visualIndex === 1 ? accent : accentDark);
      context.fillStyle = "rgba(255,255,255,.2)";
      context.fillRect(boxX + 10, boxY + 10, boxWidth - 20, 48);
      context.fillStyle = "#263039";
      context.font = "700 11px 'Malgun Gothic', sans-serif";
      canvasWrappedText(context, briefs[(pageIndex * 2 + visualIndex) % Math.max(1, briefs.length)] || "편집 이미지 영역", boxX, boxY + boxHeight + 16, boxWidth, 14, 3);
    });
    context.fillStyle = "#697078";
    context.font = "12px 'Malgun Gothic', sans-serif";
    context.fillText(`${pageIndex === 0 ? spread.left_page : spread.right_page}  |  스포츠 문화`, page.x + 292, 858);
  });
  context.fillStyle = "rgba(0,0,0,.08)";
  context.fillRect(695, 24, 8, 852);
}

function renderSpreadSectionHtml(section) {
  return `
    <div class="spread-section">
      <div class="spread-section-head"><span class="spread-section-number">${escapeHtml(String(section.number ?? ""))}</span><h3>${escapeHtml(section.title || "")}</h3></div>
      ${(section.paragraphs || []).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
    </div>`;
}

function renderSpreadVisualRow(manuscript, pageIndex) {
  // AI-generated manuscripts decide their own per-page layout (variable count/size);
  // the older rule-based engine still emits a fixed 3-box visualBriefs array.
  if (manuscript.visuals) {
    const side = pageIndex === 0 ? "left" : "right";
    const items = manuscript.visuals[side] || [];
    if (!items.length) return "";
    return `
      <div class="spread-visual-flex">
        ${items.map((item) => `
          <div class="spread-visual-item size-${escapeHtml(item.size || "small")} placement-${escapeHtml(item.placement || "bottom")}${item.imageBase64 ? " has-image" : ""}">
            ${item.imageBase64 ? `<img src="data:image/png;base64,${item.imageBase64}" alt="${escapeHtml(item.description || "")}" />` : ""}
            <span>${escapeHtml(item.description || "편집 이미지 영역")}</span>
          </div>`).join("")}
      </div>`;
  }
  const briefs = manuscript.visualBriefs || [];
  return `
    <div class="spread-visual-row">
      ${[0, 1, 2].map((visualIndex) => `
        <div class="spread-visual-box">
          <span>${escapeHtml(briefs[(pageIndex * 2 + visualIndex) % Math.max(1, briefs.length)] || "편집 이미지 영역")}</span>
        </div>`).join("")}
    </div>`;
}

function renderSpreadPageView(entry, spread) {
  const accentKey = { balanced: "balanced", activity: "activity", creative: "creative" }[entry.frameworkId] ? entry.frameworkId : "balanced";
  const manuscript = spread.textbook_manuscript || {};
  const sections = Array.isArray(manuscript.sections) ? manuscript.sections : [];
  const leftSections = sections.slice(0, 2);
  const rightSections = sections.slice(2, 4);
  return `
    <div class="spread-page-view spread-accent-${accentKey}">
      <div class="spread-page spread-page-left">
        <div class="spread-spine">
          <span class="spread-page-number">${String(spread.left_page || 1).padStart(2, "0")}</span>
          <span class="spread-spine-label">${escapeHtml(entry.smallUnitLabel || "스포츠 문화")}</span>
        </div>
        <div class="spread-page-body">
          <h2 class="spread-headline">${escapeHtml(manuscript.headline || spread.title || "")}</h2>
          <p class="spread-goal"><b>학습 목표</b> ${escapeHtml(manuscript.learningGoal || spread.intro || "")}</p>
          ${manuscript.openingQuestion ? `<div class="spread-opening-question"><b>생각 열기</b> ${escapeHtml(manuscript.openingQuestion)}</div>` : ""}
          ${leftSections.map(renderSpreadSectionHtml).join("")}
          ${renderSpreadVisualRow(manuscript, 0)}
          <div class="spread-page-footer">${escapeHtml(String(spread.left_page || 1))} · 스포츠 문화</div>
        </div>
      </div>
      <div class="spread-gutter"></div>
      <div class="spread-page spread-page-right">
        <div class="spread-page-body">
          <p class="spread-role-label">${escapeHtml(entry.primaryTypeLabel || "스포츠 문화")} · ${escapeHtml(spread.role || "")}</p>
          ${rightSections.map(renderSpreadSectionHtml).join("")}
          ${renderSpreadVisualRow(manuscript, 1)}
          <div class="spread-page-footer">${escapeHtml(String(spread.right_page || 2))} · 스포츠 문화</div>
        </div>
      </div>
    </div>`;
}

function renderDraftCanvases() {
  document.querySelectorAll("[data-draft-canvas]").forEach((canvas) => {
    const [batchIndex, entryIndex, spreadIndex] = canvas.dataset.draftCanvas.split(":").map(Number);
    const entry = state.frameworkDraftLog?.[batchIndex]?.entries?.[entryIndex];
    const spread = entry?.spreads?.[spreadIndex];
    if (entry && spread) drawDraftSpreadCanvas(canvas, entry, spread);
  });
}

function renderSportsDraftImages(entry, batchIndex, entryIndex) {
  return `
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
              <span class="draft-image-actions"><button type="button" data-enlarge-draft-image>크게 보기</button><button type="button" data-download-draft-png="${batchIndex}:${entryIndex}:${spreadIndex}">PNG 저장</button></span>
            </figcaption>
          </figure>`).join("")}
      </div>
    </div>`;
}

function renderSpreadDraft(spread, spreadIndex, sportsCulture = false) {
  const renderActivity = (item) => `
    <article class="spread-activity">
      <b>${sportsCulture ? escapeHtml(spread.role) : `활동 ${item.number}`}</b>
      <input class="spread-activity-title" value="${escapeHtml(item.title)}" readonly />
      <textarea class="spread-activity-objective" readonly>${escapeHtml(item.objective)}</textarea>
      <textarea class="spread-activity-method" readonly>${escapeHtml(item.method.join("\n"))}</textarea>
    </article>`;
  const renderSupportBoxes = (side) => spread.support_boxes
    .filter((_, index) => index % 2 === (side === "left" ? 0 : 1))
    .map((box) => `
      <label class="support-box">
        <span>${escapeHtml(box.type)}</span>
        <textarea readonly>${escapeHtml(box.content)}</textarea>
      </label>`).join("");
  const guide = spread.teacher_guide;
  const guideDraft = guide ? `
    <details class="teacher-guide-draft">
      <summary>이 펼침면의 지도서 파생안</summary>
      <div class="teacher-guide-grid">
        <section><span>차시 목표</span><ul>${(guide.lessonGoals || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section><span>준비물</span><p>${escapeHtml((guide.preparation || []).join(" · "))}</p></section>
        <section><span>수업 흐름</span><ol>${(guide.lessonFlow || []).map((item) => `<li><b>${escapeHtml(item.stage)}</b> ${escapeHtml(item.guidance)}</li>`).join("")}</ol></section>
        <section><span>핵심 발문</span><ul>${(guide.questions || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section><span>안전·포용</span><p>${escapeHtml(guide.safety || "")}</p></section>
        <section><span>평가</span><p>${escapeHtml((guide.assessment || []).join(" · "))}</p></section>
      </div>
    </details>` : "";
  return `
    <article class="spread-draft" data-spread-index="${spreadIndex}">
      <p class="spread-index-label">펼침면 ${spreadIndex + 1}${sportsCulture ? ` · ${escapeHtml(spread.content_type_label || "스포츠 문화")}` : ""}</p>
      <p class="spread-field-label">본문</p>
      <textarea class="spread-intro" readonly aria-label="펼침면 도입">${escapeHtml(spread.intro)}</textarea>
      <div class="spread-canvas">
        ${["left", "right"].map((side) => `
          <section class="book-page ${side}">
            <div class="spread-activity-list">${spread.activities.filter((item) => item.placement === side).map(renderActivity).join("")}</div>
            <div class="support-box-list">${renderSupportBoxes(side)}</div>
          </section>`).join("")}
        <div class="across-spread">${spread.activities.filter((item) => item.placement === "across").map(renderActivity).join("")}</div>
      </div>
      <p class="spread-field-label">마무리</p>
      <textarea class="spread-wrap-up" readonly aria-label="펼침면 정리">${escapeHtml(spread.wrap_up)}</textarea>
      ${guideDraft}
    </article>`;
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

function renderSportsCultureDraftHistory(draftLog) {
  if (!draftLog.length) return "";
  return `
    <div class="draft-log-list">
      <div class="draft-log-toolbar">
        <label class="draft-log-select-all"><input type="checkbox" id="draftLogSelectAll" ${selectedDraftBatches.size && selectedDraftBatches.size === draftLog.length ? "checked" : ""} /><span>전체 선택</span></label>
        <span class="draft-log-count">${selectedDraftBatches.size}개 선택 · 총 ${draftLog.length}건</span>
        <div class="section-actions"><button class="secondary-button" id="downloadSelectedDraftsButton" type="button" ${selectedDraftBatches.size ? "" : "disabled"}>선택 다운로드</button><button class="secondary-button" id="deleteSelectedDraftsButton" type="button" ${selectedDraftBatches.size ? "" : "disabled"}>선택 삭제</button></div>
      </div>
      ${draftLog.map((batch, index) => index).reverse().map((index) => {
        const batch = draftLog[index];
        return `
          <details class="draft-log-entry" data-draft-log-index="${index}" ${expandedDraftBatches.has(index) ? "open" : ""}>
            <summary class="draft-log-summary"><input type="checkbox" data-draft-log-checkbox="${index}" ${selectedDraftBatches.has(index) ? "checked" : ""} /><span>${index + 1}번째 · ${formatDraftBatchTimestamp(batch.generatedAt)} · ${escapeHtml(batch.smallUnitLabel)} · 초고 ${batch.entries.length}개 · ${escapeHtml(batch.styleLabel || "균형형")}</span></summary>
            <div class="draft-log-body">
              <div class="framework-comparison-grid single-draft">
                ${batch.entries.map((entry, entryIndex) => `
                  <div class="framework-comparison-column">
                    <div class="small-unit-heading">
                      <span class="option-subtitle">${escapeHtml(entry.frameworkName)} · ${escapeHtml(entry.smallUnitLabel)}</span>
                      <div class="section-actions"><button class="secondary-button" data-download-pptx="${index}:${entryIndex}" type="button">PPT 다운로드</button><button class="secondary-button" data-download-textbook-text="${index}:${entryIndex}" type="button">교과서 원고 TXT</button><button class="secondary-button" data-download-guide-text="${index}:${entryIndex}" type="button">지도서 원고 TXT</button></div>
                    </div>
                    ${renderSportsDraftImages(entry, index, entryIndex)}
                    <details class="sports-draft-text-details"><summary>교과서·지도서 원고와 근거 확인</summary>${renderDraftTraceability(entry)}<pre class="manuscript-preview">${escapeHtml(textbookManuscriptText(entry))}</pre><div class="spread-drafts">${entry.spreads.map((spread, spreadIndex) => renderSpreadDraft(spread, spreadIndex, true)).join("")}</div></details>
                  </div>`).join("")}
              </div>
            </div>
          </details>`;
      }).join("")}
    </div>`;
}

function renderSportsCultureDraftStudio() {
  ensureSportsCultureDraftSettings(state);
  const targets = sportsCultureDraftTargets();
  const selectedKeys = new Set(state.selectedDraftSmallUnitKeys || []);
  const style = sportsCultureStyleProfile(state.bookStyleValue);
  const providerOptions = globalThis.TEXTBOOK_DRAFT_ENGINE?.providerOptions() || [];
  const activeProvider = providerOptions.find((provider) => provider.id === state.generationProviderId) || providerOptions[0];
  const smallTargets = targets.filter((item) => item.targetKind === "small-unit");
  const specialTargets = targets.filter((item) => item.targetKind === "special");
  return `
    ${sectionHeading("DRAFT STUDIO", "전체 스타일·초고 생성", "")}
    <section class="book-style-panel">
      <div class="book-style-heading"><div><strong>전체 스타일</strong><span>${escapeHtml(style.summary)}</span></div></div>
      <div class="book-style-options" role="radiogroup" aria-label="전체 스타일">
        ${SPORTS_CULTURE_STYLE_CHOICES.map((choice) => `<button type="button" class="book-style-option${choice.value === style.value ? " active" : ""}" data-book-style-value="${choice.value}" role="radio" aria-checked="${choice.value === style.value}">${escapeHtml(choice.label)}</button>`).join("")}
      </div>
    </section>
    <div class="generation-settings-grid compact-grid">
      <label class="editor-field"><span>생성 제공자</span><select id="draftProviderSelect">${providerOptions.map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === activeProvider?.id ? "selected" : ""}>${escapeHtml(provider.label)} · ${escapeHtml(provider.mode)}</option>`).join("")}</select></label>
      <label class="editor-field"><span>삽화 이미지</span><span><input type="checkbox" id="includeImagesToggle" ${state.includeImages ? "checked" : ""} /> AI 실시간 생성 시 삽화도 함께 생성(추가 비용·시간 소요)</span></label>
      <div class="editor-field"><span>생성 순서</span><strong>표본 확인 → 다중 선택 → 일괄 생성</strong></div>
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
      <div class="special-page-list">${specialTargets.map((item) => `<label class="special-page-row"><input type="checkbox" data-draft-target="${item.key}" ${selectedKeys.has(item.key) ? "checked" : ""} /><span><b>${escapeHtml(item.smallTitle)}</b><small>${escapeHtml(item.specialTypeLabel)} · ${item.pages}쪽${item.customId ? " · 3단계 배열표 반영" : ""}</small></span></label>`).join("")}</div>
    </section>
    <div class="curriculum-notice compact"><strong>분량</strong><span>이론 1,400~1,800자 · 실기 900~1,400자 · 도입 300~700자 · 마무리 700~1,200자 · 특별 600~1,400자</span></div>
    <div class="draft-generate-bar"><span id="draftGenerateSelectionSummary">선택한 ${selectedKeys.size}개 항목</span><button class="primary-button" id="generateDraftButton" type="button" ${selectedKeys.size ? "" : "disabled"}>${selectedKeys.size > 1 ? `${selectedKeys.size}개 초고 일괄 생성` : "선택 초고 생성"}</button></div>
    ${renderSportsCultureDraftHistory(state.frameworkDraftLog || [])}`;
}

function refreshDraftSelectionControls() {
  const count = (state.selectedDraftSmallUnitKeys || []).length;
  const countLabel = document.querySelector("#draftTargetSelectedCount");
  const summary = document.querySelector("#draftGenerateSelectionSummary");
  const generateButton = document.querySelector("#generateDraftButton");
  if (countLabel) countLabel.textContent = `${count}개 선택`;
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
  if (!state.frameworkApproval) state.frameworkApproval = { status: "draft", frameworkId: null, approvedAt: null };
  const smallUnits = smallUnitOptions();
  const draftLog = state.frameworkDraftLog;
  const approval = state.frameworkApproval;
  const availableFrameworks = frameworkOptions();
  const approvedFramework = availableFrameworks.find((framework) => framework.id === approval.frameworkId);
  const sportsCulture = isSportsCultureProject();
  if (sportsCulture) ensureSportsCultureDraftSettings(state);
  if (sportsCulture) return renderSportsCultureDraftStudio();
  const selectedSmallUnit = smallUnits.find((option) => option.key === state.previewSmallUnitKey);
  const recommendedTypeId = sportsCulture && selectedSmallUnit ? inferSportsCultureContentType(selectedSmallUnit) : "";
  const recommendedType = SPORTS_CULTURE_CONTENT_TYPES.find((type) => type.id === recommendedTypeId);
  const providerOptions = sportsCulture ? (globalThis.TEXTBOOK_DRAFT_ENGINE?.providerOptions() || []) : [];
  const activeProvider = providerOptions.find((provider) => provider.id === state.generationProviderId) || providerOptions[0];
  return `
    ${sectionHeading("FORMAT OPTIONS", "체제안 선택", sportsCulture ? "스포츠 문화 교육과정의 공통 규칙을 지키면서 탐구·대회·융합 강조 방식을 비교합니다." : "이번 버전에서는 설명과 예상 구조만 비교합니다.")}
    <div class="framework-grid">
      ${availableFrameworks.map((framework) => {
        const metrics = state.frameworkMetrics[framework.id];
        const metricRows = Object.entries(metrics).map(([key, value]) => `
          <label class="metric-row">
            <span>${FRAMEWORK_METRIC_LABELS[key]}</span>
            <input type="range" min="1" max="5" value="${value}" data-framework-metric="${framework.id}:${key}" />
            <b>${value}</b>
          </label>`).join("");
        return `
          <article class="framework-card ${approval.frameworkId === framework.id ? "selected" : ""}">
            <h3>${framework.name}</h3>
            <p>${framework.summary}</p>
            <ul>${framework.strengths.map((strength) => `<li>${strength}</li>`).join("")}</ul>
            <em>${framework.pages}</em>
            <span class="option-subtitle">비교 지표 · 시험용 조정</span>
            <div class="metric-list">${metricRows}</div>
          </article>`;
      }).join("")}
    </div>
    <div class="framework-approval-bar ${approval.status === "approved" ? "approved" : ""}">
      <div>
        <b>체제 승인</b>
        <span>${approval.status === "approved" ? `승인됨 · ${escapeHtml(approvedFramework?.name || "")}` : "아직 승인된 체제가 없습니다. 아래에서 초안을 비교한 뒤 하나를 승인하세요."}</span>
      </div>
      ${approval.status === "approved" ? `<button class="secondary-button" id="reviseFrameworkApproval" type="button">승인 취소</button>` : ""}
    </div>
    <div class="framework-preview-panel">
      ${sectionHeading("MANUSCRIPT PREVIEW", sportsCulture ? "초안 생성·비교" : "AI 초안 생성·비교", sportsCulture ? "내부 규칙 조합 또는 서버의 OpenAI API 중 생성 제공자를 선택할 수 있습니다. AI 실시간 생성은 종목·소단원명·전체 스타일이 바뀔 때마다 매번 새로 집필합니다." : "소단원을 선택하고 생성하면 균형형·활동 강화형·창의형 3개 초안이 한 번에 나와 비교할 수 있습니다. 슬라이더를 조정한 뒤 다시 생성하면 최신 결과로 바뀝니다.")}
      ${sportsCulture ? `
        <div class="generation-settings-grid">
          <label class="editor-field">
            <span>생성 제공자</span>
            <select id="draftProviderSelect">
              ${providerOptions.map((provider) => `<option value="${escapeHtml(provider.id)}" ${provider.id === activeProvider?.id ? "selected" : ""}>${escapeHtml(provider.label)} · ${escapeHtml(provider.mode)}</option>`).join("")}
            </select>
            <small>${escapeHtml(activeProvider?.description || "내부 규칙 조합기를 사용합니다.")}</small>
          </label>
          <div class="editor-field linked-sports-field">
            <span>선택 소단원에 배정된 종목</span>
            <strong>${escapeHtml(selectedSmallUnit?.sports?.join(", ") || "배정된 종목 없음")}</strong>
            <small>종목 배정은 3단계의 각 소단원 카드에서 변경합니다.</small>
          </div>
        </div>
        <div class="curriculum-notice compact">
          <strong>생성 원칙</strong>
          <span>성취기준 6개 추적 · 직접/간접 참여 · 다양한 경기 역할 · 안전과 포용 · 과정/결과 평가 · 교과서에서 지도서 파생</span>
        </div>` : ""}
      <label class="editor-field">
        <span>소단원 선택</span>
        <select id="previewSmallUnitSelect">
          <option value="">소단원을 선택하세요</option>
          ${smallUnits.map((option) => `<option value="${option.key}" ${state.previewSmallUnitKey === option.key ? "selected" : ""}>${escapeHtml(option.domain)} · ${escapeHtml(option.middleTitle)} · ${escapeHtml(option.smallTitle)}</option>`).join("")}
        </select>
      </label>
      ${sportsCulture ? `
        <div class="content-type-settings">
          <label class="editor-field">
            <span>소단원 성격 <em>필수</em></span>
            <select id="draftPrimaryTypeSelect">
              ${SPORTS_CULTURE_CONTENT_TYPES.map((type) => `<option value="${type.id}" ${type.id === state.draftPrimaryType ? "selected" : ""}>${escapeHtml(type.label)}</option>`).join("")}
            </select>
            <small>${recommendedType ? `자동 추천: ${escapeHtml(recommendedType.label)} · ${escapeHtml(recommendedType.description)}` : "소단원을 선택하면 유형을 자동 추천합니다."}</small>
          </label>
          <label class="editor-field">
            <span>수업 구성 강조 <em>선택 사항</em></span>
            <select id="draftSecondaryTypeSelect">
              ${SPORTS_CULTURE_ACTIVITY_MODES.map((mode) => `<option value="${mode.id}" ${mode.id === state.draftSecondaryType ? "selected" : ""}>${escapeHtml(mode.label)}</option>`).join("")}
            </select>
            <small>문학·예술, 프로젝트, 토론, 융합은 소단원 성격이 아니라 수업 구성 방식으로 반영합니다.</small>
          </label>
        </div>` : ""}
      <button class="primary-button" id="generateDraftButton" type="button">${sportsCulture ? "3개 체제 편집디자인 펼침면 생성" : "3개 체제 초안 생성"}</button>
      ${draftLog.length ? `
        <div class="draft-log-list">
          <div class="draft-log-toolbar">
            <label class="draft-log-select-all">
              <input type="checkbox" id="draftLogSelectAll" ${selectedDraftBatches.size && selectedDraftBatches.size === draftLog.length ? "checked" : ""} />
              <span>전체 선택</span>
            </label>
            <span class="draft-log-count">${selectedDraftBatches.size}개 선택 · 총 ${draftLog.length}회차</span>
            <div class="section-actions">
              <button class="secondary-button" id="downloadSelectedDraftsButton" type="button" ${selectedDraftBatches.size ? "" : "disabled"}>선택 다운로드</button>
              <button class="secondary-button" id="deleteSelectedDraftsButton" type="button" ${selectedDraftBatches.size ? "" : "disabled"}>선택 삭제</button>
            </div>
          </div>
          ${draftLog.map((batch, index) => index).reverse().map((index) => {
            const batch = draftLog[index];
            return `
              <details class="draft-log-entry" data-draft-log-index="${index}" ${expandedDraftBatches.has(index) ? "open" : ""}>
                <summary class="draft-log-summary">
                  <input type="checkbox" data-draft-log-checkbox="${index}" ${selectedDraftBatches.has(index) ? "checked" : ""} />
                  <span>${index + 1}회차 · ${formatDraftBatchTimestamp(batch.generatedAt)} · ${escapeHtml(batch.smallUnitLabel)} · 체제 ${batch.entries.length}개${batch.provider?.label ? ` · ${escapeHtml(batch.provider.label)}` : ""}</span>
                </summary>
                <div class="draft-log-body">
                  <div class="framework-comparison-grid">
                    ${batch.entries.map((entry, entryIndex) => {
                      const isApproved = approval.frameworkId === entry.frameworkId && approval.status === "approved";
                      return `
                        <div class="framework-comparison-column ${isApproved ? "approved" : ""}">
                          <div class="small-unit-heading">
                            <span class="option-subtitle">${escapeHtml(entry.frameworkName)} · ${escapeHtml(entry.smallUnitLabel)}</span>
                            <div class="section-actions">
                              <button class="secondary-button" data-download-pptx="${index}:${entryIndex}" type="button">PPT 다운로드</button>
                              ${sportsCulture ? `<button class="secondary-button" data-download-textbook-text="${index}:${entryIndex}" type="button">교과서 원고 TXT</button><button class="secondary-button" data-download-guide-text="${index}:${entryIndex}" type="button">지도서 원고 TXT</button>` : ""}
                              ${isApproved
                                ? `<span class="approved-badge">승인됨</span>`
                                : `<button class="secondary-button" data-approve-framework="${entry.frameworkId}" type="button">이 체제로 승인</button>`}
                            </div>
                          </div>
                          ${sportsCulture ? renderSportsDraftImages(entry, index, entryIndex) : ""}
                          ${sportsCulture ? `<details class="sports-draft-text-details"><summary>교과서·지도서 원고와 근거 확인</summary>${renderDraftTraceability(entry)}<pre class="manuscript-preview">${escapeHtml(textbookManuscriptText(entry))}</pre><div class="spread-drafts">${entry.spreads.map((spread, spreadIndex) => renderSpreadDraft(spread, spreadIndex, true)).join("")}</div></details>` : `${renderDraftTraceability(entry)}<div class="spread-drafts">${entry.spreads.map((spread, spreadIndex) => renderSpreadDraft(spread, spreadIndex)).join("")}</div>`}
                        </div>`;
                    }).join("")}
                  </div>
                </div>
              </details>`;
          }).join("")}
        </div>` : ""}
    </div>`;
}

const MOCK_REVIEW_CRITERIA = [
  ["Ⅰ. 교육과정의 준수", 25, 1, "교육과정의 성격과 목표 반영"],
  ["Ⅰ. 교육과정의 준수", 25, 2, "내용 체계와 성취기준 반영"],
  ["Ⅰ. 교육과정의 준수", 25, 3, "교수·학습과 평가 반영"],
  ["Ⅰ. 교육과정의 준수", 25, 4, "포용성·창의성·주도성과 디지털 소양 반영"],
  ["Ⅰ. 교육과정의 준수", 25, 5, "신체활동 역량과 움직임 기술의 체계적 발달"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 6, "신체활동을 위한·관한·통한 학습의 종합 구현"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 7, "학년 간 중복 방지와 계열성·연계성"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 8, "학습자 수준과 성취기준 도달에 적절한 내용"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 9, "영역별 비중과 내용 제시 방법"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 10, "움직임 발달 체계에 따른 활동 위계화"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 11, "개인차를 고려한 현장 적합성과 실천 가능성"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 12, "자기주도 학습과 일상생활 적용"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 13, "사실·개념·용어·사례의 정확성"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 14, "사진·삽화·인용 자료의 최신성과 출처"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 15, "편견 없는 공정한 기술"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 16, "어문·용어·단위 표기의 정확성"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 17, "문법·어휘·표현의 정확성과 이해 용이성"],
  ["Ⅳ. 학습 활동 및 평가 지원", 25, 18, "성취기준과 연계된 창의적 활동·평가"],
  ["Ⅳ. 학습 활동 및 평가 지원", 25, 19, "수준에 적절하고 수행 가능한 충분한 활동"],
  ["Ⅳ. 학습 활동 및 평가 지원", 25, 20, "다양한 교수·학습 과정과 평가 방법"],
  ["Ⅳ. 학습 활동 및 평가 지원", 25, 21, "참여와 성장을 지원하는 과정 중심 활동"],
  ["Ⅳ. 학습 활동 및 평가 지원", 25, 22, "디지털·온오프라인 연계 활동 지원"],
];

const HIGH_RECOGNITION_CRITERIA = [
  ["Ⅰ. 교육과정의 준수", 20, 1, "교육과정에 제시된 ‘성격’과 ‘목표’를 충실히 반영하였는가?"],
  ["Ⅰ. 교육과정의 준수", 20, 2, "교육과정에 제시된 ‘내용 체계’와 ‘성취기준’을 충실히 반영하였는가?"],
  ["Ⅰ. 교육과정의 준수", 20, 3, "교육과정에 제시된 ‘교수·학습’을 충실히 반영하였는가?"],
  ["Ⅰ. 교육과정의 준수", 20, 4, "교육과정에 제시된 ‘평가’를 충실히 반영하였는가?"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 5, "내용의 수준과 범위 및 학습량이 적절한가?"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 6, "내용 요소 간 위계가 있고, 연계성, 통합성, 균형성을 가지고 있는가?"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 7, "일상생활과 연계되어 흥미와 관심을 유발할 수 있도록 다양한 주제, 제재, 소재 등을 선정하였는가?"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 8, "학생들이 배운 내용을 다양한 방식으로 일상생활에 적용함으로써 역량 및 기초 소양 함양이 가능하도록 학습 내용을 조직하였는가?"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 9, "학생의 자기주도적 학습이 촉진될 수 있도록 학습 내용을 선정 및 조직하였는가?"],
  ["Ⅱ. 내용의 선정 및 조직", 30, 10, "단원의 전개 및 구성 체제가 학습에 효과적인가?"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 11, "사실, 개념, 용어, 이론 등은 객관적이고 정확한가?"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 12, "평가 문항의 질문과 답에 오류는 없는가?"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 13, "사진, 삽화, 통계, 도표 및 각종 자료 등은 공신력 있는 최근의 것으로서 출처를 분명히 제시하고 있으며, 해당 내용에 대한 설명으로 적합한가?"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 14, "한글, 한자, 로마자, 인명, 지명, 각종 용어, 통계, 도표, 지도, 계량 단위 등의 표기가 정확하며, 편찬상의 유의점에 제시된 기준을 충실히 따랐는가?"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 15, "문법 오류, 부적절한 어휘 등 표현상의 오류가 없고 정확한가?"],
  ["Ⅲ. 내용의 정확성 및 공정성", 20, 16, "특정 지역, 국가, 인종, 민족, 문화, 계층, 성, 종교, 직업, 집단, 인물, 기관, 상품 등을 비방·왜곡 또는 옹호하지 않았으며, 집필자 개인의 편견 없이 공정하게 기술하였는가?"],
  ["Ⅳ. 학습 활동 및 평가 지원", 30, 17, "학습 활동 및 평가 과제는 교과 내용과 유기적으로 연계되어 있는가?"],
  ["Ⅳ. 학습 활동 및 평가 지원", 30, 18, "학습 활동 및 평가 과제가 학생의 수준에 적절하며, 수행이 가능한가?"],
  ["Ⅳ. 학습 활동 및 평가 지원", 30, 19, "학생의 역량 및 기초 소양 함양이 가능하도록 다양한 학습 활동 및 평가 과제를 제시하였는가?"],
  ["Ⅳ. 학습 활동 및 평가 지원", 30, 20, "학습의 과정을 중시하고 학생의 참여와 성장을 지원하는 학습 활동 및 평가 과제를 제시하였는가?"],
];

function mockReviewStandard(targetState = state) {
  if (targetState.project.schoolLevel === "고등학교") {
    return {
      id: "high-physical-education-recognition",
      label: "인정기준",
      count: HIGH_RECOGNITION_CRITERIA.length,
      criteria: HIGH_RECOGNITION_CRITERIA,
      source: "(서울교육연구정보원) 2022 개정 교육과정 교육부 장관 고시 인정도서 편찬상의 유의점 및 인정기준",
      sourceLocation: "고등학교 체육 · 스포츠 문화 <인정 기준> · HWP 원본 고등학교 체육 20~45쪽 범위에서 소제목 대조",
      available: true,
    };
  }
  if (targetState.project.schoolLevel === "중학교") {
    return {
      id: "middle-unavailable",
      label: "심사기준",
      count: 0,
      criteria: [],
      source: "공식자료 미연결",
      sourceLocation: "중등 체육 인정·검정 구분과 심사기준 자료를 추가로 연결해야 합니다.",
      available: false,
    };
  }
  return {
    id: "elementary-physical-education-screening",
    label: "검정기준",
    count: MOCK_REVIEW_CRITERIA.length,
    criteria: MOCK_REVIEW_CRITERIA,
    source: "2022 개정 교육과정에 따른 체육과 편찬상의 유의점 및 검정기준",
    sourceLocation: "PDF 원본 20~21쪽",
    available: true,
  };
}

const MOCK_REVIEW_STATUS_LABELS = { pass: "충족", partial: "부분 충족", fail: "미흡" };

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve(typeof result === "string" ? result.split(",").pop() : "");
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

function renderMockReviewResult(review) {
  const fallbackStandard = mockReviewStandard();
  const resultCriteria = review.standard?.criteria?.map((item) => [item.area, item.weight, item.number, item.criterion]) || fallbackStandard.criteria;
  const standardLabel = review.standard?.label || fallbackStandard.label;
  const criteriaByNumber = Object.fromEntries(resultCriteria.map(([area, weight, number, criterion]) => [number, { area, weight, criterion }]));
  return `
    <div class="mock-review-result">
      <div class="mock-review-summary">
        <span class="option-subtitle">${escapeHtml(review.fileName)}</span>
        <b class="mock-review-score">${review.overallScore}점</b>
        <span class="mock-review-decision">${escapeHtml(review.decision)}</span>
      </div>
      ${review.truncated ? `<p class="source-page-warning">원문이 길어 앞부분만 채점에 사용했습니다.</p>` : ""}
      <div class="mock-review-area-grid">
        ${Object.entries(review.areaScores || {}).map(([area, score]) => `
          <article class="mock-review-area-card">
            <b>${escapeHtml(area)}</b>
            <span>${score}점</span>
          </article>`).join("")}
      </div>
      <div class="mock-review-table-wrap">
        <table class="mock-review-table">
          <thead><tr><th>번호</th><th>${escapeHtml(standardLabel)}</th><th>판정</th><th>AI 근거</th></tr></thead>
          <tbody>
            ${(review.items || []).map((item) => {
              const meta = criteriaByNumber[item.number] || {};
              return `
                <tr>
                  <td>${item.number}</td>
                  <td><small>${escapeHtml(meta.area || "")}</small><br />${escapeHtml(meta.criterion || "")}</td>
                  <td><span class="mock-review-status ${item.status}">${MOCK_REVIEW_STATUS_LABELS[item.status] || item.status}</span></td>
                  <td>${escapeHtml(item.evidence || "")}</td>
                </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      <label class="editor-field"><span>검토 메모</span><textarea readonly>${escapeHtml(review.reviewNote || "")}</textarea></label>
    </div>`;
}

function renderMockReview() {
  const standard = mockReviewStandard();
  const previousResultMatches = state.mockReview?.standard?.id === standard.id;
  return `
    ${sectionHeading("MOCK CERTIFICATION", "모의심사", standard.available ? `${standard.count}개 항목` : "기준 미연결")}
    <div class="evidence-summary-card">
      <b>${escapeHtml(standard.label)} 근거</b>
      <span>${escapeHtml(standard.source)}</span>
      <small>${escapeHtml(standard.sourceLocation)}</small>
    </div>
    <div class="mock-review-upload">
      <label class="editor-field">
        <span>교과서 PDF 업로드</span>
        <input type="file" id="mockReviewFileInput" accept="application/pdf" ${standard.available ? "" : "disabled"} />
      </label>
      <button class="primary-button" id="mockReviewStartButton" type="button" ${standard.available ? "" : "disabled"}>채점 시작</button>
    </div>
    <p class="source-page-warning" id="mockReviewError" hidden></p>
    ${state.mockReview && !previousResultMatches ? `<p class="source-page-warning">심사기준이 변경되어 이전 채점 결과를 표시하지 않습니다. PDF를 다시 채점해 주세요.</p>` : ""}
    ${state.mockReview && previousResultMatches ? renderMockReviewResult(state.mockReview) : ""}`;
}

function renderWorkspace() {
  const renderers = [renderProject, renderCurriculum, renderUnits, renderFrameworks, renderMockReview];
  const workspace = document.querySelector("#workspace");
  workspace.replaceChildren();
  const project = activeProject();
  if (state.currentStep > 0 && isPairedProject(project) && project.viewMode === "compare") {
    const originalState = state;
    const currentStep = originalState.currentStep;
    let panels = "";
    try {
      panels = Object.entries(project.books).map(([bookKey, bookState]) => {
        state = bookState;
        const content = renderers[currentStep]();
        return `<article class="book-comparison-panel" inert><header><h3>${bookKey}</h3><small>읽기 전용 비교</small></header>${content}</article>`;
      }).join("");
    } finally {
      state = originalState;
    }
    document.querySelector("#workspace").innerHTML = `
      <div class="comparison-heading"><p class="section-kicker">GRADE COMPARISON</p><h2>${escapeHtml(project.band || project.pairLabel || project.name)} 비교 보기</h2><p>같은 단계의 두 학년책을 나란히 확인합니다. 수정하려면 왼쪽에서 학년을 선택하세요.</p></div>
      <div class="book-comparison-grid">${panels}</div>`;
    return;
  }
  document.querySelector("#workspace").innerHTML = renderers[state.currentStep]();
  bindWorkspace();
  renderDraftCanvases();
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
        book.pages = buildPagePlan(book);
        book.selectedPages = [1];
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
    downloadCsvFile(`${state.project.name || "교육과정"}_성취기준.csv`, curriculumDownloadRows());
    showToast("성취기준·고려사항을 다운로드했습니다.");
  });

  document.querySelector("#downloadTocButton")?.addEventListener("click", () => {
    downloadCsvFile(`${state.project.name || "목차"}_목차.csv`, unitsTocRows());
    showToast("목차를 다운로드했습니다.");
  });

  document.querySelector("#addTocSpecialPageButton")?.addEventListener("click", () => {
    const type = document.querySelector("#tocSpecialPageTypeSelect")?.value || "reading";
    const domain = document.querySelector("#tocSpecialPageDomainSelect")?.value || state.units[0]?.domain || "스포츠 문화";
    const label = sportsCultureSpecialPageTypeLabel(type);
    state.specialPages ||= [];
    state.specialPages.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, domain, title: `${domain} ${label}`, pages: 2 });
    state.pages = buildPagePlan(state);
    persist("3단계 특별페이지 추가됨");
    renderWorkspace();
    showToast("특별페이지 2쪽을 배열표에 반영했습니다. 전체 쪽수에 맞게 다른 쪽수를 조정하세요.");
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

  document.querySelectorAll("[data-middle-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const [unitIndex, groupIndex, middleIndex] = button.dataset.middlePath.split(":").map(Number);
      const group = state.units[unitIndex].subdomainGroups[groupIndex];
      const action = button.dataset.middleAction;
      if (action === "duplicate") {
        group.middleUnits.splice(middleIndex + 1, 0, JSON.parse(JSON.stringify(group.middleUnits[middleIndex])));
      } else if (action === "delete" && group.middleUnits.length > 1) {
        group.middleUnits.splice(middleIndex, 1);
      } else if (action === "up" && middleIndex > 0) {
        [group.middleUnits[middleIndex - 1], group.middleUnits[middleIndex]] =
          [group.middleUnits[middleIndex], group.middleUnits[middleIndex - 1]];
      } else if (action === "down" && middleIndex < group.middleUnits.length - 1) {
        [group.middleUnits[middleIndex + 1], group.middleUnits[middleIndex]] =
          [group.middleUnits[middleIndex], group.middleUnits[middleIndex + 1]];
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
      } else if (action === "up" && smallIndex > 0) {
        [middle.smallUnits[smallIndex - 1], middle.smallUnits[smallIndex]] =
          [middle.smallUnits[smallIndex], middle.smallUnits[smallIndex - 1]];
      } else if (action === "down" && smallIndex < middle.smallUnits.length - 1) {
        [middle.smallUnits[smallIndex + 1], middle.smallUnits[smallIndex]] =
          [middle.smallUnits[smallIndex], middle.smallUnits[smallIndex + 1]];
      } else {
        return;
      }
      persist();
      renderWorkspace();
    });
  });

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

  document.querySelectorAll("[data-framework-metric]").forEach((input) => {
    input.addEventListener("input", () => {
      input.nextElementSibling.textContent = input.value;
    });
  });

  document.querySelectorAll("[data-book-style-value]").forEach((button) => {
    button.addEventListener("click", () => {
      state.bookStyleValue = Number(button.dataset.bookStyleValue);
      persist("스포츠 문화 전체 스타일 변경됨");
      renderWorkspace();
    });
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

  document.querySelector("#previewSmallUnitSelect")?.addEventListener("change", (event) => {
    state.previewSmallUnitKey = event.target.value;
    if (isSportsCultureProject()) {
      const selected = smallUnitOptions().find((item) => item.key === state.previewSmallUnitKey);
      state.draftPrimaryType = selected ? inferSportsCultureContentType(selected) : "theory";
      state.draftSecondaryType = "";
    }
    persist();
    renderWorkspace();
  });

  document.querySelector("#draftPrimaryTypeSelect")?.addEventListener("change", (event) => {
    state.draftPrimaryType = event.target.value;
    if (state.draftSecondaryType === state.draftPrimaryType) state.draftSecondaryType = "";
    persist("스포츠 문화 주 소단원 유형 변경됨");
    renderWorkspace();
  });

  document.querySelector("#draftSecondaryTypeSelect")?.addEventListener("change", (event) => {
    state.draftSecondaryType = event.target.value === state.draftPrimaryType ? "" : event.target.value;
    persist("스포츠 문화 보조 소단원 유형 변경됨");
    renderWorkspace();
  });

  document.querySelector("#draftProviderSelect")?.addEventListener("change", (event) => {
    state.generationProviderId = event.target.value;
    persist("초안 생성 제공자 변경됨");
    renderWorkspace();
  });

  document.querySelector("#includeImagesToggle")?.addEventListener("change", (event) => {
    state.includeImages = event.target.checked;
    persist("삽화 이미지 포함 여부 변경됨");
  });

  document.querySelector("#generateDraftButton")?.addEventListener("click", async (event) => {
    if (isSportsCultureProject()) {
      const targetsByKey = new Map(sportsCultureDraftTargets().map((item) => [item.key, item]));
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
      try {
        const style = sportsCultureStyleProfile(state.bookStyleValue);
        const framework = { id: style.id, name: `전체 스타일 · ${style.label}`, summary: style.summary };
        const metrics = sportsCultureStyleMetrics(state.bookStyleValue);
        for (let index = 0; index < targets.length; index += 1) {
          const target = targets[index];
          button.textContent = `${index + 1}/${targets.length} 초고 구성 중…`;
          const sportMode = target.sportMode || "none";
          const targetSports = sportMode === "none" ? [] : (target.sports || []);
          if (sportMode !== "none" && !targetSports.length) throw new Error(`${target.smallTitle}: ${sportsCultureSportModeLabel(sportMode)}에 사용할 종목을 지정해 주세요.`);
          const carrierSport = targetSports.join(", ");
          const primaryType = target.targetKind === "small-unit" ? target.contentType : "theory";
          const supportMode = target.targetKind === "small-unit" ? target.supportMode : "";
          const result = await engine.generateDraftSet({
            profileId: engine.sportsCultureProfile().id,
            providerId: state.generationProviderId || engine.internalProviderId,
            carrierSport,
            sportMode,
            sports: targetSports,
            primaryType,
            supportMode,
            pageRole: target.pageRole,
            styleValue: state.bookStyleValue,
            includeImages: Boolean(state.includeImages),
            smallUnit: target,
            frameworks: [framework],
            metricsByFramework: { [framework.id]: metrics },
          });
          state.frameworkDraftLog.push({
            generatedAt: new Date().toISOString(),
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
        }
        expandedDraftBatches = new Set([state.frameworkDraftLog.length - 1]);
        persist(`${targets.length}개 스포츠 문화 초고 생성됨`);
        renderWorkspace();
        showToast(`${targets.length}개 항목의 초고를 생성했습니다.`);
      } catch (error) {
        button.disabled = false;
        button.textContent = originalLabel;
        showToast(error?.message || "초고 생성에 실패했습니다.");
      }
      return;
    }
    const smallUnit = smallUnitOptions().find((item) => item.key === state.previewSmallUnitKey);
    if (!smallUnit) {
      showToast("먼저 소단원을 선택해 주세요.");
      return;
    }
    if (!state.frameworkMetrics) state.frameworkMetrics = defaultFrameworkMetrics(frameworkOptions());
    document.querySelectorAll("[data-framework-metric]").forEach((input) => {
      const [frameworkId, key] = input.dataset.frameworkMetric.split(":");
      state.frameworkMetrics[frameworkId][key] = Number(input.value);
    });
    if (!Array.isArray(state.frameworkDraftLog)) state.frameworkDraftLog = [];
    const button = event.currentTarget;
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "초안 구성 중…";
    try {
      let generated;
      let provider = { id: "legacy-simulation", label: "기존 더미 생성", mode: "simulation" };
      if (isSportsCultureProject()) {
        state.carrierSport = (smallUnit.sports || []).join(", ");
        if (!state.carrierSport) throw new Error("3단계에서 이 소단원에 적용할 종목을 지정해 주세요.");
        const engine = globalThis.TEXTBOOK_DRAFT_ENGINE;
        if (!engine) throw new Error("내부 초안 생성 모듈을 불러오지 못했습니다.");
        const result = await engine.generateDraftSet({
          profileId: engine.sportsCultureProfile().id,
          providerId: state.generationProviderId || engine.internalProviderId,
          carrierSport: state.carrierSport,
          primaryType: state.draftPrimaryType,
          secondaryType: state.draftSecondaryType,
          includeImages: Boolean(state.includeImages),
          smallUnit,
          frameworks: frameworkOptions(),
          metricsByFramework: state.frameworkMetrics,
        });
        generated = result.entries;
        provider = result.provider;
      } else {
        generated = frameworkOptions().map((framework) => ({
          frameworkId: framework.id,
          ...simulatedManuscriptDraft(framework, state.frameworkMetrics[framework.id], smallUnit),
        }));
      }
      state.frameworkDraftLog.push({
        generatedAt: new Date().toISOString(),
        smallUnitLabel: `${smallUnit.domain} · ${smallUnit.middleTitle} · ${smallUnit.smallTitle}`,
        carrierSport: isSportsCultureProject() ? state.carrierSport : null,
        primaryType: isSportsCultureProject() ? state.draftPrimaryType : null,
        secondaryType: isSportsCultureProject() ? state.draftSecondaryType : null,
        provider,
        entries: generated,
      });
      expandedDraftBatches = new Set([state.frameworkDraftLog.length - 1]);
      persist(isSportsCultureProject() ? "내부 데이터 초안 생성됨" : "AI 초안 생성됨");
      renderWorkspace();
      showToast(isSportsCultureProject() ? "내부 데이터로 체제 3개의 초안을 생성했습니다." : "체제 3개의 초안을 생성했습니다.");
    } catch (error) {
      button.disabled = false;
      button.textContent = originalLabel;
      showToast(error?.message || "초안 생성에 실패했습니다.");
    }
  });

  document.querySelectorAll("[data-approve-framework]").forEach((button) => {
    button.addEventListener("click", () => {
      state.frameworkId = button.dataset.approveFramework;
      state.frameworkApproval = { status: "approved", frameworkId: button.dataset.approveFramework, approvedAt: new Date().toISOString() };
      persist("체제 승인됨");
      renderWorkspace();
      showToast("이 체제로 승인했습니다.");
    });
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

  document.querySelector("#downloadSelectedDraftsButton")?.addEventListener("click", async () => {
    const indices = [...selectedDraftBatches].sort((a, b) => a - b);
    if (!indices.length) return;
    for (const index of indices) {
      const pres = draftBatchesToPptx([{ roundNumber: index + 1, batch: state.frameworkDraftLog[index] }]);
      await pres.writeFile({ fileName: `${state.project.name || "초안"}_${index + 1}회차초안.pptx` });
    }
    showToast(`${indices.length}개 회차를 각각 PPT로 다운로드했습니다.`);
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

  document.querySelector("#mockReviewStartButton")?.addEventListener("click", async () => {
    const fileInput = document.querySelector("#mockReviewFileInput");
    const file = fileInput?.files?.[0];
    if (!file) {
      showToast("PDF 파일을 선택해 주세요.");
      return;
    }
    const button = document.querySelector("#mockReviewStartButton");
    const errorBox = document.querySelector("#mockReviewError");
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = "채점 중...";
    if (errorBox) {
      errorBox.hidden = true;
      errorBox.textContent = "";
    }
    try {
      const pdfBase64 = await readFileAsBase64(file);
      const response = await fetch("/api/prototype/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64, fileName: file.name, catalogId: inferredCatalogId(activeProject()) || "" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "채점 요청에 실패했습니다.");
      state.mockReview = data.result;
      persist("모의심사 채점됨");
      renderWorkspace();
      showToast("채점이 완료됐습니다.");
    } catch (error) {
      const message = error.message || "채점에 실패했습니다.";
      if (errorBox) {
        errorBox.textContent = message;
        errorBox.hidden = false;
      }
      showToast(message);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
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

function render() {
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

render();
persist("자동 저장됨");
