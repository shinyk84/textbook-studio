"""펼침면 디자인 시안(이미지 한 장)을 DesignCraft에서 고칠 수 있는 조판 문서로 옮긴다.

시안 이미지를 보고 만든 배치 명세(상자·글·그림 자리, 시안 픽셀 좌표)를 받아
- 상자·말풍선·별·구분선은 DesignCraft 도형으로 다시 그리고,
- 글은 실제 글상자(문단 스타일 적용)로 넣고,
- 삽화·아이콘은 시안에서 잘라 배경을 투명하게 지운 뒤 그 자리에 놓는다.
원본 시안은 숨긴 '시안 원본' 레이어에 깔아 두어 디자이너가 켜 보고 맞춰 볼 수 있게 한다.

배치 명세 형식(시안 하나 = 펼침면 하나):
{
  "image": "시안.png",            # 시안 경로(잘라 쓸 원본)
  "size": [1536, 1024],           # 명세 좌표의 기준 크기(보통 시안 픽셀 크기)
  "background": "#F6F1FB",
  "items": [
    {"kind": "box", "box": [x0,y0,x1,y1], "fill": "#FFFFFF", "stroke": "#D9CCEB", "strokeWidth": 2,
     "radius": 14, "corners": "top" | "bottom" | None, "shape": "rect" | "ellipse" | "star", "dashed": false},
    {"kind": "line", "box": [x0,y0,x1,y1], "stroke": "#C9B8E4", "strokeWidth": 1.5, "dashed": true},
    {"kind": "text", "box": [...], "text": "줄1\\n줄2", "role": "제목", "size": 44, "weight": "heavy",
     "color": "#6B47A6", "align": "left" | "center" | "right", "valign": "top" | "center",
     "font": "display" | "body", "spans": [{"match": "한눈에!", "size": 34}]},
    {"kind": "art", "box": [...], "label": "공 그림", "keep": false},   # keep: 배경을 지우지 않고 그대로
    {"kind": "qr", "box": [...], "content": "https://...", "color": "#6B47A6"}
  ]
}
크기·선 굵기·모서리 값도 명세 좌표(시안 픽셀) 단위이고, 쪽 크기에 맞춰 비례 변환한다.
"""

from __future__ import annotations

import base64
import copy
import io
import json
import os
import re
import secrets
import subprocess
import time
from collections import deque
from datetime import datetime
from http import HTTPStatus
from http.client import HTTPException as HttpClientError
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw

import designcraft_export as dc

SPREAD_WIDTH = dc.PAGE_WIDTH * 2
WEIGHTS = {"regular": "regular", "medium": "regular", "bold": "bold", "heavy": "heavy"}


def display_font(fonts: dict) -> dict:
    """제목용 둥근 고딕(나눔스퀘어라운드)이 있으면 쓰고, 없으면 본문 글꼴을 그대로 쓴다."""
    def has(name: str) -> bool:
        return any((folder / name).is_file() for folder in dc._font_dirs())

    if has("NanumSquareRoundOTFEB.otf") and has("NanumSquareRoundOTFB.otf"):
        return {"family": "NanumSquareRoundOTF", "regular": "Bold", "bold": "Bold", "heavy": "ExtraBold"}
    return fonts


# ── 그림 잘라 내기 ──
# 시안의 삽화는 배경(상자 바탕색) 위에 그려져 있다. 가장자리에서 이어지는 배경색 영역만
# 투명하게 지워(flood fill) 그림 안쪽의 흰 옷·하이라이트는 남기고 테두리 사각형이 보이지 않게 한다.

def _border_color(pixels, width: int, height: int) -> tuple[int, int, int]:
    samples = []
    for x in range(width):
        samples.append(pixels[x, 0])
        samples.append(pixels[x, height - 1])
    for y in range(height):
        samples.append(pixels[0, y])
        samples.append(pixels[width - 1, y])
    channels = list(zip(*[sample[:3] for sample in samples]))
    return tuple(sorted(channel)[len(channel) // 2] for channel in channels)


def cut_out(image: Image.Image, box: list[float], keep: bool = False, tolerance: int = 34, scale: int = 2) -> Image.Image:
    left, top, right, bottom = [int(round(value)) for value in box]
    piece = image.crop((left, top, right, bottom)).convert("RGBA")
    if keep or piece.width < 3 or piece.height < 3:
        return piece.resize((piece.width * scale, piece.height * scale), Image.LANCZOS)
    pixels = piece.load()
    width, height = piece.size
    base = _border_color(pixels, width, height)

    def near(pixel) -> bool:
        return sum(abs(pixel[index] - base[index]) for index in range(3)) <= tolerance

    seen = bytearray(width * height)
    queue = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if seen[index] or not near(pixels[x, y]):
            continue
        seen[index] = 1
        if x > 0:
            queue.append((x - 1, y))
        if x < width - 1:
            queue.append((x + 1, y))
        if y > 0:
            queue.append((x, y - 1))
        if y < height - 1:
            queue.append((x, y + 1))
    # 지운 영역 바로 옆 한 칸은 반투명으로 두어 가장자리가 계단처럼 보이지 않게 한다.
    for y in range(height):
        for x in range(width):
            index = y * width + x
            r, g, b, _ = pixels[x, y]
            if seen[index]:
                pixels[x, y] = (r, g, b, 0)
            elif (x > 0 and seen[index - 1]) or (x < width - 1 and seen[index + 1]) or (y > 0 and seen[index - width]) or (y < height - 1 and seen[index + width]):
                pixels[x, y] = (r, g, b, 150)
    return piece.resize((width * scale, height * scale), Image.LANCZOS)


# ── 펼침면 시안 → 낱쪽 두 개 ──
# 시안은 보기 쉽게 펼침면 한 장으로 그리지만 인쇄·조판은 쪽 단위다. 가운데 접히는 곳(안쪽 여백 띠)에
# 걸친 항목을 정리해 모든 항목이 한 쪽 안에만 있게 한다.
#  - 두 쪽에 고루 걸친 바탕 상자(양쪽 모두 폭의 25% 이상)는 쪽마다 하나씩 둘로 나눈다.
#  - 그 밖에 걸친 항목은 더 많이 걸친 쪽으로 옮기고, 안에 든 항목(가운데 점이 상자 안)도 함께 옮긴다.
#  - 옮긴 묶음이 쪽에 다 들어가지 않으면 가로로 줄인다(글자 크기도 같은 비율, 최소 85%).

INNER_MARGIN_MM = 10.0
OUTER_MARGIN_MM = 6.0
# 접지를 넘어도 되는 큰 삽화: 가로가 한 쪽 폭의 절반 이상이고 세로가 쪽 높이의 4분의 1 이상인 그림.
SPANNING_ART_WIDTH = 0.5
SPANNING_ART_HEIGHT = 0.25


def is_spanning_art(item: dict, width: float, height: float) -> bool:
    if item.get("kind") != "art":
        return False
    box = item["box"]
    return box[2] - box[0] >= width / 2 * SPANNING_ART_WIDTH and box[3] - box[1] >= height * SPANNING_ART_HEIGHT


def _area(box: list[float]) -> float:
    return max(0.0, box[2] - box[0]) * max(0.0, box[3] - box[1])


def _inside(outer: list[float], inner: list[float], tolerance: float = 4.0) -> bool:
    return (outer[0] - tolerance <= inner[0] and inner[2] <= outer[2] + tolerance
            and outer[1] - tolerance <= inner[1] and inner[3] <= outer[3] + tolerance)


def split_into_pages(spec: dict) -> tuple[list[dict], int]:
    """펼침면 명세의 항목을 왼쪽·오른쪽 쪽 안으로 정리한 새 목록과, 손댄 항목 수를 돌려준다."""
    width = float((spec.get("size") or MOCKUP_SIZE)[0])
    per_mm = width / SPREAD_WIDTH
    middle = width / 2
    left_limit = middle - INNER_MARGIN_MM * per_mm
    right_limit = middle + INNER_MARGIN_MM * per_mm
    outer = OUTER_MARGIN_MM * per_mm
    items = [copy.deepcopy(item) for item in spec.get("items") or []]
    count = len(items)
    original = [list(item["box"]) for item in items]

    containers = [index for index, item in enumerate(items) if item.get("kind") == "box" and (item.get("shape") or "rect") == "rect"]
    parent: dict[int, int] = {}
    for index, item in enumerate(items):
        candidates = [other for other in containers if other != index and _area(items[other]["box"]) > _area(item["box"]) and _inside(items[other]["box"], item["box"])]
        if candidates:
            parent[index] = min(candidates, key=lambda other: _area(items[other]["box"]))
    # 큰 삽화는 접지를 넘어 펼침면에 걸쳐도 되므로 그대로 둔다(옮기거나 줄이는 묶음에서도 뺀다).
    spanning = {index for index, item in enumerate(items) if is_spanning_art(item, width, float((spec.get("size") or MOCKUP_SIZE)[1]))}
    children: dict[int, list[int]] = {}
    for index, owner in parent.items():
        if index not in spanning:
            children.setdefault(owner, []).append(index)

    def subtree(index: int) -> list[int]:
        found = [index]
        for child in children.get(index, []):
            found.extend(subtree(child))
        return found

    def crosses(box: list[float]) -> bool:
        return box[0] < right_limit and box[2] > left_limit

    def fit(group: list[int], low: float, high: float) -> None:
        start = min(items[index]["box"][0] for index in group)
        end = max(items[index]["box"][2] for index in group)
        if start >= low and end <= high:
            return
        if end - start <= high - low:
            shift = low - start if start < low else high - end
            scale, origin, target = 1.0, start, start + shift
        else:
            scale, origin, target = (high - low) / (end - start), start, low
        for index in group:
            item = items[index]
            box = item["box"]
            box[0] = target + (box[0] - origin) * scale
            box[2] = target + (box[2] - origin) * scale
            if scale < 1:
                if item.get("kind") == "text":
                    item["size"] = float(item.get("size") or 14) * max(scale, 0.85)
                    for span in item.get("spans") or []:
                        if span.get("size"):
                            span["size"] = float(span["size"]) * max(scale, 0.85)
                if item.get("kind") == "art":
                    item["fit"] = "proportional"

    inserts: dict[int, dict] = {}
    touched: set[int] = set(spanning)

    def side_of(box: list[float]) -> str:
        left = min(box[2], middle) - box[0]
        right = box[2] - max(box[0], middle)
        return "left" if left >= right else "right"

    def settle(indices: list[int], low_left: float, high_right: float) -> None:
        for index in indices:
            box = items[index]["box"]
            if index in touched or not crosses(box):
                continue
            span = box[2] - box[0]
            left_part, right_part = left_limit - box[0], box[2] - right_limit
            if index in containers and left_part >= span * 0.25 and right_part >= span * 0.25:
                copy_right = copy.deepcopy(items[index])
                copy_right["box"] = [right_limit, box[1], box[2], box[3]]
                items[index]["box"] = [box[0], box[1], left_limit, box[3]]
                inserts[index] = copy_right
                touched.add(index)
                pad = 6 * per_mm
                sides: dict[str, list[int]] = {"left": [], "right": []}
                for child in children.get(index, []):
                    sides[side_of(items[child]["box"])].extend(subtree(child))
                for group in sides.values():
                    touched.update(group)
                if sides["left"]:
                    fit(sides["left"], box[0] + pad, left_limit - pad)
                if sides["right"]:
                    fit(sides["right"], right_limit + pad, box[2] - pad)
            else:
                group = subtree(index)
                touched.update(group)
                if side_of(box) == "left":
                    fit(group, low_left, left_limit)
                else:
                    fit(group, right_limit, high_right)

    settle([index for index in range(count) if index not in parent], outer, width - outer)
    result = []
    for index, item in enumerate(items):
        result.append(item)
        if index in inserts:
            result.append(inserts[index])
    changed = sum(1 for index in range(count) if items[index]["box"] != original[index]) + len(inserts)
    return result, changed


class MockupLayout:
    def __init__(self, title: str) -> None:
        self.title = title
        self.fonts = dc.pick_fonts()
        self.display = display_font(self.fonts)
        self.script = dc.ScriptBuilder()
        self.swatches: dict[str, str] = {}
        self.styles: dict[str, dict] = {}
        self.stories: list[dict] = []
        self.sx = 1.0
        self.sy = 1.0
        self.adjusted = 0

    # 명세 좌표 → 펼침면 mm
    def scale_for(self, size: list[float]) -> None:
        self.sx = SPREAD_WIDTH / float(size[0])
        self.sy = dc.PAGE_HEIGHT / float(size[1])

    def rect_pt(self, box: list[float]) -> list[float]:
        x0, y0, x1, y1 = box
        return [dc.pt(x0 * self.sx), dc.pt(y0 * self.sy), dc.pt(x1 * self.sx), dc.pt(y1 * self.sy)]

    def length_pt(self, value: float) -> float:
        return dc.pt(value * self.sy)

    def size_pt(self, value: float) -> float:
        return round(value * self.sy * dc.PT_PER_MM, 2)

    def swatch(self, color: str | None) -> str | None:
        if not color:
            return None
        if color.startswith("["):
            return color
        key = color.upper()
        if key not in self.swatches:
            name = f"색 {key}"
            self.script.add("swatch.create", {"name": name, "color": key})
            self.swatches[key] = name
        return self.swatches[key]

    def setup(self, spread_count: int, start_page: int) -> None:
        s = self.script
        s.add("file.new", {
            "units": "millimeters",
            "width": dc.pt(dc.PAGE_WIDTH),
            "height": dc.pt(dc.PAGE_HEIGHT),
            "pages": spread_count * 2,
            "startPage": start_page,
            "facingPages": True,
            "margins": {"top": dc.pt(10), "bottom": dc.pt(10), "inside": dc.pt(10), "outside": dc.pt(8)},
            "bleed": dc.pt(3),
            "title": self.title,
        })
        self.layers = {}
        for name in ("시안 원본", "배경", "상자", "그림", "글"):
            self.layers[name] = s.add("layer.new", {"name": name})

    def activate(self, layer: str) -> None:
        self.script.add("layer.activate", {"id": f"${self.layers[layer]}.id"})

    def finish_layers(self) -> None:
        # 시안 원본은 숨기고 잠가 인쇄되지 않게 둔다(레이어 패널에서 켜면 맞춰 볼 수 있다).
        self.script.add("layer.set", {"id": f"${self.layers['시안 원본']}.id", "visible": False, "locked": True, "printable": False})

    # ── 도형 ──
    def box(self, spread: int, item: dict) -> None:
        shape = item.get("shape") or "rect"
        params = {"spread": spread, "rect": self.rect_pt(item["box"]), "content": "graphic"}
        if shape == "ellipse":
            params["shape"] = "ellipse"
        elif shape == "star":
            params.update({"shape": "polygon", "sides": 5, "starInset": 50})
        step = self.script.add("frame.create", params)
        ref = f"${step}.id"
        fill = self.swatch(item.get("fill"))
        self.script.add("object.fill", {"swatch": fill or "[None]", "ids": [ref]})
        stroke = self.swatch(item.get("stroke"))
        if stroke:
            params = {"swatch": stroke, "weight": self.length_pt(float(item.get("strokeWidth") or 1.5)), "align": "inside", "ids": [ref]}
            if item.get("dashed"):
                params["type"] = {"kind": "dashed", "pattern": [3, 2]}
            self.script.add("object.stroke", params)
        else:
            self.script.add("object.stroke", {"swatch": "[None]", "ids": [ref]})
        radius = float(item.get("radius") or 0)
        if radius and shape == "rect":
            size = self.length_pt(radius)
            corners = item.get("corners")
            if corners in ("top", "bottom"):
                rounded, square = {"shape": "rounded", "size": size}, {"shape": "none", "size": 0}
                order = [rounded, rounded, square, square] if corners == "top" else [square, square, rounded, rounded]
                self.script.add("object.cornerOptions", {"shape": "rounded", "size": size, "corners": order, "ids": [ref]})
            else:
                self.script.add("object.cornerOptions", {"shape": "rounded", "size": size, "ids": [ref]})

    def line(self, spread: int, item: dict) -> None:
        x0, y0, x1, y1 = self.rect_pt(item["box"])
        step = self.script.add("line.create", {"spread": spread, "a": [x0, y0], "b": [x1, y1]})
        params = {"swatch": self.swatch(item.get("stroke") or "#CCCCCC"), "weight": self.length_pt(float(item.get("strokeWidth") or 1)), "ids": [f"${step}.id"]}
        if item.get("dashed"):
            params["type"] = {"kind": "dashed", "pattern": [3, 2]}
        self.script.add("object.stroke", params)

    def art(self, spread: int, item: dict, path: str) -> None:
        step = self.script.add("frame.create", {"spread": spread, "rect": self.rect_pt(item["box"]), "content": "graphic"})
        ref = f"${step}.id"
        self.script.add("object.stroke", {"swatch": "[None]", "ids": [ref]})
        self.script.add("file.place", {"path": path, "frame": ref, "link": True})
        # 쪽에 맞추느라 폭을 줄인 그림은 비율을 지키고, 아니면 시안에서 오린 크기 그대로 채운다.
        mode = "fitProportionally" if item.get("fit") == "proportional" else "fitContentToFrame"
        self.script.add("object.fit", {"mode": mode, "ids": [ref]})

    def qr(self, spread: int, item: dict) -> None:
        params = {"type": "url", "content": item.get("content") or "https://example.com", "rect": self.rect_pt(item["box"]), "spread": spread}
        color = self.swatch(item.get("color"))
        if color:
            params["color"] = color
        self.script.add("object.qrCode", params)

    # ── 글 ──
    def style_for(self, item: dict) -> str:
        """같은 역할(role)의 글은 한 문단 스타일을 쓴다. 처음 나온 글의 크기·굵기·색이 스타일이 되고,
        다른 값은 그 글상자에만 로컬로 덮어쓴다."""
        role = item.get("role") or "본문"
        family = self.display if item.get("font") == "display" else self.fonts
        weight = WEIGHTS.get(item.get("weight") or "regular", "regular")
        spec = {
            "fontFamily": family["family"],
            "fontStyle": family[weight],
            "size": self.size_pt(float(item.get("size") or 14)),
            "fill": self.swatch(item.get("color") or "#2B2B2B"),
            "align": item.get("align") or "left",
        }
        spec["leading"] = round(spec["size"] * float(item.get("leading") or 1.4), 2)
        if role not in self.styles:
            self.styles[role] = spec
            self.script.add("style.paragraph.create", {
                "name": role,
                "chars": {
                    "fontFamily": spec["fontFamily"],
                    "fontStyle": spec["fontStyle"],
                    "size": spec["size"],
                    "leading": {"kind": "points", "value": spec["leading"]},
                    "fill": spec["fill"],
                },
                "para": {"koreanCharBreaks": True, "align": spec["align"]},
            })
        item["_spec"] = spec
        return role

    def text(self, spread: int, item: dict) -> None:
        content = "\n".join(dc._clean(line) for line in str(item.get("text") or "").split("\n"))
        if not content.strip():
            return
        role = self.style_for(item)
        spec = item["_spec"]
        base = self.styles[role]
        step = self.script.add("frame.create", {"spread": spread, "rect": self.rect_pt(item["box"]), "content": "text", "text": content})
        ref = f"${step}.id"
        story = f"${step}.story"
        self.script.add("object.textFrameOptions", {"inset": 0, "verticalJustification": item.get("valign") or "top", "firstBaseline": "ascent", "ids": [ref]})
        total = len(content.encode("utf-8"))
        self.script.add("text.select", {"story": story, "anchor": 0, "focus": total})
        self.script.add("style.paragraph.apply", {"name": role})
        local = {key: spec[key] for key in ("fontFamily", "fontStyle", "size", "fill") if spec[key] != base[key]}
        if spec["leading"] != base["leading"]:
            local["leading"] = {"kind": "points", "value": spec["leading"]}
        if local:
            self.script.add("type.char", {"attrs": local})
        if spec["align"] != base["align"]:
            self.script.add("type.para", {"attrs": {"align": spec["align"]}})
        for span in item.get("spans") or []:
            match = dc._clean(span.get("match"))
            start = content.find(match) if match else -1
            if start < 0:
                continue
            anchor = len(content[:start].encode("utf-8"))
            self.script.add("text.select", {"story": story, "anchor": anchor, "focus": anchor + len(match.encode("utf-8"))})
            attrs = {}
            if span.get("size"):
                attrs["size"] = self.size_pt(float(span["size"]))
            if span.get("color"):
                attrs["fill"] = self.swatch(span["color"])
            if span.get("weight"):
                family = self.display if item.get("font") == "display" else self.fonts
                attrs["fontStyle"] = family[WEIGHTS.get(span["weight"], "regular")]
            if attrs:
                self.script.add("type.char", {"attrs": attrs})
        self.stories.append({"step": step, "label": content.split("\n")[0][:30], "item": item})

    # ── 펼침면 ──
    def spread(self, index: int, spec: dict, art_paths: dict[int, str], source_path: str) -> None:
        self.scale_for(spec.get("size") or [1536, 1024])
        self.activate("시안 원본")
        step = self.script.add("frame.create", {"spread": index, "rect": [0, 0, dc.pt(SPREAD_WIDTH), dc.pt(dc.PAGE_HEIGHT)], "content": "graphic"})
        self.script.add("file.place", {"path": source_path, "frame": f"${step}.id", "link": True})
        self.script.add("object.fit", {"mode": "fitContentToFrame", "ids": [f"${step}.id"]})
        if spec.get("plate"):
            # 바탕판 방식: 시안에서 글만 지운 그림을 펼침면 전체(재단 여유 포함)에 깔고, 그 위에 글상자만 올린다.
            # 상자·삽화·캐릭터·장식은 시안 그대로이고 글은 고칠 수 있는 실제 글상자다(그림 위 글도 그대로 겹친다).
            self.activate("배경")
            bleed = 3
            rect = [dc.pt(-bleed), dc.pt(-bleed), dc.pt(SPREAD_WIDTH + bleed), dc.pt(dc.PAGE_HEIGHT + bleed)]
            plate_step = self.script.add("frame.create", {"spread": index, "rect": rect, "content": "graphic"})
            self.script.add("file.place", {"path": spec["plate"], "frame": f"${plate_step}.id", "link": True})
            self.script.add("object.fit", {"mode": "fitContentToFrame", "ids": [f"${plate_step}.id"]})
            # 글은 바탕판의 지운 자리에 정확히 얹어야 하므로 쪽 나눔으로 옮기지 않는다. 접히는 곳(가운데)에
            # 걸친 글만 세어 알려 준다(시안 그리기 지침이 피하게 하지만, 걸쳤으면 DesignCraft에서 옮겨야 한다).
            size = spec.get("size") or [1536, 1024]
            fold = float(size[0]) / 2
            self.activate("글")
            for item in spec.get("items") or []:
                if item.get("kind") != "text":
                    continue
                if item["box"][0] < fold - 4 < fold + 4 < item["box"][2]:
                    self.adjusted += 1
                self.text(index, item)
            return
        self.activate("배경")
        background = spec.get("background")
        if background:
            # 바탕도 쪽마다 따로 깐다(바깥쪽만 재단 여유 3mm).
            bleed = 3
            for x0, x1 in ((-bleed, dc.PAGE_WIDTH), (dc.PAGE_WIDTH, SPREAD_WIDTH + bleed)):
                self.box(index, {"box": [x0 / self.sx, -bleed / self.sy, x1 / self.sx, (dc.PAGE_HEIGHT + bleed) / self.sy], "fill": background})
        if "_paged" not in spec:
            # 쪽 나누기는 한 번만 한다(글 넘침으로 다시 조판할 때 줄인 글자 크기가 그대로 남도록).
            marked = {**spec, "items": [{**item, "_art": art_paths[position]} if position in art_paths else item for position, item in enumerate(spec.get("items") or [])]}
            spec["_paged"], spec["_adjusted"] = split_into_pages(marked)
        self.adjusted += spec["_adjusted"]
        for item in spec["_paged"]:
            kind = item.get("kind")
            if kind == "box":
                self.activate("상자")
                self.box(index, item)
            elif kind == "line":
                self.activate("상자")
                self.line(index, item)
            elif kind == "art" and item.get("_art"):
                self.activate("그림")
                self.art(index, item, item["_art"])
            elif kind == "qr":
                self.activate("그림")
                self.qr(index, item)
            elif kind == "text":
                self.activate("글")
                self.text(index, item)

    def build(self, specs: list[dict], arts: list[dict[int, str]], sources: list[str], start_page: int, outputs: dict) -> str:
        self.setup(len(specs), start_page)
        for index, spec in enumerate(specs):
            self.spread(index, spec, arts[index], sources[index])
        self.finish_layers()
        self.overset_checks = [(self.script.add("story.get", {"story": f"${story['step']}.story"}), story) for story in self.stories]
        self.script.add("file.save", {"path": outputs["designcraft"]})
        self.script.add("file.exportIdml", {"path": outputs["idml"], "embedImages": False})
        self.script.add("file.exportPdf", {"path": outputs["pdf"], "spreads": True})
        if outputs.get("printPdf"):
            self.script.add("file.exportPdf", {"path": outputs["printPdf"], "spreads": False})
        return self.script.text()


def build_mockup_book(specs: list[dict], app_dir: Path, title: str = "시안 조판", start_page: int = 2) -> dict:
    """배치 명세 목록을 조판해 .designcraft·IDML·PDF를 만든다. 명세의 image는 이미 저장된 시안 경로다."""
    found = dc.find_designcraft()
    if not found:
        raise ValueError("이 컴퓨터에서 DesignCraft를 찾지 못했습니다.")
    if not specs:
        raise ValueError("조판할 시안이 없습니다.")
    if start_page % 2:
        start_page += 1
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    folder = dc.output_root(app_dir) / f"{dc._safe_name(title)}_{stamp}"
    art_dir = folder / "images"
    art_dir.mkdir(parents=True, exist_ok=True)

    arts: list[dict[int, str]] = []
    sources: list[str] = []
    art_count = 0
    for spread_index, spec in enumerate(specs):
        source = Path(spec["image"])
        image = Image.open(source).convert("RGB")
        copied = art_dir / f"{start_page + spread_index * 2:03d}쪽_시안원본{source.suffix or '.png'}"
        image.save(copied)
        sources.append(copied.as_posix())
        if spec.get("plate"):
            plate_copy = art_dir / f"{start_page + spread_index * 2:03d}쪽_바탕판.png"
            Image.open(spec["plate"]).convert("RGB").save(plate_copy)
            spec["plate"] = plate_copy.as_posix()
            arts.append({})
            continue
        size = spec.get("size") or list(image.size)
        if spec.get("artSource"):
            # 글자를 지운 바탕판에서 삽화를 오린다(삽화 위 글이 그림에 남지 않게).
            art_image = Image.open(spec["artSource"]).convert("RGB")
            if art_image.size == image.size:
                image = art_image
        fx, fy = image.width / float(size[0]), image.height / float(size[1])
        paths: dict[int, str] = {}
        for item_index, item in enumerate(spec.get("items") or []):
            if item.get("kind") != "art":
                continue
            x0, y0, x1, y1 = item["box"]
            piece = cut_out(image, [x0 * fx, y0 * fy, x1 * fx, y1 * fy], keep=bool(item.get("keep")))
            path = art_dir / f"{start_page + spread_index * 2:03d}쪽_그림{item_index + 1:03d}.png"
            piece.save(path)
            paths[item_index] = path.as_posix()
            art_count += 1
        arts.append(paths)

    base = dc._safe_name(title)
    outputs = {
        "designcraft": (folder / f"{base}.designcraft").as_posix(),
        "idml": (folder / f"{base}.idml").as_posix(),
        "pdf": (folder / f"{base}_미리보기.pdf").as_posix(),
        "printPdf": (folder / f"{base}_낱쪽.pdf").as_posix(),
    }
    script_path = folder / "조판스크립트.txt"
    started = time.time()
    # 시안의 글꼴과 실제 글꼴 폭이 달라 글이 넘치면, 넘친 글상자만 글자를 8%씩 줄여 두 번까지 다시 조판한다.
    for attempt in range(3):
        layout = MockupLayout(title)
        script_path.write_text(layout.build(specs, arts, sources, start_page, outputs), encoding="utf-8")
        completed = subprocess.run([found["cli"], "script", str(script_path), "--keep-going"], capture_output=True, timeout=900, **dc._no_window())
        stdout = completed.stdout.decode("utf-8", errors="replace")
        result = dc._parse_json_output(stdout)
        if not Path(outputs["designcraft"]).is_file():
            message = (result or {}).get("error") or completed.stderr.decode("utf-8", errors="replace").strip() or "알 수 없는 오류"
            raise ValueError(f"DesignCraft 조판에 실패했습니다: {message[:400]}")
        results = (result or {}).get("results") or []
        overset_stories = [story for step, story in layout.overset_checks if step < len(results) and isinstance(results[step], dict) and results[step].get("overset")]
        if not overset_stories or attempt == 2:
            break
        for story in overset_stories:
            item = story["item"]
            item["size"] = float(item.get("size") or 14) * 0.92
            for span in item.get("spans") or []:
                if span.get("size"):
                    span["size"] = float(span["size"]) * 0.92
    overset = [story["label"] for story in overset_stories]
    (folder / "조판결과.json").write_text(stdout, encoding="utf-8")
    return {
        "folder": folder.as_posix(),
        "files": outputs,
        "spreads": len(specs),
        "pages": len(specs) * 2,
        "startPage": start_page,
        "images": art_count,
        "overset": overset,
        "adjusted": layout.adjusted,
        "errors": dc._collect_errors(result)[:20],
        "seconds": round(time.time() - started, 1),
        "commands": len(layout.script.lines),
    }


# ── 바탕판: 시안에서 글자만 지운 그림 ──
# 시안의 글은 조판 때 실제 글상자로 다시 얹으므로, 시안 그림에서는 글자를 지워 둔다. 글이 단색 바탕(카드·띠)
# 위에 있으면 그 바탕색으로 덮고(무료·정확), 삽화 위에 얹힌 글처럼 바탕이 복잡하면 AI 이미지 편집(마스크 영역만)으로
# 그림을 자연스럽게 이어 채운다. AI를 쓸 수 없으면 주변을 흐리게 번져 글자를 지운다.

def _dilate(mask, steps: int = 2):
    import numpy as np

    grown = mask.copy()
    for _ in range(steps):
        shifted = grown.copy()
        shifted[1:, :] |= grown[:-1, :]
        shifted[:-1, :] |= grown[1:, :]
        shifted[:, 1:] |= grown[:, :-1]
        shifted[:, :-1] |= grown[:, 1:]
        grown = shifted
    return grown


def _container_box(layout: dict, item: dict) -> dict | None:
    """글 상자 가운데를 품는 가장 작은 색 면(카드·띠·꼬리표·번호 동그라미)."""
    x0, y0, x1, y1 = item["box"]
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    found = None
    for other in layout.get("items") or []:
        if other.get("kind") != "box" or not other.get("fill"):
            continue
        bx0, by0, bx1, by1 = other["box"]
        if bx0 <= cx <= bx1 and by0 <= cy <= by1:
            area = (bx1 - bx0) * (by1 - by0)
            if found is None or area < found[0]:
                found = (area, other)
    return found[1] if found else None


def erase_text_locally(image: Image.Image, layout: dict) -> tuple[Image.Image, list[tuple[int, int, int, int]]]:
    """색 면(카드·띠·꼬리표) 또는 단색 바탕 위 글자는 그 바탕색으로 덮는다. 테두리선과 둥근 모서리는 건드리지 않는다.
    바탕이 복잡한(삽화 위) 글 상자 목록을 함께 돌려준다."""
    import numpy as np

    pixels = np.asarray(image.convert("RGB")).astype(np.int16).copy()
    width, height = image.size
    size = layout.get("size") or [width, height]
    fx, fy = width / float(size[0]), height / float(size[1])
    complex_boxes = []
    for item in layout.get("items") or []:
        if item.get("kind") != "text":
            continue
        x0, y0, x1, y1 = item["box"]
        region = (max(0, int(x0 * fx) - 3), max(0, int(y0 * fy) - 3), min(width, int(x1 * fx) + 4), min(height, int(y1 * fy) + 4))
        if region[2] - region[0] < 3 or region[3] - region[1] < 3:
            continue
        rx0, ry0, rx1, ry1 = region
        crop = pixels[ry0:ry1, rx0:rx1]
        allowed = np.ones(crop.shape[:2], dtype=bool)
        container = _container_box(layout, item)
        if container:
            # 색 면 안쪽(테두리 두께만큼 줄인 모양)만 고친다.
            bx0, by0, bx1, by1 = container["box"]
            inset = (float(container.get("strokeWidth") or 0) + 1.5) * fx if container.get("stroke") else 1.0
            shape = Image.new("L", (width, height), 0)
            draw = ImageDraw.Draw(shape)
            outline = [bx0 * fx + inset, by0 * fy + inset, bx1 * fx - inset, by1 * fy - inset]
            if outline[2] > outline[0] and outline[3] > outline[1]:
                if container.get("shape") == "ellipse":
                    draw.ellipse(outline, fill=255)
                else:
                    draw.rounded_rectangle(outline, radius=max(0.0, float(container.get("radius") or 0) * fx - inset), fill=255)
            allowed = np.asarray(shape)[ry0:ry1, rx0:rx1] > 0
            declared = np.array([int(container["fill"][i:i + 2], 16) for i in (1, 3, 5)], dtype=np.int16)
            near = allowed & (np.abs(crop - declared).sum(axis=-1) < 60)
            background = np.median(crop[near], axis=0) if near.sum() > 20 else declared
        else:
            keys = (crop[..., 0] // 16) * 256 + (crop[..., 1] // 16) * 16 + crop[..., 2] // 16
            values, counts = np.unique(keys, return_counts=True)
            if counts.max() / keys.size < 0.45:
                complex_boxes.append(region)
                continue
            background = np.median(crop[keys == values[counts.argmax()]], axis=0)
        ink = _dilate(np.abs(crop - background).sum(axis=-1) > 42, 2) & allowed
        if not container and ink.mean() > 0.6:
            complex_boxes.append(region)
            continue
        crop[ink] = background
        pixels[ry0:ry1, rx0:rx1] = crop
    return Image.fromarray(pixels.astype(np.uint8), "RGB"), complex_boxes


def blur_fill(image: Image.Image, boxes: list[tuple[int, int, int, int]]) -> Image.Image:
    from PIL import ImageFilter

    result = image.copy()
    for x0, y0, x1, y1 in boxes:
        margin = 12
        area = (max(0, x0 - margin), max(0, y0 - margin), min(image.width, x1 + margin), min(image.height, y1 + margin))
        patch = image.crop(area).filter(ImageFilter.GaussianBlur(radius=max(6, (y1 - y0) // 2)))
        result.paste(patch.crop((x0 - area[0], y0 - area[1], x1 - area[0], y1 - area[1])), (x0, y0))
    return result


PLATE_PROMPT = (
    "이 교과서 펼침면 디자인 시안에서 마스크로 투명하게 표시한 영역에 있는 글자만 지운다. 지운 자리는 그 뒤에 있던 "
    "삽화·배경·무늬를 자연스럽게 이어 그려 채운다. 글자·숫자·기호·말풍선 문장을 새로 넣지 않는다. 마스크 밖은 바꾸지 않는다."
)


def request_text_removal(api_key: str, image: Image.Image, boxes: list[tuple[int, int, int, int]]) -> Image.Image:
    """복잡한 바탕 위 글자 영역만 AI 이미지 편집(마스크)으로 지운다. 결과에서 마스크 영역만 잘라 붙인다."""
    mask = Image.new("RGBA", image.size, (0, 0, 0, 255))
    draw = ImageDraw.Draw(mask)
    for box in boxes:
        draw.rectangle([box[0], box[1], box[2] - 1, box[3] - 1], fill=(0, 0, 0, 0))
    source_buffer, mask_buffer = io.BytesIO(), io.BytesIO()
    image.convert("RGB").save(source_buffer, format="PNG")
    mask.save(mask_buffer, format="PNG")
    fields = {"model": os.environ.get("MOCKUP_PLATE_MODEL", "gpt-image-2"), "prompt": PLATE_PROMPT, "size": f"{image.width}x{image.height}", "quality": "high", "n": "1"}
    body, content_type = _multipart(fields, [("image", "spread.png", source_buffer.getvalue(), "image/png"), ("mask", "mask.png", mask_buffer.getvalue(), "image/png")])
    payload = _openai_request("https://api.openai.com/v1/images/edits", body, content_type, api_key, 300, "시안 글자 지우기")
    items = payload.get("data") or []
    if not items or not items[0].get("b64_json"):
        raise ValueError("OpenAI가 글자를 지운 그림을 돌려주지 않았습니다.")
    edited = Image.open(io.BytesIO(base64.b64decode(items[0]["b64_json"]))).convert("RGB")
    if edited.size != image.size:
        edited = edited.resize(image.size, Image.LANCZOS)
    result = image.copy()
    for box in boxes:
        result.paste(edited.crop(box), box[:2])
    return result


def make_plate(image_base64: str, layout: dict, api_key: str = "") -> tuple[str, str]:
    """글자를 지운 바탕판(base64 PNG)과 방식(local·ai·blur)을 돌려준다."""
    image = Image.open(io.BytesIO(base64.b64decode(image_base64))).convert("RGB")
    plate, complex_boxes = erase_text_locally(image, layout)
    mode = "local"
    if complex_boxes:
        try:
            if not api_key:
                raise ValueError("no key")
            plate = request_text_removal(api_key, plate, complex_boxes)
            mode = "ai"
        except ValueError:
            plate = blur_fill(plate, complex_boxes)
            mode = "blur"
    buffer = io.BytesIO()
    plate.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii"), mode


def _preview_font(weight: str, size: int):
    from PIL import ImageFont

    names = ["malgunbd.ttf", "NanumSquareRoundEB.ttf", "NanumGothicBold.ttf"] if weight in ("bold", "heavy") else ["malgun.ttf", "NanumGothic.ttf"]
    for folder in (Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts", Path("/usr/share/fonts/truetype/nanum")):
        for name in names:
            if (folder / name).is_file():
                return ImageFont.truetype(str(folder / name), size)
    return ImageFont.load_default()


def render_plate_preview(plate_base64: str, layout: dict) -> str:
    """바탕판 위에 배치 명세의 글을 얹은 미리보기(조판 결과와 비슷한 모습)."""
    image = Image.open(io.BytesIO(base64.b64decode(plate_base64))).convert("RGB")
    size = layout.get("size") or list(image.size)
    fx, fy = image.width / float(size[0]), image.height / float(size[1])
    draw = ImageDraw.Draw(image)
    for item in layout.get("items") or []:
        if item.get("kind") != "text" or not str(item.get("text") or "").strip():
            continue
        x0, y0, x1, y1 = item["box"]
        x0, y0, x1, y1 = x0 * fx, y0 * fy, x1 * fx, y1 * fy
        font_size = max(6, int(float(item.get("size") or 14) * fy))
        font = _preview_font(item.get("weight") or "regular", font_size)
        lines = str(item["text"]).split("\n")
        line_height = font_size * float(item.get("leading") or 1.3)
        total = line_height * len(lines)
        top = y0 if item.get("valign") not in ("center", "bottom") else (y0 + (y1 - y0 - total) / 2 if item.get("valign") == "center" else y1 - total)
        for index, line in enumerate(lines):
            width = draw.textlength(line, font=font)
            left = x0 if item.get("align") not in ("center", "right") else (x0 + (x1 - x0 - width) / 2 if item.get("align") == "center" else x1 - width)
            draw.text((left, top + index * line_height + (line_height - font_size) / 2), line, font=font, fill=item.get("color") or "#222222")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


# ── AI: 원고 → 디자인 시안 이미지 ──
# 참고 시안(design-references 폴더의 이미지)을 함께 보내 디자인 체계·캐릭터를 펼침면마다 똑같이 유지한다.

REFERENCE_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")
MOCKUP_SIZE = (1536, 1024)


def reference_dir(app_dir: Path) -> Path:
    configured = os.environ.get("MOCKUP_STYLE_DIR", "").strip()
    return Path(configured) if configured else app_dir / "design-references"


def reference_images(app_dir: Path, limit: int = 4) -> list[Path]:
    folder = reference_dir(app_dir)
    if not folder.is_dir():
        return []
    return sorted(path for path in folder.iterdir() if path.suffix.lower() in REFERENCE_SUFFIXES)[:limit]


# 지면 종류별 "구성" 참고: 여러 출판사 기존 교과서의 같은 종류 펼침면(design-references/구성/도입·본문·마무리/).
# 시안마다 서로 다른 출판사 것 2장을 무작위로 골라, 공통 골격만 참고하고 새 구성으로 만들게 한다.
# 디자인 체계(색·카드·서체)는 참고 시안 또는 이 책에서 확정한 "디자인 기준" 시안에서 가져온다.
STRUCTURE_FILES = {"unit-intro": "도입", "small-unit": "본문", "unit-closing": "마무리"}

ROLE_LAYOUT_NOTES = {
    "unit-intro": "대단원 도입 지면이다. 펼침면을 가로지르는 큰 장면 그림(또는 만화) 위에 크고 굵은 단원 제목과 중단원 이름을 얹고, 이 단원에서 할 수 있게 될 것과 원고의 장치(그림 보고 이야기하기·진단 질문 등)를 작은 띠나 칸으로 둔다. 설명 문단은 두지 않는다.",
    "small-unit": "소단원 차시 본문 지면이다. 생각을 여는 질문과 큰 제목·두세 줄 도입 글, 번호가 붙은 활동(동작 그림·사진이 크고 그 옆에 짧은 설명), 작은 준비물·안전 표시, 스스로 확인 칸으로 구성한다. 그림·사진이 지면의 절반 이상이다.",
    "unit-closing": "단원 마무리 지면이다. 큰 마무리 제목 아래 번호 문항(그림 카드와 퀴즈, 돌아보기 칸, 색칠하거나 표시하는 스스로 평가)으로 구성하고 설명 문단은 두지 않는다.",
}


def structure_references(app_dir: Path, role: str, count: int = 2) -> list[Path]:
    """같은 종류 지면 예시를 출판사가 겹치지 않게 count장 무작위로 고른다(파일 이름 '출판사_학년.jpg')."""
    name = STRUCTURE_FILES.get(str(role or ""))
    if not name:
        return []
    base = reference_dir(app_dir) / "구성"
    folder = base / name
    paths = sorted(path for path in folder.iterdir() if path.suffix.lower() in REFERENCE_SUFFIXES) if folder.is_dir() else []
    if not paths:
        paths = [base / f"{name}{suffix}" for suffix in REFERENCE_SUFFIXES if (base / f"{name}{suffix}").is_file()]
    picks: list[Path] = []
    publishers: set[str] = set()
    for path in secrets.SystemRandom().sample(paths, len(paths)):
        publisher = path.stem.split("_")[0]
        if publisher in publishers:
            continue
        publishers.add(publisher)
        picks.append(path)
        if len(picks) >= count:
            break
    return picks


def _section_lines(sections: list) -> list[str]:
    lines = []
    for section in sections or []:
        if not isinstance(section, dict):
            continue
        head = " ".join(part for part in [dc._clean(section.get("label")), dc._clean(section.get("boxType")), dc._clean(section.get("title"))] if part)
        lines.append(f"■ {head}" if head else "■")
        lines.extend(f"  - {dc._clean(text)}" for text in section.get("paragraphs") or [] if dc._clean(text))
    return lines


def manuscript_text(spread: dict) -> str:
    """시안 그리기와 배치 읽기에 함께 쓰는 펼침면 원고(쪽별)."""
    lines = [
        f"단원·차시: {dc._clean(spread.get('runningHead'))} / {dc._clean(spread.get('lessonLabel'))}",
        f"펼침면 제목: {dc._clean(spread.get('headline'))}",
    ]
    if spread.get("subtitle"):
        lines.append(f"부제: {dc._clean(spread.get('subtitle'))}")
    if spread.get("learningGoal"):
        lines.append(f"학습 목표: {dc._clean(spread.get('learningGoal'))}")
    if spread.get("openingQuestion"):
        lines.append(f"생각 열기: {dc._clean(spread.get('openingQuestion'))}")
    for side, label in (("left", "왼쪽 쪽"), ("right", "오른쪽 쪽")):
        page = spread.get(side + "Page")
        lines.append(f"[{label} {page}]" if page else f"[{label}]")
        lines.extend(_section_lines(spread.get(side + "Sections")))
        for visual in spread.get(side + "Visuals") or []:
            if isinstance(visual, dict) and visual.get("description"):
                lines.append(f"  (삽화: {dc._clean(visual.get('description'))})")
    return "\n".join(lines)


# 전체 스타일 버튼의 방향을 시안 디자인에도 반영한다(같은 디자인 체계 안에서 구성·분위기만 달리함).
STYLE_DESIGN_DIRECTIONS = {
    "안정·정석형": "차분하고 정돈된 구성: 동작을 1→2→3 단계 그림과 바른 자세 포인트로 또박또박 보여 주고, 카드 크기를 고르게 맞추며 여백을 넉넉히 두고 색은 절제한다.",
    "균형형": "설명·활동·안전 코너가 고르게 어우러진 구성: 단계 그림, 활동 카드, 작은 안전·도움말 상자를 균형 있게 배치한다.",
    "참신·활동형": "역동적인 놀이 중심 구성: 게임판·미션 카드·말풍선·캐릭터 대화가 많고, 큰 활동 장면 삽화 위에 제목과 안내를 얹거나 카드를 비스듬히 겹치는 등 리듬감 있게 배치하며 색을 밝고 다채롭게 쓴다.",
}


def mockup_prompt(spread: dict, instruction: str = "", has_references: bool = True, structure_count: int = 0, standard_count: int = 0) -> str:
    subject = dc._clean(spread.get("subjectLabel")) or "체육"
    left, right = spread.get("leftPage") or "", spread.get("rightPage") or ""
    parts = []
    if structure_count:
        parts.append(
            f"첨부 이미지 앞 {structure_count}장은 서로 다른 출판사 기존 검정 교과서의 같은 종류 지면 예시다. 여러 예시에 공통된 골격"
            "(무엇을 어디에 두는지, 코너 흐름, 글과 그림의 비율, 글 양)만 참고하고, 어느 한 권을 따라 하지 않는다. 예시들의 좋은 점을 "
            "섞어 이 책만의 새롭고 창의적인 구성으로 만든다. 예시의 캐릭터·사진·문장·코너 이름·쪽 번호는 쓰지 않는다."
        )
    if standard_count:
        parts.append(
            f"그다음 {standard_count}장은 이 책에서 이미 확정한 시안(디자인 기준)이다. 바탕색, 서체, 카드·띠 제목 모양, 아이콘, 캐릭터, "
            "쪽 머리·쪽 번호 모양을 똑같이 맞춰 같은 책의 다른 쪽으로 보이게 한다. 배치와 내용은 아래 원고에 맞게 새로 짠다."
        )
    elif has_references:
        parts.append(
            ("나머지 참고 이미지와 " if structure_count else "첨부한 참고 이미지와 ")
            + "같은 디자인 체계를 따른다(바탕색, 둥근 모서리 카드와 띠 제목, 캐릭터, 굵고 둥근 제목 서체, "
            "삽화·아이콘 그림체, 색 배합). 참고 이미지의 내용(종목·문장)은 따라 하지 말고 아래 원고로 새로 구성한다."
        )
    else:
        parts.append("밝은 파스텔 바탕, 둥근 모서리 카드와 띠 제목, 굵고 둥근 제목 서체, 귀여운 어린이 삽화와 아이콘을 쓴다.")
    style = " ".join(parts)
    role_note = ROLE_LAYOUT_NOTES.get(dc._clean(spread.get("pageRole")))
    prompt = (
        f"초등학교 {subject} 검정 교과서의 완성 펼침면 디자인 시안 한 장(가로 펼침면, 왼쪽 {left}쪽·오른쪽 {right}쪽)을 만든다. "
        f"{style}\n"
        "지킬 것:\n"
        "1) 아래 원고의 글을 빠짐없이, 글자 그대로 정확한 한글 맞춤법으로 쓴다. 원고에 없는 문장을 지어내지 않는다.\n"
        "2) 펼침면 한 장으로 그리지만 가로 가운데(x=768)는 책이 접히는 곳이다. 글·제목·카드·표·꼬리표·아이콘·작은 그림은 "
        "가운데 선 양쪽 약 40픽셀 안에 두지 말고 왼쪽 쪽(0~768)이나 오른쪽 쪽(768~1536) 한쪽 안에만 둔다. "
        "펼침면을 가로지르는 큰 삽화(경기장·운동장·배경 장면처럼 가로 400픽셀 이상)는 가운데를 넘어가도 되지만, "
        "인물의 얼굴·중요한 동작·공은 접히는 곳에 오지 않게 한다. 참고 이미지에 두 쪽에 걸친 글이나 카드가 있어도 이 규칙을 따른다.\n"
        f"3) 아래쪽 바깥 모서리에 쪽 번호 {left}, {right}와 단원 이름을 작게 넣는다.\n"
        "4) 실제 초등 교과서처럼 글은 적고 그림이 많다. 그림·사진이 지면의 절반 이상을 차지하고, 글은 짧은 줄로 나눠 그림 옆·아래에 붙인다. "
        "삽화 자리에는 어린이가 안전하게 활동하는 장면을 그린다.\n"
        "5) 실제 인물을 닮게 그리지 않는다.\n"
    )
    direction = STYLE_DESIGN_DIRECTIONS.get(dc._clean(spread.get("styleLabel")))
    if direction:
        prompt += f"6) 이 책의 전체 스타일({dc._clean(spread.get('styleLabel'))}): {direction}\n"
    prompt += (
        "7) 진짜 검정 교과서 지면처럼 글과 그림을 한 화면으로 디자인한다. 큰 삽화 위에 제목·말풍선·안내 글을 "
        "얹어도 되고, 글이 그림을 감싸도 된다. 글 칸과 그림 칸을 기계적으로 나눈 발표 자료(PPT) 같은 구성은 피한다.\n"
    )
    if role_note:
        prompt += f"8) {role_note}\n"
    if instruction.strip():
        prompt += f"9) 추가 요청: {dc._clean(instruction)[:400]}\n"
    return prompt + "\n[원고]\n" + manuscript_text(spread)


def _openai_request(url: str, data: bytes, content_type: str, api_key: str, timeout: int, label: str) -> dict:
    request = Request(url, data=data, method="POST", headers={"Authorization": f"Bearer {api_key}", "Content-Type": content_type})
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        try:
            message = json.loads(detail).get("error", {}).get("message", detail)
        except json.JSONDecodeError:
            message = detail
        if exc.code == HTTPStatus.UNAUTHORIZED:
            raise ValueError("OpenAI API 키가 유효하지 않습니다. 등록한 키를 다시 확인해 주세요.") from exc
        if exc.code == HTTPStatus.TOO_MANY_REQUESTS:
            if "quota" in message.lower() or "billing" in message.lower():
                raise ValueError("OpenAI API 사용 가능 금액이 없습니다. OpenAI API 결제 설정과 사용 한도를 확인한 뒤 다시 시도해 주세요.") from exc
            raise ValueError("OpenAI API 요청이 잠시 너무 많습니다. 잠시 후 다시 시도해 주세요.") from exc
        raise ValueError(f"OpenAI {label} 오류: {message[:500]}") from exc
    except TimeoutError as exc:
        raise ValueError(f"OpenAI {label} 제한 시간({timeout}초)을 초과했습니다. 잠시 후 다시 시도해 주세요.") from exc
    except URLError as exc:
        raise ValueError("로컬 서버가 OpenAI API에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.") from exc
    except (HttpClientError, ConnectionError) as exc:
        raise ValueError(f"OpenAI {label} 응답을 받는 중 연결이 끊어졌습니다. 잠시 후 다시 시도해 주세요.") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"OpenAI {label} 응답을 해석하지 못했습니다. 다시 시도해 주세요.") from exc


def _multipart(fields: dict, files: list[tuple[str, str, bytes, str]]) -> tuple[bytes, str]:
    boundary = f"----textbookstudio{secrets.token_hex(12)}"
    chunks = []
    for name, value in fields.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode("utf-8"))
    for name, filename, content, mime in files:
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\nContent-Type: {mime}\r\n\r\n'.encode("utf-8"))
        chunks.append(content)
        chunks.append(b"\r\n")
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def request_mockup_image(api_key: str, spread: dict, references: list[Path], instruction: str = "", structure: list[Path] | None = None, standards: list[Path] | None = None) -> str:
    """펼침면 시안 한 장을 그려 base64 PNG로 돌려준다. 참고 이미지가 있으면 편집(edits) API에 함께 보낸다.
    순서: 구성 예시(여러 출판사) → 이 책의 디자인 기준 시안 → 참고 시안(디자인 기준이 없을 때만)."""
    quality = os.environ.get("MOCKUP_IMAGE_QUALITY", "high")
    structure = list(structure or [])
    standards = list(standards or [])
    references = [*structure, *standards, *([] if standards else references)]
    prompt = mockup_prompt(spread, instruction, bool(references), len(structure), len(standards))
    fields = {"model": "gpt-image-2", "prompt": prompt, "size": f"{MOCKUP_SIZE[0]}x{MOCKUP_SIZE[1]}", "quality": quality, "n": "1"}
    if references:
        files = []
        for path in references:
            suffix = path.suffix.lower()
            mime = "image/jpeg" if suffix in (".jpg", ".jpeg") else "image/webp" if suffix == ".webp" else "image/png"
            files.append(("image[]", f"reference{len(files) + 1}{suffix}", path.read_bytes(), mime))
        body, content_type = _multipart(fields, files)
        payload = _openai_request("https://api.openai.com/v1/images/edits", body, content_type, api_key, 300, "시안 생성")
    else:
        body = json.dumps({**fields, "n": 1}, ensure_ascii=False).encode("utf-8")
        payload = _openai_request("https://api.openai.com/v1/images/generations", body, "application/json", api_key, 300, "시안 생성")
    items = payload.get("data") or []
    if not items or not items[0].get("b64_json"):
        raise ValueError("OpenAI가 시안 이미지를 돌려주지 않았습니다.")
    return items[0]["b64_json"]


# ── AI: 시안 이미지 → 배치 명세 ──
# 좌표를 정확히 읽도록 100픽셀 눈금을 그린 사본을 함께 보낸다.

LAYOUT_KINDS = ("box", "text", "art", "line", "qr")
COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")


def grid_overlay(image: Image.Image, step: int = 100) -> Image.Image:
    copy = image.convert("RGB").copy()
    draw = ImageDraw.Draw(copy)
    for x in range(step, copy.width, step):
        draw.line([(x, 0), (x, copy.height)], fill=(255, 0, 0), width=1)
        draw.text((x + 2, 2), str(x), fill=(255, 0, 0))
    for y in range(step, copy.height, step):
        draw.line([(0, y), (copy.width, y)], fill=(255, 0, 0), width=1)
        draw.text((2, y + 2), str(y), fill=(255, 0, 0))
    return copy


def layout_schema() -> dict:
    nullable_string = {"type": ["string", "null"]}
    nullable_number = {"type": ["number", "null"]}
    item = {
        "type": "object",
        "additionalProperties": False,
        "required": ["kind", "box", "fill", "stroke", "strokeWidth", "radius", "shape", "corners", "dashed", "text", "role", "size", "weight", "color", "align", "valign", "font", "label"],
        "properties": {
            "kind": {"type": "string", "enum": list(LAYOUT_KINDS)},
            "box": {"type": "array", "items": {"type": "number"}},
            "fill": nullable_string,
            "stroke": nullable_string,
            "strokeWidth": nullable_number,
            "radius": nullable_number,
            "shape": {"type": ["string", "null"], "enum": ["rect", "ellipse", "star", None]},
            "corners": {"type": ["string", "null"], "enum": ["top", "bottom", None]},
            "dashed": {"type": "boolean"},
            "text": nullable_string,
            "role": nullable_string,
            "size": nullable_number,
            "weight": {"type": ["string", "null"], "enum": ["regular", "bold", "heavy", None]},
            "color": nullable_string,
            "align": {"type": ["string", "null"], "enum": ["left", "center", "right", None]},
            "valign": {"type": ["string", "null"], "enum": ["top", "center", None]},
            "font": {"type": ["string", "null"], "enum": ["display", "body", None]},
            "label": nullable_string,
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["background", "items"],
        "properties": {"background": {"type": "string"}, "items": {"type": "array", "items": item}},
    }


LAYOUT_INSTRUCTIONS = (
    "당신은 교과서 조판 디자이너다. 첨부한 펼침면 디자인 시안(가로 1536 × 세로 1024 픽셀)을 DesignCraft에서 "
    "다시 조판할 수 있도록 배치 명세로 옮긴다. 두 번째 이미지는 같은 시안에 100픽셀 눈금(빨간 선과 숫자)을 그린 것이니 좌표를 잴 때 쓴다.\n"
    "규칙:\n"
    "1) box는 [왼쪽 x, 위 y, 오른쪽 x, 아래 y] 픽셀 좌표다. 시안과 몇 픽셀 안으로 맞춘다.\n"
    "1-1) 시안은 두 쪽(왼쪽 x 0~768, 오른쪽 x 768~1536)이다. 글·상자·작은 그림은 가운데 선(x=768)을 넘지 않게 쪽마다 따로 쓰고, "
    "두 쪽에 걸친 바탕은 쪽마다 하나씩 나눈다. 가운데를 가로지르는 큰 삽화만 나누지 않고 art 하나로 쓴다.\n"
    "2) items는 뒤에서 앞 순서로 쓴다: 큰 바탕 상자 → 그 안의 카드·띠 → 그림(art) → 글(text).\n"
    "3) kind=box: 색 면·카드·띠·꼬리표 바탕·번호 동그라미(shape=ellipse)·별(shape=star)·체크 상자. fill/stroke는 #RRGGBB, "
    "strokeWidth·radius는 픽셀. 위쪽 모서리만 둥근 머리띠는 corners=top.\n"
    "4) kind=text: 글이 있는 곳마다 하나. 시안의 줄바꿈 위치를 \\n으로 그대로 살린다. size는 글자 크기(픽셀, 한글 글자 높이의 약 1.1배), "
    "weight·color·align을 시안대로. 큰 제목·띠 제목·번호는 font=display, 나머지는 body. role은 같은 종류의 글끼리 같은 이름을 쓴다"
    "(단원명, 부제, 띠제목, 상자제목, 카드제목, 본문, 캡션, 꼬리표, 번호, 말풍선, 쪽번호, 쪽머리). 글 상자는 글보다 조금 넉넉하게 잡는다.\n"
    "5) 글자는 시안에서 읽되, 함께 준 원고와 다르거나 맞춤법이 틀린 곳은 원고·바른 맞춤법으로 고쳐 쓴다.\n"
    "6) kind=art: 삽화·캐릭터·아이콘·화살표·그림 장식, 그리고 물결 띠·곡선 장식·그러데이션처럼 상자(box)로 나타낼 수 없는 바탕 장식. "
    "box는 그림만 꼭 맞게 감싸고, 글자나 다른 카드의 테두리가 들어가지 않게 한다. "
    "label에 무엇인지 짧게 쓴다.\n"
    "7) kind=line: 구분선. box의 (x0,y0)→(x1,y1)이 선의 두 끝이다. kind=qr: QR 코드 자리.\n"
    "8) 해당 없는 속성은 null로 둔다. background에는 쪽 바탕색을 쓴다."
)


def request_layout(api_key: str, model: str, image_base64: str, spread: dict) -> dict:
    image = Image.open(io.BytesIO(base64.b64decode(image_base64))).convert("RGB")
    if image.size != MOCKUP_SIZE:
        image = image.resize(MOCKUP_SIZE, Image.LANCZOS)
    encoded = []
    for picture in (image, grid_overlay(image)):
        buffer = io.BytesIO()
        picture.save(buffer, format="PNG")
        encoded.append(base64.b64encode(buffer.getvalue()).decode("ascii"))
    body = {
        "model": model,
        "reasoning": {"effort": "medium"},
        "instructions": LAYOUT_INSTRUCTIONS,
        "input": [{
            "role": "user",
            "content": [
                {"type": "input_text", "text": "[원고]\n" + manuscript_text(spread)},
                {"type": "input_image", "image_url": f"data:image/png;base64,{encoded[0]}", "detail": "high"},
                {"type": "input_image", "image_url": f"data:image/png;base64,{encoded[1]}", "detail": "high"},
            ],
        }],
        "max_output_tokens": 48000,
        "text": {"format": {"type": "json_schema", "name": "mockup_layout", "strict": True, "schema": layout_schema()}},
    }
    payload = _openai_request("https://api.openai.com/v1/responses", json.dumps(body, ensure_ascii=False).encode("utf-8"), "application/json", api_key, 420, "배치 읽기")
    text = "".join(
        content.get("text", "")
        for output in payload.get("output") or []
        for content in output.get("content") or []
        if content.get("type") == "output_text"
    )
    try:
        raw = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("AI가 돌려준 배치 명세를 해석하지 못했습니다. 다시 시도해 주세요.") from exc
    return sanitize_layout(raw)


def sanitize_layout(raw: dict, size: tuple[int, int] = MOCKUP_SIZE) -> dict:
    """AI가 돌려준 명세에서 좌표가 깨졌거나 시안 밖으로 나간 항목을 고치거나 버린다."""
    width, height = size
    items = []
    for item in (raw or {}).get("items") or []:
        if not isinstance(item, dict) or item.get("kind") not in LAYOUT_KINDS:
            continue
        box = item.get("box")
        if not isinstance(box, list) or len(box) != 4:
            continue
        try:
            x0, y0, x1, y1 = [float(value) for value in box]
        except (TypeError, ValueError):
            continue
        if item["kind"] != "line":
            x0, x1 = sorted((x0, x1))
            y0, y1 = sorted((y0, y1))
            x0, x1 = max(-10.0, x0), min(width + 10.0, x1)
            y0, y1 = max(-10.0, y0), min(height + 10.0, y1)
            if x1 - x0 < 2 or y1 - y0 < 2:
                continue
        clean = {key: value for key, value in item.items() if value is not None}
        clean["box"] = [round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)]
        for key in ("fill", "stroke", "color"):
            if key in clean and not COLOR_PATTERN.match(str(clean[key])):
                clean.pop(key)
        if clean["kind"] == "text":
            if not str(clean.get("text") or "").strip():
                continue
            clean["size"] = min(120.0, max(6.0, float(clean.get("size") or 14)))
        items.append(clean)
        if len(items) >= 500:
            break
    background = str((raw or {}).get("background") or "")
    return {"size": list(size), "background": background if COLOR_PATTERN.match(background) else "#FFFFFF", "items": items}
