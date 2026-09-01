//src/services/prescriptions.ts
import apiClient from "../lib/apiClient";

export interface MedicationInput {
  name: string;
  generic_name?: string;
  dosage?: string;
  dosage_form?: string;
  quantity?: number;
  frequency?: string;
  duration?: string;
  route?: string;
  instructions?: string;
  is_controlled?: boolean;
  brand_alternatives_allowed?: boolean;
}

export type PrescriptionFormType = "medicine" | "lab_request";

export interface LabTestsInput {
  laboratory: string[];
  xray: string[];
  ultrasound: string[];
  others: {
    laboratory?: string;
    xray?: string;
    ultrasound?: string;
  };
}

export interface Prescription {
  id: number;
  resident_profile_id: number;
  prescribed_by: number;
  consultation_id?: number | null;
  telemedicine_session_id?: number | null;
  form_type?: PrescriptionFormType | string | null;
  prescription_number: string;
  rhu_id: number;
  prescription_date: string;
  valid_until?: string | null;
  diagnosis?: string | null;
  diagnosis_code?: string | null;
  clinical_impression?: string | null;
  request_reason?: string | null;
  priority?: string | null;
  request_notes?: string | null;
  lab_tests?: LabTestsInput | null;
  medications: MedicationInput[];
  has_controlled_substances?: boolean;
  additional_instructions?: string | null;
  dispensing_notes?: string | null;
  status: string;
  file_path?: string | null;
  pdf_url?: string | null;
  pdf_endpoint?: string | null;
  patient_name?: string | null;
  prescriber_name?: string | null;
  created_at?: string | null;
}

export interface CreatePrescriptionPayload {
  form_type?: PrescriptionFormType;
  resident_profile_id: number;
  consultation_id?: number | null;
  telemedicine_session_id?: number | null;
  rhu_id?: number | null;
  diagnosis?: string;
  diagnosis_code?: string;
  clinical_impression?: string;
  request_reason?: string;
  priority?: string;
  request_notes?: string;
  lab_tests?: LabTestsInput;
  medications: MedicationInput[];
  additional_instructions?: string;
  dispensing_notes?: string;
}

export interface PrescriptionOcrResult {
  prescription_id: number;
  prescription_number: string;
  pdf_path: string;
  pdf_url: string;
  original_path: string;
  extracted_text: string;
  medicines: Array<Record<string, any>>;
}

export interface MedicineSearchResult {
  id: number;
  name: string;
  generic_name?: string | null;
  brand_name?: string | null;
  dosage_form?: string | null;
  strength?: string | null;
  unit_of_measure?: string | null;
  stock?: number | null;
  current_stock?: number | null;
  item_code?: string | null;
}

function extractArray(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function normalizeMedications(value: any): MedicationInput[] {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      return [];
    }
  }

  return [];
}

function normalizeLabTests(value: any): LabTestsInput | null {
  let raw = value;

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = null;
    }
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    laboratory: Array.isArray(raw.laboratory) ? raw.laboratory.map(String) : [],
    xray: Array.isArray(raw.xray) ? raw.xray.map(String) : [],
    ultrasound: Array.isArray(raw.ultrasound) ? raw.ultrasound.map(String) : [],
    others: {
      laboratory: raw.others?.laboratory ?? "",
      xray: raw.others?.xray ?? "",
      ultrasound: raw.others?.ultrasound ?? "",
    },
  };
}

function normalizePrescription(item: any): Prescription {
  return {
    id: Number(item.id),
    resident_profile_id: Number(item.resident_profile_id ?? 0),
    prescribed_by: Number(item.prescribed_by ?? 0),
    consultation_id:
      item.consultation_id !== undefined && item.consultation_id !== null
        ? Number(item.consultation_id)
        : null,
    telemedicine_session_id:
      item.telemedicine_session_id !== undefined && item.telemedicine_session_id !== null
        ? Number(item.telemedicine_session_id)
        : null,
    form_type: item.form_type ?? "medicine",
    prescription_number: String(item.prescription_number ?? `RX-${item.id}`),
    rhu_id: Number(item.rhu_id ?? 1),
    prescription_date: String(item.prescription_date ?? item.created_at ?? ""),
    valid_until: item.valid_until ?? null,
    diagnosis: item.diagnosis ?? null,
    diagnosis_code: item.diagnosis_code ?? null,
    clinical_impression: item.clinical_impression ?? null,
    request_reason: item.request_reason ?? null,
    priority: item.priority ?? null,
    request_notes: item.request_notes ?? null,
    lab_tests: normalizeLabTests(item.lab_tests),
    medications: normalizeMedications(item.medications),
    has_controlled_substances: Boolean(item.has_controlled_substances),
    additional_instructions: item.additional_instructions ?? null,
    dispensing_notes: item.dispensing_notes ?? null,
    status: String(item.status ?? "active"),
    file_path: item.file_path ?? null,
    pdf_url: item.pdf_url ?? null,
    pdf_endpoint: item.pdf_endpoint ?? null,
    patient_name: item.patient_name ?? null,
    prescriber_name: item.prescriber_name ?? null,
    created_at: item.created_at ?? null,
  };
}

export async function getPrescriptions(params?: {
  search?: string;
  status?: string;
  consultation_id?: string | number;
  resident_profile_id?: string | number;
}): Promise<Prescription[]> {
  const response = await apiClient.get("/prescriptions", {
    params: {
      ...params,
      status: params?.status === "all" ? undefined : params?.status,
      per_page: 100,
    },
  });

  return extractArray(response.data).map(normalizePrescription);
}

export async function createPrescription(
  payload: CreatePrescriptionPayload
): Promise<Prescription> {
  const response = await apiClient.post("/prescriptions", payload);
  return normalizePrescription(response.data?.data ?? response.data);
}

export async function searchMedicines(
  q: string,
  rhuId?: number | null
): Promise<MedicineSearchResult[]> {
  const response = await apiClient.get("/medicines/search", {
    params: {
      q,
      rhu_id: rhuId || undefined,
      limit: 10,
    },
  });

  const payload = response.data?.data ?? response.data;

  return Array.isArray(payload) ? payload : [];
}

export async function releasePrescription(
  id: number,
  options?: {
    dispense_from_rhu?: boolean;
    strict_inventory?: boolean;
    dispensing_notes?: string;
  }
): Promise<Prescription> {
  const response = await apiClient.post(`/prescriptions/${id}/release`, {
    dispense_from_rhu: Boolean(options?.dispense_from_rhu),
    strict_inventory: options?.strict_inventory ?? true,
    dispensing_notes: options?.dispensing_notes,
  });

  return response.data?.data ?? response.data;
}

export async function dispensePrescription(
  id: number,
  notes = ""
): Promise<Prescription> {
  const response = await apiClient.post(`/prescriptions/${id}/dispense`, {
    notes,
    dispensing_notes: notes,
    deduct_inventory: true,
    strict_inventory: true,
    fail_on_insufficient_stock: true,
  });

  return response.data?.data ?? response.data;
}

export async function cancelPrescription(
  id: string | number,
  reason = "Prescription voided from RHU admin web."
): Promise<void> {
  await apiClient.delete(`/prescriptions/${id}`, {
    data: {
      reason,
      void_reason: reason,
      delete_reason: reason,
    },
  });
}

export async function updatePrescriptionStatus(
  id: string | number,
  status: string
): Promise<Prescription> {
  const response = await apiClient.patch(`/prescriptions/${id}`, { status });
  return normalizePrescription(response.data?.data ?? response.data);
}

export async function downloadPrescriptionPdf(id: string | number): Promise<void> {
  const response = await apiClient.get(`/prescriptions/${id}/pdf`, {
    responseType: "blob",
  });

  const blob = new Blob([response.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);

  window.open(url, "_blank", "noopener,noreferrer");

  window.setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 30000);
}

export async function scanPrescriptionForConsultation(
  consultationId: string | number,
  file: File,
  extra?: { diagnosis?: string; notes?: string }
): Promise<PrescriptionOcrResult> {
  const form = new FormData();
  form.append("prescription_image", file);

  if (extra?.diagnosis) form.append("diagnosis", extra.diagnosis);
  if (extra?.notes) form.append("notes", extra.notes);

  const response = await apiClient.post(`/ocr/prescription/${consultationId}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return response.data?.data ?? response.data;
}
