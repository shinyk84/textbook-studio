"""교과서 PDF의 쪽 번호·펼침면·디자인 요소를 분석한다.

- 인쇄된 쪽 번호(PDF 쪽 라벨 → 아래/위 여백의 숫자)로 왼쪽/오른쪽 면과 펼침면 짝을 정한다.
  표지·속표지 때문에 PDF 순서와 실제 펼침면이 어긋나는 문제를 피한다.
- 펼침면 판정: 가운데 접힘선 양쪽 색이 이어지는지, 삽화·배경이 접힘선까지 붙어 있는지를 본다.
- 디자인 요소: 삽화·사진, 여러 쪽에 반복되는 그림(코너 아이콘·마스코트·템플릿 배경),
  색 상자, 반복되는 코너 이름(활동 방법·준비물 등), 글자 모양(제목·본문·말풍선 등)을 뽑는다.

책마다 디자인이 다르므로 "무엇이 아이콘인지"를 미리 정하지 않고, 한 권 안에서 반복되는 것을 모아
그 책의 디자인 목록(design_catalog.json)을 만든다.
"""

from __future__ import annotations

import hashlib
import re
from collections import Counter, defaultdict
from pathlib import Path

import pymupdf

EDGE = 1.5            # 접힘선에 "붙었다"고 보는 거리(pt)
MARGIN_BAND = 0.08    # 쪽 번호·머리말을 찾는 위/아래 여백 비율
RECURRING_PAGES = 3   # 이 쪽수 이상 반복되면 디자인 요소로 본다
EMPTY_DIGEST = "d41d8cd98f00b204e9800998ecf8427e"

KIND_LABELS = {
    "background": "반복 배경·템플릿",
    "icon": "반복 아이콘·디자인 요소",
    "illustration_large": "큰 삽화·사진",
    "illustration": "삽화·사진",
    "small_cut": "작은 컷",
    "box": "색 상자·글상자 배경",
}
KIND_COLORS = {
    "background": (0.6, 0.6, 0.6),
    "icon": (0.9, 0.1, 0.5),
    "illustration_large": (0.1, 0.4, 0.9),
    "illustration": (0.1, 0.6, 0.9),
    "small_cut": (0.2, 0.7, 0.6),
    "box": (1.0, 0.6, 0.0),
    "label": (0.8, 0.0, 0.0),
    "title": (0.5, 0.0, 0.7),
}


# ---------------------------------------------------------------------------
# 쪽 번호와 면(왼쪽/오른쪽)
# ---------------------------------------------------------------------------

def _label_number(page: pymupdf.Page) -> int | None:
    try:
        label = page.get_label()
    except Exception:  # noqa: BLE001 - 라벨이 깨진 PDF도 있다
        return None
    return int(label) if label and label.isdigit() else None


def _margin_numbers(page: pymupdf.Page) -> list[tuple[int, float]]:
    """위/아래 여백에 홀로 있는 숫자(쪽 번호 후보)와 그 x 중심."""
    width, height = page.rect.width, page.rect.height
    found = []
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        if not re.fullmatch(r"\d{1,3}", word):
            continue
        if y0 > height * (1 - MARGIN_BAND) or y1 < height * MARGIN_BAND:
            found.append((int(word), (x0 + x1) / 2 / width))
    return found


def printed_page_numbers(document: pymupdf.Document) -> tuple[list[int | None], str]:
    """PDF 각 쪽의 인쇄 쪽 번호. 한 권 안에서 가장 많은 (번호 - PDF순서) 차이로 빈칸을 채운다."""
    total = len(document)
    labels = [_label_number(document[i]) for i in range(total)]
    offsets = Counter(n - i for i, n in enumerate(labels) if n is not None)
    method = "pdf_label"
    # 라벨이 모두 1,2,3…(=PDF 순서 그대로)이면 실제 인쇄 번호가 아닐 수 있으므로 여백 숫자로 확인한다.
    if not offsets or (offsets.most_common(1)[0][0] == 1 and len(offsets) == 1):
        margin = Counter()
        for i in range(total):
            for number, _ in _margin_numbers(document[i]):
                margin[number - i] += 1
        if margin and margin.most_common(1)[0][1] >= max(3, total * 0.2):
            offsets, method = margin, "margin_number"
    if not offsets:
        return [None] * total, "none"
    offset = offsets.most_common(1)[0][0]
    return [i + offset for i in range(total)], method


# ---------------------------------------------------------------------------
# 쪽 안의 요소
# ---------------------------------------------------------------------------

def _clip(bbox, width, height):
    x0, y0, x1, y1 = bbox
    return [max(0.0, x0), max(0.0, y0), min(width, x1), min(height, y1)]


def _area(b):
    return max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])


def _page_images(page: pymupdf.Page) -> list[dict]:
    """쪽 안 그림. 가로로 잘게 잘라 붙인 띠 그림은 하나로 합친다."""
    width, height = page.rect.width, page.rect.height
    raw = []
    for info in page.get_image_info(hashes=True):
        digest = info.get("digest", b"").hex()
        bbox = _clip(info["bbox"], width, height)
        if not digest or digest == EMPTY_DIGEST or _area(bbox) < 4:
            continue
        raw.append({"bbox": bbox, "digests": [digest]})
    raw.sort(key=lambda item: (round(item["bbox"][1]), item["bbox"][0]))
    merged: list[dict] = []
    for item in raw:
        last = merged[-1] if merged else None
        if (last and abs(last["bbox"][1] - item["bbox"][1]) < 1 and abs(last["bbox"][3] - item["bbox"][3]) < 1
                and -1 <= item["bbox"][0] - last["bbox"][2] <= EDGE and last["bbox"][2] - last["bbox"][0] < width * 0.2):
            last["bbox"][2] = max(last["bbox"][2], item["bbox"][2])
            last["digests"].extend(item["digests"])
            continue
        merged.append(item)
    for item in merged:
        item["key"] = item["digests"][0] if len(item["digests"]) == 1 else hashlib.md5(
            "".join(sorted(item["digests"])).encode()).hexdigest()
    return merged


def _page_boxes(page: pymupdf.Page) -> list[dict]:
    """채워진 벡터 도형 중 쪽 면적 1.5% 이상인 색 상자."""
    width, height = page.rect.width, page.rect.height
    page_area = width * height
    boxes = []
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        if not fill or min(fill) > 0.97:
            continue
        bbox = _clip(tuple(drawing["rect"]), width, height)
        ratio = _area(bbox) / page_area
        if 0.015 <= ratio <= 0.98:
            boxes.append({"bbox": bbox, "fill": "#%02x%02x%02x" % tuple(round(c * 255) for c in fill[:3])})
    # 같은 자리에 겹쳐 그린 도형은 하나만 남긴다.
    unique = {}
    for box in boxes:
        unique.setdefault(tuple(round(v) for v in box["bbox"]), box)
    return list(unique.values())[:40]


def _page_lines(page: pymupdf.Page) -> tuple[list[dict], list[dict]]:
    """(같은 줄·같은 글자 모양끼리 이어 붙인 조각, 줄 전체). 코너 이름은 글꼴이 섞여 있어 줄 전체로 찾는다."""
    lines, full = [], []
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            start = len(lines)
            current = None
            for span in line.get("spans", []):
                text = span.get("text", "")
                if not text.strip():
                    continue
                style = f"{span['font']}|{round(span['size'] * 2) / 2}|#{span['color']:06x}"
                if current and current["style"] == style:
                    current["text"] += text
                    current["bbox"] = [min(current["bbox"][0], span["bbox"][0]), min(current["bbox"][1], span["bbox"][1]),
                                       max(current["bbox"][2], span["bbox"][2]), max(current["bbox"][3], span["bbox"][3])]
                else:
                    current = {"style": style, "size": span["size"], "text": text, "bbox": list(span["bbox"])}
                    lines.append(current)
            pieces = lines[start:]
            if pieces:
                main = max(pieces, key=lambda piece: piece["size"])
                full.append({"style": main["style"], "size": main["size"], "text": "".join(piece["text"] for piece in pieces),
                             "bbox": [min(piece["bbox"][0] for piece in pieces), min(piece["bbox"][1] for piece in pieces),
                                      max(piece["bbox"][2] for piece in pieces), max(piece["bbox"][3] for piece in pieces)]})
    for line in lines + full:
        line["text"] = re.sub(r"[\s‌]+", " ", line["text"]).strip()
    return [line for line in lines if line["text"]], [line for line in full if line["text"]]


# ---------------------------------------------------------------------------
# 펼침면 판정
# ---------------------------------------------------------------------------

def _edge_intervals(elements: list[dict], width: float, height: float, side: str) -> list[tuple[float, float]]:
    out = []
    for element in elements:
        x0, y0, x1, y1 = element["bbox"]
        if (x1 - x0) * (y1 - y0) >= width * height * 0.9:  # 쪽 전체 바탕색(양쪽 모두 있으면 늘 이어져 보임)
            continue
        if (side == "right" and x1 >= width - EDGE) or (side == "left" and x0 <= EDGE):
            out.append((y0, y1))
    return out


def _covered(intervals: list[tuple[float, float]]) -> list[tuple[float, float]]:
    merged = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def _overlap(a: list[tuple[float, float]], b: list[tuple[float, float]]) -> float:
    total = 0.0
    for a0, a1 in a:
        for b0, b1 in b:
            total += max(0.0, min(a1, b1) - max(a0, b0))
    return total


def _gutter_colors(page: pymupdf.Page, side: str, rows: int = 200) -> list[tuple[int, int, int]]:
    """접힘선 쪽 가장자리 2pt 띠의 줄별 색."""
    rect = page.rect
    clip = pymupdf.Rect(rect.x1 - 2, rect.y0, rect.x1, rect.y1) if side == "right" else pymupdf.Rect(rect.x0, rect.y0, rect.x0 + 2, rect.y1)
    zoom = rows / rect.height
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, alpha=False, colorspace=pymupdf.csRGB)
    data, n = pix.samples, pix.n
    colors = []
    for y in range(pix.height):
        row = [data[(y * pix.width + x) * n:(y * pix.width + x) * n + 3] for x in range(pix.width)]
        colors.append(tuple(sum(px[c] for px in row) // len(row) for c in range(3)))
    return colors


def classify_spread(left: pymupdf.Page, right: pymupdf.Page, left_elements: list[dict], right_elements: list[dict]) -> dict:
    lw, height = left.rect.width, left.rect.height
    left_colors = _gutter_colors(left, "right")
    right_colors = _gutter_colors(right, "left")
    rows = min(len(left_colors), len(right_colors))
    colored = matching = 0
    for a, b in zip(left_colors[:rows], right_colors[:rows]):
        a_colored, b_colored = 765 - sum(a) > 24, 765 - sum(b) > 24  # 흰 종이가 아닌 연한 바탕색도 포함
        if a_colored or b_colored:
            colored += 1
            if a_colored and b_colored and sum(abs(a[c] - b[c]) for c in range(3)) < 45:
                matching += 1
    color_ratio = matching / rows if rows else 0.0
    bleed = _overlap(_covered(_edge_intervals(left_elements, lw, height, "right")),
                     _covered(_edge_intervals(right_elements, right.rect.width, right.rect.height, "left"))) / height
    signals = []
    if color_ratio >= 0.2:
        signals.append("gutter_color_continuity")
    if bleed >= 0.2:
        signals.append("elements_bleed_across_gutter")
    score = max(color_ratio, bleed)
    if score >= 0.35:
        classification = "spread"
    elif score < 0.1:
        classification = "facing_pages"
    else:
        classification = "uncertain"
    return {
        "classification": classification,
        "confidence": round(score if classification == "spread" else 1 - score if classification == "facing_pages" else 0.5, 3),
        "signals": signals or ["no_cross_gutter_design"],
        "metrics": {
            "matching_colored_rows": round(color_ratio, 4),
            "colored_rows": round(colored / rows, 4) if rows else 0.0,
            "bleed_overlap": round(bleed, 4),
        },
    }


# ---------------------------------------------------------------------------
# 한 권 전체 분석
# ---------------------------------------------------------------------------

def _norm(bbox, width, height):
    return [round(bbox[0] / width, 4), round(bbox[1] / height, 4), round(bbox[2] / width, 4), round(bbox[3] / height, 4)]


def _nearest_label(bbox, lines: list[dict], max_dist: float = 40) -> str:
    cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
    best, best_d = "", max_dist
    for line in lines:
        if len(line["text"]) > 15:
            continue
        lx = min(max(cx, line["bbox"][0]), line["bbox"][2])
        ly = min(max(cy, line["bbox"][1]), line["bbox"][3])
        inside_x = bbox[0] - 2 <= lx <= bbox[2] + 2
        inside_y = bbox[1] - 2 <= ly <= bbox[3] + 2
        d = 0 if inside_x and inside_y else ((cx - lx) ** 2 + (cy - ly) ** 2) ** 0.5 - max(bbox[2] - bbox[0], bbox[3] - bbox[1]) / 2
        if d < best_d:
            best, best_d = line["text"], d
    return best


def analyze(document: pymupdf.Document, progress=lambda message, fraction: None, check_stop=lambda: None) -> dict:
    """check_stop은 중지 요청이 있으면 예외를 던지는 함수."""
    total = len(document)
    numbers, number_method = printed_page_numbers(document)

    # 1) 쪽마다 요소 수집
    raw_pages = []
    for index in range(total):
        check_stop()
        page = document[index]
        pieces, full_lines = _page_lines(page)
        raw_pages.append({"images": _page_images(page), "boxes": _page_boxes(page), "lines": pieces, "full_lines": full_lines})
        if (index + 1) % 20 == 0 or index + 1 == total:
            progress(f"디자인 요소 분석 {index + 1}/{total}쪽", (index + 1) / total * 0.7)

    # 2) 한 권 안에서 반복되는 그림·글자 모양·코너 이름
    image_pages: dict[str, set[int]] = defaultdict(set)
    for index, raw in enumerate(raw_pages):
        for image in raw["images"]:
            image_pages[image["key"]].add(index)
    style_chars: Counter = Counter()
    style_pages: dict[str, set[int]] = defaultdict(set)
    style_samples: dict[str, list[str]] = defaultdict(list)
    style_size: dict[str, float] = {}
    label_pages: dict[tuple[str, str], set[int]] = defaultdict(set)
    for index, raw in enumerate(raw_pages):
        height = document[index].rect.height
        for line in raw["lines"]:
            style_chars[line["style"]] += len(line["text"])
            style_pages[line["style"]].add(index)
            style_size[line["style"]] = line["size"]
            if len(style_samples[line["style"]]) < 5 and line["text"] not in style_samples[line["style"]]:
                style_samples[line["style"]].append(line["text"][:40])
        for line in raw["full_lines"]:
            text = line["text"]
            if 2 <= len(text) <= 15 and not re.fullmatch(r"[\d\s.·,]+", text):
                in_margin = line["bbox"][1] > height * (1 - MARGIN_BAND) or line["bbox"][3] < height * MARGIN_BAND
                label_pages[(text, "margin_label" if in_margin else "corner_label")].add(index)
    body_style = style_chars.most_common(1)[0][0] if style_chars else ""
    body_size = style_size.get(body_style, 10.0)

    def style_role(style: str) -> str:
        if style == body_style:
            return "body"
        size = style_size.get(style, body_size)
        if size >= body_size * 1.8:
            return "title"
        if size >= body_size * 1.15:
            return "heading_or_label"
        if size <= body_size * 0.75:
            return "small_text"
        return "text"

    labels = {key: pages for key, pages in label_pages.items() if len(pages) >= RECURRING_PAGES}

    # 반복 그림의 종류는 한 권 전체의 가운데 크기로 정한다(첫 등장 위치가 잘려 있을 수 있음).
    image_ratio: dict[str, list[float]] = defaultdict(list)
    for index, raw in enumerate(raw_pages):
        area = document[index].rect.width * document[index].rect.height
        for image in raw["images"]:
            image_ratio[image["key"]].append(_area(image["bbox"]) / area)

    asset_ids: dict[str, str] = {}
    asset_info: dict[str, dict] = {}
    pages_out = []
    for index, raw in enumerate(raw_pages):
        page = document[index]
        width, height = page.rect.width, page.rect.height
        page_area = width * height
        elements = []
        for image in raw["images"]:
            ratio = _area(image["bbox"]) / page_area
            recurring = len(image_pages[image["key"]]) >= RECURRING_PAGES
            if recurring:
                ratios = sorted(image_ratio[image["key"]])
                kind = "background" if ratios[len(ratios) // 2] >= 0.15 else "icon"
            else:
                kind = "illustration_large" if ratio >= 0.12 else "illustration" if ratio >= 0.02 else "small_cut"
            element = {"kind": kind, "bbox": _norm(image["bbox"], width, height), "area_ratio": round(ratio, 4)}
            if recurring:
                if image["key"] not in asset_ids:
                    asset_ids[image["key"]] = f"a{len(asset_ids) + 1:03d}"
                    asset_info[image["key"]] = {"kind": kind, "first": (index, image["bbox"]), "labels": Counter(),
                                                "occurrences": 0, "sizes": []}
                info = asset_info[image["key"]]
                info["occurrences"] += 1
                info["sizes"].append((image["bbox"][2] - image["bbox"][0], image["bbox"][3] - image["bbox"][1]))
                near = _nearest_label(image["bbox"], raw["full_lines"]) if kind == "icon" else ""
                if near:
                    info["labels"][near] += 1
                element["asset_id"] = asset_ids[image["key"]]
            elements.append(element)
        for box in raw["boxes"]:
            elements.append({"kind": "box", "bbox": _norm(box["bbox"], width, height),
                             "area_ratio": round(_area(box["bbox"]) / page_area, 4), "fill": box["fill"]})
        text_items = []
        labelled = []
        for line in raw["full_lines"]:
            in_margin = line["bbox"][1] > height * (1 - MARGIN_BAND) or line["bbox"][3] < height * MARGIN_BAND
            role = "margin_label" if in_margin else "corner_label"
            if (line["text"], role) in labels:
                labelled.append(line["bbox"])
                text_items.append({"role": role, "text": line["text"], "style": line["style"],
                                   "bbox": _norm(line["bbox"], width, height)})
        for line in raw["lines"]:
            role = style_role(line["style"])
            if role not in ("title", "heading_or_label"):
                continue
            if any(b[0] <= line["bbox"][0] + 1 and line["bbox"][2] <= b[2] + 1 and abs(b[1] - line["bbox"][1]) < 3 for b in labelled):
                continue
            text_items.append({"role": role, "text": line["text"][:60], "style": line["style"],
                               "bbox": _norm(line["bbox"], width, height)})
        number = numbers[index]
        try:
            label = page.get_label()
        except Exception:  # noqa: BLE001
            label = ""
        # 표지(표1~표4)처럼 번호가 없는 쪽은 면(side)만 추정하고 쪽 번호는 비운다.
        shown = number if number is not None and number > 0 and (not label or label.isdigit()) else None
        pages_out.append({
            "page_id": f"p{index + 1:04d}",
            "source_pdf_page": index + 1,
            "printed_page": shown,
            "side": ("left" if number % 2 == 0 else "right") if number is not None else None,
            "elements": elements,
            "texts": text_items,
            "summary": dict(Counter(element["kind"] for element in elements)),
            "_raw": raw,
        })

    # 3) 펼침면 짝과 판정
    spreads = []
    index = 0
    while index < total - 1:
        left, right = pages_out[index], pages_out[index + 1]
        if left["side"] == "left" and right["side"] == "right" or (left["side"] is None and index % 2 == 1):
            verdict = classify_spread(document[index], document[index + 1],
                                      left["_raw"]["images"] + left["_raw"]["boxes"],
                                      right["_raw"]["images"] + right["_raw"]["boxes"])
            spreads.append({"left": index + 1, "right": index + 2,
                            "printed_pages": [left["printed_page"], right["printed_page"]], **verdict})
            index += 2
        else:
            index += 1
        if len(spreads) % 10 == 0:
            progress(f"펼침면 판정 {len(spreads)}쌍", 0.7 + 0.3 * index / total)

    # 4) 디자인 목록
    assets = []
    for key, asset_id in asset_ids.items():
        info = asset_info[key]
        w = sorted(s[0] for s in info["sizes"])[len(info["sizes"]) // 2]
        h = sorted(s[1] for s in info["sizes"])[len(info["sizes"]) // 2]
        assets.append({
            "asset_id": asset_id,
            "kind": info["kind"],
            "kind_label": KIND_LABELS[info["kind"]],
            "pages": len(image_pages[key]),
            "occurrences": info["occurrences"],
            "typical_size_pt": [round(w, 1), round(h, 1)],
            "nearby_label": info["labels"].most_common(1)[0][0] if info["labels"] else "",
            "first_page": info["first"][0] + 1,
            "_first_bbox": info["first"][1],
            "page_ids": [f"p{i + 1:04d}" for i in sorted(image_pages[key])],
        })
    assets.sort(key=lambda item: (-item["pages"], item["asset_id"]))
    styles = [{
        "style": style,
        "role": style_role(style),
        "font": style.split("|")[0],
        "size": float(style.split("|")[1]),
        "color": style.split("|")[2],
        "chars": chars,
        "pages": len(style_pages[style]),
        "samples": style_samples[style],
    } for style, chars in style_chars.most_common() if len(style_pages[style]) >= 2]
    corner_labels = sorted(
        ({"text": text, "role": role, "pages": len(pages), "page_ids": [f"p{i + 1:04d}" for i in sorted(pages)]}
         for (text, role), pages in labels.items()),
        key=lambda item: -item["pages"],
    )
    return {
        "page_number_method": number_method,
        "pages": pages_out,
        "spreads": spreads,
        "catalog": {
            "body_style": body_style,
            "assets": assets,
            "corner_labels": corner_labels,
            "text_styles": styles,
        },
    }


# ---------------------------------------------------------------------------
# 확인용 그림
# ---------------------------------------------------------------------------

def save_asset_thumbnails(document: pymupdf.Document, assets: list[dict], folder: Path) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    for asset in assets:
        page = document[asset["first_page"] - 1]
        clip = pymupdf.Rect(asset["_first_bbox"]) & page.rect
        if clip.is_empty:
            continue
        zoom = min(4.0, 160 / max(clip.width, clip.height, 1))
        page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, alpha=False,
                        colorspace=pymupdf.csRGB).save(folder / f"{asset['asset_id']}.png")
        asset["image"] = f"images/assets/{asset['asset_id']}.png"


def save_annotated_spread(document: pymupdf.Document, left: dict, right: dict, spread: dict, output: Path, height_px: int) -> None:
    """요소 종류별 색 테두리를 그린 펼침면(사람이 판정 결과를 눈으로 확인하는 용도)."""
    lp, rp = document[left["source_pdf_page"] - 1], document[right["source_pdf_page"] - 1]
    height = max(lp.rect.height, rp.rect.height)
    lw = lp.rect.width * height / lp.rect.height
    rw = rp.rect.width * height / rp.rect.height
    canvas = pymupdf.open()
    try:
        page = canvas.new_page(width=lw + rw, height=height + 22)
        page.show_pdf_page(pymupdf.Rect(0, 22, lw, 22 + height), document, lp.number)
        page.show_pdf_page(pymupdf.Rect(lw, 22, lw + rw, 22 + height), document, rp.number)
        for offset, width, meta in ((0, lw, left), (lw, rw, right)):
            for element in meta["elements"]:
                if element["kind"] == "background":
                    continue
                x0, y0, x1, y1 = element["bbox"]
                rect = pymupdf.Rect(offset + x0 * width, 22 + y0 * height, offset + x1 * width, 22 + y1 * height)
                page.draw_rect(rect, color=KIND_COLORS[element["kind"]], width=1.2 if element["kind"] != "box" else 0.8,
                               dashes="[3] 0" if element["kind"] == "box" else None)
                if element.get("asset_id"):
                    page.insert_text((rect.x0 + 1, rect.y0 + 7), element["asset_id"], fontsize=6, color=KIND_COLORS["icon"])
            for text in meta["texts"]:
                if text["role"] not in ("corner_label", "title"):
                    continue
                x0, y0, x1, y1 = text["bbox"]
                page.draw_rect(pymupdf.Rect(offset + x0 * width, 22 + y0 * height, offset + x1 * width, 22 + y1 * height),
                               color=KIND_COLORS["label" if text["role"] == "corner_label" else "title"], width=1.5)
        verdict = {"spread": "SPREAD (one design)", "facing_pages": "FACING PAGES (separate)", "uncertain": "UNCERTAIN"}
        metrics = spread["metrics"]
        page.draw_rect(pymupdf.Rect(0, 0, lw + rw, 22), color=None, fill=(1, 1, 1))
        page.insert_text((6, 15), f"{verdict[spread['classification']]}  p.{spread['printed_pages'][0]}-{spread['printed_pages'][1]}  "
                         f"gutter color {metrics['matching_colored_rows']:.2f} / bleed {metrics['bleed_overlap']:.2f}   "
                         "blue=illustration  pink=icon  orange=box  red=corner label  purple=title", fontsize=9)
        zoom = height_px / (height + 22)
        page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csRGB).save(output, jpg_quality=75)
    finally:
        canvas.close()


def strip_private(result: dict) -> None:
    for page in result["pages"]:
        page.pop("_raw", None)
    for asset in result["catalog"]["assets"]:
        asset.pop("_first_bbox", None)
