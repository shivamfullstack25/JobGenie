import { describe, expect, it, vi } from "vitest";
import { createAuthFetch, isOwnApiRequest } from "./authFetch";

const API = "http://localhost:8080";
const PAGE = "http://localhost:3000";

function setup(token: string | null = "tok-123") {
  const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"));
  const getToken = vi.fn(async () => token);
  const authFetch = createAuthFetch(base as unknown as typeof fetch, getToken, API, PAGE);
  const sentAuth = () => new Headers(base.mock.calls[0][1]?.headers).get("Authorization");
  return { base, getToken, authFetch, sentAuth };
}

describe("isOwnApiRequest", () => {
  it("accepts the configured API origin and same-origin /api paths", () => {
    expect(isOwnApiRequest(`${API}/api/jobs/saved?userId=7`, API, PAGE)).toBe(true);
    expect(isOwnApiRequest("/api/job-aggregator/search", API, PAGE)).toBe(true);
    expect(isOwnApiRequest(`${API}/ai/resume/analyze`, API, PAGE)).toBe(true);
  });

  it("rejects third parties, including look-alike hosts and paths", () => {
    expect(isOwnApiRequest("https://identitytoolkit.googleapis.com/v1/accounts:lookup", API, PAGE)).toBe(false);
    expect(isOwnApiRequest("https://firestore.googleapis.com/api/x", API, PAGE)).toBe(false);
    expect(isOwnApiRequest("http://localhost:8080.evil.example/api/x", API, PAGE)).toBe(false);
    expect(isOwnApiRequest("http://evil.example/?next=http://localhost:8080/api/x", API, PAGE)).toBe(false);
    expect(isOwnApiRequest(`${PAGE}/assets/index.js`, API, PAGE)).toBe(false);
    expect(isOwnApiRequest(`${API}/actuator/health`, API, PAGE)).toBe(false);
  });
});

describe("createAuthFetch", () => {
  it("adds the bearer token to backend requests", async () => {
    const { authFetch, sentAuth } = setup();
    await authFetch(`${API}/api/jobs/saved?userId=7`);
    expect(sentAuth()).toBe("Bearer tok-123");
  });

  it("keeps the caller's method, body and other headers", async () => {
    const { authFetch, base } = setup();
    await authFetch("/api/jobs/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const init = base.mock.calls[0][1]!;
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-123");
  });

  it("never sends the token to a third party, and does not even fetch one", async () => {
    const { authFetch, base, getToken } = setup();
    await authFetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup", { method: "POST" });
    expect(getToken).not.toHaveBeenCalled();
    expect(new Headers(base.mock.calls[0][1]?.headers).has("Authorization")).toBe(false);
  });

  it("sends the request without a header when signed out", async () => {
    const { authFetch, sentAuth, base } = setup(null);
    await authFetch(`${API}/api/auth/verify`, { method: "POST" });
    expect(base).toHaveBeenCalledTimes(1);
    expect(sentAuth()).toBeNull();
  });

  it("does not overwrite an Authorization header the caller set", async () => {
    const { authFetch, sentAuth } = setup();
    await authFetch(`${API}/api/x`, { headers: { Authorization: "Bearer explicit" } });
    expect(sentAuth()).toBe("Bearer explicit");
  });

  it("still sends the request if the token lookup fails", async () => {
    const base = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"));
    const authFetch = createAuthFetch(
      base as unknown as typeof fetch,
      async () => {
        throw new Error("firebase offline");
      },
      API,
      PAGE,
    );
    await authFetch(`${API}/api/x`);
    expect(base).toHaveBeenCalledTimes(1);
  });
});
