// src/services/patientProfile.ts
// Per-patient health profile — reuses the backend DiagnosisItrReportService, so
// each consultation row carries the SAME ITR/SOAP field set as the Reports module.

import apiClient from "../lib/apiClient";

export interface PatientIdentity {
  user_id: number;
  name: string;
  age?: number | string | null;
  sex?: string | null;
  barangay?: string | null;
  mobile_number?: string | null;
  philhealth_id?: string | null;
  rhu_id?: number | null;
}

export interface PatientSummary {
  total_visits: number;
  last_visit?: string | null;
  recent_diagnosis?: string | null;
  follow_ups: number;
}

// Mirrors DiagnosisItrReportService::normaliseRow output (ITR / SOAP fields).
export interface ItrConsultation {
  consultation_id: number;
  consultation_date?: string | null;
  completed_at?: string | null;
  appointment_type?: string | null;
  chief_complaint?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  diagnosis?: string | null;
  treatment?: string | null;
  notes?: string | null;
  follow_up_needed?: boolean;
  follow_up_date_time?: string | null;
  follow_up_instructions?: string | null;
  follow_up_status?: string | null;
  attending_staff?: string | null;
  [key: string]: any;
}

export interface PatientProfile {
  patient: PatientIdentity;
  summary: PatientSummary;
  consultations: ItrConsultation[];
}

export async function getPatientProfile(userId: number | string): Promise<PatientProfile> {
  const res = await apiClient.get(`/patients/${userId}/profile`);
  const data = res.data?.data ?? res.data;
  return {
    patient: data?.patient ?? { user_id: Number(userId), name: `Patient #${userId}` },
    summary: data?.summary ?? { total_visits: 0, follow_ups: 0 },
    consultations: Array.isArray(data?.consultations) ? data.consultations : [],
  };
}
