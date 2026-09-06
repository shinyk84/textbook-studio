from __future__ import annotations

from pathlib import Path
from typing import Iterable

from hwpx import HwpxDocument


Block = tuple[str, object, int]
TEMPLATE_PATH = Path(__file__).resolve().parent / "assets" / "blank.hwpx"

# HWP 내부 단위(HWPUNIT)는 1/7200인치 — 1mm = 7200/25.4 HWPUNIT.
_MM_TO_HWPUNIT = 7200 / 25.4


def _set_cell_margin_mm(cell, margin_mm: float) -> None:
    value = str(round(margin_mm * _MM_TO_HWPUNIT))
    cell.element.set("hasMargin", "1")
    margin = cell.element.find("{http://www.hancom.co.kr/hwpml/2011/paragraph}cellMargin")
    if margin is None:
        margin = cell.element.makeelement(
            "{http://www.hancom.co.kr/hwpml/2011/paragraph}cellMargin", {}
        )
        cell.element.append(margin)
    for side in ("left", "right", "top", "bottom"):
        margin.set(side, value)


def build_hwpx(
    title: str,
    blocks: Iterable[Block],
    *,
    title_size: float = 22,
    heading_sizes: dict[int, float] | None = None,
    cell_margin_mm: float | None = None,
) -> bytes:
    if not TEMPLATE_PATH.is_file():
        raise FileNotFoundError("HWPX 기본 템플릿을 찾을 수 없습니다.")
    document = HwpxDocument.open(TEMPLATE_PATH)
    title_style = document.ensure_run_style(
        bold=True,
        size=title_size,
        color="#176B4F",
    )
    resolved_heading_sizes = {1: 17, 2: 14, 3: 12, 4: 11, **(heading_sizes or {})}
    heading_styles = {
        1: document.ensure_run_style(bold=True, size=resolved_heading_sizes[1], color="#183C31"),
        2: document.ensure_run_style(bold=True, size=resolved_heading_sizes[2], color="#245746"),
        3: document.ensure_run_style(bold=True, size=resolved_heading_sizes[3], color="#3A6758"),
        4: document.ensure_run_style(bold=True, size=resolved_heading_sizes[4], color="#425E54"),
    }
    body_style = document.ensure_run_style(size=10.5, color="#202A26")
    bullet_style = document.ensure_run_style(size=10.5, color="#314D43")

    document.add_paragraph(title, char_pr_id_ref=title_style)

    for block_type, text, level in blocks:
        if block_type == "table":
            if isinstance(text, dict):
                rows = [list(map(str, row)) for row in text.get("rows") or []]
                column_weights = text.get("column_weights")
            else:
                rows = [list(map(str, row)) for row in text] if isinstance(text, list) else []
                column_weights = None
            if not rows:
                continue
            column_count = max(len(row) for row in rows)
            table = document.add_table(
                len(rows),
                column_count,
                width=42000,
                char_pr_id_ref=body_style,
            )
            if column_weights and len(column_weights) == column_count:
                table.set_column_widths(column_weights)
            elif column_count == 2:
                table.set_column_widths([1, 3])
            for row_index, row in enumerate(rows):
                for column_index in range(column_count):
                    value = row[column_index] if column_index < len(row) else ""
                    table.set_cell_text(row_index, column_index, value)
                    if cell_margin_mm is not None:
                        _set_cell_margin_mm(table.cell(row_index, column_index), cell_margin_mm)
                    if row_index == 0:
                        table.set_cell_shading(row_index, column_index, "#DDEBE3")
                    elif row_index % 2 == 0:
                        table.set_cell_shading(row_index, column_index, "#F5F7F5")
            continue
        clean_text = str(text).strip()
        if not clean_text:
            continue
        if block_type == "heading":
            style = heading_styles[min(max(level, 1), 4)]
            document.add_paragraph(clean_text, char_pr_id_ref=style)
        elif block_type == "bullet":
            document.add_paragraph(f"• {clean_text}", char_pr_id_ref=bullet_style)
        else:
            for line in clean_text.splitlines() or [""]:
                if not line.strip():
                    continue
                document.add_paragraph(line.strip(), char_pr_id_ref=body_style)

    validation = document.validate()
    if validation.issues:
        issue_text = "; ".join(str(issue) for issue in validation.issues[:3])
        raise ValueError(f"HWPX 문서 검증에 실패했습니다: {issue_text}")
    return document.to_bytes()
