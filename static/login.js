const sessionKey = "textbook-studio-session";
const form = document.querySelector("#loginForm");
const message = document.querySelector("#loginMessage");
const signupButton = document.querySelector("#signupButton");
const resetButton = document.querySelector("#resetButton");
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

resetButton.addEventListener("click", async () => {
  if (!config) await loadConfig();
  const email = document.querySelector("#email").value.trim();
  if (!email) {
    setMessage("이메일을 먼저 입력해 주세요.");
    return;
  }
  resetButton.disabled = true;
  setMessage("비밀번호 재설정 메일을 보내는 중입니다.", true);
  try {
    const redirectTo = `${location.origin}/reset-password`;
    const response = await fetch(
      `${config.supabase_url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`,
      {
        method: "POST",
        headers: {
          apikey: config.publishable_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.msg || payload.message || "재설정 메일을 보내지 못했습니다.");
    }
    setMessage("재설정 메일을 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 정해 주세요.", true);
  } catch (error) {
    setMessage(error.message);
  } finally {
    resetButton.disabled = false;
  }
});

loadConfig().catch(() => setMessage("인증 설정을 불러오지 못했습니다."));
