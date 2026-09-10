import type {
  LoginRequest,
  LoginResponse,
} from "@/types/auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL;

let staffRefreshPromise: Promise<string> | null = null;

if (!API_BASE_URL) {
  throw new Error(
    "NEXT_PUBLIC_API_BASE_URL 환경변수가 설정되지 않았습니다."
  );
}

export async function login(
  data: LoginRequest
): Promise<LoginResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/auth/staff/login/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }
  );

  if (!response.ok) {
    const errorData: unknown = await response
      .json()
      .catch(() => null);

    throw new Error(
      getErrorMessage(errorData) ??
        "로그인 처리 중 오류가 발생했습니다."
    );
  }

  return response.json();
}

function clearStaffSession() {
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("refreshToken");
  sessionStorage.removeItem("user");
}

function redirectToStaffLogin() {
  clearStaffSession();
  window.location.replace("/login");
}

async function refreshStaffAccessToken(): Promise<string> {
  const refreshToken = sessionStorage.getItem("refreshToken");
  if (!refreshToken) {
    redirectToStaffLogin();
    throw new Error("로그인이 필요합니다.");
  }

  let response: Response;
  try {
    response = await fetch(
      `${API_BASE_URL}/api/auth/staff/token/refresh/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh: refreshToken }),
      },
    );
  } catch (error) {
    redirectToStaffLogin();
    throw error;
  }
  const data: unknown = await response.json().catch(() => null);

  if (
    !response.ok ||
    !data ||
    typeof data !== "object" ||
    !("access" in data) ||
    typeof data.access !== "string" ||
    !data.access
  ) {
    redirectToStaffLogin();
    throw new Error(getErrorMessage(data) ?? "로그인 정보가 만료되었습니다.");
  }

  sessionStorage.setItem("accessToken", data.access);
  if ("refresh" in data && typeof data.refresh === "string" && data.refresh) {
    sessionStorage.setItem("refreshToken", data.refresh);
  }
  return data.access;
}

function getStaffRefreshPromise() {
  if (!staffRefreshPromise) {
    staffRefreshPromise = refreshStaffAccessToken().finally(() => {
      staffRefreshPromise = null;
    });
  }
  return staffRefreshPromise;
}

function fetchWithStaffAccess(
  input: RequestInfo | URL,
  init: RequestInit,
  accessToken: string,
) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}

export async function staffAuthenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = sessionStorage.getItem("accessToken");
  if (!accessToken) {
    redirectToStaffLogin();
    throw new Error("로그인이 필요합니다.");
  }

  const response = await fetchWithStaffAccess(input, init, accessToken);
  if (response.status !== 401) {
    return response;
  }

  const currentAccessToken = sessionStorage.getItem("accessToken");
  const refreshedAccessToken = currentAccessToken && currentAccessToken !== accessToken
    ? currentAccessToken
    : await getStaffRefreshPromise();

  const retriedResponse = await fetchWithStaffAccess(input, init, refreshedAccessToken);
  if (retriedResponse.status === 401) {
    redirectToStaffLogin();
    throw new Error("로그인 정보가 만료되었습니다.");
  }
  return retriedResponse;
}

function getErrorMessage(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }

  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (Array.isArray(value)) {
      const message = value.find(
        (item): item is string =>
          typeof item === "string" && Boolean(item.trim())
      );

      if (message) {
        return message;
      }
    }
  }

  return null;
}
