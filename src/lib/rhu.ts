// src/lib/rhu.ts
// Shared RHU (facility) helpers for the Web Admin.
// RHU ids are facility ids: 1 = RHU 1 Malasiqui, 2 = RHU 2 Malasiqui (Don Pedro).

export const RHU_IDS = [1, 2] as const;

export interface RhuOption {
  id: number;
  label: string;
}

export const RHU_OPTIONS: RhuOption[] = [
  { id: 1, label: "RHU 1" },
  { id: 2, label: "RHU 2" },
];

export function rhuLabel(rhuId: unknown): string | null {
  const id = Number(rhuId);
  return id === 1 || id === 2 ? `RHU ${id}` : null;
}

const GLOBAL_RHU_ROLES = new Set([
  "super_admin",
  "superadmin",
  "mho",
  "mho_admin",
  "it_staff",
]);

function normalizeRole(value: unknown): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** Global-scope roles may see All RHUs and switch between RHU 1 and RHU 2. */
export function isGlobalRhuRole(user: any): boolean {
  const role = normalizeRole(user?.role_name ?? user?.role);
  const capabilities = Array.isArray(user?.capabilities) ? user.capabilities : [];
  return capabilities.includes("full_access") || GLOBAL_RHU_ROLES.has(role);
}
