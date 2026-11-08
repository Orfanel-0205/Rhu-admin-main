// src/services/signature.ts
// My Profile → My Signature (MHO and doctors), and the signature printed on a
// completed consultation's ITR. The image never has a public address: it
// comes back as a data URI from a signed-in request.
import apiClient from "../lib/apiClient";

export type StaffSignature = {
  image: string | null;
  source: "drawn" | "uploaded";
  saved_at: string | null;
};

export type ConsultationSignature = {
  image: string;
  signer_id: number;
  signer_name: string | null;
};

export async function getMySignature(): Promise<StaffSignature | null> {
  const res = await apiClient.get("/admin/profile/signature");
  return res.data?.signature ?? null;
}

/** How much darker than the paper counts as ink in a photo (server: StaffSignatures). */
export const STRICTNESS = { min: 20, max: 100, default: 50 } as const;

/** The signature the server extracts from a photo, without saving it. */
export async function previewSignature(image: Blob, strictness: number): Promise<string> {
  const form = new FormData();
  form.append("image", image, image instanceof File ? image.name : "signature.png");
  form.append("strictness", String(strictness));

  const res = await apiClient.post("/admin/profile/signature/preview", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.image;
}

export async function saveMySignature(
  image: Blob,
  source: "drawn" | "uploaded",
  currentPassword: string,
  strictness: number = STRICTNESS.default
): Promise<{ message: string; signature: StaffSignature | null }> {
  const form = new FormData();
  const name = image instanceof File ? image.name : "signature.png";
  form.append("image", image, name);
  form.append("source", source);
  form.append("strictness", String(strictness));
  form.append("current_password", currentPassword);

  const res = await apiClient.post("/admin/profile/signature", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function removeMySignature(currentPassword: string): Promise<{ message: string }> {
  const res = await apiClient.delete("/admin/profile/signature", {
    data: { current_password: currentPassword },
  });
  return res.data;
}

/** Null when the record is still open, unsigned, or the lookup fails: the ITR then prints a blank line. */
export async function getConsultationSignature(
  consultationId: string | number
): Promise<ConsultationSignature | null> {
  try {
    const res = await apiClient.get(`/admin/consultations/${consultationId}/signature`);
    return res.data?.signature ?? null;
  } catch {
    return null;
  }
}
