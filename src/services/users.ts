// src/services/users.ts

import apiClient from "../lib/apiClient";

export type UserRole =
  | "resident"
  | "patient"
  | "doctor"
  | "nurse"
  | "midwife"
  | "bhw"
  | "staff"
  | "staff_admin"
  | "admin"
  | "rhu_admin"
  | "mho"
  | "municipal_mayor"
  | "it_staff"
  | "super_admin"
  | "superadmin"
  | string;

export type UserStatus =
  | "active"
  | "inactive"
  | "pending"
  | "suspended"
  | "rejected"
  | string;

export interface UserRoleOption {
  role_id: number;
  id?: number;
  name: string;
  label: string;
  raw?: Record<string, any>;
}

export interface BarangayOption {
  barangay_id: number;
  id?: number;
  name: string;
  rhu_id?: number | null;
  raw?: Record<string, any>;
}

export interface User {
  id: number;
  user_id?: number;
  /**
   * Present for resident/patient accounts. The walk-in queue flow needs it to
   * issue a ticket right after creating the account.
   */
  resident_profile_id?: number | null;

  name: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;

  role: UserRole;
  role_id?: number;

  email: string;
  phone: string;
  mobile_number?: string;

  status: UserStatus;
  account_status?: UserStatus;

  joined: string;
  barangay?: string | null;
  barangay_id?: number | null;
  assigned_rhu_id?: number | null;
  assigned_rhu_label?: string | null;
  effective_rhu_id?: number | null;
  rhu_id?: number | null;
  rhu_label?: string | null;

  id_verified?: boolean;
  staff_approved_by?: number | null;
  staff_approved_at?: string | null;
  rejection_reason?: string | null;

  capabilities?: string[];

  raw?: Record<string, any>;
}

export interface UserPayload {
  name?: string;
  first_name?: string;
  last_name?: string;

  role?: UserRole;
  role_id?: number;

  email?: string;
  phone?: string;
  mobile_number?: string;

  password?: string;
  password_confirmation?: string;

  status?: UserStatus;
  account_status?: UserStatus;

  barangay?: string;
  barangay_id?: number;
  assigned_rhu_id?: number;

  sex?: string;
  birthdate?: string;
  birth_date?: string;
  address?: string;
  guardian_name?: string;
  philhealth_number?: string;
  allergies?: string;
  past_medical_history?: string;
  maintenance_medications?: string;
  family_history?: string;
  personal_social_history?: string;

  reason?: string;
}

export interface GetUsersParams {
  role?: UserRole | "all";
  search?: string;
  status?: UserStatus | "all";
  page?: number;
  per_page?: number;
}

export const FALLBACK_ROLE_OPTIONS: UserRoleOption[] = [
  { role_id: 1, name: "resident", label: "Resident" },
  { role_id: 2, name: "patient", label: "Patient" },
  { role_id: 3, name: "doctor", label: "Doctor" },
  { role_id: 4, name: "nurse", label: "Nurse" },
  { role_id: 5, name: "midwife", label: "Midwife" },
  { role_id: 6, name: "bhw", label: "BHW" },
  { role_id: 7, name: "staff", label: "Staff" },
  { role_id: 8, name: "staff_admin", label: "Staff Admin" },
  { role_id: 9, name: "rhu_admin", label: "RHU Admin" },
  { role_id: 10, name: "admin", label: "Admin" },
  { role_id: 11, name: "mho", label: "MHO (Doctor)" },
  { role_id: 12, name: "municipal_mayor", label: "Municipal Mayor" },
  { role_id: 13, name: "it_staff", label: "IT Staff" },
  { role_id: 14, name: "super_admin", label: "RHU Admin (Super Admin)" },
];

/**
 * Roles that must NOT be offered as a final/assignable role in dropdowns.
 * `staff` remains the internal unassigned-registration placeholder
 * (DEFAULT_REGISTRATION_ROLE on the backend) and stays valid on existing
 * rows — it is only removed as a *choice* (panelist: "remove staff").
 */
export const NON_SELECTABLE_ROLES = new Set(["staff"]);

export function selectableRoleOptions(options: UserRoleOption[]): UserRoleOption[] {
  return options.filter(
    (option) => !NON_SELECTABLE_ROLES.has(String(option.name).toLowerCase())
  );
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.users)) return payload.users;
  if (Array.isArray(payload?.roles)) return payload.roles;
  return [];
}

export function normalizeRoleName(value: any): string {
  const role = value?.role;

  if (typeof role === "string") {
    return role.trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  if (role?.role_name) {
    return String(role.role_name).trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  if (role?.name) {
    return String(role.name).trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  if (role?.slug) {
    return String(role.slug).trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  return String(value?.role_name ?? value?.account_type ?? "resident")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function roleLabel(role: string) {
  const normalized = normalizeRoleName({ role });

  // Panelist relabels (display ONLY — slugs/role_ids and every authorization
  // check keep using mho/super_admin). Combined labels because a real
  // `doctor` role and a real `rhu_admin` role already exist and must stay
  // distinguishable wherever both appear.
  if (normalized === "mho") return "MHO (Doctor)";
  if (normalized === "mho_admin") return "MHO Admin (Doctor)";
  if (normalized === "bhw") return "BHW";
  if (normalized === "rhu_admin") return "RHU Admin";
  if (normalized === "it_staff") return "IT Staff";
  if (normalized === "super_admin" || normalized === "superadmin") {
    return "RHU Admin (Super Admin)";
  }

  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fullName(raw: any): string {
  const direct = raw.full_name ?? raw.name;

  if (direct && String(direct).trim()) {
    return String(direct).trim();
  }

  const joined = [raw.first_name, raw.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return joined || `User #${raw.user_id ?? raw.id ?? "—"}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizePhoneForDisplay(raw: any): string {
  return String(raw.mobile_number ?? raw.phone ?? "").trim();
}

function normalizeStatus(raw: any): string {
  return String(raw.account_status ?? raw.status ?? "pending")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeUser(raw: any): User {
  const id = Number(raw.user_id ?? raw.id ?? 0);
  const phone = normalizePhoneForDisplay(raw);

  return {
    id,
    user_id: raw.user_id ?? raw.id,
    resident_profile_id: raw.resident_profile_id
      ? Number(raw.resident_profile_id)
      : null,

    name: fullName(raw),
    full_name: raw.full_name ?? raw.name,
    first_name: raw.first_name ?? undefined,
    last_name: raw.last_name ?? undefined,

    role: normalizeRoleName(raw),
    role_id:
      raw.role_id ??
      raw.role?.role_id ??
      raw.role?.id ??
      undefined,

    email: String(raw.email ?? ""),
    phone,
    mobile_number: phone,

    status: normalizeStatus(raw),
    account_status: normalizeStatus(raw),

    joined: formatDate(raw.created_at),
    barangay: raw.barangay ?? raw.resident_profile?.barangay ?? null,
    barangay_id:
      raw.barangay_id !== undefined && raw.barangay_id !== null
        ? Number(raw.barangay_id)
        : null,
    assigned_rhu_id:
      raw.assigned_rhu_id !== undefined && raw.assigned_rhu_id !== null
        ? Number(raw.assigned_rhu_id)
        : null,
    assigned_rhu_label: raw.assigned_rhu_label ?? null,
    effective_rhu_id:
      raw.effective_rhu_id !== undefined && raw.effective_rhu_id !== null
        ? Number(raw.effective_rhu_id)
        : raw.rhu_id !== undefined && raw.rhu_id !== null
        ? Number(raw.rhu_id)
        : null,
    rhu_id:
      raw.rhu_id !== undefined && raw.rhu_id !== null ? Number(raw.rhu_id) : null,
    rhu_label: raw.rhu_label ?? null,

    id_verified: Boolean(raw.id_verified),
    staff_approved_by: raw.staff_approved_by ?? null,
    staff_approved_at: raw.staff_approved_at ?? null,
    rejection_reason: raw.rejection_reason ?? null,

    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : [],

    raw,
  };
}

function normalizeRoleOption(raw: any): UserRoleOption {
  const id = Number(raw.role_id ?? raw.id ?? 0);
  const name = normalizeRoleName({
    role: raw.name ?? raw.role_name ?? raw.slug ?? raw.role ?? raw.code,
  });

  return {
    role_id: id,
    id,
    name,
    label: roleLabel(name),
    raw,
  };
}

function normalizeBarangayOption(raw: any): BarangayOption {
  const id = Number(raw?.barangay_id ?? raw?.id ?? 0);
  const name = String(raw?.name ?? raw?.barangay_name ?? raw ?? "").trim();

  return {
    barangay_id: Number.isFinite(id) ? id : 0,
    id: Number.isFinite(id) ? id : 0,
    name,
    rhu_id:
      raw?.rhu_id !== undefined && raw?.rhu_id !== null
        ? Number(raw.rhu_id)
        : null,
    raw,
  };
}

function splitName(name?: string) {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  const first_name = parts.shift() ?? "";
  const last_name = parts.join(" ");

  return { first_name, last_name };
}

function normalizePhone(phone?: string): string {
  let cleaned = String(phone ?? "")
    .trim()
    .replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+63")) {
    cleaned = `0${cleaned.slice(3)}`;
  }

  if (cleaned.startsWith("63") && cleaned.length === 12) {
    cleaned = `0${cleaned.slice(2)}`;
  }

  return cleaned;
}

function toBackendPayload(payload: Partial<UserPayload>) {
  const split = splitName(payload.name);
  const mobile = normalizePhone(payload.mobile_number ?? payload.phone);

  return {
    name: payload.name,
    first_name: payload.first_name ?? split.first_name,
    last_name: payload.last_name ?? split.last_name,

    email: payload.email?.trim() || null,

    mobile_number: mobile || null,
    phone: mobile || null,

    role: payload.role,
    role_id: payload.role_id,

    barangay: payload.barangay?.trim() || null,
    barangay_id: payload.barangay_id,
    assigned_rhu_id: payload.assigned_rhu_id,

    sex: payload.sex?.trim() || undefined,
    birthdate: payload.birthdate?.trim() || undefined,
    birth_date: payload.birth_date?.trim() || payload.birthdate?.trim() || undefined,
    address: payload.address?.trim() || undefined,
    guardian_name: payload.guardian_name?.trim() || undefined,
    philhealth_number: payload.philhealth_number?.trim() || undefined,
    allergies: payload.allergies?.trim() || undefined,
    past_medical_history: payload.past_medical_history?.trim() || undefined,
    maintenance_medications: payload.maintenance_medications?.trim() || undefined,
    family_history: payload.family_history?.trim() || undefined,
    personal_social_history: payload.personal_social_history?.trim() || undefined,

    account_status: payload.account_status ?? payload.status,
    status: payload.status ?? payload.account_status,

    password: payload.password || undefined,
    // Forwarded so Laravel's 'confirmed' rule can verify the retype on the
    // SERVER; the frontend match is convenience feedback only.
    password_confirmation: payload.password_confirmation || undefined,

    reason: payload.reason || undefined,
  };
}

export async function getUsers(params?: GetUsersParams): Promise<User[]> {
  const response = await apiClient.get("/admin/users", {
    params: {
      role: params?.role === "all" ? undefined : params?.role,
      search: params?.search?.trim() || undefined,
      status: params?.status === "all" ? undefined : params?.status,
      page: params?.page,
      per_page: params?.per_page ?? 100,
    },
  });

  return extractArray(response.data).map(normalizeUser);
}

export async function getUserRoles(): Promise<UserRoleOption[]> {
  /*
   * Prefer backend role endpoint if available.
   * If not available yet, fallback to the known live user_roles table IDs.
   */
  try {
    const response = await apiClient.get("/admin/users/roles");
    const roles = extractArray(response.data)
      .map(normalizeRoleOption)
      .filter((role) => role.role_id > 0 && role.name);

    return roles.length > 0 ? roles : FALLBACK_ROLE_OPTIONS;
  } catch {
    return FALLBACK_ROLE_OPTIONS;
  }
}

/**
 * Canonical barangay list WITH ids.
 *
 * Reads `options` (id-bearing) in preference to `data`, which is a flat array
 * of names kept for the mobile app and the string-only helpers in auth.ts /
 * sms.ts. Against a name-only response every option normalizes to id 0, which
 * is what made the walk-in form post barangay_id=0 and fail validation — so
 * entries without a usable id are dropped rather than silently sent as 0.
 */
export async function getBarangayOptions(): Promise<BarangayOption[]> {
  const response = await apiClient.get("/barangays", {
    suppressErrorToast: true,
  } as any);

  const payload = response.data ?? {};
  const rows = Array.isArray(payload?.options) && payload.options.length
    ? payload.options
    : extractArray(payload);

  const barangays = rows
    .map(normalizeBarangayOption)
    .filter((barangay: BarangayOption) => barangay.name);

  return barangays.sort((a: BarangayOption, b: BarangayOption) =>
    a.name.localeCompare(b.name)
  );
}

export async function getUser(id: number): Promise<User> {
  const response = await apiClient.get(`/admin/users/${id}`);

  return normalizeUser(response.data?.data ?? response.data);
}

export async function createUser(payload: UserPayload): Promise<User> {
  const response = await apiClient.post("/admin/users", toBackendPayload(payload));

  return normalizeUser(response.data?.data ?? response.data);
}

export async function updateUser(
  id: number,
  payload: Partial<UserPayload>
): Promise<User> {
  const response = await apiClient.patch(
    `/admin/users/${id}`,
    toBackendPayload(payload)
  );

  return normalizeUser(response.data?.data ?? response.data);
}

export async function updateUserStatus(
  id: number,
  status: UserStatus,
  reason?: string
): Promise<User> {
  const response = await apiClient.patch(`/admin/users/${id}/status`, {
    status,
    account_status: status,
    reason: reason || undefined,
  });

  return normalizeUser(response.data?.data ?? response.data);
}

export async function approveUser(id: number): Promise<User> {
  const response = await apiClient.patch(`/admin/users/${id}/approve`);

  return normalizeUser(response.data?.data ?? response.data);
}

export async function rejectUser(id: number, reason?: string): Promise<User> {
  const response = await apiClient.patch(`/admin/users/${id}/reject`, {
    reason: reason || "Rejected after account review.",
  });

  return normalizeUser(response.data?.data ?? response.data);
}

export async function deleteUser(
  id: number,
  reason = "Deleted from RHU admin user management."
): Promise<void> {
  await apiClient.delete(`/admin/users/${id}`, {
    data: {
      reason,
      delete_reason: reason,
    },
  });
}
