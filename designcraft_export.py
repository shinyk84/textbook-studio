"""초고 펼침면을 DesignCraft(인디자인과 같은 방식의 조판 프로그램) 문서로 조판한다.

브라우저가 보낸 펼침면 원고(제목·학습 목표·절·삽화 자리)를 DesignCraft 명령 스크립트로
바꾸고, 각자 컴퓨터에 설치된 `designcraft-cli.exe`로 실행해 .designcraft·IDML·PDF를 만든다.
사람은 그 파일을 DesignCraft(또는 IDML을 인디자인)에서 열어 미세 조정한다.

스크립트 한 줄은 `명령 {JSON}` 형식이고, `$N.id`처럼 앞 단계(0부터 센 순번)의 결과를 쓸 수
있다. 좌표 단위는 mm이고 펼침면 좌표계라 오른쪽 쪽은 x가 188mm부터 시작한다.
"""

from __future__ import annotations

import base64
import json
import math
import os
import re
import shutil
import socket
import subprocess
import time
from datetime import datetime
from pathlib import Path

PAGE_WIDTH = 188.0
PAGE_HEIGHT = 257.0
MARGIN_TOP = 16.0
MARGIN_BOTTOM = 20.0
MARGIN_INSIDE = 18.0
MARGIN_OUTSIDE = 14.0
CONTENT_WIDTH = PAGE_WIDTH - MARGIN_INSIDE - MARGIN_OUTSIDE
GAP = 4.0
CONTROL_PORT = 7979
# DesignCraft 명령의 길이 값(쪽 크기·좌표·여백·안쪽 여백·모서리)은 단위 설정과 관계없이 pt로 받는다.
# 배치 계산은 mm로 하고 명령을 쓸 때만 pt로 바꾼다.
PT_PER_MM = 72 / 25.4


def pt(value: float) -> float:
    return round(value * PT_PER_MM, 3)

DOMAIN_COLORS = {
    "운동": ("#2B6CB0", "#E4EEF9"),
    "스포츠": ("#D9661F", "#FCEBDD"),
    "표현": ("#8A44AB", "#F1E6F7"),
}
DEFAULT_COLORS = ("#1F7A5A", "#E3F2EC")
CHECK_COLORS = ("#B7791F", "#FFF6DD")

VISUAL_HEIGHTS = {"full": 92.0, "half": 62.0, "small": 40.0}
VISUAL_GROW_LIMITS = {"full": 130.0, "half": 90.0, "small": 66.0}

DESIGNCRAFT_DIR_CANDIDATES = [
    r"E:\디자인크래프트\DesignCraft",
    r"D:\디자인크래프트\DesignCraft",
    r"C:\디자인크래프트\DesignCraft",
    r"C:\Program Files\DesignCraft",
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\DesignCraft"),
    os.path.expandvars(r"%LOCALAPPDATA%\DesignCraft"),
]


def find_designcraft() -> dict | None:
    """설치 위치를 찾는다. 환경 변수 DESIGNCRAFT_DIR이 있으면 그것을 먼저 쓴다."""
    candidates = [os.environ.get("DESIGNCRAFT_DIR", "")] + DESIGNCRAFT_DIR_CANDIDATES
    for folder in candidates:
        if not folder:
            continue
        cli = Path(folder) / "designcraft-cli.exe"
        app = Path(folder) / "designcraft.exe"
        if cli.is_file():
            return {"dir": str(Path(folder)), "cli": str(cli), "app": str(app) if app.is_file() else ""}
    return None


def designcraft_status() -> dict:
    found = find_designcraft()
    if not found:
        return {"available": False, "dir": "", "version": "", "appRunning": False}
    version = ""
    try:
        completed = subprocess.run([found["cli"], "--version"], capture_output=True, timeout=20, **_no_window())
        version = completed.stdout.decode("utf-8", errors="replace").strip()
    except (OSError, subprocess.SubprocessError):
        pass
    return {"available": True, "dir": found["dir"], "version": version, "appRunning": _control_port_open()}


def _no_window() -> dict:
    if os.name == "nt":
        return {"creationflags": getattr(subprocess, "CREATE_NO_WINDOW", 0)}
    return {}


def _control_port_open() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", CONTROL_PORT), timeout=0.5):
            return True
    except OSError:
        return False


# ── 글꼴 ──
# 교과서 시안은 Pretendard를 쓰고, 없는 컴퓨터에서는 Windows 기본 글꼴(맑은 고딕)로 바꾼다.

def _font_dirs() -> list[Path]:
    dirs = [Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"]
    local = os.environ.get("LOCALAPPDATA")
    if local:
        dirs.append(Path(local) / "Microsoft" / "Windows" / "Fonts")
    return dirs


def pick_fonts() -> dict:
    def has(name: str) -> bool:
        return any((folder / name).is_file() for folder in _font_dirs())

    if has("Pretendard-Regular.ttf") and has("Pretendard-Bold.ttf"):
        return {"family": "Pretendard", "regular": "Regular", "bold": "Bold", "heavy": "ExtraBold" if has("Pretendard-ExtraBold.ttf") else "Bold"}
    return {"family": "Malgun Gothic", "regular": "Regular", "bold": "Bold", "heavy": "Bold"}


# ── 분량 어림 ──
# 글상자 높이를 정하기 전에 글이 몇 줄이 될지 어림한다. 한글 한 글자는 거의 1em(pt×0.3528mm)이고
# 공백·숫자·문장부호는 좁으므로 평균 0.92em으로 잡는다. 실제 넘침은 조판 뒤 story.get으로 다시 확인한다.

def estimate_lines(text: str, size_pt: float, width_mm: float) -> int:
    if not text:
        return 1
    char_mm = size_pt * 0.3528 * 0.92
    per_line = max(1, int(width_mm / char_mm))
    return max(1, math.ceil(len(text) / per_line))


def _clean(value) -> str:
    text = str(value or "")
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", text)
    # 본문 글꼴(Pretendard·맑은 고딕)에 없는 기호는 비슷한 기호로 바꾼다.
    text = text.replace("☐", "□").replace("✔", "").replace("✓", "")
    return text.replace("\r", " ").replace("\n", " ").strip()


class ScriptBuilder:
    """명령 줄을 쌓고, 각 명령의 순번을 돌려줘 `$N.id` 참조를 만들 수 있게 한다."""

    def __init__(self) -> None:
        self.lines: list[str] = []

    def add(self, command: str, params: dict | None = None) -> int:
        self.lines.append(f"{command} {json.dumps(params or {}, ensure_ascii=False)}")
        return len(self.lines) - 1

    def text(self) -> str:
        return "\n".join(self.lines) + "\n"


# 문단 스타일: (이름, 글자 크기, 행간, 굵기, 색 역할, 문단 속성, 문단 배경)
# 문단 배경(shading)이 같은 문단이 이어지면 하나의 상자처럼 합쳐진다.
PARAGRAPH_STYLES = [
    ("러닝헤드", 8.5, 11, "bold", "main", {}),
    ("단원명", 22, 28, "heavy", "main", {"spaceAfter": 1}),
    ("차시", 9, 11, "bold", "paper", {"align": "center"}),
    ("학습목표", 10.5, 16, "regular", "black", {}),
    ("생각열기", 10.5, 16, "regular", "black", {}),
    ("절제목", 13, 18, "bold", "main", {"spaceBefore": 3.5, "spaceAfter": 1.5, "keepWithNext": 2}),
    ("본문", 10.5, 17, "regular", "black", {"spaceAfter": 1.2}),
    ("상자제목", 10.5, 16, "bold", "main", {"spaceBefore": 4.5, "keepWithNext": 2}, "light"),
    ("상자본문", 10, 16, "regular", "black", {}, "light"),
    ("확인제목", 10.5, 16, "bold", "check", {"spaceBefore": 4.5, "keepWithNext": 2}, "check"),
    ("확인본문", 10, 16, "regular", "black", {}, "check"),
    ("그림지시", 8, 11, "regular", "gray", {"align": "center"}),
    ("쪽번호", 9, 11, "bold", "main", {}),
    ("쪽번호오른쪽", 9, 11, "bold", "main", {"align": "right"}),
    ("역할", 9, 12, "bold", "main", {}),
]


def _style_metrics(name: str) -> tuple[float, float, float, float]:
    for style in PARAGRAPH_STYLES:
        if style[0] == name:
            para = style[5]
            pt_to_mm = 0.3528
            before = float(para.get("spaceBefore", 0))
            after = float(para.get("spaceAfter", 0))
            return style[1], style[2] * pt_to_mm, before, after
    return 10.5, 17 * 0.3528, 0, 0


def estimate_paragraphs_height(paragraphs: list[tuple[str, str]], width_mm: float) -> float:
    total = 0.0
    for style, text in paragraphs:
        size, leading_mm, before, after = _style_metrics(style)
        total += estimate_lines(text, size, width_mm) * leading_mm + before + after
    return total


def section_paragraphs(section: dict) -> list[tuple[str, str]]:
    """절 하나를 (문단 스타일, 글) 목록으로 바꾼다. 안전·도움말 같은 상자 절과 스스로 평가 절은
    문단 배경색(shading)으로 상자처럼 보이게 하고, 나머지는 절제목+본문으로 흘린다."""
    title = _clean(section.get("title"))
    lead = _clean(section.get("label")) or _clean(section.get("number"))
    paragraphs = [_clean(item) for item in section.get("paragraphs") or [] if _clean(item)]
    kind = section.get("kind") or ""
    if kind == "check" or (section.get("boxType") and "평가" in str(section.get("boxType"))):
        heading = title or "스스로 평가"
        return [("확인제목", heading)] + [("확인본문", text) for text in paragraphs]
    if section.get("boxType"):
        box_label = _clean(section.get("boxType"))
        heading = box_label if not title or title == box_label else f"{box_label} · {title}"
        return [("상자제목", heading)] + [("상자본문", text) for text in paragraphs]
    heading = f"{lead}  {title}".strip() if lead else title
    rows = [("절제목", heading)] if heading else []
    return rows + [("본문", text) for text in paragraphs]


class BookLayout:
    def __init__(self, book: dict, image_paths: dict[str, str], out_dir: Path) -> None:
        self.book = book
        self.image_paths = image_paths
        self.out_dir = out_dir
        self.fonts = pick_fonts()
        self.script = ScriptBuilder()
        self.stories: list[dict] = []
        self.colors_made: set[str] = set()
        self.domain = ""
        self.domain_styles: set[str] = set()

    # ── 문서·스타일 ──
    def setup(self, page_count: int, start_page: int) -> None:
        s = self.script
        s.add("file.new", {
            "units": "millimeters",
            "width": pt(PAGE_WIDTH),
            "height": pt(PAGE_HEIGHT),
            "pages": page_count,
            "startPage": start_page,
            "facingPages": True,
            "margins": {"top": pt(MARGIN_TOP), "bottom": pt(MARGIN_BOTTOM), "inside": pt(MARGIN_INSIDE), "outside": pt(MARGIN_OUTSIDE)},
            "bleed": pt(3),
            "title": _clean(self.book.get("title")) or "교과서 시안",
        })
        s.add("swatch.create", {"name": "회색글", "color": "#6B7280"})
        s.add("swatch.create", {"name": "확인색", "color": CHECK_COLORS[0]})
        s.add("swatch.create", {"name": "확인바탕", "color": CHECK_COLORS[1]})
        self.ensure_colors("")
        for name, size, leading, weight, color_role, para, *rest in PARAGRAPH_STYLES:
            chars = {
                "fontFamily": self.fonts["family"],
                "fontStyle": self.fonts[weight],
                "size": size,
                "leading": {"kind": "points", "value": leading},
                "fill": {"main": "기본색", "paper": "[Paper]", "black": "[Black]", "gray": "회색글", "check": "확인색"}[color_role],
            }
            para_attrs = {"koreanCharBreaks": True, **{key: pt(value) if key in ("spaceBefore", "spaceAfter") else value for key, value in para.items()}}
            shade = rest[0] if rest else None
            if shade:
                para_attrs.update({"shadingOn": True, "shadingColor": "확인바탕" if shade == "check" else "기본바탕", "shadingOffsets": [3, 5, 3, 5], "shadingWidth": "column"})
            s.add("style.paragraph.create", {"name": name, "chars": chars, "para": para_attrs})
        s.add("style.character.create", {"name": "강조", "chars": {"fontStyle": self.fonts["bold"], "fill": "기본색"}})
        self.picture_layer = s.add("layer.new", {"name": "그림"})
        self.note_layer = s.add("layer.new", {"name": "그림 지시"})
        self.text_layer = s.add("layer.new", {"name": "글"})

    def ensure_colors(self, domain: str) -> tuple[str, str]:
        main, light = DOMAIN_COLORS.get(domain, DEFAULT_COLORS)
        key = domain or "기본"
        main_name = "기본색" if not domain else f"{key}색"
        light_name = "기본바탕" if not domain else f"{key}바탕"
        if key not in self.colors_made:
            self.script.add("swatch.create", {"name": main_name, "color": main})
            self.script.add("swatch.create", {"name": light_name, "color": light})
            self.colors_made.add(key)
        return main_name, light_name

    def styled(self, name: str) -> str:
        """영역(운동·스포츠·표현)마다 제목 색을 바꾸려고, 기본색을 쓰는 스타일은 영역별 하위 스타일을 만든다."""
        spec = next((style for style in PARAGRAPH_STYLES if style[0] == name), None)
        if not spec or not self.domain:
            return name
        uses_main = spec[4] == "main"
        uses_light = len(spec) > 6 and spec[6] == "light"
        if not uses_main and not uses_light:
            return name
        variant = f"{name}·{self.domain}"
        if variant not in self.domain_styles:
            main, light = self.ensure_colors(self.domain)
            params = {"name": variant, "basedOn": name}
            if uses_main:
                params["chars"] = {"fill": main}
            if uses_light:
                params["para"] = {"shadingColor": light}
            self.script.add("style.paragraph.create", params)
            self.domain_styles.add(variant)
        return variant

    # ── 기본 도형 ──
    def layer(self, step: int) -> None:
        self.script.add("layer.activate", {"id": f"${step}.id"})

    def rect(self, spread: int, box: list[float], fill: str | None = None, tint: float | None = None, radius: float = 0, stroke: dict | None = None) -> int:
        s = self.script
        step = s.add("frame.create", {"spread": spread, "rect": [pt(v) for v in box], "content": "graphic"})
        ref = f"${step}.id"
        if fill:
            params = {"swatch": fill, "ids": [ref]}
            if tint is not None:
                params["tint"] = tint
            s.add("object.fill", params)
        s.add("object.stroke", stroke | {"ids": [ref]} if stroke else {"swatch": "[None]", "ids": [ref]})
        if radius:
            s.add("object.cornerOptions", {"shape": "rounded", "size": pt(radius), "ids": [ref]})
        return step

    def text_frame(self, spread: int, box: list[float], paragraphs: list[tuple[str, str]], inset: float | list[float] = 0, label: str = "") -> int:
        """여러 문단을 한 글상자에 넣고 문단마다 스타일을 입힌다(같은 스타일이 이어지면 한 번에)."""
        s = self.script
        joined = "\n".join(text for _, text in paragraphs)
        step = s.add("frame.create", {"spread": spread, "rect": [pt(v) for v in box], "content": "text", "text": joined})
        if inset:
            s.add("object.textFrameOptions", {"inset": [pt(v) for v in inset] if isinstance(inset, list) else pt(inset), "ids": [f"${step}.id"]})
        offset = 0
        runs: list[tuple[str, int, int]] = []
        for style, text in paragraphs:
            length = len(text.encode("utf-8"))
            if runs and runs[-1][0] == style:
                runs[-1] = (style, runs[-1][1], offset + length)
            else:
                runs.append((style, offset, offset + length))
            offset += length + 1
        for style, start, end in runs:
            s.add("text.select", {"story": f"${step}.story", "anchor": start, "focus": max(start, end)})
            s.add("style.paragraph.apply", {"name": self.styled(style)})
        if label:
            self.stories.append({"step": step, "label": label})
        return step

    def emphasize(self, step: int, text: str, prefix: str) -> None:
        """글상자 첫머리의 꼬리표(예: '학습 목표')를 강조 문자 스타일로."""
        if not text.startswith(prefix):
            return
        self.script.add("text.select", {"story": f"${step}.story", "anchor": 0, "focus": len(prefix.encode("utf-8"))})
        name = "강조"
        if self.domain:
            name = f"강조·{self.domain}"
            if name not in self.domain_styles:
                main, _ = self.ensure_colors(self.domain)
                self.script.add("style.character.create", {"name": name, "basedOn": "강조", "chars": {"fill": main}})
                self.domain_styles.add(name)
        self.script.add("style.character.apply", {"name": name})

    # ── 그림 ──
    def visual(self, spread: int, box: list[float], item: dict, light: str, rounded: bool = True, note_at_bottom: bool = False) -> None:
        path = self.image_paths.get(item.get("key", ""))
        self.layer(self.picture_layer)
        if path:
            frame = self.rect(spread, box, radius=3 if rounded else 0)
            self.script.add("file.place", {"path": path, "frame": f"${frame}.id", "link": True})
            self.script.add("object.fit", {"mode": "fillProportionally", "ids": [f"${frame}.id"]})
            self.layer(self.text_layer)
            return
        self.rect(spread, box, fill=light, radius=3 if rounded else 0, stroke={"swatch": "회색글", "weight": 0.5, "type": {"kind": "dashed", "pattern": [3, 2]}})
        self.layer(self.note_layer)
        note = f"그림: {_clean(item.get('description')) or '편집 이미지 영역'}"
        height = min(box[3] - box[1] - 4, estimate_lines(note, 8, box[2] - box[0] - 8) * 4.2 + 2)
        # 쪽 전체 배경 그림은 글이 위에 얹히므로 지시문을 쪽 아래쪽 여백 가까이에 둔다.
        mid = box[3] - 30 if note_at_bottom else (box[1] + box[3]) / 2
        self.text_frame(spread, [box[0] + 12, mid - height / 2, box[2] - 12, mid + height / 2], [("그림지시", note)])
        self.layer(self.text_layer)

    def visual_row(self, spread: int, x0: float, x1: float, y0: float, height: float, items: list[dict], light: str) -> None:
        if not items:
            return
        width = (x1 - x0 - GAP * (len(items) - 1)) / len(items)
        for index, item in enumerate(items):
            left = x0 + index * (width + GAP)
            self.visual(spread, [left, y0, left + width, y0 + height], item, light)

    # ── 쪽 ──
    def page(self, spread_index: int, side: str, data: dict) -> None:
        domain = _clean(data.get("domain"))
        self.domain = domain if domain in DOMAIN_COLORS else ""
        main, light = self.ensure_colors(self.domain)
        offset = 0.0 if side == "left" else PAGE_WIDTH
        x0 = offset + (MARGIN_OUTSIDE if side == "left" else MARGIN_INSIDE)
        x1 = offset + PAGE_WIDTH - (MARGIN_INSIDE if side == "left" else MARGIN_OUTSIDE)
        visuals = [item for item in data.get(f"{side}Visuals") or [] if isinstance(item, dict)]
        background = next((item for item in visuals if item.get("placement") == "background"), None)
        others = [item for item in visuals if item is not background]
        top_items = [item for item in others if item.get("placement") == "top"]
        bottom_items = [item for item in others if item.get("placement") != "top"]

        self.layer(self.picture_layer)
        if background:
            self.visual(spread_index, [offset - (3 if side == "left" else 0), -3, offset + PAGE_WIDTH + (3 if side == "right" else 0), PAGE_HEIGHT + 3], background, light, rounded=False, note_at_bottom=True)
        # 쪽 위 색 띠(바깥쪽)와 러닝헤드
        band_x = [offset - 3, offset + 60] if side == "left" else [offset + PAGE_WIDTH - 60, offset + PAGE_WIDTH + 3]
        self.rect(spread_index, [band_x[0], -3, band_x[1], 9], fill=main)
        self.layer(self.text_layer)
        y = MARGIN_TOP - 6
        running = _clean(data.get("runningHead"))
        if running:
            self.text_frame(spread_index, [x0, y, x1, y + 5], [("러닝헤드", running)])
        y = MARGIN_TOP
        if side == "left":
            lesson = _clean(data.get("lessonLabel"))
            if lesson:
                pill_width = min(60.0, 8 + len(lesson) * 3.4)
                self.rect(spread_index, [x0, y, x0 + pill_width, y + 6.5], fill=main, radius=3.25)
                self.text_frame(spread_index, [x0, y + 1.1, x0 + pill_width, y + 6.5], [("차시", lesson)])
                y += 8.5
            headline = _clean(data.get("headline"))
            if headline:
                height = estimate_lines(headline, 22, x1 - x0) * 28 * 0.3528 + 2
                self.text_frame(spread_index, [x0, y, x1, y + height], [("단원명", headline)])
                y += height + 1.5
            goal = _clean(data.get("learningGoal"))
            if goal:
                text = f"학습 목표  {goal}"
                height = estimate_lines(text, 10.5, x1 - x0 - 8) * 16 * 0.3528 + 5
                self.layer(self.picture_layer)
                self.rect(spread_index, [x0, y, x1, y + height], fill=light, radius=2.5)
                self.layer(self.text_layer)
                step = self.text_frame(spread_index, [x0, y, x1, y + height], [("학습목표", text)], inset=[2.5, 4, 2, 4])
                self.emphasize(step, text, "학습 목표")
                y += height + 2.5
            question = _clean(data.get("openingQuestion"))
            if question:
                text = f"생각 열기  {question}"
                height = estimate_lines(text, 10.5, x1 - x0 - 8) * 16 * 0.3528 + 5
                self.layer(self.picture_layer)
                self.rect(spread_index, [x0, y, x1, y + height], radius=2.5, stroke={"swatch": main, "weight": 0.8})
                self.layer(self.text_layer)
                step = self.text_frame(spread_index, [x0, y, x1, y + height], [("생각열기", text)], inset=[2.5, 4, 2, 4])
                self.emphasize(step, text, "생각 열기")
                y += height + 3
        else:
            role = _clean(data.get("roleLabel"))
            if role:
                self.text_frame(spread_index, [x0, y, x1, y + 5], [("역할", role)])
                y += 7

        body = []
        for section in data.get(f"{side}Sections") or []:
            if isinstance(section, dict):
                body.extend(section_paragraphs(section))
        bottom_limit = PAGE_HEIGHT - MARGIN_BOTTOM
        top_height = max((VISUAL_HEIGHTS.get(item.get("size"), 40.0) for item in top_items), default=0.0)
        bottom_height = max((VISUAL_HEIGHTS.get(item.get("size"), 40.0) for item in bottom_items), default=0.0)
        # 본문이 모자라면 그림 높이부터 줄인다(최소 26mm). 그래도 넘치면 조판 뒤 넘침 목록에 남는다.
        need = estimate_paragraphs_height(body, x1 - x0) + 4 if body else 0
        for _ in range(12):
            room = bottom_limit - y - (top_height + GAP if top_items else 0) - (bottom_height + GAP if bottom_items else 0)
            if room >= need:
                break
            if bottom_items and bottom_height > 26:
                bottom_height = max(26.0, bottom_height - 6)
            elif top_items and top_height > 30:
                top_height = max(30.0, top_height - 6)
            else:
                break
        # 글이 적어 빈자리가 크면 그림을 키워 쪽을 채운다(아래 그림 먼저, 크기별 상한까지).
        room = bottom_limit - y - (top_height + GAP if top_items else 0) - (bottom_height + GAP if bottom_items else 0)
        slack = room - need - 6
        if slack > 8 and (bottom_items or top_items):
            if bottom_items:
                cap = max(VISUAL_GROW_LIMITS.get(item.get("size"), 60.0) for item in bottom_items)
                grow = max(0.0, min(slack, cap - bottom_height))
                bottom_height += grow
                slack -= grow
            if top_items and slack > 8:
                cap = max(VISUAL_GROW_LIMITS.get(item.get("size"), 60.0) for item in top_items)
                top_height += max(0.0, min(slack, cap - top_height))
        if top_items:
            self.visual_row(spread_index, x0, x1, y, top_height, top_items, light)
            y += top_height + GAP
        body_bottom = bottom_limit - (bottom_height + GAP if bottom_items else 0)
        if body:
            self.text_frame(spread_index, [x0, y, x1, max(y + 10, body_bottom)], body, label=f"{data.get('leftPage' if side == 'left' else 'rightPage', '')}쪽 본문")
        if bottom_items:
            self.visual_row(spread_index, x0, x1, bottom_limit - bottom_height, bottom_height, bottom_items, light)

        # 쪽번호·과목명(바깥쪽 아래)
        number = str(data.get("leftPage" if side == "left" else "rightPage") or "")
        subject = _clean(data.get("subjectLabel"))
        footer = f"{number}  {subject}".strip() if side == "left" else f"{subject}  {number}".strip()
        foot_y = PAGE_HEIGHT - 13
        self.text_frame(spread_index, [x0, foot_y, x1, foot_y + 5], [("쪽번호" if side == "left" else "쪽번호오른쪽", footer)])

    def build(self, spreads: list[dict], start_page: int, outputs: dict) -> str:
        self.setup(len(spreads) * 2, start_page)
        self.layer(self.text_layer)
        for index, spread in enumerate(spreads):
            self.page(index, "left", spread)
            self.page(index, "right", spread)
        overset_checks = []
        for story in self.stories:
            overset_checks.append((self.script.add("story.get", {"story": f"${story['step']}.story"}), story["label"]))
        self.overset_checks = overset_checks
        self.script.add("file.save", {"path": outputs["designcraft"]})
        self.script.add("file.exportIdml", {"path": outputs["idml"], "embedImages": False})
        self.script.add("file.exportPdf", {"path": outputs["pdf"], "spreads": True})
        return self.script.text()


def _safe_name(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "_", value).strip(" ._")
    return cleaned[:60] or "교과서시안"


def output_root(app_dir: Path) -> Path:
    configured = os.environ.get("DESIGNCRAFT_OUTPUT_DIR", "").strip()
    return Path(configured) if configured else app_dir / "data" / "designcraft"


def build_designcraft_book(payload: dict, app_dir: Path, fetch_image) -> dict:
    """payload: {title, startPage, spreads:[{domain, runningHead, subjectLabel, lessonLabel, headline,
    learningGoal, openingQuestion, roleLabel, leftPage, rightPage, leftSections, rightSections,
    leftVisuals, rightVisuals}]}. 삽화는 imageId(서버 DB) 또는 imageBase64로 받는다."""
    found = find_designcraft()
    if not found:
        raise ValueError("이 컴퓨터에서 DesignCraft를 찾지 못했습니다. 설치 폴더를 환경 변수 DESIGNCRAFT_DIR로 지정하거나 E:\\디자인크래프트\\DesignCraft에 설치해 주세요.")
    spreads = [item for item in payload.get("spreads") or [] if isinstance(item, dict)]
    if not spreads:
        raise ValueError("조판할 펼침면이 없습니다. 먼저 초고를 생성해 주세요.")
    if len(spreads) > 260:
        raise ValueError("한 번에 260개 펼침면까지 조판할 수 있습니다.")
    title = _clean(payload.get("title")) or "교과서 시안"
    start_page = int(payload.get("startPage") or 2)
    if start_page % 2:
        start_page += 1
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    folder = output_root(app_dir) / f"{_safe_name(title)}_{stamp}"
    images_dir = folder / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    image_paths: dict[str, str] = {}
    page_number = start_page
    for spread_index, spread in enumerate(spreads):
        spread["leftPage"] = page_number
        spread["rightPage"] = page_number + 1
        page_number += 2
        for side in ("left", "right"):
            for item_index, item in enumerate(spread.get(f"{side}Visuals") or []):
                if not isinstance(item, dict):
                    continue
                key = f"s{spread_index + 1:03d}{side[0]}{item_index + 1}"
                item["key"] = key
                data = item.get("imageBase64") or ""
                if not data and item.get("imageId"):
                    data = fetch_image(str(item["imageId"])) or ""
                if not data:
                    continue
                try:
                    raw = base64.b64decode(data, validate=False)
                except (ValueError, TypeError):
                    continue
                path = images_dir / f"{spread['leftPage']:03d}쪽_{key}.png"
                path.write_bytes(raw)
                image_paths[key] = path.as_posix()

    base = _safe_name(title)
    outputs = {
        "designcraft": (folder / f"{base}.designcraft").as_posix(),
        "idml": (folder / f"{base}.idml").as_posix(),
        "pdf": (folder / f"{base}_미리보기.pdf").as_posix(),
    }
    layout = BookLayout({"title": title}, image_paths, folder)
    script_text = layout.build(spreads, start_page, outputs)
    script_path = folder / "조판스크립트.txt"
    script_path.write_text(script_text, encoding="utf-8")

    started = time.time()
    try:
        completed = subprocess.run(
            [found["cli"], "script", str(script_path), "--keep-going"],
            capture_output=True,
            timeout=900,
            **_no_window(),
        )
    except subprocess.TimeoutExpired as exc:
        raise ValueError("DesignCraft 조판이 15분 안에 끝나지 않았습니다. 펼침면 수를 줄여 다시 시도해 주세요.") from exc
    elapsed = round(time.time() - started, 1)
    stdout = completed.stdout.decode("utf-8", errors="replace")
    stderr = completed.stderr.decode("utf-8", errors="replace")
    result = _parse_json_output(stdout)
    if not Path(outputs["designcraft"]).is_file():
        message = (result or {}).get("error") or stderr.strip() or "알 수 없는 오류"
        raise ValueError(f"DesignCraft 조판에 실패했습니다: {message[:400]}")

    errors = _collect_errors(result)
    overset = []
    results = (result or {}).get("results") or []
    for step, label in getattr(layout, "overset_checks", []):
        if step < len(results) and isinstance(results[step], dict) and results[step].get("overset"):
            overset.append(label)
    (folder / "조판결과.json").write_text(stdout, encoding="utf-8")
    return {
        "folder": folder.as_posix(),
        "files": outputs,
        "spreads": len(spreads),
        "pages": len(spreads) * 2,
        "startPage": start_page,
        "images": len(image_paths),
        "placeholders": sum(len(s.get("leftVisuals") or []) + len(s.get("rightVisuals") or []) for s in spreads) - len(image_paths),
        "overset": overset,
        "errors": errors[:20],
        "seconds": elapsed,
        "commands": len(layout.script.lines),
    }


def _parse_json_output(stdout: str) -> dict | None:
    """`script` 결과는 JSON 하나지만 앞뒤에 다른 줄이 붙을 수 있어 첫 '{'부터 해석한다."""
    start = stdout.find("{")
    if start < 0:
        return None
    try:
        value, _ = json.JSONDecoder().raw_decode(stdout[start:])
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _collect_errors(result: dict | None) -> list[str]:
    if not result:
        return []
    errors = []
    if result.get("error"):
        errors.append(str(result["error"]))
    for item in result.get("errors") or []:
        errors.append(json.dumps(item, ensure_ascii=False) if not isinstance(item, str) else item)
    return errors


def open_in_designcraft(path: str) -> dict:
    """DesignCraft 창에 문서를 연다. 제어 포트로 이미 떠 있으면 그 창에, 아니면 새로 실행한다."""
    found = find_designcraft()
    if not found or not found["app"]:
        raise ValueError("이 컴퓨터에서 DesignCraft 프로그램(designcraft.exe)을 찾지 못했습니다.")
    target = Path(path)
    if not target.is_file() or target.suffix.lower() not in (".designcraft", ".idml"):
        raise ValueError("열 수 있는 DesignCraft 문서가 아닙니다.")
    if not _control_port_open():
        subprocess.Popen([found["app"], "--control", str(CONTROL_PORT)], close_fds=True)
        for _ in range(60):
            time.sleep(0.5)
            if _control_port_open():
                break
        else:
            raise ValueError("DesignCraft를 실행했지만 연결되지 않았습니다. 프로그램 창이 떴는지 확인해 주세요.")
    params = json.dumps({"path": target.as_posix()}, ensure_ascii=False)
    completed = subprocess.run([found["cli"], "app", "--port", str(CONTROL_PORT), "file.open", params], capture_output=True, timeout=120, **_no_window())
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ValueError(f"DesignCraft에서 문서를 열지 못했습니다: {detail[:300]}")
    _bring_to_front("DesignCraft")
    return {"opened": target.as_posix()}


def _bring_to_front(title: str) -> None:
    """문서를 연 DesignCraft 창을 앞으로 가져온다(Windows가 막으면 작업 표시줄에서 깜박이기만 한다)."""
    if os.name != "nt":
        return
    script = f"(New-Object -ComObject WScript.Shell).AppActivate('{title}') | Out-Null"
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", script], capture_output=True, timeout=10, **_no_window())
    except (OSError, subprocess.SubprocessError):
        pass


def is_inside(folder: Path, path: str) -> bool:
    try:
        Path(path).resolve().relative_to(folder.resolve())
        return True
    except (ValueError, OSError):
        return False


def remove_build(folder: str, root: Path) -> None:
    if is_inside(root, folder):
        shutil.rmtree(folder, ignore_errors=True)
