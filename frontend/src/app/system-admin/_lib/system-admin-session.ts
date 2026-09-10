export const SYSTEM_ADMIN_SESSION_KEYS = {
  accessToken: "systemAdminAccessToken",
  refreshToken: "systemAdminRefreshToken",
  user: "systemAdminUser",
} as const;

export type SystemAdminUser = { id: string; username: string; name: string };

export function saveSystemAdminSession(access: string, refresh: string, user: SystemAdminUser) {
  sessionStorage.setItem(SYSTEM_ADMIN_SESSION_KEYS.accessToken, access);
  sessionStorage.setItem(SYSTEM_ADMIN_SESSION_KEYS.refreshToken, refresh);
  sessionStorage.setItem(SYSTEM_ADMIN_SESSION_KEYS.user, JSON.stringify(user));
}

export function getSystemAdminAccessToken() {
  return sessionStorage.getItem(SYSTEM_ADMIN_SESSION_KEYS.accessToken);
}

export function getSystemAdminUser(): SystemAdminUser | null {
  const value = sessionStorage.getItem(SYSTEM_ADMIN_SESSION_KEYS.user);
  if (!value) return null;
  try {
    return JSON.parse(value) as SystemAdminUser;
  } catch {
    return null;
  }
}

export function clearSystemAdminSession() {
  Object.values(SYSTEM_ADMIN_SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
}
