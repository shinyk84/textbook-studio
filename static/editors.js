const form = document.querySelector("#editorForm");
const list = document.querySelector("#editorList");
const message = document.querySelector("#editorMessage");

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
  return payload;
}

function render(editors) {
  document.querySelector("#editorCount").textContent = `${editors.length}명`;
  list.innerHTML = editors.map((editor) => `
    <div class="editor-row">
      <div class="editor-meta">
        <strong>${editor.email}</strong>
        <span>${editor.role === "owner" ? "관리자" : "편집자"} · ${editor.active ? "사용 가능" : "비활성"}</span>
      </div>
      ${editor.role !== "owner" && editor.active
        ? `<button class="secondary-button" data-remove="${editor.email}" type="button">접근 해제</button>`
        : ""}
    </div>
  `).join("");
}

async function loadEditors() {
  const payload = await request("/api/editors");
  render(payload.editors);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#editorEmail").value.trim();
  try {
    await request("/api/editors", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    form.reset();
    message.textContent = `${email}의 접근을 허용했습니다.`;
    await loadEditors();
  } catch (error) {
    message.textContent = error.message;
  }
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  const email = button.dataset.remove;
  if (!confirm(`${email}의 접근을 해제할까요?`)) return;
  try {
    await request(`/api/editors/${encodeURIComponent(email)}`, { method: "DELETE" });
    await loadEditors();
  } catch (error) {
    message.textContent = error.message;
  }
});

document.querySelector("#signOutButton").addEventListener("click", () => {
  window.textbookStudioSignOut();
});

loadEditors().catch((error) => {
  message.textContent = error.message;
});
