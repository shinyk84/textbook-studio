"""표 형태 자료(단원명 제안 이력 등)를 엑셀(XLSX)·워드(DOCX) 파일로 만든다.

추가 라이브러리 없이 Office Open XML 최소 구성을 zip으로 묶는다. 한글(HWPX)은
hwpx_export.build_hwpx, PDF는 화면(캔버스)에서 만든다.
"""

from __future__ import annotations

import io
import zipfile
from xml.sax.saxutils import escape

_CELL_LIMIT = 32000  # 엑셀 셀 하나에 들어가는 글자 수 한도(32,767)보다 조금 작게


def _clean(value: object) -> str:
    text = "" if value is None else str(value)
    # XML 1.0에서 허용하지 않는 제어 문자는 지운다(줄바꿈·탭은 남긴다).
    return "".join(ch for ch in text if ch in "\t\n\r" or ord(ch) >= 0x20)[:_CELL_LIMIT]


def _column_letter(index: int) -> str:
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


def build_xlsx(title: str, columns: list[str], rows: list[list[object]], widths: list[float] | None = None) -> bytes:
    sheet_name = escape(_clean(title)[:31].replace("/", "·").replace("\\", "·").replace("?", "").replace("*", "").replace("[", "(").replace("]", ")") or "Sheet1")
    col_widths = widths or [18] * len(columns)
    cols_xml = "".join(
        f'<col min="{index + 1}" max="{index + 1}" width="{width}" customWidth="1"/>'
        for index, width in enumerate(col_widths)
    )

    def row_xml(row_number: int, values: list[object], style: int) -> str:
        cells = "".join(
            f'<c r="{_column_letter(index)}{row_number}" t="inlineStr" s="{style}"><is><t xml:space="preserve">{escape(_clean(value))}</t></is></c>'
            for index, value in enumerate(values)
        )
        return f'<row r="{row_number}">{cells}</row>'

    sheet_rows = [row_xml(1, columns, 1)] + [row_xml(index + 2, row, 2) for index, row in enumerate(rows)]
    last_cell = f"{_column_letter(max(len(columns) - 1, 0))}{len(rows) + 1}"
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f"<cols>{cols_xml}</cols><sheetData>{''.join(sheet_rows)}</sheetData>"
        f'<autoFilter ref="A1:{last_cell}"/>'
        "</worksheet>"
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><name val="맑은 고딕"/></font></fonts>'
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBE3"/><bgColor indexed="64"/></patternFill></fill></fills>'
        '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
        '<border><left style="thin"><color rgb="FFC9D3CC"/></left><right style="thin"><color rgb="FFC9D3CC"/></right>'
        '<top style="thin"><color rgb="FFC9D3CC"/></top><bottom style="thin"><color rgb="FFC9D3CC"/></bottom><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets><sheet name="{sheet_name}" sheetId="1" r:id="rId1"/></sheets>'
        f'<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">\'{sheet_name}\'!$A$1:${last_cell.rstrip("0123456789")}${len(rows) + 1}</definedName></definedNames>'
        "</workbook>"
    )
    files = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ),
        "xl/workbook.xml": workbook,
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            "</Relationships>"
        ),
        "xl/worksheets/sheet1.xml": sheet,
        "xl/styles.xml": styles,
    }
    return _zip(files)


def _docx_run(text: str, *, bold: bool = False, size: int = 18, color: str = "202A26") -> str:
    props = (
        '<w:rPr><w:rFonts w:ascii="맑은 고딕" w:hAnsi="맑은 고딕" w:eastAsia="맑은 고딕"/>'
        f'{"<w:b/>" if bold else ""}<w:color w:val="{color}"/><w:sz w:val="{size}"/><w:szCs w:val="{size}"/></w:rPr>'
    )
    parts = _clean(text).split("\n")
    body = '<w:br/>'.join(f'<w:t xml:space="preserve">{escape(part)}</w:t>' for part in parts)
    return f"<w:r>{props}{body}</w:r>"


def build_docx(title: str, columns: list[str], rows: list[list[object]], widths: list[float] | None = None, subtitle: str = "") -> bytes:
    # A4 가로(297×210mm), 여백 15mm. 표 너비 267mm를 열 비율로 나눈다(1mm = 56.7 twip).
    usable = int(267 * 56.7)
    weights = widths or [1] * len(columns)
    total = sum(weights) or 1
    grid = [max(400, int(usable * weight / total)) for weight in weights]

    def cell(text: object, width: int, header: bool) -> str:
        shade = '<w:shd w:val="clear" w:color="auto" w:fill="DDEBE3"/>' if header else ""
        return (
            f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shade}</w:tcPr>'
            f'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>{_docx_run(str(text), bold=header, size=17)}</w:p></w:tc>'
        )

    def row(values: list[object], header: bool) -> str:
        header_props = '<w:trPr><w:tblHeader/></w:trPr>' if header else ""
        return f"<w:tr>{header_props}{''.join(cell(value, grid[index], header) for index, value in enumerate(values))}</w:tr>"

    grid_xml = "".join(f'<w:gridCol w:w="{width}"/>' for width in grid)
    border = '<w:{side} w:val="single" w:sz="4" w:space="0" w:color="C9D3CC"/>'
    borders = "".join(border.format(side=side) for side in ("top", "left", "bottom", "right", "insideH", "insideV"))
    table = (
        f'<w:tbl><w:tblPr><w:tblW w:w="{sum(grid)}" w:type="dxa"/><w:tblBorders>{borders}</w:tblBorders>'
        '<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr>'
        f"<w:tblGrid>{grid_xml}</w:tblGrid>"
        f"{row(columns, True)}{''.join(row(values, False) for values in rows)}</w:tbl>"
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        f'<w:p>{_docx_run(title, bold=True, size=30, color="176B4F")}</w:p>'
        + (f"<w:p>{_docx_run(subtitle, size=18, color='5B6B60')}</w:p>" if subtitle else "")
        + table
        + '<w:p/><w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
        '<w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="425" w:footer="425" w:gutter="0"/></w:sectPr>'
        "</w:body></w:document>"
    )
    files = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
            "</Relationships>"
        ),
        "word/document.xml": document,
    }
    return _zip(files)


def _zip(files: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content.encode("utf-8"))
    return buffer.getvalue()
