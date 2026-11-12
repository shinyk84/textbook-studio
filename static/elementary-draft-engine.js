// 초등 체육 초안 생성기.
// 업무 흐름(생성 제공자·전체 스타일·대상 일괄 선택·회차 이력·파일 출력)은 스포츠 문화 생성기와
// 같은 계약(TEXTBOOK_DRAFT_ENGINE.generateDraftSet)을 쓰고, 내용 구조만 초등 체육 교과서·지도서의
// 공통 골격을 따른다 — 펼침면 1개 = 1~3차시, "생각 열기 → 활동 1·2(·3) → 확인해요",
// 준비물·안전·도움말 코너, 지도서는 차시별 40분 수업 흐름과 수준별·대체 활동을 파생한다.
// 근거: docs/textbook-structure-analysis.md 2-3·2-4절, static/elementary-pe-evidence.js.
(function attachElementaryDraftEngine(global) {
  "use strict";

  const PROFILE_ID = "elementary-pe-2022";
  const SUBJECT_LABEL = "초등 체육";
  const LESSON_MINUTES = 40;

  const PHASES = {
    explore: { role: "알아보기", template: "탐색형" },
    practice: { role: "기능 익히기", template: "기본 기능형" },
    challenge: { role: "도전하기", template: "도전·기록형" },
    check: { role: "기록·점검", template: "탐구·평가형" },
    habit: { role: "생활 속 실천", template: "실천·계획형" },
    play: { role: "놀이·게임 적용", template: "게임·적용형" },
    strategy: { role: "기본 전략", template: "전략 탐구형" },
    game: { role: "게임 하기", template: "게임·적용형" },
    create: { role: "표현 만들기", template: "창작형" },
    perform: { role: "발표·감상", template: "발표·감상형" },
  };

  // 수업 유형 = 초등 교과서 소단원(주제 펼침면 묶음)이 실제로 따르는 활동 순서.
  // 5·6학년 전략형은 출판사 공통으로 "기본 기능 → 기본 전략 → 게임" 3단 펼침면이 굳어져 있다.
  const LESSON_TYPES = {
    fitness: { label: "체력 운동형", domain: "운동", phases: ["explore", "practice", "challenge", "check"], short: ["practice", "challenge"], description: "움직임 알아보기 → 익히기 → 내 수준에 맞게 도전 → 기록·점검" },
    health: { label: "건강·안전 실천형", domain: "운동", phases: ["explore", "habit", "check"], short: ["explore", "habit"], description: "생활 점검 → 실천 방법 → 실천 계획·기록" },
    skill: { label: "기능 익히기형", domain: "스포츠", phases: ["explore", "practice", "play"], short: ["practice", "play"], description: "움직임 탐색 → 기본 기능 연습 → 놀이·게임 적용" },
    game: { label: "게임·전략형", domain: "스포츠", phases: ["practice", "strategy", "game"], short: ["practice", "game"], description: "기본 기능 → 기본 전략 → 게임" },
    eco: { label: "생태·환경형", domain: "스포츠", phases: ["explore", "practice", "play"], short: ["explore", "play"], description: "환경·안전 알아보기 → 기본 기능 → 활동 즐기기" },
    expression: { label: "표현 창작형", domain: "표현", phases: ["explore", "create", "perform"], short: ["create", "perform"], description: "동작 탐색 → 표현 만들기 → 발표·감상" },
  };

  const CORNER_TYPES = [
    { id: "digital", label: "디지털 체육", summary: "영상 촬영·기록 앱·가상 체험 등 에듀테크로 움직임을 분석하는 확장 코너" },
    { id: "daily", label: "생활 속 체육", summary: "학교 밖·가족과 함께 실천하는 신체활동 확장 코너" },
    { id: "safety", label: "안전 특집", summary: "단원 활동의 위험 상황과 예방·대처 방법을 모은 코너" },
    { id: "citizen", label: "융합·시민", summary: "다른 교과·공동체 가치와 체육 활동을 연결하는 코너" },
    { id: "project", label: "영역 통합 프로젝트", summary: "운동·스포츠·표현 학습을 모아 모둠 결과물을 만드는 프로젝트" },
  ];

  const ASSESSMENT_METHODS = {
    운동: ["운동 기록지", "자기 평가 체크리스트", "실천 일지"],
    스포츠: ["기능 관찰 체크리스트", "게임 수행 관찰", "자기·동료 평가"],
    표현: ["표현 발표 관찰", "감상 기록지", "모둠 동료 평가"],
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hasBatchim(word) {
    const text = String(word || "").trim();
    const code = text.charCodeAt(text.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return false;
    return (code - 0xac00) % 28 !== 0;
  }

  function josa(word, withBatchim, withoutBatchim) {
    return `${word}${hasBatchim(word) ? withBatchim : withoutBatchim}`;
  }

  // "로/으로"는 받침 ㄹ이면 "로"를 쓴다.
  function withRo(word) {
    const text = String(word || "").trim();
    const code = text.charCodeAt(text.length - 1);
    if (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 8) return `${text}로`;
    return josa(text, "으로", "로");
  }

  function gradeNumber(target) {
    return Number.parseInt(target?.gradeLabel, 10) || 3;
  }

  function bandOf(target) {
    return gradeNumber(target) >= 5 ? "5~6학년군" : "3~4학년군";
  }

  // 3·4학년은 "~해 봐요", 5·6학년은 "~해 봅시다"로 활동 지시문의 말투를 나눈다.
  function voice(target) {
    const upper = gradeNumber(target) >= 5;
    return {
      upper,
      b: upper ? "봅시다" : "봐요",
      v: upper ? "해 봅시다" : "해 봐요",
      pick: (lower, higher) => (upper ? higher : lower),
    };
  }

  function activityName(target) {
    return String(target.sourceActivity || target.smallTitle || "활동")
      .replace(/^\d+(?:-\d+)*\.\s*/, "")
      .replace(/에 도전해요$/, "")
      .trim();
  }

  function gameName(activity) {
    return activity.replace(/\s*(게임|활동)$/, "").trim() || activity;
  }

  function curriculumStandards() {
    return global.PROTOTYPE_CURRICULUM_DATA?.standards || [];
  }

  function standardsOfDomain(band, domain) {
    return curriculumStandards().filter((standard) => standard.grade_band === band && standard.domain === domain);
  }

  function inferLessonType(target) {
    const text = `${target.subdomain || ""} ${target.middleTitle || ""} ${target.smallTitle || ""} ${target.sourceActivity || ""}`;
    if (target.domain === "표현") return "expression";
    // "건강 체력"(5·6 체력 운동)과 구분하려고 '건강' 한 낱말이 아니라 생활 습관·성장·안전 신호로 판단한다.
    if (target.domain === "운동") return /생활 습관|위생|식습관|자세|정서|체중|성장|성징|안전|사고|성 건강|관계|감정|산책|계단|맨손체조|운동기구/.test(text) ? "health" : "fitness";
    if (/생태|생활환경|자연환경|등산|캠핑|오리엔티어링|클라이밍|자전거|인라인|수상|설상|승마|민속놀이|골프|플라잉디스크|균형 잡고 이동|타고 버티기|잡고 오르기/.test(text)) return "eco";
    if (/전략|영역형|필드형|네트형|게임/.test(text)) return "game";
    return "skill";
  }

  function lessonTypeOptions(domain) {
    return Object.entries(LESSON_TYPES)
      .filter(([, type]) => !domain || type.domain === domain)
      .map(([id, type]) => ({ id, label: type.label, description: type.description }));
  }

  // 소단원 → 성취기준. 교육과정 '내용 요소(하위 영역)'와 성취기준 문장의 대응을 규칙으로 고정하고,
  // 마지막에 영역의 가치·태도 성취기준 1개를 붙인다(초등 교과서는 태도 기준을 모든 활동에 반복한다).
  function resolveStandards(target) {
    const band = bandOf(target);
    const domainStandards = standardsOfDomain(band, target.domain);
    const byCode = new Map(domainStandards.map((standard) => [standard.code, standard]));
    const explicit = (Array.isArray(target.standardCodes) ? target.standardCodes : []).filter((code) => byCode.has(code));
    if (explicit.length) return explicit.map((code) => byCode.get(code));
    const text = `${target.subdomain || ""} ${target.middleTitle || ""} ${target.sourceActivity || ""}`;
    const upper = band === "5~6학년군";
    const prefix = upper ? "6체" : "4체";
    const code = (area, number) => `[${prefix}${area}-${String(number).padStart(2, "0")}]`;
    let codes = [];
    if (target.domain === "운동") {
      if (upper) {
        if (/안전|사고|대처/.test(text)) codes = [code("01", 4), code("01", 6)];
        else if (/성장|성징|감정|관계|성 건강/.test(text)) codes = [code("01", 3), code("01", 6)];
        else codes = [code("01", 1), code("01", 2), code("01", 5)];
      } else if (/건강|습관|위생|식습관|자세|정서|체중|산책|계단|맨손체조|운동기구/.test(text)) {
        codes = [code("01", 3), code("01", 4), code("01", 6)];
      } else {
        codes = [code("01", 1), code("01", 2), code("01", 6)];
      }
    } else if (target.domain === "스포츠") {
      if (upper) {
        if (/전략|영역형|필드형|네트형/.test(text)) codes = [code("02", 5), code("02", 6), code("02", 11)];
        else if (/생태|생활환경|자연환경/.test(text)) codes = [code("02", 8), code("02", 9), code("02", 12)];
        else codes = [code("02", 2), code("02", 3), code("02", 10)];
      } else if (/전략형/.test(text)) codes = [code("02", 6), code("02", 9)];
      else if (/생태형/.test(text)) codes = [code("02", 7), code("02", 10)];
      else if (/기술형/.test(text)) codes = [code("02", 5), code("02", 8)];
      else codes = [code("02", 2), code("02", 3), code("02", 8)];
    } else if (target.domain === "표현") {
      if (upper) {
        if (/전통|민속/.test(text)) codes = [code("03", 4), code("03", 5), code("03", 8)];
        else if (/현대|댄스/.test(text)) codes = [code("03", 6), code("03", 7), code("03", 8)];
        else codes = [code("03", 2), code("03", 3), code("03", 8)];
      } else if (/모방|사물|인물|자연/.test(text)) codes = [code("03", 3), code("03", 7)];
      else if (/추상|언어|느낌|생각/.test(text)) codes = [code("03", 4), code("03", 7)];
      else if (/리듬|박자|강약|빠르기|패턴/.test(text)) codes = [code("03", 5), code("03", 7)];
      else if (/도구|줄|공|천|훌라후프/.test(text) && /도구/.test(`${target.subdomain} ${target.middleTitle}`)) codes = [code("03", 6), code("03", 7)];
      else codes = [code("03", 1), code("03", 2), code("03", 7)];
    }
    const resolved = codes.map((item) => byCode.get(item)).filter(Boolean);
    return resolved.length ? resolved : domainStandards.slice(0, 2);
  }

  function isAttitudeStandard(statement) {
    return /태도|실천한다|자신감|최선|존중|배려|협력|인정|아끼|감수성|아름다움|끈기|공감|관심을 갖고|수용/.test(statement)
      && !/방법을 파악|수행 방법|표현 방법/.test(statement);
  }

  function traceabilityFor(target, standards) {
    const knowledge = standards.filter((item) => /의미|이해|파악한다\.?$/.test(item.statement) && !/시도|수행|표현한다|익히/.test(item.statement) && !isAttitudeStandard(item.statement));
    const process = standards.filter((item) => /시도|수행|표현|익히|구성|측정|대처/.test(item.statement) && !isAttitudeStandard(item.statement));
    const values = standards.filter((item) => isAttitudeStandard(item.statement));
    return {
      standardCodes: standards.map((item) => item.code),
      standards: standards.map((item) => ({ code: item.code, statement: item.statement })),
      knowledge: knowledge.map((item) => item.statement),
      process: process.map((item) => item.statement),
      values: values.map((item) => item.statement),
      assessmentEvidence: ASSESSMENT_METHODS[target.domain] || ASSESSMENT_METHODS.스포츠,
      mandatoryChecks: ["차시 목표와 성취기준 연결", "안전 지도", "수준별 지도", "참여가 어려운 학생의 대체 활동", "과정 중심 평가"],
    };
  }

  function evidenceFor(target) {
    const record = global.ELEMENTARY_PE_EVIDENCE?.activities?.[`${bandOf(target)}|${target.sourceActivity}`];
    return record?.evidence || [];
  }

  function sourceEvidenceFor(target, evidence) {
    const curriculum = [{ id: "2022 개정 체육과 교육과정", role: `${bandOf(target)} ${target.domain} 영역 성취기준·내용 요소` }];
    return [
      ...curriculum,
      ...evidence.slice(0, 6).map((item) => ({
        id: `${item.publisher} ${item.grade}학년 ${item.documentType} ${item.physicalPage}쪽`,
        role: String(item.text || "").slice(0, 90),
      })),
    ];
  }

  function allocate(total, buckets) {
    const base = Math.floor(total / buckets);
    const rest = total - base * buckets;
    return Array.from({ length: buckets }, (_, index) => base + (index < rest ? 1 : 0));
  }

  // 소단원 차시를 펼침면에 나눈다. 초등 교과서는 펼침면 1개가 1~3차시를 맡는다.
  function lessonPlanFor(target, spreadCount) {
    const hours = Math.max(0, Number(target.hours) || 0);
    const start = Math.max(1, Number(target.lessonStart) || 1);
    const counts = allocate(hours, spreadCount);
    let cursor = start;
    return counts.map((count) => {
      const lessons = Array.from({ length: count }, (_, index) => cursor + index);
      cursor += count;
      const label = !lessons.length
        ? "차시 미배정(확장)"
        : lessons.length === 1 ? `${lessons[0]}차시` : `${lessons[0]}~${lessons[lessons.length - 1]}차시`;
      return { lessons, label };
    });
  }

  // 수업 유형의 활동 순서를 소단원 전체 활동 칸에 고르게 펼친다(처음·끝 단계는 항상 포함).
  function phasePlan(typeId, spreadCount, perSpread) {
    const type = LESSON_TYPES[typeId] || LESSON_TYPES.skill;
    const total = spreadCount * perSpread;
    // 펼침면 1개에 활동 2개뿐이면 단계 처음·끝(예: 알아보기·기록)만 남아 핵심 활동이 빠진다.
    // 이때는 출판사 교과서가 짧은 주제에 쓰는 핵심 2단계(익히기·적용)를 쓴다.
    const phases = total === 2 && type.phases.length > 2 ? type.short : type.phases;
    const sequence = Array.from({ length: total }, (_, index) => {
      if (total === 1) return phases[0];
      return phases[Math.round((index * (phases.length - 1)) / (total - 1))];
    });
    return Array.from({ length: spreadCount }, (_, spreadIndex) => sequence.slice(spreadIndex * perSpread, (spreadIndex + 1) * perSpread));
  }

  function styleKind(request) {
    const value = Number(request.styleValue ?? 50);
    if (value < 34) return "steady";
    if (value < 67) return "balanced";
    return "active";
  }

  function equipmentFor(target, typeId) {
    const text = `${target.sourceActivity} ${target.middleTitle} ${target.subdomain}`;
    if (/수영|헤엄|물|경영|수상/.test(text)) return ["킥판", "수영모", "물안경"];
    if (/라켓|배드민턴|테니스|탁구/.test(text)) return ["라켓", "셔틀콕 또는 공", "네트"];
    if (/축구|농구|핸드볼|럭비|하키|배구|족구|야구|던지기|차기|잡기|치기|공/.test(text)) return ["공", "콘", "모둠 조끼"];
    if (/매트|구르기|옆돌기|뜀틀|평균대/.test(text)) return ["매트", "뜀틀 또는 평균대", "안전 보조 매트"];
    if (/줄넘기|줄/.test(text)) return ["줄넘기", "음악", "스피커"];
    if (typeId === "expression") return ["음악", "스피커", "표현 도구(리본·천 등)"];
    if (typeId === "health") return ["점검표", "실천 기록표", "필기도구"];
    if (typeId === "eco") return ["안전 장비", "지도·안내 자료", "구급함"];
    return ["콘", "초시계", "기록지"];
  }

  function safetyFor(target, typeId, tone) {
    const text = `${target.sourceActivity} ${target.middleTitle}`;
    if (/수영|헤엄|물|경영|수상/.test(text)) return tone.pick("반드시 선생님과 안전 요원이 있는 곳에서만 물에 들어가요.", "반드시 지도자와 안전 요원이 있는 곳에서만 물에 들어갑니다.");
    if (typeId === "eco") return tone.pick("활동 장소의 위험한 곳과 날씨를 먼저 살피고, 정해진 구역에서만 활동해요.", "활동 장소의 위험 요소와 날씨를 먼저 확인하고, 안전 장비를 갖춘 뒤 정해진 구역에서만 활동합니다.");
    if (typeId === "expression") return tone.pick("주변 친구와 팔을 벌려 닿지 않을 만큼 거리를 두고 움직여요.", "주변 친구와 충분한 간격을 두고 미끄럽지 않은 바닥에서 움직입니다.");
    if (typeId === "game") return tone.pick("친구와 부딪히지 않게 앞을 보고 움직이고, 공이 날아오는 방향을 살펴요.", "상대와 몸이 부딪히지 않도록 거리를 지키고, 공과 도구가 날아오는 방향을 늘 확인합니다.");
    if (typeId === "health") return tone.pick("몸이 아프거나 불편하면 바로 선생님께 알려요.", "몸에 이상이 느껴지면 활동을 멈추고 바로 선생님께 알립니다.");
    return tone.pick("준비 운동으로 손목·발목을 충분히 풀고, 숨이 너무 차면 잠시 쉬어요.", "준비 운동으로 관절을 충분히 풀고, 무리하지 않는 범위에서 운동 강도를 조절합니다.");
  }

  function helpTipFor(target, typeId, tone) {
    if (typeId === "expression") return tone.pick("음악의 박자를 먼저 손뼉으로 익힌 뒤 몸으로 표현하면 쉬워요.", "동작의 크기·빠르기·방향을 바꾸면 같은 동작도 다른 느낌으로 표현할 수 있습니다.");
    if (typeId === "health") return tone.pick("작은 습관부터 하나씩 정해 매일 표시하면 꾸준히 실천할 수 있어요.", "실천 목표는 구체적인 시간과 횟수로 정해야 점검하기 쉽습니다.");
    if (typeId === "fitness") return tone.pick("숨을 참지 말고 자연스럽게 쉬면서 움직여요.", "호흡을 멈추지 말고, 처음에는 횟수보다 바른 자세에 집중합니다.");
    if (typeId === "game") return tone.pick("공을 가진 친구만 보지 말고 빈 곳을 찾아 움직여요.", "공을 가지지 않은 사람의 움직임이 득점 기회를 만듭니다.");
    return tone.pick("목표를 끝까지 보고, 움직인 뒤에는 바로 준비 자세로 돌아와요.", "목표를 끝까지 보고 동작을 마친 뒤 곧바로 준비 자세로 돌아옵니다.");
  }

  // 같은 단계가 한 소단원에 여러 번 나오면(예: 6차시 게임·전략형의 "기본 기능" 2칸) 같은 활동을
  // 되풀이하지 않도록 단계마다 변형을 2~3개 두고, 나온 순서대로 다음 변형을 쓴다.
  function activityVariants(phaseId, activity, tone, typeId) {
    const A = activity;
    const { b, v } = tone;
    const skillWord = ["game", "skill", "eco"].includes(typeId) ? "기능" : "움직임";
    const exploreSteps = {
      health: [
        `생활 속 ${A} 모습을 담은 그림을 보고 바른 모습과 고칠 모습을 찾아 ${b}.`,
        `${A}${hasBatchim(A) ? "이" : "가"} 건강에 왜 중요한지 친구와 이야기${v}.`,
        `나의 ${A} 습관을 점검표로 확인${v}.`,
      ],
      expression: [
        `${josa(A, "을", "를")} 살려 움직이는 친구들의 모습을 보고 어떤 느낌이 드는지 이야기${v}.`,
        `${josa(A, "을", "를")} 바꾸어 가며 걷기·뛰기·돌기 같은 기본 움직임을 해 ${b}.`,
        `가장 마음에 드는 움직임을 골라 친구에게 보여 ${b}.`,
      ],
      eco: [
        `${A}${hasBatchim(A) ? "을" : "를"} 하는 장소와 필요한 안전 장비를 그림으로 살펴 ${b}.`,
        `활동 장소에서 지켜야 할 안전 약속과 환경 보호 약속을 정${v}.`,
        `기본 자세를 천천히 따라 하며 몸의 균형을 확인${v}.`,
      ],
    }[typeId] || [
      `${josa(A, "을", "를")} 하는 그림이나 영상을 보고 어떤 움직임이 보이는지 이야기${v}.`,
      `${A}에 필요한 몸의 부분과 움직임 순서를 친구와 함께 찾아 ${b}.`,
      `천천히 따라 하며 ${A}의 기본 자세를 확인${v}.`,
    ];
    const variants = {
      explore: [
        { title: typeId === "eco" ? `${A}의 환경과 안전 알아보기` : typeId === "expression" ? `${josa(A, "을", "를")} 살려 움직임 탐색하기` : `${A} 알아보기`, steps: exploreSteps },
        { title: `${A} 움직임 따라 하기`, steps: [`그림 속 동작을 보고 순서대로 천천히 따라 ${v}.`, `빠르기와 방향을 바꾸어 다시 ${v}.`, `가장 어려웠던 동작과 그 까닭을 친구와 이야기${v}.`] },
        { title: `${A} 놀이로 몸 풀기`, steps: [`음악이나 신호에 맞추어 ${A} 동작으로 몸을 풀어 ${b}.`, `신호가 바뀌면 다른 동작으로 바꾸어 ${b}.`, `몸이 어떻게 달라졌는지 이야기${v}.`] },
      ],
      practice: [
        { title: `${A}의 기본 ${skillWord} 익히기`, steps: [`선생님의 시범을 보고 ${A}의 동작을 단계별로 따라 ${v}.`, `처음에는 천천히, 익숙해지면 조금 빠르게 반복${v}.`, `짝과 서로의 동작을 살펴보고 잘된 점과 고칠 점을 알려 ${b}.`] },
        { title: `짝과 함께 ${A} 연습하기`, steps: [`짝과 마주 보고 번갈아 가며 ${A} 동작을 연습${v}.`, `성공한 횟수를 세며 점점 거리나 속도를 늘려 ${b}.`, `어려운 동작은 짝과 함께 해결 방법을 찾아 ${b}.`] },
        { title: `${A} 연습 놀이`, steps: [`모둠별로 연습 놀이의 규칙을 정${v}.`, `정해진 시간 안에 성공 횟수를 늘려 ${b}.`, `가장 잘된 동작을 모둠 친구에게 보여 ${b}.`] },
      ],
      challenge: [
        { title: `내 수준에 맞게 ${A} 도전하기`, steps: [`쉬움·보통·어려움 단계 가운데 내 수준에 맞는 도전 단계를 골라 ${b}.`, `정해진 시간이나 횟수 동안 ${A}에 도전하고 결과를 기록${v}.`, `처음 기록과 비교하여 나아진 점을 찾아 ${b}.`] },
        { title: `${A} 단계별 도전하기`, steps: [`도전 구역 세 곳을 돌며 단계별 과제에 도전${v}.`, `성공한 단계에 붙임 표시를 ${v}.`, `다음 단계로 가기 위해 연습할 점을 정${v}.`] },
        { title: `모둠과 함께 ${A} 도전하기`, steps: [`모둠 목표 기록을 함께 정${v}.`, `모둠원이 차례로 도전하고 서로 응원${v}.`, `모둠 기록을 더해 목표를 이루었는지 확인${v}.`] },
      ],
      check: [
        { title: `${A} 기록하고 점검하기`, steps: [`활동 전과 후에 숨, 심장 박동, 땀 같은 몸의 변화를 살펴 ${b}.`, `기록지에 오늘의 기록과 느낌을 적어 ${b}.`, `다음 시간에 도전할 나의 목표를 정${v}.`] },
        { title: `나의 ${A} 성장 확인하기`, steps: [`처음 기록과 지금 기록을 그래프로 나타내 ${b}.`, `가장 많이 나아진 점과 그 까닭을 적어 ${b}.`, `생활 속에서 꾸준히 실천할 방법을 정${v}.`] },
      ],
      habit: [
        { title: `생활 속에서 ${A} 실천하기`, steps: [`친구와 함께 바른 ${A} 방법을 정리${v}.`, `역할 놀이로 바른 방법을 연습${v}.`, `일주일 동안 실천할 계획을 세우고 실천 기록표에 표시${v}.`] },
        { title: `${A} 실천 약속 만들기`, steps: [`우리 반이 함께 지킬 ${A} 약속을 정${v}.`, `약속을 그림이나 짧은 글로 꾸며 ${b}.`, `약속을 지킨 날을 붙임 표시로 기록${v}.`] },
      ],
      play: [
        { title: typeId === "eco" ? `${A} 즐기기` : `${A} 놀이에 참여하기`, steps: [`모둠을 나누고 놀이 방법과 규칙을 확인${v}.`, `익힌 ${skillWord}을 활용하여 놀이에 참여${v}.`, `놀이가 끝나면 잘한 점과 바꿀 점을 이야기${v}.`] },
        { title: `규칙을 바꾸어 ${A} 놀이하기`, steps: [`모두가 즐길 수 있도록 인원·공간·도구를 바꾼 규칙을 정${v}.`, `바꾼 규칙으로 다시 놀이${v}.`, `어떤 규칙이 가장 즐겁고 안전했는지 이야기${v}.`] },
        { title: typeId === "eco" ? `${A}에서 환경 지키기` : `우리 반 ${A} 대회`, steps: typeId === "eco"
          ? [`활동한 장소를 둘러보고 쓰레기나 훼손된 곳을 찾아 ${b}.`, `자연과 시설을 아끼는 방법을 실천${v}.`, `도움을 준 사람들에게 감사하는 마음을 전${v}.`]
          : [`모둠별로 대회 방식과 순서를 정${v}.`, `규칙을 지키며 최선을 다해 참여${v}.`, `상대 모둠의 좋은 점을 찾아 칭찬${v}.`] },
      ],
      strategy: [
        { title: `${A}의 기본 전략 알아보기`, steps: [`공을 가진 친구와 가지지 않은 친구가 어디로 움직이면 좋을지 생각${v}.`, `모둠별로 작전을 세우고 작전판에 표시${v}.`, `간이 게임에서 작전을 시도하고 효과가 있었는지 확인${v}.`] },
        { title: "작전을 세워 간이 게임 하기", steps: [`인원을 줄인 간이 게임으로 작전을 연습${v}.`, `작전 시간에 성공한 장면과 실패한 장면을 이야기${v}.`, `작전을 고쳐 다시 게임${v}.`] },
        { title: "공격과 수비 전략 바꾸어 보기", steps: [`공격할 때와 수비할 때의 자리를 작전판에 나타내 ${b}.`, `공격과 수비 역할을 바꾸어 게임${v}.`, `어느 전략이 효과적이었는지 까닭과 함께 이야기${v}.`] },
      ],
      game: [
        { title: `${A} 하기`, steps: [`모둠에서 공격·수비·심판·기록 역할을 정${v}.`, `규칙을 지키며 세운 전략을 활용하여 게임${v}.`, `게임이 끝나면 팀원과 협력한 장면과 상대를 존중한 장면을 이야기${v}.`] },
        { title: `역할을 바꾸어 ${A} 하기`, steps: [`앞 게임과 다른 역할을 맡아 ${b}.`, `맡은 역할에 책임을 다하며 게임${v}.`, `역할에 따라 달라진 점을 기록지에 적어 ${b}.`] },
        { title: `우리 반 ${A} 리그`, steps: [`모둠별 경기 순서표를 만들어 ${b}.`, `경기 결과를 기록하고 서로 축하${v}.`, `리그를 마치고 가장 멋진 협력 장면을 뽑아 ${b}.`] },
      ],
      create: [
        { title: `${withRo(A)} 표현 만들기`, steps: [`기본 동작을 이어 모둠 표현의 순서를 정${v}.`, `빠르기·크기·방향을 바꾸어 동작을 다양하게 꾸며 ${b}.`, `음악에 맞추어 처음부터 끝까지 연습${v}.`] },
        { title: "대형과 동작 꾸미기", steps: [`한 줄·원·모둠 대형 가운데 어울리는 대형을 골라 ${b}.`, `시작 동작과 끝 동작을 정${v}.`, `친구와 동작을 맞추어 연습${v}.`] },
        { title: "모둠 표현 완성하기", steps: [`표현의 제목과 담고 싶은 느낌을 정${v}.`, `부분 동작을 이어 하나의 작품으로 완성${v}.`, `다른 모둠 앞에서 미리 발표하고 조언을 들어 ${b}.`] },
      ],
      perform: [
        { title: `${A} 발표하고 감상하기`, steps: [`모둠별로 만든 표현을 발표${v}.`, `친구의 표현에서 아름다운 움직임을 찾아 칭찬${v}.`, `감상한 내용을 바탕으로 우리 모둠의 표현을 고쳐 ${b}.`] },
        { title: "고친 표현 다시 발표하기", steps: [`친구들의 조언을 반영하여 동작을 고쳐 ${b}.`, `고친 표현을 다시 발표${v}.`, `처음 발표와 달라진 점을 감상문으로 적어 ${b}.`] },
      ],
    };
    return variants[phaseId] || variants.practice;
  }

  const PHASE_GOALS = {
    explore: "특징과 기본 움직임을 설명할 수 있다",
    practice: "기본 동작을 바른 자세로 수행할 수 있다",
    challenge: "자신의 수준에 맞는 목표를 세우고 도전할 수 있다",
    check: "활동 결과를 기록하고 스스로 점검할 수 있다",
    habit: "바른 생활 습관을 알고 실천 계획을 세울 수 있다",
    play: "익힌 움직임을 놀이와 게임에 활용할 수 있다",
    strategy: "기본 전략을 이해하고 게임에서 시도할 수 있다",
    game: "규칙을 지키며 팀원과 협력하여 게임에 참여할 수 있다",
    create: "기본 동작을 구성하여 표현을 만들 수 있다",
    perform: "표현을 발표하고 친구의 표현을 감상할 수 있다",
  };

  function openingQuestionFor(phaseId, activity, tone) {
    const A = activity;
    const questions = {
      explore: `${josa(A, "을", "를")} 해 본 적이 있나요? 어떤 움직임이 필요했나요?`,
      practice: `${josa(A, "을", "를")} 잘하려면 몸을 어떻게 움직여야 할까요?`,
      challenge: "어제의 나보다 조금 더 잘하려면 어떻게 도전하면 좋을까요?",
      check: "오늘 활동으로 내 몸은 어떻게 달라졌나요?",
      habit: `나는 평소에 ${josa(A, "을", "를")} 어떻게 하고 있나요?`,
      play: "익힌 움직임을 놀이에서 어떻게 쓸 수 있을까요?",
      strategy: "우리 모둠이 득점하려면 공이 없는 친구는 어디로 움직여야 할까요?",
      game: "모두가 즐거운 게임이 되려면 어떤 약속이 필요할까요?",
      create: `${withRo(A)} 어떤 느낌과 생각을 표현할 수 있을까요?`,
      perform: "친구의 표현에서 어떤 점이 가장 멋졌나요?",
    };
    return questions[phaseId] || questions.explore;
  }

  function deckFor(phaseId, activity, typeId, tone) {
    const A = activity;
    const lead = {
      fitness: `${josa(A, "은", "는")} 체력을 기르는 데 도움이 되는 움직임입니다.`,
      health: `${josa(A, "은", "는")} 건강한 생활을 위해 날마다 챙겨야 할 습관입니다.`,
      skill: `${josa(A, "은", "는")} 여러 스포츠의 바탕이 되는 기본 움직임입니다.`,
      game: `${josa(A, "은", "는")} 친구와 협력하여 상대 영역의 목표를 노리는 전략형 스포츠입니다.`,
      eco: `${josa(A, "은", "는")} 자연이나 생활 환경 속에서 즐기는 생태형 스포츠입니다.`,
      expression: `${josa(A, "은", "는")} 몸의 움직임으로 느낌과 생각을 나타내는 표현 활동입니다.`,
    }[typeId] || `${A} 활동을 시작합니다.`;
    const follow = {
      explore: `먼저 어떤 움직임이 필요한지 살펴${tone.upper ? "봅시다" : "봐요"}.`,
      practice: `바른 자세로 기본 동작을 익혀${tone.upper ? " 봅시다" : " 봐요"}.`,
      challenge: `내 수준에 맞는 목표를 정하고 꾸준히 도전${tone.v}.`,
      check: `활동 결과를 기록하며 나의 변화를 확인${tone.v}.`,
      habit: `생활 속에서 실천할 방법을 찾아${tone.upper ? " 봅시다" : " 봐요"}.`,
      play: `익힌 움직임을 놀이에 활용${tone.v}.`,
      strategy: `모둠이 함께 쓸 작전을 세워${tone.upper ? " 봅시다" : " 봐요"}.`,
      game: `규칙을 지키며 친구와 함께 게임을 즐겨${tone.upper ? " 봅시다" : " 봐요"}.`,
      create: `동작을 이어 우리 모둠만의 표현을 만들어${tone.upper ? " 봅시다" : " 봐요"}.`,
      perform: `서로의 표현을 발표하고 감상${tone.v}.`,
    }[phaseId] || "";
    return `${lead} ${follow}`.trim();
  }

  function attitudeQuestion(standards) {
    const attitude = standards.find((item) => isAttitudeStandard(item.statement));
    if (!attitude) return "친구와 협력하며 안전하게 활동했나요?";
    return attitude.statement
      .replace(/\s+/g, " ")
      .replace(/나타낸다\.?$/, "나타냈나요?")
      .replace(/한다\.?$/, "했나요?")
      .replace(/다\.?$/, "나요?");
  }

  function selfCheckItems(activity, standards, typeId) {
    const knowledge = {
      health: `바른 ${activity} 습관을 말할 수 있나요?`,
      expression: `${josa(activity, "을", "를")} 살린 움직임의 특징을 말할 수 있나요?`,
    }[typeId] || `${activity}의 방법을 말할 수 있나요?`;
    const skill = {
      health: `${activity} 실천 계획을 세우고 지켰나요?`,
      expression: `${josa(activity, "을", "를")} 살려 몸으로 표현할 수 있나요?`,
    }[typeId] || `${activity}의 기본 움직임을 바르게 할 수 있나요?`;
    return [`${knowledge} ☆☆☆`, `${skill} ☆☆☆`, `${attitudeQuestion(standards)} ☆☆☆`];
  }

  function cleanTitle(title) {
    return String(title || "").replace(/^\d+(?:-\d+)*\.\s*/, "").replace(/에 도전해요$/, "").trim();
  }

  function smallUnitManuscript(request, context, spreadIndex) {
    const { target, activity, typeId, tone, standards, phasesBySpread, lessonPlan, style } = context;
    const phases = phasesBySpread[spreadIndex];
    const lessonInfo = lessonPlan[spreadIndex];
    const seen = {};
    phasesBySpread.slice(0, spreadIndex).flat().forEach((phaseId) => { seen[phaseId] = (seen[phaseId] || 0) + 1; });
    const activities = phases.map((phaseId) => {
      const variants = activityVariants(phaseId, activity, tone, typeId);
      const occurrence = seen[phaseId] || 0;
      seen[phaseId] = occurrence + 1;
      return variants[occurrence % variants.length];
    });
    const sections = activities.map((item, index) => ({
      number: index + 1,
      label: `활동 ${index + 1}`,
      kind: "activity",
      title: item.title,
      paragraphs: item.steps.map((step, stepIndex) => `${"①②③④⑤"[stepIndex] || "-"} ${step}`),
    }));
    const boxes = [
      { type: "준비물", content: equipmentFor(target, typeId).join(", ") },
      { type: "안전", content: safetyFor(target, typeId, tone) },
      { type: "도움말", content: helpTipFor(target, typeId, tone) },
    ];
    if (style === "steady") boxes.push({ type: "움직임 확인", content: tone.pick("그림 속 핵심 동작과 내 동작을 비교하며 바른 자세를 확인해요.", "그림 속 핵심 동작과 자신의 동작을 비교하며 바른 자세를 확인합니다.") });
    if (style === "active") boxes.push({ type: "더 해 보기", content: tone.pick("규칙이나 도구를 바꾸어 새로운 놀이를 만들어 봐요.", "규칙·인원·도구를 바꾸어 우리 반만의 새로운 활동을 만들어 봅시다.") });
    boxes.forEach((box) => sections.push({
      number: sections.length + 1,
      kind: "box",
      title: box.type,
      boxType: box.type,
      paragraphs: [box.content],
    }));
    sections.push({
      number: sections.length + 1,
      kind: "check",
      title: tone.pick("확인해요", "스스로 평가해요"),
      boxType: "스스로 평가",
      paragraphs: selfCheckItems(activity, standards, typeId),
    });
    const firstPhase = phases[0];
    return {
      manuscript: {
        headline: `${target.smallTitle.replace(/^\d+(?:-\d+)*\.\s*/, "")}${phasesBySpread.length > 1 ? ` (${spreadIndex + 1})` : ""}`,
        lessonLabel: lessonInfo.label,
        learningGoal: `${activity}의 ${PHASE_GOALS[firstPhase]}.`,
        openingQuestion: style === "steady" && spreadIndex > 0 ? "" : openingQuestionFor(firstPhase, activity, tone),
        layout: typeId,
        deck: deckFor(firstPhase, activity, typeId, tone),
        sections,
        visuals: {
          left: [{ size: "half", placement: "top", description: `${josa(activity, "을", "를")} 하는 ${gradeNumber(target)}학년 어린이들의 모습(도입 삽화)` }],
          right: activities.map((item, index) => ({
            size: "small",
            placement: "bottom",
            description: index === 0 ? `${item.title} — 동작 순서를 보여 주는 단계별 그림` : `${item.title} — 활동 장면 또는 경기장 배치도`,
          })),
        },
      },
      activities: activities.map((item, index) => ({
        number: index + 1,
        title: item.title,
        placement: index === 0 ? "left" : index === 1 ? "right" : "across",
        objective: `${activity}의 ${PHASE_GOALS[phases[index]]}.`,
        method: item.steps,
      })),
      supportBoxes: boxes,
      phases,
      lessonInfo,
    };
  }

  function unitOutlineLines(target) {
    return (target.unitOutline || []).map((middle, index) => `${"①②③④⑤⑥⑦⑧"[index] || "-"} ${middle.middleTitle}: ${(middle.smallTitles || []).join(", ")}`);
  }

  const DOMAIN_OPENING = {
    운동: "내 몸을 튼튼하고 건강하게 만드는 움직임에는 어떤 것이 있을까요?",
    스포츠: "친구와 함께 즐길 수 있는 스포츠에는 어떤 것이 있을까요?",
    표현: "몸으로 내 느낌과 생각을 어떻게 나타낼 수 있을까요?",
  };

  const DOMAIN_STORY = {
    운동: "운동회를 앞둔 우리 반 친구들이 저마다 체력을 기르는 방법을 이야기하고 있습니다.",
    스포츠: "쉬는 시간마다 운동장에서는 공을 주고받는 소리와 응원 소리가 가득합니다.",
    표현: "음악이 흐르자 친구들이 저마다 다른 몸짓으로 느낌을 표현하기 시작합니다.",
  };

  function specialManuscript(request, context, spreadIndex) {
    const { target, tone, standards } = context;
    const role = target.pageRole;
    const domain = target.domain;
    const outlineActivities = (target.unitOutline || []).flatMap((middle) => (middle.activities?.length ? middle.activities : (middle.smallTitles || []).map(cleanTitle)));
    const firstSmall = outlineActivities[0] || `${domain} 활동`;
    const lastSmall = outlineActivities[outlineActivities.length - 1] || firstSmall;
    let headline;
    let learningGoal;
    let openingQuestion = "";
    let sections;
    let visuals;
    if (role === "unit-intro") {
      headline = `${target.unitTitle || domain}${target.unitSubtitle ? ` — ${target.unitSubtitle}` : ""}`;
      learningGoal = `${domain} 단원에서 배울 내용을 살펴보고 나의 학습 목표를 세울 수 있다.`;
      openingQuestion = DOMAIN_OPENING[domain] || DOMAIN_OPENING.스포츠;
      sections = spreadIndex === 0
        ? [
            { title: "이야기로 단원 열기", kind: "text", paragraphs: [DOMAIN_STORY[domain] || DOMAIN_STORY.스포츠, tone.pick("그림 속 친구들은 어떤 활동을 하고 있는지 이야기해 봐요.", "그림 속 장면에서 어떤 움직임이 보이는지 이야기해 봅시다.")] },
            { title: "이 단원에서 배울 내용", kind: "text", paragraphs: unitOutlineLines(target) },
            { title: "학습 목표", kind: "text", paragraphs: standards.slice(0, 3).map((item) => `${item.code} ${item.statement}`) },
            { title: "나의 실력 진단", kind: "check", boxType: "스스로 점검", paragraphs: [`${josa(firstSmall, "을", "를")} 해 본 적이 있나요? ☐ 예 ☐ 아니요`, `${domain} 활동에서 내가 가장 자신 있는 움직임은 무엇인가요?`, "이 단원에서 꼭 해 보고 싶은 활동을 적어 보세요."] },
          ]
        : [
            { title: "단원 학습 지도", kind: "text", paragraphs: unitOutlineLines(target) },
            { title: "함께 지킬 약속", kind: "box", boxType: "안전", paragraphs: [tone.pick("준비 운동과 정리 운동을 꼭 해요.", "준비 운동과 정리 운동을 빠짐없이 합니다."), tone.pick("친구를 배려하며 안전하게 활동해요.", "모두가 참여할 수 있도록 서로 배려하며 활동합니다.")] },
          ];
      visuals = { left: [{ size: "full", placement: "background", description: `${DOMAIN_STORY[domain] || ""} 장면을 담은 단원 표지 일러스트` }], right: [] };
    } else if (role === "unit-closing") {
      headline = `${target.unitTitle || domain} 마무리`;
      learningGoal = `${domain} 단원에서 배운 내용을 정리하고 스스로 평가할 수 있다.`;
      openingQuestion = tone.pick("이 단원에서 가장 즐거웠던 활동은 무엇인가요?", "이 단원을 배우며 가장 크게 성장한 점은 무엇인가요?");
      sections = spreadIndex === 0
        ? [
            { title: "퀴즈로 정리해요", kind: "text", paragraphs: [
              `${firstSmall} 활동을 하기 전에는 준비 운동을 합니다. ( O / X )`,
              `${domain} 활동은 잘하는 친구만 참여하는 것이 좋습니다. ( O / X )`,
              `${lastSmall} 활동에서 익힌 움직임은 다른 활동에도 활용할 수 있습니다. ( O / X )`,
            ] },
            { title: "스스로 평가해요", kind: "check", boxType: "스스로 평가", paragraphs: [
              `[지식] ${domain} 활동의 의미와 방법을 설명할 수 있나요? ☆☆☆`,
              `[기능] 배운 움직임을 바르게 할 수 있나요? ☆☆☆`,
              `[태도] ${attitudeQuestion(standards)} ☆☆☆`,
            ] },
            { title: "생활 속으로", kind: "text", paragraphs: [tone.pick("배운 활동 가운데 집이나 놀이터에서 해 볼 것을 하나 골라 적어 봐요.", "배운 활동 가운데 생활 속에서 꾸준히 실천할 것을 정하고 실천 계획을 세워 봅시다.")] },
          ]
        : [
            { title: "친구에게 칭찬 한마디", kind: "text", paragraphs: [tone.pick("단원 활동에서 도움을 준 친구에게 고마운 마음을 적어 봐요.", "함께 활동하며 배려와 협력을 보여 준 친구에게 칭찬의 글을 써 봅시다.")] },
            { title: "다음 단원 미리 보기", kind: "text", paragraphs: ["다음 단원에서 배울 내용을 살펴보고 궁금한 점을 적어 보세요."] },
          ];
      visuals = { left: [{ size: "half", placement: "top", description: `${domain} 단원 활동을 돌아보는 어린이들의 모습` }], right: [{ size: "small", placement: "bottom", description: "스스로 평가 별표(☆) 아이콘" }] };
    } else {
      const corner = CORNER_TYPES.find((item) => `corner-${item.id}` === role) || CORNER_TYPES[0];
      headline = `${corner.label} — ${target.unitTitle || domain}`;
      learningGoal = `${domain} 단원의 학습을 ${corner.label}과(와) 연결하여 확장할 수 있다.`;
      openingQuestion = {
        digital: "내 움직임을 영상으로 찍어 보면 무엇을 알 수 있을까요?",
        daily: "학교 밖에서도 이 활동을 즐기려면 어떻게 하면 좋을까요?",
        safety: "활동하다가 다칠 수 있는 상황에는 어떤 것이 있을까요?",
        citizen: "체육 활동으로 우리 반과 마을을 더 좋게 만들 수 있을까요?",
        project: "운동·스포츠·표현에서 배운 것을 모아 무엇을 만들 수 있을까요?",
      }[corner.id];
      const steps = {
        digital: ["태블릿으로 친구의 동작을 촬영해 느린 화면으로 살펴봅니다.", "기록 앱에 횟수와 시간을 입력하고 그래프로 변화를 확인합니다.", "영상과 기록을 보고 고칠 점을 한 가지 정합니다."],
        daily: ["가족과 함께 할 수 있는 활동을 골라 봅니다.", "언제, 어디서, 얼마나 할지 실천 계획을 세웁니다.", "일주일 동안 실천하고 달력에 표시합니다."],
        safety: ["단원 활동에서 위험할 수 있는 상황을 찾아봅니다.", "위험 상황마다 예방하는 방법을 정리합니다.", "다쳤을 때 알리고 대처하는 순서를 역할극으로 연습합니다."],
        citizen: ["활동 중 배려와 공정이 필요했던 장면을 떠올립니다.", "모두가 참여할 수 있도록 규칙을 바꾸는 방법을 제안합니다.", "우리 반 체육 약속을 만들어 함께 지킵니다."],
        project: ["모둠의 프로젝트 주제와 결과물(발표·영상·작품)을 정합니다.", "운동·스포츠·표현 단원에서 배운 움직임을 골라 구성합니다.", "결과물을 발표하고 서로 평가합니다."],
      }[corner.id];
      sections = [
        { title: corner.label, kind: "text", paragraphs: [corner.summary] },
        { title: tone.pick("함께 해 봐요", "함께 해 봅시다"), kind: "activity", label: "활동", paragraphs: steps.map((step, index) => `${"①②③"[index]} ${step}`) },
        { title: "생각 나누기", kind: "box", boxType: "생각 나누기", paragraphs: [tone.pick("활동하며 새로 알게 된 점을 친구와 이야기해 봐요.", "활동을 통해 새롭게 알게 된 점과 더 알아보고 싶은 점을 나누어 봅시다.")] },
      ];
      visuals = { left: [{ size: "half", placement: "top", description: `${corner.label} 활동을 하는 어린이들의 모습` }], right: [{ size: "small", placement: "bottom", description: `${corner.label} 활동 결과물 예시` }] };
    }
    return {
      manuscript: {
        headline,
        lessonLabel: role === "unit-intro" ? "단원 도입" : role === "unit-closing" ? "단원 마무리" : "확장 코너(차시 미배정)",
        learningGoal,
        openingQuestion,
        layout: role,
        deck: role === "unit-intro" ? (target.unitSubtitle ? `${target.unitSubtitle}을(를) 중심으로 ${domain} 영역의 활동을 배웁니다.` : `${domain} 영역의 활동을 배웁니다.`) : "",
        sections: sections.map((section, index) => ({ number: index + 1, ...section })),
        visuals,
      },
      activities: sections.filter((section) => section.kind === "activity").map((section, index) => ({ number: index + 1, title: section.title, placement: "right", objective: learningGoal, method: section.paragraphs })),
      supportBoxes: sections.filter((section) => section.boxType).map((section) => ({ type: section.boxType, content: section.paragraphs.join(" ") })),
      phases: [],
      lessonInfo: { lessons: [], label: role === "unit-intro" ? "단원 도입" : role === "unit-closing" ? "단원 마무리" : "확장 코너" },
    };
  }

  function lessonFlowFor(lessonInfo, activities, manuscript) {
    const lessons = lessonInfo.lessons.length ? lessonInfo.lessons : [null];
    const flow = [];
    const perLesson = allocate(activities.length || 1, lessons.length);
    let cursor = 0;
    lessons.forEach((lesson, lessonIndex) => {
      const prefix = lesson ? `${lesson}차시 ` : "";
      const lessonActivities = activities.slice(cursor, cursor + perLesson[lessonIndex]);
      cursor += perLesson[lessonIndex];
      flow.push({ stage: `${prefix}도입(5분)`, guidance: lessonIndex === 0 ? `준비 운동을 한 뒤 '${manuscript.openingQuestion || manuscript.headline}'을(를) 함께 생각하며 차시 목표를 확인한다.` : "준비 운동 후 앞 차시에서 익힌 동작을 짧게 복습하고 오늘의 목표를 확인한다." });
      if (!lessonActivities.length) {
        flow.push({ stage: `${prefix}전개(30분)`, guidance: "앞 차시 활동을 게임·발표 형태로 적용하고, 관찰 체크리스트로 과정을 평가한다." });
      } else {
        const minutes = allocate(30, lessonActivities.length);
        lessonActivities.forEach((activity, index) => {
          flow.push({ stage: `${prefix}전개 ${index + 1}(${minutes[index]}분)`, guidance: `${activity.title}: ${activity.method.slice(0, 2).join(" ")}` });
        });
      }
      flow.push({ stage: `${prefix}정리(5분)`, guidance: "정리 운동을 하고, 스스로 평가 별표로 오늘의 활동을 돌아본 뒤 다음 차시를 안내한다." });
    });
    return flow;
  }

  function teacherGuideFor(target, context, built) {
    const { activity, typeId, tone, standards, traceability } = context;
    const { manuscript, activities, lessonInfo } = built;
    const lessonCount = Math.max(1, lessonInfo.lessons.length);
    return {
      lessonLabel: lessonInfo.label,
      lessonGoals: [
        manuscript.learningGoal,
        ...activities.slice(0, 2).map((item) => item.objective),
      ].filter((item, index, list) => item && list.indexOf(item) === index),
      preparation: [...equipmentFor(target, typeId), "관찰 체크리스트"],
      lessonFlow: lessonFlowFor(lessonInfo, activities, manuscript),
      questions: [
        manuscript.openingQuestion || `${activity} 활동에서 가장 중요한 움직임은 무엇일까요?`,
        `${josa(activities[0]?.title || activity, "을", "를")} 할 때 어떤 점을 조심해야 할까요?`,
        "친구와 함께 활동하며 잘된 점은 무엇이었나요?",
      ],
      expectedResponses: [
        `${activity}에 필요한 몸의 부분과 동작 순서를 말한다.`,
        "주변을 살피고 친구와 거리를 지켜야 한다고 답한다.",
        "서로 도와주고 응원하여 끝까지 활동할 수 있었다고 답한다.",
      ],
      teachingNotes: [
        `${lessonCount * LESSON_MINUTES}분(${lessonInfo.label}) 동안 활동 시간이 충분히 확보되도록 설명은 짧게 하고 시범과 연습 중심으로 운영한다.`,
        `핵심 관찰 요소: ${activities.map((item) => item.title).join(" / ")}에서 자세·순서·안전 행동을 살핀다.`,
        `${standards.map((item) => item.code).join(", ")}의 지식·기능·태도가 함께 드러나도록 활동 후 스스로 평가와 연결한다.`,
        tone.upper ? "모둠 활동에서는 역할을 돌아가며 맡게 하여 모든 학생이 공격·수비·기록 역할을 경험하게 한다." : "놀이형 활동으로 흥미를 유지하되 규칙과 순서를 그림 카드로 함께 제시한다.",
      ],
      differentiation: [
        "쉽게: 거리·높이·횟수를 줄이거나 더 크고 가벼운 도구를 사용한다.",
        "어렵게: 시간 제한·방향 전환·수비수를 더해 과제를 복잡하게 만든다.",
        "참여가 어려운 학생: 기록·심판·관찰·응원 역할이나 좌식·보조 도구 활동으로 같은 성취기준에 참여하게 한다.",
      ],
      safety: `${safetyFor(target, typeId, tone)} 활동 전 건강 상태와 공간·용구를 점검한다.`,
      assessment: [
        ...(traceability.assessmentEvidence || []),
        `평가 관점: ${standards.slice(0, 2).map((item) => item.code).join(", ")}`,
      ],
    };
  }

  function specialGuideFor(target, context, built) {
    const { tone, traceability } = context;
    const { manuscript, lessonInfo } = built;
    return {
      lessonLabel: lessonInfo.label,
      lessonGoals: [manuscript.learningGoal],
      preparation: target.pageRole === "unit-intro" ? ["단원 도입 그림 자료", "실력 진단지"] : target.pageRole === "unit-closing" ? ["퀴즈 카드", "자기 평가지"] : ["활동 안내 자료", "태블릿 또는 기록지"],
      lessonFlow: [
        { stage: "도입(5분)", guidance: `${manuscript.openingQuestion || manuscript.headline}을(를) 질문하여 학생의 경험을 이끌어 낸다.` },
        { stage: "전개(30분)", guidance: manuscript.sections.map((section) => section.title).join(" → ") },
        { stage: "정리(5분)", guidance: target.pageRole === "unit-intro" ? "단원 학습 계획을 확인하고 첫 소단원을 안내한다." : "학습 결과를 공유하고 생활 속 실천을 다짐한다." },
      ],
      questions: [manuscript.openingQuestion || "이 활동에서 무엇을 알게 되었나요?"],
      expectedResponses: ["자신의 경험과 배운 내용을 연결하여 말한다."],
      teachingNotes: [
        target.pageRole === "unit-intro" ? "사전 진단 결과를 단원 지도 계획(수준별 모둠 편성)에 반영한다." : target.pageRole === "unit-closing" ? "자기 평가 결과를 단원 성취 수준 판단의 참고 자료로 기록한다." : "확장 코너는 차시가 배정되지 않으므로 자투리 시간·가정 연계·학교자율시간에 활용한다.",
        tone.upper ? "학생이 스스로 목표와 다짐을 문장으로 쓰게 한다." : "그림과 짧은 낱말로 생각을 표현하게 한다.",
      ],
      differentiation: ["글쓰기가 어려운 학생은 그림·말로 답하게 한다.", "참여가 어려운 학생은 발표 대신 관찰·기록 역할을 맡게 한다."],
      safety: "활동 공간을 정리하고 이동 동선을 미리 안내한다.",
      assessment: traceability.assessmentEvidence,
    };
  }

  function buildContext(request) {
    const target = request.smallUnit;
    const tone = voice(target);
    const activity = activityName(target);
    const typeId = LESSON_TYPES[target.lessonType] ? target.lessonType : inferLessonType(target);
    const standards = target.pageRole === "small-unit"
      ? resolveStandards(target)
      : standardsOfDomain(bandOf(target), target.domain);
    const traceability = traceabilityFor(target, standards);
    const evidence = target.pageRole === "small-unit" ? evidenceFor(target) : [];
    const style = styleKind(request);
    const spreadCount = Math.max(1, Math.round((Number(target.pages) || 2) / 2));
    // 펼침면당 차시 흐름 단계 수(참고값). 활동 수는 AI가 내용에 맞게 정하고, 스타일은 방향만 준다.
    const perSpread = 2;
    return {
      target,
      tone,
      activity,
      typeId,
      standards,
      traceability,
      evidence,
      style,
      spreadCount,
      phasesBySpread: phasePlan(typeId, spreadCount, perSpread),
      lessonPlan: lessonPlanFor(target, spreadCount),
    };
  }

  function assembleEntry(request, context, builtSpreads, provider) {
    const { target, typeId, traceability, evidence, activity } = context;
    const spreads = builtSpreads.map((built, index) => {
      const phaseRoles = [...new Set(built.phases.map((phaseId) => PHASES[phaseId]?.role).filter(Boolean))];
      const firstPhase = PHASES[built.phases[0]] || { template: "도입·정리형" };
      const guide = target.pageRole === "small-unit" ? teacherGuideFor(target, context, built) : specialGuideFor(target, context, built);
      return {
        left_page: index * 2 + 1,
        right_page: index * 2 + 2,
        lesson_label: built.lessonInfo.label,
        lessons: built.lessonInfo.lessons,
        layout_template: firstPhase.template,
        role: phaseRoles.length ? phaseRoles.join("·") : built.lessonInfo.label,
        content_type: typeId,
        content_type_label: LESSON_TYPES[typeId]?.label || "",
        page_role: target.pageRole,
        title: built.manuscript.headline,
        intro: built.manuscript.deck || built.manuscript.learningGoal,
        activities: built.activities,
        support_boxes: built.supportBoxes,
        wrap_up: (built.manuscript.sections.find((section) => section.kind === "check")?.paragraphs || []).join(" / ") || built.manuscript.learningGoal,
        textbook_manuscript: built.manuscript,
        teacher_guide: guide,
      };
    });
    const typeLabel = target.pageRole === "small-unit" ? (LESSON_TYPES[typeId]?.label || "") : target.specialTypeLabel || "단원 도입·마무리";
    const lessonLabels = spreads.map((spread) => spread.lesson_label);
    return {
      schemaVersion: "elementary-1.0",
      profileId: PROFILE_ID,
      subjectLabel: SUBJECT_LABEL,
      gradeLabel: target.gradeLabel,
      provider,
      frameworkName: request.framework.name,
      smallUnitLabel: `${target.gradeLabel || ""} ${target.domain} · ${target.middleTitle} · ${target.smallTitle}`.trim(),
      instruction: `${activity} 활동을 ${LESSON_TYPES[typeId]?.description || "차시 흐름"} 순서로 구성하고, 활동마다 안전과 스스로 평가를 연결합니다.`,
      carrierSport: target.pageRole === "small-unit" ? activity : "",
      sportMode: "none",
      primaryType: typeId,
      primaryTypeLabel: typeLabel,
      lessonType: typeId,
      lessonTypeLabel: typeLabel,
      lessonRange: lessonLabels.join(", "),
      secondaryType: null,
      secondaryTypeLabel: null,
      supportMode: "",
      pageRole: target.pageRole,
      traceability,
      sourceEvidence: sourceEvidenceFor(target, evidence),
      manuscriptQuality: {
        spreadCharacterCounts: spreads.map((spread) => (spread.textbook_manuscript.sections || []).flatMap((section) => section.paragraphs).join("").length),
        duplicateSentenceCount: 0,
        densityTarget: { minimum: 250, recommendedMaximum: 900, label: "초등 활동 펼침면" },
        belowMinimumCount: 0,
      },
      teacherGuide: {
        principle: "교과서 펼침면의 차시·활동·안전·스스로 평가 데이터를 그대로 사용해 차시별 40분 수업 흐름을 파생합니다.",
        annualPlanLink: `${target.hours || 0}차시 · ${target.pages || 0}쪽${lessonLabels.length ? ` · ${lessonLabels.join(", ")}` : ""}`,
      },
      spreads,
    };
  }


  function stripStepNumber(step) {
    return String(step || "").replace(/^\s*(?:\d+\s*[.)]|[①-⑳])\s*/, "").trim();
  }

  function stripActivityNumber(title) {
    return String(title || "").replace(/^\s*활동\s*\d+\s*[.:·)]?\s*/, "").trim();
  }

  // 외부 AI 응답(활동·코너·스스로 평가가 분리된 초등 스키마)을 화면·PDF·HWPX가 쓰는 공통
  // manuscript.sections 모양으로 바꾼다. 활동은 "활동 n" 라벨, 코너는 boxType으로 구분한다.
  // 소단원 펼침면의 제목은 03단계에서 정한 소단원명을 그대로 쓰고, AI가 지은 제목은 부제로 둔다.
  function manuscriptFromAi(aiSpread, fallback, tone, keepTitle = false) {
    const sections = [];
    (aiSpread.sections || []).forEach((section) => sections.push({ kind: "text", title: section.title, paragraphs: section.paragraphs }));
    (aiSpread.activities || []).forEach((activity, index) => sections.push({
      kind: "activity",
      label: `활동 ${index + 1}`,
      title: stripActivityNumber(activity.title),
      paragraphs: [
        ...(activity.steps || []).map((step, stepIndex) => `${"①②③④⑤"[stepIndex] || "-"} ${stripStepNumber(step)}`),
        ...(activity.tip ? [`도움말 | ${activity.tip}`] : []),
      ],
    }));
    (aiSpread.boxes || []).forEach((box) => sections.push({ kind: "box", title: box.type, boxType: box.type, paragraphs: [box.content] }));
    if ((aiSpread.self_check || []).length) {
      sections.push({ kind: "check", title: tone.pick("확인해요", "스스로 평가해요"), boxType: "스스로 평가", paragraphs: aiSpread.self_check.map((item) => `${item} ☆☆☆`) });
    }
    return {
      ...fallback,
      headline: keepTitle ? fallback.headline : aiSpread.headline || fallback.headline,
      subtitle: keepTitle && aiSpread.headline && aiSpread.headline !== fallback.headline ? aiSpread.headline : "",
      learningGoal: aiSpread.learning_goal || fallback.learningGoal,
      openingQuestion: aiSpread.opening_question ?? fallback.openingQuestion,
      deck: aiSpread.deck || fallback.deck,
      sections: sections.map((section, index) => ({ number: index + 1, ...section })),
      visuals: { left: aiSpread.left_visuals || [], right: aiSpread.right_visuals || [] },
    };
  }

  async function externalAiGenerate(request) {
    const engine = global.TEXTBOOK_DRAFT_ENGINE;
    const context = buildContext(request);
    const { target, tone, evidence } = context;
    const base = Array.from({ length: context.spreadCount }, (_, index) => (
      target.pageRole === "small-unit" ? smallUnitManuscript(request, context, index) : specialManuscript(request, context, index)
    ));
    const styleLabel = { steady: "안정·정석형", balanced: "균형형", active: "참신·활동형" }[context.style];
    const responses = await Promise.all(base.map((built, index) => {
      const windowSize = Math.min(4, evidence.length);
      const start = evidence.length ? (index * 3) % evidence.length : 0;
      const excerpts = Array.from({ length: windowSize }, (_, offset) => evidence[(start + offset) % evidence.length]);
      return engine.postJsonForManuscript("/api/prototype/elementary-pe-manuscript", {
        pageRole: target.pageRole,
        gradeLabel: target.gradeLabel,
        band: bandOf(target),
        domain: target.domain,
        subdomain: target.subdomain || "",
        middleTitle: target.middleTitle,
        smallTitle: target.smallTitle,
        sourceActivity: target.sourceActivity || "",
        lessonType: context.typeId,
        lessonTypeLabel: LESSON_TYPES[context.typeId]?.label || "",
        lessonTypeFlow: LESSON_TYPES[context.typeId]?.description || "",
        standards: context.standards.map((item) => ({ code: item.code, statement: item.statement })),
        styleLabel,
        additionalConcept: request.additionalConcept || "",
        feedbackNotes: request.feedbackNotes || [],
        unitTitle: target.unitTitle || "",
        unitOutline: target.unitOutline || [],
        cornerLabel: target.specialTypeLabel || "",
        spread: {
          index,
          count: base.length,
          lessonLabel: built.lessonInfo.label,
          lessonCount: built.lessonInfo.lessons.length,
          phases: built.phases.map((phaseId) => PHASES[phaseId]?.role),
          activityCount: built.activities.length,
          suggestedActivityTitles: built.activities.map((item) => item.title),
          evidence: excerpts.map((item) => ({ documentType: item.documentType, excerpt: item.text })),
        },
      });
    }));
    const built = base.map((item, index) => {
      const aiSpread = responses[index]?.spreads?.[0];
      if (!aiSpread) throw new Error(`${index + 1}번째 펼침면 원고를 AI가 돌려주지 않았습니다. 다시 생성해 주세요.`);
      const manuscript = manuscriptFromAi(aiSpread, item.manuscript, tone, target.pageRole === "small-unit");
      const activities = (aiSpread.activities || []).map((activity, activityIndex) => ({
        number: activityIndex + 1,
        title: stripActivityNumber(activity.title),
        placement: activityIndex === 0 ? "left" : activityIndex === 1 ? "right" : "across",
        objective: item.activities[activityIndex]?.objective || manuscript.learningGoal,
        method: (activity.steps || []).map(stripStepNumber),
      }));
      return {
        ...item,
        manuscript,
        activities: activities.length ? activities : item.activities,
        supportBoxes: (aiSpread.boxes || []).map((box) => ({ type: box.type, content: box.content })),
      };
    });
    if (request.includeImages) await engine.fillVisualImages(built.map((item) => item.manuscript), request.onImageProgress, "elementary");
    return assembleEntry(request, context, built, { id: "external-ai-v1", label: "AI 실시간 생성(OpenAI)", mode: "external-api" });
  }

  const api = {
    profileId: PROFILE_ID,
    subjectLabel: SUBJECT_LABEL,
    lessonTypes: () => clone(LESSON_TYPES),
    lessonTypeOptions,
    cornerTypes: () => clone(CORNER_TYPES),
    inferLessonType,
    resolveStandards: (target) => resolveStandards(target).map((item) => item.code),
    lessonPlanFor,
    phasePlan,
    externalAiGenerate,
  };

  const engine = global.TEXTBOOK_DRAFT_ENGINE;
  if (engine?.registerProfileGenerator) {
    engine.registerProfileGenerator(PROFILE_ID, "external-ai-v1", externalAiGenerate);
  }
  global.ELEMENTARY_DRAFT_ENGINE = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
