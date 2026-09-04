const sessionKey = "textbook-studio-session";
const form = document.querySelector("#loginForm");
const message = document.querySelector("#loginMessage");

function setMessage(text, success = false) {
  message.textContent = text;
  message.style.color = success ? "#176b4f" : "#9b3a35";
}

function returnPath() {
  const value = new URLSearchParams(location.search).get("return") || "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

async function loadConfig() {
  const response = await fetch("/api/auth/config", { cache: "no-store" });
  const config = await response.json();
  if (!config.enabled) {
    location.replace(returnPath());
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("로그인 중입니다.", true);
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value.trim();
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "로그인에 실패했습니다.");
    }
    localStorage.setItem(sessionKey, JSON.stringify(payload));
    location.replace(returnPath());
  } catch (error) {
    setMessage(error.message);
  }
});

loadConfig().catch(() => setMessage("인증 설정을 불러오지 못했습니다."));
