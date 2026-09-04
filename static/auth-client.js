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

  function loginUrl() {
    const returnTo = `${location.pathname}${location.search}`;
    return `/login?return=${encodeURIComponent(returnTo)}`;
  }

  const configPromise = nativeFetch("/api/auth/config", {
    cache: "no-store",
  }).then((response) => response.json());

  function validSession() {
    const session = readSession();
    if (!session?.access_token) return null;
    const expiresAt = Number(session.expires_at || 0);
    if (expiresAt * 1000 <= Date.now()) {
      localStorage.removeItem(sessionKey);
      return null;
    }
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
      url.pathname !== "/api/auth/login" &&
      url.pathname !== "/api/health";
    if (!config.enabled || !isStudioApi) {
      return nativeFetch(input, init);
    }
    const session = validSession();
    if (!session) {
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
    const session = readSession();
    if (session?.access_token) {
      nativeFetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => {});
    }
    localStorage.removeItem(sessionKey);
    location.replace("/login");
  };
})();
