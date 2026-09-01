// src/pages/PublicEvents.tsx

import { useEffect, useMemo, useState } from "react";
import apiClient from "../lib/apiClient";
import { emitToast } from "../lib/toastBus";
import type { Event, EventType } from "../types/cms";
import { EVENT_TYPE_CONFIG } from "../types/cms";
import { useLangStore } from "../store/langStore";
import { t, type Lang } from "../i18n/translations";

type EventCategory =
  | "immunization"
  | "medical_mission"
  | "maternal_health"
  | "dental"
  | "nutrition"
  | "general"
  | "other";

interface PublicEvent extends Event {
  category?: EventCategory | string | null;
  is_registered?: boolean;
}

const fallbackEvents: PublicEvent[] = [
  {
    id: 1,
    title: "Community Immunization Program",
    description:
      "Free immunization program for eligible children and residents. Please bring your valid ID and health record if available.",
    event_type: "program",
    category: "immunization",
    event_date: new Date(Date.now() + 86400000 * 5).toISOString(),
    location: "RHU 1 Malasiqui",
    target_audience: "Children, parents, and guardians",
    max_slots: 100,
    slots_available: 80,
    total_registered: 20,
    is_published: true,
    published_at: new Date().toISOString(),
  },
  {
    id: 2,
    title: "Medical Mission",
    description:
      "General checkup and basic consultation for Malasiqui residents.",
    event_type: "event",
    category: "medical_mission",
    event_date: new Date(Date.now() + 86400000 * 10).toISOString(),
    location: "Barangay Health Center",
    target_audience: "All residents",
    max_slots: 150,
    slots_available: 120,
    total_registered: 30,
    is_published: true,
    published_at: new Date().toISOString(),
  },
  {
    id: 3,
    title: "Health Advisory",
    description:
      "Reminder to drink enough water, maintain hygiene, and visit the RHU for persistent symptoms.",
    event_type: "announcement",
    category: "general",
    event_date: new Date().toISOString(),
    location: "Online Announcement",
    target_audience: "All residents",
    max_slots: null,
    slots_available: null,
    total_registered: 0,
    is_published: true,
    published_at: new Date().toISOString(),
  },
];

function normalizeEvents(payload: any): PublicEvent[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.events)) return payload.events;

  return [];
}

function formatDate(value?: string | null, lang?: Lang): string {
  if (!value) return t("pe_no_date", lang ?? "en");

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return t("pe_no_date", lang ?? "en");
  }

  return date.toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getTypeConfig(type?: EventType | string | null) {
  if (type === "program") return EVENT_TYPE_CONFIG.program;
  if (type === "announcement") return EVENT_TYPE_CONFIG.announcement;

  return EVENT_TYPE_CONFIG.event;
}

function getTypeLabel(type: EventType | string | null | undefined, lang: Lang) {
  switch (type) {
    case "program":
      return t("cms_ev_label_program", lang);
    case "announcement":
      return t("cms_ev_label_announcement", lang);
    case "event":
    default:
      return t("cms_ev_label_event", lang);
  }
}

function getCategoryKey(category?: string | null): string {
  switch (category) {
    case "immunization":
      return "pe_cat_immunization";
    case "medical_mission":
      return "pe_cat_medical_mission";
    case "maternal_health":
      return "pe_cat_maternal_health";
    case "dental":
      return "pe_cat_dental";
    case "nutrition":
      return "pe_cat_nutrition";
    case "general":
      return "pe_cat_general";
    case "other":
      return "pe_cat_other";
    default:
      return "pe_cat_general";
  }
}

function isUpcoming(event: PublicEvent): boolean {
  if (!event.event_date && !event.starts_at) return false;

  const rawDate = event.event_date || event.starts_at;
  const date = new Date(rawDate || "");

  if (Number.isNaN(date.getTime())) return false;

  return date.getTime() >= Date.now();
}

export default function PublicEvents() {
  const lang = useLangStore((state) => state.lang);

  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [registeringId, setRegisteringId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | EventType>("all");
  const [error, setError] = useState<string | null>(null);

  async function loadEvents() {
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.get("/programs", {
        params: {
          per_page: 50,
        },
      });

      const list = normalizeEvents(res.data);

      setEvents(list.length > 0 ? list : fallbackEvents);
    } catch (err: any) {
      console.error("Public events fetch error:", err);

      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Unable to fetch events. Showing sample events."
      );

      setEvents(fallbackEvents);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  const filteredEvents = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return events.filter((event) => {
      const matchesType = filter === "all" || event.event_type === filter;

      const searchableText = [
        event.title,
        event.description,
        event.location,
        event.target_audience,
        event.category,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = keyword ? searchableText.includes(keyword) : true;

      return matchesType && matchesSearch;
    });
  }, [events, search, filter]);

  const totalUpcoming = events.filter(isUpcoming).length;
  const totalPublished = events.filter((event) => event.is_published).length;

  async function registerForEvent(event: PublicEvent) {
    setRegisteringId(event.id);

    try {
      await apiClient.post(`/programs/${event.id}/register`);

      setEvents((prev) =>
        prev.map((item) =>
          item.id === event.id
            ? {
                ...item,
                is_registered: true,
                total_registered: (item.total_registered ?? 0) + 1,
                slots_available:
                  item.slots_available !== null &&
                  item.slots_available !== undefined
                    ? Math.max(0, item.slots_available - 1)
                    : item.slots_available,
              }
            : item
        )
      );

      emitToast(t("pe_register_ok", useLangStore.getState().lang), "success");
    } catch (err: any) {
      emitToast(
        err?.response?.data?.message ||
          err?.message ||
          t("pe_register_err", useLangStore.getState().lang),
        "error"
      );
    } finally {
      setRegisteringId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section
        style={{
          background:
            "linear-gradient(135deg, #0F766E 0%, #14B8A6 55%, #5EEAD4 100%)",
          borderRadius: 24,
          padding: 26,
          color: "white",
          boxShadow: "0 18px 40px rgba(15, 118, 110, 0.22)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900 }}>
          {t("pe_title", lang)}
        </h1>

        <p style={{ margin: "8px 0 0", maxWidth: 760, lineHeight: 1.7 }}>
          {t("pe_subtitle", lang)}
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: 14,
            marginTop: 22,
          }}
        >
          <Stat
            label={t("pe_stat_published", lang)}
            value={String(totalPublished)}
          />
          <Stat
            label={t("pe_stat_upcoming", lang)}
            value={String(totalUpcoming)}
          />
          <Stat label={t("pe_stat_total", lang)} value={String(events.length)} />
        </div>
      </section>

      <section
        style={{
          background: "white",
          border: "1px solid #E5E7EB",
          borderRadius: 18,
          padding: 18,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("pe_search_ph", lang)}
          style={{
            flex: "1 1 280px",
            border: "1px solid #CBD5E1",
            borderRadius: 12,
            padding: "12px 14px",
            fontFamily: "inherit",
          }}
        />

        <select
          value={filter}
          onChange={(event) =>
            setFilter(event.target.value as "all" | EventType)
          }
          style={{
            border: "1px solid #CBD5E1",
            borderRadius: 12,
            padding: "12px 14px",
            fontFamily: "inherit",
            minWidth: 180,
          }}
        >
          <option value="all">{t("pe_filter_all", lang)}</option>
          <option value="program">{t("pe_filter_programs", lang)}</option>
          <option value="event">{t("pe_filter_events", lang)}</option>
          <option value="announcement">
            {t("pe_filter_announcements", lang)}
          </option>
        </select>

        <button onClick={loadEvents} style={secondaryButton}>
          {t("btn_refresh", lang)}
        </button>
      </section>

      {error && (
        <div
          style={{
            background: "#FFF7ED",
            border: "1px solid #FDBA74",
            color: "#9A3412",
            borderRadius: 14,
            padding: 14,
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={cardStyle}>{t("pe_loading", lang)}</div>
      ) : filteredEvents.length === 0 ? (
        <div style={cardStyle}>{t("pe_empty", lang)}</div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 18,
          }}
        >
          {filteredEvents.map((event) => {
            const cfg = getTypeConfig(event.event_type);
            const upcoming = isUpcoming(event);
            const isRegistered = event.is_registered;
            const isFull =
              event.slots_available !== null &&
              event.slots_available !== undefined &&
              event.slots_available <= 0;

            return (
              <article key={event.id} style={cardStyle}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "flex-start",
                    marginBottom: 12,
                  }}
                >
                  <span
                    style={{
                      background: cfg.bg,
                      color: cfg.color,
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 900,
                      textTransform: "capitalize",
                    }}
                  >
                    {getTypeLabel(event.event_type, lang)}
                  </span>

                  <span
                    style={{
                      background: upcoming ? "#DCFCE7" : "#F1F5F9",
                      color: upcoming ? "#166534" : "#475569",
                      borderRadius: 999,
                      padding: "6px 10px",
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {upcoming ? t("pe_upcoming", lang) : t("pe_posted", lang)}
                  </span>
                </div>

                <h2
                  style={{
                    margin: "0 0 8px",
                    color: "#0F172A",
                    fontSize: 20,
                    lineHeight: 1.3,
                  }}
                >
                  {event.title}
                </h2>

                <p
                  style={{
                    margin: 0,
                    color: "#64748B",
                    lineHeight: 1.7,
                    minHeight: 76,
                  }}
                >
                  {event.description}
                </p>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    marginTop: 16,
                    color: "#334155",
                    fontSize: 14,
                  }}
                >
                  <Info
                    label={t("pe_label_date", lang)}
                    value={formatDate(event.event_date || event.starts_at, lang)}
                  />

                  <Info
                    label={t("pe_label_location", lang)}
                    value={event.location || t("pe_no_location", lang)}
                  />

                  <Info
                    label={t("pe_label_category", lang)}
                    value={t(getCategoryKey(event.category), lang)}
                  />

                  <Info
                    label={t("pe_label_slots", lang)}
                    value={
                      event.max_slots
                        ? t("pe_registered_count", lang, {
                            registered: String(event.total_registered ?? 0),
                            max: String(event.max_slots),
                          })
                        : t("pe_no_slot_limit", lang)
                    }
                  />
                </div>

                <button
                  disabled={registeringId === event.id || isRegistered || isFull}
                  onClick={() => registerForEvent(event)}
                  style={{
                    ...buttonStyle,
                    width: "100%",
                    marginTop: 18,
                    opacity:
                      registeringId === event.id || isRegistered || isFull
                        ? 0.65
                        : 1,
                    cursor:
                      registeringId === event.id || isRegistered || isFull
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {registeringId === event.id
                    ? t("pe_registering", lang)
                    : isRegistered
                    ? t("pe_already_registered", lang)
                    : isFull
                    ? t("pe_slots_full", lang)
                    : t("pe_register", lang)}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.18)",
        border: "1px solid rgba(255,255,255,0.24)",
        borderRadius: 16,
        padding: 14,
      }}
    >
      <div style={{ fontSize: 13, opacity: 0.85 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <strong style={{ color: "#0F172A" }}>{label}: </strong>
      <span>{value}</span>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 10px 20px rgba(15,23,42,0.04)",
};

const buttonStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 12,
  padding: "12px 16px",
  background: "#0D9488",
  color: "white",
  fontWeight: 900,
};

const secondaryButton: React.CSSProperties = {
  border: "1px solid #0D9488",
  borderRadius: 12,
  padding: "11px 16px",
  background: "#F0FDFA",
  color: "#0F766E",
  fontWeight: 900,
  cursor: "pointer",
};
