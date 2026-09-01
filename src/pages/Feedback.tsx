// src/pages/Feedback.tsx
// SERVICE FEEDBACK — residents send service feedback / condition updates after a
// completed consultation; RHU staff review and respond. This is intentionally
// SEPARATE from the clinical Health Follow-up board (/follow-up), which is the
// primary follow-up workflow. Feedback is no longer in the main navigation.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  MessageSquare,
  RefreshCw,
  Star,
} from "lucide-react";

import {
  fetchFeedback,
  respondFeedback,
  getFeedbackPatientName,
  getFeedbackRhuLabel,
  getServiceTypeLabel,
  getConditionLabel,
  getMedicationLabel,
  getUrgencyLabel,
  getYesNoLabel,
  isHealthFollowup,
  FEEDBACK_SERVICE_TYPES,
  FEEDBACK_STATUSES,
  CONDITION_STATUS_OPTIONS,
  URGENCY_LEVEL_OPTIONS,
  type ServiceFeedback,
} from "../services/feedback";

import {
  getFollowUps,
  getFollowUpSmsLabel,
  updateFollowUpStatus,
  type FollowUpReminder,
  type FollowUpStatus,
} from "../services/followups";

function formatDateTime(value?: string | null): string {
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

function Stars({ rating }: { rating: number }) {
  const safe = Math.max(0, Math.min(5, Number(rating) || 0));

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star
          key={value}
          size={14}
          color={value <= safe ? "#F59E0B" : "#CBD5E1"}
          fill={value <= safe ? "#F59E0B" : "none"}
        />
      ))}
    </span>
  );
}

function conditionChipStyle(value?: string | null): CSSProperties {
  switch (value) {
    case "recovered":
      return { ...chipStyle, background: "#DCFCE7", color: "#166534" };
    case "improved":
      return { ...chipStyle, background: "#CCFBF1", color: "#0F766E" };
    case "same":
      return { ...chipStyle, background: "#FEF3C7", color: "#92400E" };
    case "worse":
      return { ...chipStyle, background: "#FEE2E2", color: "#B91C1C" };
    default:
      return { ...chipStyle, background: "#F3F4F6", color: "#374151" };
  }
}

function urgencyBadgeStyle(value?: string | null): CSSProperties {
  switch (value) {
    case "urgent":
      return { ...badgeStyle, background: "#FEE2E2", color: "#B91C1C" };
    case "watch":
      return { ...badgeStyle, background: "#FEF3C7", color: "#92400E" };
    default:
      return { ...badgeStyle, background: "#F3F4F6", color: "#374151" };
  }
}

function statusBadgeStyle(status?: string): CSSProperties {
  switch (String(status || "").toLowerCase()) {
    case "responded":
      return { ...badgeStyle, background: "#DCFCE7", color: "#166534" };
    case "reviewed":
      return { ...badgeStyle, background: "#DBEAFE", color: "#1D4ED8" };
    case "archived":
      return { ...badgeStyle, background: "#F3F4F6", color: "#374151" };
    default:
      return { ...badgeStyle, background: "#FEF3C7", color: "#92400E" };
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div style={factStyle}>
      <span style={factLabelStyle}>{label}</span>
      <strong style={factValueStyle}>{value}</strong>
    </div>
  );
}

type TabKey = "patient" | "staff";

export default function Feedback() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("patient");

  const [items, setItems] = useState<ServiceFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [serviceType, setServiceType] = useState("all");
  const [status, setStatus] = useState("all");
  const [conditionStatus, setConditionStatus] = useState("all");
  const [urgencyLevel, setUrgencyLevel] = useState("all");

  // Staff SOAP follow-up reminders (created from the consultation SOAP page).
  const [reminders, setReminders] = useState<FollowUpReminder[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [remindersError, setRemindersError] = useState<string | null>(null);
  const [reminderStatus, setReminderStatus] = useState("all");

  const [respondTarget, setRespondTarget] = useState<ServiceFeedback | null>(
    null
  );
  const [responseText, setResponseText] = useState("");
  const [responding, setResponding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // service_type + status are filtered server-side; condition / urgency
      // are filtered client-side below (no extra backend params needed).
      const data = await fetchFeedback({ service_type: serviceType, status });
      setItems(data);
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not load health follow-up reports. Please check the connection."
      );
    } finally {
      setLoading(false);
    }
  }, [serviceType, status]);

  useEffect(() => {
    load();
  }, [load]);

  const loadReminders = useCallback(async () => {
    setRemindersLoading(true);
    setRemindersError(null);

    try {
      const data = await getFollowUps({ status: reminderStatus });
      setReminders(data);
    } catch (err: any) {
      setRemindersError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not load staff follow-up reminders."
      );
    } finally {
      setRemindersLoading(false);
    }
  }, [reminderStatus]);

  useEffect(() => {
    if (tab === "staff") {
      loadReminders();
    }
  }, [tab, loadReminders]);

  async function changeReminderStatus(
    reminder: FollowUpReminder,
    next: FollowUpStatus
  ) {
    try {
      await updateFollowUpStatus(reminder.id, next);
      await loadReminders();
    } catch (err: any) {
      setRemindersError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not update reminder status."
      );
    }
  }

  const visibleItems = useMemo(() => {
    return items.filter((item) => {
      if (conditionStatus !== "all" && item.condition_status !== conditionStatus) {
        return false;
      }

      if (urgencyLevel !== "all" && (item.urgency_level || "routine") !== urgencyLevel) {
        return false;
      }

      return true;
    });
  }, [items, conditionStatus, urgencyLevel]);

  const needsFollowupCount = useMemo(
    () => visibleItems.filter((item) => item.needs_follow_up).length,
    [visibleItems]
  );

  function openRespond(feedback: ServiceFeedback) {
    setRespondTarget(feedback);
    setResponseText(feedback.admin_response ?? "");
  }

  async function submitResponse() {
    if (!respondTarget) return;

    if (!responseText.trim()) {
      setError("Please type a response before saving.");
      return;
    }

    setResponding(true);
    setError(null);

    try {
      await respondFeedback(respondTarget.id, {
        admin_response: responseText.trim(),
        status: "responded",
      });

      setRespondTarget(null);
      setResponseText("");
      await load();
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not save the response."
      );
    } finally {
      setResponding(false);
    }
  }

  return (
    <div style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <div style={eyebrowStyle}>Ka-Agapay RHU</div>
          <h1 style={heroTitleStyle}>Service Feedback</h1>
          <p style={heroSubtitleStyle}>
            Patient service feedback and condition updates submitted from the
            mobile app. Scoped to your assigned RHU (super admin / MHO see all).
            For clinical follow-up reminders, use Health Follow-up.
          </p>

          <div style={heroMetaStyle}>
            <span>{visibleItems.length} feedback item(s)</span>
            <span>Needs attention: {needsFollowupCount}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={tab === "patient" ? load : loadReminders}
          disabled={tab === "patient" ? loading : remindersLoading}
          style={refreshButtonStyle}
        >
          <RefreshCw size={18} />
          {(tab === "patient" ? loading : remindersLoading)
            ? "Refreshing..."
            : "Refresh"}
        </button>
      </section>

      <section style={tabBarStyle}>
        <button
          type="button"
          onClick={() => navigate("/follow-up")}
          style={tabButtonStyle(false)}
        >
          Open Health Follow-up
          <ArrowRight size={16} />
        </button>
      </section>

      <p style={tabHelpStyle}>
        <strong>Service feedback</strong> comes from residents sending condition
        updates and service feedback in the mobile app. Looking for clinical
        follow-up reminders created from SOAP notes? Open{" "}
        <strong>Health Follow-up</strong> — the primary follow-up workflow.
      </p>

      {tab === "patient" ? (
      <>
      <section style={toolbarStyle}>
        <label style={fieldStyle}>
          <span>Condition</span>
          <select
            value={conditionStatus}
            onChange={(event) => setConditionStatus(event.target.value)}
            style={inputStyle}
          >
            <option value="all">All Conditions</option>
            {CONDITION_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span>Urgency</span>
          <select
            value={urgencyLevel}
            onChange={(event) => setUrgencyLevel(event.target.value)}
            style={inputStyle}
          >
            <option value="all">All Urgency</option>
            {URGENCY_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            style={inputStyle}
          >
            <option value="all">All Statuses</option>
            {FEEDBACK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label style={fieldStyle}>
          <span>Service Type</span>
          <select
            value={serviceType}
            onChange={(event) => setServiceType(event.target.value)}
            style={inputStyle}
          >
            <option value="all">All Services</option>
            {FEEDBACK_SERVICE_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? (
        <section style={errorStyle}>
          <AlertTriangle size={22} />
          <div>
            <strong>Action needed</strong>
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div style={emptyStyle}>Loading health follow-up reports...</div>
      ) : visibleItems.length === 0 ? (
        <div style={emptyStyle}>
          {serviceType !== "all" ||
          status !== "all" ||
          conditionStatus !== "all" ||
          urgencyLevel !== "all" ? (
            <>
              <strong style={{ display: "block", color: "#0F172A", marginBottom: 4 }}>
                No reports match the selected filters.
              </strong>
              Try changing the condition, urgency, status, or service type filters
              above.
            </>
          ) : (
            <>
              <strong style={{ display: "block", color: "#0F172A", marginBottom: 4 }}>
                No patient-submitted follow-ups yet.
              </strong>
              These appear when residents send condition updates from the mobile
              app after a completed consultation.
            </>
          )}
        </div>
      ) : (
        <div style={listStyle}>
          {visibleItems.map((feedback) => {
            const medical = isHealthFollowup(feedback);

            return (
              <article key={feedback.id} style={cardStyle}>
                <div style={cardHeaderStyle}>
                  <div>
                    <h3 style={patientNameStyle}>
                      {getFeedbackPatientName(feedback)}
                    </h3>
                    <div style={metaRowStyle}>
                      <span>{getFeedbackRhuLabel(feedback)}</span>
                      <span>·</span>
                      <span>{getServiceTypeLabel(feedback.service_type)}</span>
                      {feedback.consultation_id ? (
                        <>
                          <span>·</span>
                          <span>Consultation #{feedback.consultation_id}</span>
                        </>
                      ) : null}
                      {feedback.appointment_id ? (
                        <>
                          <span>·</span>
                          <span>Appointment #{feedback.appointment_id}</span>
                        </>
                      ) : null}
                      <span>·</span>
                      <span>{formatDateTime(feedback.created_at)}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    {medical ? (
                      <span style={conditionChipStyle(feedback.condition_status)}>
                        {getConditionLabel(feedback.condition_status)}
                      </span>
                    ) : (
                      <Stars rating={feedback.rating} />
                    )}
                    <span style={urgencyBadgeStyle(feedback.urgency_level)}>
                      {getUrgencyLabel(feedback.urgency_level)}
                    </span>
                    <span style={statusBadgeStyle(feedback.status)}>
                      {feedback.status}
                    </span>
                  </div>
                </div>

                {medical ? (
                  <div style={factGridStyle}>
                    <Fact
                      label="Condition"
                      value={getConditionLabel(feedback.condition_status)}
                    />
                    <Fact
                      label="Symptoms present"
                      value={getYesNoLabel(feedback.symptoms_present)}
                    />
                    <Fact
                      label="Medication"
                      value={getMedicationLabel(feedback.medication_taken)}
                    />
                    <Fact
                      label="Side effects"
                      value={getYesNoLabel(feedback.side_effects)}
                    />
                    <Fact
                      label="Needs follow-up"
                      value={getYesNoLabel(feedback.needs_follow_up)}
                    />
                    <Fact
                      label="Urgency"
                      value={getUrgencyLabel(feedback.urgency_level)}
                    />
                  </div>
                ) : null}

                {feedback.side_effects && feedback.side_effects_description ? (
                  <div style={commentStyle}>
                    <strong>Side Effects</strong>
                    <p style={{ margin: "4px 0 0" }}>
                      {feedback.side_effects_description}
                    </p>
                  </div>
                ) : null}

                {feedback.patient_message || feedback.comment ? (
                  <div style={commentStyle}>
                    <strong>{medical ? "Patient Message" : "Comment"}</strong>
                    <p style={{ margin: "4px 0 0" }}>
                      {feedback.patient_message || feedback.comment}
                    </p>
                  </div>
                ) : (
                  <div style={mutedStyle}>No message provided.</div>
                )}

                {feedback.admin_response ? (
                  <div style={responseStyle}>
                    <strong>RHU Advice / Response</strong>
                    <p style={{ margin: "4px 0 0" }}>{feedback.admin_response}</p>
                    <small style={{ color: "#64748B" }}>
                      Responded {formatDateTime(feedback.responded_at)}
                    </small>
                  </div>
                ) : null}

                <div style={actionRowStyle}>
                  <button
                    type="button"
                    onClick={() => openRespond(feedback)}
                    style={respondButtonStyle}
                  >
                    <MessageSquare size={16} />
                    {feedback.admin_response ? "Edit Response" : "Respond"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      </>
      ) : (
        <StaffReminders
          reminders={reminders}
          loading={remindersLoading}
          error={remindersError}
          statusFilter={reminderStatus}
          onStatusFilter={setReminderStatus}
          onChangeStatus={changeReminderStatus}
        />
      )}

      {respondTarget ? (
        <div style={modalBackdropStyle}>
          <div style={modalStyle}>
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>
              Respond to Health Follow-up
            </h2>
            <p style={{ margin: "0 0 14px", color: "#64748B" }}>
              {getFeedbackPatientName(respondTarget)} ·{" "}
              {getConditionLabel(respondTarget.condition_status)}
            </p>

            <label style={{ ...fieldStyle, color: "#334155", marginBottom: 6 }}>
              <span>RHU Advice / Response</span>
            </label>

            <textarea
              value={responseText}
              onChange={(event) => setResponseText(event.target.value)}
              placeholder="Give advice or next steps for this patient..."
              style={textareaStyle}
            />

            <div style={modalActionsStyle}>
              <button
                type="button"
                onClick={() => {
                  setRespondTarget(null);
                  setResponseText("");
                }}
                disabled={responding}
                style={cancelButtonStyle}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={submitResponse}
                disabled={responding}
                style={saveButtonStyle}
              >
                {responding ? "Saving..." : "Save RHU Response"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StaffReminders({
  reminders,
  loading,
  error,
  statusFilter,
  onStatusFilter,
  onChangeStatus,
}: {
  reminders: FollowUpReminder[];
  loading: boolean;
  error: string | null;
  statusFilter: string;
  onStatusFilter: (value: string) => void;
  onChangeStatus: (reminder: FollowUpReminder, next: FollowUpStatus) => void;
}) {
  const STATUS_OPTIONS: FollowUpStatus[] = [
    "pending",
    "scheduled",
    "completed",
    "missed",
    "cancelled",
  ];

  return (
    <>
      <section style={toolbarStyle}>
        <label style={fieldStyle}>
          <span>Reminder Status</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilter(event.target.value)}
            style={inputStyle}
            title="Filter reminders by status"
            aria-label="Filter reminders by status"
          >
            <option value="all">All Statuses</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? (
        <section style={errorStyle}>
          <AlertTriangle size={22} />
          <div>
            <strong>Action needed</strong>
            <p style={{ margin: 0 }}>{error}</p>
          </div>
        </section>
      ) : null}

      {loading ? (
        <div style={emptyStyle}>Loading staff follow-up reminders...</div>
      ) : reminders.length === 0 ? (
        <div style={emptyStyle}>
          <strong style={{ display: "block", color: "#0F172A", marginBottom: 4 }}>
            No staff follow-up reminders yet.
          </strong>
          These are created from SOAP follow-up dates or follow-up date ranges when
          you complete a consultation. Open a consultation’s SOAP page to add one.
        </div>
      ) : (
        <div style={listStyle}>
          {reminders.map((reminder) => {
            const when = [
              reminder.follow_up_date || "",
              reminder.follow_up_time
                ? String(reminder.follow_up_time).slice(0, 5)
                : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <article key={reminder.id} style={cardStyle}>
                <div style={cardHeaderStyle}>
                  <div>
                    <h3 style={patientNameStyle}>
                      {reminder.patient_name || "Patient"}
                    </h3>
                    <div style={metaRowStyle}>
                      {reminder.rhu_id ? (
                        <>
                          <span>RHU {reminder.rhu_id}</span>
                          <span>·</span>
                        </>
                      ) : null}
                      {reminder.consultation_id ? (
                        <>
                          <span>Consultation #{reminder.consultation_id}</span>
                          <span>·</span>
                        </>
                      ) : null}
                      <span>{when || "No schedule set"}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <span style={urgencyBadgeStyle(reminder.urgency)}>
                      {getUrgencyLabel(reminder.urgency)}
                    </span>
                    <span style={statusBadgeStyle(reminder.status ?? undefined)}>
                      {reminder.status}
                    </span>
                    <span style={smsPillStyle(reminder.sms_status)}>
                      {getFollowUpSmsLabel(reminder)}
                    </span>
                  </div>
                </div>

                <div style={factGridStyle}>
                  <Fact label="Mobile" value={reminder.mobile_number || "—"} />
                  <Fact
                    label="Urgency"
                    value={getUrgencyLabel(reminder.urgency)}
                  />
                  <Fact label="Schedule" value={when || "—"} />
                </div>

                {reminder.reason ? (
                  <div style={commentStyle}>
                    <strong>Reason</strong>
                    <p style={{ margin: "4px 0 0" }}>{reminder.reason}</p>
                  </div>
                ) : null}

                {reminder.instructions ? (
                  <div style={commentStyle}>
                    <strong>Instructions (SMS)</strong>
                    <p style={{ margin: "4px 0 0" }}>{reminder.instructions}</p>
                  </div>
                ) : null}

                {reminder.sms_status === "failed" && reminder.sms_error ? (
                  <div style={mutedStyle}>SMS error: {reminder.sms_error}</div>
                ) : null}

                <div style={actionRowStyle}>
                  <select
                    value={(reminder.status as string) || "pending"}
                    onChange={(event) =>
                      onChangeStatus(
                        reminder,
                        event.target.value as FollowUpStatus
                      )
                    }
                    style={inputStyle}
                    title="Update reminder status"
                    aria-label="Update reminder status"
                  >
                    {STATUS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        Mark as {value}
                      </option>
                    ))}
                  </select>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function smsPillStyle(status?: string | null): CSSProperties {
  switch (String(status || "").toLowerCase()) {
    case "sent":
      return { ...badgeStyle, background: "#DCFCE7", color: "#166534" };
    case "failed":
      return { ...badgeStyle, background: "#FEE2E2", color: "#B91C1C" };
    case "pending":
      return { ...badgeStyle, background: "#FEF3C7", color: "#92400E" };
    default:
      return { ...badgeStyle, background: "#F3F4F6", color: "#374151" };
  }
}

const tabBarStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
};

const tabHelpStyle: CSSProperties = {
  margin: 0,
  padding: "10px 14px",
  background: "#F0FDFA",
  border: "1px solid #CCFBF1",
  borderRadius: 12,
  color: "#0F766E",
  fontSize: 13,
  lineHeight: 1.55,
};

function tabButtonStyle(active: boolean): CSSProperties {
  // Matches the ModuleTabs segmented-pill standard: the ACTIVE tab is a filled
  // teal pill with white text, not a tint. A tinted active state reads as
  // "hovered" next to the rest of the app.
  return {
    border: `1px solid ${active ? "#0F766E" : "#E2E8F0"}`,
    background: active ? "#0F766E" : "#FFFFFF",
    color: active ? "#FFFFFF" : "#475569",
    borderRadius: 12,
    padding: "9px 14px",
    minHeight: 40,
    fontWeight: 900,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  };
}

const pageStyle: CSSProperties = { display: "grid", gap: 18 };

const heroStyle: CSSProperties = {
  background: "linear-gradient(135deg, #064E3B, #14B8A6)",
  color: "#FFFFFF",
  borderRadius: 28,
  padding: 28,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
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
  fontSize: 32,
  fontWeight: 900,
  letterSpacing: "-0.04em",
};

const heroSubtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "#D1FAE5",
  maxWidth: 640,
  lineHeight: 1.6,
  fontWeight: 600,
};

const heroMetaStyle: CSSProperties = {
  display: "flex",
  gap: 14,
  flexWrap: "wrap",
  marginTop: 14,
  fontSize: 13,
  fontWeight: 900,
};

const refreshButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.4)",
  borderRadius: 12,
  background: "rgba(255,255,255,0.14)",
  color: "#FFFFFF",
  padding: "10px 16px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 900,
  cursor: "pointer",
};

const toolbarStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 20,
  padding: 14,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 12,
  fontWeight: 900,
  color: "#475569",
};

const inputStyle: CSSProperties = {
  height: 44,
  borderRadius: 12,
  border: "1px solid #CBD5E1",
  background: "#F8FAFC",
  padding: "0 12px",
  fontWeight: 700,
  outline: 0,
};

const errorStyle: CSSProperties = {
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
  borderRadius: 16,
  padding: 16,
  display: "flex",
  gap: 12,
};

const emptyStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 34,
  textAlign: "center",
  color: "#64748B",
  fontWeight: 800,
};

const listStyle: CSSProperties = { display: "grid", gap: 14 };

const cardStyle: CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 18,
  padding: 18,
  display: "grid",
  gap: 12,
  boxShadow: "0 10px 30px rgba(15,23,42,.04)",
};

const cardHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap",
};

const patientNameStyle: CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 900,
  color: "#0F172A",
};

const metaRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 4,
  color: "#64748B",
  fontSize: 13,
  fontWeight: 700,
};

const badgeStyle: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "capitalize",
};

const chipStyle: CSSProperties = {
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 13,
  fontWeight: 900,
};

const factGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
};

const factStyle: CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 12,
  padding: 10,
  display: "grid",
  gap: 4,
};

const factLabelStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
  fontWeight: 800,
};

const factValueStyle: CSSProperties = {
  color: "#0F172A",
  fontSize: 14,
};

const commentStyle: CSSProperties = {
  background: "#F8FAFC",
  borderRadius: 12,
  padding: 12,
  color: "#0F172A",
};

const mutedStyle: CSSProperties = {
  color: "#94A3B8",
  fontStyle: "italic",
  fontSize: 13,
};

const responseStyle: CSSProperties = {
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  borderRadius: 12,
  padding: 12,
  color: "#0F172A",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
};

const respondButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 12,
  padding: "10px 14px",
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 900,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
};

const modalBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "grid",
  placeItems: "center",
  zIndex: 60,
  padding: 16,
};

const modalStyle: CSSProperties = {
  background: "#FFFFFF",
  borderRadius: 20,
  padding: 22,
  width: "100%",
  maxWidth: 520,
  boxShadow: "0 30px 60px rgba(15,23,42,.25)",
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 130,
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: 12,
  resize: "vertical",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const modalActionsStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  justifyContent: "flex-end",
  marginTop: 14,
};

const cancelButtonStyle: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 12,
  padding: "10px 16px",
  background: "#FFFFFF",
  color: "#334155",
  fontWeight: 900,
  cursor: "pointer",
};

const saveButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 12,
  padding: "10px 16px",
  background: "#047857",
  color: "#FFFFFF",
  fontWeight: 900,
  cursor: "pointer",
};
