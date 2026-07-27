const tabs = [...document.querySelectorAll(".tab")];
const panels = [...document.querySelectorAll(".story-panel")];
const previousButton = document.querySelector("#prevButton");
const nextButton = document.querySelector("#nextButton");
const currentNumber = document.querySelector("#currentNumber");
const progressBar = document.querySelector("#progressBar");

let currentStep = 1;

function showStep(step, options = {}) {
  const nextStep = Math.min(Math.max(Number(step) || 1, 1), tabs.length);
  currentStep = nextStep;

  tabs.forEach((tab, index) => {
    const active = index + 1 === nextStep;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  panels.forEach((panel, index) => {
    const active = index + 1 === nextStep;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });

  currentNumber.textContent = nextStep;
  previousButton.disabled = nextStep === 1;
  nextButton.disabled = nextStep === tabs.length;
  nextButton.innerHTML =
    nextStep === tabs.length ? "마지막 질문 <span>✓</span>" : "다음 질문 <span>→</span>";
  progressBar.style.width = `${(nextStep / tabs.length) * 100}%`;

  const activeTab = tabs[nextStep - 1];
  activeTab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });

  if (options.updateHash !== false) {
    history.replaceState(null, "", `#step-${nextStep}`);
  }
  if (options.focus) {
    activeTab.focus();
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => showStep(tab.dataset.step));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") showStep(1, { focus: true });
    if (event.key === "End") showStep(tabs.length, { focus: true });
    if (event.key === "ArrowLeft") showStep(currentStep - 1, { focus: true });
    if (event.key === "ArrowRight") showStep(currentStep + 1, { focus: true });
  });
});

previousButton.addEventListener("click", () => showStep(currentStep - 1));
nextButton.addEventListener("click", () => showStep(currentStep + 1));

document.addEventListener("keydown", (event) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  if (event.key === "PageUp") showStep(currentStep - 1);
  if (event.key === "PageDown") showStep(currentStep + 1);
});

document.querySelector("#topLink").addEventListener("click", (event) => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

const initialStep = Number(location.hash.match(/^#step-(\d+)$/)?.[1] || 1);
showStep(initialStep, { updateHash: false });
