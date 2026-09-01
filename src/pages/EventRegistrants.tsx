// src/pages/EventRegistrants.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { usePagination } from "../hooks/usePagination";
import TablePagination from "../components/ui/TablePagination";
import {
  RefreshCw,
  Users,
  CalendarDays,
  MapPin,
  Clock,
  CheckCircle,
  XCircle,
  ArrowLeft,
} from "lucide-react";

import {
  getEventRegistrants,
  type EventRegistrant,
  type EventRegistrantsResponse,
} from "../services/eventRegistrants";
import { useLangStore } from "../store/langStore";
import { t, type Lang } from "../i18n/translations";

type StatusFilter = "all" | "registered" | "cancelled" | "attended" | "no_show";

function formatDate(value?: string | null) {
  if (!value) return "No date";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "No date";
  }

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusConfig(status: string, lang: Lang) {
  switch (status) {
    case "registered":
      return {
        bg: "#D1FAE5",
        color: "#047857",
        label: t("er_status_registered", lang),
      };

    case "cancelled":
      return {
        bg: "#FEE2E2",
        color: "#B91C1C",
        label: t("er_status_cancelled", lang),
      };

    case "attended":
      return {
        bg: "#DBEAFE",
        color: "#1D4ED8",
        label: t("er_status_attended", lang),
      };

    case "no_show":
      return {
        bg: "#FEF3C7",
        color: "#92400E",
        label: t("er_status_no_show", lang),
      };

    default:
      return {
        bg: "#F3F4F6",
        color: "#4B5563",
        label: status,
      };
  }
}

export default function EventRegistrants() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const lang = useLangStore((state) => state.lang);

  const eventId = Number(id);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [data, setData] = useState<EventRegistrantsResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRegistrants = useCallback(
    async (silent = false) => {
      if (!Number.isFinite(eventId) || eventId <= 0) {
        setError("Invalid event ID.");
        return;
      }

      if (silent) {
        setSyncing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const response = await getEventRegistrants({
          eventId,
          status,
          per_page: 50,
        });

        setData(response);
      } catch (err: any) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to load registrants."
        );
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [eventId, status]
  );

  useEffect(() => {
    loadRegistrants(false);

    const interval = window.setInterval(() => {
      loadRegistrants(true);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [loadRegistrants]);

  // useMemo keeps a stable reference so pagination's reset-on-change fires only
  // when the data actually changes, not on every render.
  const registrants = useMemo<EventRegistrant[]>(() => data?.data ?? [], [data]);
  const event = data?.event;

  // Part 8 — paginate the registrant list.
  const pg = usePagination(registrants, { resetDeps: [registrants] });

  const counts = useMemo(() => {
    return {
      registered: registrants.filter((item) => item.status === "registered")
        .length,
      cancelled: registrants.filter((item) => item.status === "cancelled")
        .length,
      attended: registrants.filter((item) => item.status === "attended").length,
      total: data?.meta?.total ?? registrants.length,
    };
  }, [registrants, data]);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <button
          className="btn-secondary"
          onClick={() => navigate("/cms/events")}
          style={{
            marginBottom: 16,
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <ArrowLeft size={16} />
          {t("er_back", lang)}
        </button>

        <h1
          style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 28,
            color: "#111827",
            marginBottom: 4,
          }}
        >
          {t("er_title", lang)}
        </h1>

        <p style={{ fontSize: 14, color: "#6B7280" }}>
          {t("er_subtitle", lang)}
        </p>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 20,
          display: "grid",
          gridTemplateColumns: "1fr 180px 160px",
          gap: 12,
          alignItems: "center",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 12,
              color: "#6B7280",
              fontWeight: 700,
              marginBottom: 4,
            }}
          >
            {t("er_event_id", lang)}
          </div>

          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#111827",
            }}
          >
            #{eventId}
          </div>
        </div>

        <select
          className="input"
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
        >
          <option value="all">{t("er_filter_all", lang)}</option>
          <option value="registered">{t("er_status_registered", lang)}</option>
          <option value="cancelled">{t("er_status_cancelled", lang)}</option>
          <option value="attended">{t("er_status_attended", lang)}</option>
          <option value="no_show">{t("er_status_no_show", lang)}</option>
        </select>

        <button
          className="btn-secondary"
          onClick={() => loadRegistrants(false)}
          disabled={loading || syncing}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: loading || syncing ? 0.7 : 1,
            cursor: loading || syncing ? "not-allowed" : "pointer",
          }}
        >
          <RefreshCw size={16} />
          {syncing ? t("er_syncing", lang) : t("btn_refresh", lang)}
        </button>
      </div>

      {event && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "flex-start",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#111827",
                  marginBottom: 6,
                }}
              >
                {event.title}
              </h2>

              <div style={{ display: "grid", gap: 6, color: "#6B7280" }}>
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <CalendarDays size={16} />
                  {formatDate(event.event_date)}
                </span>

                {event.location && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <MapPin size={16} />
                    {event.location}
                  </span>
                )}
              </div>
            </div>

            <span className="badge badge-teal">
              {event.event_type.toUpperCase()}
            </span>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div className="stat-card" style={{ display: "flex", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "#D1FAE5",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={22} color="#10B981" />
          </div>

          <div>
            <div
              style={{
                fontSize: 12,
                color: "#6B7280",
                fontWeight: 600,
              }}
            >
              {t("er_stat_registered", lang)}
            </div>

            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {event?.total_registered ?? counts.registered}
            </div>
          </div>
        </div>

        <div className="stat-card" style={{ display: "flex", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "#DBEAFE",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle size={22} color="#3B82F6" />
          </div>

          <div>
            <div
              style={{
                fontSize: 12,
                color: "#6B7280",
                fontWeight: 600,
              }}
            >
              {t("er_stat_attended", lang)}
            </div>

            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {counts.attended}
            </div>
          </div>
        </div>

        <div className="stat-card" style={{ display: "flex", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "#FEE2E2",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <XCircle size={22} color="#EF4444" />
          </div>

          <div>
            <div
              style={{
                fontSize: 12,
                color: "#6B7280",
                fontWeight: 600,
              }}
            >
              {t("er_stat_cancelled", lang)}
            </div>

            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {counts.cancelled}
            </div>
          </div>
        </div>

        <div className="stat-card" style={{ display: "flex", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "#FEF3C7",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Clock size={22} color="#F59E0B" />
          </div>

          <div>
            <div
              style={{
                fontSize: 12,
                color: "#6B7280",
                fontWeight: 600,
              }}
            >
              {t("er_stat_slots", lang)}
            </div>

            <div style={{ fontSize: 26, fontWeight: 800 }}>
              {event?.slots_available ?? "∞"}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
            alignItems: "center",
          }}
        >
          <h3 style={{ fontSize: 18, fontWeight: 800 }}>
            {t("er_queue_title", lang)}
          </h3>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                background: "#10B981",
                borderRadius: "50%",
                display: "inline-block",
                animation: "pulse-dot 2s infinite",
              }}
            />

            <span
              style={{
                fontSize: 12,
                color: "#10B981",
                fontWeight: 700,
              }}
            >
              {t("er_live_sync", lang)}
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ color: "#6B7280" }}>{t("er_loading", lang)}</div>
        ) : error ? (
          <div style={{ color: "#B91C1C", whiteSpace: "pre-line" }}>
            {error}
          </div>
        ) : pg.total === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: 48,
              color: "#6B7280",
            }}
          >
            {t("er_empty", lang)}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid #E5E7EB" }}>
                  <th style={{ textAlign: "left", padding: "12px 8px" }}>
                    {t("er_th_queue", lang)}
                  </th>

                  <th style={{ textAlign: "left", padding: "12px 8px" }}>
                    {t("er_th_name", lang)}
                  </th>

                  <th style={{ textAlign: "left", padding: "12px 8px" }}>
                    {t("er_th_email", lang)}
                  </th>

                  <th style={{ textAlign: "left", padding: "12px 8px" }}>
                    {t("er_th_registered", lang)}
                  </th>

                  <th style={{ textAlign: "left", padding: "12px 8px" }}>
                    {t("er_th_status", lang)}
                  </th>
                </tr>
              </thead>

              <tbody>
                {pg.pageRows.map((registrant) => {
                  const cfg = statusConfig(registrant.status, lang);

                  return (
                    <tr
                      key={registrant.id}
                      style={{ borderBottom: "1px solid #F3F4F6" }}
                    >
                      <td
                        style={{
                          padding: "12px 8px",
                          fontFamily: "'JetBrains Mono', monospace",
                          fontWeight: 900,
                          color: "#0F766E",
                        }}
                      >
                        {registrant.queue_number || "—"}
                      </td>

                      <td style={{ padding: "12px 8px", fontWeight: 700 }}>
                        {registrant.name}
                      </td>

                      <td style={{ padding: "12px 8px", color: "#6B7280" }}>
                        {registrant.email || t("lbl_no_email", lang)}
                      </td>

                      <td style={{ padding: "12px 8px", color: "#6B7280" }}>
                        {formatDate(registrant.registered_at)}
                      </td>

                      <td style={{ padding: "12px 8px" }}>
                        <span
                          style={{
                            background: cfg.bg,
                            color: cfg.color,
                            padding: "5px 9px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !error && pg.total > 0 ? (
          <TablePagination
            page={pg.page}
            pageCount={pg.pageCount}
            total={pg.total}
            from={pg.from}
            to={pg.to}
            pageSize={pg.pageSize}
            onPage={pg.setPage}
            onPageSize={pg.setPageSize}
            label="registrants"
          />
        ) : null}
      </div>
    </div>
  );
}