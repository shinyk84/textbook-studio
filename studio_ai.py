"""근거 검색 + AI 공통 모듈.

- 근거 검색: official-data/processed의 전처리 결과(펼침면 단위 spread_chunks.jsonl)를 글자 2-gram BM25로
  찾는다. 한국어는 띄어쓰기·조사 변화가 커서 형태소 분석 없이도 2-gram이 안정적으로 맞는다. 문서는
  필요할 때 한 번만 읽어 메모리에 둔다(학교급·학년으로 먼저 거른 뒤 그 문서만 읽음).
- 현장 의견: 엑셀·PDF·이미지(설문 캡처·스캔)·직접 쓴 글을 받아 의견을 뽑고 쟁점으로 묶는다.
- 조판 후 수정안: 쟁점마다 관련 쪽을 찾아 대폭·중간·미세 수정안을 함께 만든다.
- 파생 자료: 확정한 교과서 원고로 지도서·활동지·평가지·과정안을 만든다.

OpenAI 호출은 Responses API의 구조화 출력(JSON 스키마)만 쓴다. 키는 호출하는 쪽(app.py)이 넘긴다.
"""

from __future__ import annotations

import base64
import io
import json
import math
import os
import re
from collections import Counter
from functools import lru_cache
from http import HTTPStatus
from http.client import HTTPException as HttpClientError
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
PROCESSED_DIR = ROOT / "official-data" / "processed"


# ── 근거 검색 ──

def _bigrams(text: str) -> list[str]:
    compact = re.sub(r"[^0-9A-Za-z가-힣]+", " ", str(text or "")).lower()
    grams: list[str] = []
    for word in compact.split():
        if len(word) == 1:
            grams.append(word)
        else:
            grams.extend(word[i:i + 2] for i in range(len(word) - 1))
    return grams


def _grade_number(value: object) -> int | None:
    match = re.search(r"([1-6])\s*학년|pe([1-6])", str(value or ""))
    if not match:
        return None
    return int(match.group(1) or match.group(2))


@lru_cache(maxsize=1)
def document_catalog() -> tuple[dict, ...]:
    """전처리 문서 목록과 검색용 분류(개정·학교급·학년·자료 종류)."""
    documents = []
    for manifest_path in sorted(PROCESSED_DIR.glob("*/manifest.json")):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        document_id = manifest.get("document_id") or manifest_path.parent.name
        title = str(manifest.get("title") or "")
        revision = str(manifest.get("curriculum_revision") or "")
        kind = str(manifest.get("document_type") or "")
        lowered = document_id.lower()
        if manifest.get("education_level") == "초등학교" or "elementary" in lowered or "gomunsu" in lowered:
            level = "elementary"
        elif "스포츠" in title and "문화" in title:
            level = "sports-culture"
        else:
            level = "common"
        documents.append({
            "id": document_id,
            "dir": manifest_path.parent,
            "title": title,
            "publisher": str(manifest.get("publisher") or ""),
            "revision": revision[:4],
            "kind": kind,
            "level": level,
            "grade": _grade_number(manifest.get("grade")) or (_grade_number(document_id) if level == "elementary" else None),
        })
    return tuple(documents)


@lru_cache(maxsize=48)
def _document_chunks(document_dir: str) -> tuple[tuple[dict, ...], dict]:
    """한 문서의 펼침면 조각과 2-gram 통계. (조각 목록, {"df": Counter, "avg": 평균 길이})"""
    path = Path(document_dir) / "spread_chunks.jsonl"
    if not path.is_file():
        path = Path(document_dir) / "chunks.jsonl"
    chunks = []
    df: Counter = Counter()
    total = 0
    if path.is_file():
        for line in path.read_text(encoding="utf-8").splitlines():
            try:
                record = json.loads(line)
            except json.JSONDecodeError:
                continue
            text = str(record.get("text") or "").replace("--- PAGE BOUNDARY ---", " / ")
            if len(text.strip()) < 30:
                continue
            counts = Counter(_bigrams(text))
            df.update(counts.keys())
            total += sum(counts.values())
            pages = record.get("page_ids") or [record.get("page_id")]
            chunks.append({
                "text": text,
                "counts": counts,
                "length": sum(counts.values()),
                "pages": [int(re.sub(r"\D", "", page) or 0) for page in pages if page],
            })
    return tuple(chunks), {"df": df, "avg": (total / len(chunks)) if chunks else 1}


def _excerpt(text: str, query_grams: set[str], width: int = 420) -> str:
    """질의 2-gram이 가장 많이 몰린 구간을 잘라 보여 준다."""
    flat = re.sub(r"\s+", " ", text).strip()
    if len(flat) <= width:
        return flat
    best, best_score = 0, -1
    step = max(40, width // 4)
    for start in range(0, len(flat) - width + step, step):
        window = flat[start:start + width]
        score = sum(1 for gram in _bigrams(window) if gram in query_grams)
        if score > best_score:
            best, best_score = start, score
    return ("…" if best else "") + flat[best:best + width] + ("…" if best + width < len(flat) else "")


def search_evidence(
    query: str,
    *,
    level: str = "",
    grade: int | None = None,
    revisions: tuple[str, ...] = ("2022", "2015"),
    kinds: tuple[str, ...] = ("교과서", "지도서"),
    limit: int = 6,
    per_document: int = 2,
) -> list[dict]:
    """질의와 가까운 교과서·지도서 펼침면 발췌를 점수순으로 돌려준다."""
    query_counts = Counter(_bigrams(query))
    if not query_counts:
        return []
    query_grams = set(query_counts)
    candidates = [
        document for document in document_catalog()
        if (not revisions or document["revision"] in revisions)
        and (not kinds or document["kind"] in kinds)
        and (not level or document["level"] == level)
        and (grade is None or document["grade"] in (None, grade))
    ]
    results = []
    k1, b = 1.4, 0.7
    for document in candidates:
        chunks, stats = _document_chunks(str(document["dir"]))
        if not chunks:
            continue
        n = len(chunks)
        scored = []
        for chunk in chunks:
            score = 0.0
            for gram, query_weight in query_counts.items():
                frequency = chunk["counts"].get(gram)
                if not frequency:
                    continue
                idf = math.log(1 + (n - stats["df"][gram] + 0.5) / (stats["df"][gram] + 0.5))
                score += query_weight * idf * frequency * (k1 + 1) / (frequency + k1 * (1 - b + b * chunk["length"] / stats["avg"]))
            if score > 0:
                scored.append((score / math.sqrt(sum(query_counts.values())), chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        for score, chunk in scored[:per_document]:
            # 최신 개정 자료를 조금 더 앞에 둔다.
            boost = 1.15 if document["revision"] == "2022" else 1.0
            results.append({
                "score": round(score * boost, 3),
                "documentId": document["id"],
                "publisher": document["publisher"],
                "documentType": document["kind"],
                "revision": f"{document['revision']} 개정" if document["revision"] else "",
                "pages": chunk["pages"],
                "excerpt": _excerpt(chunk["text"], query_grams),
            })
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:limit]


def evidence_for_context(context: dict, *, level: str, limit: int = 6) -> list[dict]:
    """원고 생성 요청 문맥에서 검색어를 만들어 근거를 찾는다(출판사·쪽은 AI에 넘기지 않음)."""
    parts = [
        context.get("small_title") or context.get("smallTitle"),
        context.get("source_activity") or context.get("sourceActivity"),
        context.get("middle_title") or context.get("middleTitle"),
        context.get("lesson_type_label") or context.get("lessonTypeLabel"),
        context.get("carrier_sport") or context.get("carrierSport"),
    ]
    spread = context.get("spread") or {}
    parts.extend(spread.get("phases") or [])
    parts.extend(spread.get("suggested_activity_titles") or spread.get("suggestedActivityTitles") or [])
    small_unit = context.get("small_unit") or context.get("smallUnit") or {}
    if isinstance(small_unit, dict):
        parts.extend([small_unit.get("smallTitle"), small_unit.get("middleTitle")])
    query = " ".join(str(part) for part in parts if part)
    grade = _grade_number(context.get("grade_label") or context.get("gradeLabel"))
    return search_evidence(query, level=level, grade=grade, limit=limit)


# ── OpenAI 호출 ──

def _openai_json(api_key: str, model: str, instructions: str, content: list[dict], schema_name: str, schema: dict,
                 *, timeout: int = 240, max_output_tokens: int = 24000, effort: str = "medium") -> dict:
    body = {
        "model": model,
        "reasoning": {"effort": effort},
        "instructions": instructions,
        "input": [{"role": "user", "content": content}],
        "max_output_tokens": max_output_tokens,
        "text": {"format": {"type": "json_schema", "name": schema_name, "strict": True, "schema": schema}},
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
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
                raise ValueError("OpenAI API 사용 가능 금액이 없습니다. 결제 설정과 사용 한도를 확인해 주세요.") from exc
            raise ValueError("OpenAI API 요청이 잠시 너무 많습니다. 잠시 후 다시 시도해 주세요.") from exc
        raise ValueError(f"OpenAI 요청 오류: {message[:400]}") from exc
    except TimeoutError as exc:
        raise ValueError(f"AI 응답이 제한 시간({timeout}초)을 넘었습니다. 자료를 나눠 다시 시도해 주세요.") from exc
    except (URLError, HttpClientError, ConnectionError) as exc:
        raise ValueError("서버가 OpenAI API에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.") from exc
    if payload.get("status") == "incomplete":
        raise ValueError("AI 응답이 길이 제한에 걸려 끝까지 오지 않았습니다. 자료를 나눠 다시 시도해 주세요.")
    text = payload.get("output_text") or ""
    if not text:
        for item in payload.get("output") or []:
            for part in item.get("content") or []:
                if part.get("type") in ("output_text", "text"):
                    text += part.get("text") or ""
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.") from exc


def _obj(properties: dict) -> dict:
    return {"type": "object", "additionalProperties": False, "properties": properties, "required": list(properties)}


def _arr(items: dict) -> dict:
    return {"type": "array", "items": items}


STR = {"type": "string"}


# ── 현장 의견: 파일 → 의견 → 쟁점 ──

MAX_TEXT_CHARS = 90000
MAX_IMAGES = 10
IMAGE_SUFFIXES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def _xlsx_text(data: bytes) -> str:
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    lines = []
    for sheet in workbook.worksheets:
        lines.append(f"## 시트: {sheet.title}")
        for row in sheet.iter_rows(values_only=True):
            cells = [str(value).strip() for value in row if value is not None and str(value).strip()]
            if cells:
                lines.append(" | ".join(cells))
    return "\n".join(lines)


def _pdf_parts(data: bytes, name: str) -> tuple[str, list[str]]:
    """PDF 글자를 뽑고, 글자가 거의 없는 쪽(스캔·캡처)은 이미지로 바꿔 돌려준다."""
    import pymupdf

    text_lines = []
    images: list[str] = []
    with pymupdf.open(stream=data, filetype="pdf") as document:
        for index, page in enumerate(document):
            text = page.get_text().strip()
            if len(text) >= 40:
                text_lines.append(f"[{name} {index + 1}쪽]\n{text}")
            elif len(images) < MAX_IMAGES:
                pixmap = page.get_pixmap(dpi=120)
                images.append(base64.b64encode(pixmap.tobytes("png")).decode("ascii"))
    return "\n\n".join(text_lines), images


def collect_feedback_material(files: list[dict], note: str = "") -> tuple[str, list[tuple[str, str]], list[str]]:
    """업로드 파일을 AI 입력(글, [(mime, base64 이미지)])으로 바꾼다. 세 번째 값은 처리 메모."""
    texts = []
    images: list[tuple[str, str]] = []
    notes = []
    for item in files or []:
        name = str(item.get("name") or "파일")
        suffix = Path(name).suffix.lower()
        try:
            data = base64.b64decode(str(item.get("base64") or ""), validate=False)
        except (ValueError, TypeError):
            notes.append(f"{name}: 읽지 못함")
            continue
        if not data:
            continue
        if suffix in (".xlsx", ".xlsm"):
            texts.append(f"# 파일: {name}\n{_xlsx_text(data)}")
            notes.append(f"{name}: 엑셀 표 읽음")
        elif suffix in (".csv", ".txt", ".md"):
            texts.append(f"# 파일: {name}\n{data.decode('utf-8', errors='replace')}")
            notes.append(f"{name}: 글 읽음")
        elif suffix == ".pdf":
            text, page_images = _pdf_parts(data, name)
            if text:
                texts.append(f"# 파일: {name}\n{text}")
            for image in page_images:
                if len(images) < MAX_IMAGES:
                    images.append(("image/png", image))
            notes.append(f"{name}: PDF 글 {'있음' if text else '없음'}, 스캔 쪽 {len(page_images)}장 이미지로 판독")
        elif suffix in IMAGE_SUFFIXES:
            if len(images) < MAX_IMAGES:
                images.append((IMAGE_SUFFIXES[suffix], base64.b64encode(data).decode("ascii")))
                notes.append(f"{name}: 이미지 판독")
            else:
                notes.append(f"{name}: 이미지가 {MAX_IMAGES}장을 넘어 건너뜀")
        else:
            notes.append(f"{name}: 지원하지 않는 형식(엑셀·PDF·JPG·PNG·CSV·TXT만)")
    if note.strip():
        texts.append(f"# 편집자가 직접 쓴 반영 사항\n{note.strip()}")
    joined = "\n\n".join(texts)
    if len(joined) > MAX_TEXT_CHARS:
        joined = joined[:MAX_TEXT_CHARS]
        notes.append(f"글이 길어 앞부분 {MAX_TEXT_CHARS:,}자만 분석")
    return joined, images, notes


FEEDBACK_SCHEMA = _obj({
    "summary": STR,
    "opinion_count": {"type": "integer"},
    "items": _arr(_obj({
        "title": STR,
        "kind": {"type": "string", "enum": ["개선 요구", "유지할 강점", "새 요구", "기타"]},
        "priority": {"type": "string", "enum": ["상", "중", "하"]},
        "scope": {"type": "string", "enum": ["책 전반", "특정 단원", "특정 쪽·활동"]},
        "target": STR,
        "count": {"type": "integer"},
        "evidence": _arr(STR),
        "reflect": STR,
        "recommend": {"type": "boolean"},
    })),
})


def analyze_feedback(api_key: str, model: str, files: list[dict], note: str, book: dict) -> dict:
    text, images, notes = collect_feedback_material(files, note)
    if not text.strip() and not images:
        raise ValueError("분석할 의견이 없습니다. 파일을 올리거나 반영 사항을 직접 적어 주세요.")
    instructions = (
        "당신은 검정 교과서 편집 책임자다. 현장 교사 만족도 조사·설문 캡처·스캔본·편집자 메모에서 "
        "교과서 개발에 쓸 의견을 하나하나 뽑은 뒤, 같은 문제를 말하는 의견끼리 쟁점으로 묶는다.\n"
        "- 이미지(설문 캡처·손글씨 스캔)는 글자를 읽어 의견으로 쓴다. 읽을 수 없는 부분은 지어내지 않는다.\n"
        "- kind: 고쳐 달라는 것은 '개선 요구', 좋아서 유지해야 할 점은 '유지할 강점', 지금 없는 것을 새로 "
        "넣어 달라는 것은 '새 요구'.\n"
        "- priority: 여러 교사가 같은 말을 했거나 수업 운영·안전·성취기준 도달에 직접 영향을 주면 '상'.\n"
        "- target: 관련 단원·활동·쪽을 의견에서 알 수 있으면 적고, 책 전반이면 '책 전반'.\n"
        "- evidence: 근거가 된 의견 원문을 짧게 최대 3개. count는 그 쟁점에 속한 의견 수.\n"
        "- reflect: 새 교과서 초안이나 수정본에 실제로 어떻게 반영할지 한두 문장(구체적 방법).\n"
        "- recommend: 교과서 개선에 반영할 가치가 분명하면 true, 단순 불만·범위 밖(가격·배송 등)이면 false.\n"
        "- 쟁점은 중요한 것부터 최대 25개. 개인정보(학교명·교사명)는 쓰지 않는다."
    )
    book_line = f"대상 교과서: {book.get('subject', '')} {book.get('grade', '')} ({book.get('revision', '')})".strip()
    content: list[dict] = [{"type": "input_text", "text": f"{book_line}\n\n{text or '(글 없음, 이미지만 있음)'}"}]
    for mime, data in images:
        content.append({"type": "input_image", "image_url": f"data:{mime};base64,{data}"})
    result = _openai_json(api_key, model, instructions, content, "field_feedback", FEEDBACK_SCHEMA, timeout=300)
    items = []
    for index, item in enumerate(result.get("items") or []):
        items.append({**item, "id": f"f{index + 1}", "evidence": [str(text)[:300] for text in (item.get("evidence") or [])[:3]]})
    return {"summary": result.get("summary", ""), "opinionCount": result.get("opinion_count", 0), "items": items, "notes": notes}


# ── 조판 후 수정안 ──

REVISION_SCHEMA = _obj({
    "issues": _arr(_obj({
        "issue_id": STR,
        "related_pages": _arr(_obj({"page": STR, "reason": STR})),
        "recommended_scale": {"type": "string", "enum": ["대폭", "중간", "미세"]},
        "scale_reason": STR,
        "options": _arr(_obj({
            "scale": {"type": "string", "enum": ["대폭", "중간", "미세"]},
            "summary": STR,
            "layout_impact": STR,
            "edits": _arr(_obj({"page": STR, "before": STR, "after": STR})),
        })),
    })),
})


def rank_pages(issue: dict, pages: list[dict], limit: int = 5) -> list[dict]:
    """쟁점 글과 가까운 쪽을 2-gram 겹침으로 먼저 고른다(AI에는 후보만 보낸다)."""
    query = " ".join([str(issue.get("title", "")), str(issue.get("target", "")), str(issue.get("reflect", "")), " ".join(issue.get("evidence") or [])])
    query_counts = Counter(_bigrams(query))
    scored = []
    for page in pages:
        counts = Counter(_bigrams(page.get("text", "")))
        overlap = sum(min(count, counts.get(gram, 0)) for gram, count in query_counts.items())
        if overlap:
            scored.append((overlap / math.sqrt(1 + sum(counts.values())), page))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [page for _, page in scored[:limit]]


def propose_revisions(api_key: str, model: str, issues: list[dict], pages: list[dict], round_label: str = "1차 조판") -> dict:
    if not issues:
        raise ValueError("수정안을 만들 쟁점을 하나 이상 고르세요.")
    if not pages:
        raise ValueError("수정안을 만들 교과서 원고(쪽)가 없습니다. 4단계에서 초안을 먼저 만드세요.")
    blocks = []
    for issue in issues[:12]:
        candidates = rank_pages(issue, pages) or pages[:3]
        page_text = "\n\n".join(f"[{page['page']}쪽 · {page.get('label', '')}]\n{str(page.get('text', ''))[:2500]}" for page in candidates)
        blocks.append(
            f"### 쟁점 {issue.get('id')}: {issue.get('title')}\n"
            f"성격: {issue.get('kind', '')} · 우선순위: {issue.get('priority', '')} · 대상: {issue.get('target', '')}\n"
            f"반영 방향: {issue.get('reflect', '')}\n근거 의견: {' / '.join(issue.get('evidence') or [])}\n"
            f"관련 후보 쪽(현재 {round_label} 원고):\n{page_text}"
        )
    instructions = (
        f"당신은 검정 교과서 편집 책임자다. 교과서는 이미 {round_label}을 마쳐 쪽 배치가 정해졌다. 쟁점마다 다음을 한다.\n"
        "1) 후보 쪽 중 실제로 고쳐야 할 쪽만 related_pages로 고르고 이유를 쓴다(후보에 없으면 비워 둔다).\n"
        "2) 수정 규모 세 가지를 모두 만든다. options는 '대폭'·'중간'·'미세' 순서로 정확히 3개다.\n"
        "   - 대폭: 활동·구성을 바꾸며 쪽 배치가 달라질 수 있음(재조판 필요).\n"
        "   - 중간: 문단·활동 단계·박스 내용을 고치되 같은 쪽 안에서 끝냄(일부 재흘림).\n"
        "   - 미세: 낱말·문장·표기만 고쳐 조판에 거의 영향 없음.\n"
        "   layout_impact에 조판 영향(글 넘침 가능성, 그림 교체 등)을 쓴다.\n"
        "3) edits의 before는 원고에 실제로 있는 문장을 그대로 옮기고, after는 고친 문장이다. 새로 넣는 경우 before는 "
        "'(추가)'로 쓴다. 미세는 1~4곳, 중간은 2~6곳, 대폭은 바뀔 구성 전체를 요약해 3~8곳.\n"
        "4) recommended_scale은 쟁점의 우선순위와 조판 단계(이미 조판됨)를 고려해 고른다. 조판 후에는 같은 효과면 작은 "
        "규모를 우선한다.\n"
        "5) issue_id는 입력의 쟁점 번호(f1 등)를 그대로 쓴다. 출판사 이름·학교 이름은 쓰지 않는다."
    )
    result = _openai_json(api_key, model, instructions, [{"type": "input_text", "text": "\n\n".join(blocks)}],
                          "post_typeset_revisions", REVISION_SCHEMA, timeout=360)
    return {"roundLabel": round_label, "issues": result.get("issues") or []}


# ── 확정 교과서 → 지도서·활동지·평가지·과정안 ──

DERIVED_KINDS = {
    "guide": "지도서",
    "worksheet": "활동지",
    "assessment": "평가지",
    "lesson_plan": "교수·학습 과정안",
}

_LESSON = _obj({
    "lesson_label": STR,
    "goal": STR,
    "materials": _arr(STR),
    "flow": _arr(_obj({"stage": STR, "minutes": {"type": "integer"}, "teacher": STR, "student": STR, "notes": STR})),
    "questions": _arr(STR),
    "differentiation": STR,
    "alternative_activity": STR,
    "safety": STR,
    "assessment": STR,
})

DERIVED_SCHEMAS = {
    "guide": _obj({
        "title": STR,
        "unit_overview": STR,
        "standards": _arr(STR),
        "lessons": _arr(_LESSON),
        "background_knowledge": _arr(STR),
    }),
    "worksheet": _obj({
        "title": STR,
        "sheets": _arr(_obj({
            "title": STR,
            "lesson_label": STR,
            "directions": STR,
            "items": _arr(_obj({"prompt": STR, "response_type": {"type": "string", "enum": ["빈칸", "선택", "서술", "그리기", "표", "점검"]}, "lines": {"type": "integer"}})),
            "self_check": _arr(STR),
        })),
    }),
    "assessment": _obj({
        "title": STR,
        "standards": _arr(STR),
        "items": _arr(_obj({
            "number": {"type": "integer"},
            "item_type": {"type": "string", "enum": ["선택형", "단답형", "서술형", "관찰 체크"]},
            "question": STR,
            "choices": _arr(STR),
            "answer": STR,
            "explanation": STR,
        })),
        "performance_task": _obj({
            "task": STR,
            "criteria": _arr(_obj({"criterion": STR, "high": STR, "middle": STR, "low": STR})),
        }),
    }),
    "lesson_plan": _obj({
        "title": STR,
        "plans": _arr(_obj({
            "lesson_label": STR,
            "goal": STR,
            "standards": _arr(STR),
            "materials": _arr(STR),
            "steps": _arr(_obj({"stage": STR, "minutes": {"type": "integer"}, "activity": STR, "teacher_notes": STR})),
            "evaluation": STR,
        })),
    }),
}

_DERIVED_RULES = {
    "guide": "차시마다 40분(초등)·50분(고등) 수업 흐름을 도입·전개·정리로 나누고, 발문, 수준별 지도, 참여가 어려운 학생의 대체 활동, 안전 지도, 평가 방법을 쓴다.",
    "worksheet": "학생이 수업 중 바로 쓰는 활동지다. 교과서 활동과 같은 순서로, 기록·점검·성찰 문항을 학년 수준에 맞게 만든다.",
    "assessment": "성취기준에 맞춘 문항과 수행평가 과제를 만든다. 정답과 해설, 채점 기준(상·중·하)을 함께 쓴다. 신체 활동은 관찰 체크 문항을 쓴다.",
    "lesson_plan": "차시별 교수·학습 과정안이다. 단계별 시간 배분, 교사 활동 유의점, 평가 계획을 쓴다.",
}


def generate_derived(api_key: str, model: str, kind: str, payload: dict) -> dict:
    if kind not in DERIVED_KINDS:
        raise ValueError("만들 자료 종류가 올바르지 않습니다.")
    manuscript = str(payload.get("manuscript") or "").strip()
    if not manuscript:
        raise ValueError("확정한 교과서 원고가 없습니다.")
    instructions = (
        f"당신은 검정 교과서 집필진이다. 확정된 교과서 원고를 바탕으로 '{DERIVED_KINDS[kind]}'를 만든다. "
        f"{_DERIVED_RULES[kind]}\n"
        "- 교과서 원고의 활동·용어·차시 구분을 그대로 따르고, 원고에 없는 활동을 새로 만들지 않는다(대체 활동·심화는 예외).\n"
        "- 근거 발췌는 다른 교과서·지도서의 구성 방식을 참고하는 용도다. 문장을 베끼거나 출판사명을 쓰지 않는다.\n"
        "- 검증이 필요한 통계·기록은 지어내지 않는다."
    )
    query = f"{payload.get('unitLabel', '')} {DERIVED_KINDS[kind]} {manuscript[:300]}"
    evidence = search_evidence(query, level=str(payload.get("level") or ""), grade=_grade_number(payload.get("gradeLabel")),
                               kinds=("지도서",) if kind in ("guide", "lesson_plan") else ("지도서", "교과서"), limit=4)
    text = (
        f"단원: {payload.get('unitLabel', '')}\n학년: {payload.get('gradeLabel', '')}\n"
        f"차시: {payload.get('lessonRange', '')}\n성취기준: {', '.join(payload.get('standards') or [])}\n\n"
        f"## 확정 교과서 원고\n{manuscript[:30000]}\n\n"
        "## 참고 근거(구성 방식 참고용)\n" + "\n".join(f"- ({item['documentType']}) {item['excerpt']}" for item in evidence)
    )
    data = _openai_json(api_key, model, instructions, [{"type": "input_text", "text": text}], f"derived_{kind}", DERIVED_SCHEMAS[kind], timeout=300)
    return {"kind": kind, "label": DERIVED_KINDS[kind], "data": data, "evidenceCount": len(evidence)}


def derived_to_blocks(kind: str, data: dict) -> list[tuple[str, object, int]]:
    """파생 자료 JSON을 HWPX 블록으로 바꾼다."""
    blocks: list[tuple[str, object, int]] = []
    if kind == "guide":
        if data.get("unit_overview"):
            blocks += [("heading", "단원 개관", 1), ("paragraph", data["unit_overview"], 0)]
        if data.get("standards"):
            blocks.append(("heading", "성취기준", 2))
            blocks += [("bullet", item, 0) for item in data["standards"]]
        for lesson in data.get("lessons") or []:
            blocks.append(("heading", f"{lesson.get('lesson_label', '')} · {lesson.get('goal', '')}", 1))
            if lesson.get("materials"):
                blocks.append(("paragraph", "준비물: " + ", ".join(lesson["materials"]), 0))
            rows = [["단계", "시간", "교사", "학생", "유의점"]]
            rows += [[step.get("stage", ""), f"{step.get('minutes', '')}분", step.get("teacher", ""), step.get("student", ""), step.get("notes", "")] for step in lesson.get("flow") or []]
            blocks.append(("table", {"rows": rows, "column_weights": [1, 1, 3, 3, 2]}, 0))
            for label, key in (("핵심 발문", "questions"),):
                if lesson.get(key):
                    blocks.append(("heading", label, 3))
                    blocks += [("bullet", item, 0) for item in lesson[key]]
            for label, key in (("수준별 지도", "differentiation"), ("대체 활동", "alternative_activity"), ("안전", "safety"), ("평가", "assessment")):
                if lesson.get(key):
                    blocks.append(("paragraph", f"{label}: {lesson[key]}", 0))
        if data.get("background_knowledge"):
            blocks.append(("heading", "교사용 배경 지식", 1))
            blocks += [("bullet", item, 0) for item in data["background_knowledge"]]
    elif kind == "worksheet":
        for sheet in data.get("sheets") or []:
            blocks.append(("heading", f"{sheet.get('title', '')} ({sheet.get('lesson_label', '')})", 1))
            blocks.append(("paragraph", sheet.get("directions", ""), 0))
            for index, item in enumerate(sheet.get("items") or [], 1):
                blocks.append(("paragraph", f"{index}. {item.get('prompt', '')} [{item.get('response_type', '')}]", 0))
                blocks.append(("table", {"rows": [[" "] for _ in range(max(1, min(6, int(item.get('lines') or 2))))]}, 0))
            if sheet.get("self_check"):
                rows = [["스스로 점검", "잘함", "보통", "노력"]] + [[item, "", "", ""] for item in sheet["self_check"]]
                blocks.append(("table", {"rows": rows, "column_weights": [4, 1, 1, 1]}, 0))
    elif kind == "assessment":
        if data.get("standards"):
            blocks.append(("heading", "평가 성취기준", 2))
            blocks += [("bullet", item, 0) for item in data["standards"]]
        blocks.append(("heading", "문항", 1))
        for item in data.get("items") or []:
            blocks.append(("paragraph", f"{item.get('number', '')}. ({item.get('item_type', '')}) {item.get('question', '')}", 0))
            for choice_index, choice in enumerate(item.get("choices") or [], 1):
                blocks.append(("paragraph", f"   {'①②③④⑤⑥'[choice_index - 1] if choice_index <= 6 else choice_index} {choice}", 0))
        blocks.append(("heading", "정답과 해설", 1))
        rows = [["번호", "정답", "해설"]] + [[str(item.get("number", "")), item.get("answer", ""), item.get("explanation", "")] for item in data.get("items") or []]
        blocks.append(("table", {"rows": rows, "column_weights": [1, 2, 5]}, 0))
        task = data.get("performance_task") or {}
        if task.get("task"):
            blocks += [("heading", "수행평가 과제", 1), ("paragraph", task["task"], 0)]
            rows = [["평가 기준", "상", "중", "하"]] + [[row.get("criterion", ""), row.get("high", ""), row.get("middle", ""), row.get("low", "")] for row in task.get("criteria") or []]
            blocks.append(("table", {"rows": rows, "column_weights": [2, 2, 2, 2]}, 0))
    elif kind == "lesson_plan":
        for plan in data.get("plans") or []:
            blocks.append(("heading", f"{plan.get('lesson_label', '')} 교수·학습 과정안", 1))
            rows = [["학습 목표", plan.get("goal", "")], ["성취기준", ", ".join(plan.get("standards") or [])], ["준비물", ", ".join(plan.get("materials") or [])]]
            blocks.append(("table", {"rows": rows, "column_weights": [1, 4]}, 0))
            rows = [["단계", "시간", "교수·학습 활동", "유의점"]] + [[step.get("stage", ""), f"{step.get('minutes', '')}분", step.get("activity", ""), step.get("teacher_notes", "")] for step in plan.get("steps") or []]
            blocks.append(("table", {"rows": rows, "column_weights": [1, 1, 5, 3]}, 0))
            if plan.get("evaluation"):
                blocks.append(("paragraph", f"평가: {plan['evaluation']}", 0))
    return blocks


def build_derived_hwpx(payload: dict) -> tuple[bytes, str]:
    from hwpx_export import build_hwpx

    kind = str(payload.get("kind") or "")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else None
    if kind not in DERIVED_KINDS or not data:
        raise ValueError("내려받을 자료가 없습니다.")
    title = str(data.get("title") or f"{payload.get('unitLabel', '')} {DERIVED_KINDS[kind]}").strip()
    content = build_hwpx(title, derived_to_blocks(kind, data))
    safe = re.sub(r"[\\/:*?\"<>|]+", "_", title)[:80] or DERIVED_KINDS[kind]
    return content, f"{safe}.hwpx"


def model_name() -> str:
    return os.environ.get("OPENAI_MODEL", "gpt-5.6")
