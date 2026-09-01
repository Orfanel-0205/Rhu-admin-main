// src/services/registrations.ts
// Super Admin REGISTRATION approval workflow.
// Every registrant (resident AND staff/admin) is pending until Super Admin
// approval. Residents submit a valid ID; staff submit an Employee ID.

import apiClient from "../lib/apiClient";

export type RegistrationStatusFilter = "pending" | "rejected" | "all";

export interface PendingRegistration {
  user_id: number;
  id: number;
  name: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  mobile_number?: string | null;
  barangay?: string | null;

  // Role (e.g. resident, doctor, rhu_admin) and assigned RHU facility.
  role?: string | null;
  is_staff?: boolean;
  is_clinical?: boolean;
  // Who should decide this row: MHO for clinical roles, Super Admin otherwise.
  // Unassigned rows (registrant has no role yet) are Super-Admin-only.
  // Computed server-side; drives the "Awaiting ..." badge + gating.
  awaiting_approver?: string | null; // "MHO" | "Super Admin"
  awaiting_approver_key?: string | null; // "mho" | "super_admin"
  // True while the row still holds the neutral registration placeholder role —
  // the approver MUST choose the final role before approving.
  role_unassigned?: boolean;
  assigned_rhu_id?: number | null;
  rhu_label?: string | null;

  // Submitted document: resident_id or employee_id (Employee Identification Card).
  document_type?: string | null;
  document_category?: string | null; // "employee_id" | "resident_id"
  designation?: string | null;

  account_status: string;
  id_verified: boolean;
  terms_accepted: boolean;
  terms_accepted_at?: string | null;
  rejection_reason?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  ocr_status: string; // approved | failed | none
  ocr_id?: number | null;
  has_id_document: boolean;
}

export interface RegistrationOcr {
  id?: number;
  id_type?: string | null;
  document_category?: string | null; // "employee_id" | "resident_id"
  designation?: string | null;
  rhu_label?: string | null;
  municipality?: string | null;
  status?: string | null;
  extracted_text?: string | null;
  extracted_name?: string | null;
  extracted_birthdate?: string | null;
  extracted_id_number?: string | null;
  name_match_score?: number | null;
  date_match_score?: number | null;
  overall_match?: number | null;
  confidence_score?: number | null;
  submitted_at?: string | null;
  has_file?: boolean;
  file_url?: string | null;
}

export interface RegistrationOcrResult {
  user: PendingRegistration;
  ocr: RegistrationOcr | null;
}

export interface RegistrationListResult {
  data: PendingRegistration[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

function extractArray(payload: any): PendingRegistration[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

export async function getPendingRegistrations(params?: {
  status?: RegistrationStatusFilter;
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<RegistrationListResult> {
  const res = await apiClient.get("/admin/registrations/pending", {
    params: {
      status: params?.status ?? "pending",
      search: params?.search?.trim() || undefined,
      page: params?.page ?? 1,
      per_page: params?.per_page ?? 20,
    },
  });

  const payload = res.data ?? {};

  return {
    data: extractArray(payload),
    current_page: Number(payload.current_page ?? 1),
    last_page: Number(payload.last_page ?? 1),
    per_page: Number(payload.per_page ?? 20),
    total: Number(payload.total ?? extractArray(payload).length),
  };
}

export async function getRegistrationOcr(
  userId: number
): Promise<RegistrationOcrResult> {
  const res = await apiClient.get(`/admin/registrations/${userId}/ocr`);
  const data = res.data?.data ?? res.data;

  return {
    user: data?.user,
    ocr: data?.ocr ?? null,
  };
}

export interface RegistrationOcrFile {
  /** Object URL for <img>/<iframe>/open-in-new-tab. Caller must revoke it. */
  url: string;
  /** Blob MIME type, e.g. "image/jpeg", "application/pdf" (may be empty). */
  type: string;
}

/**
 * Fetch the uploaded ID/Employee-ID document through the authenticated,
 * super-admin-only route. Returns an object URL plus the resolved MIME type so
 * the caller can render an image, a PDF, or an "open document" fallback.
 */
export async function getRegistrationOcrFile(
  userId: number
): Promise<RegistrationOcrFile> {
  const res = await apiClient.get(`/admin/registrations/${userId}/ocr/file`, {
    responseType: "blob",
  });

  const blob = res.data as Blob;
  return { url: URL.createObjectURL(blob), type: blob.type || "" };
}

export async function approveRegistration(
  userId: number,
  finalRole?: string
): Promise<PendingRegistration> {
  const res = await apiClient.post(
    `/admin/registrations/${userId}/approve`,
    finalRole ? { role: finalRole } : undefined
  );
  return res.data?.data ?? res.data;
}

export async function rejectRegistration(
  userId: number,
  reason: string
): Promise<PendingRegistration> {
  const res = await apiClient.post(`/admin/registrations/${userId}/reject`, {
    reason,
  });
  return res.data?.data ?? res.data;
}
