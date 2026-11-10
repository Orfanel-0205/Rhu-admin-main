// src/lib/roleAccess.ts
//
// Which staff roles the server serves each admin area to, mirrored from
// routes/api.php so the dashboard does not offer what it will refuse.
//
// A click-through as a nurse (Oct 2026) found pages and dashboard widgets
// offered and then refused: the Dashboard's analytics calls failed, and with
// them every other figure on it; Settings said "Your role is not allowed";
// Users, History, Analytics and the Heatmap came up empty. The server still
// decides; this only keeps the screens honest.

export function roleOf(user: any): string {
  return String(user?.role_name ?? user?.role?.name ?? user?.role ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

/** role:mho,doctor,super_admin -- My Signature, printed on their prescriptions, lab requests and ITRs. */
export function canSignDocuments(user: any): boolean {
  return ["mho", "doctor", "super_admin", "superadmin"].includes(roleOf(user));
}

function hasFullAccess(user: any): boolean {
  const capabilities = Array.isArray(user?.capabilities) ? user.capabilities : [];
  return capabilities.includes("full_access");
}

/** role:admin,staff,rhu_admin,super_admin,mho -- announcements, events editor, analytics. */
const CMS_AND_ANALYTICS_ROLES = ["admin", "staff", "rhu_admin", "super_admin", "superadmin", "mho", "mho_admin"];

/** role:super_admin,mho,rhu_admin -- /admin/sms/* */
const SMS_ROLES = ["super_admin", "superadmin", "mho", "mho_admin", "rhu_admin"];

const PAGE_ROLES: Record<string, string[]> = {
  "/cms": CMS_AND_ANALYTICS_ROLES,
  "/analytics": CMS_AND_ANALYTICS_ROLES,
  "/heatmap-analytics": CMS_AND_ANALYTICS_ROLES,
  "/sms": SMS_ROLES,
  "/users": ["admin", "staff_admin", "rhu_admin", "mho", "mho_admin", "municipal_mayor", "it_staff", "super_admin", "superadmin"],
  "/delete-history": ["admin", "staff_admin", "rhu_admin", "super_admin", "superadmin", "mho", "mho_admin", "it_staff"],
  "/settings": ["super_admin", "superadmin", "mho", "mho_admin", "rhu_admin"],
};

/** Whether the server serves this page's data to the user's role. */
export function pageAllowed(path: string, user: any): boolean {
  const roles = PAGE_ROLES[path];
  return !roles || hasFullAccess(user) || roles.includes(roleOf(user));
}

export function canSeeAnalytics(user: any): boolean {
  return pageAllowed("/analytics", user);
}

export function canManageSms(user: any): boolean {
  return pageAllowed("/sms", user);
}
