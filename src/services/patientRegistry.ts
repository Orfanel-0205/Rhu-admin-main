// src/services/patientRegistry.ts
// Patient Registry — browsable roster feeding the individual Patient Profile.
// Server-paginated + RHU-scoped by the backend.

import apiClient from "../lib/apiClient";

export interface RegistryPatient {
  user_id: number;
  name: string;
  barangay: string | null;
  rhu_id: number | null;
  sex: string | null;
  age: number | null;
  mobile_number: string | null;
  total_visits: number;
  last_visit: string | null;
  recent_diagnosis: string | null;
  follow_ups: number;
}

export interface RegistryMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export async function getPatientRegistry(params: {
  search?: string;
  page?: number;
  per_page?: number;
}): Promise<{ data: RegistryPatient[]; meta: RegistryMeta }> {
  const res = await apiClient.get("/patients/registry", {
    params: {
      search: params.search || undefined,
      page: params.page || 1,
      per_page: params.per_page || 20,
    },
  });
  return {
    data: res.data?.data ?? [],
    meta: res.data?.meta ?? { current_page: 1, last_page: 1, total: 0, per_page: 20 },
  };
}
