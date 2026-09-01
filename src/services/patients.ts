// src/services/patients.ts

import apiClient from "../lib/apiClient";

export interface PrescriptionPatient {
  user_id: number;
  resident_profile_id: number;
  patient_id: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  mobile_number?: string | null;
  email?: string | null;
  barangay?: string | null;
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function normalizePatient(raw: any): PrescriptionPatient {
  const userId = Number(raw.user_id ?? raw.id ?? 0);
  const profileId = Number(raw.resident_profile_id ?? raw.profile_id ?? 0);

  return {
    user_id: userId,
    resident_profile_id: profileId,
    patient_id:
      raw.patient_id ??
      raw.display_id ??
      `PAT-${String(userId || profileId).padStart(6, "0")}`,
    full_name:
      raw.full_name ??
      [raw.first_name, raw.last_name].filter(Boolean).join(" ").trim() ??
      `Patient #${userId}`,
    first_name: raw.first_name ?? null,
    last_name: raw.last_name ?? null,
    mobile_number: raw.mobile_number ?? raw.phone ?? null,
    email: raw.email ?? null,
    barangay: raw.barangay ?? null,
  };
}

export async function searchPrescriptionPatients(
  search: string
): Promise<PrescriptionPatient[]> {
  const keyword = search.trim();

  if (keyword.length < 2) return [];

  const response = await apiClient.get("/patients/search", {
    params: {
      search: keyword,
      limit: 10,
    },
  });

  return extractArray(response.data).map(normalizePatient);
}