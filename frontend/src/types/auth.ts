export type UserRole =
  | "DOCTOR"
  | "NURSE"
  | "TECHNOLOGIST"
  | "MEDICAL_STAFF";

export interface OrganizationSummary {
  id: string;
  code: string;
  name: string;
}

export interface LoginRequest {
  hospital_code: string;
  username: string;
  password: string;
}

export interface LoginUser {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  department: OrganizationSummary;
  hospital: OrganizationSummary;
}

export interface LoginResponse {
  access: string;
  refresh: string;
  user: LoginUser;
}
