import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import app


ROOT = Path(__file__).resolve().parents[1]

LOAD = (
    "global.window=global;"
    "require('./static/prototype-curriculum-data.js');"
    "require('./static/elementary-pe-evidence.js');"
    "const engine=require('./static/prototype-draft-engine.js');"
    "const E=require('./static/elementary-draft-engine.js');"
    # 내부 데이터 조합은 없앴다. 원고는 늘 서버(근거 검색 + AI)가 쓰므로, 시험에서는 서버 응답을 흉내 낸다.
    "global.requests=[];"
    "global.fetch=async(url,init)=>{const body=JSON.parse(init.body);requests.push({url:String(url),body});"
    "if(String(url).includes('sports-culture-image'))return{ok:true,status:200,json:async()=>({result:{imageBase64:'AA==',imageId:'img'+requests.length}})};"
    "if(String(url).includes('sports-culture-manuscript'))return{ok:true,status:200,json:async()=>({result:{spreads:body.spreads.map(()=>({"
    "headline:'h',learning_goal:'g',opening_question:'q',deck:'d',sections:[{title:'t',paragraphs:['p'],box_type:null}],left_visuals:[],right_visuals:[]}))}})};"
    "const s=body.spread||{};const titles=s.suggestedActivityTitles||[];"
    "return{ok:true,status:200,json:async()=>({result:{spreads:[{headline:'AI 제목',learning_goal:'목표',opening_question:'질문',deck:'안내',"
    "sections:[{title:'이야기',paragraphs:['문단']}],activities:Array.from({length:s.activityCount||0},(_,i)=>({title:titles[i]||('활동'+i),steps:['따라 해 봐요.'],tip:''})),"
    "boxes:[{type:'준비물',content:'공'},{type:'안전',content:'간격'},{type:'도움말',content:'천천히'}],self_check:['알았나요?','할 수 있나요?','즐겼나요?'],"
    "left_visuals:[{size:'half',placement:'top',description:'그림'}],right_visuals:[{size:'small',placement:'bottom',description:'작은 그림'}]}]}})};};"
    "const run=(target,style=50,extra={})=>engine.generateDraftSet({profileId:E.profileId,providerId:engine.externalAiProviderId,"
    "styleValue:style,smallUnit:target,frameworks:[{id:'f',name:'전체 스타일'}],metricsByFramework:{f:{}},...extra})"
    ".then(r=>r.entries[0]);"
)


@unittest.skipUnless(shutil.which("node"), "Node.js가 설치된 환경에서 실행")
class ElementaryDraftEngineTests(unittest.TestCase):
    def run_node(self, body: str) -> dict:
        completed = subprocess.run(
            ["node", "-e", LOAD + "(async()=>{" + body + "})().catch(e=>{console.error(e);process.exit(1)});"],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
        return json.loads(completed.stdout)

    def test_strategy_game_follows_skill_strategy_game_flow_across_lessons(self):
        result = self.run_node(
            "const e=await run({pageRole:'small-unit',gradeLabel:'6학년',domain:'스포츠',subdomain:'전략형 스포츠 유형별 활동',"
            "middleTitle:'2-1. 영역형',smallTitle:'2-1-2. 농구형 게임에 도전해요',sourceActivity:'농구형 게임',hours:6,pages:6,lessonStart:31},50,{feedbackNotes:['활동 설명을 짧게']});"
            "const titles=e.spreads.flatMap(s=>s.activities.map(a=>a.title));"
            "process.stdout.write(JSON.stringify({type:e.lessonType,lessons:e.spreads.map(s=>s.lesson_label),"
            "codes:e.traceability.standardCodes,roles:e.spreads.map(s=>s.role),unique:new Set(titles).size===titles.length,"
            "notes:requests.map(r=>r.body.feedbackNotes),"
            "check:e.spreads.every(s=>s.textbook_manuscript.sections.some(x=>x.kind==='check')),"
            "flow:e.spreads[0].teacher_guide.lessonFlow.map(f=>f.stage)}));"
        )
        self.assertEqual(result["type"], "game")
        self.assertEqual(result["lessons"], ["31~32차시", "33~34차시", "35~36차시"])
        self.assertEqual(result["codes"], ["[6체02-05]", "[6체02-06]", "[6체02-11]"])
        self.assertEqual(result["roles"], ["기능 익히기", "기본 전략", "게임 하기"])
        self.assertTrue(result["unique"])
        self.assertEqual(result["notes"], [["활동 설명을 짧게"]] * 3)
        self.assertTrue(result["check"])
        self.assertEqual(result["flow"][0], "31차시 도입(5분)")
        self.assertEqual(result["flow"][-1], "32차시 정리(5분)")

    def test_ai_draft_fills_illustrations_when_images_are_requested(self):
        result = self.run_node(
            "const target={pageRole:'small-unit',gradeLabel:'3학년',domain:'스포츠',middleTitle:'2-3. 조작 움직임',smallTitle:'2-3-1. 던지기에 도전해요',"
            "sourceActivity:'던지기',hours:2,pages:2,lessonStart:55};"
            "await run(target);const before=requests.filter(r=>r.url.includes('image')).length;"
            "const e=await run(target,50,{includeImages:true});"
            "const images=requests.filter(r=>r.url.includes('image'));"
            "const v=e.spreads.flatMap(s=>[...s.textbook_manuscript.visuals.left,...s.textbook_manuscript.visuals.right]);"
            "process.stdout.write(JSON.stringify({before,calls:images.length,visuals:v.length,filled:v.filter(x=>x.imageId).length,"
            "audience:[...new Set(images.map(r=>r.body.audience))]}));"
        )
        self.assertEqual(result["before"], 0)
        self.assertEqual(result["visuals"], 2)
        self.assertEqual(result["calls"], 2)
        self.assertEqual(result["filled"], 2)
        self.assertEqual(result["audience"], ["elementary"])

    def test_lower_grade_short_unit_uses_core_pair_and_friendly_voice(self):
        result = self.run_node(
            "const e=await run({pageRole:'small-unit',gradeLabel:'3학년',domain:'운동',subdomain:'기본 체력운동',"
            "middleTitle:'1-1. 체력운동 관련 기본 움직임 기술',smallTitle:'1-1-1. 걷기에 도전해요',sourceActivity:'걷기',hours:3,pages:2,lessonStart:1});"
            "const s=e.spreads[0];"
            "process.stdout.write(JSON.stringify({type:e.lessonType,role:s.role,"
            "boxes:s.support_boxes.map(b=>b.type),guide:s.teacher_guide.differentiation.some(d=>d.startsWith('참여가 어려운 학생'))}));"
        )
        self.assertEqual(result["type"], "fitness")
        self.assertEqual(result["role"], "기능 익히기·도전하기")
        self.assertEqual(result["boxes"], ["준비물", "안전", "도움말"])
        self.assertTrue(result["guide"])

    def test_lesson_type_inference_separates_fitness_from_health(self):
        result = self.run_node(
            "const t=(domain,subdomain,activity)=>E.inferLessonType({domain,subdomain,middleTitle:'',smallTitle:'',sourceActivity:activity});"
            "process.stdout.write(JSON.stringify(["
            "t('운동','건강 체력 및 운동 체력','근력'),t('운동','건강 운동 및 생활 습관','위생'),"
            "t('운동','성장 및 안전 활동','운동 관련 안전사고 예방 및 대처 활동'),t('스포츠','생태형 스포츠 유형별 활동','등산 활동'),"
            "t('스포츠','전략형 스포츠 유형별 활동','배구형 게임'),t('스포츠','기본 움직임의 기초 기술','던지기'),t('표현','현대 표현 활동','라인댄스 활동')]));"
        )
        self.assertEqual(result, ["fitness", "health", "health", "eco", "game", "skill", "expression"])

    def test_unit_intro_closing_and_corner_have_elementary_blocks(self):
        result = self.run_node(
            "const base={gradeLabel:'4학년',domain:'표현',middleTitle:'단원 도입·마무리',hours:0,pages:2,unitTitle:'3. 표현',"
            "unitOutline:[{middleTitle:'3-1. 모방 표현',smallTitles:['3-1-1. 사물 표현에 도전해요'],activities:['사물 표현']}]};"
            "const intro=await run({...base,pageRole:'unit-intro',smallTitle:'표현 단원 도입'});"
            "const closing=await run({...base,pageRole:'unit-closing',smallTitle:'표현 단원 마무리'});"
            "const corner=await run({...base,pageRole:'corner-safety',smallTitle:'표현 · 안전 특집',specialTypeLabel:'안전 특집'});"
            "process.stdout.write(JSON.stringify({roles:requests.map(r=>r.body.pageRole),closingHeadline:closing.spreads[0].textbook_manuscript.headline,"
            "corner:corner.spreads[0].lesson_label,introCarrier:intro.carrierSport}));"
        )
        self.assertEqual(result["roles"], ["unit-intro", "unit-closing", "corner-safety"])
        self.assertEqual(result["closingHeadline"], "AI 제목")
        self.assertEqual(result["corner"], "확장 코너")
        self.assertEqual(result["introCarrier"], "")

    def test_every_curriculum_activity_has_preprocessed_evidence(self):
        result = self.run_node(
            "const a=globalThis.ELEMENTARY_PE_EVIDENCE.activities;"
            "process.stdout.write(JSON.stringify({count:Object.keys(a).length,empty:Object.keys(a).filter(k=>!a[k].evidence.length)}));"
        )
        self.assertGreaterEqual(result["count"], 120)
        self.assertEqual(result["empty"], [])

    def test_sports_culture_generation_still_uses_its_own_profile(self):
        result = self.run_node(
            "const r=await engine.generateDraftSet({profileId:'sports-culture-2022',providerId:engine.externalAiProviderId,carrierSport:'배드민턴',"
            "sportMode:'primary',primaryType:'theory',smallUnit:{domain:'스포츠 인문 문화',middleTitle:'1. 스포츠 인문 문화의 이해',"
            "smallTitle:'스포츠 문화의 의미와 형성',pages:2,hours:1,standardCodes:['[12스문01-01]']},frameworks:[{id:'balanced',name:'b'}],"
            "metricsByFramework:{balanced:{curriculum:3}}});"
            "process.stdout.write(JSON.stringify({profile:r.entries[0].profileId||null,codes:r.entries[0].traceability.standardCodes}));"
        )
        self.assertEqual(result, {"profile": None, "codes": ["[12스문01-01]"]})


class ElementaryManuscriptSchemaTests(unittest.TestCase):
    def test_broken_ai_output_is_detected_for_retry(self):
        # 2026-11-05 굴리기 초고: 단계에 필드 이름("tip"·"title")이 나오고, 한 줄이 1천 자로 이어지며 일본어가 섞였다.
        def spread(steps):
            return {"spreads": [{"headline": "공을 굴려요", "activities": [{"title": "색깔 섬", "steps": steps, "tip": "손을 낮춰요."}]}]}

        good = spread(["출발선에 서요.", "공을 굴려 원 안에 멈춰요."])
        self.assertFalse(app.manuscript_looks_corrupted(good, "elementary_pe_manuscript"))
        for steps in (["공을 굴려요.", "tip", "title"], ["공을 굴려요。さらに、力を変えて試します。"], ["공을 굴려요. " * 60]):
            self.assertTrue(app.manuscript_looks_corrupted(spread(steps), "elementary_pe_manuscript"), steps[:1])

    def test_small_unit_schema_sizes_activities_by_lesson_count(self):
        # 활동 수는 고정하지 않지만, 펼침면이 맡은 차시 분량을 넘지 않게 상한만 둔다.
        limits = {lessons: app.elementary_pe_manuscript_schema("small-unit", 3, lessons)["properties"]["spreads"]["items"]["properties"]["activities"]["maxItems"] for lessons in (0, 1, 2, 3, 5)}
        self.assertEqual(limits, {0: 2, 1: 2, 2: 3, 3: 4, 5: 4})
        schema = app.elementary_pe_manuscript_schema("small-unit", 3, 3)
        spread = schema["properties"]["spreads"]["items"]
        self.assertEqual(spread["properties"]["activities"]["minItems"], 1)
        self.assertEqual(spread["properties"]["activities"]["items"]["properties"]["steps"]["maxItems"], 4)
        self.assertEqual(spread["properties"]["boxes"]["minItems"], 0)
        self.assertEqual(spread["properties"]["self_check"]["minItems"], 3)
        self.assertEqual(set(spread["required"]), set(spread["properties"]))

    def test_intro_schema_allows_text_blocks_without_activities(self):
        spread = app.elementary_pe_manuscript_schema("unit-intro", 2)["properties"]["spreads"]["items"]
        self.assertEqual(spread["properties"]["activities"]["minItems"], 0)
        self.assertEqual(spread["properties"]["sections"]["minItems"], 2)

    def test_endpoint_rejects_missing_small_unit(self):
        with self.assertRaises(ValueError):
            app.call_prototype_elementary_pe_manuscript({"smallTitle": ""})


class UnitTitleProposalTests(unittest.TestCase):
    def test_proposal_keeps_only_requested_keys(self):
        generated = {"middles": [
            {"middle_key": "0:0:0", "title": "튼튼한 몸의 바탕을 만들어요", "alternatives": ["가", "나"], "smalls": [
                {"small_key": "0:0:0:0", "title": "바르게 걸으며 체력을 키워요", "alternatives": ["다", "라"], "reason": "까닭"},
                {"small_key": "9:9:9:9", "title": "없는 소단원", "alternatives": ["마", "바"], "reason": ""},
            ]},
            {"middle_key": "5:5:5", "title": "없는 중단원", "alternatives": ["사", "아"], "smalls": []},
        ]}
        payload = {"gradeLabel": "3학년", "band": "3~4학년군", "middles": [
            {"key": "0:0:0", "domain": "운동", "currentTitle": "체력운동 관련 기본 움직임 기술",
             "smalls": [{"key": "0:0:0:0", "sourceActivity": "걷기", "currentTitle": "걷기에 도전해요"}]},
        ]}
        with mock.patch.object(app, "secret_environment_value", return_value="sk-test"), \
                mock.patch.object(app, "request_structured_manuscript", return_value=generated) as request:
            result = app.call_prototype_elementary_unit_titles(payload)
        self.assertEqual(request.call_args.kwargs["count_key"], "middles")
        self.assertIn("published_examples", request.call_args.args[2])
        self.assertEqual([item["key"] for item in result["middles"]], ["0:0:0"])
        self.assertEqual([item["key"] for item in result["middles"][0]["smalls"]], ["0:0:0:0"])

    def test_schema_fixes_middle_count(self):
        schema = app.elementary_unit_titles_schema(4)
        self.assertEqual(schema["properties"]["middles"]["minItems"], 4)
        self.assertEqual(schema["properties"]["middles"]["maxItems"], 4)


class OpenAiKeySettingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app_dir = Path(self.temp.name)
        (self.app_dir / ".env.local").write_text("OTHER_KEY=keep\nOPENAI_API_KEY=sk-old-0000000000000000\n", encoding="utf-8")
        self.patches = [
            mock.patch.object(app, "APP_DIR", self.app_dir),
            mock.patch.dict(app.os.environ, {}, clear=False),
        ]
        for patch in self.patches:
            patch.start()
        app.os.environ.pop("OPENAI_API_KEY", None)
        app.os.environ.pop("VERCEL", None)

    def tearDown(self):
        for patch in reversed(self.patches):
            patch.stop()
        self.temp.cleanup()

    def test_save_replaces_key_and_keeps_other_lines(self):
        result = app.save_openai_key("sk-new-key-1234567890abcd", verify=lambda key: "ok")
        text = (self.app_dir / ".env.local").read_text(encoding="utf-8")
        self.assertIn("OTHER_KEY=keep", text)
        self.assertIn("OPENAI_API_KEY=sk-new-key-1234567890abcd", text)
        self.assertNotIn("sk-old", text)
        self.assertEqual(result["masked"], "····abcd")
        self.assertEqual(result["source"], "local-file")
        self.assertNotIn("sk-new", json.dumps(result))

    def test_rejected_key_is_not_saved(self):
        with self.assertRaises(ValueError):
            app.save_openai_key("sk-bad-key-1234567890abcd", verify=lambda key: "invalid")
        self.assertIn("sk-old", (self.app_dir / ".env.local").read_text(encoding="utf-8"))

    def test_malformed_key_is_rejected_without_network(self):
        with self.assertRaises(ValueError):
            app.save_openai_key("not a key", verify=lambda key: self.fail("검증 요청을 보내면 안 됨"))

    def test_empty_key_removes_it(self):
        result = app.save_openai_key("", verify=lambda key: self.fail("삭제는 검증하지 않음"))
        self.assertFalse(result["configured"])
        self.assertIn("OTHER_KEY=keep", (self.app_dir / ".env.local").read_text(encoding="utf-8"))


class TableExportTests(unittest.TestCase):
    PAYLOAD = {
        "title": "3학년 단원명 제안",
        "subtitle": "초등 체육 3~4학년군",
        "columns": ["구분", "제안 당시 이름", "AI 제안", "까닭"],
        "rows": [["중단원", "체력운동 관련 기본 움직임 기술", "튼튼한 몸의 바탕을 만들어요", "배움 방향"],
                 ["소단원", "걷기에 도전해요", "걸으며 기초 체력을 길러요", "줄바꿈\n포함 & <특수문자>"]],
        "widths": [1, 3, 3, 4],
        "filename": "단원명/제안",
    }

    def test_xlsx_and_docx_are_valid_office_packages(self):
        import io
        import zipfile
        from xml.dom import minidom

        for file_format, part in (("xlsx", "xl/worksheets/sheet1.xml"), ("docx", "word/document.xml")):
            content, filename, content_type = app.build_table_export({**self.PAYLOAD, "format": file_format})
            self.assertEqual(filename, f"단원명_제안.{file_format}")
            self.assertIn("openxmlformats", content_type)
            xml = zipfile.ZipFile(io.BytesIO(content)).read(part).decode("utf-8")
            minidom.parseString(xml)
            self.assertIn("걸으며 기초 체력을 길러요", xml)
            self.assertIn("&lt;특수문자&gt;", xml)

    def test_hwpx_export_and_unknown_format(self):
        content, filename, _ = app.build_table_export({**self.PAYLOAD, "format": "hwpx"})
        self.assertTrue(filename.endswith(".hwpx"))
        self.assertTrue(content.startswith(b"PK"))
        with self.assertRaises(ValueError):
            app.build_table_export({**self.PAYLOAD, "format": "exe"})


if __name__ == "__main__":
    unittest.main()
