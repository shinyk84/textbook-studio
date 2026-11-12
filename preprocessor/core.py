"""교과서·지도서·교육과정 자동 전처리 엔진.

파일을 넣으면 개정 연도·학교급·과목·학년·출판사·자료 종류를 추정하고,
텍스트 추출(필요하면 OCR) → 쪽·펼침면 이미지 → 검색 청크 → manifest 순서로
`official-data/processed`와 같은 형식의 결과를 만든다. 결과 검증이 끝나면
설정에 따라 원본을 그대로 두거나 휴지통으로 보내거나 삭제한다.

GUI(`gui.py`)와 명령행 모두 이 모듈을 사용한다.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import os
import re
import shutil
import sys
import unicodedata
import urllib.request
from collections import Counter
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))
import layout  # noqa: E402

PROCESSOR_VERSION = "2.1.0"
TOOL_DIR = Path(__file__).resolve().parent
APP_DIR = TOOL_DIR.parent
DEFAULT_OUTPUT = APP_DIR / "official-data" / "processed"
SUPPORTED_SUFFIXES = {".pdf", ".hwp", ".hwpx"}
CHUNK_SIZE = 3000
CHUNK_OVERLAP = 250
OCR_DPI = 300
OCR_MIN_CHARS = 20

IMAGE_PROFILES = {
    "standard": {"label": "표준(1100px)", "height": 1100, "quality": 72},
    "light": {"label": "가볍게(800px)", "height": 800, "quality": 60},
    "none": {"label": "텍스트만(이미지 없음)", "height": 0, "quality": 0},
}

DISPOSITIONS = {
    "keep": "원본 유지",
    "recycle": "휴지통으로 이동",
    "delete": "영구 삭제",
}


def _load_official_module():
    path = APP_DIR / "scripts" / "preprocess_official_documents.py"
    spec = importlib.util.spec_from_file_location("preprocess_official_documents", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


OFFICIAL = _load_official_module()


class StopRequested(Exception):
    pass


class PreprocessError(Exception):
    pass


# ---------------------------------------------------------------------------
# 분류 사전
# ---------------------------------------------------------------------------

REVISION_PATTERNS = [
    ("2022 개정", r"(?<!\d)(?:20)?22\s*[-_ ]?\s*개정|2022-33|2022-33호"),
    ("2015 개정", r"(?<!\d)(?:20)?15\s*[-_ ]?\s*개정|2015-74|2015-80"),
    ("2009 개정", r"(?<!\d)(?:20)?09\s*[-_ ]?\s*개정|2011-361|2009-41|2012-14"),
]

# (정식 이름, id용 영문, 파일·폴더명에서 찾을 이름들, 본문에서 찾을 이름들)
PUBLISHERS = [
    ("YBM", "ybm", ["YBM", "와이비엠", "ybm"], ["YBM", "와이비엠"]),
    ("천재교과서", "chunjae", ["천재교과서", "천재교육", "천재"], ["천재교과서", "천재교육"]),
    ("동아출판", "donga", ["동아출판", "동아"], ["동아출판"]),
    ("미래엔", "miraen", ["미래엔"], ["미래엔"]),
    ("지학사", "jihaksa", ["지학사"], ["지학사"]),
    ("비상교육", "visang", ["비상교육", "비상"], ["비상교육"]),
    ("아이스크림미디어", "iscream", ["아이스크림미디어", "아이스크림"], ["아이스크림미디어"]),
    ("금성출판사", "geumseong", ["금성출판사", "금성"], ["금성출판사"]),
    ("교학사", "kyohak", ["교학사"], ["교학사"]),
    ("씨마스", "ssimas", ["씨마스"], ["씨마스"]),
    ("좋은책신사고", "sinsago", ["좋은책신사고", "신사고"], ["좋은책신사고"]),
    ("김영사", "gimmyoung", ["김영사"], ["김영사"]),
    ("MiraeN", "miraen", ["miraen"], []),
]

# (과목명, id용 영문, 찾을 이름들) — 긴 이름을 먼저 둔다.
SUBJECTS = [
    ("스포츠 생활", "sports_life", ["스포츠 생활", "스포츠생활"]),
    ("스포츠 문화", "sports_culture", ["스포츠 문화", "스포츠문화"]),
    ("스포츠 과학", "sports_science", ["스포츠 과학", "스포츠과학"]),
    ("운동과 건강", "exercise_health", ["운동과 건강", "운동과건강"]),
    ("체육", "pe", ["체육", "physicaledu", "physical_edu", "physical education", "pe"]),
    ("사회과부도", "atlas", ["사회과부도", "부도"]),
    ("음악", "music", ["음악"]),
    ("미술", "art", ["미술"]),
    ("국어", "korean", ["국어"]),
    ("수학", "math", ["수학"]),
    ("사회", "social", ["사회"]),
    ("과학", "science", ["과학"]),
    ("영어", "english", ["영어"]),
    ("도덕", "moral", ["도덕"]),
    ("실과", "practical", ["실과"]),
    ("정보", "info", ["정보"]),
    ("기술·가정", "tech_home", ["기술·가정", "기술가정"]),
    ("한국사", "korean_history", ["한국사"]),
]

LEVELS = [
    ("초등학교", "elementary", [r"초등", r"초_", r"\[초", r"elementary"]),
    ("중학교", "middle", [r"중학교", r"중등", r"중_", r"middle"]),
    ("고등학교", "high", [r"고등", r"고_", r"high"]),
]

# 종류: key -> (화면 이름, 처리 방식, manifest document_type, 원본 보관 폴더, id 접미사)
KINDS = {
    "textbook": ("교과서", "page", "교과서", "textbook", "textbook"),
    "teacher_guide": ("지도서", "page", "지도서", "teacher_guide", "teacher_guide"),
    "other_book": ("기타 도서(부도·자료집)", "page", "기타도서", "textbook", "book"),
    "curriculum_general": ("교육과정 총론", "text", "curriculum", "criteria", "curriculum_general"),
    "curriculum": ("교육과정(각론)", "text", "curriculum", "criteria", "curriculum"),
    "curriculum_commentary": ("교육과정 해설서", "text", "curriculum_commentary", "criteria", "curriculum_commentary"),
    "criteria": ("편찬상 유의점·검정/인정기준", "text", "recognition_criteria", "criteria", "criteria"),
    "editorial": ("편수자료", "text", "editorial_reference", "criteria", "editorial"),
    "official_other": ("기타 공문·안내", "text", "official_reference", "criteria", "official"),
}

AUTHOR_STOPWORDS = {
    "본문", "최종", "수정", "부록", "별책", "최종수정", "서울교육연구정보원", "교과서", "지도서",
    "시행문", "검정도서", "인정도서", "펼침", "팝업", "안쪽", "앞부록", "웹용", "인쇄용", "수정본",
}


@dataclass
class DocInfo:
    path: str
    file_name: str
    size_bytes: int
    page_count: int = 0
    revision: str = "미분류"
    level: str = "미분류"
    subject: str = ""
    grade: str = ""
    volume: str = ""
    publisher: str = ""
    author: str = ""
    kind: str = ""
    document_id: str = ""
    id_locked: bool = False
    uncertain: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    @property
    def mode(self) -> str:
        return KINDS[self.kind][1] if self.kind in KINDS else "page"

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# 공통 유틸
# ---------------------------------------------------------------------------

def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def compact_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def split_text(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + CHUNK_SIZE)
        if end < len(text):
            boundary = max(
                text.rfind("\n", start + CHUNK_SIZE // 2, end),
                text.rfind(" ", start + CHUNK_SIZE // 2, end),
            )
            if boundary > start:
                end = boundary
        chunks.append(text[start:end].strip())
        if end >= len(text):
            break
        start = max(start + 1, end - CHUNK_OVERLAP)
    return [chunk for chunk in chunks if chunk]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            target.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def is_supported(path: Path) -> bool:
    name = path.name
    if name.startswith("._") or name.startswith("~$") or name == ".DS_Store":
        return False
    return path.suffix.lower() in SUPPORTED_SUFFIXES


def human_size(size: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f}{unit}" if unit in ("B", "KB") else f"{size:.1f}{unit}"
        size /= 1024
    return f"{size:.1f}GB"


_INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"]
_MEDIALS = ["a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i"]
_FINALS = ["", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "l", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t"]


def romanize(text: str) -> str:
    output = []
    for char in text:
        code = ord(char) - 0xAC00
        if 0 <= code < 11172:
            output.append(_INITIALS[code // 588] + _MEDIALS[(code % 588) // 28] + _FINALS[code % 28])
        elif char.isascii() and char.isalnum():
            output.append(char.lower())
    return "".join(output)


def slugify(text: str, limit: int = 140) -> str:
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"[\[\](){}]", "", text)
    text = re.sub(r"[^0-9A-Za-z가-힣Ⅰ-Ⅻ]+", "_", text).strip("_")
    return text[:limit]


# ---------------------------------------------------------------------------
# 자동 분류
# ---------------------------------------------------------------------------

def _sample_text(path: Path) -> tuple[str, int]:
    """앞·뒤 몇 쪽(또는 한글 문서 앞부분) 텍스트와 쪽수를 돌려준다."""
    suffix = path.suffix.lower()
    try:
        if suffix == ".pdf":
            with pymupdf.open(path) as document:
                count = len(document)
                indexes = list(range(min(5, count))) + list(range(max(5, count - 4), count))
                text = "\n".join(document[index].get_text("text") for index in indexes)
                return text, count
        sections = OFFICIAL.extract(path)
        text = "\n".join(p for section in sections for p in section["paragraphs"])
        return text[:8000], 0
    except SystemExit as exc:
        raise PreprocessError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 - 사용자에게 원인을 그대로 보여 준다
        raise PreprocessError(f"파일을 열 수 없습니다: {exc}") from exc


def _find_revision(text: str) -> str:
    for label, pattern in REVISION_PATTERNS:
        if re.search(pattern, text):
            return label
    return ""


def _find_publisher(name_text: str, body_text: str) -> str:
    lowered = name_text.lower()
    for label, _slug, name_aliases, _body_aliases in PUBLISHERS:
        if any(alias.lower() in lowered for alias in name_aliases):
            return label
    counts = Counter()
    for label, _slug, _name_aliases, body_aliases in PUBLISHERS:
        for alias in body_aliases:
            counts[label] += body_text.count(alias)
    if counts and counts.most_common(1)[0][1] > 0:
        return counts.most_common(1)[0][0]
    return ""


def _find_subject(text: str) -> str:
    lowered = text.lower()
    for label, _slug, aliases in SUBJECTS:
        for alias in aliases:
            if alias.isascii():
                if re.search(rf"(?<![a-z]){re.escape(alias)}(?![a-z])", lowered):
                    return label
            elif re.search(re.escape(alias) + ("(?!원)" if alias == "정보" else ""), text):
                return label
    return ""


def _find_level(text: str) -> str:
    text = text.replace("초중등", "").replace("초·중등", "")
    for label, _slug, patterns in LEVELS:
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns):
            return label
    return ""


def _find_kind(name_text: str, body_text: str, page_count: int) -> tuple[str, bool]:
    name = name_text
    if "지도서" in name or "교사용" in name or "teacher" in name.lower():
        return "teacher_guide", True
    if "총론" in name:
        return "curriculum_general", True
    if "해설" in name and "교육과정" in name:
        return "curriculum_commentary", True
    if any(word in name for word in ("편찬상", "유의점", "검정기준", "인정기준", "심사기준")):
        return "criteria", True
    if "편수자료" in name:
        return "editorial", True
    if any(word in name for word in ("질의", "답변", "접수", "수수료", "시행문", "안내", "공문")):
        return "official_other", True
    if "교육과정" in name and "교과서" not in name:
        return "curriculum", True
    if "교과서" in name or "textbook" in name.lower() or re.search(r"교\d", name):
        return "textbook", True
    if re.search(r"지\d", name):
        return "teacher_guide", True
    if "부도" in name or "자료집" in name:
        return "other_book", True
    # 파일명으로 판단할 수 없으면 본문으로 추정한다(확인 필요 표시).
    if "지도서" in body_text or "교사용" in body_text:
        return "teacher_guide", False
    if "교육과정" in body_text and "고시" in body_text:
        return "curriculum", False
    if page_count >= 40:
        return "textbook", False
    return "official_other", False


def _find_grade_volume(name_text: str, level: str) -> tuple[str, str]:
    grade = ""
    volume = ""
    match = re.search(r"([1-6])\s*학년", name_text)
    if match:
        grade = match.group(1)
    subject_names = "|".join(
        re.escape(alias) for _label, _slug, aliases in SUBJECTS for alias in aliases if len(alias) > 1
    )
    match = re.search(rf"(?:{subject_names})\s*(?:\([^)]*\))?\s*\]?\s*[_ ]?([1-6])(?:\s*[_-]\s*([1-3]))?(?!\d)", name_text, re.IGNORECASE)
    if match:
        grade = grade or match.group(1)
        if match.group(2):
            volume = match.group(2)
    if not grade:
        match = re.search(r"(?<![0-9가-힣])[교지]([1-6])(?!\d)", name_text)
        if match:
            grade = match.group(1)
    if level == "고등학교" and grade and not volume:
        # 고등학교 선택 과목은 학년 대신 Ⅰ/Ⅱ 같은 권 구분이 붙는 경우가 많다.
        pass
    return grade, volume


def _find_author(file_stem: str) -> str:
    for candidate in re.findall(r"\(([가-힣]{1,4})\)", file_stem):
        if candidate not in AUTHOR_STOPWORDS and not re.search(r"\d", candidate):
            return candidate
    return ""


def build_document_id(info: DocInfo) -> str:
    kind = KINDS.get(info.kind)
    if kind and kind[1] == "text":
        stem = OFFICIAL.document_id(Path(info.file_name))
        if info.revision.endswith("개정") and not re.match(r"^(?:20)?\d\d_?개정", stem):
            stem = f"{info.revision[2:4]}개정_{stem}"
        return stem[:140]
    parts = []
    if info.revision.endswith("개정"):
        parts.append(info.revision[2:4] + "개정")
    publisher_slug = next((slug for label, slug, _a, _b in PUBLISHERS if label == info.publisher), "")
    parts.append(publisher_slug or (romanize(info.publisher) if info.publisher else "unknown"))
    if info.author:
        parts.append(romanize(info.author))
    level_slug = next((slug for label, slug, _p in LEVELS if label == info.level), "")
    if level_slug:
        parts.append(level_slug)
    subject_slug = next((slug for label, slug, _a in SUBJECTS if label == info.subject), "")
    subject_part = subject_slug or (slugify(info.subject) if info.subject else "doc")
    if info.grade:
        subject_part += info.grade
    if info.volume:
        subject_part += f"_{info.volume}"
    parts.append(subject_part)
    parts.append(kind[4] if kind else "book")
    return "_".join(part for part in parts if part)


def detect(path: Path) -> DocInfo:
    path = Path(path).resolve()
    info = DocInfo(path=str(path), file_name=path.name, size_bytes=path.stat().st_size)
    if path.name.lower().endswith(".ldh"):
        raise PreprocessError("문서보안(DRM)이 걸린 파일(.LDH)입니다. 한글에서 열어 HWPX로 다시 저장한 뒤 넣어 주세요.")
    body, page_count = _sample_text(path)
    info.page_count = page_count
    name_text = " ".join([path.stem, *[parent.name for parent in list(path.parents)[:3]]])

    info.revision = _find_revision(name_text) or _find_revision(body) or "미분류"
    if info.revision == "미분류":
        info.uncertain.append("revision")
    elif not _find_revision(name_text):
        info.notes.append("개정 연도를 본문에서 추정했습니다.")

    info.kind, kind_sure = _find_kind(path.stem + " " + path.parent.name, body, page_count)
    if not kind_sure:
        info.uncertain.append("kind")

    if KINDS[info.kind][1] == "page":
        info.level = _find_level(name_text) or _find_level(body[:1500]) or "미분류"
        info.subject = _find_subject(path.stem) or _find_subject(name_text) or _find_subject(body[:1500])
    else:
        # 교육과정·기준 문서는 본문에 여러 학교급·과목이 함께 나오므로 파일명만 본다.
        info.level = _find_level(path.stem) or "미분류"
        info.subject = _find_subject(path.stem)
    if info.subject in ("스포츠 생활", "스포츠 문화", "스포츠 과학", "운동과 건강") and info.level == "미분류":
        info.level = "고등학교"

    if KINDS[info.kind][1] == "page":
        info.publisher = _find_publisher(name_text, body)
        info.author = _find_author(path.stem)
        info.grade, info.volume = _find_grade_volume(path.stem, info.level)
        if info.grade and info.level == "미분류" and int(info.grade) >= 3 and info.subject == "체육":
            info.level = "초등학교"
            info.notes.append("학년(3~6)과 과목으로 초등학교로 추정했습니다.")
        for key in ("publisher", "subject"):
            if not getattr(info, key):
                info.uncertain.append(key)
        if info.level == "미분류":
            info.uncertain.append("level")
        if info.kind in ("textbook", "teacher_guide") and info.level in ("초등학교", "중학교") and not info.grade:
            info.uncertain.append("grade")

    info.document_id = build_document_id(info)
    return info


def grade_band(level: str, grade: str) -> str:
    if level != "초등학교" or not grade:
        return ""
    value = int(grade)
    return {1: "1~2학년군", 2: "1~2학년군", 3: "3~4학년군", 4: "3~4학년군", 5: "5~6학년군", 6: "5~6학년군"}.get(value, "")


# ---------------------------------------------------------------------------
# OCR
# ---------------------------------------------------------------------------

TESSDATA_DIR = TOOL_DIR / "tessdata"
KOR_TRAINEDDATA_URL = "https://github.com/tesseract-ocr/tessdata/raw/4.1.0/kor.traineddata"


def tesseract_path() -> str | None:
    found = shutil.which("tesseract")
    if found:
        return found
    for candidate in (
        Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe"),
        Path(r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"),
    ):
        if candidate.is_file():
            return str(candidate)
    return None


def ocr_status() -> tuple[bool, str]:
    exe = tesseract_path()
    if not exe:
        return False, "Tesseract OCR이 설치되어 있지 않습니다(글자 없는 쪽은 경고만 남김)."
    if not (TESSDATA_DIR / "kor.traineddata").is_file():
        return False, "한국어 OCR 데이터가 없습니다(처음 OCR이 필요할 때 자동으로 받습니다)."
    return True, "OCR 사용 가능(한국어)"


def ensure_ocr(log: Callable[[str], None]) -> bool:
    exe = tesseract_path()
    if not exe:
        log("OCR 건너뜀: Tesseract가 설치되어 있지 않습니다.")
        return False
    TESSDATA_DIR.mkdir(exist_ok=True)
    eng = TESSDATA_DIR / "eng.traineddata"
    if not eng.is_file():
        bundled = Path(exe).parent / "tessdata" / "eng.traineddata"
        if bundled.is_file():
            shutil.copy2(bundled, eng)
    kor = TESSDATA_DIR / "kor.traineddata"
    if not kor.is_file():
        log("한국어 OCR 데이터를 내려받는 중입니다(최초 1회, 약 15MB)…")
        temporary = kor.with_suffix(".download")
        try:
            urllib.request.urlretrieve(KOR_TRAINEDDATA_URL, temporary)
            temporary.replace(kor)
        except Exception as exc:  # noqa: BLE001
            temporary.unlink(missing_ok=True)
            log(f"OCR 건너뜀: 한국어 데이터를 받지 못했습니다({exc}).")
            return False
    import pytesseract

    pytesseract.pytesseract.tesseract_cmd = exe
    os.environ["TESSDATA_PREFIX"] = str(TESSDATA_DIR)
    return True


def ocr_page(page: pymupdf.Page) -> str:
    import pytesseract
    from PIL import Image

    zoom = OCR_DPI / 72
    pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csRGB)
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    try:
        # kor+eng는 한글 사이에 영문 오인식(AA, BP 등)이 섞이고, 공백 보존 옵션이 없으면
        # 한 글자씩 띄어 쓴 결과가 나와 검색이 어려워진다(실제 편수자료로 비교해 정함).
        return compact_text(pytesseract.image_to_string(
            image, lang="kor", config="--psm 3 -c preserve_interword_spaces=1"
        ))
    finally:
        image.close()


def _hangul_count(text: str) -> int:
    return len(re.findall(r"[가-힣]", text))


def _ocr_is_better(ocr_text: str, native_text: str) -> bool:
    """삽화만 있는 쪽의 OCR 잡음('니, 00 헤' 같은 것)으로 원래 글자를 덮어쓰지 않게 한다."""
    gained = _hangul_count(ocr_text)
    return gained >= 10 and gained > _hangul_count(native_text) + 5


def text_signature(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", text)).strip()


def is_degenerate(texts: list[str]) -> bool:
    """모든 쪽이 같은 워터마크(시간·제목·URL·쪽수)만 담고 있는지 확인한다."""
    if len(texts) < 4:
        return False
    signature, count = Counter(text_signature(text) for text in texts).most_common(1)[0]
    return count / len(texts) >= 0.8 and len(signature) < 400


# ---------------------------------------------------------------------------
# 쪽 단위 처리(교과서·지도서·기타 도서)
# ---------------------------------------------------------------------------

Progress = Callable[[str, float | None], None]


def _render(page_or_doc_page: pymupdf.Page, output: Path, height: int, quality: int) -> None:
    zoom = height / page_or_doc_page.rect.height
    pixmap = page_or_doc_page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False, colorspace=pymupdf.csRGB)
    pixmap.save(output, jpg_quality=quality)


def _make_spread(source: pymupdf.Document, left_no: int, right_no: int, output: Path, height_px: int, quality: int) -> None:
    left = source[left_no - 1]
    right = source[right_no - 1]
    height = max(left.rect.height, right.rect.height)
    left_width = left.rect.width * height / left.rect.height
    right_width = right.rect.width * height / right.rect.height
    canvas = pymupdf.open()
    try:
        page = canvas.new_page(width=left_width + right_width, height=height)
        page.show_pdf_page(pymupdf.Rect(0, 0, left_width, height), source, left_no - 1)
        page.show_pdf_page(pymupdf.Rect(left_width, 0, left_width + right_width, height), source, right_no - 1)
        _render(page, output, height_px, quality)
    finally:
        canvas.close()


def _make_contact_sheet(spread_paths: list[Path], output: Path) -> None:
    if not spread_paths:
        return
    thumb_width, tile_height, margin, columns = 300, 220, 12, 4
    rows = (len(spread_paths) + columns - 1) // columns
    sheet = pymupdf.open()
    try:
        page = sheet.new_page(
            width=columns * thumb_width + (columns + 1) * margin,
            height=rows * tile_height + (rows + 1) * margin,
        )
        for index, path in enumerate(spread_paths):
            x = margin + (index % columns) * (thumb_width + margin)
            y = margin + (index // columns) * (tile_height + margin)
            page.insert_text((x + 4, y + 10), path.stem, fontsize=7)
            page.insert_image(pymupdf.Rect(x, y + 14, x + thumb_width, y + tile_height), filename=path)
        page.get_pixmap(alpha=False, colorspace=pymupdf.csRGB).save(output, jpg_quality=70)
    finally:
        sheet.close()


def _page_blocks(page: pymupdf.Page) -> tuple[str, list[dict]]:
    raw = page.get_text("dict", sort=True)
    blocks = []
    texts = []
    for block_no, block in enumerate(raw.get("blocks", [])):
        if block.get("type") != 0:
            continue
        lines = []
        for line in block.get("lines", []):
            line_text = "".join(span.get("text", "") for span in line.get("spans", []))
            if line_text.strip():
                lines.append(line_text.strip())
        block_text = "\n".join(lines).strip()
        if not block_text:
            continue
        texts.append(block_text)
        blocks.append({
            "block_no": block_no,
            "block_type": 0,
            "bbox": [round(value, 2) for value in block.get("bbox", ())],
            "text": block_text,
        })
    return compact_text("\n\n".join(texts)), blocks


def _common_meta(info: DocInfo, source_file: str) -> dict:
    return {
        "curriculum_revision": info.revision,
        "education_level": info.level,
        "subject": info.subject,
        "grade": f"{info.grade}학년" if info.grade else "",
        "volume": info.volume,
        "source_file": source_file,
    }


def process_pages(
    source: Path,
    output: Path,
    info: DocInfo,
    settings: dict,
    progress: Progress,
    should_stop: Callable[[], bool],
) -> dict:
    profile = IMAGE_PROFILES[settings.get("image_profile", "standard")]
    with_images = profile["height"] > 0
    pages_dir = output / "images" / "pages"
    spreads_dir = output / "images" / "spreads"
    if with_images:
        pages_dir.mkdir(parents=True)
        spreads_dir.mkdir(parents=True)
    source_file = f"{KINDS[info.kind][3]}/{source.name}"
    meta = _common_meta(info, source_file)
    common = {"document_id": info.document_id, "publisher": info.publisher, "document_type": KINDS[info.kind][2]}

    pages: list[dict] = []
    document = pymupdf.open(source)
    try:
        total = len(document)
        if total == 0:
            raise PreprocessError("쪽이 없는 PDF입니다.")
        # 1) 텍스트 레이어 추출
        for index, page in enumerate(document, start=1):
            if should_stop():
                raise StopRequested()
            text, blocks = _page_blocks(page)
            pages.append({
                "page_id": f"p{index:04d}",
                "physical_page": index,
                "source_pdf_page": index,
                "source_side": "full",
                "width_pt": round(page.rect.width, 2),
                "height_pt": round(page.rect.height, 2),
                "image": f"images/pages/p{index:04d}.jpg" if with_images else None,
                "text": text,
                "char_count": len(text),
                "blocks": blocks,
                "text_source": "native",
            })
            if index % 20 == 0 or index == total:
                progress(f"텍스트 추출 {index}/{total}쪽", 0.3 * index / total)

        # 2) OCR 보완: 워터마크만 있는 문서는 전 쪽, 아니면 글자가 거의 없는 쪽만
        degenerate = is_degenerate([page["text"] for page in pages])
        targets = (
            list(range(total)) if degenerate
            else [i for i, page in enumerate(pages) if page["char_count"] < OCR_MIN_CHARS]
        )
        ocr_pages: list[int] = []
        if targets and settings.get("ocr", True):
            if degenerate:
                progress("텍스트 층이 워터마크뿐이라 전 쪽을 OCR합니다(시간이 걸립니다).", None)
            if ensure_ocr(lambda message: progress(message, None)):
                for count, index in enumerate(targets, start=1):
                    if should_stop():
                        raise StopRequested()
                    text = ocr_page(document[index])
                    if degenerate or _ocr_is_better(text, pages[index]["text"]):
                        pages[index]["native_text"] = pages[index]["text"]
                        pages[index]["text"] = text
                        pages[index]["char_count"] = len(text)
                        pages[index]["text_source"] = "ocr"
                        ocr_pages.append(index + 1)
                    progress(f"OCR {count}/{len(targets)}쪽", 0.3 + 0.3 * count / len(targets))

        # 3) 인쇄 쪽 번호·펼침면 판정·디자인 요소(삽화, 반복 아이콘, 코너 이름, 글자 모양)
        def check_stop() -> None:
            if should_stop():
                raise StopRequested()

        design = layout.analyze(document, lambda message, fraction: progress(message, 0.6 + 0.1 * fraction), check_stop)
        for page, design_page in zip(pages, design["pages"]):
            page["printed_page"] = design_page["printed_page"]
            page["side"] = design_page["side"]

        # 4) 쪽·펼침면 이미지
        spreads: list[dict] = []
        spread_paths: list[Path] = []
        if with_images:
            for index, page in enumerate(document, start=1):
                check_stop()
                _render(page, pages_dir / f"p{index:04d}.jpg", profile["height"], profile["quality"])
                if index % 20 == 0 or index == total:
                    progress(f"쪽 이미지 {index}/{total}", 0.7 + 0.1 * index / total)
            layout.save_asset_thumbnails(document, design["catalog"]["assets"], output / "images" / "assets")
            (output / "images" / "layout").mkdir(parents=True)
        design_pages = {page["source_pdf_page"]: page for page in design["pages"]}
        for verdict in design["spreads"]:
            left_no, right_no = verdict["left"], verdict["right"]
            spread_id = f"s{left_no:04d}_{right_no:04d}"
            image = layout_image = None
            if with_images:
                check_stop()
                spread_path = spreads_dir / f"{spread_id}.jpg"
                _make_spread(document, left_no, right_no, spread_path, profile["height"], profile["quality"])
                spread_paths.append(spread_path)
                image = f"images/spreads/{spread_path.name}"
                layout_path = output / "images" / "layout" / f"{spread_id}.jpg"
                layout.save_annotated_spread(document, design_pages[left_no], design_pages[right_no], verdict,
                                             layout_path, profile["height"])
                layout_image = f"images/layout/{layout_path.name}"
            spreads.append({
                "spread_id": spread_id,
                "page_ids": [f"p{left_no:04d}", f"p{right_no:04d}"],
                "printed_pages": verdict["printed_pages"],
                "classification": verdict["classification"],
                "confidence": verdict["confidence"],
                "origin": "printed_page_pairs" if design["page_number_method"] != "none" else "paired_facing_pages",
                "signals": verdict["signals"],
                "metrics": verdict["metrics"],
                "image": image,
                "layout_image": layout_image,
                "text": f"{pages[left_no - 1]['text']}\n\n--- PAGE BOUNDARY ---\n\n{pages[right_no - 1]['text']}",
            })
            if with_images and (len(spreads) % 20 == 0):
                progress(f"펼침면 이미지 {len(spreads)}/{len(design['spreads'])}", 0.8 + 0.15 * left_no / total)
        if with_images:
            _make_contact_sheet(spread_paths, output / "spread_contact_sheet.jpg")
        wide_pages = sum(1 for page in pages if page["width_pt"] > page["height_pt"] * 1.2)
    finally:
        document.close()

    # 4) 검색 청크·문서·보고서
    page_chunks = []
    for page in pages:
        for chunk_no, chunk in enumerate(split_text(page["text"]), start=1):
            page_chunks.append({
                "chunk_id": f"{info.document_id}_{page['page_id']}_c{chunk_no:03d}", **common,
                "chunk_type": "page", "page_id": page["page_id"], "physical_page": page["physical_page"],
                "source_pdf_page": page["source_pdf_page"], "text": chunk, **meta,
                "text_source": page["text_source"],
            })
    spread_chunks = []
    for spread in spreads:
        for chunk_no, chunk in enumerate(split_text(spread["text"]), start=1):
            spread_chunks.append({
                "chunk_id": f"{info.document_id}_{spread['spread_id']}_c{chunk_no:03d}", **common,
                "chunk_type": "spread", "spread_id": spread["spread_id"], "page_ids": spread["page_ids"],
                "classification": spread["classification"], "confidence": spread["confidence"],
                "text": chunk, **meta,
            })
    warnings = [
        {"physical_page": page["physical_page"], "source_pdf_page": page["source_pdf_page"],
         "char_count": page["char_count"], "reason": "텍스트가 없거나 매우 적음"}
        for page in pages if page["char_count"] < OCR_MIN_CHARS
    ]

    layout.strip_private(design)
    write_jsonl(output / "pages.jsonl", pages)
    write_jsonl(output / "spreads.jsonl", spreads)
    write_jsonl(output / "layout.jsonl", design["pages"])
    (output / "design_catalog.json").write_text(
        json.dumps(design["catalog"], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_jsonl(output / "chunks.jsonl", page_chunks)
    write_jsonl(output / "spread_chunks.jsonl", spread_chunks)
    with (output / "review.csv").open("w", encoding="utf-8-sig", newline="") as target:
        writer = csv.DictWriter(target, fieldnames=["physical_page", "source_pdf_page", "char_count", "reason"])
        writer.writeheader()
        writer.writerows(warnings)
    title = source.stem
    with (output / "document.md").open("w", encoding="utf-8", newline="\n") as target:
        target.write(f"# {title}\n\n> 원본: `{source_file}`\n\n")
        for page in pages:
            printed = f" (인쇄 {page['printed_page']}쪽)" if page.get("printed_page") is not None else ""
            target.write(f"## PDF {page['source_pdf_page']}쪽{printed}\n\n{page['text']}\n\n")

    notes = [
        "원본 PDF는 변경하지 않았습니다.",
        "chunks.jsonl은 중복을 줄인 기본 페이지 검색용입니다.",
        "spread_chunks.jsonl은 펼침면 문맥이 필요한 보조 검색용입니다.",
        ("인쇄 쪽 번호(짝수=왼쪽, 홀수=오른쪽)로 펼침면 짝을 맞췄습니다." if design["page_number_method"] != "none"
         else "인쇄 쪽 번호를 찾지 못해 PDF 순서(2-3, 4-5 …)로 펼침면을 묶었습니다."),
        "펼침면 판정(spread=한 장으로 이어진 디자인, facing_pages=따로 된 두 쪽, uncertain=애매함)은 접힘선 양쪽 색과 "
        "접힘선에 걸친 삽화·배경으로 정했습니다. images/layout/의 표시 그림으로 확인할 수 있습니다.",
        "layout.jsonl에 쪽마다 삽화·반복 아이콘·색 상자·코너 이름·제목의 위치(쪽 크기 대비 0~1)를, "
        "design_catalog.json에 이 책의 반복 아이콘·코너 이름·글자 모양 목록을 담았습니다.",
    ]
    if degenerate:
        notes.append("원본 텍스트 층이 워터마크뿐이라 전 쪽을 OCR(kor, 300dpi)로 다시 추출했습니다. 원래 텍스트는 pages.jsonl의 native_text에 있습니다.")
    elif ocr_pages:
        notes.append(f"글자가 거의 없는 {len(ocr_pages)}개 쪽을 OCR로 보완했습니다.")
    if wide_pages > total / 2:
        notes.append("가로로 넓은 쪽이 많아 원본이 펼침면 단위 PDF일 수 있습니다. 쪽 분리는 하지 않았습니다.")
    outputs = ["document.md", "pages.jsonl", "spreads.jsonl", "chunks.jsonl", "spread_chunks.jsonl", "review.csv",
               "layout.jsonl", "design_catalog.json", "report.md"]
    counts = Counter(spread["classification"] for spread in spreads)
    catalog = design["catalog"]
    corner_names = [label["text"] for label in catalog["corner_labels"] if label["role"] == "corner_label"][:12]
    manifest_extra = {
        "source_pdf_pages": total,
        "physical_pages": total,
        "native_spread_document": False,
        "spread_pairs": len(spreads),
        "spread_classification_counts": dict(counts),
        "page_number_method": design["page_number_method"],
        "design_asset_count": len(catalog["assets"]),
        "corner_label_count": len(catalog["corner_labels"]),
        "page_chunks": len(page_chunks),
        "spread_chunks": len(spread_chunks),
        "preview_height_px": profile["height"],
        "page_count": total,
        "chunk_count": len(page_chunks),
        "warning_page_count": len(warnings),
        "page_index_status": "exact",
        "text_source": "ocr_fallback" if degenerate else ("native+ocr" if ocr_pages else "native"),
        "ocr_pages": ocr_pages,
        "curriculum_band": grade_band(info.level, info.grade),
        "review_framework": "인정" if info.level == "고등학교" else ("검정" if info.level else ""),
        "notes": notes,
        "outputs": outputs,
    }
    report = [
        f"# 전처리 보고서: {title}",
        "",
        f"- 개정: {info.revision}",
        f"- 학교급·과목·학년: {info.level} {info.subject} {info.grade and info.grade + '학년'} {info.volume and info.volume + '권'}",
        f"- 출판사: {info.publisher or '미상'}{' (' + info.author + ')' if info.author else ''}",
        f"- 자료 종류: {KINDS[info.kind][0]}",
        f"- 원본 PDF 쪽수: {total}",
        f"- 펼침면 쌍: {len(spreads)} (한 장 디자인 {counts.get('spread', 0)} · 따로 된 두 쪽 "
        f"{counts.get('facing_pages', 0)} · 애매함 {counts.get('uncertain', 0)})",
        f"- 반복 디자인 요소(아이콘·배경): {len(catalog['assets'])}종",
        f"- 반복 코너 이름: {', '.join(corner_names)}",
        f"- 쪽 청크 / 펼침면 청크: {len(page_chunks)} / {len(spread_chunks)}",
        f"- OCR 보완 쪽: {len(ocr_pages)}",
        f"- 텍스트 검토 대상: {len(warnings)}쪽",
        f"- 이미지: {profile['label']}",
        "",
        "## 참고",
        "",
        *[f"- {note}" for note in notes],
        "",
    ]
    (output / "report.md").write_text("\n".join(report), encoding="utf-8")
    return {"source_file": source_file, **manifest_extra}


# ---------------------------------------------------------------------------
# 문서 단위 처리(교육과정·기준·공문)
# ---------------------------------------------------------------------------

def process_text(
    source: Path,
    output: Path,
    info: DocInfo,
    settings: dict,
    progress: Progress,
    should_stop: Callable[[], bool],
) -> dict:
    try:
        sections = OFFICIAL.extract(source)
    except SystemExit as exc:
        raise PreprocessError(str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        if source.suffix.lower() == ".hwp":
            raise PreprocessError(
                f"HWP 파일을 읽지 못했습니다({exc}). 문서보안(DRM)이 걸렸거나 손상된 파일일 수 있습니다. "
                "한글에서 열어 HWPX로 다시 저장한 뒤 넣어 주세요."
            ) from exc
        raise PreprocessError(f"파일을 읽지 못했습니다: {exc}") from exc
    exact_pages = source.suffix.lower() == ".pdf"
    progress(f"본문 추출 완료({len(sections)}개 {'쪽' if exact_pages else '구역'})", 0.4)

    ocr_pages: list[int] = []
    if exact_pages:
        texts = ["\n".join(section["paragraphs"]) for section in sections]
        degenerate = is_degenerate(texts)
        targets = [i for i, text in enumerate(texts) if degenerate or len(text) < OCR_MIN_CHARS]
        if targets and settings.get("ocr", True) and ensure_ocr(lambda message: progress(message, None)):
            with pymupdf.open(source) as document:
                for count, index in enumerate(targets, start=1):
                    if should_stop():
                        raise StopRequested()
                    text = ocr_page(document[index])
                    if _ocr_is_better(text, " ".join(sections[index]["paragraphs"])):
                        sections[index]["paragraphs"] = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
                        sections[index]["method"] = "ocr"
                        ocr_pages.append(index + 1)
                    progress(f"OCR {count}/{len(targets)}쪽", 0.4 + 0.5 * count / len(targets))

    source_file = f"{KINDS[info.kind][3]}/{source.name}"
    title = re.sub(r"^[0-9]+_", "", source.stem).strip()
    document_type = KINDS[info.kind][2]
    markdown = [
        f"# {title}",
        "",
        f"> 원본: `{source_file}`",
        f"> 추출 방식: {'PDF 페이지별 텍스트' if exact_pages else '문서 구조별 텍스트(원본 페이지 대조 필요)'}",
        "",
    ]
    chunks = []
    review_rows = []
    paragraph_count = 0
    for section in sections:
        paragraph_count += len(section["paragraphs"])
        marker = f"<!-- source_page: {section['page']} -->" if exact_pages else f"<!-- source_section: {section['index']} -->"
        markdown.extend([marker, f"## {section['label']}", ""])
        markdown.extend(section["paragraphs"] or ["_추출된 텍스트 없음_"])
        markdown.append("")
        if not section["paragraphs"]:
            review_rows.append({
                "source_location": section["page"] or section["index"],
                "code": "NO_TEXT",
                "severity": "warning",
                "message": "추출된 본문이 없습니다.",
                "extraction_method": section["method"],
            })
        for content in OFFICIAL.chunk_paragraphs(section["paragraphs"]):
            chunks.append({
                "chunk_id": f"{info.document_id}-{len(chunks) + 1:04d}",
                "document_id": info.document_id,
                "document_title": title,
                "document_type": document_type,
                "curriculum_revision": info.revision,
                "source_file": source_file,
                "source_page_start": section["page"],
                "source_page_end": section["page"],
                "source_section": None if exact_pages else section["index"],
                "printed_page": None,
                "subject": info.subject or ("체육" if "체육" in title else "공통"),
                "school_level": [info.level] if info.level != "미분류" else ["미분류"],
                "heading_path": [],
                "content_kind": "text",
                "content": content,
                "extraction_method": section["method"],
                "review_required": not exact_pages,
                "review_flags": [] if exact_pages else ["PAGE_INDEX_UNAVAILABLE"],
            })

    (output / "document.md").write_text("\n".join(markdown), encoding="utf-8")
    write_jsonl(output / "chunks.jsonl", chunks)
    with (output / "review.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["source_location", "code", "severity", "message", "extraction_method"])
        writer.writeheader()
        writer.writerows(review_rows)
    report = [
        f"# 전처리 보고서: {title}",
        "",
        f"- 개정: {info.revision}",
        f"- 자료 종류: {KINDS[info.kind][0]}",
        f"- 원본 형식: {source.suffix.lower()}",
        f"- {'전체 PDF 페이지' if exact_pages else '본문 구역'}: {len(sections)}",
        f"- 추출 문단: {paragraph_count}",
        f"- 생성 청크: {len(chunks)}",
        f"- OCR 보완 쪽: {len(ocr_pages)}",
        f"- 검토 항목: {len(review_rows)}",
        "",
    ]
    if not exact_pages:
        report.extend([
            "## 원본 대조 주의",
            "",
            "HWP/HWPX 원문 순서는 보존했지만 자동 페이지 번호는 제공하지 않습니다.",
            "인용과 최종 심사 근거에는 한글 원본의 실제 쪽수를 별도로 확인해야 합니다.",
            "",
        ])
    (output / "report.md").write_text("\n".join(report), encoding="utf-8")
    return {
        "source_file": source_file,
        "page_count": len(sections) if exact_pages else 0,
        "section_count": 0 if exact_pages else len(sections),
        "paragraph_count": paragraph_count,
        "chunk_count": len(chunks),
        "warning_page_count": len(review_rows),
        "page_index_status": "exact" if exact_pages else "unavailable",
        "ocr_pages": ocr_pages,
        "outputs": ["document.md", "chunks.jsonl", "review.csv", "report.md"],
    }


# ---------------------------------------------------------------------------
# 실행·검증·원본 처리
# ---------------------------------------------------------------------------

def load_catalog_hashes(output_root: Path) -> dict[str, str]:
    hashes = {}
    if not output_root.is_dir():
        return hashes
    for manifest_path in output_root.glob("*/manifest.json"):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        digest = str(manifest.get("source_sha256", "")).lower()
        if digest:
            hashes[digest] = manifest_path.parent.name
    return hashes


def estimate_output_bytes(info: DocInfo, settings: dict) -> int:
    pages = max(info.page_count, 1)
    profile = settings.get("image_profile", "standard")
    per_page = {"standard": 700_000, "light": 350_000, "none": 15_000}[profile]
    if info.mode == "text":
        per_page = 15_000
    return pages * per_page + 50_000_000


def verify_output(source: Path, output: Path, expected_sha: str) -> list[str]:
    problems = []
    manifest_path = output / "manifest.json"
    if not manifest_path.is_file():
        return ["manifest.json이 없습니다."]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    for name in manifest.get("outputs", []):
        if not (output / name).is_file():
            problems.append(f"출력 파일 누락: {name}")
    for name in ("pages.jsonl", "chunks.jsonl", "spreads.jsonl", "spread_chunks.jsonl"):
        path = output / name
        if path.is_file():
            try:
                rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
            except json.JSONDecodeError:
                problems.append(f"{name}를 읽을 수 없습니다.")
                continue
            if name == "pages.jsonl" and len(rows) != int(manifest.get("page_count", -1)):
                problems.append("pages.jsonl 쪽수가 manifest와 다릅니다.")
            if name == "pages.jsonl":
                for row in rows:
                    image = row.get("image")
                    if image and not (output / image).is_file():
                        problems.append(f"쪽 이미지 누락: {image}")
                        break
    if source.suffix.lower() == ".pdf" and manifest.get("page_index_status") == "exact":
        with pymupdf.open(source) as document:
            if len(document) != int(manifest.get("page_count", -1)):
                problems.append("원본 PDF 쪽수와 결과 쪽수가 다릅니다.")
    if sha256(source) != expected_sha:
        problems.append("처리 중에 원본 파일이 바뀌었습니다(해시 불일치).")
    if int(manifest.get("chunk_count", 0)) == 0:
        problems.append("검색 청크가 하나도 만들어지지 않았습니다(텍스트 없음).")
    return problems


def send_to_recycle_bin(path: Path) -> None:
    if sys.platform != "win32":
        raise OSError("휴지통 이동은 Windows에서만 지원합니다.")
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [
            ("hwnd", wintypes.HWND),
            ("wFunc", wintypes.UINT),
            ("pFrom", wintypes.LPCWSTR),
            ("pTo", wintypes.LPCWSTR),
            ("fFlags", ctypes.c_uint16),
            ("fAnyOperationsAborted", wintypes.BOOL),
            ("hNameMappings", ctypes.c_void_p),
            ("lpszProgressTitle", wintypes.LPCWSTR),
        ]

    fo_delete = 3
    flags = 0x40 | 0x10 | 0x4 | 0x400  # ALLOWUNDO | NOCONFIRMATION | SILENT | NOERRORUI
    operation = SHFILEOPSTRUCTW(None, fo_delete, str(path.resolve()) + "\0", None, flags, False, None, None)
    result = ctypes.windll.shell32.SHFileOperationW(ctypes.byref(operation))
    if result != 0 or path.exists():
        raise OSError(f"휴지통으로 옮기지 못했습니다(코드 {result}).")


def dispose_source(source: Path, disposition: str) -> str:
    if disposition == "recycle":
        send_to_recycle_bin(source)
        return "휴지통으로 이동"
    if disposition == "delete":
        source.unlink()
        return "영구 삭제"
    return "원본 유지"


def run(
    info: DocInfo,
    settings: dict,
    progress: Progress = lambda message, fraction: None,
    should_stop: Callable[[], bool] = lambda: False,
) -> dict:
    """한 파일을 전처리하고 검증한 뒤 원본을 처리한다. 결과 요약을 돌려준다."""
    source = Path(info.path)
    if not source.is_file():
        raise PreprocessError("원본 파일을 찾을 수 없습니다.")
    output_root = Path(settings.get("output_dir") or DEFAULT_OUTPUT)
    output_root.mkdir(parents=True, exist_ok=True)
    disposition = settings.get("disposition", "keep")

    progress("원본 해시 계산 중", 0.0)
    digest = sha256(source)
    existing = load_catalog_hashes(output_root).get(digest)
    if existing:
        result = {"status": "duplicate", "document_id": existing, "output": str(output_root / existing)}
        if settings.get("dispose_duplicates", True) and disposition != "keep":
            result["disposition"] = dispose_source(source, disposition)
        else:
            result["disposition"] = "원본 유지"
        return result

    need = estimate_output_bytes(info, settings)
    free = shutil.disk_usage(output_root).free
    if free < need + 500 * 1024 * 1024:
        raise PreprocessError(
            f"저장 위치의 여유 공간이 부족합니다(남은 공간 {human_size(free)}, 예상 필요 {human_size(need)})."
        )

    document_id = info.document_id or build_document_id(info)
    final = output_root / document_id
    suffix = 2
    while final.exists():
        final = output_root / f"{document_id}_v{suffix}"
        suffix += 1
    info.document_id = final.name
    partial = output_root / f"{final.name}.partial"
    if partial.exists():
        shutil.rmtree(partial)
    partial.mkdir()

    try:
        processor = process_pages if info.mode == "page" else process_text
        if info.mode == "page" and source.suffix.lower() != ".pdf":
            processor = process_text
        details = processor(source, partial, info, settings, progress, should_stop)
        manifest = {
            "schema_version": "1.0",
            "processor": "textbook-studio preprocessor",
            "processor_version": PROCESSOR_VERSION,
            "document_id": info.document_id,
            "title": source.stem,
            "publisher": info.publisher,
            "author": info.author,
            "document_type": KINDS[info.kind][2],
            "document_kind": info.kind,
            "document_kind_label": KINDS[info.kind][0],
            "curriculum_revision": info.revision,
            "education_level": info.level,
            "subject": info.subject,
            "grade": f"{info.grade}학년" if info.grade else "",
            "volume": info.volume,
            "source": details["source_file"],
            "source_sha256": digest,
            "source_size_bytes": source.stat().st_size,
            "original_path": str(source),
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "table_count": 0,
            "image_profile": settings.get("image_profile", "standard"),
            **details,
        }
        (partial / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        progress("결과 검증 중", 0.97)
        problems = verify_output(source, partial, digest)
        if problems:
            raise PreprocessError("검증 실패: " + " / ".join(problems))
        partial.rename(final)
    except BaseException:
        shutil.rmtree(partial, ignore_errors=True)
        raise

    result_disposition = dispose_source(source, disposition)
    manifest_path = final / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["source_disposition"] = result_disposition
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_catalog(output_root)
    progress("완료", 1.0)
    return {
        "status": "done",
        "document_id": final.name,
        "output": str(final),
        "disposition": result_disposition,
        "output_bytes": sum(path.stat().st_size for path in final.rglob("*") if path.is_file()),
        "warnings": manifest.get("warning_page_count", 0),
        "ocr_pages": len(manifest.get("ocr_pages", [])),
    }


CATALOG_FIELDS = [
    ("document_id", "문서 ID"),
    ("curriculum_revision", "개정"),
    ("education_level", "학교급"),
    ("subject", "과목"),
    ("grade", "학년"),
    ("volume", "권"),
    ("publisher", "출판사"),
    ("author", "저자·구분"),
    ("document_kind_label", "종류"),
    ("page_count", "쪽수"),
    ("chunk_count", "청크"),
    ("warning_page_count", "검토 쪽"),
    ("source_size_bytes", "원본 크기(바이트)"),
    ("processed_at", "처리 일시"),
    ("source_disposition", "원본 처리"),
    ("original_path", "원본 위치"),
]


def write_catalog(output_root: Path) -> Path:
    rows = []
    for manifest_path in sorted(output_root.glob("*/manifest.json")):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        manifest.setdefault("document_id", manifest_path.parent.name)
        manifest.setdefault("document_kind_label", manifest.get("document_type", ""))
        rows.append({label: manifest.get(key, "") for key, label in CATALOG_FIELDS})
    path = output_root / "_전처리목록.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=[label for _key, label in CATALOG_FIELDS])
        writer.writeheader()
        writer.writerows(rows)
    return path


# ---------------------------------------------------------------------------
# 명령행
# ---------------------------------------------------------------------------

def iter_sources(paths: list[Path]):
    for path in paths:
        if path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file() and (is_supported(child) or child.name.lower().endswith(".ldh")):
                    yield child
        elif path.is_file() and (is_supported(path) or path.name.lower().endswith(".ldh")):
            yield path


def main() -> None:
    parser = argparse.ArgumentParser(description="교과서·지도서·교육과정 자동 전처리")
    parser.add_argument("sources", nargs="+", type=Path, help="파일 또는 폴더")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--images", choices=list(IMAGE_PROFILES), default="standard")
    parser.add_argument("--no-ocr", action="store_true")
    parser.add_argument("--after", choices=list(DISPOSITIONS), default="keep", help="검증 후 원본 처리")
    parser.add_argument("--detect-only", action="store_true", help="분류 결과만 보여 주고 처리하지 않음")
    args = parser.parse_args()
    settings = {
        "output_dir": str(args.output_dir),
        "image_profile": args.images,
        "ocr": not args.no_ocr,
        "disposition": args.after,
    }
    for source in iter_sources(args.sources):
        try:
            info = detect(source)
        except PreprocessError as exc:
            print(f"[실패] {source.name}: {exc}")
            continue
        flag = f" (확인 필요: {', '.join(info.uncertain)})" if info.uncertain else ""
        print(f"[분류] {source.name} → {info.document_id} | {info.revision} {info.level} {info.subject} "
              f"{info.grade} {info.publisher} {KINDS[info.kind][0]}{flag}")
        if args.detect_only:
            continue
        try:
            result = run(info, settings, lambda message, fraction: print(f"    {message}", flush=True))
        except (PreprocessError, StopRequested) as exc:
            print(f"[실패] {source.name}: {exc}")
            continue
        print(f"[{'완료' if result['status'] == 'done' else '중복'}] {result['document_id']} ({result['disposition']})")


if __name__ == "__main__":
    main()
