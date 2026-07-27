(() => {
  const originalFetch = window.fetch.bind(window);
  let active = 0;
  let value = 0;
  let timer = null;
  let showTimer = null;

  const root = document.createElement("div");
  root.className = "operation-progress";
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `
    <div class="operation-progress-head">
      <span class="operation-spinner"></span>
      <div><strong id="operationProgressTitle">자료 확인 중</strong><small id="operationProgressStep">처리를 준비하고 있습니다.</small></div>
      <b id="operationProgressValue">0%</b>
    </div>
    <div class="operation-progress-track"><i id="operationProgressBar"></i></div>`;
  document.body.appendChild(root);

  const title = root.querySelector("#operationProgressTitle");
  const step = root.querySelector("#operationProgressStep");
  const number = root.querySelector("#operationProgressValue");
  const bar = root.querySelector("#operationProgressBar");

  function operationLabel(url, options) {
    const path = String(url);
    if (path.includes("/export/hwpx")) return ["HWPX 구성 중", "표와 원고 내용을 문서로 변환하고 있습니다."];
    if (path.includes("/review/") || path.includes("/review?")) return ["검정 기준 심사 중", "22개 심사 항목을 원고와 대조하고 있습니다."];
    if (path.includes("/manuscript/")) return ["원고 초안 생성 중", "지정 쪽수와 소단원 구성을 맞추고 있습니다."];
    if (path.includes("/generate")) return ["AI 초안 생성 중", "상위 단계 데이터와 공식 기준을 연결하고 있습니다."];
    if ((options?.method || "GET").toUpperCase() !== "GET") return ["변경 내용 저장 중", "현재 버전과 데이터 정합성을 확인하고 있습니다."];
    return ["자료 불러오는 중", "공식자료와 저장된 편집 내용을 확인하고 있습니다."];
  }

  function paint(next, detail) {
    value = Math.min(100, Math.max(value, next));
    number.textContent = `${Math.round(value)}%`;
    bar.style.width = `${value}%`;
    if (detail) step.textContent = detail;
  }

  function start(url, options) {
    active += 1;
    if (active > 1) return;
    const labels = operationLabel(url, options);
    title.textContent = labels[0];
    step.textContent = labels[1];
    value = 4;
    paint(4);
    showTimer = window.setTimeout(() => root.classList.add("visible"), 280);
    timer = window.setInterval(() => {
      const increment = value < 45 ? 9 : value < 75 ? 4 : 1.5;
      paint(Math.min(92, value + increment));
    }, 420);
  }

  function finish(ok) {
    active = Math.max(0, active - 1);
    if (active) return;
    window.clearTimeout(showTimer);
    window.clearInterval(timer);
    paint(100, ok ? "처리가 완료되었습니다." : "처리 중 오류가 발생했습니다.");
    root.classList.toggle("error", !ok);
    window.setTimeout(() => {
      root.classList.remove("visible", "error");
      value = 0;
    }, root.classList.contains("visible") ? 650 : 0);
  }

  window.fetch = async (url, options = {}) => {
    const path = String(url);
    if (path.includes("/api/auth/config") || path.includes("/api/health")) {
      return originalFetch(url, options);
    }
    start(url, options);
    try {
      const response = await originalFetch(url, options);
      finish(response.ok);
      return response;
    } catch (error) {
      finish(false);
      throw error;
    }
  };
})();
