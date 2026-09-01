// src/pages/PatientRegistry.tsx
// Patient Registry — the browsable "front door" list of active patients that
// links into the already-built individual Patient Profile page. Server-paginated
// and RHU-scoped by the backend (facility-locked staff see only their RHU).

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Search, Eye, RefreshCw } from "lucide-react";
import { color, radius } from "../theme/tokens";
import TablePagination from "../components/ui/TablePagination";
import { emitToast } from "../lib/toastBus";
import {
  getPatientRegistry,
  type RegistryPatient,
  type RegistryMeta,
} from "../services/patientRegistry";

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function shortText(value: string | null | undefined, max = 42): string {
  const s = String(value ?? "").trim();
  if (s === "") return "—";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

const PER_PAGE = 20;

export default function PatientRegistry() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<RegistryPatient[]>([]);
  const [meta, setMeta] = useState<RegistryMeta>({
    current_page: 1,
    last_page: 1,
    total: 0,
    per_page: PER_PAGE,
  });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (searchTerm: string, targetPage: number) => {
    setLoading(true);
    try {
      const { data, meta: m } = await getPatientRegistry({
        search: searchTerm,
        page: targetPage,
        per_page: PER_PAGE,
      });
      setRows(data);
      setMeta(m);
    } catch (e: any) {
      emitToast(e?.response?.data?.message || "Could not load the patient registry.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search (mirrors the Appointments board pattern); reset to page 1.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1);
      load(search, 1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search, load]);

  const goToPage = (p: number) => {
    setPage(p);
    load(search, p);
  };

  const from = meta.total === 0 ? 0 : (meta.current_page - 1) * meta.per_page + 1;
  const to = Math.min(meta.current_page * meta.per_page, meta.total);

  return (
    <div style={{ padding: 20, maxWidth: "100%" }}>
      {/* HEADER */}
      <div style={{ marginBottom: 16, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={iconChipStyle}>
          <Users size={22} />
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#0F172A" }}>
            Patient Registry
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, color: color.textMuted }}>
            Browse and search active patients, then open a profile for full history.
            {meta.total > 0 ? ` · ${meta.total} patient(s)` : ""}
          </p>
        </div>
      </div>

      {/* SEARCH */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <Search
            size={16}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by patient name or mobile number…"
            style={{
              width: "100%",
              height: 44,
              padding: "0 12px 0 36px",
              borderRadius: radius.md,
              border: `1px solid ${color.line}`,
              fontSize: 13.5,
              outline: "none",
              color: "#0F172A",
            }}
          />
        </div>
        <button type="button" onClick={() => load(search, page)} style={refreshBtnStyle}>
          <RefreshCw size={16} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* TABLE */}
      <div style={{ border: `1px solid ${color.line}`, borderRadius: radius.lg ?? 16, background: color.surface, overflow: "hidden" }}>
        <div className="table-wrapper" style={{ border: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Barangay</th>
                <th>Age / Sex</th>
                <th>Last Visit</th>
                <th>Most Recent Diagnosis</th>
                <th style={{ textAlign: "center" }}>Total Visits</th>
                <th style={{ textAlign: "center" }}>Follow-ups</th>
                <th style={{ textAlign: "right" }}>Profile</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={emptyCellStyle}>Loading patients…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={emptyCellStyle}>
                    {search ? "No patients match your search." : "No active patients found for your RHU."}
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <tr key={p.user_id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => navigate(`/patients/${p.user_id}`)}
                        style={nameLinkStyle}
                        title="View patient profile"
                      >
                        {p.name}
                      </button>
                      <div style={{ fontSize: 11.5, color: color.textMuted }}>
                        {p.mobile_number || "No mobile"}
                        {p.rhu_id ? ` · RHU ${p.rhu_id}` : ""}
                      </div>
                    </td>
                    <td>{p.barangay || "—"}</td>
                    <td>
                      {p.age != null ? `${p.age} yrs` : "—"}
                      {p.sex ? ` · ${p.sex}` : ""}
                    </td>
                    <td>{fmtDate(p.last_visit)}</td>
                    <td title={p.recent_diagnosis ?? ""}>{shortText(p.recent_diagnosis)}</td>
                    <td style={{ textAlign: "center", fontWeight: 800 }}>{p.total_visits}</td>
                    <td style={{ textAlign: "center" }}>
                      {p.follow_ups > 0 ? (
                        <span style={followPillStyle}>{p.follow_ups}</span>
                      ) : (
                        <span style={{ color: color.textMuted }}>0</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/patients/${p.user_id}`)}
                        style={viewBtnStyle}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#0F766E";
                          e.currentTarget.style.color = "#fff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#F0FDFA";
                          e.currentTarget.style.color = "#0F766E";
                        }}
                      >
                        <Eye size={14} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div style={{ padding: "10px 16px" }}>
          <TablePagination
            page={meta.current_page}
            pageCount={meta.last_page}
            total={meta.total}
            from={from}
            to={to}
            pageSize={meta.per_page}
            onPage={goToPage}
          />
        </div>
      </div>
    </div>
  );
}

const iconChipStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 12,
  background: "#F0FDFA",
  color: "#0F766E",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
};

const refreshBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 44,
  padding: "0 16px",
  borderRadius: radius.md,
  border: `1px solid ${color.line}`,
  background: color.surface,
  color: color.slateFg,
  fontSize: 13,
  fontWeight: 800,
  cursor: "pointer",
};

const nameLinkStyle: React.CSSProperties = {
  border: "none",
  background: "none",
  padding: 0,
  color: "#0F766E",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
  textAlign: "left",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

const viewBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
  padding: "6px 14px",
  borderRadius: 999,
  border: "1px solid #99F6E4",
  background: "#F0FDFA",
  color: "#0F766E",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
  transition: "background 0.15s ease, color 0.15s ease",
};

const followPillStyle: React.CSSProperties = {
  display: "inline-block",
  minWidth: 22,
  padding: "2px 8px",
  borderRadius: 999,
  background: "#FEF3C7",
  color: "#92400E",
  fontSize: 12,
  fontWeight: 800,
};

const emptyCellStyle: React.CSSProperties = {
  textAlign: "center",
  padding: 28,
  color: color.textMuted,
};
