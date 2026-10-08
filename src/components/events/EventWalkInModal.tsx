// src/components/events/EventWalkInModal.tsx
//
// ADD A WALK-IN: someone who came to an event without registering in the app.
//
// Three ways, as on the day:
//   1. Find them in the patient registry (name or mobile number) -- "Came".
//   2. Not found: create their patient account, exactly as the Queue's
//      walk-in form does (POST /admin/users, role resident; they get the
//      welcome SMS and can use the app afterwards). Only roles that may
//      create accounts see this; everyone else is pointed to option 3.
//   3. No account: just a name and barangay. Quick on a crowded day, and for
//      anyone who does not want an account; not linked to a patient record.
//
// The server counts walk-ins on their own in the event report, adds them to
// the event's turnout, and does not take registration slots for them.

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { Search, UserPlus, X } from "lucide-react";

import { addWalkIn, type EventRegistrant } from "../../services/eventRegistrants";
import { searchPrescriptionPatients, type PrescriptionPatient } from "../../services/patients";
import { createUser, getBarangayOptions, type BarangayOption } from "../../services/users";
import { useAuthStore } from "../../store/authStore";
import { useToast } from "../../contexts/ToastContext";

/** The roles the server lets create accounts (routes/api.php, admin/users). */
const ACCOUNT_CREATOR_ROLES = new Set([
  "admin", "staff_admin", "rhu_admin", "mho", "municipal_mayor", "it_staff", "super_admin", "superadmin",
]);

type Mode = "find" | "account" | "name";

export default function EventWalkInModal({
  eventId,
  onClose,
  onAdded,
}: {
  eventId: number;
  onClose: () => void;
  onAdded: (registrant: EventRegistrant) => void;
}) {
  const toast = useToast();
  const user = useAuthStore((state) => state.user) as any;
  const role = String(user?.role_name ?? user?.role?.name ?? user?.role ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const canCreateAccount = ACCOUNT_CREATOR_ROLES.has(role);

  const [mode, setMode] = useState<Mode>("find");
  const [busy, setBusy] = useState(false);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PrescriptionPatient[] | null>(null);

  const [barangays, setBarangays] = useState<BarangayOption[]>([]);
  const [barangayId, setBarangayId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [mobile, setMobile] = useState("");
  const [fullName, setFullName] = useState("");

  useEffect(() => {
    getBarangayOptions().then(setBarangays).catch(() => setBarangays([]));
  }, []);

  const mobileValid = useMemo(() => /^09\d{9}$/.test(mobile.trim()), [mobile]);

  async function find() {
    const keyword = search.trim();
    if (keyword.length < 2) {
      toast.warning("Type at least 2 characters to search.");
      return;
    }
    setBusy(true);
    try {
      setResults(await searchPrescriptionPatients(keyword));
    } catch {
      toast.error("Could not search patients. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function record(person: { user_id: number } | { name: string; barangay_id?: number | null }) {
    setBusy(true);
    try {
      const added = await addWalkIn(eventId, person);
      toast.success(added?.is_walk_in ? "Walk-in added as came." : "They had registered: marked as came.");
      onAdded(added);
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not add the walk-in.");
    } finally {
      setBusy(false);
    }
  }

  async function createAndRecord() {
    if (!firstName.trim() || !lastName.trim()) {
      toast.warning("First and last name are required.");
      return;
    }
    if (!mobileValid) {
      toast.warning("Mobile number must use this format: 09XXXXXXXXX.");
      return;
    }
    const barangay = barangays.find((option) => String(option.barangay_id) === barangayId);
    setBusy(true);
    try {
      const created: any = await createUser({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        mobile_number: mobile.trim(),
        role: "resident",
        account_status: "active",
        barangay_id: barangay && barangay.barangay_id > 0 ? barangay.barangay_id : undefined,
        barangay: barangay?.name || undefined,
      } as any);
      const userId = Number(created?.user_id ?? created?.id ?? 0);
      if (!userId) {
        toast.error("The account was created but could not be read. Search for the person and add them.");
        setBusy(false);
        return;
      }
      await record({ user_id: userId });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Could not create the patient account.");
      setBusy(false);
    }
  }

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Add walk-in">
      <div style={panel}>
        <div style={header}>
          <strong style={{ fontSize: 18 }}>Add walk-in</strong>
          <button type="button" onClick={onClose} style={iconButton} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p style={{ margin: "0 0 12px", color: "#475569" }}>
          Someone who came without registering in the app. They count toward the turnout, not the registration slots.
        </p>

        <div style={tabs}>
          <Tab active={mode === "find"} onClick={() => setMode("find")}>Find patient</Tab>
          <Tab active={mode === "account"} onClick={() => setMode("account")}>New patient account</Tab>
          <Tab active={mode === "name"} onClick={() => setMode("name")}>No account</Tab>
        </div>

        {mode === "find" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void find()}
                placeholder="Name or mobile number"
                style={{ flex: 1 }}
                autoFocus
              />
              <button type="button" className="btn-secondary" onClick={() => void find()} disabled={busy}
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Search size={16} /> Search
              </button>
            </div>
            {results !== null && results.length === 0 ? (
              <p style={{ margin: 0, color: "#64748B" }}>
                Not found. Create their patient account, or record them under "No account".
              </p>
            ) : null}
            {(results ?? []).map((row) => (
              <div key={row.user_id} style={resultRow}>
                <div>
                  <strong>{row.full_name}</strong>
                  <div style={{ color: "#64748B", fontSize: 13 }}>
                    {[row.mobile_number, row.barangay].filter(Boolean).join(" · ") || row.patient_id}
                  </div>
                </div>
                <button type="button" className="btn-primary" disabled={busy}
                  onClick={() => void record({ user_id: row.user_id })}>
                  Came
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {mode === "account" ? (
          canCreateAccount ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(160px, 100%), 1fr))", gap: 8 }}>
                <input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                <input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
              </div>
              <input className="input" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="Mobile number (09XXXXXXXXX)" inputMode="numeric" />
              <BarangaySelect barangays={barangays} value={barangayId} onChange={setBarangayId} />
              <p style={{ margin: 0, color: "#64748B", fontSize: 13 }}>
                They get the welcome text with their sign-in details, the same as a Queue walk-in.
              </p>
              <button type="button" className="btn-primary" disabled={busy} onClick={() => void createAndRecord()}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <UserPlus size={16} /> Create account and mark as came
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, color: "#64748B" }}>
              Your role cannot create patient accounts. Ask an RHU admin or the MHO to create one, or record them
              under "No account" for now.
            </p>
          )
        ) : null}

        {mode === "name" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" autoFocus />
            <BarangaySelect barangays={barangays} value={barangayId} onChange={setBarangayId} />
            <p style={{ margin: 0, color: "#64748B", fontSize: 13 }}>
              Not linked to a patient record. Use a patient account when you can.
            </p>
            <button type="button" className="btn-primary" disabled={busy || fullName.trim().length < 2}
              onClick={() => void record({ name: fullName.trim(), barangay_id: barangayId ? Number(barangayId) : null })}>
              Record as came
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: "8px 12px", borderRadius: 999, border: "1px solid #CBD5E1", cursor: "pointer", fontWeight: 700,
        background: active ? "#0F766E" : "#FFFFFF", color: active ? "#FFFFFF" : "#334155",
      }}>
      {children}
    </button>
  );
}

function BarangaySelect({ barangays, value, onChange }: { barangays: BarangayOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">Barangay</option>
      {barangays.map((option) => (
        <option key={option.barangay_id} value={String(option.barangay_id)}>{option.name}</option>
      ))}
    </select>
  );
}

const overlay: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", display: "grid", placeItems: "center",
  padding: 16, zIndex: 1400,
};
const panel: CSSProperties = {
  width: "min(560px, 100%)", maxHeight: "calc(100vh - 32px)", overflowY: "auto", background: "#FFFFFF",
  borderRadius: 20, padding: 20, boxShadow: "0 24px 60px rgba(15,23,42,.25)",
};
const header: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 };
const iconButton: CSSProperties = { border: 0, background: "transparent", cursor: "pointer", padding: 4 };
const tabs: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 };
const resultRow: CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px",
  border: "1px solid #E2E8F0", borderRadius: 12,
};
