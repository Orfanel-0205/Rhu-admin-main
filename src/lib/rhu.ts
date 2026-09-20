// src/lib/rhu.ts
// Shared RHU (facility) helpers for the Web Admin.
// RHU ids are facility ids: 1 = RHU 1 Malasiqui, 2 = RHU 2 Malasiqui (Don Pedro).

// The facility list itself lives in src/store/rhuStore.ts, loaded from the API,
// because a municipality can open a third RHU from Administration → RHU
// Facilities. Use useRhuOptions() / useRhuLabel() in components.
//
// What stays here is the role question, which is not about which facilities
// exist but about who is allowed to look past their own.

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
