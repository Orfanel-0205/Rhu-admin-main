// src/services/profile.ts

import apiClient from "../lib/apiClient";

export interface AdminProfileUser {
  id?: number;
  user_id?: number;

  name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;

  email?: string | null;
  mobile_number?: string | null;
  phone?: string | null;

  barangay?: string | null;
  birthday?: string | null;
  sex?: string | null;

  role?: string | null;
  role_name?: string | null;
  role_id?: number | null;

  account_status?: string | null;
  status?: string | null;

  avatar?: string | null;
  profile_picture?: string | null;
  avatar_url?: string | null;
  profile_picture_url?: string | null;

  capabilities?: string[];
}

export interface UpdateProfilePayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile_number?: string;
  phone?: string;
  barangay?: string;
  birthday?: string;
  sex?: string;
}

function extractUser(payload: any): AdminProfileUser {
  return payload?.data ?? payload?.user ?? payload ?? {};
}

export async function getMyProfile(): Promise<AdminProfileUser> {
  const response = await apiClient.get("/profile");
  return extractUser(response.data);
}

export async function updateMyProfile(
  payload: UpdateProfilePayload
): Promise<AdminProfileUser> {
  const response = await apiClient.patch("/profile", payload);
  return extractUser(response.data);
}

export async function uploadMyProfilePicture(
  file: File
): Promise<AdminProfileUser> {
  const formData = new FormData();

  formData.append("avatar", file);

  const response = await apiClient.post("/profile/avatar", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return extractUser(response.data);
}

export function profileDisplayName(user?: AdminProfileUser | null): string {
  if (!user) return "Admin User";

  const direct = user.full_name || user.name;

  if (direct && direct.trim()) {
    return direct.trim();
  }

  const joined = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();

  return joined || "Admin User";
}

export function profilePhotoUrl(user?: AdminProfileUser | null): string | null {
  if (!user) return null;

  return (
    user.profile_picture_url ||
    user.avatar_url ||
    user.avatar ||
    user.profile_picture ||
    null
  );
}