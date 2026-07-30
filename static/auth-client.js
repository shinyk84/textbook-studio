(() => {
  const sessionKey = "textbook-studio-session";
  const nativeFetch = window.fetch.bind(window);

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(sessionKey) || "null");
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    localStorage.setItem(sessionKey, JSON.stringify(session));
  }

  function loginUrl() {
    const returnTo = `${location.pathname}${location.search}`;
    return `/login?return=${encodeURIComponent(returnTo)}`;
  }

  const configPromise = nativeFetch("/api/auth/config", {
    cache: "no-store",
  }).then((response) => response.json());

  async function validSession(config) {
    let session = readSession();
    if (!session) return null;
    const expiresAt = Number(session.expires_at || 0);
    if (expiresAt * 1000 > Date.now() + 60_000) return session;
    if (!session.refresh_token) return null;
    const response = await nativeFetch(
      `${config.supabase_url}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: config.publishable_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      },
    );
    if (!response.ok) {
      localStorage.removeItem(sessionKey);
      return null;
    }
    session = await response.json();
    saveSession(session);
    return session;
  }

  window.fetch = async (input, init = {}) => {
    const config = await configPromise;
    const url = new URL(
      typeof input === "string" ? input : input.url,
      location.origin,
    );
    const isStudioApi =
      url.origin === location.origin &&
      url.pathname.startsWith("/api/") &&
      url.pathname !== "/api/auth/config" &&
      url.pathname !== "/api/health";
    if (!config.enabled || !isStudioApi) {
      return nativeFetch(input, init);
    }
    const session = await validSession(config);
    if (!session?.access_token) {
      location.replace(loginUrl());
      throw new Error("로그인이 필요합니다.");
    }
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${session.access_token}`);
    const response = await nativeFetch(input, { ...init, headers });
    if (response.status === 401) {
      localStorage.removeItem(sessionKey);
      location.replace(loginUrl());
    }
    return response;
  };

  window.textbookStudioSignOut = () => {
    localStorage.removeItem(sessionKey);
    location.replace("/login");
  };
})();
