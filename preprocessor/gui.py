"""교과서 자료 전처리기 화면.

파일·폴더를 추가하면 자동으로 분류하고, [전처리 시작]을 누르면 순서대로
전처리 → 검증 → 원본 처리(유지·휴지통·삭제)를 진행한다. 감시 폴더를 켜 두면
그 폴더에 복사해 넣은 파일을 알아서 처리한다.
"""

from __future__ import annotations

import json
import queue
import shutil
import sys
import threading
import tkinter as tk
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

sys.path.insert(0, str(Path(__file__).resolve().parent))
import core  # noqa: E402

SETTINGS_PATH = core.TOOL_DIR / "settings.json"
DEFAULT_SETTINGS = {
    "output_dir": str(core.DEFAULT_OUTPUT),
    "image_profile": "standard",
    "ocr": True,
    "disposition": "recycle",
    "watch_dir": "",
    "watch_enabled": False,
}
REVISIONS = ["2022 개정", "2015 개정", "2009 개정", "미분류"]
LEVELS = ["초등학교", "중학교", "고등학교", "미분류"]
SUBJECT_NAMES = [label for label, _slug, _aliases in core.SUBJECTS]
PUBLISHER_NAMES = list(dict.fromkeys(label for label, _slug, _a, _b in core.PUBLISHERS if label != "MiraeN"))
KIND_LABELS = {key: value[0] for key, value in core.KINDS.items()}
KIND_BY_LABEL = {value: key for key, value in KIND_LABELS.items()}
FIELD_LABELS = {"revision": "개정", "kind": "종류", "publisher": "출판사", "subject": "과목", "level": "학교급", "grade": "학년"}
STATUS_TAGS = {
    "분석 중": "busy", "확인 필요": "check", "대기": "ready", "처리 중": "busy",
    "완료": "done", "중복": "dup", "실패": "fail", "중지됨": "fail",
}


def load_settings() -> dict:
    settings = dict(DEFAULT_SETTINGS)
    try:
        settings.update(json.loads(SETTINGS_PATH.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass
    # 프로그램 폴더를 옮기면 예전 저장 위치가 남아 엉뚱한 곳(예: 용량 부족한 C)에 새로 만들어진다.
    if not Path(settings["output_dir"]).is_dir() and core.DEFAULT_OUTPUT.is_dir():
        settings["output_dir"] = str(core.DEFAULT_OUTPUT)
    return settings


class App:
    def __init__(self, root: tk.Tk, initial_paths: list[Path]):
        self.root = root
        self.settings = load_settings()
        self.items: dict[str, dict] = {}
        self.events: queue.Queue = queue.Queue()
        self.detector = ThreadPoolExecutor(max_workers=1)
        self.worker: threading.Thread | None = None
        self.stop_flag = threading.Event()
        self.watch_seen: dict[str, tuple[int, float]] = {}
        self.current_iid: str | None = None

        root.title("교과서 자료 전처리기")
        root.geometry("1280x820")
        root.minsize(1000, 640)
        style = ttk.Style()
        try:
            style.theme_use("vista")
        except tk.TclError:
            pass
        for name in ("TLabel", "TButton", "TCheckbutton", "TRadiobutton", "TLabelframe.Label", "TCombobox", "TEntry"):
            style.configure(name, font=("Malgun Gothic", 10))
        style.configure("Treeview", font=("Malgun Gothic", 10), rowheight=26)
        style.configure("Treeview.Heading", font=("Malgun Gothic", 10, "bold"))
        style.configure("Accent.TButton", font=("Malgun Gothic", 10, "bold"))

        self._build_toolbar()
        self._build_body()
        self._build_settings()
        self._build_footer()
        self._refresh_space()
        self._refresh_ocr()

        root.protocol("WM_DELETE_WINDOW", self.on_close)
        root.after(100, self._poll_events)
        root.after(3000, self._poll_watch)
        if initial_paths:
            self.add_paths(initial_paths)

    # ------------------------------------------------------------------ 화면
    def _build_toolbar(self) -> None:
        bar = ttk.Frame(self.root, padding=(10, 8))
        bar.pack(fill="x")
        ttk.Button(bar, text="파일 추가…", command=self.pick_files).pack(side="left")
        ttk.Button(bar, text="폴더 추가…", command=self.pick_folder).pack(side="left", padx=(6, 0))
        ttk.Button(bar, text="선택 항목 빼기", command=self.remove_selected).pack(side="left", padx=(18, 0))
        ttk.Button(bar, text="완료 항목 정리", command=self.clear_finished).pack(side="left", padx=(6, 0))
        ttk.Button(bar, text="결과 폴더 열기", command=self.open_output).pack(side="left", padx=(18, 0))
        self.stop_button = ttk.Button(bar, text="■ 중지", command=self.stop, state="disabled")
        self.stop_button.pack(side="right")
        self.start_button = ttk.Button(bar, text="▶ 전처리 시작", style="Accent.TButton", command=self.start)
        self.start_button.pack(side="right", padx=(0, 6))
        self.summary_label = ttk.Label(bar, text="")
        self.summary_label.pack(side="right", padx=12)

    def _build_body(self) -> None:
        body = ttk.Panedwindow(self.root, orient="horizontal")
        body.pack(fill="both", expand=True, padx=10)

        table_frame = ttk.Frame(body)
        columns = ("status", "file", "revision", "level", "subject", "grade", "publisher", "kind", "size", "doc_id")
        headings = ("상태", "파일", "개정", "학교급", "과목", "학년", "출판사", "종류", "쪽·크기", "문서 ID")
        widths = (80, 280, 80, 80, 90, 50, 110, 120, 110, 300)
        self.tree = ttk.Treeview(table_frame, columns=columns, show="headings", selectmode="extended")
        for column, heading, width in zip(columns, headings, widths):
            self.tree.heading(column, text=heading)
            self.tree.column(column, width=width, minwidth=40, stretch=column in ("file", "doc_id"))
        self.tree.tag_configure("check", background="#fff4cc")
        self.tree.tag_configure("ready", background="#ffffff")
        self.tree.tag_configure("busy", background="#e3efff")
        self.tree.tag_configure("done", background="#e4f5e4")
        self.tree.tag_configure("dup", background="#eeeeee")
        self.tree.tag_configure("fail", background="#fde2e2")
        scroll_y = ttk.Scrollbar(table_frame, orient="vertical", command=self.tree.yview)
        scroll_x = ttk.Scrollbar(table_frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=scroll_y.set, xscrollcommand=scroll_x.set)
        self.tree.grid(row=0, column=0, sticky="nsew")
        scroll_y.grid(row=0, column=1, sticky="ns")
        scroll_x.grid(row=1, column=0, sticky="ew")
        table_frame.rowconfigure(0, weight=1)
        table_frame.columnconfigure(0, weight=1)
        self.tree.bind("<<TreeviewSelect>>", lambda _event: self.load_form())
        body.add(table_frame, weight=3)

        form = ttk.Labelframe(body, text="선택한 파일 정보", padding=10)
        self.form_vars = {
            "revision": tk.StringVar(), "level": tk.StringVar(), "subject": tk.StringVar(),
            "grade": tk.StringVar(), "volume": tk.StringVar(), "publisher": tk.StringVar(),
            "author": tk.StringVar(), "kind": tk.StringVar(), "document_id": tk.StringVar(),
        }
        rows = [
            ("개정", "revision", REVISIONS, True),
            ("종류", "kind", list(KIND_LABELS.values()), True),
            ("학교급", "level", LEVELS, True),
            ("과목", "subject", SUBJECT_NAMES, False),
            ("학년", "grade", ["", "1", "2", "3", "4", "5", "6"], False),
            ("권(분책)", "volume", ["", "1", "2", "3"], False),
            ("출판사", "publisher", PUBLISHER_NAMES, False),
            ("저자·구분", "author", None, False),
        ]
        self.form_widgets = []
        for row, (label, key, values, readonly) in enumerate(rows):
            ttk.Label(form, text=label).grid(row=row, column=0, sticky="w", pady=3)
            if values is None:
                widget = ttk.Entry(form, textvariable=self.form_vars[key], width=28)
            else:
                widget = ttk.Combobox(form, textvariable=self.form_vars[key], values=values, width=26,
                                      state="readonly" if readonly else "normal")
            widget.grid(row=row, column=1, sticky="ew", pady=3)
            self.form_widgets.append(widget)
        ttk.Label(form, text="문서 ID").grid(row=len(rows), column=0, sticky="w", pady=(10, 3))
        id_entry = ttk.Entry(form, textvariable=self.form_vars["document_id"], width=28)
        id_entry.grid(row=len(rows), column=1, sticky="ew", pady=(10, 3))
        self.form_widgets.append(id_entry)
        ttk.Button(form, text="ID 자동 생성", command=self.regenerate_id).grid(row=len(rows) + 1, column=1, sticky="e")
        self.notes_label = ttk.Label(form, text="", foreground="#8a5a00", wraplength=300, justify="left")
        self.notes_label.grid(row=len(rows) + 2, column=0, columnspan=2, sticky="w", pady=(10, 0))
        buttons = ttk.Frame(form)
        buttons.grid(row=len(rows) + 3, column=0, columnspan=2, sticky="ew", pady=(14, 0))
        ttk.Button(buttons, text="수정 내용 적용", command=self.apply_form).pack(side="left")
        ttk.Button(buttons, text="선택 항목 추정값대로 확정", command=self.confirm_selected).pack(side="left", padx=(6, 0))
        form.columnconfigure(1, weight=1)
        body.add(form, weight=1)

    def _build_settings(self) -> None:
        box = ttk.Labelframe(self.root, text="설정", padding=(10, 6))
        box.pack(fill="x", padx=10, pady=(8, 0))

        self.output_var = tk.StringVar(value=self.settings["output_dir"])
        ttk.Label(box, text="저장 위치").grid(row=0, column=0, sticky="w")
        ttk.Entry(box, textvariable=self.output_var, state="readonly").grid(row=0, column=1, sticky="ew", padx=6)
        ttk.Button(box, text="변경…", command=self.pick_output).grid(row=0, column=2)
        self.space_label = ttk.Label(box, text="")
        self.space_label.grid(row=0, column=3, sticky="w", padx=(10, 0))

        ttk.Label(box, text="이미지").grid(row=1, column=0, sticky="w", pady=(6, 0))
        image_frame = ttk.Frame(box)
        image_frame.grid(row=1, column=1, columnspan=3, sticky="w", pady=(6, 0), padx=6)
        self.image_var = tk.StringVar(value=self.settings["image_profile"])
        for key, profile in core.IMAGE_PROFILES.items():
            ttk.Radiobutton(image_frame, text=profile["label"], value=key, variable=self.image_var,
                            command=self.save_settings).pack(side="left", padx=(0, 12))
        self.ocr_var = tk.BooleanVar(value=self.settings["ocr"])
        ttk.Checkbutton(image_frame, text="글자 없는 쪽 OCR", variable=self.ocr_var,
                        command=self.save_settings).pack(side="left", padx=(18, 6))
        self.ocr_label = ttk.Label(image_frame, text="", foreground="#666666")
        self.ocr_label.pack(side="left")

        ttk.Label(box, text="검증 후 원본").grid(row=2, column=0, sticky="w", pady=(6, 0))
        dispose_frame = ttk.Frame(box)
        dispose_frame.grid(row=2, column=1, columnspan=3, sticky="w", pady=(6, 0), padx=6)
        self.dispose_var = tk.StringVar(value=self.settings["disposition"])
        for key, label in core.DISPOSITIONS.items():
            ttk.Radiobutton(dispose_frame, text=label, value=key, variable=self.dispose_var,
                            command=self.change_disposition).pack(side="left", padx=(0, 12))
        ttk.Label(dispose_frame, text="※ 결과 검증(쪽수·해시·파일)을 통과한 경우에만 처리합니다. 휴지통은 비워야 공간이 확보됩니다.",
                  foreground="#666666").pack(side="left", padx=(6, 0))

        ttk.Label(box, text="감시 폴더").grid(row=3, column=0, sticky="w", pady=(6, 0))
        self.watch_var = tk.StringVar(value=self.settings["watch_dir"])
        ttk.Entry(box, textvariable=self.watch_var, state="readonly").grid(row=3, column=1, sticky="ew", padx=6, pady=(6, 0))
        ttk.Button(box, text="변경…", command=self.pick_watch).grid(row=3, column=2, pady=(6, 0))
        self.watch_enabled = tk.BooleanVar(value=self.settings["watch_enabled"])
        ttk.Checkbutton(box, text="켜기: 이 폴더에 넣은 파일을 자동 전처리", variable=self.watch_enabled,
                        command=self.toggle_watch).grid(row=3, column=3, sticky="w", padx=(10, 0), pady=(6, 0))
        box.columnconfigure(1, weight=1)

    def _build_footer(self) -> None:
        footer = ttk.Frame(self.root, padding=(10, 6, 10, 10))
        footer.pack(fill="both")
        self.progress_label = ttk.Label(footer, text="대기 중")
        self.progress_label.pack(fill="x")
        self.progress = ttk.Progressbar(footer, mode="determinate", maximum=1.0)
        self.progress.pack(fill="x", pady=(4, 6))
        self.log_box = ScrolledText(footer, height=8, font=("Malgun Gothic", 9), state="disabled")
        self.log_box.pack(fill="both", expand=True)

    # ------------------------------------------------------------------ 설정
    def save_settings(self) -> None:
        self.settings.update({
            "output_dir": self.output_var.get(),
            "image_profile": self.image_var.get(),
            "ocr": self.ocr_var.get(),
            "disposition": self.dispose_var.get(),
            "watch_dir": self.watch_var.get(),
            "watch_enabled": self.watch_enabled.get(),
        })
        try:
            SETTINGS_PATH.write_text(json.dumps(self.settings, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError as exc:
            self.log(f"설정을 저장하지 못했습니다: {exc}")

    def change_disposition(self) -> None:
        if self.dispose_var.get() == "delete" and not messagebox.askyesno(
            "영구 삭제 확인",
            "검증을 통과한 원본 파일을 휴지통을 거치지 않고 바로 삭제합니다.\n되돌릴 수 없습니다. 계속할까요?",
        ):
            self.dispose_var.set(self.settings["disposition"] if self.settings["disposition"] != "delete" else "recycle")
        self.save_settings()

    def pick_output(self) -> None:
        folder = filedialog.askdirectory(title="전처리 결과를 저장할 폴더", initialdir=self.output_var.get() or None)
        if folder:
            self.output_var.set(str(Path(folder)))
            self.save_settings()
            self._refresh_space()

    def pick_watch(self) -> None:
        folder = filedialog.askdirectory(title="자동 전처리할 감시 폴더", initialdir=self.watch_var.get() or None)
        if folder:
            self.watch_var.set(str(Path(folder)))
            self.watch_seen.clear()
            self.save_settings()

    def toggle_watch(self) -> None:
        if self.watch_enabled.get() and not self.watch_var.get():
            messagebox.showinfo("감시 폴더", "먼저 감시할 폴더를 정해 주세요.")
            self.watch_enabled.set(False)
        self.save_settings()
        if self.watch_enabled.get():
            self.log(f"감시 시작: {self.watch_var.get()}")

    def _refresh_space(self) -> None:
        try:
            output = Path(self.output_var.get())
            probe = output if output.exists() else output.anchor or output
            free = shutil.disk_usage(probe).free
            self.space_label.configure(text=f"남은 공간 {core.human_size(free)}")
        except OSError:
            self.space_label.configure(text="")

    def _refresh_ocr(self) -> None:
        _ready, message = core.ocr_status()
        self.ocr_label.configure(text=message)

    # ------------------------------------------------------------------ 목록
    def pick_files(self) -> None:
        files = filedialog.askopenfilenames(
            title="전처리할 파일 선택",
            filetypes=[("교과서·교육과정 문서", "*.pdf *.hwp *.hwpx"), ("모든 파일", "*.*")],
        )
        self.add_paths([Path(file) for file in files])

    def pick_folder(self) -> None:
        folder = filedialog.askdirectory(title="폴더 안의 PDF·HWP·HWPX를 모두 추가")
        if folder:
            self.add_paths([Path(folder)])

    def add_paths(self, paths: list[Path], auto: bool = False) -> int:
        known = {item["path"] for item in self.items.values()}
        added = 0
        for path in core.iter_sources(paths):
            key = str(path.resolve())
            if key in known:
                continue
            known.add(key)
            iid = self.tree.insert("", "end", values=("분석 중", path.name, "", "", "", "", "", "", core.human_size(path.stat().st_size), ""), tags=("busy",))
            self.items[iid] = {"path": key, "info": None, "status": "분석 중", "auto": auto, "error": ""}
            self.detector.submit(self._detect_job, iid, Path(key))
            added += 1
        if added:
            self.log(f"{added}개 파일 추가 — 자동 분류 중")
        self._update_summary()
        return added

    def _detect_job(self, iid: str, path: Path) -> None:
        try:
            info = core.detect(path)
            self.events.put(("detected", iid, info))
        except Exception as exc:  # noqa: BLE001
            self.events.put(("detect_failed", iid, str(exc)))

    def remove_selected(self) -> None:
        for iid in self.tree.selection():
            if self.items.get(iid, {}).get("status") == "처리 중":
                continue
            self.tree.delete(iid)
            self.items.pop(iid, None)
        self._update_summary()

    def clear_finished(self) -> None:
        for iid, item in list(self.items.items()):
            if item["status"] in ("완료", "중복"):
                self.tree.delete(iid)
                self.items.pop(iid)
        self._update_summary()

    def open_output(self) -> None:
        path = Path(self.output_var.get())
        path.mkdir(parents=True, exist_ok=True)
        if sys.platform == "win32":
            import os
            os.startfile(path)  # noqa: S606

    def _render_row(self, iid: str) -> None:
        item = self.items[iid]
        info: core.DocInfo | None = item["info"]
        status = item["status"]
        if info is None:
            values = (status, Path(item["path"]).name, "", "", "", "", "", "", "", item.get("error", ""))
        else:
            size = core.human_size(info.size_bytes)
            if info.page_count:
                size = f"{info.page_count}쪽 · {size}"
            values = (
                status, info.file_name, info.revision, info.level, info.subject,
                info.grade, info.publisher + (f"({info.author})" if info.author else ""),
                KIND_LABELS.get(info.kind, ""), size, item.get("error") or info.document_id,
            )
        self.tree.item(iid, values=values, tags=(STATUS_TAGS.get(status, "ready"),))

    def _update_summary(self) -> None:
        counts: dict[str, int] = {}
        for item in self.items.values():
            counts[item["status"]] = counts.get(item["status"], 0) + 1
        order = ["확인 필요", "대기", "처리 중", "완료", "중복", "실패"]
        text = "  ".join(f"{name} {counts[name]}" for name in order if counts.get(name))
        self.summary_label.configure(text=text)

    # ------------------------------------------------------------------ 편집
    def load_form(self) -> None:
        selection = self.tree.selection()
        item = self.items.get(selection[0]) if selection else None
        info = item["info"] if item else None
        if info is None:
            for var in self.form_vars.values():
                var.set("")
            self.notes_label.configure(text=item.get("error", "") if item else "")
            return
        self.form_vars["revision"].set(info.revision)
        self.form_vars["kind"].set(KIND_LABELS.get(info.kind, ""))
        self.form_vars["level"].set(info.level)
        self.form_vars["subject"].set(info.subject)
        self.form_vars["grade"].set(info.grade)
        self.form_vars["volume"].set(info.volume)
        self.form_vars["publisher"].set(info.publisher)
        self.form_vars["author"].set(info.author)
        self.form_vars["document_id"].set(info.document_id)
        lines = []
        if info.uncertain:
            lines.append("확인 필요: " + ", ".join(FIELD_LABELS.get(key, key) for key in info.uncertain))
        lines.extend(info.notes)
        if len(selection) > 1:
            lines.append(f"{len(selection)}개 선택됨 — '수정 내용 적용'은 첫 번째 항목에만, '추정값대로 확정'은 모두에 적용됩니다.")
        self.notes_label.configure(text="\n".join(lines))

    def _form_to_info(self, info: core.DocInfo) -> None:
        info.revision = self.form_vars["revision"].get() or "미분류"
        info.kind = KIND_BY_LABEL.get(self.form_vars["kind"].get(), info.kind)
        info.level = self.form_vars["level"].get() or "미분류"
        info.subject = self.form_vars["subject"].get().strip()
        info.grade = self.form_vars["grade"].get().strip()
        info.volume = self.form_vars["volume"].get().strip()
        info.publisher = self.form_vars["publisher"].get().strip()
        info.author = self.form_vars["author"].get().strip()

    def regenerate_id(self) -> None:
        selection = self.tree.selection()
        item = self.items.get(selection[0]) if selection else None
        if not item or item["info"] is None:
            return
        probe = core.DocInfo(**{**item["info"].to_dict(), "uncertain": [], "notes": []})
        self._form_to_info(probe)
        self.form_vars["document_id"].set(core.build_document_id(probe))

    def apply_form(self) -> None:
        selection = self.tree.selection()
        item = self.items.get(selection[0]) if selection else None
        if not item or item["info"] is None or item["status"] in ("처리 중", "완료", "중복"):
            return
        info: core.DocInfo = item["info"]
        before_id = info.document_id
        auto_id = core.build_document_id(info)
        self._form_to_info(info)
        typed_id = core.slugify(self.form_vars["document_id"].get()) if self.form_vars["document_id"].get().strip() else ""
        if typed_id and typed_id != before_id:
            info.document_id = typed_id
            info.id_locked = True
        elif not info.id_locked or before_id == auto_id:
            info.document_id = core.build_document_id(info)
        info.uncertain = []
        item["status"] = "대기"
        item["error"] = ""
        self._render_row(selection[0])
        self.load_form()
        self._update_summary()
        self._maybe_autostart()

    def confirm_selected(self) -> None:
        for iid in self.tree.selection():
            item = self.items.get(iid)
            if item and item["info"] is not None and item["status"] in ("확인 필요", "실패", "중지됨"):
                item["info"].uncertain = []
                item["status"] = "대기"
                item["error"] = ""
                self._render_row(iid)
        self.load_form()
        self._update_summary()
        self._maybe_autostart()

    # ------------------------------------------------------------------ 실행
    def start(self) -> None:
        if self.worker and self.worker.is_alive():
            return
        pending = [iid for iid, item in self.items.items() if item["status"] == "대기"]
        waiting = sum(1 for item in self.items.values() if item["status"] == "확인 필요")
        if not pending:
            if waiting:
                messagebox.showinfo("확인 필요", f"분류를 확인해야 하는 파일이 {waiting}개 있습니다.\n노란 줄을 선택해 정보를 확인한 뒤 '수정 내용 적용' 또는 '추정값대로 확정'을 눌러 주세요.")
            return
        if waiting:
            self.log(f"확인 필요 항목 {waiting}개는 건너뛰고 {len(pending)}개를 처리합니다.")
        self.save_settings()
        self.stop_flag.clear()
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.worker = threading.Thread(target=self._work_loop, daemon=True)
        self.worker.start()

    def _maybe_autostart(self) -> None:
        if self.watch_enabled.get() and not (self.worker and self.worker.is_alive()):
            if any(item["status"] == "대기" and item.get("auto") for item in self.items.values()):
                self.start()

    def stop(self) -> None:
        self.stop_flag.set()
        self.log("현재 파일에서 멈추는 중입니다(원본은 그대로 남습니다)…")

    def _next_pending(self) -> str | None:
        for iid, item in list(self.items.items()):
            if item["status"] == "대기":
                return iid
        return None

    def _work_loop(self) -> None:
        settings = dict(self.settings)
        while not self.stop_flag.is_set():
            iid = self._next_pending()
            if iid is None:
                break
            item = self.items.get(iid)
            if item is None:
                continue
            item["status"] = "처리 중"
            self.events.put(("status", iid, None))
            info: core.DocInfo = item["info"]

            def progress(message: str, fraction: float | None, _iid=iid) -> None:
                self.events.put(("progress", _iid, (message, fraction)))

            try:
                result = core.run(info, settings, progress, self.stop_flag.is_set)
                self.events.put(("finished", iid, result))
            except core.StopRequested:
                self.events.put(("stopped", iid, None))
                break
            except Exception as exc:  # noqa: BLE001
                self.events.put(("failed", iid, str(exc)))
        self.events.put(("idle", None, None))

    # ------------------------------------------------------------------ 이벤트
    def _poll_events(self) -> None:
        try:
            while True:
                kind, iid, payload = self.events.get_nowait()
                self._handle_event(kind, iid, payload)
        except queue.Empty:
            pass
        self.root.after(100, self._poll_events)

    def _handle_event(self, kind: str, iid: str | None, payload) -> None:
        item = self.items.get(iid) if iid else None
        if iid and item is None:
            return
        if kind == "detected":
            info: core.DocInfo = payload
            item["info"] = info
            item["status"] = "확인 필요" if info.uncertain else "대기"
            self._render_row(iid)
            if info.uncertain:
                fields = ", ".join(FIELD_LABELS.get(key, key) for key in info.uncertain)
                self.log(f"[확인 필요] {info.file_name}: {fields}")
            self._maybe_autostart()
        elif kind == "detect_failed":
            item["status"] = "실패"
            item["error"] = payload
            self._render_row(iid)
            self.log(f"[실패] {Path(item['path']).name}: {payload}")
        elif kind == "status":
            self.current_iid = iid
            self._render_row(iid)
            self.tree.see(iid)
            self.log(f"[시작] {Path(item['path']).name} → {item['info'].document_id}")
        elif kind == "progress":
            message, fraction = payload
            self.progress_label.configure(text=f"{Path(item['path']).name}: {message}")
            if fraction is not None:
                self.progress.configure(value=fraction)
            if fraction is None:
                self.log(f"    {message}")
        elif kind == "finished":
            result = payload
            if result["status"] == "duplicate":
                item["status"] = "중복"
                item["error"] = f"이미 전처리됨: {result['document_id']}"
                self.log(f"[중복] {Path(item['path']).name}: 같은 원본이 이미 {result['document_id']}로 처리되어 있습니다 ({result['disposition']}).")
            else:
                item["status"] = "완료"
                item["info"].document_id = result["document_id"]
                extra = []
                if result.get("ocr_pages"):
                    extra.append(f"OCR {result['ocr_pages']}쪽")
                if result.get("warnings"):
                    extra.append(f"검토 {result['warnings']}쪽")
                self.log(
                    f"[완료] {result['document_id']} — 결과 {core.human_size(result['output_bytes'])}, "
                    f"원본 {result['disposition']}{' · ' + ', '.join(extra) if extra else ''}"
                )
            self._render_row(iid)
            self._refresh_space()
        elif kind == "failed":
            item["status"] = "실패"
            item["error"] = payload
            self._render_row(iid)
            self.log(f"[실패] {Path(item['path']).name}: {payload} (원본은 그대로 둡니다)")
        elif kind == "stopped":
            item["status"] = "중지됨"
            self._render_row(iid)
            self.log(f"[중지] {Path(item['path']).name}: 만들던 결과는 지웠고 원본은 그대로입니다.")
        elif kind == "idle":
            self.start_button.configure(state="normal")
            self.stop_button.configure(state="disabled")
            self.progress.configure(value=0)
            self.progress_label.configure(text="대기 중")
            self._refresh_ocr()
            self._maybe_autostart()
        self._update_summary()

    def _poll_watch(self) -> None:
        try:
            folder = Path(self.watch_var.get()) if self.watch_var.get() else None
            if self.watch_enabled.get() and folder and folder.is_dir():
                ready = []
                for path in core.iter_sources([folder]):
                    key = str(path.resolve())
                    try:
                        stat = path.stat()
                    except OSError:
                        continue
                    signature = (stat.st_size, stat.st_mtime)
                    previous = self.watch_seen.get(key)
                    self.watch_seen[key] = signature
                    # 복사가 끝났는지(크기·수정시각이 두 번 연속 같은지) 확인한 뒤 추가한다.
                    if previous == signature and stat.st_size > 0:
                        ready.append(path)
                if ready:
                    added = self.add_paths(ready, auto=True)
                    if added:
                        self.log(f"감시 폴더에서 새 파일 {added}개 발견")
        except Exception as exc:  # noqa: BLE001
            self.log(f"감시 폴더 확인 중 오류: {exc}")
        self.root.after(5000, self._poll_watch)

    # ------------------------------------------------------------------ 기타
    def log(self, message: str) -> None:
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def on_close(self) -> None:
        if self.worker and self.worker.is_alive():
            if not messagebox.askyesno("종료", "전처리가 진행 중입니다. 멈추고 종료할까요?\n(진행 중인 파일의 원본은 그대로 남습니다)"):
                return
            self.stop_flag.set()
            self.worker.join(timeout=30)
        self.save_settings()
        self.detector.shutdown(wait=False, cancel_futures=True)
        self.root.destroy()


def main() -> None:
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:  # noqa: BLE001
        pass
    root = tk.Tk()
    App(root, [Path(arg) for arg in sys.argv[1:]])
    root.mainloop()


if __name__ == "__main__":
    main()
