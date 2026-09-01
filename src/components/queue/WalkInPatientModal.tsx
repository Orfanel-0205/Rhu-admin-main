// src/components/queue/WalkInPatientModal.tsx
//
// Walk-in intake for the Queue page.
//
// A walk-in gets a REAL patient account, not a queue-ticket-only stub, so the
// person is afterwards visible in Patient Registry, Consultations and future
// visits exactly as if they had registered themselves in the mobile app.
//
// Nothing here is a new pipeline — it composes three existing ones:
//   1. GET  /patients/search  — find an existing patient (returns
//      resident_profile_id, creating the profile row when it is missing).
//   2. POST /admin/users      — the same admin account-provisioning path used
//      for staff accounts, with role=resident. That path already creates the
//      resident_profile AND already texts the welcome/credentials SMS via
//      AccountSmsService, so no SMS code is added or touched here.
//   3. POST /queue/issue      — issue the ticket for that resident_profile_id.
//
// RHU scoping is enforced server-side: /queue/issue forces rhu_id through its
// own scoped resolver, so the value sent here cannot place a ticket in another
// RHU.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  Loader2,
  Search,
  UserPlus,
  X,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";

import { searchPrescriptionPatients, type PrescriptionPatient } from "../../services/patients";
import { createUser, getBarangayOptions, type BarangayOption } from "../../services/users";
import { issueQueueTicket, WALK_IN_SERVICE_TYPES } from "../../services/queue";
import { useToast } from "../../contexts/ToastContext";

type Step = "search" | "register" | "desk";

export default function WalkInPatientModal({
  open,
  onClose,
  rhuId,
  defaultServiceType,
  onIssued,
}: {
  open: boolean;
  onClose: () => void;
  rhuId: number;
  defaultServiceType: string;
  onIssued: () => void;
}) {
  const toast = useToast();

  const [step, setStep] = useState<Step>("search");

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PrescriptionPatient[]>([]);
  const [searched, setSearched] = useState(false);

  const [patient, setPatient] = useState<PrescriptionPatient | null>(null);
  const [createdNow, setCreatedNow] = useState(false);

  const [barangays, setBarangays] = useState<BarangayOption[]>([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [sex, setSex] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [barangayId, setBarangayId] = useState("");
  const [address, setAddress] = useState("");

  const [serviceType, setServiceType] = useState(defaultServiceType);
  const [isEmergency, setIsEmergency] = useState(false);
  const [isBhwEndorsed, setIsBhwEndorsed] = useState(false);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setStep("search");
    setSearch("");
    setResults([]);
    setSearched(false);
    setSearching(false);
    setPatient(null);
    setCreatedNow(false);
    setFirstName("");
    setLastName("");
    setMobile("");
    setSex("");
    setBirthdate("");
    setBarangayId("");
    setAddress("");
    setServiceType(defaultServiceType);
    setIsEmergency(false);
    setIsBhwEndorsed(false);
    setNotes("");
    setSaving(false);
  }, [defaultServiceType]);

  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    if (!open || barangays.length) return;

    getBarangayOptions()
      .then(setBarangays)
      .catch(() => {
        // Barangay is optional on the form; a failed lookup must not block intake.
      });
  }, [open, barangays.length]);

  const mobileValid = useMemo(() => /^09\d{9}$/.test(mobile.trim()), [mobile]);

  /**
   * The selected row, matched by id OR by name.
   *
   * The name match is the fallback for a backend that still returns the
   * names-only barangay list (no ids); the option value falls back to the name
   * in that case, exactly as the Users page already does.
   */
  const selectedBarangay = useMemo(
    () =>
      barangays.find((item) => String(item.barangay_id) === barangayId) ??
      barangays.find((item) => item.name === barangayId) ??
      null,
    [barangays, barangayId]
  );

  if (!open) return null;

  async function runSearch() {
    const keyword = search.trim();

    if (keyword.length < 2) {
      toast.warning("Type at least 2 characters to search.");
      return;
    }

    setSearching(true);

    try {
      const rows = await searchPrescriptionPatients(keyword);

      setResults(rows);
      setSearched(true);

      if (!rows.length) {
        // Carry what was typed into the registration form so staff do not
        // retype the name they just searched for.
        const parts = keyword.split(/\s+/);

        if (!firstName && !lastName && !/\d/.test(keyword)) {
          setFirstName(parts[0] ?? "");
          setLastName(parts.slice(1).join(" "));
        }

        if (!mobile && /^09\d{0,9}$/.test(keyword)) {
          setMobile(keyword);
        }
      }
    } catch {
      toast.error("Could not search patients. Please try again.");
    } finally {
      setSearching(false);
    }
  }

  function choosePatient(row: PrescriptionPatient) {
    setPatient(row);
    setCreatedNow(false);
    setStep("desk");
  }

  async function registerPatient() {
    if (!firstName.trim()) {
      toast.warning("First name is required.");
      return;
    }

    if (!lastName.trim()) {
      toast.warning("Last name is required.");
      return;
    }

    if (!mobileValid) {
      toast.warning("Mobile number must use this format: 09XXXXXXXXX.");
      return;
    }

    setSaving(true);

    try {
      const created = await createUser({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile_number: mobile.trim(),
        role: "resident",
        account_status: "active",
        sex: sex || undefined,
        birthdate: birthdate || undefined,
        // Only ever send a REAL id. A names-only barangay list normalizes every
        // option to 0, and 0 fails exists:barangays,barangay_id — that was the
        // "The selected barangay id is invalid" bug. The name is sent alongside
        // so the backend can still resolve the barangay when no id is available.
        barangay_id:
          selectedBarangay && selectedBarangay.barangay_id > 0
            ? selectedBarangay.barangay_id
            : undefined,
        barangay: selectedBarangay?.name || undefined,
        address: address.trim() || undefined,
      });

      const profileId = Number(created.resident_profile_id ?? 0);

      if (!profileId) {
        toast.error(
          "The account was created but its patient profile could not be read. Search for the patient and add them to the queue."
        );
        setSaving(false);
        return;
      }

      setPatient({
        user_id: Number(created.user_id ?? created.id ?? 0),
        resident_profile_id: profileId,
        patient_id: `PAT-${String(created.user_id ?? created.id ?? 0).padStart(6, "0")}`,
        full_name: `${firstName.trim()} ${lastName.trim()}`,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile_number: mobile.trim(),
        email: null,
        barangay: selectedBarangay?.name ?? null,
      });
      setCreatedNow(true);
      setStep("desk");
      toast.success("Patient account created. Login details were texted to the patient.");
    } catch (error: any) {
      const data = error?.response?.data;
      const firstError =
        data?.errors && typeof data.errors === "object"
          ? (Object.values(data.errors)[0] as string[] | undefined)?.[0]
          : undefined;

      toast.error(firstError ?? data?.message ?? "Could not create the patient account.");
    } finally {
      setSaving(false);
    }
  }

  async function issueTicket() {
    if (!patient) return;

    setSaving(true);

    try {
      await issueQueueTicket({
        resident_profile_id: patient.resident_profile_id,
        service_type: serviceType,
        rhu_id: rhuId,
        is_emergency: isEmergency,
        is_bhw_endorsed: isBhwEndorsed,
        notes: notes.trim() || undefined,
      });

      toast.success(`${patient.full_name} was added to the queue.`);
      onIssued();
      onClose();
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message ?? "Could not add this patient to the queue."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-label="Add walk-in patient">
      <div style={cardStyle}>
        <div style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            {step !== "search" && (
              <button
                type="button"
                onClick={() => setStep(step === "desk" && createdNow ? "register" : step === "desk" ? "search" : "search")}
                style={backButtonStyle}
                aria-label="Go back"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div style={{ minWidth: 0 }}>
              <h3 style={titleStyle}>Add Walk-in Patient</h3>
              <p style={subtitleStyle}>
                {step === "search" && "Find the patient first — every walk-in gets a real patient account."}
                {step === "register" && "New patient: this creates a real account, not a temporary ticket."}
                {step === "desk" && "Choose the service desk and issue the queue ticket."}
              </p>
            </div>
          </div>

          <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div style={bodyStyle}>
          {step === "search" && (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void runSearch();
                    }
                  }}
                  placeholder="Search name or mobile number"
                  style={{ ...inputStyle, flex: 1 }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => void runSearch()}
                  disabled={searching}
                  style={primaryButtonStyle}
                >
                  {searching ? <Loader2 size={16} className="spin" /> : <Search size={16} />}
                  Search
                </button>
              </div>

              {searched && results.length > 0 && (
                <div style={listStyle}>
                  {results.map((row) => (
                    <button
                      key={row.resident_profile_id}
                      type="button"
                      onClick={() => choosePatient(row)}
                      style={rowStyle}
                    >
                      <span style={{ fontWeight: 800, color: "#0F172A" }}>{row.full_name}</span>
                      <span style={{ fontSize: 12, color: "#64748B" }}>
                        {row.mobile_number || "No mobile"}
                        {row.barangay ? ` · ${row.barangay}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {searched && results.length === 0 && (
                <div style={emptyStyle}>
                  <strong>No existing patient matched “{search.trim()}”.</strong>
                  <span>
                    Check the spelling or try the mobile number. If this really is a
                    first-time patient, register them below — they will get a real
                    account and their login details by SMS.
                  </span>
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep("register")}
                style={secondaryButtonStyle}
              >
                <UserPlus size={16} />
                Register a new patient
              </button>
            </>
          )}

          {step === "register" && (
            <>
              <div style={gridStyle}>
                <label style={fieldStyle}>
                  <span>First name *</span>
                  <input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    style={inputStyle}
                  />
                </label>

                <label style={fieldStyle}>
                  <span>Last name *</span>
                  <input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    style={inputStyle}
                  />
                </label>

                <label style={fieldStyle}>
                  <span>Mobile number *</span>
                  <input
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value)}
                    placeholder="09XXXXXXXXX"
                    style={{
                      ...inputStyle,
                      borderColor: mobile && !mobileValid ? "#FCA5A5" : "#E2E8F0",
                    }}
                  />
                  <small style={hintStyle}>
                    {mobile && !mobileValid
                      ? "Use the 09XXXXXXXXX format."
                      : "Their account details are texted to this number."}
                  </small>
                </label>

                <label style={fieldStyle}>
                  <span>Sex</span>
                  <select
                    value={sex}
                    onChange={(event) => setSex(event.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Not stated</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </label>

                <label style={fieldStyle}>
                  <span>Birthdate</span>
                  <input
                    type="date"
                    value={birthdate}
                    onChange={(event) => setBirthdate(event.target.value)}
                    style={inputStyle}
                  />
                </label>

                <label style={fieldStyle}>
                  <span>Barangay</span>
                  <select
                    value={barangayId}
                    onChange={(event) => setBarangayId(event.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Not stated</option>
                    {barangays.map((barangay) => (
                      <option
                        key={barangay.barangay_id || barangay.name}
                        value={barangay.barangay_id || barangay.name}
                      >
                        {barangay.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label style={fieldStyle}>
                <span>Address</span>
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  style={inputStyle}
                />
              </label>

              <div style={noteStyle}>
                This creates a real patient account. The patient will appear in Patient
                Registry and can sign in to the mobile app with the details texted to them.
              </div>
            </>
          )}

          {step === "desk" && patient && (
            <>
              <div style={patientCardStyle}>
                <CheckCircle2 size={18} color="#0F766E" />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, color: "#0F172A" }}>{patient.full_name}</div>
                  <div style={{ fontSize: 12, color: "#64748B" }}>
                    {patient.patient_id}
                    {patient.mobile_number ? ` · ${patient.mobile_number}` : ""}
                    {createdNow ? " · new account created" : " · existing patient"}
                  </div>
                </div>
              </div>

              <label style={fieldStyle}>
                <span>Service desk *</span>
                <select
                  value={serviceType}
                  onChange={(event) => setServiceType(event.target.value)}
                  style={inputStyle}
                >
                  {WALK_IN_SERVICE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={isEmergency}
                    onChange={(event) => setIsEmergency(event.target.checked)}
                  />
                  Emergency
                </label>

                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={isBhwEndorsed}
                    onChange={(event) => setIsBhwEndorsed(event.target.checked)}
                  />
                  BHW-endorsed
                </label>
              </div>

              <label style={fieldStyle}>
                <span>Notes</span>
                <input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional — reason for visit"
                  style={inputStyle}
                />
              </label>

              <div style={noteStyle}>
                The ticket is issued for RHU {rhuId}. Priority flags are scored by the
                system alongside senior, pregnant, PWD and pediatric rules.
              </div>
            </>
          )}
        </div>

        <div style={footerStyle}>
          <button type="button" onClick={onClose} style={ghostButtonStyle}>
            Cancel
          </button>

          {step === "register" && (
            <button
              type="button"
              onClick={() => void registerPatient()}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? <Loader2 size={16} className="spin" /> : <UserPlus size={16} />}
              Create account
            </button>
          )}

          {step === "desk" && (
            <button
              type="button"
              onClick={() => void issueTicket()}
              disabled={saving}
              style={primaryButtonStyle}
            >
              {saving ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
              Add to queue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "grid",
  placeItems: "center",
  zIndex: 60,
  padding: 24,
};

const cardStyle: CSSProperties = {
  width: "min(720px, 100%)",
  maxHeight: "calc(100vh - 48px)",
  display: "flex",
  flexDirection: "column",
  background: "#FFFFFF",
  borderRadius: 16,
  border: "1px solid #E2E8F0",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "16px 18px",
  borderBottom: "1px solid #E2E8F0",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 900,
  color: "#0F172A",
};

const subtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12,
  color: "#64748B",
};

const bodyStyle: CSSProperties = {
  padding: 18,
  display: "grid",
  gap: 14,
  overflowY: "auto",
};

const footerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  padding: "14px 18px",
  borderTop: "1px solid #E2E8F0",
  background: "#F8FAFC",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 800,
  color: "#334155",
};

const inputStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 600,
  color: "#0F172A",
  background: "#FFFFFF",
  width: "100%",
};

const hintStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "#64748B",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#0F766E",
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  border: "1px solid #5EEAD4",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#F0FDFA",
  color: "#0F766E",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const ghostButtonStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#FFFFFF",
  color: "#334155",
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const closeButtonStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 999,
  width: 32,
  height: 32,
  display: "grid",
  placeItems: "center",
  background: "#FFFFFF",
  color: "#475569",
  cursor: "pointer",
  flex: "0 0 auto",
};

const backButtonStyle: CSSProperties = {
  ...closeButtonStyle,
  width: 28,
  height: 28,
  marginTop: 2,
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  maxHeight: 240,
  overflowY: "auto",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  textAlign: "left",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  padding: "10px 12px",
  background: "#FFFFFF",
  cursor: "pointer",
};

const emptyStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#92400E",
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 12,
  fontWeight: 600,
};

const noteStyle: CSSProperties = {
  border: "1px solid #CCFBF1",
  background: "#F0FDFA",
  color: "#0F766E",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 12,
  fontWeight: 700,
};

const patientCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  border: "1px solid #CCFBF1",
  background: "#F0FDFA",
  borderRadius: 10,
  padding: "12px 14px",
};

const checkboxStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
  cursor: "pointer",
};
