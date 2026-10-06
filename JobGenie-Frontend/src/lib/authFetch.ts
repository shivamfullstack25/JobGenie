/**
 * Attaches the signed-in user's Firebase ID token to every request this app makes to its own
 * backend, so the API gateway can verify who is calling.
 *
 * It is installed once over `window.fetch` rather than exported as a helper to call, because the
 * app reaches the backend from ~40 separate `fetch(...)` call sites (lib/api.ts, queryClient, and
 * individual pages). Missing the header at any one of them would be a silent 401 for that feature;
 * wrapping fetch makes it impossible to forget.
 *
 * The token is only ever sent to the JobGenie API. The Firebase SDK and any other third-party
 * code also use fetch, and must never receive it — see `isOwnApiRequest`.
 */

const API_PATH_PREFIXES = ["/api/", "/ai/"];

/** True when `url` targets the JobGenie backend (the configured API origin, or a same-origin /api path). */
export function isOwnApiRequest(url: string, apiBaseUrl: string, pageOrigin: string): boolean {
  let target: URL;
  let apiOrigin: string;
  try {
    target = new URL(url, pageOrigin);
    apiOrigin = new URL(apiBaseUrl, pageOrigin).origin;
  } catch {
    return false;
  }
  if (target.origin !== apiOrigin && target.origin !== pageOrigin) {
    return false;
  }
  return API_PATH_PREFIXES.some((prefix) => target.pathname.startsWith(prefix));
}

type TokenProvider = () => Promise<string | null>;

/**
 * Returns a fetch that adds `Authorization: Bearer <token>` to own-API requests. A caller-supplied
 * Authorization header is left alone, and a missing token (signed out) sends the request as-is so
 * public endpoints keep working.
 */
export function createAuthFetch(
  baseFetch: typeof fetch,
  getToken: TokenProvider,
  apiBaseUrl: string,
  pageOrigin: string,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!isOwnApiRequest(url, apiBaseUrl, pageOrigin)) {
      return baseFetch(input, init);
    }

    const headers = new Headers(
      init?.headers ?? (typeof input !== "string" && !(input instanceof URL) ? input.headers : undefined),
    );
    if (!headers.has("Authorization")) {
      const token = await getToken().catch(() => null);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }
    return baseFetch(input, { ...init, headers });
  };
}

export function installAuthFetch(getToken: TokenProvider, apiBaseUrl: string): void {
  const marker = "__jobgenieAuthFetch";
  const w = window as unknown as Record<string, unknown>;
  if (w[marker]) return;
  window.fetch = createAuthFetch(window.fetch.bind(window), getToken, apiBaseUrl, window.location.origin);
  w[marker] = true;
}
