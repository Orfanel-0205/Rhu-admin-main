// src/pages/HealthServices.tsx
//
// Administration → Health Services. The screen that lets an MHO or super admin
// add a service the RHU has started offering, or switch off one it has
// stopped, without waiting for a developer.
//
// Before this, the list was ten strings hardcoded in eight backend files and
// again in the admin. Starting Animal Bite Treatment meant a code change and a
// deployment; in the meantime staff queued those patients under OPD
// Consultation, where they are indistinguishable in every report.
//
// Two things on this screen are deliberately not editable, and the page says
// why rather than just disabling them:
//
//   - the code, because queue tickets store it; changing it would orphan every
//     ticket ever issued for the service;
//   - deletion, because a service with tickets cannot be removed without
//     orphaning them either. Switching it off does what anyone actually wants:
//     staff stop seeing it, old tickets stay readable.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  Check,
  Loader2,
  Plus,
  RefreshCw,
  Stethoscope,
  X,
} from "lucide-react";

import {
  createQueueService,
  getQueueServices,
  updateQueueService,
  type QueueServiceRow,
} from "../services/queueServices";

interface DraftState {
  name: string;
  helper: string;
  ticket_prefix: string;
}

const EMPTY_DRAFT: DraftState = { name: "", helper: "", ticket_prefix: "" };

/**
 * Suggest a prefix from the name so the field is not a puzzle: "Animal Bite
 * Treatment" offers ABT. Still editable, because the RHU may have its own
 * convention.
 */
function suggestPrefix(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "";

  if (words.length === 1) {
    return words[0].replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase();
  }

  return words
    .map((word) => word.replace(/[^A-Za-z0-9]/g, "").charAt(0))
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function backendError(err: any, fallback: string): string {
  const errors = err?.response?.data?.errors;

  if (errors && typeof errors === "object") {
    const first = Object.values(errors)[0];
    if (Array.isArray(first) && first.length > 0) return String(first[0]);
  }

  return err?.response?.data?.message || err?.message || fallback;
}

export default function HealthServices() {
  const [rows, setRows] = useState<QueueServiceRow[]>([]);
  const [managed, setManaged] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const result = await getQueueServices();

      setRows(result.rows);
      setManaged(result.managed);
    } catch (err: any) {
      setError(backendError(err, "Could not load the service list."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = useMemo(
    () => rows.filter((row) => row.is_active).length,
    [rows]
  );

  async function onAdd() {
    const name = draft.name.trim();
    const prefix = (draft.ticket_prefix || suggestPrefix(name)).trim();

    if (!name) {
      setError("Give the service a name staff will recognise.");
      return;
    }

    if (!prefix) {
      setError("A ticket prefix is needed — it is printed on every ticket.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      await createQueueService({
        name,
        helper: draft.helper.trim() || undefined,
        ticket_prefix: prefix,
      });

      setNotice(`"${name}" is now available in Queue Management.`);
      setDraft(EMPTY_DRAFT);
      setPrefixTouched(false);
      setAdding(false);

      await load();
    } catch (err: any) {
      setError(backendError(err, "Could not add the service."));
    } finally {
      setSaving(false);
    }
  }

  async function onToggle(row: QueueServiceRow) {
    if (row.id === null) return;

    setBusyId(row.id);
    setError("");
    setNotice("");

    try {
      await updateQueueService(row.id, { is_active: !row.is_active });

      setNotice(
        row.is_active
          ? `"${row.name}" is switched off. Existing tickets still show it.`
          : `"${row.name}" is available again.`
      );

      await load();
    } catch (err: any) {
      setError(backendError(err, "Could not update the service."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={pageStyle}>
      <header style={heroStyle}>
        <div>
          <p style={eyebrowStyle}>KA-AGAPAY ADMINISTRATION</p>
          <h1 style={titleStyle}>Health Services</h1>
          <p style={leadStyle}>
            What the RHU queues patients for. Adding a service here makes it
            selectable in Queue Management straight away, with its own ticket
            numbers and its own line in the reports.
          </p>
        </div>

        <button type="button" onClick={load} disabled={loading} style={refreshStyle}>
          <RefreshCw size={17} />
          {loading ? "Loading..." : "Refresh"}
        </button>
      </header>

      {!managed && !loading ? (
        <section style={warningStyle}>
          <AlertTriangle size={20} />
          <div>
            <strong>Read-only on this server</strong>
            <p style={warningTextStyle}>
              The service catalogue has not been migrated here yet, so this is
              showing the ten built-in services. They work normally; they just
              cannot be changed until the migration runs.
            </p>
          </div>
        </section>
      ) : null}

      {error ? (
        <section style={errorStyle}>
          <AlertTriangle size={20} />
          <span>{error}</span>
        </section>
      ) : null}

      {notice ? (
        <section style={noticeStyle}>
          <Check size={20} />
          <span>{notice}</span>
        </section>
      ) : null}

      {managed ? (
        <section style={cardStyle}>
          {adding ? (
            <div style={formStyle}>
              <div style={formRowStyle}>
                <label style={fieldStyle}>
                  <span style={labelStyle}>Service name</span>
                  <input
                    className="input"
                    value={draft.name}
                    autoFocus
                    placeholder="e.g. Animal Bite Treatment"
                    onChange={(event) => {
                      const name = event.target.value;

                      setDraft((prev) => ({
                        ...prev,
                        name,
                        ticket_prefix: prefixTouched
                          ? prev.ticket_prefix
                          : suggestPrefix(name),
                      }));
                    }}
                  />
                </label>

                <label style={prefixFieldStyle}>
                  <span style={labelStyle}>Ticket prefix</span>
                  <input
                    className="input"
                    value={draft.ticket_prefix}
                    maxLength={8}
                    placeholder="ABT"
                    onChange={(event) => {
                      setPrefixTouched(true);
                      setDraft((prev) => ({
                        ...prev,
                        ticket_prefix: event.target.value.toUpperCase(),
                      }));
                    }}
                  />
                </label>
              </div>

              <label style={fieldStyle}>
                <span style={labelStyle}>Who it is for (optional)</span>
                <input
                  className="input"
                  value={draft.helper}
                  placeholder="One line staff will see under the service name"
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, helper: event.target.value }))
                  }
                />
              </label>

              <p style={hintStyle}>
                Tickets will read{" "}
                <strong>
                  R1-{draft.ticket_prefix || suggestPrefix(draft.name) || "ABT"}
                  -{new Date().toISOString().slice(2, 10).replace(/-/g, "")}-0001
                </strong>
                . The prefix cannot be changed once tickets carry it.
              </p>

              <div style={formActionsStyle}>
                <button
                  type="button"
                  onClick={onAdd}
                  disabled={saving}
                  style={primaryButtonStyle}
                >
                  {saving ? <Loader2 size={16} /> : <Plus size={16} />}
                  {saving ? "Adding..." : "Add service"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setDraft(EMPTY_DRAFT);
                    setPrefixTouched(false);
                    setError("");
                  }}
                  style={ghostButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              style={primaryButtonStyle}
            >
              <Plus size={17} />
              Add a service
            </button>
          )}
        </section>
      ) : null}

      <section style={cardStyle}>
        <div style={cardHeadStyle}>
          <div>
            <h2 style={cardTitleStyle}>Services</h2>
            <p style={cardSubtitleStyle}>
              {activeCount} switched on, {rows.length - activeCount} off.
              Switched-off services disappear from Queue Management; tickets
              already issued for them keep working.
            </p>
          </div>

          <Stethoscope size={22} />
        </div>

        {loading ? (
          <div style={emptyStyle}>
            <RefreshCw size={24} />
            <span>Loading services...</span>
          </div>
        ) : rows.length === 0 ? (
          <div style={emptyStyle}>
            <Stethoscope size={24} />
            <span>No services yet.</span>
          </div>
        ) : (
          <div style={listStyle}>
            {rows.map((row) => (
              <article
                key={row.code}
                style={rowStyle(row.is_active)}
              >
                <div style={rowMainStyle}>
                  <div style={rowHeadStyle}>
                    <strong style={rowNameStyle}>{row.name}</strong>

                    <span style={prefixBadgeStyle}>{row.ticket_prefix}</span>

                    {!row.is_active ? (
                      <span style={offBadgeStyle}>Switched off</span>
                    ) : null}
                  </div>

                  {row.helper ? (
                    <p style={rowHelperStyle}>{row.helper}</p>
                  ) : null}

                  <p style={rowMetaStyle}>
                    {row.ticket_count > 0
                      ? `${row.ticket_count} ticket${
                          row.ticket_count === 1 ? "" : "s"
                        } issued`
                      : "No tickets yet"}
                  </p>
                </div>

                {managed && row.editable ? (
                  <button
                    type="button"
                    onClick={() => onToggle(row)}
                    disabled={busyId === row.id}
                    style={row.is_active ? offButtonStyle : onButtonStyle}
                  >
                    {busyId === row.id ? (
                      <Loader2 size={15} />
                    ) : row.is_active ? (
                      <X size={15} />
                    ) : (
                      <Check size={15} />
                    )}
                    {row.is_active ? "Switch off" : "Switch on"}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const pageStyle: CSSProperties = {
  display: "grid",
  gap: 16,
  padding: 20,
};

const heroStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  padding: "22px 24px",
  borderRadius: 20,
  background: "linear-gradient(135deg, #0B5F53 0%, #14B8A6 100%)",
  color: "#FFFFFF",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 1.1,
  opacity: 0.85,
};

const titleStyle: CSSProperties = {
  margin: "6px 0 8px",
  fontSize: 28,
  fontWeight: 900,
};

const leadStyle: CSSProperties = {
  margin: 0,
  maxWidth: 640,
  fontSize: 13.5,
  lineHeight: 1.5,
  opacity: 0.94,
};

const refreshStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 18px",
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,.45)",
  background: "rgba(255,255,255,.14)",
  color: "#FFFFFF",
  fontWeight: 800,
  cursor: "pointer",
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  padding: 18,
  borderRadius: 18,
  border: "1px solid #E2E8F0",
  background: "#FFFFFF",
};

const cardHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  color: "#0F766E",
};

const cardTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 17,
  fontWeight: 900,
  color: "#0F172A",
};

const cardSubtitleStyle: CSSProperties = {
  margin: "5px 0 0",
  maxWidth: 620,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: "#64748B",
};

const formStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const formRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  flex: "1 1 260px",
  minWidth: 0,
};

const prefixFieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  flex: "0 0 140px",
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "#64748B",
};

const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: "#475569",
};

const formActionsStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const primaryButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 20px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 900,
  fontSize: 13.5,
  cursor: "pointer",
  justifySelf: "start",
};

const ghostButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 20px",
  borderRadius: 999,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  fontWeight: 800,
  fontSize: 13.5,
  cursor: "pointer",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: 10,
};

function rowStyle(active: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    flexWrap: "wrap",
    padding: "13px 16px",
    borderRadius: 14,
    border: "1px solid #E2E8F0",
    background: active ? "#FFFFFF" : "#F8FAFC",
    opacity: active ? 1 : 0.78,
  };
}

const rowMainStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  flex: "1 1 260px",
  minWidth: 0,
};

const rowHeadStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const rowNameStyle: CSSProperties = {
  fontSize: 14.5,
  fontWeight: 900,
  color: "#0F172A",
};

const prefixBadgeStyle: CSSProperties = {
  padding: "2px 9px",
  borderRadius: 999,
  background: "#CCFBF1",
  color: "#0F766E",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.4,
};

const offBadgeStyle: CSSProperties = {
  padding: "2px 9px",
  borderRadius: 999,
  background: "#FEE2E2",
  color: "#B91C1C",
  fontSize: 11,
  fontWeight: 800,
};

const rowHelperStyle: CSSProperties = {
  margin: 0,
  fontSize: 12.5,
  color: "#475569",
};

const rowMetaStyle: CSSProperties = {
  margin: 0,
  fontSize: 11.5,
  fontWeight: 700,
  color: "#94A3B8",
};

const offButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 16px",
  borderRadius: 999,
  border: "1px solid #FCA5A5",
  background: "#FFFFFF",
  color: "#B91C1C",
  fontWeight: 800,
  fontSize: 12.5,
  cursor: "pointer",
};

const onButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "9px 16px",
  borderRadius: 999,
  border: "1px solid #99F6E4",
  background: "#FFFFFF",
  color: "#0F766E",
  fontWeight: 800,
  fontSize: 12.5,
  cursor: "pointer",
};

const emptyStyle: CSSProperties = {
  display: "grid",
  justifyItems: "center",
  gap: 8,
  padding: "34px 12px",
  color: "#64748B",
  fontWeight: 700,
  fontSize: 13,
};

const warningStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  color: "#92400E",
};

const warningTextStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const errorStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 16px",
  borderRadius: 14,
  border: "1px solid #FCA5A5",
  background: "#FEF2F2",
  color: "#B91C1C",
  fontSize: 13,
  fontWeight: 700,
};

const noticeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "13px 16px",
  borderRadius: 14,
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
  color: "#0F766E",
  fontSize: 13,
  fontWeight: 700,
};
