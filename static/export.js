const exports = [
  ["analysis", "교육과정 분석", "성취기준과 성취기준 해설을 포함합니다."],
  ["direction", "개발 방향", "선택한 개발안과 공통 집필 원칙을 포함합니다."],
  ["allocation", "차시 배분", "학년별 성취기준과 차시 배분 결과를 포함합니다."],
  ["content", "내용·종목 선정", "신체활동 예시와 학년별 선정 결과를 포함합니다."],
  ["outline", "목차 설계", "목차·쪽수·차시 배분 결과를 포함합니다."],
  ["design", "단원 설계", "목표·수업·평가·안전 설계를 포함합니다."],
  ["manuscript", "원고 초안", "현재 저장된 대·중·소단원 원고를 포함합니다."],
  ["review", "모의심사", "자동검증 점수와 심사 의견을 포함합니다."],
  ["all", "전체 결과 합본", "교육과정 분석부터 모의심사까지 한 파일로 만듭니다."],
];

const grid = document.querySelector("#exportGrid");
const message = document.querySelector("#exportMessage");

grid.innerHTML = exports.map(([scope, title, description]) => `
  <article class="export-card ${scope === "all" ? "all" : ""}">
    <strong>${title}</strong>
    <p>${description}</p>
    <button class="${scope === "all" ? "secondary-button" : "primary-button"}" data-scope="${scope}" type="button">
      HWPX 다운로드
    </button>
  </article>
`).join("");

function filenameFromHeader(response, scope) {
  const disposition = response.headers.get("Content-Disposition") || "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  return encoded ? decodeURIComponent(encoded) : `textbook-studio-${scope}.hwpx`;
}

grid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-scope]");
  if (!button) return;
  const scope = button.dataset.scope;
  button.disabled = true;
  message.textContent = "HWPX 문서를 생성하고 있습니다.";
  try {
    const response = await fetch(`/api/export/hwpx?scope=${encodeURIComponent(scope)}`);
    if (!response.ok) {
      const payload = await response.json();
      throw new Error(payload.error || "HWPX 문서를 만들지 못했습니다.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filenameFromHeader(response, scope);
    link.click();
    URL.revokeObjectURL(url);
    message.textContent = "HWPX 다운로드가 완료됐습니다.";
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
