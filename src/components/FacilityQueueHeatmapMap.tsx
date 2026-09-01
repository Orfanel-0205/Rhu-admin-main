import "leaflet/dist/leaflet.css";
import React from "react";
import { useEffect, useRef } from "react";
import { Building2, CalendarClock, UsersRound } from "lucide-react";
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { FacilityHeatmapEvent, FacilityHeatmapFacility, PressureLevel } from "../services/facilityHeatmap";

type Props = {
  facilities: FacilityHeatmapFacility[];
  events: FacilityHeatmapEvent[];
};

const CENTER: [number, number] = [15.9492, 120.3942];

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const LEAFLET_CHROME_CSS = `
  .ka-leaflet-shell .leaflet-control-zoom {
    border: none !important;
    border-radius: 14px !important;
    overflow: hidden;
    box-shadow: 0 10px 24px rgba(15,23,42,.16) !important;
    margin: 12px !important;
  }
  .ka-leaflet-shell .leaflet-control-zoom a {
    width: 34px !important;
    height: 34px !important;
    line-height: 34px !important;
    background: #FFFFFF !important;
    color: #0F766E !important;
    font-weight: 800 !important;
    border: none !important;
  }
  .ka-leaflet-shell .leaflet-control-zoom a:hover {
    background: #F0FDFA !important;
  }
  .ka-leaflet-shell .leaflet-control-zoom-in {
    border-bottom: 1px solid #E2E8F0 !important;
  }
  .ka-leaflet-shell .leaflet-bar {
    border: none !important;
  }
  .ka-leaflet-shell .leaflet-tooltip {
    background: #0B4F4A !important;
    color: #FFFFFF !important;
    border: none !important;
    border-radius: 999px !important;
    padding: 6px 13px !important;
    font-weight: 800 !important;
    font-size: 12px !important;
    box-shadow: 0 10px 22px rgba(11,79,74,.28) !important;
  }
  .ka-leaflet-shell .leaflet-tooltip-top:before {
    border-top-color: #0B4F4A !important;
  }
  .ka-leaflet-shell .leaflet-popup-content-wrapper {
    border-radius: 18px !important;
    box-shadow: 0 20px 48px rgba(15,23,42,.2) !important;
  }
  .ka-leaflet-shell .leaflet-popup-content {
    margin: 16px !important;
  }
  .ka-leaflet-shell .leaflet-popup-tip {
    box-shadow: none !important;
  }
  .ka-leaflet-shell .leaflet-popup-close-button {
    color: #0F766E !important;
  }
  .ka-leaflet-shell .leaflet-control-attribution {
    background: rgba(255,255,255,.82) !important;
    border-radius: 999px !important;
    padding: 2px 9px !important;
    font-size: 10px !important;
  }
  .ka-leaflet-shell .leaflet-container {
    background: #EAF7F5 !important;
  }
  .ka-leaflet-shell .leaflet-tile-pane {
    filter: saturate(1.28) contrast(1.04) brightness(.99);
  }
  .ka-leaflet-shell:after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 420;
    pointer-events: none;
    background:
      radial-gradient(circle at 48% 48%, rgba(16,185,129,.16), transparent 30%),
      linear-gradient(180deg, rgba(240,253,250,.2), rgba(255,255,255,0));
    mix-blend-mode: multiply;
  }
`;

function MapFocus({
  facilities,
  selectedRhu,
}: {
  facilities: FacilityHeatmapFacility[];
  selectedRhu: number;
}) {
  const map = useMap();
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastRef.current === selectedRhu) return;
    lastRef.current = selectedRhu;

    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      try {
        map.invalidateSize({ animate: false });

        if (selectedRhu === 1 || selectedRhu === 2) {
          const facility = facilities.find((f) => f.id === selectedRhu);
          if (facility) {
            map.flyTo([facility.latitude, facility.longitude], 14, {
              animate: true,
              duration: 0.7,
            });
            return;
          }
        }

        if (facilities.length > 0) {
          const bounds = facilities.map(
            (f) => [f.latitude, f.longitude] as [number, number]
          );
          map.fitBounds(bounds, { padding: [70, 70], maxZoom: 13, animate: true });
        }
      } catch {
        // Map pane not ready — ignore; re-runs on the next RHU selection.
      }
    };

    const frame = window.requestAnimationFrame(() => map.whenReady(run));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [map, selectedRhu, facilities]);

  return null;
}

function ResizeInvalidator() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (!container || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      try {
        map.invalidateSize({ animate: false });
      } catch {
        // ignore — map may be mid-teardown
      }
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, [map]);

  return null;
}

function levelColor(level: PressureLevel): string {
  switch (level) {
    case "critical":
      return "#E5484D";
    case "high":
      return "#E07A2F";
    case "moderate":
      return "#D6A400";
    default:
      return "#10B981";
  }
}

function levelText(level: PressureLevel): string {
  switch (level) {
    case "critical":
      return "Over Capacity";
    case "high":
      return "Heavy Queue";
    case "moderate":
      return "Moderate Queue";
    default:
      return "Low Queue";
  }
}

function heatRadius(facility: FacilityHeatmapFacility): number {
  const base = 130;
  const pressure = Math.sqrt(Math.max(0, facility.intensity)) * 55;
  return Math.min(760, base + pressure);
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        borderBottom: "1px solid #F1F5F9",
        padding: "7px 0",
      }}
    >
      <span style={{ color: "#64748B", fontWeight: 800 }}>{label}</span>
      <strong style={{ color: "#0F172A" }}>{value}</strong>
    </div>
  );
}

function Legend({ level }: { level: PressureLevel }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        color: "#334155",
        fontSize: 12,
        fontWeight: 900,
      }}
    >
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: levelColor(level),
        }}
      />
      {levelText(level)}
    </span>
  );
}

function ActionLink(props: { href: string; children: React.ReactNode }) {
  const tag = "a";
  return React.createElement(
    tag,
    {
      href: props.href,
      style: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 36,
        borderRadius: 12,
        padding: "0 12px",
        background: "#ECFDF5",
        border: "1px solid #A7F3D0",
        color: "#047857",
        fontWeight: 900,
        textDecoration: "none",
        fontSize: 12,
      },
    },
    props.children
  );
}

const mapOverlayStyle: React.CSSProperties = {
  position: "absolute",
  top: 14,
  right: 14,
  zIndex: 460,
  pointerEvents: "none",
  width: "min(310px, calc(100% - 82px))",
  background: "rgba(255,255,255,.92)",
  border: "1px solid rgba(204,251,241,.95)",
  borderRadius: 18,
  padding: 12,
  boxShadow: "0 18px 38px rgba(15,23,42,.12)",
  backdropFilter: "blur(10px)",
  display: "grid",
  gap: 10,
};

const overlayHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const overlayIconStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "#ECFDF5",
  color: "#0F766E",
  flexShrink: 0,
};

const overlayTitleStyle: React.CSSProperties = {
  display: "block",
  color: "#0F172A",
  fontSize: 13,
  fontWeight: 950,
  lineHeight: 1.15,
};

const overlaySubStyle: React.CSSProperties = {
  color: "#64748B",
  fontSize: 11.5,
  fontWeight: 750,
  marginTop: 2,
};

const overlayStatsStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 7,
};

const overlayStatStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minHeight: 28,
  padding: "0 9px",
  borderRadius: 999,
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
  color: "#334155",
  fontSize: 11.5,
  fontWeight: 900,
};

export default function FacilityQueueHeatmapMap({ facilities, events }: Props) {
  const selectedRhu = facilities.length === 1 ? facilities[0].id : 0;
  const totalWaiting = facilities.reduce((sum, facility) => sum + facility.waitingCount, 0);
  const totalPriority = facilities.reduce((sum, facility) => sum + facility.priorityCount, 0);
  const activeEvents = events.length;

  return (
    <div
      style={{
        border: "1px solid #CCFBF1",
        borderRadius: 20,
        overflow: "hidden",
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        flex: "1 1 auto",
        minHeight: 0,
        boxShadow: "0 14px 30px rgba(15,23,42,.06)",
      }}
    >
      <style>{LEAFLET_CHROME_CSS}</style>

      <div
        className="ka-leaflet-shell"
        style={{
          position: "relative",
          flex: "1 1 auto",
          alignSelf: "stretch",
          minHeight: "clamp(320px, 42vh, 460px)",
          width: "100%",
        }}
      >
        <div style={mapOverlayStyle} aria-hidden="true">
          <div style={overlayHeaderStyle}>
            <span style={overlayIconStyle}>
              <Building2 size={16} />
            </span>
            <div>
              <strong style={overlayTitleStyle}>Facility workload layer</strong>
              <div style={overlaySubStyle}>Queue, priority, and event pressure</div>
            </div>
          </div>

          <div style={overlayStatsStyle}>
            <span style={overlayStatStyle}>
              <UsersRound size={14} />
              {totalWaiting} waiting
            </span>
            <span style={overlayStatStyle}>
              <CalendarClock size={14} />
              {activeEvents} events
            </span>
            <span style={overlayStatStyle}>{totalPriority} priority</span>
          </div>
        </div>

        <MapContainer
          center={CENTER}
          zoom={12}
          minZoom={10}
          maxZoom={19}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution={TILE_ATTRIBUTION}
            url={TILE_URL}
            subdomains="abcd"
            maxZoom={19}
          />

          <MapFocus facilities={facilities} selectedRhu={selectedRhu} />
          <ResizeInvalidator />

          {facilities.map((facility) => {
            const color = levelColor(facility.congestionLevel);
            const position: [number, number] = [facility.latitude, facility.longitude];

            return (
              <div key={facility.id}>
                <Circle
                  center={position}
                  radius={heatRadius(facility)}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.1,
                    opacity: 0.34,
                    weight: 2,
                  }}
                />

                <CircleMarker
                  center={position}
                  radius={facility.congestionLevel === "critical" ? 29 : facility.congestionLevel === "high" ? 26 : 23}
                  pathOptions={{
                    color,
                    fillColor: color,
                    fillOpacity: 0.13,
                    opacity: 0.24,
                    weight: 2,
                  }}
                />

                <CircleMarker
                  center={position}
                  radius={facility.congestionLevel === "critical" ? 18 : facility.congestionLevel === "high" ? 16 : 14}
                  pathOptions={{
                    color: "#FFFFFF",
                    fillColor: color,
                    fillOpacity: 0.95,
                    opacity: 1,
                    weight: 3,
                  }}
                >
                  <Tooltip permanent direction="top" offset={[0, -12]}>
                    <strong>{facility.name}</strong>
                  </Tooltip>

                  <Popup maxWidth={330}>
                    <div style={{ minWidth: 260 }}>
                      <h3 style={{ margin: "0 0 4px", color: "#064E3B" }}>
                        {facility.name}
                      </h3>
                      <div style={{ color: "#64748B", fontSize: 12, marginBottom: 10 }}>
                        {facility.latitude.toFixed(6)}, {facility.longitude.toFixed(6)}
                      </div>

                      <InfoRow label="Queue status" value={facility.label} />
                      <InfoRow label="Current waiting queue" value={facility.waitingCount} />
                      <InfoRow label="In-service count" value={facility.inServiceCount} />
                      <InfoRow label="Priority count" value={facility.priorityCount} />
                      <InfoRow label="Total active queue" value={facility.queueCount} />
                      <InfoRow label="Active events today" value={facility.activeEventCount} />

                      <p style={{ margin: "10px 0", color: "#334155", fontWeight: 800 }}>
                        {facility.hasLiveQueueData
                          ? facility.suggestedAction
                          : "No live queue data available."}
                      </p>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <ActionLink href="/queue">Open Queue</ActionLink>
                        <ActionLink href="/cms/events">Open Events</ActionLink>
                        <ActionLink href="/sms">Send SMS Advisory</ActionLink>
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              </div>
            );
          })}

          {events.map((event) => {
            const color = levelColor(event.crowdingLevel);
            const position: [number, number] = [event.latitude, event.longitude];

            return (
              <CircleMarker
                key={`event-${event.id}`}
                center={position}
                radius={9}
                pathOptions={{
                  color: "#0F172A",
                  fillColor: color,
                  fillOpacity: 0.86,
                  opacity: 0.82,
                  weight: 2,
                }}
              >
                <Tooltip direction="right" offset={[8, 0]}>
                  {event.title}
                </Tooltip>

                <Popup maxWidth={310}>
                  <div style={{ minWidth: 240 }}>
                    <h3 style={{ margin: "0 0 4px", color: "#064E3B" }}>
                      {event.title}
                    </h3>
                    <InfoRow label="Facility" value={event.facilityName} />
                    <InfoRow
                      label="Schedule"
                      value={
                        event.schedule
                          ? new Date(event.schedule).toLocaleString("en-PH", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Today"
                      }
                    />
                    <InfoRow label="Registrants" value={event.registrants ?? "No data"} />
                    <InfoRow label="Slots" value={event.slots ?? "Unlimited"} />
                    <InfoRow label="Crowding level" value={levelText(event.crowdingLevel)} />

                    <div style={{ marginTop: 10 }}>
                      <ActionLink href={`/cms/events/${event.id}/registrants`}>
                        View Registrants
                      </ActionLink>
                    </div>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          padding: "12px 14px",
          borderTop: "1px solid #E5E7EB",
          background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
        }}
      >
        <span
          style={{
            color: "#0F172A",
            fontSize: 12,
            fontWeight: 950,
            textTransform: "uppercase",
            letterSpacing: ".04em",
          }}
        >
          Queue Load:
        </span>
        <Legend level="low" />
        <Legend level="moderate" />
        <Legend level="high" />
        <Legend level="critical" />
        <span style={{ color: "#64748B", fontSize: 12, fontWeight: 800 }}>
          Circle size increases with waiting queue, priority patients, active events, and service pressure.
        </span>
      </div>
    </div>
  );
}
