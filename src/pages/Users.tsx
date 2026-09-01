// src/pages/Users.tsx

import {
  AlertTriangle,
  CheckCircle,
  Edit2,
  RefreshCw,
  Search,
  Shield,
  ToggleLeft,
  ToggleRight,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  createUser,
  deleteUser,
  FALLBACK_ROLE_OPTIONS,
  NON_SELECTABLE_ROLES,
  getBarangayOptions,
  getUserRoles,
  getUsers,
  roleLabel,
  updateUser,
  updateUserStatus,
  type BarangayOption,
  type User,
  type UserRole,
  type UserRoleOption,
} from "../services/users";
import { t } from "../i18n/translations";
import { useLangStore } from "../store/langStore";
import { useAuthStore } from "../store/authStore";
import { usePagination } from "../hooks/usePagination";
import TablePagination from "../components/ui/TablePagination";

// Role selection is restricted to these viewers (mirrors the backend gate in
// AdminUserController::authorizeRoleAssignment — the API 403s everyone else).
const ROLE_MANAGER_ROLES = ["super_admin", "superadmin", "mho"];
import { useToast } from "../contexts/ToastContext";
import RegistrationInviteModal from "../components/RegistrationInviteModal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ModuleTabs from "../components/ui/ModuleTabs";
import PasswordStrengthMeter from "../components/ui/PasswordStrengthMeter";
import { checkPasswordStrength } from "../utils/passwordPolicy";

const roleTabs = [
  { value: "all", label: "Lahat" },
  { value: "patient", label: "Mga Pasyente" },
  { value: "doctor", label: "Doktor" },
  { value: "nurse", label: "Nurse" },
  { value: "bhw", label: "BHW" },
  { value: "admin", label: "Mga Admin" },
];

const roleColors: Record<string, CSSProperties> = {
  patient: { background: "#DBEAFE", color: "#1D4ED8" },
  resident: { background: "#DBEAFE", color: "#1D4ED8" },

  doctor: { background: "#CCFBF1", color: "#0F766E" },
  nurse: { background: "#DCFCE7", color: "#166534" },
  midwife: { background: "#ECFDF5", color: "#047857" },
  bhw: { background: "#D1FAE5", color: "#047857" },
  staff: { background: "#E0F2FE", color: "#0369A1" },

  staff_admin: { background: "#F5F3FF", color: "#6D28D9" },
  admin: { background: "#FEE2E2", color: "#B91C1C" },
  rhu_admin: { background: "#FEE2E2", color: "#B91C1C" },
  mho: { background: "#FFE4E6", color: "#BE123C" },
  municipal_mayor: { background: "#FEF3C7", color: "#92400E" },
  it_staff: { background: "#E0E7FF", color: "#3730A3" },
  super_admin: { background: "#FEE2E2", color: "#991B1B" },
  superadmin: { background: "#FEE2E2", color: "#991B1B" },
};

type FormState = {
  name: string;
  role: UserRole;
  role_id?: number;
  email: string;
  phone: string;
  barangay: string;
  barangay_id?: number;
  assigned_rhu_id?: number;
  password: string;
  confirmPassword: string;
  sex: string;
  birthdate: string;
  address: string;
  guardian_name: string;
  philhealth_number: string;
  allergies: string;
  past_medical_history: string;
  maintenance_medications: string;
  family_history: string;
  personal_social_history: string;
};

const emptyForm: FormState = {
  name: "",
  role: "resident",
  role_id: 1,
  email: "",
  phone: "",
  barangay: "",
  barangay_id: undefined,
  assigned_rhu_id: undefined,
  password: "",
  confirmPassword: "",
  sex: "",
  birthdate: "",
  address: "",
  guardian_name: "",
  philhealth_number: "",
  allergies: "",
  past_medical_history: "",
  maintenance_medications: "",
  family_history: "",
  personal_social_history: "",
};

function normalizeRoleText(role: unknown): string {
  return String(role || "resident")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function roleFromTab(tab: string): string | undefined {
  if (tab === "all") return undefined;
  if (tab === "admin") return undefined;

  // Fetch all patient/resident accounts locally because some DBs use patient,
  // while the live user_roles table also has resident.
  if (tab === "patient") return undefined;

  return tab;
}

function statusLabel(status: string) {
  const safe = String(status || "pending").toLowerCase();

  if (safe === "active") return "Aktibo";
  if (safe === "inactive") return "Hindi Aktibo";
  if (safe === "pending") return "Need Review";
  if (safe === "rejected") return "Rejected";
  if (safe === "suspended") return "Suspended";

  return roleLabel(safe);
}

function isAdminRole(role: string) {
  return [
    "admin",
    "rhu_admin",
    "staff_admin",
    "mho",
    "municipal_mayor",
    "it_staff",
    "super_admin",
    "superadmin",
  ].includes(normalizeRoleText(role));
}

function isPatientRole(role: string) {
  return ["patient", "resident"].includes(normalizeRoleText(role));
}

function rhuLabel(rhuId?: number | null) {
  return rhuId === 1 || rhuId === 2 ? `RHU ${rhuId}` : "Not assigned";
}

function normalizeRhuId(rhuId?: number | null) {
  return rhuId === 1 || rhuId === 2 ? rhuId : undefined;
}

function roleIdForRoleName(roles: UserRoleOption[], roleName: string): number {
  const normalized = normalizeRoleText(roleName);

  return (
    roles.find((role) => normalizeRoleText(role.name) === normalized)?.role_id ??
    FALLBACK_ROLE_OPTIONS.find((role) => normalizeRoleText(role.name) === normalized)
      ?.role_id ??
    1
  );
}

function roleNameForRoleId(roles: UserRoleOption[], roleId: number): string {
  return (
    roles.find((role) => role.role_id === roleId)?.name ??
    FALLBACK_ROLE_OPTIONS.find((role) => role.role_id === roleId)?.name ??
    "resident"
  );
}

function patientItrPayload(form: FormState) {
  return {
    sex: form.sex.trim() || undefined,
    birthdate: form.birthdate.trim() || undefined,
    birth_date: form.birthdate.trim() || undefined,
    address: form.address.trim() || undefined,
    guardian_name: form.guardian_name.trim() || undefined,
    philhealth_number: form.philhealth_number.trim() || undefined,
    allergies: form.allergies.trim() || undefined,
    past_medical_history: form.past_medical_history.trim() || undefined,
    maintenance_medications: form.maintenance_medications.trim() || undefined,
    family_history: form.family_history.trim() || undefined,
    personal_social_history: form.personal_social_history.trim() || undefined,
  };
}

export default function Users() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const lang = useLangStore((state) => state.lang);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<UserRoleOption[]>(FALLBACK_ROLE_OPTIONS);
  const [barangays, setBarangays] = useState<BarangayOption[]>([]);

  const [tab, setTab] = useState("all");
  // ?q= comes from the global top-bar search (Part 3e) — pre-fill this page's
  // own filter with it so the handoff lands on already-filtered results.
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");

  const [modal, setModal] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [patientMode, setPatientMode] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Only meaningful while a password is actually being set. Blank/blank stays a
  // no-op ("keep the current password") rather than an error.
  const passwordsMatch =
    form.password.length > 0 && form.password === form.confirmPassword;

  const loadUsers = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError("");

      try {
        const data = await getUsers({
          role: roleFromTab(tab),
          search: search.trim() || undefined,
          per_page: 100,
        });

        setUsers(data);
      } catch (err: any) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Hindi ma-load ang user records."
        );
      } finally {
        setLoading(false);
      }
    },
    [search, tab]
  );

  useEffect(() => {
    loadUsers();

    const timer = window.setInterval(() => {
      loadUsers(true);
    }, 20000);

    return () => window.clearInterval(timer);
  }, [loadUsers]);

  const viewer = useAuthStore((s) => s.user) as any;
  const canManageRoles = ROLE_MANAGER_ROLES.includes(
    normalizeRoleText(viewer?.role_name ?? viewer?.role)
  );
  const canManageRhuAssignment = ["super_admin", "superadmin"].includes(
    normalizeRoleText(viewer?.role_name ?? viewer?.role)
  );

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const data = await getUserRoles();

        if (active) {
          setRoles(data.length > 0 ? data : FALLBACK_ROLE_OPTIONS);
        }
      } catch {
        if (active) {
          setRoles(FALLBACK_ROLE_OPTIONS);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    getBarangayOptions()
      .then((data) => {
        if (active) setBarangays(data);
      })
      .catch(() => {
        if (active) setBarangays([]);
      });

    return () => {
      active = false;
    };
  }, []);

  // Keep the page filter in sync when the global search navigates here while
  // this page is already mounted (?q= changes without a remount).
  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    const mode = searchParams.get("mode");
    const action = searchParams.get("action");
    const role = searchParams.get("role");
    const shouldOpenPatient =
      mode === "add-patient" || (action === "add" && ["resident", "patient"].includes(normalizeRoleText(role)));

    if (!shouldOpenPatient || roles.length === 0) return;

    openCreate(true);
    setTab("patient");
    setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, searchParams, setSearchParams]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return users.filter((user) => {
      const currentRole = normalizeRoleText(user.role);

      const roleMatch =
        tab === "all"
          ? true
          : tab === "admin"
          ? isAdminRole(currentRole)
          : tab === "patient"
          ? isPatientRole(currentRole)
          : currentRole === normalizeRoleText(tab);

      const text = [
        user.name,
        user.email,
        user.phone,
        user.mobile_number,
        user.barangay,
        user.rhu_label,
        user.assigned_rhu_label,
        user.role,
        user.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return roleMatch && (!keyword || text.includes(keyword));
    });
  }, [users, search, tab]);

  // Part 8 — client-side pagination over the already-filtered users.
  const pg = usePagination(filtered, { resetDeps: [filtered] });

  const stats = useMemo(() => {
    return {
      total: users.length,
      patients: users.filter((user) => isPatientRole(user.role)).length,
      staff: users.filter((user) =>
        ["doctor", "nurse", "midwife", "bhw", "staff", "staff_admin"].includes(
          normalizeRoleText(user.role)
        )
      ).length,
      admins: users.filter((user) => isAdminRole(user.role)).length,
      pending: users.filter((user) => String(user.status) === "pending").length,
      disabled: users.filter((user) => String(user.status) === "inactive").length,
    };
  }, [users]);

  const formIsPatient = patientMode || isPatientRole(form.role);

  function flash(message: string) {
    setSaved(message);
    window.setTimeout(() => setSaved(""), 3000);
  }

  function openCreate(asPatient = false) {
    setEditing(null);
    setPatientMode(asPatient);
    setForm({
      ...emptyForm,
      role: "resident",
      role_id: roleIdForRoleName(roles, "resident"),
    });
    setModal(true);
  }

  function openEdit(user: User) {
    setEditing(user);
    setPatientMode(isPatientRole(user.role));

    const roleName = normalizeRoleText(user.role || "resident");
    const roleId = user.role_id ?? roleIdForRoleName(roles, roleName);

    setForm({
      name: user.name,
      role: roleName,
      role_id: roleId,
      email: user.email,
      phone: user.phone,
      barangay: user.barangay ?? "",
      barangay_id: user.barangay_id ?? undefined,
      assigned_rhu_id:
        normalizeRhuId(user.assigned_rhu_id) ??
        normalizeRhuId(user.effective_rhu_id),
      password: "",
      confirmPassword: "",
      sex: "",
      birthdate: "",
      address: "",
      guardian_name: "",
      philhealth_number: "",
      allergies: "",
      past_medical_history: "",
      maintenance_medications: "",
      family_history: "",
      personal_social_history: "",
    });

    setModal(true);
  }

  async function saveUser() {
    const selectedRoleName = form.role_id ? roleNameForRoleId(roles, form.role_id) : form.role;
    const selectedRole = normalizeRoleText(selectedRoleName);
    const selectedIsPatient = isPatientRole(selectedRole);

    if (!form.name.trim() || !form.phone.trim()) {
      toast.warning(!form.name.trim() ? t("usr_val_full_name_required", lang) : t("usr_val_mobile_required", lang));
      return;
    }

    if (!form.role_id) {
      toast.warning("Pumili ng role bago i-save.");
      return;
    }

    if (!selectedIsPatient && canManageRhuAssignment && !form.assigned_rhu_id) {
      toast.warning("Piliin ang RHU assignment para sa staff/admin account.");
      return;
    }

    if (selectedIsPatient && !editing) {
      if (!form.password.trim()) {
        toast.warning(t("usr_val_password_required", lang));
        return;
      }

      if (!form.sex.trim()) {
        toast.warning(t("usr_val_sex_required", lang));
        return;
      }

      if (!form.birthdate.trim()) {
        toast.warning(t("usr_val_birthdate_required", lang));
        return;
      }

      if (!form.address.trim()) {
        toast.warning(t("usr_val_address_required", lang));
        return;
      }
    }

    // Typing ANY password commits the admin to confirming it. Server-side
    // 'confirmed' + the shared policy rule are still the real gate; these are
    // just fast, local messages.
    if (form.password && !form.confirmPassword.trim()) {
      toast.warning("Please re-type the password in Confirm Password.");
      return;
    }

    if (form.password && form.password !== form.confirmPassword) {
      toast.warning("Passwords do not match.");
      return;
    }

    if (form.password && !checkPasswordStrength(form.password).allMet) {
      toast.warning(
        "Password does not meet the policy: at least 8 characters with uppercase, lowercase, a number, and a special character."
      );
      return;
    }

    if (
      editing &&
      normalizeRoleText(editing.role) === "super_admin" &&
      selectedRole !== "super_admin" &&
      selectedRole !== "superadmin"
    ) {
      const confirmed = window.confirm(
        "You are changing a Super Admin account to another role. Continue only if another Super Admin account still exists."
      );

      if (!confirmed) {
        return;
      }
    }

    setSaving(true);

    try {
      if (editing) {
        await updateUser(editing.id, {
          name: form.name,
          role: selectedRole,
          role_id: form.role_id,
          email: form.email,
          phone: form.phone,
          barangay: form.barangay,
          barangay_id: form.barangay_id,
          assigned_rhu_id: selectedIsPatient ? undefined : form.assigned_rhu_id,
          password: form.password || undefined,
          password_confirmation: form.confirmPassword || undefined,
          ...(selectedIsPatient ? patientItrPayload(form) : {}),
        });

        flash("User updated successfully.");
      } else {
        await createUser({
          name: form.name,
          role: selectedRole,
          role_id: form.role_id,
          email: form.email,
          phone: form.phone,
          barangay: form.barangay,
          barangay_id: form.barangay_id,
          assigned_rhu_id: selectedIsPatient ? undefined : form.assigned_rhu_id,
          // No hardcoded fallback: a blank password lets the BACKEND apply its
          // own documented default and text the temporary password to the user.
          // Shipping "KaAgapay@1234" from here put a known credential in the JS
          // bundle and suppressed that welcome SMS.
          password: form.password.trim() || undefined,
          password_confirmation: form.confirmPassword.trim() || undefined,
          status: "active",
          ...(selectedIsPatient ? patientItrPayload(form) : {}),
        });

        flash(
          selectedIsPatient
            ? t("usr_patient_created_success", lang)
            : "User added successfully."
        );
      }

      setModal(false);
      setEditing(null);
      setForm(emptyForm);
      await loadUsers(true);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Hindi ma-save ang user."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggle(user: User) {
    const nextStatus = user.status === "active" ? "inactive" : "active";

    const confirmed = window.confirm(
      `Mark ${user.name} as ${statusLabel(nextStatus)}?`
    );

    if (!confirmed) return;

    try {
      await updateUserStatus(user.id, nextStatus);

      flash(`User marked as ${statusLabel(nextStatus)}.`);
      await loadUsers(true);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Hindi ma-update ang status."
      );
    }
  }

  // Deleting a staff account revokes a real person's access, and two staff can
  // easily share a similar name, so this uses the same type-to-confirm dialog as
  // Inventory instead of a native confirm + prompt pair.
  function onDelete(user: User) {
    setDeleteTarget(user);
  }

  async function confirmDeleteUser(reason: string) {
    if (!deleteTarget) return;

    setDeletingUser(true);

    try {
      await deleteUser(deleteTarget.id, reason);
      setDeleteTarget(null);
      flash("User deleted. Check History to restore if needed.");
      await loadUsers(true);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          "Hindi ma-delete ang user."
      );
    } finally {
      setDeletingUser(false);
    }
  }

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Ka-Agapay RHU Access Control</div>
          <h1 style={heroTitleStyle}>Pamamahala ng User</h1>
          <p style={heroSubtitleStyle}>
            I-review, aprubahan, i-edit, i-disable, o i-delete ang accounts nang
            ligtas. Super Admin can now update user roles instantly.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {/* Sir Ayco — invitation-only staff registration. Super Admin only,
              mirroring the backend role gate on /admin/registration-invites. */}
          {canManageRhuAssignment ? (
            <button
              type="button"
              onClick={() => setInviteModalOpen(true)}
              style={{ ...heroButtonStyle, background: "#065F46" }}
            >
              <Shield size={18} />
              Registration Link
            </button>
          ) : null}

          <button type="button" onClick={() => openCreate()} style={heroButtonStyle}>
            <UserPlus size={18} />
            Magdagdag ng User
          </button>
        </div>
      </section>

      <RegistrationInviteModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
      />

      {saved ? (
        <div style={successStyle}>
          <CheckCircle size={18} />
          {saved}
        </div>
      ) : null}

      {error ? (
        <div style={errorStyle}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      <section style={statsGridStyle}>
        <Stat label="Kabuuang User" value={stats.total} />
        <Stat label="Mga Pasyente" value={stats.patients} />
        <Stat label="RHU Staff" value={stats.staff} />
        <Stat label="Mga Admin" value={stats.admins} />
        <Stat label="Need Review" value={stats.pending} />
        <Stat label="Disabled" value={stats.disabled} />
      </section>

      <section style={safetyStyle}>
        <AlertTriangle size={18} />
        <div>
          <strong>Real-life safety reminder</strong>
          <p>
            Huwag burahin ang staff o admin account nang walang dahilan. Ang
            Delete button ay para sa maling account, duplicate account, o account
            na hindi na dapat gamitin.
          </p>
        </div>
      </section>

      <section style={filterPanelStyle}>
        <div style={searchBoxStyle}>
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Hanapin ang pangalan, cellphone, email, barangay..."
            style={searchInputStyle}
          />
        </div>

        <div style={tabRowStyle}>
          {/* Panelist follow-up round: standardized segmented-pill navigation
              (shared ModuleTabs) replacing the page-local pill styles. */}
          <ModuleTabs
            tabs={roleTabs.map((item) => ({ key: item.value, label: item.label }))}
            active={tab}
            onChange={setTab}
          />

          <button
            type="button"
            onClick={() => loadUsers()}
            disabled={loading}
            style={refreshButtonStyle}
          >
            <RefreshCw size={16} />
            I-refresh
          </button>
        </div>
      </section>

      <section style={tableShellStyle}>
        {loading ? (
          <div style={emptyStyle}>Loading users...</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>Papel</th>
                  <th style={thStyle}>Contact</th>
                  <th style={thStyle}>Barangay</th>
                  <th style={thStyle}>RHU</th>
                  <th style={thStyle}>Katayuan</th>
                  <th style={thStyle}>Sumali</th>
                  <th style={thStyle}>Mga Aksyon</th>
                </tr>
              </thead>

              <tbody>
                {pg.pageRows.map((user) => {
                  const normalizedRole = normalizeRoleText(user.role);

                  return (
                    <tr key={user.id}>
                      <td style={tdStyle}>
                        <div style={userCellStyle}>
                          <div style={avatarStyle}>
                            <UsersIcon size={17} />
                          </div>

                          <div>
                            <strong>{user.name}</strong>
                            <span style={subTextStyle}>
                              {user.email || "No email"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...pillStyle,
                            ...(roleColors[normalizedRole] ?? roleColors.patient),
                          }}
                        >
                          <Shield size={12} />
                          {roleLabel(normalizedRole)}
                        </span>
                      </td>

                      <td style={tdStyle}>{user.phone || "—"}</td>
                      <td style={tdStyle}>{user.barangay || "—"}</td>
                      <td style={tdStyle}>
                        {user.assigned_rhu_label ?? user.rhu_label ?? rhuLabel(user.effective_rhu_id)}
                      </td>

                      <td style={tdStyle}>
                        <span
                          style={{
                            ...pillStyle,
                            ...(user.status === "active"
                              ? { background: "#DCFCE7", color: "#166534" }
                              : user.status === "pending"
                              ? { background: "#FEF3C7", color: "#92400E" }
                              : { background: "#FEE2E2", color: "#B91C1C" }),
                          }}
                        >
                          {statusLabel(user.status)}
                        </span>
                      </td>

                      <td style={tdStyle}>{user.joined}</td>

                      <td style={tdStyle}>
                        <div style={actionRowStyle}>
                          <button
                            type="button"
                            onClick={() => openEdit(user)}
                            style={smallButtonStyle}
                          >
                            <Edit2 size={14} />
                            I-edit
                          </button>

                          <button
                            type="button"
                            onClick={() => toggle(user)}
                            style={smallButtonStyle}
                          >
                            {user.status === "active" ? (
                              <ToggleRight size={15} />
                            ) : (
                              <ToggleLeft size={15} />
                            )}
                            {user.status === "active" ? "I-disable" : "I-enable"}
                          </button>

                          <button
                            type="button"
                            onClick={() => onDelete(user)}
                            style={dangerSmallButtonStyle}
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {pg.total === 0 ? (
                  <tr>
                    <td colSpan={8} style={emptyTdStyle}>
                      Walang user na nahanap.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pg.total > 0 ? (
          <TablePagination
            page={pg.page}
            pageCount={pg.pageCount}
            total={pg.total}
            from={pg.from}
            to={pg.to}
            pageSize={pg.pageSize}
            onPage={pg.setPage}
            onPageSize={pg.setPageSize}
            label="users"
          />
        ) : null}
      </section>

      {modal ? (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div style={{ minWidth: 0 }}>
                <h2 style={modalTitleStyle}>
                  {editing
                    ? "I-edit ang User"
                    : formIsPatient
                    ? t("usr_add_patient_mobile_title", lang)
                    : "Magdagdag ng User"}
                </h2>
                {formIsPatient && !editing ? (
                  <p style={modalSubtitleStyle}>
                    {t("usr_add_patient_mobile_subtitle", lang)}
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setModal(false)}
                style={plainIconButton}
              >
                <X size={20} />
              </button>
            </div>

            <div style={modalBodyStyle}>
              <section style={formSectionStyle}>
                <div style={sectionHeaderStyle}>
                  <strong>{t("usr_account_details", lang)}</strong>
                </div>

                <div style={accountGridStyle}>
                  <Field
                    label="Buong Pangalan"
                    value={form.name}
                    onChange={(value) => setForm({ ...form, name: value })}
                  />

                  <label>
                    <span style={labelStyle}>Papel / Role</span>
                    {canManageRoles ? (
                      <>
                        <select
                          value={String(form.role_id ?? "")}
                          onChange={(event) => {
                            const roleId = Number(event.target.value);
                            const selectedRole = roleNameForRoleId(roles, roleId);

                            setForm({
                              ...form,
                              role_id: roleId,
                              role: selectedRole as UserRole,
                              assigned_rhu_id: isPatientRole(selectedRole)
                                ? undefined
                                : form.assigned_rhu_id,
                            });
                            setPatientMode(isPatientRole(selectedRole));
                          }}
                          style={inputStyle}
                        >
                          {/* Panelist: "remove staff" — the placeholder `staff`
                              role is no longer offered as a FINAL role choice.
                              It stays listed only while editing a user who
                              currently holds it, so the select never shows a
                              blank/forced value for existing rows. */}
                          {roles
                            .filter(
                              (role) =>
                                !NON_SELECTABLE_ROLES.has(String(role.name).toLowerCase()) ||
                                role.role_id === Number(form.role_id ?? -1)
                            )
                            .map((role) => (
                              <option key={role.role_id} value={role.role_id}>
                                {role.label}
                              </option>
                            ))}
                        </select>

                        <small style={roleHelpStyle}>
                          Resident/Patient accounts use the mobile app. Staff/Admin
                          accounts can access this RHU web admin depending on their role.
                        </small>
                      </>
                    ) : (
                      <>
                        <div style={{ ...inputStyle, background: "#F8FAFC", color: "#334155" }}>
                          {roleLabel(normalizeRoleText(form.role))}
                        </div>

                        <small style={roleHelpStyle}>
                          Only the Super Admin or MHO can assign roles to users.
                        </small>
                      </>
                    )}
                  </label>

                  <Field
                    label="Mobile Number"
                    value={form.phone}
                    onChange={(value) => setForm({ ...form, phone: value })}
                    placeholder="09XXXXXXXXX"
                  />

                  <Field
                    label="Email Optional"
                    value={form.email}
                    onChange={(value) => setForm({ ...form, email: value })}
                  />

                  <label>
                    <span style={labelStyle}>Barangay</span>
                    <select
                      value={form.barangay_id ? String(form.barangay_id) : form.barangay}
                      onChange={(event) => {
                        const value = event.target.value;
                        const selected = barangays.find(
                          (barangay) =>
                            String(barangay.barangay_id) === value ||
                            barangay.name === value
                        );

                        setForm({
                          ...form,
                          barangay: selected?.name ?? "",
                          barangay_id: selected?.barangay_id || undefined,
                        });
                      }}
                      style={inputStyle}
                    >
                      <option value="">Select barangay</option>
                      {barangays.map((barangay) => (
                        <option
                          key={`${barangay.barangay_id || barangay.name}`}
                          value={barangay.barangay_id || barangay.name}
                        >
                          {barangay.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {!formIsPatient ? (
                    <label>
                      <span style={labelStyle}>RHU Assignment</span>
                      {canManageRhuAssignment ? (
                        <>
                          <select
                            value={form.assigned_rhu_id ? String(form.assigned_rhu_id) : ""}
                            onChange={(event) =>
                              setForm({
                                ...form,
                                assigned_rhu_id: event.target.value
                                  ? Number(event.target.value)
                                  : undefined,
                              })
                            }
                            style={inputStyle}
                          >
                            <option value="">Select RHU</option>
                            <option value="1">RHU 1</option>
                            <option value="2">RHU 2</option>
                          </select>
                          <small style={roleHelpStyle}>
                            This controls which RHU data the staff account can access.
                          </small>
                        </>
                      ) : (
                        <>
                          <div style={{ ...inputStyle, background: "#F8FAFC", color: "#334155" }}>
                            {rhuLabel(form.assigned_rhu_id)}
                          </div>
                          <small style={roleHelpStyle}>
                            Only the Super Admin can change RHU assignment.
                          </small>
                        </>
                      )}
                    </label>
                  ) : null}

                  <Field
                    label={editing ? "New Password (optional)" : "Password"}
                    value={form.password}
                    type="password"
                    onChange={(value) => setForm({ ...form, password: value })}
                    placeholder={
                      editing
                        ? "Leave blank to keep current password"
                        : formIsPatient
                        ? "Required for mobile login"
                        : "Leave blank to auto-generate a temporary password"
                    }
                  />

                  {/*
                    Confirm field appears ONLY once a password is being typed.
                    That is what distinguishes "leave blank = keep the current
                    password" from "I am setting one" — an untouched pair stays
                    a no-op, but the moment the admin types anything the retype
                    becomes required and Save is blocked until it matches.
                  */}
                  {form.password ? (
                    <Field
                      label="Confirm Password"
                      value={form.confirmPassword}
                      type="password"
                      onChange={(value) =>
                        setForm({ ...form, confirmPassword: value })
                      }
                      placeholder="Re-type the password"
                    />
                  ) : null}

                  {form.password ? (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <PasswordStrengthMeter
                        password={form.password}
                        firstName={form.name}
                        mobile={form.phone}
                      />

                      {form.confirmPassword && !passwordsMatch ? (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#B91C1C",
                          }}
                        >
                          Passwords do not match.
                        </div>
                      ) : null}

                      {form.confirmPassword && passwordsMatch ? (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#15803D",
                          }}
                        >
                          Passwords match.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </section>

              {formIsPatient ? (
                <section style={patientFieldsStyle}>
                  <div style={patientFieldsHeaderStyle}>
                    <strong>{t("usr_patient_itr_details", lang)}</strong>
                    <span>{t("usr_add_patient_mobile_subtitle", lang)}</span>
                  </div>

                  <Field
                    label="Sex / Gender"
                    value={form.sex}
                    onChange={(value) => setForm({ ...form, sex: value })}
                    placeholder="Male / Female"
                  />

                  <Field
                    label="Birthdate"
                    value={form.birthdate}
                    type="date"
                    onChange={(value) => setForm({ ...form, birthdate: value })}
                  />

                  <Field
                    label="Address"
                    value={form.address}
                    onChange={(value) => setForm({ ...form, address: value })}
                    wide
                  />

                  <Field
                    label="Guardian"
                    value={form.guardian_name}
                    onChange={(value) => setForm({ ...form, guardian_name: value })}
                  />

                  <Field
                    label="PhilHealth / ID"
                    value={form.philhealth_number}
                    onChange={(value) => setForm({ ...form, philhealth_number: value })}
                  />

                  <Field
                    label="Allergies"
                    value={form.allergies}
                    onChange={(value) => setForm({ ...form, allergies: value })}
                    multiline
                  />

                  <Field
                    label="Past Medical History"
                    value={form.past_medical_history}
                    onChange={(value) => setForm({ ...form, past_medical_history: value })}
                    multiline
                  />

                  <Field
                    label="Maintenance Medications"
                    value={form.maintenance_medications}
                    onChange={(value) => setForm({ ...form, maintenance_medications: value })}
                    multiline
                  />

                  <Field
                    label="Family History"
                    value={form.family_history}
                    onChange={(value) => setForm({ ...form, family_history: value })}
                    multiline
                  />

                  <Field
                    label="Personal / Social History"
                    value={form.personal_social_history}
                    onChange={(value) => setForm({ ...form, personal_social_history: value })}
                    multiline
                  />
                </section>
              ) : null}
            </div>

            <div style={modalFooterStyle}>
              <button
                type="button"
                onClick={() => setModal(false)}
                style={secondaryModalButtonStyle}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveUser}
                disabled={saving}
                style={{
                  ...primaryButtonStyle,
                  opacity: saving ? 0.7 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving
                  ? "Saving..."
                  : formIsPatient && !editing
                  ? t("usr_create_patient_account", lang)
                  : "Save User"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete user account"
        tone="danger"
        confirmLabel="Delete account"
        busy={deletingUser}
        matchText={deleteTarget?.name ?? ""}
        requireReason
        minReasonLength={10}
        reasonLabel="Reason for deletion"
        reasonPlaceholder="e.g. Staff member no longer works at this RHU"
        message={
          <>
            This removes <strong>{deleteTarget?.name}</strong>
            {deleteTarget?.role ? ` (${roleLabel(deleteTarget.role)})` : ""} from
            the active list and revokes their access. The action is stored in
            Delete History and can be restored from there.
          </>
        }
        onConfirm={confirmDeleteUser}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={statCardStyle}>
      <div style={statIconStyle}>
        <UsersIcon size={18} />
      </div>
      <div>
        <strong>{value}</strong>
        <span style={subTextStyle}>{label}</span>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  multiline = false,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  multiline?: boolean;
  wide?: boolean;
}) {
  return (
    <label style={wide ? wideFieldStyle : undefined}>
      <span style={labelStyle}>{label}</span>
      {multiline ? (
        <textarea
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          style={textareaStyle}
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          style={inputStyle}
        />
      )}
    </label>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 18,
};

const heroStyle: CSSProperties = {
  background: "linear-gradient(135deg, #064E3B, #14B8A6)",
  color: "#FFFFFF",
  borderRadius: 28,
  padding: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 20,
  flexWrap: "wrap",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#A7F3D0",
  marginBottom: 8,
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 34,
  fontWeight: 900,
  letterSpacing: "-0.05em",
};

const heroSubtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#D1FAE5",
  maxWidth: 850,
  lineHeight: 1.6,
  fontWeight: 650,
};

const heroButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,.34)",
  background: "rgba(6,78,59,.82)",
  color: "#FFFFFF",
  borderRadius: 16,
  padding: "14px 18px",
  display: "inline-flex",
  alignItems: "center",
  gap: 9,
  fontWeight: 900,
  cursor: "pointer",
};

const statsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 14,
};

const statCardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 16,
  display: "flex",
  alignItems: "center",
  gap: 12,
  boxShadow: "0 10px 30px rgba(15,23,42,.04)",
};

const statIconStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 14,
  background: "#CCFBF1",
  color: "#0F766E",
  display: "grid",
  placeItems: "center",
};

const safetyStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  background: "#FFFBEB",
  border: "1px solid #FCD34D",
  color: "#92400E",
  borderRadius: 16,
  padding: 16,
};

const filterPanelStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 20,
  padding: 16,
  display: "grid",
  gap: 12,
};

const searchBoxStyle: CSSProperties = {
  height: 48,
  borderRadius: 16,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "0 14px",
};

const searchInputStyle: CSSProperties = {
  border: 0,
  outline: 0,
  background: "transparent",
  width: "100%",
  fontWeight: 700,
};

const tabRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const tabButtonStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  color: "#334155",
  borderRadius: 999,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const activeTabButtonStyle: CSSProperties = {
  background: "#047857",
  color: "#FFFFFF",
  borderColor: "#047857",
};

const refreshButtonStyle: CSSProperties = {
  ...tabButtonStyle,
  marginLeft: "auto",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const tableShellStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 20,
  overflow: "hidden",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 14,
};

const thStyle: CSSProperties = {
  textAlign: "left",
  padding: "14px 16px",
  background: "#F8FAFC",
  color: "#64748B",
  fontSize: 12,
  textTransform: "uppercase",
  letterSpacing: ".06em",
};

const tdStyle: CSSProperties = {
  padding: "14px 16px",
  borderTop: "1px solid #E2E8F0",
  verticalAlign: "middle",
};

const userCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const avatarStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: "50%",
  background: "#ECFDF5",
  color: "#047857",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const pillStyle: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const smallButtonStyle: CSSProperties = {
  border: "1px solid #A7F3D0",
  background: "#ECFDF5",
  color: "#047857",
  borderRadius: 10,
  padding: "7px 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontWeight: 900,
  cursor: "pointer",
};

const dangerSmallButtonStyle: CSSProperties = {
  ...smallButtonStyle,
  borderColor: "#FECACA",
  background: "#FEF2F2",
  color: "#B91C1C",
};

const successStyle: CSSProperties = {
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#047857",
  borderRadius: 14,
  padding: 14,
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 900,
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
  borderRadius: 14,
  padding: 14,
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontWeight: 900,
};

const emptyStyle: CSSProperties = {
  padding: 30,
  textAlign: "center",
  color: "#64748B",
  fontWeight: 800,
};

const emptyTdStyle: CSSProperties = {
  padding: 30,
  textAlign: "center",
  color: "#64748B",
  fontWeight: 800,
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,.48)",
  display: "grid",
  placeItems: "center",
  padding: "16px",
  zIndex: 90,
};

const modalStyle: CSSProperties = {
  width: "min(96vw, 1080px)",
  maxWidth: 1080,
  maxHeight: "86vh",
  background: "#FFFFFF",
  borderRadius: 20,
  boxShadow: "0 30px 90px rgba(15,23,42,.28)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  padding: "22px 24px 16px",
  borderBottom: "1px solid #E2E8F0",
  flexShrink: 0,
};

const modalTitleStyle: CSSProperties = {
  margin: 0,
  color: "#0F172A",
  fontSize: 22,
  lineHeight: 1.2,
};

const modalSubtitleStyle: CSSProperties = {
  margin: "6px 0 0",
  color: "#64748B",
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 700,
};

const modalBodyStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 20,
  overflowY: "auto",
  minHeight: 0,
};

const modalFooterStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "center",
  gap: 12,
  padding: "16px 24px",
  borderTop: "1px solid #E2E8F0",
  background: "#FFFFFF",
  flexShrink: 0,
  flexWrap: "wrap",
};

const formSectionStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
  borderRadius: 12,
  padding: 16,
};

const sectionHeaderStyle: CSSProperties = {
  color: "#0F766E",
  marginBottom: 14,
  fontSize: 14,
};

const accountGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const plainIconButton: CSSProperties = {
  border: 0,
  background: "#F1F5F9",
  width: 38,
  height: 38,
  borderRadius: 12,
  cursor: "pointer",
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 6,
  color: "#334155",
  fontSize: 13,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: "100%",
  height: 48,
  borderRadius: 14,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  padding: "0 13px",
  outline: 0,
  fontWeight: 700,
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  height: 84,
  minHeight: 84,
  padding: "12px 13px",
  resize: "vertical",
  lineHeight: 1.4,
};

const wideFieldStyle: CSSProperties = {
  gridColumn: "1 / -1",
};

const primaryButtonStyle: CSSProperties = {
  height: 50,
  minWidth: 170,
  borderRadius: 16,
  border: 0,
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 900,
  cursor: "pointer",
};

const secondaryModalButtonStyle: CSSProperties = {
  height: 50,
  minWidth: 120,
  borderRadius: 16,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  fontWeight: 900,
  cursor: "pointer",
};

const subTextStyle: CSSProperties = {
  display: "block",
  color: "#64748B",
  fontSize: 12,
  marginTop: 2,
};

const roleHelpStyle: CSSProperties = {
  color: "#64748B",
  display: "block",
  marginTop: 6,
  fontSize: 12,
  fontWeight: 700,
};

const patientFieldsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  border: "1px solid #CCFBF1",
  background: "#F0FDFA",
  borderRadius: 12,
  padding: 16,
};

const patientFieldsHeaderStyle: CSSProperties = {
  gridColumn: "1 / -1",
  display: "grid",
  gap: 4,
  color: "#0F766E",
  fontSize: 13,
};
