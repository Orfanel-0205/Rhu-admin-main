// tests/eventOperations.test.ts
//
// Events on the queue heatmap, the event report's CSV and print page, the
// new staff alerts, and marking attendance.

import { beforeEach, describe, expect, it, vi } from "vitest";

const patch = vi.fn();
vi.mock("../src/lib/apiClient", () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: (...args: unknown[]) => patch(...args) },
}));

const { eventMarkers } = await import("../src/services/facilityHeatmap");
const { eventReportCsv, eventReportHtml } = await import("../src/utils/eventReport");
const { isUrgentNotification } = await import("../src/lib/notificationSound");
const { markAttendance } = await import("../src/services/eventRegistrants");

const facilities = [
  { id: 1, name: "RHU 1", latitude: 15.92, longitude: 120.41 },
  { id: 2, name: "RHU 2", latitude: 15.88, longitude: 120.45 },
];

const today = new Date().toISOString();
const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();

function event(overrides: Record<string, unknown> = {}): any {
  return {
    id: 7,
    title: "Free check-up",
    event_type: "event",
    is_published: true,
    starts_at: today,
    max_slots: 50,
    total_registered: 10,
    has_ended: false,
    host_rhu_id: 2,
    pins: [
      { barangay: "Buto", latitude: 15.9, longitude: 120.43 },
      { barangay: "Abonagan", latitude: 15.95, longitude: 120.4 },
    ],
    ...overrides,
  };
}

describe("events on the queue heatmap", () => {
  it("pins an event at each of its barangays, belonging to its host RHU", () => {
    const markers = eventMarkers(event(), facilities);

    expect(markers.map((m) => [m.barangay, m.latitude, m.longitude])).toEqual([
      ["Buto", 15.9, 120.43],
      ["Abonagan", 15.95, 120.4],
    ]);
    expect(new Set(markers.map((m) => m.key)).size).toBe(2);
    expect(markers.every((m) => m.facilityId === 2 && m.isToday)).toBe(true);
  });

  it("drops ended events and announcements, and keeps upcoming ones (not counted as today)", () => {
    expect(eventMarkers(event({ has_ended: true }), facilities)).toEqual([]);
    expect(eventMarkers(event({ event_type: "announcement" }), facilities)).toEqual([]);

    const upcoming = eventMarkers(event({ starts_at: nextWeek }), facilities);
    expect(upcoming).toHaveLength(2);
    expect(upcoming.every((m) => !m.isToday)).toBe(true);
  });

  it("puts a whole-town event at its host RHU, and picks the nearest RHU when there is no host", () => {
    const town = eventMarkers(event({ pins: [] }), facilities);
    expect(town).toHaveLength(1);
    expect([town[0].latitude, town[0].longitude]).toEqual([15.88, 120.45]);

    const nearest = eventMarkers(
      event({ host_rhu_id: null, pins: [{ barangay: "Near RHU 1", latitude: 15.921, longitude: 120.409 }] }),
      facilities
    );
    expect(nearest[0].facilityId).toBe(1);
  });
});

describe("the event report", () => {
  const report: any = {
    event: {
      id: 7, title: 'Deworming "Day"', barangays: "Buto", services: [], has_ended: true,
      host_rhu: "RHU 1", posted_by: "Nurse Santos", starts_at: today, ends_at: today,
    },
    summary: { registered: 2, attended: 1, walk_ins: 1, present: 2, no_show: 1, not_marked: 0, cancelled: 0, items_dispensed: 15 },
    attendees: [
      { id: 1, name: "<script>alert(1)</script>", barangay: "Buto", status: "attended", marked_by: "Nurse Santos" },
      { id: 2, name: "=HYPERLINK(\"x\")", barangay: "Buto", status: "no_show" },
      { id: 3, name: "Juan dela Cruz", barangay: "Buto", status: "attended", walk_in: true, patient_account: false },
    ],
    dispensed: [{ id: 1, item: "Albendazole", unit: "tablet", quantity: 15, recorded_by: "Nurse Santos", recorded_at: today }],
    dispensed_totals: [{ item: "Albendazole", unit: "tablet", quantity: 15 }],
    generated_at: today,
  };

  it("exports a CSV that keeps quotes and never runs a typed name as a formula", () => {
    const csv = eventReportCsv(report);

    expect(csv).toContain('"Deworming ""Day"""');
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain('"Albendazole","tablet","15"');
    expect(csv).toContain('"Came (of those registered)","1"');
    expect(csv).toContain('"Walk-ins","1"');
    expect(csv).toContain('"Total present","2"');
    expect(csv).toContain('"Juan dela Cruz","Buto","Came (walk-in, no account)"');
  });

  it("prints with every value escaped", () => {
    const html = eventReportHtml(report);

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Deworming &quot;Day&quot;");
  });
});

describe("staff alerts", () => {
  it("treats an overloaded queue and a nearly full event as urgent, a ready report as not", () => {
    expect(isUrgentNotification("queue_overload")).toBe(true);
    expect(isUrgentNotification("event_crowding")).toBe(true);
    expect(isUrgentNotification("event_report_ready")).toBe(false);
  });
});

describe("marking attendance", () => {
  beforeEach(() => patch.mockReset());

  it("sends the mark for that registrant of that event", async () => {
    patch.mockResolvedValue({ data: { data: { id: 3, status: "attended" } } });

    const updated = await markAttendance(7, 3, "attended");

    expect(patch).toHaveBeenCalledWith("/admin/events/7/registrants/3/attendance", { status: "attended" });
    expect(updated.status).toBe("attended");
  });
});
