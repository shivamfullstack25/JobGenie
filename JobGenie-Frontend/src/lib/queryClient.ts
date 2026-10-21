import {QueryClient, QueryFunction} from "@tanstack/react-query";

export const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:8080";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

type LegacyRequestOptions = { method?: string; body?: unknown; headers?: Record<string, string> };

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response>;
export async function apiRequest(url: string, options: LegacyRequestOptions): Promise<Response>;
export async function apiRequest(
  method: string,
  url: string | LegacyRequestOptions,
  data?: unknown | undefined,
): Promise<Response> {
  // Support both (method, url, data) and legacy (url, { method, body }) call styles
  let httpMethod = method;
  let requestUrl = url as string;
  let bodyData: unknown = data;

  if (typeof method === "string" && method.startsWith("/") && typeof url === "object") {
    // Legacy: apiRequest("/api/foo", { method: "PUT", body: ... })
    requestUrl = method;
    const opts = url as { method?: string; body?: unknown };
    httpMethod = opts.method || "GET";
    bodyData = opts.body;
  } else if (
    typeof method === "string" &&
    method.startsWith("/") &&
    typeof url === "string" &&
    ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(url.toUpperCase())
  ) {
    // Legacy: apiRequest("/api/foo", "PUT", data)
    requestUrl = method;
    httpMethod = url;
    bodyData = data;
  }

  const fullUrl = requestUrl.startsWith("http")
    ? requestUrl
    : `${API_BASE_URL}${requestUrl}`;

  const isFormData =
    typeof FormData !== "undefined" && bodyData instanceof FormData;
  const extraHeaders =
    bodyData &&
    typeof bodyData === "object" &&
    !isFormData &&
    "headers" in (bodyData as object) &&
    !("body" in (bodyData as object))
      ? (bodyData as { headers?: Record<string, string> }).headers
      : undefined;
  if (extraHeaders) {
    bodyData = undefined;
  }

  const headers: Record<string, string> = { ...(extraHeaders ?? {}) };
  if (bodyData !== undefined && bodyData !== null && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(fullUrl, {
    method: httpMethod,
    headers,
    body:
      bodyData === undefined || bodyData === null
        ? undefined
        : isFormData
          ? (bodyData as FormData)
          : typeof bodyData === "string"
            ? bodyData
            : JSON.stringify(bodyData),
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey[0] as string;
    const fullUrl = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
    const res = await fetch(fullUrl, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
