import type {
  LoginRequest,
  LoginResponse,
} from "@/types/auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL;

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
