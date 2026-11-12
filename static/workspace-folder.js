// 작업 폴더(컴퓨터별 한 곳).
// 사용자가 고른 폴더에 도구 데이터(_도구데이터: 작업 상태·초고·시안·배치 DB와 조판 결과)와 결과 파일(초고별
// 원고 PDF·지도서·PPT·생성 이력·프로젝트 저장본)을 모두 둔다. 파일은 브라우저가 아니라 이 컴퓨터에서 도는
// 서버가 쓰므로, 도구를 열 때마다 폴더 권한을 다시 줄 필요가 없다. 다른 컴퓨터로 옮길 때는 이 폴더를 통째로
// 복사하고 그 컴퓨터에서 같은 폴더를 고르면 된다(위치가 달라도 됨).
// 예전에는 브라우저 File System Access API로 연결했다(도구를 열 때마다 권한 재연결 필요) — 그 방식은 없앴다.
(function attachWorkspaceFolder(global) {
  "use strict";

  const listeners = new Set();
  const current = { status: "checking", name: "", path: "", local: false, editable: false };

  function notify() {
    const snapshot = status();
    listeners.forEach((listener) => {
      try { listener(snapshot); } catch { /* 화면 갱신 오류가 저장을 막지 않게 한다 */ }
    });
  }

  function supported() {
    return true;
  }

  function status() {
    return { ...current, supported: true };
  }

  function isConnected() {
    return current.status === "connected";
  }

  function applyInfo(info) {
    current.name = info?.name || "";
    current.path = info?.path || "";
    current.local = Boolean(info?.local);
    current.editable = Boolean(info?.editable);
    current.status = !info ? "unavailable" : info.custom ? (info.local ? "connected" : "remote") : "none";
  }

  async function init() {
    try {
      const response = await fetch("/api/settings/data-folder");
      const data = await response.json().catch(() => ({}));
      applyInfo(response.ok ? data.result : null);
    } catch {
      applyInfo(null);
    }
    notify();
    return status();
  }

  // 이 컴퓨터 화면에 폴더 고르기 창을 띄운다. 빈 폴더면 지금 작업을 그 폴더로 옮기고, 이미 작업이 있으면 그것을 연다.
  // 돌려주는 mode: moved(옮김) · opened(그 폴더의 작업을 엶) · same · cancelled
  async function connect() {
    const response = await fetch("/api/settings/data-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || "작업 폴더를 고르지 못했습니다.");
    await init();
    return { ...status(), mode: data.result.mode };
  }

  async function reconnect() {
    return connect();
  }

  async function disconnect() {
    // 작업 폴더는 서버 데이터가 있는 곳이라 연결을 끊지 않는다(다른 폴더를 고르면 바뀐다).
  }

  function safeSegment(name) {
    return String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80) || "무제";
  }

  function query(path, extra = "") {
    return `path=${encodeURIComponent(String(path || ""))}${extra}`;
  }

  async function writeFile(path, data) {
    if (!isConnected()) throw new Error("작업 폴더를 먼저 골라 주세요.");
    const body = data instanceof Blob ? data : new Blob([data]);
    const response = await fetch(`/api/folder/file?${query(path)}`, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "작업 폴더에 파일을 쓰지 못했습니다.");
    }
  }

  async function readFile(path) {
    if (!isConnected()) return null;
    try {
      const response = await fetch(`/api/folder/file?${query(path)}`);
      if (!response.ok) return null;
      const blob = await response.blob();
      return new File([blob], String(path).split("/").pop() || "file", { type: blob.type });
    } catch {
      return null;
    }
  }

  async function readText(path) {
    const file = await readFile(path);
    return file ? file.text() : null;
  }

  // 이력 파일(JSONL·CSV)은 줄을 덧붙인다. 파일이 없으면 header를 먼저 쓴다.
  async function appendText(path, text, header = "") {
    const previous = await readText(path);
    const base = previous ?? header;
    await writeFile(path, `${base}${base && !base.endsWith("\n") ? "\n" : ""}${text}`);
  }

  // 폴더 안 항목 이름 목록(없으면 빈 배열). kind: "file" | "directory" | "" (둘 다)
  async function list(path, kind = "") {
    if (!isConnected()) return [];
    try {
      const response = await fetch(`/api/folder/list?${query(path, `&kind=${encodeURIComponent(kind)}`)}`);
      const data = await response.json().catch(() => ({}));
      return response.ok && Array.isArray(data.result) ? data.result : [];
    } catch {
      return [];
    }
  }

  // 공용(클라우드 동기화) 폴더를 여러 컴퓨터가 함께 쓸 때, 같은 파일을 동시에 덮어쓰지 않도록
  // 저장본·이력 파일 이름에 작업자 이름을 붙인다. 이름은 컴퓨터(브라우저)마다 한 번만 정한다.
  const WORKER_KEY = "textbook-studio-worker-name";
  function workerName() {
    try { return global.localStorage?.getItem(WORKER_KEY) || ""; } catch { return ""; }
  }
  function setWorkerName(name) {
    const clean = safeSegment(name).slice(0, 20);
    try { global.localStorage?.setItem(WORKER_KEY, clean); } catch { /* 저장 실패 시 이번 방문 동안만 쓴다 */ }
    notify();
    return clean;
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  global.WORKSPACE_FOLDER = {
    supported,
    init,
    connect,
    reconnect,
    disconnect,
    status,
    isConnected,
    writeFile,
    readFile,
    readText,
    appendText,
    list,
    workerName,
    setWorkerName,
    safeSegment,
    subscribe,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
