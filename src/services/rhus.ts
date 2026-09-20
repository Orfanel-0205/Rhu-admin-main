// src/services/rhus.ts
//
// The Rural Health Units themselves. Malasiqui runs RHU 1 and RHU 2 today, but
// the list is data now, not something fixed in the code: a super admin can open
// a third from Administration → RHU Facilities, and every picker follows.

import apiClient from "../lib/apiClient";

export interface RhuFacility {
  id: number;
  code: string;
  name: string;
  short_name: string;
  address?: string | null;
  contact_number?: string | null;
  is_active: boolean;
  /** Barangays this facility serves; that mapping is what routes residents. */
  barangay_ids: number[];
  barangay_count: number;
  staff_count: number;
}

export interface RhuFacilityPayload {
  code: string;
  name: string;
  short_name: string;
  address?: string | null;
  contact_number?: string | null;
  is_active?: boolean;
}

export interface BarangayChoice {
  barangay_id: number;
  name: string;
  rhu_id: number | null;
}

/**
 * Barangays with their ids and current facility. The /barangays endpoint keeps
 * `data` as plain names for older callers, so the ids live in `options`.
 */
export async function getBarangayChoices(): Promise<BarangayChoice[]> {
  const response = await apiClient.get("/barangays");
  const options = response.data?.options;

  if (!Array.isArray(options)) return [];

  return options
    .map((option: any) => ({
      barangay_id: Number(option?.barangay_id ?? 0),
      name: String(option?.name ?? "").trim(),
      rhu_id: option?.rhu_id == null ? null : Number(option.rhu_id),
    }))
    .filter((option: BarangayChoice) => option.barangay_id > 0 && option.name !== "");
}

export async function getRhuFacilities(): Promise<RhuFacility[]> {
  const response = await apiClient.get("/rhus");
  const payload = response.data?.data ?? response.data;

  return Array.isArray(payload) ? payload : [];
}

export async function createRhuFacility(payload: RhuFacilityPayload): Promise<RhuFacility> {
  const response = await apiClient.post("/rhus", payload);

  return response.data?.data ?? response.data;
}

export async function updateRhuFacility(
  id: number,
  payload: Partial<RhuFacilityPayload>
): Promise<RhuFacility> {
  const response = await apiClient.put(`/rhus/${id}`, payload);

  return response.data?.data ?? response.data;
}

/** Replace the set of barangays this facility serves. */
export async function assignRhuBarangays(
  id: number,
  barangayIds: number[]
): Promise<RhuFacility> {
  const response = await apiClient.put(`/rhus/${id}/barangays`, {
    barangay_ids: barangayIds,
  });

  return response.data?.data ?? response.data;
}
