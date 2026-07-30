const message = document.querySelector("#resetMessage");
const form = document.querySelector("#resetPasswordForm");
const fragment = new URLSearchParams(location.hash.slice(1));
const accessToken = fragment.get("access_token");

function setMessage(text, success = false) {
  message.textContent = text;
  message.style.color = success ? "#176b4f" : "#9b3a35";
}

async function config() {
  const response = await fetch("/api/auth/config", { cache: "no-store" });
  return response.json();
}

if (!accessToken) {
  form.hidden = true;
  setMessage("재설정 링크가 만료되었거나 올바르지 않습니다. 로그인 화면에서 메일을 다시 요청해 주세요.");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#newPassword").value.trim();
  const confirmation = document.querySelector("#confirmPassword").value.trim();
  if (password !== confirmation) {
    setMessage("두 비밀번호가 일치하지 않습니다.");
    return;
  }
  setMessage("비밀번호를 변경하는 중입니다.", true);
  try {
    const auth = await config();
    const response = await fetch(`${auth.supabase_url}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: auth.publishable_key,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.msg || payload.message || "비밀번호를 변경하지 못했습니다.");
    }
    setMessage("비밀번호를 변경했습니다. 새 비밀번호로 로그인해 주세요.", true);
    window.setTimeout(() => location.replace("/login"), 1400);
  } catch (error) {
    setMessage(error.message);
  }
});
