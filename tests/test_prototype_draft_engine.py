import json
import shutil
import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "static" / "prototype-draft-engine.js"
PROTOTYPE = ROOT / "static" / "prototype.js"
PROTOTYPE_CSS = ROOT / "static" / "prototype.css"


@unittest.skipUnless(shutil.which("node"), "Node.js가 설치된 환경에서 실행")
class PrototypeDraftEngineTests(unittest.TestCase):
    def run_node(self, source: str) -> dict:
        completed = subprocess.run(
            ["node", "-e", source],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        return json.loads(completed.stdout)

    def test_sports_culture_profile_has_six_standards(self):
        result = self.run_node(
            "const e=require('./static/prototype-draft-engine.js');"
            "const p=e.sportsCultureProfile();"
            "process.stdout.write(JSON.stringify({count:Object.keys(p.standards).length,review:p.reviewFramework,sports:p.requiredSportCount}));"
        )
        self.assertEqual(result, {"count": 6, "review": "인정", "sports": 1})

    def test_sports_culture_unit_template_is_detailed_and_keeps_totals(self):
        result = self.run_node(
            "const fs=require('fs');"
            "const s=fs.readFileSync('./static/prototype.js','utf8');"
            "const a=s.indexOf('function unitsForSportsCulture()');"
            "const b=s.indexOf('function courseMetaFor',a);"
            "const units=new Function(s.slice(a,b)+'; return unitsForSportsCulture();')();"
            "const small=units.flatMap(u=>u.subdomainGroups.flatMap(g=>g.middleUnits.flatMap(m=>m.smallUnits)));"
            "process.stdout.write(JSON.stringify({domains:units.length,middle:units.flatMap(u=>u.subdomainGroups.flatMap(g=>g.middleUnits)).length,small:small.length,hours:small.reduce((n,x)=>n+x.hours,0),pages:small.reduce((n,x)=>n+x.pages,0)}));"
        )
        self.assertEqual(result, {"domains": 2, "middle": 6, "small": 18, "hours": 32, "pages": 160})

    def test_toc_export_places_non_lesson_page_counts_in_pages_column(self):
        source = (ROOT / "static" / "prototype.js").read_text(encoding="utf-8")
        toc_block = source[source.index("function unitsTocRows()") : source.index("function pagePlanRows")]
        self.assertIn('["앞부속", "", item.title, "", "", "", item.pages]', toc_block)
        self.assertIn('["도입", largeTitle, `${largeTitle} 도입`, "", "", "", unit.introPages]', toc_block)
        self.assertIn('["마무리", largeTitle, `${largeTitle} 마무리`, "", "", "", unit.wrapUpPages]', toc_block)
        self.assertIn('["뒷부속", "", item.title, "", "", "", item.pages]', toc_block)
        self.assertIn('["부록", "", item.title, "", "", "", item.pages]', toc_block)

    def test_initial_sports_culture_toc_recommends_three_distinct_sport_modes(self):
        result = self.run_node(
            "const fs=require('fs');"
            "const s=fs.readFileSync('./static/prototype.js','utf8');"
            "const a=s.indexOf('const SPORTS_CULTURE_SPORT_OPTIONS');"
            "const b=s.indexOf('function sportsCultureStyleProfile',a);"
            "const c=s.indexOf('function unitsForSportsCulture()');"
            "const d=s.indexOf('function courseMetaFor',c);"
            "const api=new Function(s.slice(a,b)+s.slice(c,d)+'; return {inferSportsCultureSportMode,unitsForSportsCulture};')();"
            "const modes=api.unitsForSportsCulture().flatMap(u=>u.subdomainGroups.flatMap(g=>g.middleUnits.flatMap(m=>m.smallUnits.map(x=>api.inferSportsCultureSportMode({middleTitle:m.title,smallTitle:x.title})))));"
            "process.stdout.write(JSON.stringify(Object.fromEntries(['none','examples','primary'].map(k=>[k,modes.filter(x=>x===k).length]))));"
        )
        self.assertEqual(result, {"none": 2, "examples": 9, "primary": 7})

    def test_framework_step_initializes_small_unit_options_before_lookup(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        start = prototype.index("function renderFrameworks()")
        end = prototype.index("function renderMockReview()", start)
        render_frameworks = prototype[start:end]
        self.assertLess(
            render_frameworks.index("const smallUnits = smallUnitOptions();"),
            render_frameworks.index("smallUnits.find("),
        )

    def test_small_unit_title_has_a_labeled_wide_layout(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        css = PROTOTYPE_CSS.read_text(encoding="utf-8")
        self.assertIn('<span>소단원명</span>', prototype)
        self.assertIn(".small-unit-title-field", css)
        self.assertIn("grid-template-columns: minmax(320px, 1fr) auto auto max-content", css)
        self.assertIn("height: 42px", css)
        self.assertIn('aria-label="소단원 편집 작업"', prototype)

    def test_framework_results_keep_readable_card_and_heading_widths(self):
        css = PROTOTYPE_CSS.read_text(encoding="utf-8")
        self.assertIn("grid-template-columns: repeat(3, minmax(720px, 1fr))", css)
        self.assertIn(".framework-comparison-column .small-unit-heading .option-subtitle", css)
        self.assertIn("word-break: keep-all", css)

    def test_persisted_storage_strips_embedded_images_to_avoid_quota_errors(self):
        result = self.run_node(
            "const fs=require('fs');"
            "const s=fs.readFileSync('./static/prototype.js','utf8');"
            "const a=s.indexOf('function stripEmbeddedImages');"
            "const b=s.indexOf('function persist(',a);"
            "const api=new Function(s.slice(a,b)+'; return {stripEmbeddedImages,serializeProjectStoreForStorage};')();"
            "const store={projects:[{id:1,manuscript:{visuals:{left:[{description:'그림 설명',imageBase64:'A'.repeat(1000000)}]}}}]};"
            "const serialized=api.serializeProjectStoreForStorage(store);"
            "process.stdout.write(JSON.stringify({hasImage:serialized.includes('imageBase64'),hasDescription:serialized.includes('그림 설명'),length:serialized.length}));"
        )
        self.assertFalse(result["hasImage"])
        self.assertTrue(result["hasDescription"])
        self.assertLess(result["length"], 10000)

    def test_sports_are_selected_in_unit_step_and_linked_to_drafts(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        self.assertIn("책의 종목 후보", prototype)
        self.assertIn('data-sport-option=', prototype)
        self.assertIn('data-small-sport=', prototype)
        self.assertIn('data-small-sport-mode=', prototype)
        self.assertIn('SPORTS_CULTURE_SPORT_MODES', prototype)
        self.assertIn('inferSportsCultureSportMode', prototype)
        self.assertIn('recommendedSportsForSmallUnit', prototype)
        self.assertIn('sportsCultureSportUsageVersion', prototype)
        self.assertIn('data-recommend-small-sports=', prototype)
        self.assertIn('sportsCultureSportModeLabel', prototype)
        self.assertIn("SPORTS_CULTURE_SPORT_OPTIONS", prototype)

    def test_sport_chips_keep_korean_names_horizontal(self):
        css = PROTOTYPE_CSS.read_text(encoding="utf-8")
        self.assertIn(".sports-option span", css)
        self.assertIn(".small-unit-sport-chip span", css)
        self.assertGreaterEqual(css.count("white-space: nowrap"), 2)
        self.assertGreaterEqual(css.count("word-break: keep-all"), 2)
        self.assertIn('.sports-option input[type="checkbox"]', css)
        self.assertIn('.small-unit-sport-chip input[type="radio"]', css)
        self.assertGreaterEqual(css.count("max-width: 16px"), 2)

    def test_sports_draft_supports_recommended_types_and_png_preview(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        self.assertIn("inferSportsCultureContentType", prototype)
        self.assertIn("draftPrimaryTypeSelect", prototype)
        self.assertIn("draftSecondaryTypeSelect", prototype)
        self.assertIn("data-draft-canvas", prototype)
        self.assertIn("data-download-draft-png", prototype)
        self.assertIn("교과서·지도서 원고와 근거 확인", prototype)
        self.assertIn("data-download-textbook-text", prototype)
        self.assertIn("data-download-guide-text", prototype)
        self.assertIn('canvas width="1400" height="900"', prototype)
        self.assertIn("textbookManuscriptText", prototype)
        self.assertIn("teacherGuideManuscriptText", prototype)

    def test_sports_draft_studio_uses_one_global_style_picker_and_bulk_targets(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        self.assertIn('data-book-style-value=', prototype)
        self.assertIn('book-style-option', prototype)
        self.assertIn('data-draft-content-type=', prototype)
        self.assertIn('data-draft-support-mode=', prototype)
        self.assertIn('data-draft-target=', prototype)
        self.assertIn("selectedDraftSmallUnitKeys", prototype)
        self.assertIn("초고 일괄 생성", prototype)
        self.assertIn("sportsCultureStyleMetrics", prototype)

    def test_draft_target_checkboxes_update_in_place_without_scroll_reset(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        start = prototype.index('document.querySelectorAll("[data-draft-target]")')
        end = prototype.index('document.querySelectorAll("[data-draft-content-type]")', start)
        checkbox_handler = prototype[start:end]
        self.assertIn("refreshDraftSelectionControls();", checkbox_handler)
        self.assertNotIn("renderWorkspace();", checkbox_handler)
        self.assertIn('id="draftTargetSelectedCount"', prototype)
        self.assertIn('id="draftGenerateSelectionSummary"', prototype)

    def test_sports_draft_studio_has_unit_and_special_page_roles(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        engine = ENGINE.read_text(encoding="utf-8")
        self.assertIn('pageRole: "unit-intro"', prototype)
        self.assertIn('pageRole: "unit-closing"', prototype)
        self.assertIn("SPORTS_CULTURE_SPECIAL_PAGE_TYPES", prototype)
        self.assertIn('id="addTocSpecialPageButton"', prototype)
        self.assertIn('data-toc-special-pages=', prototype)
        self.assertIn("3단계 배열표 반영", prototype)
        self.assertIn("manuscriptDensityRange", engine)
        self.assertIn('pageRole === "unit-intro"', engine)

    def test_special_pages_are_included_before_unit_closing_in_final_page_plan(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        start = prototype.index("function buildPagePlan")
        end = prototype.index("function escapeHtml", start)
        page_plan = prototype[start:end]
        special_position = page_plan.index("targetState.specialPages")
        closing_position = page_plan.index("unit.wrapUpPages")
        self.assertLess(special_position, closing_position)
        self.assertIn("sportsCultureSpecialPageTypeLabel(page.type)", page_plan)
        self.assertIn("placedSpecialIds", page_plan)

    def test_unit_header_shows_total_pages_including_special_pages(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        self.assertIn("const unitTotalPages = unitsTotalPages([unit]) + specialPagesTotal(state, unit.domain);", prototype)
        self.assertIn('class="unit-total-pages"', prototype)
        self.assertIn("<span>전체 쪽수</span><strong>${unitTotalPages}</strong>", prototype)

    def test_unit_numbers_are_derived_from_current_hierarchy(self):
        prototype = PROTOTYPE.read_text(encoding="utf-8")
        self.assertIn("function stripManualUnitNumberPrefix", prototype)
        self.assertIn("function middleUnitPosition", prototype)
        self.assertIn("function unitNumberLabel", prototype)
        self.assertIn('class="automatic-unit-number"', prototype)
        self.assertIn("const middlePosition = middleUnitPosition(unit, groupIndex, middleIndex);", prototype)
        self.assertIn("const smallNumber = unitNumberLabel(unitIndex, middlePosition, smallIndex + 1);", prototype)
        self.assertIn('`${smallNumber}. ${small.title}`', prototype)

    def test_internal_provider_generates_traceable_textbook_and_guide_draft(self):
        source = r"""
const e=require('./static/prototype-draft-engine.js');
(async()=>{
  const frameworks=[
    {id:'balanced',name:'탐구·참여 균형형'},
    {id:'activity',name:'대회 프로젝트형'},
    {id:'creative',name:'문화 융합형'}
  ];
  const metrics=Object.fromEntries(frameworks.map(x=>[x.id,{curriculum:5,feasibility:4,engagement:4,novelty:4,safety:5}]));
  const result=await e.generateDraftSet({
    profileId:e.sportsCultureProfile().id,
    providerId:e.internalProviderId,
    carrierSport:'배드민턴',
    primaryType:'practice',
    secondaryType:'project',
    smallUnit:{domain:'스포츠 경기 문화',middleTitle:'스포츠 대회 기획과 운영',smallTitle:'학생 주도 스포츠 대회를 기획·운영하고 진로 탐색하기',sourceActivity:'스포츠 대회 기획과 운영',hours:8,pages:6,standardCodes:['[12스문02-02]']},
    frameworks,
    metricsByFramework:metrics
  });
  const first=result.entries[0];
  process.stdout.write(JSON.stringify({
    provider:result.provider.id,
    entries:result.entries.length,
    spreads:first.spreads.length,
    standard:first.traceability.standardCodes[0],
    sport:first.carrierSport,
    guide:Boolean(first.spreads[0].teacher_guide),
    evidence:first.sourceEvidence.length,
    type:first.primaryType,
    secondary:first.secondaryType,
    manuscript:Boolean(first.spreads[0].textbook_manuscript?.sections?.length),
    uniqueHeadlines:new Set(first.spreads.map(spread=>spread.textbook_manuscript?.headline)).size,
    minimumChars:Math.min(...first.spreads.map(spread=>spread.textbook_manuscript.sections.flatMap(section=>section.paragraphs).join('').length)),
    duplicateSentences:first.manuscriptQuality?.duplicateSentenceCount,
    uniqueGuideQuestions:new Set(first.spreads.map(spread=>spread.teacher_guide?.questions?.[0])).size,
    activityWord:first.spreads.some(spread=>spread.title.includes('활동 1'))
  }));
})().catch(error=>{console.error(error);process.exit(1);});
"""
        result = self.run_node(source)
        self.assertEqual(result["provider"], "internal-rules-v1")
        self.assertEqual(result["entries"], 3)
        self.assertEqual(result["spreads"], 3)
        self.assertEqual(result["standard"], "[12스문02-02]")
        self.assertEqual(result["sport"], "배드민턴")
        self.assertTrue(result["guide"])
        self.assertGreaterEqual(result["evidence"], 4)
        self.assertEqual(result["type"], "practice")
        self.assertEqual(result["secondary"], "project")
        self.assertTrue(result["manuscript"])
        self.assertEqual(result["uniqueHeadlines"], result["spreads"])
        self.assertGreaterEqual(result["minimumChars"], 1400)
        self.assertEqual(result["duplicateSentences"], 0)
        self.assertEqual(result["uniqueGuideQuestions"], result["spreads"])
        self.assertFalse(result["activityWord"])

    def test_internal_provider_rejects_missing_carrier_sport(self):
        source = r"""
const e=require('./static/prototype-draft-engine.js');
(async()=>{
  try {
    await e.generateDraftSet({
      profileId:e.sportsCultureProfile().id,
      providerId:e.internalProviderId,
      carrierSport:'',
      smallUnit:{domain:'스포츠 인문 문화',middleTitle:'스포츠의 역사와 철학',smallTitle:'역사·철학 탐구',pages:2,standardCodes:['[12스문01-02]']},
      frameworks:[{id:'balanced',name:'균형형'}],
      metricsByFramework:{balanced:{curriculum:5,feasibility:4,engagement:4,novelty:3,safety:5}}
    });
    process.stdout.write(JSON.stringify({rejected:false}));
  } catch (error) {
    process.stdout.write(JSON.stringify({rejected:true,message:error.message}));
  }
})();
"""
        result = self.run_node(source)
        self.assertTrue(result["rejected"])
        self.assertIn("선택 종목", result["message"])

    def test_internal_provider_allows_no_sport_for_concept_unit(self):
        source = r"""
const e=require('./static/prototype-draft-engine.js');
(async()=>{
  const framework={id:'balanced',name:'균형형'};
  const result=await e.generateDraftSet({profileId:e.sportsCultureProfile().id,providerId:e.internalProviderId,carrierSport:'',sportMode:'none',primaryType:'theory',smallUnit:{domain:'스포츠 인문 문화',middleTitle:'스포츠 인문 문화의 이해',smallTitle:'스포츠 문화의 의미와 형성',pages:2,standardCodes:['[12스문01-01]']},frameworks:[framework],metricsByFramework:{balanced:{curriculum:5,feasibility:4,engagement:4,novelty:3,safety:5}}});
  const entry=result.entries[0];
  process.stdout.write(JSON.stringify({mode:entry.sportMode,sport:entry.carrierSport,intro:entry.spreads[0].intro,instruction:entry.instruction}));
})().catch(error=>{console.error(error);process.exit(1);});
"""
        result = self.run_node(source)
        self.assertEqual(result["mode"], "none")
        self.assertEqual(result["sport"], "")
        self.assertIn("개념과 문화적 맥락", result["intro"])
        self.assertIn("특정 종목에 종속되지 않는", result["instruction"])

    def test_example_sports_are_compared_without_using_first_sport_as_primary(self):
        source = r"""
const e=require('./static/prototype-draft-engine.js');
(async()=>{
  const framework={id:'balanced',name:'균형형'};
  const result=await e.generateDraftSet({profileId:e.sportsCultureProfile().id,providerId:e.internalProviderId,carrierSport:'축구, 육상, 탁구',sportMode:'examples',primaryType:'theory',smallUnit:{domain:'스포츠 인문 문화',middleTitle:'스포츠의 역사와 철학',smallTitle:'시대와 사회에 따른 스포츠의 변화',pages:2,standardCodes:['[12스문01-02]']},frameworks:[framework],metricsByFramework:{balanced:{curriculum:5,feasibility:4,engagement:4,novelty:3,safety:5}}});
  const entry=result.entries[0];
  process.stdout.write(JSON.stringify({mode:entry.sportMode,intro:entry.spreads[0].intro,brief:entry.spreads[0].textbook_manuscript.visualBriefs.join(' ')}));
})().catch(error=>{console.error(error);process.exit(1);});
"""
        result = self.run_node(source)
        self.assertEqual(result["mode"], "examples")
        self.assertIn("축구, 육상, 탁구 사례를 비교", result["intro"])
        self.assertIn("축구·육상·탁구", result["brief"])

    def test_special_page_uses_role_specific_density_and_no_repeated_sentence(self):
        source = r"""
const e=require('./static/prototype-draft-engine.js');
(async()=>{
  const framework={id:'balanced',name:'전체 스타일 50 · 균형형'};
  const result=await e.generateDraftSet({
    profileId:e.sportsCultureProfile().id,
    providerId:e.internalProviderId,
    carrierSport:'배드민턴',
    primaryType:'theory',
    pageRole:'unit-intro',
    styleValue:50,
    smallUnit:{domain:'스포츠 인문 문화',middleTitle:'스포츠 인문 문화',smallTitle:'스포츠 인문 문화 단원 도입',pages:2,standardCodes:['[12스문01-01]']},
    frameworks:[framework],
    metricsByFramework:{balanced:{curriculum:5,feasibility:4,engagement:4,novelty:3,safety:5}}
  });
  const entry=result.entries[0];
  process.stdout.write(JSON.stringify({role:entry.pageRole,target:entry.manuscriptQuality.densityTarget,count:entry.manuscriptQuality.spreadCharacterCounts[0],below:entry.manuscriptQuality.belowMinimumCount,duplicates:entry.manuscriptQuality.duplicateSentenceCount}));
})().catch(error=>{console.error(error);process.exit(1);});
"""
        result = self.run_node(source)
        self.assertEqual(result["role"], "unit-intro")
        self.assertEqual(result["target"]["minimum"], 300)
        self.assertGreaterEqual(result["count"], 300)
        self.assertLessEqual(result["count"], 700)
        self.assertEqual(result["below"], 0)
        self.assertEqual(result["duplicates"], 0)

    def test_four_page_unit_closing_has_two_non_repeated_full_spreads(self):
        source = r"""
const e=require('./static/prototype-draft-engine.js');
(async()=>{
  const framework={id:'balanced',name:'전체 스타일 50 · 균형형'};
  const result=await e.generateDraftSet({profileId:e.sportsCultureProfile().id,providerId:e.internalProviderId,carrierSport:'배드민턴',primaryType:'theory',pageRole:'unit-closing',styleValue:50,smallUnit:{domain:'스포츠 인문 문화',middleTitle:'스포츠 인문 문화',smallTitle:'스포츠 인문 문화 단원 마무리',pages:4,standardCodes:['[12스문01-01]']},frameworks:[framework],metricsByFramework:{balanced:{curriculum:5,feasibility:4,engagement:4,novelty:3,safety:5}}});
  const entry=result.entries[0];
  process.stdout.write(JSON.stringify({spreads:entry.spreads.length,counts:entry.manuscriptQuality.spreadCharacterCounts,below:entry.manuscriptQuality.belowMinimumCount,duplicates:entry.manuscriptQuality.duplicateSentenceCount,headlines:new Set(entry.spreads.map(item=>item.textbook_manuscript.headline)).size}));
})().catch(error=>{console.error(error);process.exit(1);});
"""
        result = self.run_node(source)
        self.assertEqual(result["spreads"], 2)
        self.assertTrue(all(count >= 700 for count in result["counts"]))
        self.assertEqual(result["below"], 0)
        self.assertEqual(result["duplicates"], 0)

    def test_external_ai_provider_throttles_parallel_image_requests(self):
        source = r"""
const e=require('./static/prototype-draft-engine.js');
let maxConcurrent=0, current=0, imageCalls=0, manuscriptCalls=0;
global.fetch=async (url)=>{
  if (String(url).includes('sports-culture-manuscript')) {
    manuscriptCalls+=1;
    return { ok:true, status:200, json: async()=>({result:{spreads:[{
      headline:'h', learning_goal:'g', opening_question:'q', deck:'d',
      sections:[{title:'t1',paragraphs:['p1']},{title:'t2',paragraphs:['p2']},{title:'t3',paragraphs:['p3']},{title:'t4',paragraphs:['p4']}],
      left_visuals:[{size:'small',placement:'top',description:'a'},{size:'small',placement:'top',description:'b'},{size:'small',placement:'top',description:'c'}],
      right_visuals:[{size:'small',placement:'top',description:'d'},{size:'small',placement:'top',description:'e'},{size:'small',placement:'top',description:'f'}]
    }]}}) };
  }
  if (String(url).includes('sports-culture-image')) {
    imageCalls+=1;
    current+=1;
    if (current>maxConcurrent) maxConcurrent=current;
    await new Promise(resolve=>setTimeout(resolve,20));
    current-=1;
    return { ok:true, status:200, json: async()=>({result:{imageBase64:'AA=='}}) };
  }
  throw new Error('unexpected url:'+url);
};
(async()=>{
  const framework={id:'balanced',name:'전체 스타일 50 · 균형형'};
  const result=await e.generateDraftSet({
    profileId:e.sportsCultureProfile().id,
    providerId:e.externalAiProviderId,
    carrierSport:'배드민턴',
    sportMode:'primary',
    primaryType:'theory',
    pageRole:'unit-intro',
    styleValue:50,
    includeImages:true,
    smallUnit:{domain:'스포츠 인문 문화',middleTitle:'스포츠 인문 문화',smallTitle:'스포츠 인문 문화 단원 도입',pages:4,standardCodes:['[12스문01-01]']},
    frameworks:[framework],
    metricsByFramework:{balanced:{curriculum:5,feasibility:4,engagement:4,novelty:3,safety:5}}
  });
  process.stdout.write(JSON.stringify({maxConcurrent, imageCalls, manuscriptCalls, spreads:result.entries[0].spreads.length}));
})().catch(error=>{console.error(error);process.exit(1);});
"""
        result = self.run_node(source)
        self.assertEqual(result["spreads"], 2)
        self.assertEqual(result["manuscriptCalls"], 2)
        self.assertEqual(result["imageCalls"], 12)
        self.assertLessEqual(result["maxConcurrent"], 3)

    def test_external_ai_provider_uses_ai_chosen_section_titles_not_the_fixed_template(self):
        source = r"""
const e=require('./static/prototype-draft-engine.js');
global.fetch=async (url)=>{
  if (String(url).includes('sports-culture-manuscript')) {
    return { ok:true, status:200, json: async()=>({result:{spreads:[{
      headline:'h', learning_goal:'g', opening_question:'q', deck:'d',
      sections:[
        {title:'인물의 첫 도전', paragraphs:['p1','p2']},
        {title:'기록이 말해주는 것', paragraphs:['p3','p4']},
        {title:'논쟁의 두 목소리', paragraphs:['p5','p6']}
      ],
      left_visuals:[], right_visuals:[]
    }]}}) };
  }
  throw new Error('unexpected url:'+url);
};
(async()=>{
  const framework={id:'balanced',name:'전체 스타일 50 · 균형형'};
  const result=await e.generateDraftSet({
    profileId:e.sportsCultureProfile().id,
    providerId:e.externalAiProviderId,
    carrierSport:'배드민턴',
    sportMode:'primary',
    primaryType:'theory',
    pageRole:'special-reading',
    styleValue:50,
    smallUnit:{domain:'스포츠 인문 문화',middleTitle:'특별 페이지',smallTitle:'스포츠 인문 문화 읽을거리',pages:2,standardCodes:['[12스문01-01]']},
    frameworks:[framework],
    metricsByFramework:{balanced:{curriculum:5,feasibility:4,engagement:4,novelty:3,safety:5}}
  });
  const titles=result.entries[0].spreads[0].textbook_manuscript.sections.map(s=>s.title);
  process.stdout.write(JSON.stringify({titles}));
})().catch(error=>{console.error(error);process.exit(1);});
"""
        result = self.run_node(source)
        self.assertEqual(
            result["titles"],
            ["인물의 첫 도전", "기록이 말해주는 것", "논쟁의 두 목소리"],
        )
        self.assertNotIn("주제 만나기", result["titles"])

    def test_pptx_export_uses_textbook_manuscript_not_the_old_activity_structure(self):
        source = r"""
const fs=require('fs');
const s=fs.readFileSync('./static/prototype.js','utf8');
const a=s.indexOf('function pptxTruncate');
const b=s.indexOf('function spreadsToPptx');
const api=new Function(s.slice(a,b)+'; return {addEntrySlidesToPptx};')();

function makeSlideRecorder(store) {
  const record = { shapes: [], texts: [], images: [] };
  store.push(record);
  return {
    addShape: (opts) => record.shapes.push(opts),
    addText: (text, opts) => record.texts.push({ text, opts }),
    addImage: (opts) => record.images.push(opts),
  };
}
const slides = [];
const pres = { ShapeType: { line: 'line' }, addSlide: () => makeSlideRecorder(slides) };

const entry = {
  frameworkName: '전체 스타일 · 균형형',
  smallUnitLabel: '스포츠 인문 문화 · 읽을거리',
  spreads: [
    {
      // 옛 구조(activities/support_boxes/intro/wrap_up)도 같이 들고 있지만, PPT는 이제
      // textbook_manuscript만 읽어야 한다 — 옛 필드가 남아 있어도 무시되는지 확인.
      intro: '옛 인트로 문구',
      activities: [{ number: 1, title: '옛 활동', objective: 'x', method: ['a'] }],
      support_boxes: [{ type: '옛 보조', content: 'y' }],
      wrap_up: '옛 마무리 문구',
      textbook_manuscript: {
        headline: '셔틀콕을 따라 읽는 스포츠 문화의 이동',
        learningGoal: '배드민턴의 도구와 전략을 이해한다.',
        openingQuestion: '스포츠가 이동하면 의미도 달라질까?',
        sections: [
          { number: 1, title: '도구가 만들어 낸 경기의 언어', paragraphs: ['문단1', '문단2'] },
          { number: 2, title: '이동하는 스포츠, 달라지는 의미', paragraphs: ['문단3'] },
        ],
        visuals: {
          left: [{ size: 'full', placement: 'background', description: '이미지 있는 삽화', imageBase64: 'AAAA' }],
          right: [{ size: 'small', placement: 'top', description: '이미지 없는 삽화' }],
        },
      },
    },
    {
      textbook_manuscript: {
        headline: '내부 제공자 헤드라인',
        learningGoal: 'g',
        openingQuestion: '',
        sections: [
          { number: 1, title: '내부 절1', paragraphs: ['내부 문단1'] },
        ],
        visualBriefs: ['내부 삽화 설명1', '내부 삽화 설명2'],
      },
    },
  ],
};

api.addEntrySlidesToPptx(pres, entry);

const allTexts = slides.flatMap((slide) => slide.texts.map((t) => t.text));
process.stdout.write(JSON.stringify({
  slideCount: slides.length,
  hasHeadline: allTexts.some((t) => t.includes('셔틀콕을 따라 읽는 스포츠 문화의 이동')),
  hasSectionTitle: allTexts.some((t) => t.includes('도구가 만들어 낸 경기의 언어')),
  hasOldIntro: allTexts.some((t) => t.includes('옛 인트로 문구')),
  hasOldActivity: allTexts.some((t) => t.includes('옛 활동')),
  hasOldWrapUp: allTexts.some((t) => t.includes('옛 마무리 문구')),
  imageCount: slides[0].images.length,
  imageDataStartsCorrectly: (slides[0].images[0]?.data || '').startsWith('data:image/png;base64,AAAA'),
  hasPlainVisualCaption: allTexts.some((t) => t.includes('이미지 없는 삽화')),
  hasInternalHeadline: allTexts.some((t) => t.includes('내부 제공자 헤드라인')),
  hasInternalBrief: allTexts.some((t) => t.includes('내부 삽화 설명1')),
}));
"""
        result = self.run_node(source)
        self.assertEqual(result["slideCount"], 2)
        self.assertTrue(result["hasHeadline"])
        self.assertTrue(result["hasSectionTitle"])
        self.assertFalse(result["hasOldIntro"])
        self.assertFalse(result["hasOldActivity"])
        self.assertFalse(result["hasOldWrapUp"])
        self.assertEqual(result["imageCount"], 1)
        self.assertTrue(result["imageDataStartsCorrectly"])
        self.assertTrue(result["hasPlainVisualCaption"])
        self.assertTrue(result["hasInternalHeadline"])
        self.assertTrue(result["hasInternalBrief"])

    def test_variable_section_count_splits_evenly_without_dropping_content(self):
        source = r"""
const fs=require('fs');
const s=fs.readFileSync('./static/prototype.js','utf8');
const a=s.indexOf('function escapeHtml');
const b=s.indexOf('function renderDraftCanvases');
const api=new Function(s.slice(a,b)+'; return {renderSpreadPageView};')();
const manuscript={
  headline:'h', learningGoal:'g', openingQuestion:'q',
  sections:[
    {number:1,title:'절1',paragraphs:['p1']},
    {number:2,title:'절2',paragraphs:['p2']},
    {number:3,title:'절3',paragraphs:['p3']},
    {number:4,title:'절4',paragraphs:['p4']},
    {number:5,title:'절5',paragraphs:['p5']},
  ],
  visuals:{left:[],right:[]},
};
const entry={frameworkId:'balanced', primaryTypeLabel:'스포츠 문화', smallUnitLabel:'', frameworkName:''};
const spread={textbook_manuscript:manuscript, left_page:1, right_page:2, role:'r'};
const html=api.renderSpreadPageView(entry, spread);
process.stdout.write(JSON.stringify({
  hasAll: ['절1','절2','절3','절4','절5'].every((t)=>html.includes(t)),
}));
"""
        result = self.run_node(source)
        self.assertTrue(result["hasAll"])

    def test_manuscript_page_visuals_normalizes_both_provider_shapes(self):
        source = r"""
const fs=require('fs');
const s=fs.readFileSync('./static/prototype.js','utf8');
const a=s.indexOf('function manuscriptPageVisuals');
const b=s.indexOf('function loadCanvasImage');
const api=new Function(s.slice(a,b)+'; return {manuscriptPageVisuals};')();
const external={visuals:{left:[{description:'L1'}],right:[{description:'R1'},{description:'R2'}]}};
const internal={visualBriefs:['B1','B2','B3']};
process.stdout.write(JSON.stringify({
  externalLeft: api.manuscriptPageVisuals(external,0).map(v=>v.description),
  externalRight: api.manuscriptPageVisuals(external,1).map(v=>v.description),
  internalLeft: api.manuscriptPageVisuals(internal,0).map(v=>v.description),
  internalRight: api.manuscriptPageVisuals(internal,1).map(v=>v.description),
}));
"""
        result = self.run_node(source)
        self.assertEqual(result["externalLeft"], ["L1"])
        self.assertEqual(result["externalRight"], ["R1", "R2"])
        self.assertEqual(result["internalLeft"], ["B1", "B2"])
        self.assertEqual(result["internalRight"], ["B3"])


if __name__ == "__main__":
    unittest.main()
