// src/pages/RegistrationApprovals.tsx
//
// Super Admin REGISTRATION APPROVALS — list pending/rejected registrants
// (residents AND staff/admin). Review role, assigned RHU, and the submitted
// document (resident ID or staff Employee Identification Card) via the
// View OCR button, then approve or reject. Rejection requires a reason and
// approval is blocked until a document has been submitted.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  IdCard,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";

import {
  approveRegistration,
  getPendingRegistrations,
  getRegistrationOcr,
  getRegistrationOcrFile,
  rejectRegistration,
  type PendingRegistration,
  type RegistrationOcr,
  type RegistrationStatusFilter,
} from "../services/registrations";
import { useAuthStore } from "../store/authStore";
import ModuleTabs from "../components/ui/ModuleTabs";

function normalizeRoleKey(role?: string | null): string {
  return String(role ?? "").toLowerCase().replace(/[\s-]+/g, "_");
}

function prettyRole(role: string): string {
  // Honor the panelist display relabels (ROLE_LABELS) before falling back to
  // the generic prettifier, so toasts/"(applied)" labels match the dropdowns.
  const key = normalizeRoleKey(role);
  return (
    ROLE_LABELS[key] ??
    role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// Final-role choices in the approval modal. Mirrors the backend authority in
// RegistrationApprovalController::approve(): the MHO may assign clinical roles
// only; a Super Admin may assign any staff role.
const CLINICAL_ROLE_OPTIONS = [
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "midwife", label: "Midwife" },
  { value: "bhw", label: "BHW" },
];

// Panelist relabels (display only) + "remove staff": the placeholder `staff`
// role is deliberately NOT offered as a final role — approvers must assign a
// real role. `staff` still exists internally as the unassigned-registration
// placeholder (DEFAULT_REGISTRATION_ROLE) and on historical rows.
const ADMIN_STAFF_ROLE_OPTIONS = [
  { value: "staff_admin", label: "Staff Admin" },
  { value: "admin", label: "Admin" },
  { value: "rhu_admin", label: "RHU Admin" },
  { value: "mho", label: "MHO (Doctor)" },
  { value: "it_staff", label: "IT Staff" },
];

const TABS: { key: RegistrationStatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function safe(value: unknown): string {
  return String(value ?? "").trim();
}

const ROLE_LABELS: Record<string, string> = {
  resident: "Resident",
  patient: "Resident",
  doctor: "Doctor",
  nurse: "Nurse",
  midwife: "Midwife",
  bhw: "Barangay Health Worker",
  staff: "RHU Staff",
  staff_admin: "RHU Staff Admin",
  admin: "Admin",
  rhu_admin: "RHU Admin",
  // Panelist relabels — display only; slugs/authorization unchanged.
  mho: "MHO (Doctor)",
  mho_admin: "MHO Admin (Doctor)",
  super_admin: "RHU Admin (Super Admin)",
  superadmin: "RHU Admin (Super Admin)",
  municipal_mayor: "Municipal Mayor",
  it_staff: "IT Staff",
};

function formatRole(role?: string | null): string {
  const key = String(role ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return "—";
  return (
    ROLE_LABELS[key] ??
    key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// Friendly label for the submitted document. Staff submit an Employee ID; the
// backend tags rows with document_category = "employee_id".
function formatDocType(row: {
  document_type?: string | null;
  document_category?: string | null;
  is_staff?: boolean;
}): string {
  const isEmployee =
    row.document_category === "employee_id" || row.is_staff === true;
  if (isEmployee) return "Employee ID";
  const t = safe(row.document_type);
  return t || "Valid ID";
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusMeta(status: string): { label: string; bg: string; color: string; border: string } {
  switch (String(status || "").toLowerCase()) {
    case "active":
      return { label: "Approved", bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" };
    case "rejected":
      return { label: "Rejected", bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA" };
    default:
      return { label: "Pending", bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" };
  }
}

function ocrMeta(status: string): { label: string; bg: string; color: string; border: string } {
  switch (String(status || "").toLowerCase()) {
    case "approved":
      return { label: "ID matched", bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" };
    case "failed":
      return { label: "Needs review", bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" };
    // Manually uploaded documents (e.g. staff Employee ID) are submitted for
    // Super Admin review without an automatic OCR name-match verdict.
    case "submitted":
    case "pending":
    case "processing":
      return { label: "Submitted", bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" };
    default:
      return { label: "No ID yet", bg: "#F1F5F9", color: "#475569", border: "#CBD5E1" };
  }
}

function getErrorMessage(error: any, fallback: string): string {
  const errors = error?.response?.data?.errors;
  if (errors) return Object.values(errors).flat().join("\n");
  return error?.response?.data?.message || error?.message || fallback;
}

export default function RegistrationApprovals() {
  const navigate = useNavigate();

  const currentUser = useAuthStore((s) => s.user) as any;
  const currentRole = normalizeRoleKey(
    currentUser?.role_name ?? currentUser?.role
  );
  const isSuperAdmin = ["super_admin", "superadmin"].includes(currentRole);
  const isMho = ["mho", "mho_admin"].includes(currentRole);

  // Mirror the backend canApprove(): Super Admin decides anything; MHO decides
  // only clinical-role rows. Unassigned rows are Super-Admin-only because the
  // intended clinical/admin role is not known yet.
  const canDecide = (row: PendingRegistration): boolean => {
    if (isSuperAdmin) return true;
    if (isMho) {
      return row.awaiting_approver_key === "mho" || row.is_clinical === true;
    }
    return false;
  };

  const [tab, setTab] = useState<RegistrationStatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PendingRegistration[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // OCR review modal
  const [reviewUser, setReviewUser] = useState<PendingRegistration | null>(null);
  // Final role assigned at approval time (defaults to the role applied for).
  const [finalRole, setFinalRole] = useState("");
  const [ocr, setOcr] = useState<RegistrationOcr | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrImageUrl, setOcrImageUrl] = useState<string>("");
  const [ocrFileType, setOcrFileType] = useState<string>("");

  // Reject reason modal
  const [rejectUser, setRejectUser] = useState<PendingRegistration | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const imageUrlRef = useRef<string>("");

  // Whenever a registration is opened for review, start the final-role picker
  // at the row's current role — or EMPTY for unassigned rows, so the approver
  // must consciously choose the final role before approving.
  useEffect(() => {
    setFinalRole(
      reviewUser?.role_unassigned ? "" : normalizeRoleKey(reviewUser?.role)
    );
  }, [reviewUser?.user_id, reviewUser?.role, reviewUser?.role_unassigned]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getPendingRegistrations({ status: tab, search, page, per_page: 20 });
      setItems(result.data);
      setLastPage(result.last_page);
      setTotal(result.total);
    } catch (err: any) {
      setError(getErrorMessage(err, "Could not load registrations."));
    } finally {
      setLoading(false);
    }
  }, [tab, search, page]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, search]);

  // Revoke any object URL on unmount.
  useEffect(() => {
    return () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    };
  }, []);

  function flash(text: string) {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 3500);
  }

  function revokeImage() {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = "";
    }
    setOcrImageUrl("");
    setOcrFileType("");
  }

  async function openOcr(user: PendingRegistration) {
    setMenuId(null);
    setReviewUser(user);
    setOcr(null);
    revokeImage();
    setOcrLoading(true);
    setError("");

    try {
      const result = await getRegistrationOcr(user.user_id);
      setOcr(result.ocr);

      if (result.ocr?.has_file || result.ocr?.file_url) {
        try {
          const file = await getRegistrationOcrFile(user.user_id);
          imageUrlRef.current = file.url;
          setOcrImageUrl(file.url);
          setOcrFileType(file.type);
        } catch {
          // Non-fatal: text/details still show without the file preview.
        }
      }
    } catch (err: any) {
      setError(getErrorMessage(err, "Could not load the ID document."));
    } finally {
      setOcrLoading(false);
    }
  }

  function closeOcr() {
    setReviewUser(null);
    setOcr(null);
    revokeImage();
  }

  async function approve(user: PendingRegistration, roleOverride?: string) {
    setMenuId(null);
    setActionId(user.user_id);
    setError("");
    try {
      await approveRegistration(user.user_id, roleOverride);
      flash(
        roleOverride
          ? `${user.name} approved as ${prettyRole(roleOverride)}. The user can now sign in.`
          : `${user.name} approved. The user can now sign in.`
      );
      closeOcr();
      await load();
    } catch (err: any) {
      setError(getErrorMessage(err, "Could not approve this registration."));
    } finally {
      setActionId(null);
    }
  }

  function openReject(user: PendingRegistration) {
    setMenuId(null);
    setRejectUser(user);
    setRejectReason("");
  }

  async function submitReject() {
    if (!rejectUser) return;
    const reason = rejectReason.trim();
    if (reason.length < 3) {
      setError("Please enter a clear rejection reason (at least 3 characters).");
      return;
    }

    setActionId(rejectUser.user_id);
    setError("");
    try {
      await rejectRegistration(rejectUser.user_id, reason);
      flash(`${rejectUser.name} was rejected.`);
      setRejectUser(null);
      setRejectReason("");
      closeOcr();
      await load();
    } catch (err: any) {
      setError(getErrorMessage(err, "Could not reject this registration."));
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="no-page-overflow" style={pageStyle}>
      <section style={heroStyle}>
        <div style={{ minWidth: 0, display: "flex", gap: 14, alignItems: "center" }}>
          <div style={heroIconStyle}>
            <ShieldCheck size={26} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={eyebrowStyle}>
              {isSuperAdmin ? "RHU Admin (Super Admin)" : isMho ? "MHO (Doctor)" : "Reviewer"}
            </div>
            <h1 style={heroTitleStyle}>Registration Approvals</h1>
            <p style={heroSubtitleStyle}>
              Review pending registrants — residents and staff. Open View OCR to
              verify the submitted ID (staff submit an Employee ID), then approve
              or reject. Approval needs a submitted document.
              {isMho
                ? " As MHO you decide clinical-staff registrations; administrative accounts stay with the Super Admin."
                : ""}
            </p>
          </div>
        </div>

        <button type="button" onClick={load} disabled={loading} style={refreshButtonStyle}>
          <RefreshCw size={18} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </section>

      {message ? (
        <div style={successBannerStyle}>
          <CheckCircle2 size={18} />
          {message}
        </div>
      ) : null}

      {error ? (
        <div style={errorBannerStyle}>
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {/* Panelist follow-up round: standardized segmented-pill navigation
          (shared ModuleTabs) replacing the page-local .status-tab styling. */}
      <div style={tabsWrapStyle}>
        <ModuleTabs
          tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
          active={tab}
          onChange={(key) => setTab(key as RegistrationStatusFilter)}
        />
      </div>

      <section style={toolbarStyle}>
        <div style={searchBoxStyle}>
          <Search size={18} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, mobile, barangay..."
            style={searchInputStyle}
          />
        </div>
      </section>

      <section className="board-card" style={boardCardStyle}>
        <div className="responsive-table" style={tableWrapStyle}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Registrant</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>RHU</th>
                <th style={thStyle}>Document</th>
                <th style={thStyle}>Email / Mobile</th>
                <th style={thStyle}>Barangay</th>
                <th style={thStyle}>Terms</th>
                <th style={thStyle}>OCR / ID</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Submitted</th>
                <th style={thRightStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={emptyCellStyle} colSpan={11}>Loading registrations...</td></tr>
              ) : items.length === 0 ? (
                <tr><td style={emptyCellStyle} colSpan={11}>No registrations in this view.</td></tr>
              ) : (
                items.map((user) => {
                  const sMeta = statusMeta(user.account_status);
                  const oMeta = ocrMeta(user.ocr_status);
                  const busy = actionId === user.user_id;
                  const closed = ["active", "rejected"].includes(
                    String(user.account_status || "").toLowerCase()
                  );
                  const decide = canDecide(user);
                  const isPending =
                    String(user.account_status || "").toLowerCase() === "pending";

                  return (
                    <tr key={user.user_id} style={trStyle}>
                      <td style={tdStyle}>
                        <div style={cellPrimaryStyle}>{user.name || `Registrant #${user.user_id}`}</div>
                        <div style={cellMutedStyle}>#{user.user_id}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ ...pillStyle, ...rolePill }}>{formatRole(user.role)}</span>
                      </td>
                      <td style={tdStyle}>{safe(user.rhu_label) || "—"}</td>
                      <td style={tdStyle}>
                        <span style={{ ...pillStyle, ...(user.is_staff || user.document_category === "employee_id" ? docEmployeePill : docResidentPill) }}>
                          {formatDocType(user)}
                        </span>
                        {user.designation ? (
                          <div style={cellMutedStyle}>{user.designation}</div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>
                        <div>{safe(user.email) || "—"}</div>
                        <div style={cellMutedStyle}>{safe(user.mobile_number) || "—"}</div>
                      </td>
                      <td style={tdStyle}>{safe(user.barangay) || "—"}</td>
                      <td style={tdStyle}>
                        {user.terms_accepted ? (
                          <span style={{ ...pillStyle, ...okPill }}>Accepted</span>
                        ) : (
                          <span style={{ ...pillStyle, ...warnPill }}>Not accepted</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{ ...pillStyle, background: oMeta.bg, color: oMeta.color, borderColor: oMeta.border }}>
                          {oMeta.label}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ ...pillStyle, background: sMeta.bg, color: sMeta.color, borderColor: sMeta.border }}>
                          {sMeta.label}
                        </span>
                        {isPending && user.awaiting_approver ? (
                          <div style={cellMutedStyle}>Awaiting {user.awaiting_approver}</div>
                        ) : null}
                        {user.account_status === "rejected" && user.rejection_reason ? (
                          <div style={cellMutedStyle} title={user.rejection_reason}>
                            {user.rejection_reason}
                          </div>
                        ) : null}
                      </td>
                      <td style={tdStyle}>{formatDate(user.submitted_at)}</td>
                      <td style={tdRightStyle}>
                        <div className="responsive-actions" style={actionsStyle}>
                          <button
                            type="button"
                            onClick={() => openOcr(user)}
                            style={primaryBtnStyle}
                          >
                            <IdCard size={14} />
                            View OCR
                          </button>

                          <div style={{ position: "relative" }}>
                            <button
                              type="button"
                              onClick={() => setMenuId(menuId === user.user_id ? null : user.user_id)}
                              style={moreBtnStyle}
                              aria-label="More actions"
                            >
                              <MoreHorizontal size={16} />
                            </button>

                            {menuId === user.user_id ? (
                              <>
                                <div style={menuBackdropStyle} onClick={() => setMenuId(null)} />
                                <div style={menuStyle}>
                                  {!closed ? (
                                    <button
                                      type="button"
                                      disabled={busy || !user.has_id_document || !decide}
                                      onClick={() =>
                                        // Unassigned rows need a final role chosen
                                        // first — open the review modal instead of
                                        // approving blind (the API would 422).
                                        user.role_unassigned ? openOcr(user) : approve(user)
                                      }
                                      style={{
                                        ...menuItemStyle,
                                        opacity: !user.has_id_document || !decide ? 0.5 : 1,
                                        cursor:
                                          !user.has_id_document || !decide
                                            ? "not-allowed"
                                            : "pointer",
                                      }}
                                      title={
                                        !decide
                                          ? `Only ${user.awaiting_approver ?? "the assigned approver"} can decide this ${user.is_clinical ? "clinical" : "administrative"} registration`
                                          : user.role_unassigned
                                          ? "Opens the review so you can assign the final role first"
                                          : user.has_id_document
                                          ? "Approve this registration"
                                          : "No document submitted yet — use View OCR to check"
                                      }
                                    >
                                      <CheckCircle2 size={15} /> Approve
                                    </button>
                                  ) : null}
                                  {user.account_status !== "rejected" ? (
                                    <button
                                      type="button"
                                      disabled={busy || !decide}
                                      onClick={() => openReject(user)}
                                      style={{
                                        ...menuItemDangerStyle,
                                        opacity: !decide ? 0.5 : 1,
                                        cursor: !decide ? "not-allowed" : "pointer",
                                      }}
                                      title={
                                        !decide
                                          ? `Only ${user.awaiting_approver ?? "the assigned approver"} can decide this registration`
                                          : "Reject this registration"
                                      }
                                    >
                                      <XCircle size={15} /> Reject
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => { setMenuId(null); navigate("/users"); }}
                                    style={menuItemStyle}
                                  >
                                    View profile
                                  </button>
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div style={paginationStyle}>
          <span style={cellMutedStyle}>
            {total} registration{total === 1 ? "" : "s"} · Page {page} of {lastPage}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))} style={pageBtnStyle}>
              Previous
            </button>
            <button type="button" disabled={page >= lastPage || loading} onClick={() => setPage((p) => Math.min(lastPage, p + 1))} style={pageBtnStyle}>
              Next
            </button>
          </div>
        </div>
      </section>

      {/* OCR review modal */}
      {reviewUser ? (
        <div style={modalOverlayStyle} onClick={closeOcr}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div style={{ minWidth: 0 }}>
                <h2 style={modalTitleStyle}>{reviewUser.name}</h2>
                <p style={modalSubtitleStyle}>
                  {safe(reviewUser.mobile_number) || safe(reviewUser.email) || `#${reviewUser.user_id}`} ·{" "}
                  {safe(reviewUser.barangay)}
                </p>
              </div>
              <button type="button" onClick={closeOcr} style={modalCloseStyle}><X size={20} /></button>
            </div>

            {ocrLoading ? (
              <div style={emptyCellStyle}>Loading ID document...</div>
            ) : (
              <div style={modalBodyStyle}>
                <div>
                  <div style={ocrImageWrapStyle}>
                    {ocrImageUrl ? (
                      ocrFileType.startsWith("image/") &&
                      !/heic|heif/.test(ocrFileType) ? (
                        <img
                          src={ocrImageUrl}
                          alt="Uploaded ID document"
                          style={ocrImageStyle}
                        />
                      ) : ocrFileType.includes("pdf") ? (
                        <iframe
                          src={ocrImageUrl}
                          title="Uploaded document"
                          style={ocrIframeStyle}
                        />
                      ) : (
                        <div style={noImageStyle}>
                          <IdCard size={28} />
                          <span>
                            Preview not available for this file type. Use
                            &ldquo;Open uploaded document&rdquo; below.
                          </span>
                        </div>
                      )
                    ) : (
                      <div style={noImageStyle}>
                        <IdCard size={28} />
                        <span>
                          {ocr?.has_file
                            ? "Could not load the document preview."
                            : ocr
                            ? "No file is attached to this OCR record."
                            : "No ID document uploaded yet."}
                        </span>
                      </div>
                    )}
                  </div>

                  {ocrImageUrl ? (
                    <a
                      href={ocrImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={openDocStyle}
                    >
                      <ExternalLink size={15} />
                      Open uploaded document
                    </a>
                  ) : null}
                </div>

                <div style={ocrDetailsStyle}>
                  <Detail
                    label="Document"
                    value={
                      ocr?.document_category === "employee_id" || reviewUser.is_staff
                        ? `Employee ID${ocr?.id_type ? ` (${ocr.id_type})` : ""}`
                        : ocr?.id_type
                    }
                  />
                  {ocr?.document_category === "employee_id" || reviewUser.is_staff ? (
                    <>
                      <Detail label="Position / Designation" value={ocr?.designation ?? reviewUser.designation} />
                      <Detail label="RHU on ID" value={ocr?.rhu_label ?? reviewUser.rhu_label} />
                      <Detail label="Municipality / LGU" value={ocr?.municipality} />
                    </>
                  ) : null}
                  <Detail
                    label="Registered name"
                    value={
                      [reviewUser.first_name, reviewUser.middle_name, reviewUser.last_name]
                        .filter(Boolean)
                        .join(" ")
                        .trim() || reviewUser.name
                    }
                  />
                  <Detail label="Extracted name" value={ocr?.extracted_name} />
                  <Detail label="Extracted birthdate" value={ocr?.extracted_birthdate} />
                  <Detail label="Extracted ID number" value={ocr?.extracted_id_number} />
                  <Detail
                    label="Match status"
                    value={
                      ocr?.overall_match != null
                        ? `${Math.round(Number(ocr.overall_match) * 100)}% (${ocr?.status ?? "—"})`
                        : ocr?.status ?? "—"
                    }
                  />
                  <Detail label="Submitted" value={formatDate(ocr?.submitted_at)} />

                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={detailLabelStyle}>Extracted text</div>
                    <div style={ocrTextStyle}>{safe(ocr?.extracted_text) || "—"}</div>
                  </div>
                </div>
              </div>
            )}

            {reviewUser.is_staff && reviewUser.account_status !== "active" && canDecide(reviewUser) ? (
              <div style={{ margin: "14px 0 2px" }}>
                <div style={detailLabelStyle}>Final role (assigned on approval)</div>
                <select
                  value={finalRole}
                  onChange={(event) => setFinalRole(event.target.value)}
                  style={{
                    width: "100%",
                    marginTop: 6,
                    padding: "9px 10px",
                    borderRadius: 10,
                    border: "1px solid #CBD5E1",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#0F172A",
                    background: "#FFFFFF",
                  }}
                >
                  {(() => {
                    const base = isSuperAdmin
                      ? [...CLINICAL_ROLE_OPTIONS, ...ADMIN_STAFF_ROLE_OPTIONS]
                      : CLINICAL_ROLE_OPTIONS;
                    const applied = normalizeRoleKey(reviewUser.role);
                    // Unassigned rows hold only the neutral placeholder — never
                    // offer it as a choice; force a real selection instead.
                    const options =
                      !reviewUser.role_unassigned &&
                      applied &&
                      !base.some((option) => option.value === applied)
                        ? [{ value: applied, label: `${prettyRole(applied)} (applied)` }, ...base]
                        : base;

                    return [
                      reviewUser.role_unassigned ? (
                        <option key="" value="" disabled>
                          Select final role…
                        </option>
                      ) : null,
                      ...options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      )),
                    ];
                  })()}
                </select>
                <small style={{ color: "#64748B", display: "block", marginTop: 5, fontSize: 12 }}>
                  {reviewUser.role_unassigned ? (
                    <>
                      This registrant did not choose a role — select the final
                      role to enable approval.{" "}
                    </>
                  ) : (
                    <>
                      Applied for:{" "}
                      <strong>{prettyRole(normalizeRoleKey(reviewUser.role) || "staff")}</strong>.{" "}
                    </>
                  )}
                  {isSuperAdmin
                    ? "As Super Admin you may assign any staff role."
                    : "As MHO you may assign clinical roles only (doctor, nurse, midwife, BHW)."}
                </small>
              </div>
            ) : null}

            <div style={modalActionsStyle}>
              {reviewUser.account_status !== "rejected" ? (
                <button
                  type="button"
                  onClick={() => openReject(reviewUser)}
                  disabled={actionId === reviewUser.user_id || !canDecide(reviewUser)}
                  style={{
                    ...rejectBtnStyle,
                    opacity: !canDecide(reviewUser) ? 0.5 : 1,
                    cursor: !canDecide(reviewUser) ? "not-allowed" : "pointer",
                  }}
                  title={
                    !canDecide(reviewUser)
                      ? `Only ${reviewUser.awaiting_approver ?? "the assigned approver"} can decide this registration`
                      : "Reject this registration"
                  }
                >
                  <XCircle size={16} /> Reject
                </button>
              ) : null}

              {reviewUser.account_status !== "active" ? (
                <button
                  type="button"
                  onClick={() =>
                    approve(
                      reviewUser,
                      finalRole && finalRole !== normalizeRoleKey(reviewUser.role)
                        ? finalRole
                        : undefined
                    )
                  }
                  disabled={
                    actionId === reviewUser.user_id ||
                    !(ocr?.has_file || reviewUser.has_id_document) ||
                    !canDecide(reviewUser) ||
                    (reviewUser.role_unassigned === true && !finalRole)
                  }
                  style={{
                    ...approveBtnStyle,
                    opacity:
                      !(ocr?.has_file || reviewUser.has_id_document) ||
                      !canDecide(reviewUser) ||
                      (reviewUser.role_unassigned === true && !finalRole)
                        ? 0.5
                        : 1,
                    cursor:
                      !(ocr?.has_file || reviewUser.has_id_document) ||
                      !canDecide(reviewUser) ||
                      (reviewUser.role_unassigned === true && !finalRole)
                        ? "not-allowed"
                        : "pointer",
                  }}
                  title={
                    !canDecide(reviewUser)
                      ? `Only ${reviewUser.awaiting_approver ?? "the assigned approver"} can decide this ${reviewUser.is_clinical ? "clinical" : "administrative"} registration`
                      : reviewUser.role_unassigned && !finalRole
                      ? "Select the final role above to enable approval"
                      : ocr?.has_file || reviewUser.has_id_document
                      ? "Approve this registration"
                      : "Approval is blocked until the registrant submits a document."
                  }
                >
                  <CheckCircle2 size={16} />
                  {actionId === reviewUser.user_id ? "Approving..." : "Approve registration"}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Reject reason modal */}
      {rejectUser ? (
        <div style={modalOverlayStyle} onClick={() => setRejectUser(null)}>
          <div style={{ ...modalStyle, maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={modalTitleStyle}>Reject {rejectUser.name}?</h2>
              <button type="button" onClick={() => setRejectUser(null)} style={modalCloseStyle}><X size={20} /></button>
            </div>
            <p style={{ color: "#475569", fontWeight: 600, margin: "0 0 12px" }}>
              The user will see this reason on their next login. Please be clear and respectful.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              placeholder="Reason for rejection (e.g. ID photo is blurry; name does not match)."
              style={textareaStyle}
            />
            <div style={modalActionsStyle}>
              <button type="button" onClick={() => setRejectUser(null)} style={pageBtnStyle}>Cancel</button>
              <button
                type="button"
                onClick={submitReject}
                disabled={actionId === rejectUser.user_id}
                style={rejectBtnStyle}
              >
                <XCircle size={16} />
                {actionId === rejectUser.user_id ? "Rejecting..." : "Reject registration"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={detailLabelStyle}>{label}</div>
      <div style={detailValueStyle}>{safe(value) || "—"}</div>
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 18,
  padding: "24px 28px 48px",
  background: "#F8FAFC",
  minHeight: "100vh",
  minWidth: 0,
  maxWidth: "100%",
  overflowX: "hidden",
  color: "#0F172A",
};

const heroStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "center",
  justifyContent: "space-between",
  borderRadius: 24,
  padding: 28,
  background: "linear-gradient(135deg, #047857 0%, #14B8A6 100%)",
  color: "#FFFFFF",
  boxShadow: "0 18px 45px rgba(15, 118, 110, 0.22)",
};

const heroIconStyle: CSSProperties = {
  width: 56, height: 56, borderRadius: 18, background: "rgba(255,255,255,0.18)",
  display: "grid", placeItems: "center", flexShrink: 0,
};

const eyebrowStyle: CSSProperties = { fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.92 };
const heroTitleStyle: CSSProperties = { margin: "6px 0 6px", fontSize: "clamp(24px, 3vw, 32px)", lineHeight: 1.05, fontWeight: 950 };
const heroSubtitleStyle: CSSProperties = { margin: 0, fontSize: 14.5, fontWeight: 700, opacity: 0.95, maxWidth: 560 };

const refreshButtonStyle: CSSProperties = {
  height: 46, border: "none", borderRadius: 14, background: "rgba(255,255,255,0.18)", color: "#FFFFFF",
  display: "inline-flex", alignItems: "center", gap: 10, padding: "0 18px", fontWeight: 900, cursor: "pointer",
};

const successBannerStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 14,
  background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", fontWeight: 800,
};
const errorBannerStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 14,
  background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", fontWeight: 800, whiteSpace: "pre-wrap",
};

const tabsWrapStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" };

const toolbarStyle: CSSProperties = {
  display: "grid", gridTemplateColumns: "1fr", gap: 12, padding: 16, borderRadius: 18,
  border: "1px solid #E2E8F0", background: "#FFFFFF",
};
const searchBoxStyle: CSSProperties = {
  display: "flex", gap: 10, alignItems: "center", padding: "0 14px", height: 46, borderRadius: 12,
  border: "1px solid #CBD5E1", background: "#F8FAFC",
};
const searchInputStyle: CSSProperties = { width: "100%", border: "none", outline: "none", background: "transparent", color: "#0F172A", fontWeight: 700 };

const boardCardStyle: CSSProperties = {
  display: "grid", gap: 12, padding: 18, borderRadius: 20, border: "1px solid #E2E8F0",
  background: "#FFFFFF", boxShadow: "0 16px 32px rgba(15, 23, 42, 0.05)",
};
const tableWrapStyle: CSSProperties = { width: "100%", overflowX: "auto", borderRadius: 14, border: "1px solid #E2E8F0" };
const tableStyle: CSSProperties = { width: "100%", minWidth: 980, borderCollapse: "collapse", background: "#FFFFFF" };
const thStyle: CSSProperties = {
  padding: "13px 14px", background: "#F8FAFC", color: "#334155", fontSize: 11, textTransform: "uppercase",
  letterSpacing: "0.05em", fontWeight: 900, textAlign: "left", borderBottom: "1px solid #E2E8F0", whiteSpace: "nowrap",
};
const thRightStyle: CSSProperties = { ...thStyle, textAlign: "right" };
const trStyle: CSSProperties = { borderBottom: "1px solid #EEF2F7" };
const tdStyle: CSSProperties = { padding: "14px", verticalAlign: "top", color: "#0F172A", fontSize: 13.5, fontWeight: 700 };
const tdRightStyle: CSSProperties = { ...tdStyle, textAlign: "right" };
const emptyCellStyle: CSSProperties = { padding: "40px 16px", textAlign: "center", color: "#64748B", fontWeight: 800 };
const cellPrimaryStyle: CSSProperties = { fontWeight: 950, color: "#0F172A" };
const cellMutedStyle: CSSProperties = { display: "block", marginTop: 4, color: "#64748B", fontSize: 12, fontWeight: 700 };

const pillStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", border: "1px solid", borderRadius: 999,
  padding: "4px 10px", fontSize: 12, fontWeight: 900, whiteSpace: "nowrap",
};
const okPill: CSSProperties = { background: "#ECFDF5", color: "#047857", borderColor: "#A7F3D0" };
const warnPill: CSSProperties = { background: "#FEF3C7", color: "#92400E", borderColor: "#FDE68A" };
const rolePill: CSSProperties = { background: "#EEF2FF", color: "#3730A3", borderColor: "#C7D2FE" };
const docEmployeePill: CSSProperties = { background: "#FEF3C7", color: "#92400E", borderColor: "#FDE68A" };
const docResidentPill: CSSProperties = { background: "#F1F5F9", color: "#334155", borderColor: "#CBD5E1" };

const actionsStyle: CSSProperties = { justifyContent: "flex-end", alignItems: "center" };
const smallBtnBase: CSSProperties = {
  minHeight: 32, border: "1px solid transparent", borderRadius: 10, padding: "6px 12px",
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 900, cursor: "pointer", whiteSpace: "nowrap",
};
const primaryBtnStyle: CSSProperties = { ...smallBtnBase, background: "#0F766E", color: "#FFFFFF" };
const moreBtnStyle: CSSProperties = { ...smallBtnBase, background: "#F1F5F9", color: "#0F172A", padding: "6px 10px" };

const menuBackdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 30 };
const menuStyle: CSSProperties = {
  position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 31, minWidth: 170, background: "#FFFFFF",
  border: "1px solid #E2E8F0", borderRadius: 12, boxShadow: "0 16px 40px rgba(15,23,42,0.18)", padding: 6, display: "grid", gap: 2,
};
const menuItemStyle: CSSProperties = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", border: "none", background: "transparent",
  padding: "9px 10px", borderRadius: 8, fontWeight: 800, fontSize: 13.5, color: "#0F172A", cursor: "pointer", textAlign: "left",
};
const menuItemDangerStyle: CSSProperties = { ...menuItemStyle, color: "#B91C1C" };

const paginationStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 };
const pageBtnStyle: CSSProperties = {
  border: "1px solid #CBD5E1", borderRadius: 10, background: "#FFFFFF", color: "#0F172A", fontWeight: 900, padding: "8px 14px", cursor: "pointer",
};

const modalOverlayStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", backdropFilter: "blur(3px)",
  display: "grid", placeItems: "center", padding: 20, zIndex: 80,
};
const modalStyle: CSSProperties = {
  width: "min(820px, 100%)", maxHeight: "90vh", overflowY: "auto", background: "#FFFFFF",
  borderRadius: 20, padding: 22, boxShadow: "0 28px 70px rgba(2,6,23,0.4)",
};
const modalHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 14 };
const modalTitleStyle: CSSProperties = { margin: 0, fontSize: 22, fontWeight: 950 };
const modalSubtitleStyle: CSSProperties = { margin: "4px 0 0", color: "#64748B", fontWeight: 800, fontSize: 13 };
const modalCloseStyle: CSSProperties = {
  width: 40, height: 40, borderRadius: 12, border: "1px solid #E2E8F0", background: "#F8FAFC",
  color: "#334155", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0,
};
const modalBodyStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 16 };
const ocrImageWrapStyle: CSSProperties = {
  minHeight: 220, borderRadius: 14, border: "1px solid #E2E8F0", background: "#0F172A",
  display: "grid", placeItems: "center", overflow: "hidden",
};
const ocrImageStyle: CSSProperties = { width: "100%", height: "100%", maxHeight: 420, objectFit: "contain" };
const ocrIframeStyle: CSSProperties = { width: "100%", height: 420, border: "none", background: "#FFFFFF" };
const noImageStyle: CSSProperties = { display: "grid", placeItems: "center", gap: 8, color: "#94A3B8", padding: 24, textAlign: "center", fontWeight: 700 };
const openDocStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  marginTop: 10,
  padding: "9px 14px",
  borderRadius: 12,
  border: "1px solid #99F6E4",
  background: "#FFFFFF",
  color: "#0F766E",
  fontWeight: 900,
  fontSize: 13,
  textDecoration: "none",
};
const ocrDetailsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))", gap: 12, alignContent: "start" };
const detailLabelStyle: CSSProperties = { color: "#64748B", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" };
const detailValueStyle: CSSProperties = { color: "#0F172A", fontSize: 14, fontWeight: 800, marginTop: 3, overflowWrap: "anywhere" };
const ocrTextStyle: CSSProperties = {
  marginTop: 4, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 12, padding: 12,
  whiteSpace: "pre-wrap", color: "#334155", fontSize: 13, lineHeight: 1.5, maxHeight: 180, overflowY: "auto",
};
const modalActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18, flexWrap: "wrap" };
const approveBtnStyle: CSSProperties = {
  border: "none", background: "#047857", color: "#FFFFFF", borderRadius: 12, padding: "11px 18px",
  fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
};
const rejectBtnStyle: CSSProperties = {
  border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", borderRadius: 12, padding: "11px 18px",
  fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer",
};
const textareaStyle: CSSProperties = {
  width: "100%", minHeight: 110, borderRadius: 12, border: "1px solid #CBD5E1", padding: 12,
  fontWeight: 600, color: "#0F172A", resize: "vertical", outline: "none",
};
