const sessionKey = "textbook-studio-session";
const form = document.querySelector("#loginForm");
const message = document.querySelector("#loginMessage");
const signupButton = document.querySelector("#signupButton");
let config;

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
  config = await response.json();
  if (!config.enabled) {
    location.replace(returnPath());
  }
}

async function authRequest(path) {
  if (!config) await loadConfig();
  const email = document.querySelector("#email").value.trim();
  const password = document.querySelector("#password").value;
  const response = await fetch(`${config.supabase_url}${path}`, {
    method: "POST",
    headers: {
      apikey: config.publishable_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.msg || payload.error_description || payload.message || "인증에 실패했습니다.");
  }
  return payload;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("로그인 중입니다.", true);
  try {
    const session = await authRequest("/auth/v1/token?grant_type=password");
    localStorage.setItem(sessionKey, JSON.stringify(session));
    location.replace(returnPath());
  } catch (error) {
    setMessage(error.message);
  }
});

signupButton.addEventListener("click", async () => {
  setMessage("계정을 만드는 중입니다.", true);
  try {
    const result = await authRequest("/auth/v1/signup");
    if (result.access_token) {
      localStorage.setItem(sessionKey, JSON.stringify(result));
      location.replace(returnPath());
      return;
    }
    setMessage("확인 메일을 보냈습니다. 이메일 확인 후 로그인해 주세요.", true);
  } catch (error) {
    setMessage(error.message);
  }
});

loadConfig().catch(() => setMessage("인증 설정을 불러오지 못했습니다."));
