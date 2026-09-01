// src/pages/Prescriptions.tsx

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePagination } from "../hooks/usePagination";
import TablePagination from "../components/ui/TablePagination";
import { useSearchParams } from "react-router-dom";
import {
  CheckCircle,
  Download,
  FileText,
  Pill,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";

import {
  cancelPrescription,
  createPrescription,
  dispensePrescription,
  downloadPrescriptionPdf,
  getPrescriptions,
  releasePrescription,
  searchMedicines,
  type LabTestsInput,
  type MedicineSearchResult,
  type MedicationInput,
  type Prescription,
  type PrescriptionFormType,
} from "../services/prescriptions";

import {
  searchPrescriptionPatients,
  type PrescriptionPatient,
} from "../services/patients";

import {
  getConsultation,
  getPatientName as getConsultationPatientName,
} from "../services/consultations";

import { useLangStore } from "../store/langStore";
import { useAuthStore } from "../store/authStore";

// Only Doctor, MHO, and Super Admin may create/issue prescriptions. Nurses,
// midwives, BHWs, and head nurses can only release/dispense existing orders.
const PRESCRIBER_ROLES = new Set([
  "doctor",
  "mho",
  "mho_admin",
  "super_admin",
  "superadmin",
]);

function canPrescribeRole(user: any): boolean {
  const role = String(user?.role ?? user?.role_name ?? "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return PRESCRIBER_ROLES.has(role);
}
import { t } from "../i18n/translations";
import StatusBadge from "../components/ui/StatusBadge";
import { getRecordLifecycleStatus } from "../lib/recordLifecycle";
import type { LifecycleStatus } from "../lib/recordLifecycle";
import { useToast } from "../contexts/ToastContext";

type Lang = Parameters<typeof t>[1];

type FormState = {
  form_type: PrescriptionFormType;
  resident_profile_id: string;
  consultation_id: string;
  diagnosis: string;
  diagnosis_code: string;
  clinical_impression: string;
  request_reason: string;
  priority: "routine" | "urgent" | "stat";
  request_notes: string;
  lab_tests: LabTestsInput;
  additional_instructions: string;
  dispensing_notes: string;
  medications: MedicationInput[];
};

const emptyMedication: MedicationInput = {
  name: "",
  dosage: "",
  quantity: 1,
  frequency: "",
  duration: "",
  route: "Oral",
  instructions: "",
  is_controlled: false,
  brand_alternatives_allowed: true,
};

const emptyForm: FormState = {
  form_type: "medicine",
  resident_profile_id: "",
  consultation_id: "",
  diagnosis: "",
  diagnosis_code: "",
  clinical_impression: "",
  request_reason: "",
  priority: "routine",
  request_notes: "",
  lab_tests: {
    laboratory: [],
    xray: [],
    ultrasound: [],
    others: {
      laboratory: "",
      xray: "",
      ultrasound: "",
    },
  },
  additional_instructions: "",
  dispensing_notes: "",
  medications: [{ ...emptyMedication }],
};

function freshEmptyForm(): FormState {
  return {
    ...emptyForm,
    lab_tests: {
      laboratory: [],
      xray: [],
      ultrasound: [],
      others: {
        laboratory: "",
        xray: "",
        ultrasound: "",
      },
    },
    medications: [{ ...emptyMedication }],
  };
}

const LABORATORY_OPTIONS = [
  "CBC",
  "Urinalysis",
  "Fecalysis",
  "FBS",
  "HBA1C",
  "B.U.A",
  "ALT",
  "AST",
  "Creatinine",
  "B.U.N",
  "Total Lipid Profile",
];

const XRAY_OPTIONS = ["CXR - PA View", "CXR - Apicolordotic View"];

const ULTRASOUND_OPTIONS = [
  "Whole Abdomen",
  "Lower Abdomen",
  "Upper Abdomen",
  "Prostate",
  "HBT",
  "KUB",
];

const RX_STATUS_KEYS: Record<string, string> = {
  active: "rx_status_active",
  released: "rx_status_released",
  dispensed: "rx_status_dispensed",
  voided: "rx_status_voided",
  cancelled: "appt_status_cancelled",
};

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusClass(status: string) {
  const lower = status.toLowerCase();

  if (["dispensed", "completed", "released"].includes(lower)) {
    return "badge-green";
  }

  if (["cancelled", "voided", "expired"].includes(lower)) {
    return "badge-red";
  }

  return "badge-amber";
}

function getRxStatusLabel(status: string, lang: Lang) {
  const key = RX_STATUS_KEYS[status];

  if (key) {
    return t(key, lang);
  }

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toNullablePositiveId(
  value: string | number | null | undefined
): number | null {
  const id = Number(value);

  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  return id;
}

function readQueryValue(params: URLSearchParams, key: string): string {
  return String(params.get(key) ?? "").trim();
}

function isLabRequest(item: Prescription): boolean {
  return String(item.form_type || "medicine") === "lab_request";
}

function getPrescriptionLifecycle(item: Prescription): LifecycleStatus {
  const labRequest = isLabRequest(item);

  return getRecordLifecycleStatus(
    {
      ...item,
      request_date: item.prescription_date || item.created_at,
      available_date: labRequest
        ? item.prescription_date || item.created_at
        : item.valid_until || item.prescription_date,
    },
    {
      module: labRequest ? "lab_request" : "prescription",
      dateFields: labRequest
        ? ["available_date", "request_date", "created_at"]
        : ["valid_until", "prescription_date", "created_at"],
      endDateFields: labRequest ? ["available_date"] : ["valid_until"],
      completedStatuses: labRequest
        ? ["released", "completed"]
        : ["released", "dispensed", "completed"],
      deletedStatuses: ["voided", "cancelled", "deleted"],
      pendingStatuses: ["active", "issued", "pending", "draft"],
      todayLabel: labRequest ? "Available Today" : "Active",
      activeLabel: labRequest ? "Pending Lab Request" : "Active",
      expiredLabel: labRequest ? "Expired Lab Request" : "History",
    }
  );
}

function labTestsHaveSelection(labTests: LabTestsInput): boolean {
  return (
    labTests.laboratory.length > 0 ||
    labTests.xray.length > 0 ||
    labTests.ultrasound.length > 0 ||
    Boolean(labTests.others.laboratory?.trim()) ||
    Boolean(labTests.others.xray?.trim()) ||
    Boolean(labTests.others.ultrasound?.trim())
  );
}

function summarizeLabTests(labTests?: LabTestsInput | null): string {
  if (!labTests) return "No tests listed";

  const tests = [
    ...labTests.laboratory,
    ...labTests.xray,
    ...labTests.ultrasound,
    labTests.others.laboratory,
    labTests.others.xray,
    labTests.others.ultrasound,
  ]
    .filter(Boolean)
    .map(String);

  return tests.length ? tests.join(", ") : "No tests listed";
}

function updateLabSection(
  labTests: LabTestsInput,
  section: "laboratory" | "xray" | "ultrasound",
  option: string,
  checked: boolean
): LabTestsInput {
  const current = labTests[section] ?? [];

  return {
    ...labTests,
    [section]: checked
      ? Array.from(new Set([...current, option]))
      : current.filter((item) => item !== option),
  };
}

// Resolve a resident_profile_id from a fetched consultation across the several
// shapes the API returns it in (mirrors ConsultationDetails' lookup).
function resolveResidentProfileIdFromConsultation(c: any): number | null {
  const candidates = [
    c?.resident_profile_id,
    // The patient's profile is nested under the `resident` (User) relation —
    // serialized as resident.resident_profile.id — which is where the
    // consultation show endpoint actually carries it.
    c?.resident?.resident_profile?.id,
    c?.resident?.residentProfile?.id,
    c?.resident?.resident_profile_id,
    c?.resident_profile?.id,
    c?.residentProfile?.id,
    c?.patient?.resident_profile_id,
    c?.appointment?.resident_profile_id,
    c?.appointment?.resident?.resident_profile?.id,
    c?.user?.resident_profile?.id,
  ];

  for (const candidate of candidates) {
    const id = Number(candidate);
    if (Number.isFinite(id) && id > 0) {
      return id;
    }
  }

  return null;
}

function buildPatientFromQuery(
  params: URLSearchParams
): PrescriptionPatient | null {
  const residentProfileId = toNullablePositiveId(
    params.get("resident_profile_id")
  );

  const fullName = readQueryValue(params, "patient_name");

  if (!residentProfileId || !fullName) {
    return null;
  }

  return {
    resident_profile_id: residentProfileId,
    full_name: fullName,
    patient_id:
      readQueryValue(params, "patient_id") ||
      `PAT-${String(residentProfileId).padStart(5, "0")}`,
    mobile_number: readQueryValue(params, "mobile"),
    barangay: readQueryValue(params, "barangay"),
  } as PrescriptionPatient;
}

export default function Prescriptions() {
  const toast = useToast();
  const lang = useLangStore((state) => state.lang);
  const authUser = useAuthStore((state) => state.user);
  const canPrescribe = canPrescribeRole(authUser);
  const [searchParams] = useSearchParams();
  const autoOpenHandledRef = useRef(false);

  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<FormState>(freshEmptyForm);

  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<PrescriptionPatient[]>(
    []
  );
  const [selectedPatient, setSelectedPatient] =
    useState<PrescriptionPatient | null>(null);
  const [patientLoading, setPatientLoading] = useState(false);
  const [patientError, setPatientError] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }

      setError("");

      try {
        const data = await getPrescriptions({
          search: search.trim() || undefined,
          status,
        });

        setPrescriptions(data);
      } catch (err: any) {
        setError(
          err?.response?.data?.message ||
            err?.message ||
            t("rx_error_load", useLangStore.getState().lang)
        );
      } finally {
        setLoading(false);
      }
    },
    [search, status]
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!modal) return;

    const keyword = patientSearch.trim();

    if (keyword.length < 2 || selectedPatient) {
      setPatientResults([]);
      setPatientError("");
      return;
    }

    const timer = window.setTimeout(async () => {
      setPatientLoading(true);
      setPatientError("");

      try {
        const rows = await searchPrescriptionPatients(keyword);
        setPatientResults(rows);
      } catch (err: any) {
        setPatientError(
          err?.response?.data?.message ||
            err?.message ||
            "Failed to search patients."
        );
      } finally {
        setPatientLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [patientSearch, modal, selectedPatient]);

  useEffect(() => {
    if (autoOpenHandledRef.current) return;

    const shouldOpen =
      searchParams.get("new") === "1" ||
      searchParams.get("open") === "new" ||
      searchParams.get("mode") === "create";

    // Never auto-open the create modal for roles that cannot prescribe (e.g.
    // arriving from a consultation link). Backend also rejects creation 403.
    if (!shouldOpen || !canPrescribe) return;

    autoOpenHandledRef.current = true;

    const patient = buildPatientFromQuery(searchParams);
    const consultationId = toNullablePositiveId(
      searchParams.get("consultation_id")
    );

    const diagnosisFromQuery = readQueryValue(searchParams, "diagnosis");
    const diagnosisCodeFromQuery = readQueryValue(
      searchParams,
      "diagnosis_code"
    );
    const prescribedDrugsFromQuery = readQueryValue(
      searchParams,
      "prescribed_drugs"
    );

    setModal(true);
    setPatientError("");
    setPatientResults([]);

    if (patient) {
      setSelectedPatient(patient);
      setPatientSearch(patient.full_name);
    } else {
      setSelectedPatient(null);
      setPatientSearch("");

      // The consultation link didn't carry a resolvable patient (only the
      // consultation id survived). Since the system already knows the patient
      // from that consultation, fetch it and auto-fill — the staff member
      // should never have to re-search someone the record already identifies.
      // Still fully editable afterward via the Change/clear patient control.
      if (consultationId) {
        (async () => {
          try {
            const consultation = await getConsultation(consultationId);
            const rpid = resolveResidentProfileIdFromConsultation(consultation);
            const name = getConsultationPatientName(consultation);

            if (rpid && name && name !== "—") {
              const derived = {
                resident_profile_id: rpid,
                full_name: name,
                patient_id:
                  (consultation as any)?.patient_id ||
                  `PAT-${String(rpid).padStart(5, "0")}`,
                mobile_number:
                  (consultation as any)?.resident?.mobile_number ??
                  (consultation as any)?.mobile_number ??
                  null,
                barangay:
                  (consultation as any)?.resident?.barangay ??
                  (consultation as any)?.barangay ??
                  null,
              } as PrescriptionPatient;

              setSelectedPatient(derived);
              setPatientSearch(name);
              setForm((prev) => ({
                ...prev,
                resident_profile_id: String(rpid),
              }));
            }
          } catch {
            // Fall back to manual search — never block prescription creation.
          }
        })();
      }
    }

    setForm({
      ...freshEmptyForm(),
      form_type: "medicine",
      resident_profile_id: patient ? String(patient.resident_profile_id) : "",
      consultation_id: consultationId ? String(consultationId) : "",
      diagnosis: diagnosisFromQuery,
      clinical_impression: diagnosisFromQuery,
      diagnosis_code: diagnosisCodeFromQuery,
      additional_instructions:
        "Created from consultation record. Review medicine details before releasing.",
      medications: prescribedDrugsFromQuery
        ? [
            {
              ...emptyMedication,
              name: prescribedDrugsFromQuery.split(/\r?\n/)[0] || prescribedDrugsFromQuery,
              instructions: prescribedDrugsFromQuery,
            },
          ]
        : [{ ...emptyMedication }],
    });
  }, [searchParams]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return prescriptions.filter((item) => {
      const statusMatch = status === "all" || item.status === status;

      const searchMatch =
        !keyword ||
        [
          item.prescription_number,
          item.patient_name,
          item.prescriber_name,
          isLabRequest(item) ? "lab request laboratory xray ultrasound" : "medicine prescription",
          item.diagnosis,
          item.clinical_impression,
          item.request_reason,
          item.priority,
          summarizeLabTests(item.lab_tests),
          item.medications?.map((med) => med.name).join(" "),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword);

      return statusMatch && searchMatch;
    });
  }, [prescriptions, search, status]);

  // Part 8 — paginate the already-filtered prescriptions.
  const pg = usePagination(filtered, { resetDeps: [filtered] });

  const stats = useMemo(() => {
    return {
      total: prescriptions.length,
      active: prescriptions.filter((rx) =>
        ["active", "released", "issued"].includes(rx.status)
      ).length,
      dispensed: prescriptions.filter((rx) => rx.status === "dispensed")
        .length,
      controlled: prescriptions.filter(
        (rx) =>
          rx.has_controlled_substances ||
          rx.medications?.some((med) => med.is_controlled)
      ).length,
    };
  }, [prescriptions]);

  function flash(message: string) {
    setNotice(message);

    window.setTimeout(() => {
      setNotice("");
    }, 3000);
  }

  function resetCreateModal() {
    setForm(freshEmptyForm());
    setPatientSearch("");
    setPatientResults([]);
    setSelectedPatient(null);
    setPatientError("");
  }

  function openCreateModal() {
    resetCreateModal();
    setModal(true);
  }

  function closeCreateModal() {
    setModal(false);
    resetCreateModal();
  }

  function selectPatient(patient: PrescriptionPatient) {
    setSelectedPatient(patient);
    setPatientSearch(patient.full_name);
    setPatientResults([]);

    setForm((prev) => ({
      ...prev,
      resident_profile_id: String(patient.resident_profile_id),
    }));
  }

  function clearSelectedPatient() {
    setSelectedPatient(null);
    setPatientSearch("");
    setPatientResults([]);

    setForm((prev) => ({
      ...prev,
      resident_profile_id: "",
    }));
  }

  function updateMedication(index: number, patch: Partial<MedicationInput>) {
    setForm((prev) => ({
      ...prev,
      medications: prev.medications.map((med, medIndex) =>
        medIndex === index ? { ...med, ...patch } : med
      ),
    }));
  }

  function addMedication() {
    setForm((prev) => ({
      ...prev,
      medications: [...prev.medications, { ...emptyMedication }],
    }));
  }

  function removeMedication(index: number) {
    setForm((prev) => ({
      ...prev,
      medications:
        prev.medications.length <= 1
          ? prev.medications
          : prev.medications.filter((_, medIndex) => medIndex !== index),
    }));
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const residentProfileId = Number(form.resident_profile_id);

    if (!selectedPatient || !residentProfileId) {
      toast.warning(t("rx_resident_required", lang) || "Please select a patient.");
      return;
    }

    const isLab = form.form_type === "lab_request";
    const medicines = form.medications.filter((med) => med.name.trim());

    if (!isLab && medicines.length === 0) {
      toast.warning(t("rx_add_one_med", lang) || "Please add at least one medicine.");
      return;
    }

    if (isLab && !labTestsHaveSelection(form.lab_tests)) {
      toast.warning("Select at least one laboratory test, X-ray, ultrasound, or enter an Others field.");
      return;
    }

    setSaving(true);

    try {
      await createPrescription({
        form_type: form.form_type,
        resident_profile_id: residentProfileId,
        consultation_id: toNullablePositiveId(form.consultation_id),
        diagnosis: form.diagnosis,
        diagnosis_code: form.diagnosis_code,
        clinical_impression: form.clinical_impression || form.diagnosis,
        request_reason: form.request_reason,
        priority: form.priority,
        request_notes: form.request_notes,
        lab_tests: isLab ? form.lab_tests : undefined,
        medications: isLab ? [] : medicines,
        additional_instructions: isLab ? undefined : form.additional_instructions,
        dispensing_notes: isLab ? undefined : form.dispensing_notes,
      });

      const patientName = selectedPatient.full_name;

      closeCreateModal();

      flash(
        `${isLab ? "Lab request created. You can now release PDF." : t("rx_created", lang) || "Prescription created."} ${
          patientName ? `(${patientName})` : ""
        }`
      );

      await load(true);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("rx_error_create", lang)
      );
    } finally {
      setSaving(false);
    }
  }

  async function onRelease(item: Prescription) {
    const labRequest = isLabRequest(item);

    if (
      !window.confirm(
        labRequest
          ? `Release lab request PDF for ${item.prescription_number}?`
          : t("rx_confirm_release", lang, {
              num: item.prescription_number,
            })
      )
    ) {
      return;
    }

    const dispenseFromRhu = labRequest
      ? false
      : window.confirm(
          "Will this medicine be dispensed from the RHU drug room now?\n\nOK = Release PDF and deduct inventory\nCancel = Release PDF only"
        );

    setActionId(item.id);

    try {
      const released = await releasePrescription(item.id, {
        dispense_from_rhu: dispenseFromRhu,
        strict_inventory: true,
        dispensing_notes: dispenseFromRhu
          ? "Released and dispensed from RHU drug room."
          : undefined,
      });

      flash(
        labRequest
          ? "Lab request PDF released."
          : dispenseFromRhu
          ? "Prescription released, dispensed, and inventory deducted."
          : t("rx_released", lang)
      );

      await load(true);
      await downloadPrescriptionPdf(released.id || item.id);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("rx_error_release", lang)
      );
    } finally {
      setActionId(null);
    }
  }

  async function onDispense(item: Prescription) {
    if (isLabRequest(item)) {
      toast.success("Lab requests cannot be dispensed from inventory.");
      return;
    }

    const notes = window.prompt(t("rx_dispense_prompt", lang)) || "";

    setActionId(item.id);

    try {
      await dispensePrescription(item.id, notes);

      flash(t("rx_dispensed", lang));

      await load(true);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("rx_error_dispense", lang)
      );
    } finally {
      setActionId(null);
    }
  }

  async function onVoid(item: Prescription) {
    if (
      !window.confirm(
        t("rx_confirm_void", lang, {
          num: item.prescription_number,
        })
      )
    ) {
      return;
    }

    setActionId(item.id);

    try {
      await cancelPrescription(item.id);

      flash(t("rx_voided", lang));

      await load(true);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("rx_error_void", lang)
      );
    } finally {
      setActionId(null);
    }
  }

  async function onPdf(item: Prescription) {
    setActionId(item.id);

    try {
      await downloadPrescriptionPdf(item.id);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message ||
          err?.message ||
          t("rx_error_pdf", lang)
      );
    } finally {
      setActionId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section style={heroStyle}>
        <div>
          <h1 style={heroTitleStyle}>{t("rx_title", lang)}</h1>

          <p style={heroSubtitleStyle}>{t("rx_subtitle", lang)}</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => load()} style={whiteButton}>
            <RefreshCw size={16} />
            {t("btn_refresh", lang)}
          </button>

          {canPrescribe ? (
            <button onClick={openCreateModal} style={whiteButton}>
              <Plus size={16} />
              {t("rx_btn_new", lang)}
            </button>
          ) : null}
        </div>
      </section>

      {notice && (
        <div style={successStyle}>
          <CheckCircle size={16} />
          {notice}
        </div>
      )}

      {error && <div style={errorStyle}>{error}</div>}

      <section style={metricsGridStyle}>
        <Metric
          label={t("rx_metric_total", lang)}
          value={stats.total}
          icon={<FileText size={20} />}
        />

        <Metric
          label={t("rx_metric_active", lang)}
          value={stats.active}
          icon={<Pill size={20} />}
        />

        <Metric
          label={t("rx_metric_dispensed", lang)}
          value={stats.dispensed}
          icon={<CheckCircle size={20} />}
        />

        <Metric
          label={t("rx_metric_controlled", lang)}
          value={stats.controlled}
          icon={<FileText size={20} />}
          danger
        />
      </section>

      <section style={cardStyle}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9CA3AF",
              }}
            />

            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("rx_search_placeholder", lang)}
              style={{ paddingLeft: 38 }}
            />
          </div>

          <select
            className="input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">{t("rx_filter_all", lang)}</option>
            <option value="active">{t("rx_status_active", lang)}</option>
            <option value="released">{t("rx_status_released", lang)}</option>
            <option value="dispensed">{t("rx_status_dispensed", lang)}</option>
            <option value="voided">{t("rx_status_voided", lang)}</option>
            <option value="cancelled">
              {t("appt_status_cancelled", lang)}
            </option>
          </select>
        </div>
      </section>

      <section style={cardStyle}>
        {loading ? (
          <p style={{ color: "#64748B" }}>{t("rx_loading", lang)}</p>
        ) : pg.total === 0 ? (
          <p style={{ color: "#64748B" }}>
            No prescriptions or lab requests yet. Create a medicine prescription or lab request after consultation.
          </p>
        ) : (
          <div className="table-wrapper" style={{ border: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t("rx_th_number", lang)}</th>
                  <th>{t("appt_th_patient", lang)}</th>
                  <th>{t("con_th_diagnosis", lang)}</th>
                  <th>Type / Medicines / Requested Tests</th>
                  <th>{t("common_date", lang)}</th>
                  <th>{t("appt_th_status", lang)}</th>
                  <th>{t("rx_th_pdf_actions", lang)}</th>
                </tr>
              </thead>

              <tbody>
                {pg.pageRows.map((item) => {
                  const rowIsLabRequest = isLabRequest(item);
                  const lifecycle = getPrescriptionLifecycle(item);
                  const labExpired =
                    rowIsLabRequest && lifecycle.key === "expired";
                  const readOnlyRecord = ["voided", "cancelled"].includes(
                    String(item.status || "").toLowerCase()
                  );
                  return (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 900 }}>
                      {item.prescription_number}
                    </td>

                    <td>
                      {item.patient_name ||
                        t("rx_resident_hash", lang, {
                          id: item.resident_profile_id,
                        })}
                    </td>

                    <td>{item.diagnosis || "—"}</td>

                    <td>
                      <div style={{ display: "grid", gap: 6 }}>
                        <span
                          style={
                            rowIsLabRequest
                              ? labRequestBadgeStyle
                              : medicineBadgeStyle
                          }
                        >
                          {rowIsLabRequest ? "Lab Request" : "Medicine"}
                        </span>

                        {rowIsLabRequest ? (
                          <small style={mutedCellTextStyle}>
                            Doctor requested laboratory
                          </small>
                        ) : null}

                        {rowIsLabRequest && (
                          <>
                            <span>{summarizeLabTests(item.lab_tests)}</span>

                            {item.priority && (
                              <small style={mutedCellTextStyle}>
                                Priority: {item.priority}
                              </small>
                            )}

                            {item.request_reason && (
                              <small style={mutedCellTextStyle}>
                                Reason: {item.request_reason}
                              </small>
                            )}
                          </>
                        )}
                      </div>

                      <span style={{ display: rowIsLabRequest ? "none" : "inline" }}>
                      {item.medications?.length
                        ? item.medications.map((med) => med.name).join(", ")
                        : "—"}
                      </span>
                    </td>

                    <td>
                      {formatDate(item.prescription_date || item.created_at)}
                    </td>

                    <td>
                      <div style={{ display: "grid", gap: 6 }}>
                        <span className={`badge ${statusClass(item.status)}`}>
                          {getRxStatusLabel(item.status, lang)}
                        </span>
                        <StatusBadge
                          label={lifecycle.label}
                          tone={lifecycle.tone}
                          size="sm"
                        />
                        {rowIsLabRequest ? (
                          <small style={mutedCellTextStyle}>
                            {lifecycle.key === "completed"
                              ? "Released Lab Request PDF"
                              : labExpired
                              ? "Expired lab request. Renew/update date if backend supports it."
                              : lifecycle.key === "available_today"
                              ? "Available today"
                              : "Draft / For release"}
                          </small>
                        ) : null}
                      </div>
                    </td>

                    <td>
                      <div style={actionGroupStyle}>
                        {!readOnlyRecord && (
                        <button
                          className="btn-secondary"
                          style={smallButton}
                          disabled={actionId === item.id}
                          onClick={() => onRelease(item)}
                        >
                          <Send size={13} />
                          {rowIsLabRequest
                            ? labExpired
                              ? "Review Expired Lab Request"
                              : "Release Lab Request PDF"
                            : t("rx_btn_release", lang)}
                        </button>
                        )}

                        <button
                          className="btn-secondary"
                          style={smallButton}
                          disabled={actionId === item.id}
                          onClick={() => onPdf(item)}
                        >
                          <Download size={13} />
                          {t("rx_btn_open_pdf", lang)}
                        </button>

                        {!rowIsLabRequest && !readOnlyRecord && (
                        <button
                          className="btn-secondary"
                          style={smallButton}
                          disabled={actionId === item.id}
                          onClick={() => onDispense(item)}
                        >
                          {t("rx_btn_dispense", lang)}
                        </button>
                        )}

                        {!readOnlyRecord && (
                        <button
                          className="btn-secondary"
                          style={dangerSmallButton}
                          disabled={actionId === item.id}
                          onClick={() => onVoid(item)}
                        >
                          <Trash2 size={13} />
                          {t("rx_btn_void", lang)}
                        </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pg.total > 0 ? (
          <TablePagination
            page={pg.page}
            pageCount={pg.pageCount}
            total={pg.total}
            from={pg.from}
            to={pg.to}
            pageSize={pg.pageSize}
            onPage={pg.setPage}
            onPageSize={pg.setPageSize}
            label="prescriptions"
          />
        ) : null}
      </section>

      {modal && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeaderStyle}>
              <div>
                <h2 style={modalTitleStyle}>
                  {form.form_type === "lab_request"
                    ? "New Laboratory Request"
                    : "New Prescription"}
                </h2>

                <p style={modalSubtitleStyle}>
                  Search a patient. The system will automatically use the
                  correct Resident Profile ID.
                </p>
              </div>

              <button onClick={closeCreateModal} style={plainIconButton}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={onCreate} style={{ display: "grid", gap: 14 }}>
              <div style={formTypePanelStyle}>
                <span style={fieldLabelStyle}>What are you creating?</span>

                <div style={formTypeGridStyle}>
                  <button
                    type="button"
                    style={{
                      ...formTypeButtonStyle,
                      ...(form.form_type === "medicine"
                        ? formTypeButtonActiveStyle
                        : {}),
                    }}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        form_type: "medicine",
                        medications: prev.medications.length
                          ? prev.medications
                          : [{ ...emptyMedication }],
                      }))
                    }
                  >
                    Medicine Prescription
                  </button>

                  <button
                    type="button"
                    style={{
                      ...formTypeButtonStyle,
                      ...(form.form_type === "lab_request"
                        ? formTypeButtonActiveStyle
                        : {}),
                    }}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        form_type: "lab_request",
                        clinical_impression:
                          prev.clinical_impression || prev.diagnosis,
                        priority: prev.priority || "routine",
                      }))
                    }
                  >
                    Laboratory Request
                  </button>
                </div>
              </div>

              <PatientSearchField
                lang={lang}
                value={patientSearch}
                onChange={(value) => {
                  setPatientSearch(value);
                  setSelectedPatient(null);
                  setForm((prev) => ({
                    ...prev,
                    resident_profile_id: "",
                  }));
                }}
                loading={patientLoading}
                results={patientResults}
                selectedPatient={selectedPatient}
                error={patientError}
                onSelect={selectPatient}
                onClear={clearSelectedPatient}
              />

              {selectedPatient && (
                <div style={selectedPatientStyle}>
                  <div>
                    <div style={selectedPatientLabelStyle}>
                      SELECTED PATIENT
                    </div>

                    <div style={selectedPatientNameStyle}>
                      {selectedPatient.full_name}
                    </div>

                    <div style={selectedPatientMetaStyle}>
                      Patient ID:{" "}
                      <strong>{selectedPatient.patient_id}</strong> · Resident
                      Profile ID:{" "}
                      <strong>{selectedPatient.resident_profile_id}</strong>
                    </div>

                    <div style={selectedPatientSubMetaStyle}>
                      {selectedPatient.mobile_number || "No mobile"} ·{" "}
                      {selectedPatient.barangay || "No barangay"}
                    </div>
                  </div>
                </div>
              )}

              <div style={twoColumnStyle}>
                <ReadonlyField
                  label="Auto Patient ID"
                  value={
                    selectedPatient?.patient_id || "Search and select patient"
                  }
                />

                <Field
                  label={t("rx_f_consultation_id", lang)}
                  value={form.consultation_id}
                  type="number"
                  onChange={(value) =>
                    setForm({ ...form, consultation_id: value })
                  }
                />
              </div>

              <Field
                label={
                  form.form_type === "lab_request"
                    ? "Diagnosis / Clinical Impression"
                    : t("con_th_diagnosis", lang)
                }
                value={form.diagnosis}
                onChange={(value) =>
                  setForm({
                    ...form,
                    diagnosis: value,
                    clinical_impression:
                      form.form_type === "lab_request"
                        ? value
                        : form.clinical_impression,
                  })
                }
              />

              <Field
                label={t("rx_f_diagnosis_code", lang)}
                value={form.diagnosis_code}
                onChange={(value) =>
                  setForm({ ...form, diagnosis_code: value })
                }
              />

              {form.form_type === "medicine" ? (
              <>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={medicineHeaderStyle}>
                  <strong>{t("rx_medicines", lang)}</strong>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={smallButton}
                    onClick={addMedication}
                  >
                    <Plus size={13} />
                    {t("rx_add_medicine", lang)}
                  </button>
                </div>

                {form.medications.map((medication, index) => (
                  <div key={index} style={medicineCardStyle}>
                    <div style={medicineTopRowStyle}>
                      <strong style={{ fontSize: 13 }}>
                        {t("rx_medicine_n", lang, {
                          n: index + 1,
                        })}
                      </strong>

                      {form.medications.length > 1 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          style={dangerSmallButton}
                          onClick={() => removeMedication(index)}
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    <MedicineAutocompleteField
                      label={t("rx_f_medicine_name", lang)}
                      value={medication.name}
                      onChange={(value) =>
                        updateMedication(index, { name: value })
                      }
                      onSelect={(medicine) =>
                        updateMedication(index, {
                          name: medicine.name,
                          generic_name: medicine.generic_name || "",
                          dosage_form: medicine.dosage_form || "",
                          dosage: medicine.strength || medication.dosage || "",
                        })
                      }
                    />

                    <div style={twoColumnStyle}>
                      <Field
                        label={t("rx_f_dosage", lang)}
                        value={medication.dosage || ""}
                        placeholder="500mg"
                        onChange={(value) =>
                          updateMedication(index, { dosage: value })
                        }
                      />

                      <Field
                        label={t("rx_f_quantity", lang)}
                        value={String(medication.quantity ?? 1)}
                        type="number"
                        onChange={(value) =>
                          updateMedication(index, {
                            quantity: Number(value || 1),
                          })
                        }
                      />
                    </div>

                    <div style={twoColumnStyle}>
                      <Field
                        label={t("rx_f_frequency", lang)}
                        value={medication.frequency || ""}
                        placeholder="3x a day"
                        onChange={(value) =>
                          updateMedication(index, { frequency: value })
                        }
                      />

                      <Field
                        label={t("rx_f_duration", lang)}
                        value={medication.duration || ""}
                        placeholder="7 days"
                        onChange={(value) =>
                          updateMedication(index, { duration: value })
                        }
                      />
                    </div>

                    <Field
                      label={t("rx_f_instructions", lang)}
                      value={medication.instructions || ""}
                      placeholder="Take after meals"
                      onChange={(value) =>
                        updateMedication(index, { instructions: value })
                      }
                    />

                    <label style={checkboxLabelStyle}>
                      <input
                        type="checkbox"
                        checked={Boolean(medication.is_controlled)}
                        onChange={(event) =>
                          updateMedication(index, {
                            is_controlled: event.target.checked,
                          })
                        }
                      />
                      {t("rx_f_controlled", lang)}
                    </label>
                  </div>
                ))}
              </div>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>
                  {t("rx_f_additional_instructions", lang)}
                </span>

                <textarea
                  className="input"
                  value={form.additional_instructions}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      additional_instructions: event.target.value,
                    })
                  }
                  style={{ minHeight: 90, resize: "vertical" }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={fieldLabelStyle}>
                  {t("rx_f_dispensing_notes", lang)}
                </span>

                <textarea
                  className="input"
                  value={form.dispensing_notes}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      dispensing_notes: event.target.value,
                    })
                  }
                  style={{ minHeight: 80, resize: "vertical" }}
                />
              </label>
              </>
              ) : (
                <div style={labRequestPanelStyle}>
                  <div>
                    <strong style={{ color: "#0F172A" }}>
                      Laboratory Request
                    </strong>
                    <p style={labRequestHelperStyle}>
                      Select all laboratory tests requested for the patient.
                    </p>
                  </div>

                  <div style={labGroupGridStyle}>
                    <LabTestGroup
                      title="Laboratory"
                      options={LABORATORY_OPTIONS}
                      selected={form.lab_tests.laboratory}
                      otherValue={form.lab_tests.others.laboratory || ""}
                      onToggle={(option, checked) =>
                        setForm((prev) => ({
                          ...prev,
                          lab_tests: updateLabSection(
                            prev.lab_tests,
                            "laboratory",
                            option,
                            checked
                          ),
                        }))
                      }
                      onOtherChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          lab_tests: {
                            ...prev.lab_tests,
                            others: {
                              ...prev.lab_tests.others,
                              laboratory: value,
                            },
                          },
                        }))
                      }
                    />

                    <LabTestGroup
                      title="X-Ray"
                      options={XRAY_OPTIONS}
                      selected={form.lab_tests.xray}
                      otherValue={form.lab_tests.others.xray || ""}
                      onToggle={(option, checked) =>
                        setForm((prev) => ({
                          ...prev,
                          lab_tests: updateLabSection(
                            prev.lab_tests,
                            "xray",
                            option,
                            checked
                          ),
                        }))
                      }
                      onOtherChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          lab_tests: {
                            ...prev.lab_tests,
                            others: {
                              ...prev.lab_tests.others,
                              xray: value,
                            },
                          },
                        }))
                      }
                    />

                    <LabTestGroup
                      title="Ultrasound"
                      options={ULTRASOUND_OPTIONS}
                      selected={form.lab_tests.ultrasound}
                      otherValue={form.lab_tests.others.ultrasound || ""}
                      onToggle={(option, checked) =>
                        setForm((prev) => ({
                          ...prev,
                          lab_tests: updateLabSection(
                            prev.lab_tests,
                            "ultrasound",
                            option,
                            checked
                          ),
                        }))
                      }
                      onOtherChange={(value) =>
                        setForm((prev) => ({
                          ...prev,
                          lab_tests: {
                            ...prev.lab_tests,
                            others: {
                              ...prev.lab_tests.others,
                              ultrasound: value,
                            },
                          },
                        }))
                      }
                    />
                  </div>

                  <div style={twoColumnStyle}>
                    <label style={{ display: "grid", gap: 6 }}>
                      <span style={fieldLabelStyle}>Priority</span>
                      <select
                        className="input"
                        value={form.priority}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            priority: event.target.value as FormState["priority"],
                          })
                        }
                      >
                        <option value="routine">Routine</option>
                        <option value="urgent">Urgent</option>
                        <option value="stat">Stat</option>
                      </select>
                    </label>

                    <Field
                      label="Reason / Indication"
                      value={form.request_reason}
                      onChange={(value) =>
                        setForm({ ...form, request_reason: value })
                      }
                    />
                  </div>

                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={fieldLabelStyle}>Request Notes</span>
                    <textarea
                      className="input"
                      value={form.request_notes}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          request_notes: event.target.value,
                        })
                      }
                      style={{ minHeight: 90, resize: "vertical" }}
                    />
                  </label>
                </div>
              )}

              <button
                type="submit"
                className="btn-primary"
                disabled={saving}
                style={{
                  width: "100%",
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                {saving
                  ? t("btn_saving_ellipsis", lang)
                  : form.form_type === "lab_request"
                  ? "Save Lab Request"
                  : "Save Prescription"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
  danger,
}: {
  label: string;
  value: number;
  icon: ReactNode;
  danger?: boolean;
}) {
  return (
    <div style={metricCardStyle}>
      <div
        style={{
          ...metricIconStyle,
          background: danger ? "#FEE2E2" : "#CCFBF1",
          color: danger ? "#B91C1C" : "#0F766E",
        }}
      >
        {icon}
      </div>

      <div>
        <div style={metricLabelStyle}>{label}</div>
        <div
          style={{
            fontSize: 28,
            fontWeight: 900,
            color: danger ? "#B91C1C" : "#0F766E",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={fieldLabelStyle}>{label}</span>

      <input
        className="input"
        value={value}
        type={type}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function LabTestGroup({
  title,
  options,
  selected,
  otherValue,
  onToggle,
  onOtherChange,
}: {
  title: string;
  options: string[];
  selected: string[];
  otherValue: string;
  onToggle: (option: string, checked: boolean) => void;
  onOtherChange: (value: string) => void;
}) {
  return (
    <fieldset style={labGroupStyle}>
      <legend style={labGroupTitleStyle}>{title}</legend>

      <div style={labCheckboxGridStyle}>
        {options.map((option) => (
          <label key={option} style={labCheckboxLabelStyle}>
            <input
              type="checkbox"
              checked={selected.includes(option)}
              onChange={(event) => onToggle(option, event.target.checked)}
            />
            <span>{option}</span>
          </label>
        ))}
      </div>

      <label style={{ display: "grid", gap: 6 }}>
        <span style={fieldLabelStyle}>Others</span>
        <input
          className="input"
          value={otherValue}
          placeholder="Enter other requested test"
          onChange={(event) => onOtherChange(event.target.value)}
        />
      </label>
    </fieldset>
  );
}

function MedicineAutocompleteField({
  label,
  value,
  onChange,
  onSelect,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (medicine: MedicineSearchResult) => void;
}) {
  const [results, setResults] = useState<MedicineSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const keyword = value.trim();

    if (keyword.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setLoading(true);

      try {
        const rows = await searchMedicines(keyword);
        setResults(rows);
        setOpen(true);
      } catch {
        setResults([]);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [value]);

  return (
    <label style={{ display: "grid", gap: 6, position: "relative" }}>
      <span style={fieldLabelStyle}>{label}</span>

      <input
        className="input"
        value={value}
        placeholder="Type medicine name, e.g. Paracetamol"
        onFocus={() => {
          if (value.trim().length >= 2) setOpen(true);
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => onChange(event.target.value)}
      />

      {open && value.trim().length >= 2 ? (
        <div style={medicineDropdownStyle}>
          {loading ? (
            <div style={medicineEmptyStyle}>Searching medicines...</div>
          ) : results.length > 0 ? (
            results.map((medicine) => (
              <button
                key={medicine.id}
                type="button"
                style={medicineOptionStyle}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(medicine);
                  setOpen(false);
                }}
              >
                <strong>{medicine.name}</strong>
                <span>
                  {[
                    medicine.generic_name,
                    medicine.dosage_form,
                    medicine.stock !== undefined && medicine.stock !== null
                      ? `Stock: ${medicine.stock}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            ))
          ) : (
            <div style={medicineEmptyStyle}>No medicine found</div>
          )}
        </div>
      ) : null}
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={fieldLabelStyle}>{label}</span>

      <input className="input" value={value} readOnly />
    </label>
  );
}

function PatientSearchField({
  lang,
  value,
  onChange,
  loading,
  results,
  selectedPatient,
  error,
  onSelect,
  onClear,
}: {
  lang: Lang;
  value: string;
  onChange: (value: string) => void;
  loading: boolean;
  results: PrescriptionPatient[];
  selectedPatient: PrescriptionPatient | null;
  error: string;
  onSelect: (patient: PrescriptionPatient) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ display: "grid", gap: 6, position: "relative" }}>
      <span style={fieldLabelStyle}>{t("rx_search_patient", lang)}</span>

      <div style={{ position: "relative" }}>
        <Search
          size={15}
          style={{
            position: "absolute",
            left: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "#94A3B8",
          }}
        />

        <input
          className="input"
          value={value}
          readOnly={Boolean(selectedPatient)}
          placeholder="Search by name, mobile number, or email..."
          onChange={(event) => onChange(event.target.value)}
          style={{
            paddingLeft: 34,
            paddingRight: selectedPatient ? 36 : 12,
          }}
        />

        {selectedPatient && (
          <button
            type="button"
            onClick={onClear}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              border: 0,
              background: "transparent",
              cursor: "pointer",
              fontWeight: 900,
            }}
          >
            ×
          </button>
        )}
      </div>

      {loading && <div style={helperTextStyle}>Searching patients...</div>}
      {error && <div style={errorMiniStyle}>{error}</div>}

      {!selectedPatient && results.length > 0 && (
        <div style={patientResultsStyle}>
          {results.map((patient) => (
            <button
              type="button"
              key={patient.resident_profile_id}
              onClick={() => onSelect(patient)}
              style={patientResultButtonStyle}
            >
              <strong>{patient.full_name}</strong>
              <span>
                {patient.patient_id} · Resident Profile ID:{" "}
                {patient.resident_profile_id}
              </span>
              <small>
                {patient.mobile_number || "No mobile"} ·{" "}
                {patient.barangay || "No barangay"}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const heroStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  flexWrap: "wrap",
  alignItems: "center",
  padding: 26,
  borderRadius: 24,
  background: "linear-gradient(135deg, #047857, #0F766E)",
  color: "white",
};

const heroTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 34,
  fontWeight: 900,
};

const heroSubtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  lineHeight: 1.7,
};

const whiteButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(255,255,255,.55)",
  background: "rgba(255,255,255,.12)",
  color: "white",
  borderRadius: 12,
  padding: "10px 14px",
  fontWeight: 800,
  cursor: "pointer",
};

const cardStyle: CSSProperties = {
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 10px 20px rgba(15,23,42,.04)",
};

const metricsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 14,
};

const metricCardStyle: CSSProperties = {
  ...cardStyle,
  display: "flex",
  alignItems: "center",
  gap: 14,
};

const metricIconStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 14,
  display: "grid",
  placeItems: "center",
};

const metricLabelStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 13,
  fontWeight: 800,
};

const successStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: 12,
  borderRadius: 14,
  background: "#ECFDF5",
  border: "1px solid #A7F3D0",
  color: "#047857",
  fontWeight: 800,
};

const errorStyle: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "#FEF2F2",
  border: "1px solid #FECACA",
  color: "#B91C1C",
  fontWeight: 800,
};

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(15,23,42,.55)",
  display: "grid",
  placeItems: "center",
  padding: 18,
};

const modalStyle: CSSProperties = {
  width: "min(760px, 100%)",
  maxHeight: "94vh",
  overflowY: "auto",
  background: "white",
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 28px 80px rgba(15,23,42,.35)",
};

const modalHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 18,
};

const modalTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 20,
};

const modalSubtitleStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748B",
  fontSize: 13,
};

const plainIconButton: CSSProperties = {
  width: 40,
  height: 40,
  border: 0,
  borderRadius: 12,
  background: "#F1F5F9",
  color: "#0F172A",
  display: "grid",
  placeItems: "center",
  cursor: "pointer",
};

const selectedPatientStyle: CSSProperties = {
  padding: 14,
  borderRadius: 14,
  border: "1px solid #86EFAC",
  background: "#ECFDF5",
};

const selectedPatientLabelStyle: CSSProperties = {
  fontSize: 12,
  color: "#047857",
  fontWeight: 900,
};

const selectedPatientNameStyle: CSSProperties = {
  fontWeight: 900,
  color: "#0F172A",
};

const selectedPatientMetaStyle: CSSProperties = {
  fontSize: 13,
  color: "#475569",
  marginTop: 3,
};

const selectedPatientSubMetaStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748B",
  marginTop: 3,
};

const fieldLabelStyle: CSSProperties = {
  color: "#475569",
  fontSize: 13,
  fontWeight: 800,
};

const formTypePanelStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderRadius: 14,
  border: "1px solid #CCFBF1",
  background: "#F0FDFA",
};

const formTypeGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
};

const formTypeButtonStyle: CSSProperties = {
  border: "1px solid #99F6E4",
  background: "#FFFFFF",
  color: "#0F172A",
  borderRadius: 12,
  padding: "12px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const formTypeButtonActiveStyle: CSSProperties = {
  background: "#0F766E",
  borderColor: "#0F766E",
  color: "#FFFFFF",
};

const medicineBadgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  width: "fit-content",
  borderRadius: 999,
  padding: "4px 9px",
  background: "#ECFDF5",
  color: "#047857",
  fontSize: 12,
  fontWeight: 900,
};

const labRequestBadgeStyle: CSSProperties = {
  ...medicineBadgeStyle,
  background: "#E0F2FE",
  color: "#0369A1",
};

const mutedCellTextStyle: CSSProperties = {
  color: "#64748B",
  fontSize: 12,
};

const labRequestPanelStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  border: "1px solid #D1FAE5",
  background: "#F8FAFC",
  borderRadius: 14,
  padding: 14,
};

const labRequestHelperStyle: CSSProperties = {
  margin: "4px 0 0",
  color: "#64748B",
  fontSize: 13,
};

const labGroupGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const labGroupStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  background: "#FFFFFF",
  padding: 12,
  margin: 0,
};

const labGroupTitleStyle: CSSProperties = {
  color: "#0F766E",
  fontSize: 13,
  fontWeight: 900,
  padding: "0 4px",
};

const labCheckboxGridStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const labCheckboxLabelStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  color: "#334155",
  fontSize: 13,
  fontWeight: 800,
};

const medicineDropdownStyle: CSSProperties = {
  position: "absolute",
  zIndex: 20,
  top: "100%",
  left: 0,
  right: 0,
  background: "#FFFFFF",
  border: "1px solid #CBD5E1",
  borderRadius: 10,
  boxShadow: "0 14px 30px rgba(15,23,42,.16)",
  overflow: "hidden",
};

const medicineOptionStyle: CSSProperties = {
  width: "100%",
  display: "grid",
  gap: 2,
  border: 0,
  borderBottom: "1px solid #E2E8F0",
  background: "#FFFFFF",
  padding: "10px 12px",
  textAlign: "left",
  cursor: "pointer",
  color: "#0F172A",
};

const medicineEmptyStyle: CSSProperties = {
  padding: "11px 12px",
  color: "#64748B",
  fontSize: 13,
};

const twoColumnStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const medicineHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const medicineCardStyle: CSSProperties = {
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  padding: 12,
  display: "grid",
  gap: 10,
};

const medicineTopRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 8,
};

const smallButton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "8px 10px",
  borderRadius: 10,
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const dangerSmallButton: CSSProperties = {
  ...smallButton,
  color: "#B91C1C",
  borderColor: "#FECACA",
};

const actionGroupStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const checkboxLabelStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  color: "#334155",
  fontSize: 13,
  fontWeight: 800,
};

const helperTextStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748B",
};

const errorMiniStyle: CSSProperties = {
  fontSize: 12,
  color: "#B91C1C",
  fontWeight: 800,
};

const patientResultsStyle: CSSProperties = {
  position: "absolute",
  zIndex: 5,
  left: 0,
  right: 0,
  top: "100%",
  marginTop: 6,
  background: "white",
  border: "1px solid #E2E8F0",
  borderRadius: 14,
  boxShadow: "0 16px 40px rgba(15,23,42,.15)",
  overflow: "hidden",
};

const patientResultButtonStyle: CSSProperties = {
  width: "100%",
  border: 0,
  background: "white",
  padding: 12,
  textAlign: "left",
  display: "grid",
  gap: 3,
  cursor: "pointer",
  color: "#0F172A",
};
