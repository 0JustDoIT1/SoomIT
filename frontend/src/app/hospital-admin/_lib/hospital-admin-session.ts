export const HOSPITAL_ADMIN_SESSION_KEYS = {
  accessToken: "hospitalAdminAccessToken",
  refreshToken: "hospitalAdminRefreshToken",
  user: "hospitalAdminUser",
} as const;

export type HospitalAdminUser = {
  id: string;
  username: string;
  name: string;
  hospital: { id: string; code: string; name: string };
};

export function saveHospitalAdminSession(access: string, refresh: string, user: HospitalAdminUser) {
  sessionStorage.setItem(HOSPITAL_ADMIN_SESSION_KEYS.accessToken, access);
  sessionStorage.setItem(HOSPITAL_ADMIN_SESSION_KEYS.refreshToken, refresh);
  sessionStorage.setItem(HOSPITAL_ADMIN_SESSION_KEYS.user, JSON.stringify(user));
}

export const getHospitalAdminAccessToken = () => sessionStorage.getItem(HOSPITAL_ADMIN_SESSION_KEYS.accessToken);

export function getHospitalAdminUser(): HospitalAdminUser | null {
  const value = sessionStorage.getItem(HOSPITAL_ADMIN_SESSION_KEYS.user);
  if (!value) return null;
  try { return JSON.parse(value) as HospitalAdminUser; } catch { return null; }
}

export function clearHospitalAdminSession() {
  Object.values(HOSPITAL_ADMIN_SESSION_KEYS).forEach((key) => sessionStorage.removeItem(key));
}
