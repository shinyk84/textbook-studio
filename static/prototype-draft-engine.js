(function attachDraftEngine(global) {
  "use strict";

  const SCHEMA_VERSION = "1.5";
  const INTERNAL_PROVIDER_ID = "internal-rules-v1";
  const providers = new Map();

  if (!global.SPORTS_CULTURE_EVIDENCE && typeof require === "function") {
    try { require("./sports-culture-evidence.js"); } catch (_error) { /* browser script supplies it */ }
  }

  const SPORTS_CULTURE_PROFILE = {
    id: "sports-culture-2022",
    label: "2022 개정 스포츠 문화",
    reviewFramework: "인정",
    requiredSportCount: 1,
    sources: [
      { id: "체육과_교육과정", role: "성취기준·내용 체계·교수학습·평가" },
      { id: "별책1_초중등학교_교육과정_총론", role: "총론 공통 원칙" },
      { id: "서울교육연구정보원_2022_개정_교육과정_교육부_장관_고시_인정도서_편찬상의_유의점_및_인정기준", role: "스포츠 문화 인정기준" },
      { id: "22개정_chunjae_textbook", role: "교과서 공통 편집 구조 비교" },
      { id: "22개정_chunjae_teacher_guide", role: "지도서 지원 구조 비교" },
      { id: "22개정_jihaksa_textbook", role: "교과서 공통 편집 구조 비교" },
      { id: "22개정_jihaksa_teacher_guide", role: "지도서 지원 구조 비교" },
      { id: "22개정_donga_textbook", role: "교과서 공통 편집 구조 비교" },
      { id: "22개정_donga_teacher_guide", role: "지도서 지원 구조 비교" },
      { id: "22개정_miraen_textbook", role: "교과서 공통 편집 구조 비교" },
      { id: "22개정_miraen_teacher_guide", role: "지도서 지원 구조 비교" },
    ],
    standards: {
      "[12스문01-01]": {
        domain: "스포츠 인문 문화",
        knowledge: ["스포츠 인문 문화의 개념", "스포츠 인문 문화의 특성"],
        process: ["서사 자료 탐구", "스포츠 대회 직접·간접 참여"],
        values: ["문화적 다양성 존중", "성찰적 참여"],
        assessment: ["참여 기록", "개념 설명", "성찰 카드"],
      },
      "[12스문01-02]": {
        domain: "스포츠 인문 문화",
        knowledge: ["스포츠의 역사", "스포츠 철학"],
        process: ["자료 비교", "문화 현상 비판"],
        values: ["비판적 태도", "공정성과 존중"],
        assessment: ["사례 분석표", "토론", "비평문"],
      },
      "[12스문01-03]": {
        domain: "스포츠 인문 문화",
        knowledge: ["스포츠 문학", "스포츠 예술", "인문 문화 분야 진로"],
        process: ["문학·예술 비교", "문화 콘텐츠 창작", "진로 설계"],
        values: ["심미적 감성", "확산적 사고"],
        assessment: ["비교 감상문", "문화 작품", "진로 포트폴리오"],
      },
      "[12스문02-01]": {
        domain: "스포츠 경기 문화",
        knowledge: ["스포츠 경기 문화의 개념", "물질·제도·관념 문화"],
        process: ["경기 문화 분석", "다양한 역할 수행"],
        values: ["책임", "협력", "포용"],
        assessment: ["역할 수행 기록", "경기 문화 분석표", "동료 평가"],
      },
      "[12스문02-02]": {
        domain: "스포츠 경기 문화",
        knowledge: ["대회 구성 체계", "대회 운영 방법", "경기 문화 분야 진로"],
        process: ["대회 기획", "대회 운영", "진로 설계"],
        values: ["공동체 의식", "안전과 공정성", "주도성"],
        assessment: ["대회 기획서", "역할별 운영 기록", "과정 포트폴리오"],
      },
      "[12스문02-03]": {
        domain: "스포츠 경기 문화",
        knowledge: ["스포츠 경기 문화의 가치", "스포츠와 타 분야의 융합"],
        process: ["융합 사례 탐구", "새로운 경기 문화 제안"],
        values: ["확산적 사고", "지속 가능성", "포용성"],
        assessment: ["융합 아이디어맵", "제안 발표", "자기 평가"],
      },
    },
  };

  const PHASES = [
    { id: "question", role: "질문·개념", template: "개념·자료형" },
    { id: "evidence", role: "사례·자료 탐구", template: "사례·비평형" },
    { id: "participation", role: "직접 참여", template: "경기·참여형" },
    { id: "roles", role: "역할·협력", template: "역할·프로젝트형" },
    { id: "critique", role: "비평·토론", template: "토론·평가형" },
    { id: "creation", role: "창작·융합", template: "창작·융합형" },
    { id: "career", role: "진로 연결", template: "진로·성찰형" },
    { id: "assessment", role: "적용·평가", template: "정리·평가형" },
  ];

  const TYPE_PHASES = {
    theory: ["question", "evidence", "critique", "assessment"],
    practice: ["question", "participation", "roles", "assessment"],
    mixed: ["question", "evidence", "participation", "assessment"],
  };

  const TYPE_LABELS = {
    theory: "이론형",
    practice: "실기형",
    mixed: "이론·실기 혼합형",
  };

  const MODE_PHASE = {
    critique: "critique",
    literature: "creation",
    project: "roles",
    convergence: "career",
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function registerProvider(provider) {
    if (!provider || typeof provider.id !== "string" || typeof provider.generate !== "function") {
      throw new Error("생성 제공자는 id와 generate 함수를 가져야 합니다.");
    }
    providers.set(provider.id, provider);
  }

  function providerOptions() {
    return [...providers.values()].map(({ id, label, mode, description }) => ({ id, label, mode, description }));
  }

  function resolveStandardCodes(smallUnit) {
    const explicit = Array.isArray(smallUnit.standardCodes) ? smallUnit.standardCodes : [];
    if (explicit.length) return explicit.filter((code) => SPORTS_CULTURE_PROFILE.standards[code]);
    const text = `${smallUnit.middleTitle || ""} ${smallUnit.smallTitle || ""}`;
    if (/역사|철학/.test(text)) return ["[12스문01-02]"];
    if (/문학|예술|인문.*진로/.test(text)) return ["[12스문01-03]"];
    if (/역할/.test(text)) return ["[12스문02-01]"];
    if (/기획|운영/.test(text)) return ["[12스문02-02]"];
    if (/융합|접목/.test(text)) return ["[12스문02-03]"];
    return smallUnit.domain === "스포츠 경기 문화" ? ["[12스문02-01]"] : ["[12스문01-01]"];
  }

  function traceabilityFor(smallUnit) {
    const standardCodes = resolveStandardCodes(smallUnit);
    const standards = standardCodes.map((code) => SPORTS_CULTURE_PROFILE.standards[code]);
    const unique = (key) => [...new Set(standards.flatMap((standard) => standard[key]))];
    return {
      standardCodes,
      knowledge: unique("knowledge"),
      process: unique("process"),
      values: unique("values"),
      assessmentEvidence: unique("assessment"),
      mandatoryChecks: ["선택 종목 1개 이상", "직접 참여 포함", "안전과 포용", "과정·결과 평가"],
    };
  }

  function activityMethods(phase, sport, smallUnit, frameworkId) {
    const common = {
      question: [
        `${sport}에서 관찰할 수 있는 문화 현상을 개인 경험과 연결합니다.`,
        "제시 자료에서 사실, 가치 판단, 질문을 구분합니다.",
        "모둠이 학습 질문을 하나로 정하고 탐구 기준을 만듭니다.",
      ],
      evidence: [
        `${sport} 관련 역사·기사·영상·문학·예술 자료 중 두 가지를 비교합니다.`,
        "자료의 제작 시기, 관점, 근거와 빠진 목소리를 확인합니다.",
        "비교 결과를 표나 개념 지도로 정리하고 출처를 기록합니다.",
      ],
      participation: [
        `${sport} 경기의 규칙과 안전 약속을 확인하고 자신의 참여 방식을 정합니다.`,
        "선수 또는 지원 역할로 경기에 참여하며 문화 요소를 관찰합니다.",
        "활동 전후의 생각 변화를 참여 기록지에 남깁니다.",
      ],
      roles: [
        `선수·심판·기록·운영·미디어 중 ${sport} 활동에서 맡을 역할을 정합니다.`,
        "역할별 책임과 협력 방법을 점검표로 확인합니다.",
        "역할을 바꾸어 참여하고 서로의 기여를 구체적으로 피드백합니다.",
      ],
      critique: [
        `${sport} 문화에서 공정성·포용성·상업성·지속 가능성과 관련된 쟁점을 찾습니다.`,
        "찬반 근거의 출처와 신뢰도를 확인하고 반대 관점도 정리합니다.",
        "토론 후 자신의 판단과 개선 방안을 짧은 비평문으로 작성합니다.",
      ],
      creation: [
        `${sport} 문화를 문학·예술·과학·미디어 중 한 분야와 연결합니다.`,
        "모둠별 아이디어를 안전성, 실현 가능성, 문화적 가치로 검토합니다.",
        "새 문화 콘텐츠나 경기 운영안을 만들어 발표하고 수정합니다.",
      ],
      career: [
        `${sport} 문화와 관련된 직업의 실제 역할과 필요한 역량을 조사합니다.`,
        "자신의 관심·강점과 직업 정보를 연결해 진로 경로를 설계합니다.",
        "현재 할 수 있는 준비 행동을 정해 진로 포트폴리오에 기록합니다.",
      ],
      assessment: [
        `${smallUnit.smallTitle}에서 만든 참여 기록과 산출물을 성취기준에 따라 검토합니다.`,
        "자기 평가와 동료 평가의 근거가 구체적인지 확인합니다.",
        "잘한 점, 보완할 점, 다음 실천을 각각 한 가지씩 정리합니다.",
      ],
    };
    const methods = [...common[phase.id]];
    if (frameworkId === "activity") methods[1] = `${sport} 대회 프로젝트에서 실제 역할을 수행하고 과정 증거를 기록합니다.`;
    if (frameworkId === "creative") methods[2] = "서로 다른 분야의 표현 방식을 결합해 새로운 스포츠 문화 결과물로 확장합니다.";
    return methods;
  }

  function supportBoxes(phase, traceability, sport, metrics) {
    const boxes = [
      { type: "교육과정", content: `${traceability.standardCodes.join(", ")} · ${traceability.process.slice(0, 2).join("·")}` },
      { type: "안전·포용", content: `${sport} 참여 전 건강 상태와 공간·도구를 확인하고, 기능 수준이나 신체 조건과 관계없이 역할을 선택할 수 있게 합니다.` },
    ];
    if (["evidence", "critique"].includes(phase.id)) boxes.push({ type: "자료 확인", content: "자료의 작성 주체·발행 시기·출처를 확인하고 사실과 의견을 구분합니다." });
    if (["participation", "roles"].includes(phase.id)) boxes.push({ type: "직접 참여", content: "경기 수행뿐 아니라 심판·기록·운영 등 다양한 방식의 참여를 학습 증거로 인정합니다." });
    if (["creation", "career"].includes(phase.id)) boxes.push({ type: "진로·융합", content: "결과물과 관련된 직업 역할, 필요한 역량, 타 분야와의 연결을 함께 기록합니다." });
    if (phase.id === "assessment" || Number(metrics.curriculum) >= 5) boxes.push({ type: "평가", content: traceability.assessmentEvidence.join(" · ") });
    return boxes;
  }

  function activitiesFor(phase, request, traceability, index) {
    const { smallUnit, framework, carrierSport } = request;
    const sportLabel = sportReferenceFor(carrierSport, request.sportMode).sport;
    const baseCount = framework.id === "activity" ? 3 : 2;
    const count = phase.id === "assessment" ? Math.max(2, baseCount) : baseCount;
    return Array.from({ length: count }, (_, activityIndex) => {
      const titleLead = {
        question: "문화 질문 만들기", evidence: "근거 비교하기", participation: `${sportLabel}에 참여하기`,
        roles: "역할을 바꾸어 참여하기", critique: "쟁점을 비판적으로 읽기", creation: "새 문화 만들기",
        career: "문화 진로 설계하기", assessment: "증거로 성장 확인하기",
      }[phase.id];
      return {
        number: activityIndex + 1,
        title: activityIndex === 0 ? titleLead : `${phase.role} 활동 ${activityIndex + 1}`,
        placement: activityIndex === 2 ? "across" : activityIndex === 0 ? "left" : "right",
        objective: `${traceability.knowledge[0]}을 이해하고 ${traceability.process[0]}을(를) 수행하며 ${traceability.values[0]}을(를) 실천한다.`,
        method: activityMethods(phase, sportLabel, smallUnit, framework.id).map((method, methodIndex) => methodIndex === 0 && index > 0 ? `앞 펼침면의 결과를 활용하여 ${method}` : method),
      };
    });
  }

  function teacherGuideFor(phase, request, traceability, index = 0, manuscript = null) {
    const reference = sportReferenceFor(request.carrierSport, request.sportMode);
    const guideEvidence = (evidenceRecordFor(request.smallUnit)?.evidence || []).filter((item) => item.documentType === "지도서");
    const guideSource = guideEvidence[index % Math.max(1, guideEvidence.length)];
    const sectionTitles = (manuscript?.sections || []).map((section) => section.title);
    const focus = manuscript?.headline || `${request.smallUnit.smallTitle} · ${phase.role}`;
    return {
      lessonGoals: [
        `${focus}의 핵심 개념을 ${sectionTitles.slice(0, 2).join("과 ")}의 관계로 설명할 수 있다.`,
        `${traceability.process[index % traceability.process.length]}을(를) 활용해 자료 또는 참여 장면에서 근거를 찾을 수 있다.`,
        `${traceability.values[index % traceability.values.length]}의 관점에서 판단하고 자신의 결과물을 수정할 수 있다.`,
      ],
      preparation: [request.sportMode === "primary" ? `${reference.sport} 활동 공간과 용구` : "비교할 스포츠 문화 자료", "자료 출처 확인표", "활동·평가 기록지"],
      lessonFlow: [
        { stage: "도입", guidance: `${index ? `${index}번째 펼침면에서 만든 결과를 회상한 뒤 ` : "학생의 스포츠 경험을 확인한 뒤 "}${manuscript?.openingQuestion || phase.role}을 공통 질문으로 제시한다.` },
        { stage: "전개 1", guidance: `${sectionTitles.slice(0, 2).join("·")}의 본문을 문단별로 읽고 핵심 주장, 근거, 주요 개념을 구분하게 한다.` },
        { stage: "전개 2", guidance: `${sectionTitles.slice(2).join("·")}을(를) 자료 비교 또는 ${reference.sport} 참여 장면에 적용하고 모둠별 판단 근거를 기록하게 한다.` },
        { stage: "정리", guidance: `개인 결과물을 ${traceability.standardCodes.join(", ")}의 지식·과정·가치 요소에 각각 연결해 자기·동료 평가하고 다음 펼침면으로 넘길 질문을 작성한다.` },
      ],
      questions: [`‘${sectionTitles[0] || phase.role}’에서 스포츠 문화의 요소를 판단할 수 있는 구체적인 근거는 무엇인가?`, `‘${sectionTitles[2] || "이 현상"}’을 다른 시대·집단·역할의 관점에서 보면 판단이 어떻게 달라지는가?`, "현재 제안의 이익과 부담은 누구에게 돌아가며 빠진 관점은 없는가?"],
      safety: "수업 전 건강 상태, 공간, 용구, 역할별 위험 요소를 확인하고 모든 학생에게 대체 참여 방법을 제공한다.",
      assessment: traceability.assessmentEvidence,
      teachingNotes: [
        guideSource ? `${guideSource.publisher} 지도서 ${guideSource.sourcePdfPage || guideSource.physicalPage}쪽의 관련 수업 근거: ${guideSource.text}` : "연결된 지도서 근거가 없어 교과서 원고와 교육과정만으로 수업안을 구성하였다.",
        `${index + 1}번째 펼침면은 소단원의 ‘${manuscript?.deck || phase.role}’에 해당한다. 앞 펼침면 결과와 섞이지 않도록 이번 차시의 개념어와 산출물을 칠판에 명확히 구분한다.`,
        "본문의 사실 정보와 가치 판단을 구분하게 하고, 자료의 시대·작성자·목적에 따라 관점이 달라질 수 있음을 안내한다.",
        request.primaryType === "theory" ? "용어 암기에 머물지 않도록 역사적 변화의 원인과 오늘날의 의미를 연결해 설명하게 한다." : `${reference.sport}의 규격은 학교 시설에 맞게 조정하되 규칙 변경 사항과 안전상의 이유를 학생에게 설명한다.`,
      ],
      differentiation: ["읽기 자료의 핵심어와 문단별 중심 문장을 제공한다.", "동작 수행이 어려운 학생은 심판·기록·분석·미디어 역할로 동일한 성취기준에 참여하게 한다."],
      expectedResponses: [(manuscript?.sections?.[0]?.paragraphs || [])[1] || "스포츠 문화는 동작뿐 아니라 규칙·시설·가치·참여자의 관계로 이루어진다.", (manuscript?.sections?.[2]?.paragraphs || [])[1] || "시대와 사회의 변화에 따라 참여 방식과 스포츠가 지닌 의미도 달라진다."],
    };
  }

  const SPORT_REFERENCE = {
    "축구": { facility: "대표 경기장은 길이 90~120 m, 너비 45~90 m 범위이며 국제 경기는 별도 범위를 적용한다.", rule: "두 팀이 주로 11명씩 참여하며 손과 팔을 제외한 신체로 공을 다루어 상대 골문에 득점한다.", skills: ["공의 진행 방향을 살피며 인사이드로 밀어 패스한다.", "디딤발을 공 옆에 두고 발등으로 정확하게 슈팅한다.", "공간을 넓게 사용하며 공격과 수비 위치를 전환한다."] },
    "농구": { facility: "정식 코트는 길이 28 m, 너비 15 m를 기본으로 하며 골대와 제한 구역을 포함한다.", rule: "코트에는 팀별 5명이 참여하며 드리블과 패스로 공을 운반해 상대 골대에 득점한다.", skills: ["무릎을 낮추고 손가락 끝으로 공을 밀어 드리블한다.", "상대와 공의 위치를 보며 가슴 높이로 정확하게 패스한다.", "균형을 유지한 채 목표 지점을 보고 슛을 마무리한다."] },
    "야구": { facility: "내야의 네 베이스는 정사각형으로 배치되며 외야 규모는 경기장과 대회 규정에 따라 달라진다.", rule: "일반적으로 팀별 9명이 공격과 수비를 번갈아 하며 주자가 베이스를 돌아 홈에 들어오면 득점한다.", skills: ["공의 궤적을 끝까지 보며 글러브 중심으로 포구한다.", "체중을 뒤에서 앞으로 옮기며 목표 방향으로 송구한다.", "배트 중심에 공이 맞도록 타이밍과 스윙 궤도를 조절한다."] },
    "배구": { facility: "정식 코트는 길이 18 m, 너비 9 m이며 중앙 네트를 기준으로 두 진영을 나눈다.", rule: "팀별 6명이 코트에 들어가며 한쪽 팀은 블로킹을 제외하고 세 번 이내에 공을 상대 코트로 넘긴다.", skills: ["두 팔을 모아 평평한 면을 만들고 무릎으로 공을 받아 올린다.", "손가락을 펼쳐 이마 앞에서 공을 부드럽게 밀어 올린다.", "도약과 팔 스윙의 타이밍을 맞추어 공격한다."] },
    "배드민턴": { facility: "복식 코트는 길이 13.40 m, 너비 6.10 m이며 단식은 안쪽 사이드라인을 사용한다.", rule: "랠리 포인트제로 21점을 먼저 얻는 쪽이 게임을 이기며, 일반적으로 3게임 중 2게임을 먼저 이기면 승리한다.", skills: ["라켓을 가볍게 쥐고 셔틀콕의 낙하지점으로 빠르게 이동한다.", "타점이 몸 앞쪽에 오도록 준비해 언더핸드로 안정적으로 서비스한다.", "상대의 위치를 확인하고 클리어·드롭·스매시를 선택한다."] },
    "탁구": { facility: "탁구대는 길이 2.74 m, 너비 1.525 m이며 중앙에 높이 15.25 cm의 네트를 설치한다.", rule: "11점을 먼저 얻으면 한 게임을 이기며 10 대 10에서는 두 점 차이가 날 때까지 진행한다.", skills: ["라켓 면을 조절하며 짧고 낮은 서비스를 넣는다.", "무릎을 낮추고 몸 앞에서 공을 맞혀 포핸드로 연결한다.", "상대 타구 방향에 맞춰 작은 스텝으로 중심을 이동한다."] },
    "육상": { facility: "표준 실외 트랙은 한 바퀴 400 m이며 종목별 출발선·교환 구역·도약 및 투척 구역이 다르다.", rule: "기록과 순위는 종목별 계측 방식과 유효 시기 판정에 따라 결정된다.", skills: ["출발 자세에서 힘을 지면에 전달해 빠르게 가속한다.", "상체의 긴장을 줄이고 팔과 다리의 리듬을 맞춘다.", "결승선까지 속도를 유지한 뒤 안전하게 감속한다."] },
    "태권도": { facility: "겨루기 경기장은 대회 규정에 따른 정사각형 경기 구역과 안전 구역으로 구성한다.", rule: "허용된 기술로 몸통과 머리의 유효 부위를 공격하며 금지 행위에는 감점이 적용된다.", skills: ["중심을 낮춘 겨루기 자세에서 앞뒤 거리를 조절한다.", "무릎을 먼저 들어 올린 뒤 발바닥으로 목표를 밀어 찬다.", "공격 후 즉시 자세를 회복하고 상대와 안전거리를 확보한다."] },
    "골프": { facility: "정규 코스는 일반적으로 18홀로 구성되며 각 홀은 티잉 구역·페어웨이·러프·그린 등으로 이루어진다.", rule: "정해진 순서와 구역에서 공을 플레이하며 가능한 적은 타수로 홀을 마치는 것을 목표로 한다.", skills: ["그립과 정렬을 확인하고 안정된 자세를 만든다.", "백스윙과 다운스윙의 리듬을 일정하게 유지한다.", "주변 사람의 위치를 확인한 뒤 안전하게 스윙한다."] },
    "스키": { facility: "슬로프는 난이도와 종목에 따라 경사·길이·기문 구성이 달라지며 리프트와 안전 시설을 함께 갖춘다.", rule: "앞사람에게 우선권이 있으며 자신의 수준에 맞는 속도와 진로를 선택해야 한다.", skills: ["부츠와 바인딩을 점검하고 기본 자세로 균형을 잡는다.", "스키 앞부분을 모아 속도를 조절하고 정지한다.", "진행 방향을 살피며 체중 이동으로 안전하게 회전한다."] },
    "보디빌딩": { facility: "훈련 공간은 기구 사이의 안전거리와 환기·바닥 상태를 확보하고 무대 평가는 종목별 규정을 따른다.", rule: "훈련에서는 정확한 자세와 점진적 부하가 중요하며 대회는 체급·부문별 기준에 따라 신체 발달과 표현을 평가한다.", skills: ["가벼운 부하로 관절 가동 범위와 자세를 먼저 확인한다.", "호흡을 멈추지 않고 목표 근육의 움직임을 통제한다.", "훈련 기록과 회복 상태를 확인해 부하를 점진적으로 조절한다."] },
    "테니스": { facility: "코트는 길이 23.77 m이며 너비는 단식 8.23 m, 복식 10.97 m이다.", rule: "0·15·30·40의 점수 체계를 사용하며 정해진 서비스 구역에서 대각선으로 서브를 넣어 경기를 시작한다.", skills: ["라켓을 준비한 채 공의 방향에 맞춰 작은 스텝으로 이동한다.", "몸 앞에서 공을 맞히고 라켓을 목표 방향으로 끝까지 보낸다.", "상대 위치와 빈 공간을 보고 타구의 길이와 방향을 조절한다."] },
  };

  function sportReferenceFor(carrierSport, sportMode = "primary") {
    const listedSports = String(carrierSport || "").split(",").map((item) => item.trim()).filter(Boolean);
    if (sportMode === "none" || !listedSports.length) {
      return {
        sport: "스포츠 문화",
        facility: "특정 종목의 규격보다 스포츠를 둘러싼 사람·제도·가치·역사적 맥락을 중심으로 살핀다.",
        rule: "특정 경기 규칙을 일반화하지 않고 자료마다 해당 종목과 시대의 조건을 확인한다.",
        skills: ["자료의 출처와 맥락을 확인한다.", "서로 다른 참여자의 관점을 비교한다.", "근거를 바탕으로 문화적 의미를 설명한다."],
      };
    }
    if (sportMode === "examples") {
      return {
        sport: listedSports.join("·"),
        facility: `${listedSports.join("·")}의 시설과 용구는 종목마다 다르므로 공통점과 차이를 비교 자료로 확인한다.`,
        rule: `${listedSports.join("·")}의 규칙을 하나의 기준으로 일반화하지 않고 문화적 배경과 변화 이유를 비교한다.`,
        skills: ["종목별 사례에서 공통된 문화 요소를 찾는다.", "종목에 따라 다르게 나타나는 규칙과 참여 방식을 비교한다.", "한 사례의 결론을 다른 종목에 그대로 적용하지 않고 조건을 검토한다."],
      };
    }
    const sport = listedSports[0];
    return {
      sport,
      ...(SPORT_REFERENCE[sport] || {
        facility: `${sport}의 경기장·시설·용구 규격은 적용할 학교 환경과 최신 종목 규정을 대조하여 확정한다.`,
        rule: `${sport}의 경기 방법, 득점, 반칙, 참여 인원과 역할을 실제 활동 전에 확인한다.`,
        skills: ["준비 자세와 안전거리를 확인한다.", "핵심 동작을 낮은 속도에서 단계적으로 연습한다.", "동료와 관찰 기준을 정해 수행을 점검하고 수정한다."],
      }),
    };
  }

  const STANDARD_CONTEXT = {
    "[12스문01-01]": { core: "스포츠 인문 문화는 신체활동에 축적된 지식·상징·가치·생활양식을 함께 읽는 관점이다", history: "생활 속 신체활동은 공동체의 놀이와 의례를 거쳐 제도화된 스포츠로 발전하였다", issue: "문화적 다양성을 인정하면서 누구나 여러 방식으로 참여할 조건을 마련해야 한다", product: "참여 관찰 기록과 스포츠 문화 해설" },
    "[12스문01-02]": { core: "스포츠의 역사와 철학은 경기의 발생 사실뿐 아니라 인간·사회·몸을 바라보는 관점의 변화를 다룬다", history: "근대화 과정에서 시간·공간·규칙이 표준화되고 학교와 미디어가 스포츠를 확산하였다", issue: "공정성·경쟁·탁월성·행복이라는 가치가 현실의 불평등 및 상업성과 충돌하기도 한다", product: "근거를 갖춘 역사·철학 비평문" },
    "[12스문01-03]": { core: "스포츠 문학과 예술은 몸의 움직임과 승패의 경험을 언어·이미지·소리·서사로 다시 해석한다", history: "시대별 작품에는 영웅·공동체·민족·젠더·노동을 바라보는 서로 다른 시선이 담겨 있다", issue: "작품의 표현 방식과 사회적 맥락을 함께 살피고 재현에서 배제된 목소리도 질문해야 한다", product: "비교 감상문·문화 작품·진로 포트폴리오" },
    "[12스문02-01]": { core: "스포츠 경기 문화는 시설과 용구의 물질문화, 규칙과 조직의 제도문화, 가치와 태도의 관념문화가 결합한 체계이다", history: "경기 방식은 참여자의 요구와 기술·미디어·지역 환경의 변화에 따라 계속 조정되어 왔다", issue: "선수뿐 아니라 심판·기록·운영·관중·미디어가 공정하고 포용적인 문화를 함께 만든다", product: "경기 문화 분석표와 역할 수행 기록" },
    "[12스문02-02]": { core: "스포츠 대회는 목적·참가자·종목·규정·대진·시설·안전·홍보·평가가 연결되는 공동 프로젝트이다", history: "대회 운영 방식은 기록 기술과 미디어의 발달, 참가자 권리와 안전 기준의 강화에 따라 전문화되었다", issue: "흥미와 경쟁만이 아니라 공정한 기회, 안전, 역할 분담, 갈등 조정과 책임 있는 기록이 중요하다", product: "대회 기획서·역할별 운영 기록·과정 포트폴리오" },
    "[12스문02-03]": { core: "스포츠 경기 문화의 가치는 인문·사회·과학·예술·디지털 기술과 만날 때 새로운 참여 방식과 콘텐츠로 확장된다", history: "측정과 방송 기술은 경기의 판정과 관람을 바꾸었고 환경·인권 문제는 스포츠의 책임 범위를 넓혔다", issue: "새로움뿐 아니라 접근성·개인정보·환경 부담·상업적 편향을 함께 검토해야 지속 가능한 융합이 된다", product: "융합 아이디어맵과 스포츠 문화 제안서" },
  };

  const UNIT_CONTENT_PLANS = {
    "스포츠 문화의 의미와 형성": ["문화로서의 스포츠", "놀이와 의례의 흔적", "규칙과 조직의 형성", "산업화와 여가의 변화", "학교와 지역 공동체", "미디어와 대중문화", "오늘의 스포츠 문화"],
    "스포츠 인문 문화의 개념과 특성": ["인문 문화의 범위", "몸과 움직임의 의미", "상징과 서사", "가치와 생활양식", "다양성과 정체성", "비판적 향유", "개념의 적용"],
    "종목 참여로 인문 문화 읽기": ["참여 전 문화 읽기", "종목의 역사적 배경", "규칙에 담긴 가치", "역할과 관계 관찰", "참여 경험 기록", "경험과 자료 비교", "인문적 성찰"],
    "시대와 사회에 따른 스포츠의 변화": ["전통 신체활동", "근대 스포츠의 등장", "규칙의 표준화", "학교와 국가", "미디어와 프로 스포츠", "참여권의 확대", "미래의 변화"],
    "스포츠에 담긴 철학과 윤리": ["놀이와 경쟁", "탁월성과 행복", "공정성의 두 관점", "스포츠맨십", "승리와 수단의 충돌", "인권과 포용", "윤리적 판단"],
    "스포츠 문화 현상 비판하기": ["문화 현상 정하기", "사실과 의견 구분", "미디어의 프레임", "상업화와 권력", "배제된 관점", "근거 비교", "비평과 대안"],
    "문학 속 스포츠 경험과 삶": ["스포츠 서사의 특징", "인물과 갈등", "승패와 성장", "몸의 감각과 표현", "사회적 배경", "서로 다른 작품 비교", "삶의 의미 재해석"],
    "영화·음악·미술 속 스포츠 표현": ["예술이 포착한 움직임", "화면과 시선", "리듬과 응원 문화", "형태와 색의 상징", "영웅 서사의 명암", "매체별 표현 비교", "감상과 비평"],
    "문학과 예술 비교·창작 및 진로 탐색": ["작품 주제 정하기", "매체의 표현 문법", "작품 비교", "자료와 저작권", "문화 콘텐츠 기획", "제작과 피드백", "문화 진로 연결"],
    "시설·장비와 스포츠 물질문화": ["물질문화의 뜻", "경기 공간의 구조", "시설 규격과 공정성", "용구의 기능과 변화", "기술 발달의 영향", "접근성과 안전", "학교 환경의 재설계"],
    "규칙·제도와 스포츠 제도문화": ["제도문화의 뜻", "규칙이 필요한 이유", "조직과 대회 체계", "판정과 기록", "규칙 변화의 배경", "공정성과 참여권", "우리의 변형 규칙"],
    "가치·전략과 경기 참여자의 역할": ["관념문화의 뜻", "경쟁과 협력", "전략과 의사 결정", "선수의 책임", "심판·운영자의 책임", "관중과 미디어", "역할이 만드는 경기 문화"],
    "우리 반 스포츠 대회 기획하기": ["대회의 목적", "참가자 요구 조사", "종목과 방식 선정", "규정과 대진 설계", "시설·용구·안전", "역할과 일정", "기획서 검토"],
    "선수·심판·운영·미디어 역할로 참여하기": ["역할별 책임", "경기 전 준비", "선수 참여", "심판과 판정", "기록과 운영", "미디어와 소통", "갈등 조정과 협력"],
    "대회 운영 결과 평가와 진로 탐색": ["평가 목적과 기준", "경기·안전 기록", "역할 수행 평가", "참가자 의견", "운영 문제의 원인", "개선안 작성", "직무와 진로 탐색"],
    "스포츠와 인문·사회 분야의 만남": ["융합의 의미", "역사와 철학", "경제와 산업", "정치와 국제 관계", "지역 공동체", "인권과 다양성", "사회적 가치 제안"],
    "스포츠와 과학·디지털 미디어의 만남": ["과학적 분석", "장비와 소재 기술", "경기 데이터", "판정 기술", "디지털 중계", "개인정보와 격차", "책임 있는 기술 활용"],
    "지속 가능한 스포츠 문화 창작하기": ["지속 가능성의 뜻", "시설과 탄소 배출", "용품과 자원 순환", "모두의 접근성", "지역과의 공존", "문화 개선안 설계", "실행·평가·확산"],
  };

  const UNIT_THESES = {
    "스포츠 문화의 의미와 형성": "스포츠 문화는 사람들이 신체활동에 참여하고 관람하고 이야기하는 과정에서 축적한 생활양식이며, 시대의 제도와 기술 변화에 따라 계속 새롭게 형성된다.",
    "스포츠 인문 문화의 개념과 특성": "스포츠 인문 문화는 몸과 움직임에 담긴 역사·상징·가치·정체성을 읽고, 서로 다른 참여 경험을 인간과 사회의 관점에서 성찰하는 문화이다.",
    "종목 참여로 인문 문화 읽기": "종목 참여는 기술을 수행하는 데서 끝나지 않고 규칙의 의미, 역할 사이의 관계, 존중과 책임이 실제 장면에서 어떻게 드러나는지 관찰하는 탐구가 된다.",
    "시대와 사회에 따른 스포츠의 변화": "스포츠는 전통 놀이와 의례에서 근대의 표준화된 경기로 변화했고, 학교·국가·산업·미디어의 영향 속에서 참여 범위와 사회적 의미를 넓혀 왔다.",
    "스포츠에 담긴 철학과 윤리": "스포츠의 경쟁은 탁월성을 추구하게 하지만 승리, 공정성, 행복, 존중이 충돌할 때 어떤 원칙을 우선할지 윤리적 판단을 요구한다.",
    "스포츠 문화 현상 비판하기": "스포츠 문화 비평은 익숙한 현상을 당연하게 받아들이지 않고 자료의 관점과 이해관계를 밝힌 뒤 공정성·포용성·지속 가능성에 비추어 대안을 제시하는 과정이다.",
    "문학 속 스포츠 경험과 삶": "스포츠 문학은 훈련과 경기의 경험을 인물의 선택과 갈등, 성장과 좌절의 서사로 재구성하여 승패 밖에 있는 삶의 의미를 드러낸다.",
    "영화·음악·미술 속 스포츠 표현": "영화·음악·미술은 움직임과 경기 장면을 화면·리듬·색과 형태로 변환하며, 같은 스포츠도 매체의 표현 방식에 따라 다른 감정과 사회적 의미를 만든다.",
    "문학과 예술 비교·창작 및 진로 탐색": "스포츠 문화 콘텐츠를 만들려면 작품의 주제와 매체 문법을 비교하고, 자료의 출처와 저작권을 지키며 기획·제작·피드백의 과정을 진로 역량과 연결해야 한다.",
    "시설·장비와 스포츠 물질문화": "스포츠 물질문화는 경기장과 시설, 장비와 용구처럼 눈에 보이는 요소로 이루어지며, 규격과 소재의 변화는 경기 방식·공정성·안전·접근성을 함께 바꾼다.",
    "규칙·제도와 스포츠 제도문화": "스포츠 제도문화는 규칙, 조직, 대회 체계, 판정과 기록 절차로 구성되며 참가자가 예측 가능한 조건에서 공정하게 경쟁하고 갈등을 조정하도록 돕는다.",
    "가치·전략과 경기 참여자의 역할": "경기 문화는 선수의 전략뿐 아니라 심판·기록원·운영자·관중·미디어의 판단과 책임이 결합해 만들어지며 각 역할의 행동에는 존중과 공정성의 가치가 드러난다.",
    "우리 반 스포츠 대회 기획하기": "학급 대회 기획은 목적과 참가자 요구를 바탕으로 종목·방식·규정·대진·시설·안전·역할·일정을 하나의 실행 가능한 계획으로 연결하는 일이다.",
    "선수·심판·운영·미디어 역할로 참여하기": "대회는 선수만으로 운영되지 않으며 심판의 판정, 기록원의 정확성, 운영자의 조정, 미디어 담당자의 책임 있는 소통이 함께 작동할 때 안정적인 경기 문화가 형성된다.",
    "대회 운영 결과 평가와 진로 탐색": "대회 평가는 승패뿐 아니라 안전, 역할 수행, 공정한 참여, 시간과 자원, 참가자 경험을 증거로 검토하고 그 과정에서 발견한 직무를 진로 탐색으로 확장한다.",
    "스포츠와 인문·사회 분야의 만남": "스포츠는 역사·철학·경제·정치·지역 공동체·인권과 연결되어 사회를 비추는 창이 되며, 분야 간 관점을 결합하면 경기 밖의 가치와 문제를 더 입체적으로 이해할 수 있다.",
    "스포츠와 과학·디지털 미디어의 만남": "과학과 디지털 기술은 수행 분석, 장비, 판정, 기록, 중계를 바꾸지만 정확성과 편리함뿐 아니라 비용 격차·개인정보·책임 소재도 함께 검토해야 한다.",
    "지속 가능한 스포츠 문화 창작하기": "지속 가능한 스포츠 문화는 환경 부담을 줄이고 다양한 사람이 접근할 수 있게 하며 지역 사회와 자원을 책임 있게 나누는 실행 가능한 참여 방식을 설계하는 데서 시작한다.",
  };

  function normalizedTitle(value) {
    return String(value || "").replace(/^\d+(?:-\d+){0,2}[.)]?\s*/, "").trim();
  }

  function stripEnd(value) {
    return String(value || "").replace(/[.!?]+\s*$/, "");
  }

  function evidenceRecordFor(smallUnit) {
    const title = normalizedTitle(smallUnit.smallTitle);
    const units = global.SPORTS_CULTURE_EVIDENCE?.units || {};
    if (units[title]) return { title, ...units[title] };
    const match = Object.keys(units).find((candidate) => title.includes(candidate) || candidate.includes(title));
    if (match) return { title: match, ...units[match] };
    const terms = new Set((`${smallUnit.middleTitle || ""} ${title}`.match(/[가-힣]{2,}/g) || []).filter((term) => !/^(스포츠|문화|하기|그리고)$/.test(term)));
    const ranked = Object.keys(units).map((candidate) => {
      const candidateTerms = candidate.match(/[가-힣]{2,}/g) || [];
      return { candidate, score: candidateTerms.filter((term) => terms.has(term) || [...terms].some((source) => source.includes(term) || term.includes(source))).length };
    }).sort((a, b) => b.score - a.score);
    return ranked[0]?.score >= 2 ? { title: ranked[0].candidate, ...units[ranked[0].candidate] } : null;
  }

  function sourceEvidenceFor(request) {
    const record = evidenceRecordFor(request.smallUnit);
    if (!record) {
      if ((request.pageRole || "small-unit") === "small-unit") {
        throw new Error(`‘${request.smallUnit.smallTitle}’에 연결된 전처리 근거가 없습니다. 소단원 제목 또는 성취기준 연결을 먼저 확인해 주세요.`);
      }
      return clone(SPORTS_CULTURE_PROFILE.sources.slice(0, 3)).map((source) => ({
        ...source,
        role: `[대단원 수준 일반 참고] ${source.role}`,
        matchedSmallUnit: false,
      }));
    }
    const seen = new Set();
    return record.evidence.filter((item) => {
      const key = `${item.documentId}:${item.sourcePdfPage}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12).map((item) => ({
      id: item.documentId,
      role: `${item.documentType} 내용 근거`,
      page: item.sourcePdfPage || item.physicalPage,
      excerpt: item.text,
      matchedSmallUnit: true,
    }));
  }

  const MANUSCRIPT_BLUEPRINTS = {
    theory: [
      { role: "핵심 개념 세우기", titles: ["스포츠를 문화로 보는 관점", "문화의 세 층위", "개인 경험과 사회 구조", "탐구 질문 만들기"] },
      { role: "역사적 형성 과정", titles: ["생활의 움직임에서 경기로", "근대 스포츠와 규칙의 표준화", "학교·도시·미디어의 영향", "선택 종목의 변화 읽기"] },
      { role: "철학과 가치 탐구", titles: ["놀이·경쟁·탁월성의 의미", "공정성은 무엇을 요구하는가", "몸·정체성·존중", "가치 충돌 토론하기"] },
      { role: "사회 제도와 쟁점", titles: ["조직과 제도가 만드는 스포츠", "미디어와 상업화", "참여 기회와 포용성", "환경과 지속 가능성"] },
      { role: "자료 비교와 비평", titles: ["사료와 기사 읽는 법", "서로 다른 관점 비교하기", "수치와 이미지 해석하기", "근거 있는 비평문 쓰기"] },
      { role: "현대적 확장과 성찰", titles: ["디지털 시대의 스포츠", "새로운 종목과 참여 문화", "더 나은 문화 제안하기", "학습 증거로 성찰하기"] },
    ],
    practice: [
      { role: "종목과 경기 문화 이해", titles: ["종목의 특성과 문화", "경기의 목적과 참여 방식", "선수와 다양한 참여자", "수행 전 진단하기"] },
      { role: "시설·용구·안전", titles: ["경기장 규격과 구역", "용구의 구조와 점검", "위험 요인과 예방", "학교 환경에 맞게 조정하기"] },
      { role: "경기 방법과 규칙", titles: ["경기 진행과 득점", "주요 반칙과 판정", "심판의 신호와 기록", "공정한 규칙 합의하기"] },
      { role: "기본 동작 익히기", titles: ["준비 자세와 이동", "핵심 동작 1", "핵심 동작 2", "관찰·피드백·교정"] },
      { role: "전술과 역할 수행", titles: ["공간과 흐름 읽기", "개인 전략과 팀 전략", "역할 전환과 의사소통", "상황별 문제 해결"] },
      { role: "경기 운영과 평가", titles: ["미니 경기 설계", "선수·심판·기록 운영", "과정과 결과 평가", "참여 경험과 진로 성찰"] },
    ],
    mixed: [
      { role: "개념과 경험 연결", titles: ["스포츠 문화의 의미", "선택 종목에 담긴 문화", "나의 참여 경험 읽기", "탐구·참여 질문 정하기"] },
      { role: "역사와 경기 환경", titles: ["종목의 형성과 변화", "시설·용구가 바꾼 경기", "규칙의 변화와 가치", "과거와 현재 비교하기"] },
      { role: "규칙과 문화적 가치", titles: ["경기 방법과 핵심 규칙", "공정성·존중·책임", "판정과 갈등 조정", "우리의 참여 약속"] },
      { role: "동작과 문화 실천", titles: ["안전한 준비와 이동", "기본 동작의 원리", "전략과 협력", "동작 속 가치 관찰하기"] },
      { role: "다양한 역할로 참여", titles: ["선수 역할 수행", "심판·기록 역할 수행", "운영·미디어 역할 수행", "역할별 관점 비교하기"] },
      { role: "비평과 문화 창작", titles: ["참여 자료 분석", "경기 문화 비평", "개선안과 새 문화 설계", "공유·평가·진로 연결"] },
    ],
  };

  const SPREAD_ENRICHMENTS = {
    theory: [
      "스포츠 문화를 분석하는 단위는 개인 행동, 집단의 관습, 제도와 사회 구조로 나눌 수 있다. 개인이 규칙을 지키는 장면만 보면 태도의 문제처럼 보이지만, 참가 자격이나 시설 접근성까지 살피면 제도가 행동의 선택 범위를 정한다는 사실이 드러난다. 세 단위를 오가며 설명해야 문화 현상을 개인의 성격으로만 환원하지 않을 수 있다.",
      "전근대의 신체활동과 근대 스포츠를 구분하는 기준에는 성문화된 규칙, 전문 조직, 기록의 계량화, 경기 공간과 시간의 표준화가 있다. 그러나 모든 지역이 같은 순서로 변화한 것은 아니다. 지역의 놀이와 제례, 식민지 경험, 학교 제도가 서로 다른 방식으로 결합했으므로 보편적 변화와 지역적 특수성을 함께 서술해야 한다.",
      "스포츠에서 경쟁은 탁월성을 추구하는 동기가 되지만 승리만을 최상위 가치로 놓으면 상대 존중과 참가 기회의 평등이 약해질 수 있다. 규칙을 지켰다는 사실과 행위가 정당하다는 평가는 항상 일치하지 않는다. 목적, 절차, 결과, 취약한 참여자에게 미친 영향을 차례로 검토하여 윤리적 판단의 기준을 명료하게 세운다.",
      "미디어는 경기를 전달하는 수단을 넘어 어떤 종목과 선수를 중요하게 볼지 결정하는 문화 생산자이다. 중계 시간, 화면의 구도, 해설의 표현, 후원 기업의 이해는 대중의 인식과 자원 배분에 영향을 준다. 반복해서 등장하는 이미지와 빠진 장면을 비교하면 스포츠 문화에 작용하는 권력과 상업화의 방식을 구체적으로 읽을 수 있다.",
      "서로 다른 자료가 충돌할 때에는 한쪽을 즉시 오류로 처리하지 않는다. 통계는 전체 경향을 보여 주지만 개인의 경험을 충분히 설명하지 못하고, 인터뷰는 맥락을 풍부하게 드러내지만 대표성이 제한될 수 있다. 자료마다 답할 수 있는 질문의 범위를 정하고 교차 검증한 뒤 결론의 확실성과 남은 불확실성을 구분한다.",
      "미래의 스포츠 문화를 제안할 때 기술 도입 자체를 발전으로 가정해서는 안 된다. 판정 정확도나 접근성을 높이는 효과와 함께 비용 격차, 개인정보 수집, 인간 심판의 책임 변화, 전자 폐기물 문제를 검토한다. 제안은 수혜자와 부담 주체, 운영 규칙, 검증 방법을 포함해야 실제로 평가하고 수정할 수 있다.",
    ],
    practice: [
      "종목을 이해한다는 것은 대표 기술의 이름을 아는 것을 넘어 경기의 목적, 득점 구조, 공간 사용, 참여자의 관계를 파악하는 것이다. 같은 기술도 점수와 상대 위치, 팀의 약속에 따라 의미가 달라진다. 경기 영상을 볼 때 공만 따라가지 말고 공이 없는 선수와 심판·기록자의 움직임까지 관찰하여 종목의 전체 구조를 읽는다.",
      "안전 점검은 준비 운동만으로 끝나지 않는다. 활동 공간의 경계와 충돌 지점, 용구의 마모, 대기 학생의 위치, 기온과 환기, 비상 연락 체계를 확인한다. 위험 가능성과 사고 발생 시 피해의 크기를 기준으로 우선순위를 정하고 제거·대체·규칙 조정·보호 장비 순으로 대책을 마련한다.",
      "판정 능력을 기르려면 규칙 문장을 실제 장면의 조건으로 바꾸어 읽어야 한다. 행위가 일어난 위치와 시점, 공의 상태, 접촉의 의도와 결과, 심판의 시야를 확인한 뒤 적용 조항을 선택한다. 판정을 설명할 때에는 결론보다 관찰한 사실과 규칙의 연결을 먼저 제시해야 참가자가 결과를 수용할 수 있다.",
      "기본 동작은 부분 연습과 전체 수행을 오가며 익힌다. 처음에는 속도를 낮추어 자세와 힘의 전달 순서를 확인하고, 안정되면 이동·목표·상대 압박을 추가한다. 오류가 생기면 결과만 반복하지 말고 어느 단계에서 균형이나 타이밍이 무너졌는지 찾아 한 요소씩 수정한 뒤 전체 동작에서 다시 확인한다.",
      "좋은 전술은 정해진 위치를 외우는 것이 아니라 정보를 빠르게 읽고 선택을 갱신하는 능력이다. 공격에서는 공간을 만들고 이용하는 움직임, 수비에서는 위험한 공간을 줄이고 서로를 지원하는 거리가 핵심이다. 경기 전 계획, 실제 선택, 결과를 비교하여 판단이 적절했던 순간과 정보가 부족했던 순간을 구분한다.",
      "경기 운영에서는 시작 전 준비, 진행 중 판정과 기록, 종료 후 결과 확인이 하나의 절차로 연결된다. 역할별 책임과 의사 결정 권한을 미리 정하고 문제가 발생하면 보고·협의·결정·공지의 순서를 따른다. 평가 자료에는 승패 외에도 안전사고, 역할 수행, 규칙 분쟁, 참가 만족도와 개선안을 포함한다.",
    ],
    mixed: [
      "개인의 참여 경험은 스포츠 문화를 이해하는 출발점이지만 그 자체가 전체를 대표하지는 않는다. 즐거움이나 불편함이 생긴 장면을 규칙, 공간, 역할 관계와 연결하고 다른 학생의 경험 및 공식 자료와 비교한다. 경험의 공통점과 예외를 함께 제시하면 개인적 소감을 사회적 설명으로 확장할 수 있다.",
      "종목의 역사에는 경기 기술뿐 아니라 누가 참여할 수 있었는지, 어떤 시설과 용구를 사용할 수 있었는지의 변화가 담긴다. 시설의 표준화는 교류를 확대했지만 비용과 접근성의 장벽을 만들기도 했다. 과거와 현재를 비교할 때 기술적 개선과 참여 기회의 변화를 별개의 축으로 놓고 평가한다.",
      "규칙은 공정성을 보장하지만 모든 차이를 없애지는 않는다. 기능 수준, 신체 조건, 경험이 다른 참가자가 같은 규칙 아래에서 실제로 어떤 기회를 얻는지 관찰해야 한다. 변형 규칙을 만들 때에는 특정 학생만 예외로 표시하지 말고 전체 참가자가 선택할 수 있는 방식으로 설계하여 자율성과 존중을 지킨다.",
      "기본 동작을 문화적 가치와 연결하려면 수행 과정에서 나타나는 관계를 기록해야 한다. 동료의 준비를 기다리는 행동, 위험을 알리는 의사소통, 판정을 받아들이는 태도, 실수 뒤 다시 참여하도록 돕는 방식이 존중과 책임을 보여 준다. 기술 평가표와 참여 관찰표를 함께 사용하여 두 성장을 분리하지 않는다.",
      "역할을 교대하면 같은 경기 장면도 다르게 보인다. 선수는 수행과 공간에 집중하지만 심판은 규칙 적용, 기록원은 사건의 정확한 순서, 운영자는 전체 시간과 안전을 살핀다. 역할별 기록을 한데 모아 정보의 누락과 판단 충돌을 찾고 공동 결정을 위한 의사소통 규칙을 세운다.",
      "문화 창작은 장식물을 만드는 활동이 아니라 발견한 문제에 새로운 관계와 규칙을 제안하는 과정이다. 개선안의 대상과 목적, 필요한 자원, 실행 절차, 예상 효과를 밝히고 실제 참가자의 의견을 받아 수정한다. 결과물에는 실패하거나 바뀐 아이디어도 남겨 문제 해결의 과정을 학습 증거로 제시한다.",
    ],
  };

  function manuscriptParagraphs(type, blueprintIndex, sectionIndex, request, traceability, reference, context, angle, first, guide) {
    const title = MANUSCRIPT_BLUEPRINTS[type][blueprintIndex].titles[sectionIndex];
    const sport = reference.sport;
    const theoryDetails = [
      [`‘${angle}’을 ${stripEnd(context.core)}는 관점에서 다시 보면`, `문화는 개인의 취향만을 뜻하지 않는다. ${sport}을 둘러싼 언어, 관습, 규칙과 제도는 참여자들이 공유하고 다음 세대로 전달하면서 형성된다.`, `따라서 ${title}에서는 눈에 보이는 경기 장면과 그 장면을 가능하게 한 사회적 조건을 구분하여 살펴본다.`],
      [`‘${angle}’의 형성 맥락은 ${stripEnd(context.history)}는 사실에서 출발한다`, "산업화와 도시화는 노동과 여가의 시간을 구분하였고, 학교와 지역 단체는 정해진 공간에서 같은 규칙으로 경기를 운영하였다. 이 과정은 스포츠의 대중화를 이끌었지만 지역 고유의 놀이가 주변화되는 결과도 낳았다.", `${sport}의 과거 사진·규칙 문서·신문 자료를 연대순으로 배열하고 변화의 원인을 기술·교육·미디어·국제 교류의 측면에서 설명한다.`],
      [`${stripEnd(context.core)}. 이 관점은 스포츠를 단순한 승패가 아니라 좋은 삶, 자율성, 탁월성, 공동체의 관계를 묻는 철학적 실천으로 보게 한다.`, "같은 규칙을 모두에게 적용하는 형식적 공정성과 서로 다른 조건을 고려하는 실질적 공정성은 때때로 다른 결론을 낳는다. 판단할 때에는 규칙의 목적과 참여자에게 미치는 영향을 함께 검토해야 한다.", `${sport}의 실제 갈등 사례에서 사실·가치·이해관계자를 구분하고 자신이 선택한 판단 원칙을 반대 관점에서도 검토한다.`],
      [`‘${angle}’에서 검토할 쟁점은 ${stripEnd(context.issue)}는 점이다`, "협회·학교·기업·언론은 경기 기회와 자원, 대중의 관심을 배분한다. 제도의 결정은 중립적으로 보일 수 있지만 성별, 장애, 경제적 조건, 지역에 따라 참여자에게 다른 영향을 줄 수 있다.", `${title}에 관한 기사나 정책을 읽고 혜택을 얻는 집단과 부담을 지는 집단, 의사 결정에서 빠진 목소리를 찾아 개선 기준을 제안한다.`],
      ["스포츠 자료는 과거의 사실을 그대로 보여 주는 창문이 아니라 특정한 목적과 관점으로 선택·구성된 기록이다. 작성자, 제작 시기, 대상 독자와 자료의 형식을 확인해야 한다.", "통계는 표본과 조사 방식에 따라 의미가 달라지고 사진은 프레임 밖의 상황을 감춘다. 서로 다른 종류의 자료를 교차 확인하면 하나의 자료에 의존할 때 생기는 오류를 줄일 수 있다.", `${sport}에 관한 두 자료의 주장과 근거를 비교하고 신뢰도·관련성·충분성을 평가한 뒤 ${context.product}에 출처를 표시한다.`],
      [`오늘날 ${sport}은 디지털 중계, 데이터 분석, 가상 참여와 결합하며 시간과 장소의 경계를 넓히고 있다. 새로운 기술은 접근성을 높일 수 있지만 감시, 개인정보, 비용 격차라는 문제도 만든다.`, `${stripEnd(context.issue)}는 흐름 속에서, 새로운 문화가 지속되려면 재미와 효율뿐 아니라 인권, 환경, 지역 공동체에 미치는 영향을 평가해야 한다.`, `${traceability.standardCodes.join(", ")}을 기준으로 현재 문화의 장점·한계·개선 방안을 구분하고 실행 가능한 제안을 ${context.product} 형태로 정리한다.`],
    ];
    const practiceDetails = [
      [`${sport}은 기능 수행, 규칙, 시설, 참여자의 역할과 태도가 결합된 경기 문화이다. 기술을 잘 수행하는 것만으로는 공정하고 안전한 경기가 완성되지 않는다.`, `‘${angle}’에서는 ${stripEnd(context.issue)}는 점을 특히 눈여겨봐야 한다`, `활동 전 자신의 기능·경험·건강 상태를 점검하고 선수·심판·기록·운영 중 도전할 역할과 필요한 지원을 구체적으로 정한다.`],
      [`‘${angle}’의 시설·용구 조건은 ${stripEnd(reference.facility)}는 규격을 따른다`, "시설 규격은 경기의 공정성과 안전을 확보하는 기준이다. 학교 수업에서는 공간을 축소할 수 있지만 이동 경로가 겹치지 않도록 하고 경계선·완충 구역·대기 위치를 명확하게 표시해야 한다.", `용구의 파손, 바닥의 미끄러움, 주변 장애물과 사람 사이의 거리를 활동 전에 점검한다. 이상이 발견되면 활동을 멈추고 대체 공간이나 용구를 사용한다.`],
      [`‘${angle}’의 판정 기준은 ${stripEnd(reference.rule)}는 규칙에 근거한다`, "규칙은 행동을 제한하기만 하는 장치가 아니라 경기의 흐름을 예측 가능하게 하고 서로의 권리와 안전을 보장하는 약속이다. 반칙의 결과뿐 아니라 해당 규칙이 필요한 이유를 이해해야 한다.", `${sport}의 득점·서비스 또는 시작·진행·재개·반칙 상황을 경기 기록지에 표시하고, 애매한 판정은 합의한 절차에 따라 설명하고 조정한다.`],
      [`${reference.skills[0]} 이때 시선, 중심 이동, 관절의 순서와 타이밍을 하나씩 확인하면 동작의 원인을 파악할 수 있다.`, `${reference.skills[1]} 빠른 수행보다 정확한 자세와 안정된 반복을 우선하고, 성공 횟수뿐 아니라 움직임의 질을 관찰한다.`, `${reference.skills[2]} 동료는 결과만 평가하지 않고 관찰 기준에 따라 강점 한 가지와 수정할 점 한 가지를 구체적인 언어로 피드백한다.`],
      ["전술은 정답 동작을 외우는 것이 아니라 공·상대·동료·공간·점수의 변화를 읽고 더 유리한 선택을 하는 과정이다. 경기 전에 세운 계획도 상황이 바뀌면 수정할 수 있어야 한다.", `${sport}에서는 상대의 위치와 빈 공간, 다음 동작의 가능성을 동시에 살핀다. 개인의 선택을 팀의 약속과 연결하고 짧고 명확한 신호로 의사소통한다.`, "선수와 심판·기록자의 관점을 번갈아 경험하면 같은 장면을 다르게 해석하는 이유를 이해하고 갈등을 근거에 따라 조정할 수 있다."],
      ["미니 경기는 학습 목표가 드러나도록 인원·시간·공간·득점 조건을 조정한다. 기능 차이가 큰 경우 공의 속도, 허용 횟수, 역할 교대 규칙을 바꾸되 특정 학생에게 낙인이 되지 않게 전체 규칙으로 설계한다.", `${context.product}에는 준비·운영·정리 단계의 역할, 실제 발생한 문제, 해결 과정과 판단 근거를 시간 순서로 남긴다.`, `평가는 승패만으로 결정하지 않는다. 규칙 이해, 안전 실천, 기술과 전략, 협력과 책임을 과정 증거와 함께 평가하고 다음 참여 목표를 설정한다.`],
    ];
    const mixedDetails = [
      [context.core, `${sport}을 직접 경험한 기억에는 규칙과 시설뿐 아니라 긴장, 협력, 응원, 갈등과 소속감이 함께 담긴다. 개인 경험을 문화 개념과 연결하면 익숙한 장면을 새롭게 해석할 수 있다.`, `${title}에 관한 자신의 경험을 사실·감정·가치 판단으로 나누어 기록하고 친구의 경험과 공통점 및 차이점을 비교한다.`],
      [context.history, `${reference.facility} 시설과 용구의 변화는 단순한 기술 발전이 아니라 경기 속도, 참여 가능한 사람, 관람 방식과 종목의 이미지를 바꾸었다.`, `${sport}의 과거와 현재 자료를 비교하여 변한 요소와 유지된 요소를 찾고, 그 변화가 참여자와 사회에 가져온 이익과 한계를 설명한다.`],
      [reference.rule, "공정한 참여는 규칙을 똑같이 적용하는 데서 끝나지 않는다. 규칙의 목적, 참가자의 서로 다른 조건, 판정 과정의 투명성과 이의 제기 절차를 함께 갖추어야 한다.", `${sport} 활동에 필요한 존중·책임·안전 약속을 근거와 함께 만들고 실제 경기 후 약속이 어떤 장면에서 지켜졌는지 확인한다.`],
      [`${reference.skills[0]} 동작을 수행할 때에는 결과와 함께 준비 자세, 중심 이동, 타점 또는 접촉 지점, 마무리 자세를 관찰한다.`, `${reference.skills[1]} 기능 수준이 다른 학생은 거리·속도·용구를 조정하거나 보조 역할을 선택해 같은 문화적 가치를 학습할 수 있다.`, `${reference.skills[2]} 수행 과정에서 공정성·존중·협력이 드러난 순간을 기록하고 기능 향상과 문화적 실천이 어떻게 연결되는지 설명한다.`],
      ["스포츠 대회에는 경기하는 선수 외에도 심판, 기록, 시설, 안전, 홍보, 해설, 촬영 등 여러 역할이 필요하다. 각 역할은 서로 다른 정보와 책임을 가지고 하나의 경기를 공동으로 만든다.", `${sport} 활동에서 역할을 교대하며 관찰 대상과 의사 결정의 차이를 기록한다. 특히 판정이나 운영 문제가 생겼을 때 누가 어떤 근거로 조정했는지 살펴본다.`, "역할별 기록을 모으면 개인의 기억만으로 보이지 않던 경기 문화의 구조가 드러난다. 서로의 기여를 구체적인 증거로 인정하고 개선이 필요한 연결 지점을 찾는다."],
      [`참여 기록은 잘한 점을 나열하는 소감문이 아니라 주장과 근거가 연결된 비평 자료이다. 경기 장면, 기록표, 인터뷰와 결과물을 성취기준에 따라 분류한다.`, context.issue, `${context.product}에는 문제 상황, 원인, 이해관계자의 관점, 대안, 예상 효과와 한계를 포함하고 동료 검토를 거쳐 수정한 내용을 표시한다.`],
    ];
    const detail = { theory: theoryDetails, practice: practiceDetails, mixed: mixedDetails }[type][blueprintIndex];
    const detailParagraph = detail[sectionIndex] || {
      theory: `${title}에서는 ‘${angle}’에 대한 앞선 설명을 종합하여 핵심 개념의 적용 범위와 한계를 판단한다. ‘${context.issue}’를 핵심 쟁점으로 삼아 사실, 가치 판단, 이해관계자의 주장을 구분하고 ${context.product}의 최종 논지를 세운다.`,
      practice: `${title}에서는 ‘${angle}’과 관련해 앞 단계에서 익힌 시설·규칙·기술 정보를 실제 경기 운영에 통합한다. 수행 결과뿐 아니라 선택의 이유, 역할 간 의사소통, 안전 조치와 경기 재개 절차를 기록하여 다음 활동의 수정 근거로 삼는다.`,
      mixed: `${title}에서는 ‘${angle}’의 개념 탐구와 ${reference.sport} 참여 기록을 하나의 설명으로 통합한다. 자료에서 파악한 문화적 의미가 실제 행동에서 어떻게 실천되거나 충돌했는지 비교하고, 차이가 생긴 조건을 규칙·역할·환경의 측면에서 해석한다.`,
    }[type];
    const analysisParagraphs = [
      `‘${title}’의 핵심 주장이 이 펼침면의 구체적인 자료와 어떻게 연결되는지 밝히는 것이 이 절의 목표이다. 용어의 정의, 적용되는 사례, 적용하기 어려운 반례를 차례로 검토하면 개념의 범위를 지나치게 넓히거나 개인 경험 하나를 일반화하는 오류를 줄일 수 있다.`,
      `‘${title}’에 나타난 변화나 수행 결과를 하나의 원인으로 단정해서는 안 된다. ${reference.sport}의 시설과 규칙, 참여자의 기능과 역할, 시대적 요구가 서로 어떤 영향을 주었는지 인과 관계와 단순한 전후 관계를 구분하여 설명한다.`,
      `‘${title}’을 평가할 때에는 선수만이 아니라 심판·운영자·관중·미디어와 참여 기회가 제한된 사람의 관점도 포함한다. 같은 결정이 집단별로 가져오는 이익과 부담을 비교하고 ${traceability.values.join("·")} 중 우선할 가치와 그 이유를 제시한다.`,
      `‘${title}’은 ${MANUSCRIPT_BLUEPRINTS[type][blueprintIndex].role}에서 학습한 내용을 종합하는 단계이다. 앞 절의 개념과 자료를 나열하지 말고 핵심 주장, 근거, 예상되는 반론, 반론에 대한 답변의 관계로 재구성하여 ${context.product}의 완성도를 높인다.`,
    ];
    const evidenceParagraph = first
      ? `이 절의 핵심 자료는 ${first.publisher || first.documentId} ${first.documentType} ${first.sourcePdfPage || first.physicalPage}쪽이다. 자료의 작성 주체·시기·목적을 먼저 확인하고, ‘${title}’에 관한 주장과 직접 연결되는 부분을 인용이 아닌 자신의 말로 요약한다. 자료가 보여 주지 못하는 정보와 추가로 확인할 자료까지 표시해야 근거의 신뢰도와 충분성을 판단할 수 있다.`
      : `‘${title}’에 관한 자료는 작성 주체·시기·목적을 먼저 확인하고, 주장과 직접 연결되는 부분을 인용이 아닌 자신의 말로 요약한다. 자료가 보여 주지 못하는 정보와 추가로 확인할 자료까지 표시해야 근거의 신뢰도와 충분성을 판단할 수 있다.`;
    const taskVariants = {
      balanced: ["설명 자료와 참여 증거가 일치하는 지점과 충돌하는 지점을 두 열 표로 정리한다", "개념 설명 뒤에 실제 사례와 반례를 각각 배치한다", "개인 기록과 모둠 기록의 차이를 비교하여 판단 기준을 수정한다", `네 절의 결과를 연결해 ${context.product}의 주장-근거 구조를 완성한다`],
      activity: [`${reference.sport}의 해당 장면을 직접 수행하거나 역할 관찰로 재현하고 시간 순서대로 기록한다`, "조건 하나를 바꾼 두 차례의 수행을 비교하여 변화의 원인을 찾는다", "선수·심판·기록 역할을 교대하며 판단과 정보의 차이를 확인한다", `운영 과정에서 발견한 문제를 해결하고 수정 전후 결과를 ${context.product}에 남긴다`],
      creative: ["익숙한 관습을 다른 시대 또는 문화권의 관점으로 바꾸어 해석한다", "기존 자료의 표현 방식과 다른 형식의 시각 자료를 설계한다", "배제된 참여자의 관점에서 규칙이나 운영 방식을 다시 제안한다", `대안의 참신성·실현 가능성·부작용을 검토하여 ${context.product}을 수정한다`],
    }[request.framework.id] || [`${context.product}을 작성한다`, `${context.product}을 작성한다`, `${context.product}을 작성한다`, `${context.product}을 작성한다`];
    const guideNote = guide ? ` ${guide.publisher || guide.documentId} 지도서 ${guide.sourcePdfPage || guide.physicalPage}쪽의 수업 관점을 참고해 반대되거나 빠진 관점이 있는지 검토한다.` : "";
    const taskParagraph = `체제안의 이번 과제는 ‘${title}’을 중심으로 ${taskVariants[sectionIndex]}는 것이다. 결과물에는 수행 또는 탐구 과정에서 실제로 확인한 증거를 두 가지 이상 포함하고, 처음 판단에서 바뀐 부분과 바뀐 이유를 표시한다.${guideNote} 마지막에는 ${traceability.standardCodes.join(", ")}의 과정·기능과 가치·태도 요소가 어디에서 드러나는지 스스로 점검한다.`;
    return [
      detailParagraph,
      analysisParagraphs[sectionIndex],
      evidenceParagraph,
      taskParagraph,
    ];
  }

  function textbookManuscriptFor(phase, request, traceability, index) {
    const reference = sportReferenceFor(request.carrierSport, request.sportMode);
    const knowledge = traceability.knowledge.join("·");
    const type = MANUSCRIPT_BLUEPRINTS[request.primaryType] ? request.primaryType : "theory";
    const standardCode = traceability.standardCodes[0];
    const context = STANDARD_CONTEXT[standardCode] || STANDARD_CONTEXT["[12스문01-01]"];
    const evidenceRecord = evidenceRecordFor(request.smallUnit);
    if (!evidenceRecord || !evidenceRecord.evidence?.length) {
      throw new Error(`‘${request.smallUnit.smallTitle}’에 연결된 전처리 근거가 없습니다. 소단원 제목 또는 성취기준 연결을 먼저 확인해 주세요.`);
    }
    const angles = UNIT_CONTENT_PLANS[evidenceRecord.title];
    if (!angles) throw new Error(`‘${evidenceRecord.title}’의 집필 브리프가 아직 구성되지 않았습니다.`);
    const angle = angles[index % angles.length];
    const thesis = UNIT_THESES[evidenceRecord.title];
    const textbookEvidence = evidenceRecord.evidence.filter((item) => item.documentType === "교과서");
    const guideEvidence = evidenceRecord.evidence.filter((item) => item.documentType === "지도서");
    const pool = [...textbookEvidence, ...guideEvidence];
    const blueprintRows = MANUSCRIPT_BLUEPRINTS[type];
    const blueprintIndex = index % blueprintRows.length;
    const blueprint = blueprintRows[blueprintIndex];
    const sectionTitles = blueprint.titles;
    const sections = sectionTitles.map((title, sectionIndex) => {
      const base = index * 12 + sectionIndex * 3;
      const first = pool[base % pool.length];
      const guide = guideEvidence[(index * 4 + sectionIndex) % Math.max(1, guideEvidence.length)] || first;
      const sourceLine = sectionIndex === 0
        ? `이 소단원의 핵심 주제는 “${stripEnd(thesis)}”이며, ${first.publisher || first.documentId} ${first.documentType} ${first.sourcePdfPage || first.physicalPage}쪽의 관련 자료는 ‘${angle}’을 구체적인 사례와 연결하는 근거로 활용한다.`
        : `${first.publisher || first.documentId} ${first.documentType} ${first.sourcePdfPage || first.physicalPage}쪽의 관련 자료를 바탕으로 ‘${angle}’과 ‘${title}’이 ${evidenceRecord.title}의 전체 의미와 어떤 관계를 맺는지 설명한다.`;
      const richParagraphs = manuscriptParagraphs(type, blueprintIndex, sectionIndex, request, traceability, reference, context, angle, first, guide);
      return { number: sectionIndex + 1, title, paragraphs: [sourceLine, ...richParagraphs] };
    });
    return {
      headline: `${request.smallUnit.smallTitle} — ${angle}`,
      learningGoal: `${knowledge}을 이해하고 ${traceability.process.join("·")}을 수행하여 ${context.product}을 완성할 수 있다.`,
      openingQuestion: Number(request.styleValue ?? 50) < 34 ? "" : `‘${angle}’을 스포츠 문화라고 판단할 수 있는 구체적인 근거는 무엇인가?`,
      layout: type,
      deck: `${index + 1}번째 펼침면은 ‘${angle}’에 관한 교과서 자료와 지도서 수업 관점을 연결한다. 다음 펼침면과 중복되지 않는 근거 묶음으로 개념 설명, 사례 해석, 학습 활동을 구성한다.`,
      sections,
      visualBriefs: [
        `${angle}의 변화 또는 관계를 보여 주는 정보 그래픽`,
        `${request.sportMode === "none" ? evidenceRecord.title : reference.sport}의 실제 사례를 보여 주는 출처 확인 사진 또는 도해`,
        `${sectionTitles.slice(0, 3).join("·")}을 비교하는 표`,
      ],
    };
  }

  const SPECIAL_PAGE_COPY = {
    "unit-intro": {
      role: "대단원 도입",
      titles: ["단원을 여는 장면", "핵심 질문", "배울 내용", "나의 학습 계획"],
      paragraphs: [
        "스포츠는 경기 결과만으로 설명되지 않는다. 같은 경기를 보더라도 선수, 심판, 관중, 운영자와 미디어는 서로 다른 장면에 주목하며, 시대와 사회에 따라 중요하게 여기는 가치도 달라진다. 이 단원에서는 익숙한 스포츠 장면을 문화의 관점으로 다시 읽는다.",
        "우리가 자연스럽다고 생각하는 스포츠의 규칙과 관습은 언제, 누구에 의해 만들어졌을까? 그 과정에서 얻는 이익과 감수하는 부담은 누구에게 돌아가는지 질문하면 단원의 탐구 방향을 세울 수 있다.",
        "각 소단원에서는 핵심 개념을 익히고 역사·기사·영상·경기 기록을 비교한다. 이어 실제 참여나 역할 관찰에서 증거를 모으고, 자료의 설명과 경험이 일치하거나 충돌하는 지점을 찾아 자신의 판단을 수정한다.",
        "단원을 시작하기 전에 알고 있는 내용, 더 알아보고 싶은 문제, 참여할 수 있는 역할을 기록한다. 학습이 끝난 뒤 처음의 생각과 비교할 수 있도록 판단의 근거도 함께 남긴다.",
      ],
    },
    "unit-closing": {
      role: "대단원 마무리",
      titles: ["핵심 개념 연결", "학습 증거 정리", "종합 적용", "성찰과 다음 실천"],
      paragraphs: [
        "단원에서 다룬 개념을 낱말 뜻으로만 기억하지 말고 서로의 관계로 설명한다. 개인의 행동, 집단의 관습, 경기의 규칙과 제도, 사회적 가치가 하나의 스포츠 장면에서 어떻게 연결되는지 개념 지도로 나타내면 학습의 구조를 확인할 수 있다.",
        "소단원별 자료 분석표, 참여 기록, 토론 결과와 산출물을 다시 살펴본다. 처음의 주장과 최종 판단이 달라졌다면 어떤 자료나 경험이 변화를 만들었는지 표시하고, 근거가 부족한 판단은 추가 자료를 찾아 보완한다.",
        "새로운 스포츠 문화 사례를 하나 정해 단원에서 배운 분석 기준을 적용한다. 사실과 가치 판단을 구분하고, 여러 참여자의 관점과 안전·공정성·포용성에 미치는 영향을 검토한 뒤 실행 가능한 개선안을 제안한다.",
        "자신이 잘 설명할 수 있는 내용과 더 연습해야 할 과정을 구분한다. 다음 스포츠 참여에서 실천할 행동을 구체적인 상황과 함께 정하고, 동료의 피드백을 반영하여 결과물의 주장·근거·표현 방식을 수정한다.",
        "종합 결과물은 성취기준의 지식·이해, 과정·기능, 가치·태도가 함께 드러나는지 확인한다. 단순한 소감보다 관찰하거나 조사한 증거를 제시하고, 자신의 제안이 다른 사람에게 미칠 영향과 한계까지 설명해야 한다.",
        "마지막으로 단원 핵심 질문에 다시 답한다. 처음 답과 달라진 부분, 여전히 판단하기 어려운 부분, 다른 단원에서 이어 탐구할 질문을 각각 기록하면 학습 결과가 다음 경험으로 연결된다. 답변에는 가장 설득력 있었던 자료와 실제 참여에서 확인한 장면을 하나씩 제시한다.",
      ],
    },
    special: {
      role: "특별 페이지",
      titles: ["주제 만나기", "자료 깊이 읽기", "관점 넓히기", "결과 만들기"],
      paragraphs: [
        "이 페이지는 본문에서 다룬 스포츠 문화의 개념을 새로운 자료와 상황에 적용하는 확장 지면이다. 자료를 보기 전에 제목과 출처를 확인하고, 이미 알고 있는 사실과 확인이 필요한 추측을 구분하여 읽기의 목적을 세운다.",
        "제시된 인물·기사·통계·작품·경기 장면에서 핵심 주장과 근거를 찾는다. 자료가 만들어진 시기와 목적, 주요 독자를 확인하고, 같은 현상을 다르게 설명할 수 있는 자료가 무엇인지 함께 검토한다.",
        "선수뿐 아니라 심판, 관중, 운영자, 지역 주민, 미디어와 소외된 참여자의 관점에서 의미와 영향을 비교한다. 안전·공정성·포용성·지속 가능성 가운데 이 주제를 판단하는 데 필요한 기준을 선택한다.",
        "분석 결과를 비평문, 카드 뉴스, 안전 안내, 진로 지도, 프로젝트 계획서 또는 수행평가 결과물로 구성한다. 주장마다 확인 가능한 근거를 연결하고, 실행 과정에서 생길 수 있는 한계와 수정 방법을 함께 제시한다.",
        "완성한 결과물은 정보의 정확성, 관점의 다양성, 실현 가능성, 표현의 명료성을 기준으로 검토한다. 동료 의견 중 반영한 내용과 반영하지 않은 내용의 이유를 기록하여 최종 결과의 책임성을 높인다. 사용한 자료의 출처와 이미지 활용 조건도 마지막에 다시 확인한다.",
      ],
    },
  };

  const SPECIAL_PAGE_CONTINUATION_COPY = {
    "unit-intro": {
      role: "대단원 도입",
      titles: ["단원 전체 지도", "소단원 연결", "학습 방법 선택", "결과물 미리 보기"],
      paragraphs: [
        "단원 전체 지도에서는 소단원들이 어떤 순서와 관계로 이어지는지 살핀다. 먼저 개념과 역사적 맥락을 이해하고, 자료 분석과 스포츠 참여를 거쳐 비평·창작·평가로 확장되는 흐름을 확인하면 각 차시의 학습 목적을 예측할 수 있다.",
        "소단원은 서로 떨어진 주제가 아니다. 앞에서 익힌 개념은 다음 자료를 읽는 기준이 되고, 참여 과정에서 발견한 문제는 뒤의 토론과 프로젝트 주제가 된다. 화살표와 핵심어를 사용해 자신이 예상한 연결 관계를 표시한다.",
        "학습 내용에 따라 읽기, 조사, 토론, 직접 참여, 심판·기록·운영 역할 가운데 적절한 방법을 선택한다. 신체활동 참여가 어려운 상황에서도 관찰과 분석, 미디어와 기록 역할을 통해 같은 성취기준에 도달할 수 있다.",
        "단원이 끝날 때 완성할 결과물과 평가 기준을 미리 확인한다. 자료 출처, 참여 증거, 관점의 변화, 안전과 포용을 보여 주는 기록을 학습 과정에서 꾸준히 모으면 마지막 과제가 단순한 소감문에 머물지 않는다.",
      ],
    },
    "unit-closing": {
      role: "대단원 마무리",
      titles: ["결과물 공유", "관점 비교", "피드백 반영", "단원 밖으로 확장"],
      paragraphs: [
        "완성한 결과물을 공유할 때는 결론만 발표하지 않고 질문을 정한 이유, 사용한 자료, 참여 과정, 판단이 바뀐 지점을 함께 설명한다. 듣는 사람은 주장과 근거가 연결되는지 확인하고 추가로 필요한 증거를 구체적으로 제안한다.",
        "같은 스포츠 현상을 다룬 결과물도 관점에 따라 결론이 달라질 수 있다. 선수·심판·관중·운영자·미디어·지역 사회의 입장을 비교하고, 어떤 목소리가 충분히 반영되지 않았는지 찾아 해석의 범위를 넓힌다.",
        "동료 피드백은 맞고 틀림을 판정하는 말이 아니라 결과물을 개선할 수 있는 정보여야 한다. 사실 오류, 근거 부족, 관점의 편중, 실행상의 위험을 구분해 기록하고 수정 우선순위를 정한다.",
        "수정한 결과물에서는 무엇을 왜 바꾸었는지 표시한다. 반영하지 않은 제안도 이유를 설명하고, 자료의 한계나 학교 환경 때문에 실행하지 못한 부분은 이후 확인할 과제로 남긴다.",
        "학교 밖의 경기, 지역 축제, 온라인 스포츠 콘텐츠에서 비슷한 문화 현상을 찾아 단원에서 만든 분석 기준을 적용한다. 교실에서 세운 판단이 다른 공간과 참여자에게도 타당한지 확인하면 개념의 적용 범위와 한계를 알 수 있다.",
        "단원 학습을 마친 뒤 일상에서 바꾸고 싶은 스포츠 참여 행동을 하나 정한다. 행동을 실천할 상황, 함께할 사람, 예상되는 어려움과 확인할 증거를 적어 학습 결과를 실제 문화 변화로 이어 간다. 일정 기간 실천한 뒤 변화가 있었는지 기록하고 필요하면 계획을 다시 조정한다.",
      ],
    },
    special: {
      role: "특별 페이지",
      titles: ["사례 확장", "새 자료 비교", "실행 조건 점검", "공유와 환류"],
      paragraphs: [
        "앞 펼침면에서 세운 판단을 다른 스포츠와 시대의 사례에 적용한다. 두 사례의 공통점과 차이점을 문화적 배경, 참여자, 규칙과 제도의 측면으로 나누어 비교한다.",
        "새 자료가 기존 결론을 강화하는지 반박하는지 확인한다. 수치와 인용문의 맥락을 살피고, 서로 다른 출처가 같은 사건을 다르게 설명한다면 차이가 생긴 원인을 기록한다.",
        "제안이나 결과물을 실제로 적용하는 데 필요한 시간, 공간, 비용, 역할, 안전 조건을 점검한다. 실행하기 어려운 부분은 목적을 유지하면서 규모나 절차를 조정한다.",
        "공유 후 받은 질문을 정보 확인, 관점 보완, 실행 개선으로 분류한다. 가장 중요한 의견을 반영해 최종본을 수정하고 다음 활동에서 확인할 과제를 남긴다.",
      ],
    },
  };

  function specialPageManuscriptFor(request, traceability, index = 0) {
    const copies = index === 0 ? SPECIAL_PAGE_COPY : SPECIAL_PAGE_CONTINUATION_COPY;
    const copy = copies[request.pageRole] || copies.special;
    const title = request.smallUnit.smallTitle;
    const paragraphs = copy.paragraphs;
    return {
      headline: `${title}${index ? ` — 확장 ${index + 1}` : ""}`,
      learningGoal: `${copy.role}의 자료와 활동을 통해 ${traceability.knowledge.slice(0, 2).join("·")}의 관계를 설명할 수 있다.`,
      openingQuestion: Number(request.styleValue ?? 50) < 34 ? "" : `${title}에서 주목해야 할 스포츠 문화의 질문은 무엇인가?`,
      layout: request.pageRole,
      deck: `${copy.role}의 목적에 맞춰 앞뒤 소단원의 학습을 연결하고, 학생이 남길 학습 증거를 분명히 제시한다.`,
      sections: copy.titles.map((sectionTitle, index) => ({
        number: index + 1,
        title: sectionTitle,
        paragraphs: request.pageRole === "unit-closing"
          ? (index < 2 ? [paragraphs[index]] : [paragraphs[index], paragraphs[index + 2]].filter(Boolean))
          : [paragraphs[index], ...(index === 3 && paragraphs[4] ? [paragraphs[4]] : [])],
      })),
      visualBriefs: [`${title}의 대표 장면을 보여 주는 큰 사진`, "핵심 개념과 소단원 관계를 보여 주는 안내도", "학생 기록 또는 결과물 예시"],
    };
  }

  const DECIMAL_POINT_GUARD = "";

  function removeRepeatedManuscriptSentences(spreads) {
    const seen = new Set();
    spreads.forEach((spread) => {
      const manuscript = spread.textbook_manuscript;
      if (!manuscript?.sections) return;
      manuscript.sections.forEach((section) => {
        section.paragraphs = section.paragraphs.map((paragraph) => {
          const guarded = String(paragraph).replace(/(\d)\.(\d)/g, `$1${DECIMAL_POINT_GUARD}$2`);
          const sentences = guarded.match(/[^.!?]+[.!?]?/g) || [];
          return sentences.filter((sentence) => {
            const normalized = sentence.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
            if (normalized.length < 35) return true;
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
          }).join(" ").trim().split(DECIMAL_POINT_GUARD).join(".");
        }).filter(Boolean);
      });
    });
    return spreads;
  }

  function manuscriptDensityRange(pageRole, primaryType) {
    if (pageRole === "unit-intro") return { minimum: 300, recommendedMaximum: 700, label: "대단원 도입" };
    if (pageRole === "middle-intro") return { minimum: 500, recommendedMaximum: 900, label: "중단원 도입" };
    if (pageRole === "unit-closing") return { minimum: 700, recommendedMaximum: 1200, label: "대단원 마무리" };
    if (pageRole?.startsWith("special-")) return { minimum: 600, recommendedMaximum: 1400, label: "특별 페이지" };
    if (primaryType === "practice") return { minimum: 900, recommendedMaximum: 1400, label: "실기형" };
    return { minimum: 1400, recommendedMaximum: 1800, label: "이론형" };
  }

  function manuscriptQualityFor(spreads, pageRole, primaryType) {
    const paragraphs = spreads.flatMap((spread) => spread.textbook_manuscript?.sections?.flatMap((section) => section.paragraphs) || []);
    const sentences = paragraphs.flatMap((paragraph) => String(paragraph).match(/[^.!?]+[.!?]?/g) || [])
      .map((sentence) => sentence.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, ""))
      .filter((sentence) => sentence.length >= 35);
    const spreadCharacterCounts = spreads.map((spread) => (spread.textbook_manuscript?.sections || []).flatMap((section) => section.paragraphs).join("").length);
    const densityTarget = manuscriptDensityRange(pageRole, primaryType);
    return {
      spreadCharacterCounts,
      duplicateSentenceCount: sentences.length - new Set(sentences).size,
      densityTarget,
      belowMinimumCount: spreadCharacterCounts.filter((count) => count < densityTarget.minimum).length,
    };
  }

  function internalGenerate(request) {
    if (request.profileId !== SPORTS_CULTURE_PROFILE.id) throw new Error("내부 제공자는 현재 스포츠 문화 프로필만 지원합니다.");
    const sportMode = ["none", "examples", "primary"].includes(request.sportMode) ? request.sportMode : "primary";
    if (sportMode !== "none" && (!request.carrierSport || !String(request.carrierSport).trim())) throw new Error("사례 또는 주 종목을 사용하는 초안에는 선택 종목이 1개 이상 필요합니다.");
    if (sportMode === "primary" && String(request.carrierSport).split(",").filter((item) => item.trim()).length > 1) throw new Error("주 종목 중심 초안에는 종목을 하나만 선택해야 합니다.");
    const traceability = traceabilityFor(request.smallUnit);
    const primaryType = TYPE_PHASES[request.primaryType] ? request.primaryType : "theory";
    const secondaryType = MODE_PHASE[request.secondaryType] ? request.secondaryType : null;
    const supportMode = ["activity", "concept"].includes(request.supportMode) ? request.supportMode : "";
    const pageRole = request.pageRole || "small-unit";
    const phaseIds = [...TYPE_PHASES[primaryType]];
    if (secondaryType) phaseIds[phaseIds.length - 2] = MODE_PHASE[secondaryType];
    if (supportMode === "activity" && primaryType === "theory") phaseIds[phaseIds.length - 2] = "participation";
    if (supportMode === "concept" && primaryType === "practice") phaseIds[1] = "evidence";
    const spreadCount = Math.max(1, Math.round((Number(request.smallUnit.pages) || 2) / 2));
    const spreads = Array.from({ length: spreadCount }, (_, index) => {
      const phaseId = phaseIds[index % phaseIds.length];
      const phase = PHASES.find((candidate) => candidate.id === phaseId) || PHASES[0];
      const textbookManuscript = pageRole === "small-unit"
        ? textbookManuscriptFor(phase, request, traceability, index)
        : specialPageManuscriptFor(request, traceability, index);
      return {
        left_page: index * 2 + 1,
        right_page: index * 2 + 2,
        layout_template: phase.template,
        role: phase.role,
        content_type: primaryType,
        content_type_label: TYPE_LABELS[primaryType],
        page_role: pageRole,
        title: `${request.smallUnit.smallTitle} · ${phase.role}`,
        intro: sportMode === "none"
          ? `${traceability.knowledge.join("·")}의 개념과 문화적 맥락을 탐구합니다. 이번 펼침면에서는 ${phase.role}을 중심으로 자료와 관점을 연결합니다.`
          : sportMode === "examples"
            ? `${request.carrierSport} 사례를 비교하여 ${traceability.knowledge.join("·")}을 탐구합니다. 사례의 공통점과 차이를 구분해 문화적 의미를 해석합니다.`
            : `${request.carrierSport}를 주 종목으로 ${traceability.knowledge.join("·")}을 탐구합니다. 이번 펼침면에서는 ${phase.role}을 중심으로 직접 참여와 문화적 해석을 연결합니다.`,
        activities: activitiesFor(phase, request, traceability, index),
        support_boxes: supportBoxes(phase, traceability, sportReferenceFor(request.carrierSport, sportMode).sport, request.metrics),
        wrap_up: `${traceability.standardCodes.join(", ")}에 비추어 활동에서 확인한 근거와 다음 실천을 기록합니다.`,
        textbook_manuscript: textbookManuscript,
        teacher_guide: teacherGuideFor(phase, request, traceability, index, textbookManuscript),
      };
    });
    removeRepeatedManuscriptSentences(spreads);
    return {
      schemaVersion: SCHEMA_VERSION,
      provider: { id: INTERNAL_PROVIDER_ID, label: "내부 데이터 조합", mode: "local-deterministic" },
      frameworkName: request.framework.name,
      smallUnitLabel: `${request.smallUnit.domain} · ${request.smallUnit.middleTitle} · ${request.smallUnit.smallTitle}`,
      instruction: sportMode === "none" ? "특정 종목에 종속되지 않는 개념·자료 탐구 결과를 성취기준에 근거하여 비평·성찰합니다." : sportMode === "examples" ? `${request.carrierSport}의 사례를 비교하되 한 종목의 규칙을 다른 종목에 일반화하지 않습니다.` : `${request.carrierSport}의 실제 경기 참여와 문화 자료 탐구를 연결하고, 결과를 성취기준에 근거하여 비평·성찰합니다.`,
      carrierSport: request.carrierSport,
      sportMode,
      primaryType,
      primaryTypeLabel: TYPE_LABELS[primaryType],
      secondaryType,
      secondaryTypeLabel: secondaryType ? request.secondaryType : null,
      supportMode,
      pageRole,
      traceability,
      sourceEvidence: sourceEvidenceFor(request),
      manuscriptQuality: manuscriptQualityFor(spreads, pageRole, primaryType),
      teacherGuide: {
        principle: "확정된 교과서 펼침면과 동일한 성취기준·활동·평가 데이터를 사용해 차시 수업안을 파생합니다.",
        annualPlanLink: `${request.smallUnit.hours || 0}차시 · ${request.smallUnit.pages || 0}쪽`,
      },
      spreads,
    };
  }

  registerProvider({
    id: INTERNAL_PROVIDER_ID,
    label: "내부 데이터 조합",
    mode: "local-deterministic",
    description: "전처리된 교육과정 규칙과 공통 편집 패턴을 외부 API 없이 조합합니다.",
    generate: internalGenerate,
  });

  const EXTERNAL_AI_PROVIDER_ID = "external-ai-v1";

  const REQUEST_TIMEOUT_MS = 55000;

  async function postJsonForManuscript(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("서버 응답이 너무 오래 걸려 요청을 취소했습니다. 잠시 후 다시 시도해 주세요.");
      throw error;
    } finally {
      clearTimeout(timer);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      throw new Error(payload.error || `AI 원고 생성 요청이 실패했습니다(HTTP ${response.status}).`);
    }
    return payload.result;
  }

  const IMAGE_GENERATION_CONCURRENCY = 3;

  async function fillVisualImages(manuscripts, onProgress) {
    const items = [];
    manuscripts.forEach((manuscript) => {
      if (!manuscript?.visuals) return;
      ["left", "right"].forEach((side) => {
        (manuscript.visuals[side] || []).forEach((item) => items.push(item));
      });
    });
    let cursor = 0;
    let completed = 0;
    async function worker() {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        try {
          const result = await postJsonForManuscript("/api/prototype/sports-culture-image", {
            description: item.description,
            size: item.size,
          });
          item.imageBase64 = result.imageBase64;
        } catch (error) {
          item.imageError = error?.message || "이미지 생성에 실패했습니다.";
        } finally {
          completed += 1;
          onProgress?.(completed, items.length);
        }
      }
    }
    const workerCount = Math.min(IMAGE_GENERATION_CONCURRENCY, items.length);
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }

  async function externalAiGenerate(request) {
    if (request.profileId !== SPORTS_CULTURE_PROFILE.id) throw new Error("AI 생성 제공자는 현재 스포츠 문화 프로필만 지원합니다.");
    const sportMode = ["none", "examples", "primary"].includes(request.sportMode) ? request.sportMode : "primary";
    if (sportMode !== "none" && (!request.carrierSport || !String(request.carrierSport).trim())) throw new Error("사례 또는 주 종목을 사용하는 초안에는 선택 종목이 1개 이상 필요합니다.");
    if (sportMode === "primary" && String(request.carrierSport).split(",").filter((item) => item.trim()).length > 1) throw new Error("주 종목 중심 초안에는 종목을 하나만 선택해야 합니다.");
    const traceability = traceabilityFor(request.smallUnit);
    const primaryType = TYPE_PHASES[request.primaryType] ? request.primaryType : "theory";
    const secondaryType = MODE_PHASE[request.secondaryType] ? request.secondaryType : null;
    const supportMode = ["activity", "concept"].includes(request.supportMode) ? request.supportMode : "";
    const pageRole = request.pageRole || "small-unit";
    const phaseIds = [...TYPE_PHASES[primaryType]];
    if (secondaryType) phaseIds[phaseIds.length - 2] = MODE_PHASE[secondaryType];
    if (supportMode === "activity" && primaryType === "theory") phaseIds[phaseIds.length - 2] = "participation";
    if (supportMode === "concept" && primaryType === "practice") phaseIds[1] = "evidence";
    const spreadCount = Math.max(1, Math.round((Number(request.smallUnit.pages) || 2) / 2));
    const reference = sportReferenceFor(request.carrierSport, sportMode);

    let manuscripts;
    let sectionTitlesBySpread;
    if (pageRole === "small-unit") {
      const evidenceRecord = evidenceRecordFor(request.smallUnit);
      if (!evidenceRecord || !evidenceRecord.evidence?.length) {
        throw new Error(`‘${request.smallUnit.smallTitle}’에 연결된 전처리 근거가 없습니다. 소단원 제목 또는 성취기준 연결을 먼저 확인해 주세요.`);
      }
      const angles = UNIT_CONTENT_PLANS[evidenceRecord.title];
      if (!angles) throw new Error(`‘${evidenceRecord.title}’의 집필 브리프가 아직 구성되지 않았습니다.`);
      const thesis = UNIT_THESES[evidenceRecord.title];
      const textbookEvidence = evidenceRecord.evidence.filter((item) => item.documentType === "교과서");
      const guideEvidence = evidenceRecord.evidence.filter((item) => item.documentType === "지도서");
      const pool = [...textbookEvidence, ...guideEvidence];
      const standardCode = traceability.standardCodes[0];
      const context = STANDARD_CONTEXT[standardCode] || STANDARD_CONTEXT["[12스문01-01]"];
      const blueprintRows = MANUSCRIPT_BLUEPRINTS[primaryType] || MANUSCRIPT_BLUEPRINTS.theory;
      const spreadInputs = Array.from({ length: spreadCount }, (_, index) => {
        const angle = angles[index % angles.length];
        const blueprint = blueprintRows[index % blueprintRows.length];
        const windowSize = Math.min(5, pool.length);
        const windowStart = pool.length ? (index * 5) % pool.length : 0;
        const evidenceWindow = Array.from({ length: windowSize }, (_, offset) => pool[(windowStart + offset) % pool.length]);
        const guideWindow = guideEvidence.length ? [guideEvidence[index % guideEvidence.length]] : [];
        return {
          index,
          angle,
          sectionTitles: blueprint.titles,
          evidence: [...evidenceWindow, ...guideWindow].map((item) => ({ documentType: item.documentType, excerpt: item.text })),
        };
      });
      sectionTitlesBySpread = spreadInputs.map((item) => item.sectionTitles);
      const responses = await Promise.all(spreadInputs.map((spreadInput) => postJsonForManuscript("/api/prototype/sports-culture-manuscript", {
        smallUnit: request.smallUnit,
        primaryType,
        supportMode,
        carrierSport: request.carrierSport,
        sportMode,
        styleLabel: request.framework?.name || "균형형",
        thesis,
        standardContext: context,
        sportReference: sportMode === "none" ? null : reference,
        spreads: [spreadInput],
      })));
      manuscripts = responses.map((response, index) => {
        const aiSpread = response.spreads[0];
        return {
          headline: aiSpread.headline,
          learningGoal: aiSpread.learning_goal,
          openingQuestion: aiSpread.opening_question,
          layout: primaryType,
          deck: aiSpread.deck,
          sections: aiSpread.sections.map((section, sectionIndex) => ({
            number: sectionIndex + 1,
            title: sectionTitlesBySpread[index][sectionIndex],
            paragraphs: section.paragraphs,
          })),
          visuals: { left: aiSpread.left_visuals || [], right: aiSpread.right_visuals || [] },
        };
      });
    } else {
      const unitTitles = Object.keys(UNIT_CONTENT_PLANS);
      const domainUnits = String(request.smallUnit.domain || "").includes("경기") ? unitTitles.slice(9) : unitTitles.slice(0, 9);
      const evidencePool = domainUnits.flatMap((title) => (global.SPORTS_CULTURE_EVIDENCE?.units?.[title]?.evidence || []).filter((item) => item.documentType === "교과서"));
      const spreadInputs = Array.from({ length: spreadCount }, (_, index) => {
        const copies = index === 0 ? SPECIAL_PAGE_COPY : SPECIAL_PAGE_CONTINUATION_COPY;
        const copy = copies[pageRole] || copies.special;
        const windowSize = Math.min(5, evidencePool.length);
        const windowStart = evidencePool.length ? (index * 5) % evidencePool.length : 0;
        const evidenceWindow = Array.from({ length: windowSize }, (_, offset) => evidencePool[(windowStart + offset) % evidencePool.length]);
        return {
          index,
          angle: copy.role,
          sectionTitles: copy.titles,
          evidence: evidenceWindow.map((item) => ({ documentType: item.documentType, excerpt: item.text })),
        };
      });
      const standardCode = traceability.standardCodes[0];
      const context = STANDARD_CONTEXT[standardCode] || STANDARD_CONTEXT["[12스문01-01]"];
      const responses = await Promise.all(spreadInputs.map((spreadInput) => postJsonForManuscript("/api/prototype/sports-culture-manuscript", {
        smallUnit: request.smallUnit,
        primaryType,
        supportMode,
        carrierSport: request.carrierSport,
        sportMode,
        styleLabel: request.framework?.name || "균형형",
        thesis: `${request.smallUnit.domain || "스포츠 문화"} 대단원의 ${spreadInput.angle}`,
        standardContext: context,
        sportReference: sportMode === "none" ? null : reference,
        pageRole,
        spreads: [spreadInput],
      })));
      manuscripts = responses.map((response, index) => {
        const aiSpread = response.spreads[0];
        return {
          headline: aiSpread.headline,
          learningGoal: aiSpread.learning_goal,
          openingQuestion: aiSpread.opening_question,
          layout: pageRole,
          deck: aiSpread.deck,
          sections: aiSpread.sections.map((section, sectionIndex) => ({
            number: sectionIndex + 1,
            title: spreadInputs[index].sectionTitles[sectionIndex],
            paragraphs: section.paragraphs,
          })),
          visuals: { left: aiSpread.left_visuals || [], right: aiSpread.right_visuals || [] },
        };
      });
    }
    if (request.includeImages) await fillVisualImages(manuscripts, request.onImageProgress);

    const spreads = Array.from({ length: spreadCount }, (_, index) => {
      const phaseId = phaseIds[index % phaseIds.length];
      const phase = PHASES.find((candidate) => candidate.id === phaseId) || PHASES[0];
      const textbookManuscript = manuscripts[index];
      return {
        left_page: index * 2 + 1,
        right_page: index * 2 + 2,
        layout_template: phase.template,
        role: phase.role,
        content_type: primaryType,
        content_type_label: TYPE_LABELS[primaryType],
        page_role: pageRole,
        title: `${request.smallUnit.smallTitle} · ${phase.role}`,
        intro: sportMode === "none"
          ? `${traceability.knowledge.join("·")}의 개념과 문화적 맥락을 탐구합니다. 이번 펼침면에서는 ${phase.role}을 중심으로 자료와 관점을 연결합니다.`
          : sportMode === "examples"
            ? `${request.carrierSport} 사례를 비교하여 ${traceability.knowledge.join("·")}을 탐구합니다. 사례의 공통점과 차이를 구분해 문화적 의미를 해석합니다.`
            : `${request.carrierSport}를 주 종목으로 ${traceability.knowledge.join("·")}을 탐구합니다. 이번 펼침면에서는 ${phase.role}을 중심으로 직접 참여와 문화적 해석을 연결합니다.`,
        activities: activitiesFor(phase, request, traceability, index),
        support_boxes: supportBoxes(phase, traceability, reference.sport, request.metrics),
        wrap_up: `${traceability.standardCodes.join(", ")}에 비추어 활동에서 확인한 근거와 다음 실천을 기록합니다.`,
        textbook_manuscript: textbookManuscript,
        teacher_guide: teacherGuideFor(phase, request, traceability, index, textbookManuscript),
      };
    });
    removeRepeatedManuscriptSentences(spreads);
    return {
      schemaVersion: SCHEMA_VERSION,
      provider: { id: EXTERNAL_AI_PROVIDER_ID, label: "AI 실시간 생성(OpenAI)", mode: "external-api" },
      frameworkName: request.framework.name,
      smallUnitLabel: `${request.smallUnit.domain} · ${request.smallUnit.middleTitle} · ${request.smallUnit.smallTitle}`,
      instruction: sportMode === "none" ? "특정 종목에 종속되지 않는 개념·자료 탐구 결과를 성취기준에 근거하여 비평·성찰합니다." : sportMode === "examples" ? `${request.carrierSport}의 사례를 비교하되 한 종목의 규칙을 다른 종목에 일반화하지 않습니다.` : `${request.carrierSport}의 실제 경기 참여와 문화 자료 탐구를 연결하고, 결과를 성취기준에 근거하여 비평·성찰합니다.`,
      carrierSport: request.carrierSport,
      sportMode,
      primaryType,
      primaryTypeLabel: TYPE_LABELS[primaryType],
      secondaryType,
      secondaryTypeLabel: secondaryType ? request.secondaryType : null,
      supportMode,
      pageRole,
      traceability,
      sourceEvidence: sourceEvidenceFor(request),
      manuscriptQuality: manuscriptQualityFor(spreads, pageRole, primaryType),
      teacherGuide: {
        principle: "확정된 교과서 펼침면과 동일한 성취기준·활동·평가 데이터를 사용해 차시 수업안을 파생합니다.",
        annualPlanLink: `${request.smallUnit.hours || 0}차시 · ${request.smallUnit.pages || 0}쪽`,
      },
      spreads,
    };
  }

  registerProvider({
    id: EXTERNAL_AI_PROVIDER_ID,
    label: "AI 실시간 생성 (OpenAI)",
    mode: "external-api",
    description: "선택한 종목·소단원·전체 스타일과 전처리 근거를 서버의 OpenAI API로 보내 매번 새로 집필합니다.",
    generate: externalAiGenerate,
  });

  async function generateDraftSet(request) {
    const provider = providers.get(request.providerId || INTERNAL_PROVIDER_ID);
    if (!provider) throw new Error(`사용할 수 없는 생성 제공자입니다: ${request.providerId}`);
    const entries = [];
    for (const framework of request.frameworks) {
      const result = await provider.generate({ ...request, framework, metrics: request.metricsByFramework[framework.id] });
      if (!Array.isArray(result.spreads) || !result.spreads.length) throw new Error("생성 결과에 펼침면이 없습니다.");
      entries.push({ frameworkId: framework.id, ...result });
    }
    return { provider: { id: provider.id, label: provider.label, mode: provider.mode }, entries };
  }

  const api = {
    schemaVersion: SCHEMA_VERSION,
    internalProviderId: INTERNAL_PROVIDER_ID,
    externalAiProviderId: EXTERNAL_AI_PROVIDER_ID,
    sportsCultureProfile: () => clone(SPORTS_CULTURE_PROFILE),
    providerOptions,
    registerProvider,
    generateDraftSet,
    resolveStandardCodes,
  };

  global.TEXTBOOK_DRAFT_ENGINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
