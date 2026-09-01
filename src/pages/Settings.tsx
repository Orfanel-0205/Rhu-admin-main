// src/pages/Settings.tsx

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle,
  Clock3,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
  ShieldCheck,
  Send,
  Shield,
  Smartphone,
} from "lucide-react";
import { useLangStore } from "../store/langStore";
import backupsService, {
  formatBytes,
  formatRunTime,
} from "../services/backups";
import type { BackupHealth, BackupStatus } from "../services/backups";

type SettingsForm = {
  facilityName: string;
  address: string;
  contactNumber: string;
  email: string;
  operatingHours: string;

  smsProvider: string;
  smsApiKey: string;
  smsApiKeyConfigured: boolean;
  appointmentReminderHours: string;
  queueAlertAhead: string;

  sessionTimeoutMinutes: string;
  maxLoginAttempts: string;

  lastSavedAt: string;
};

// Backup state is NOT part of SettingsForm. It is reported by the server from
// backup_runs, never stored in the browser -- the whole point of Phase 1 is
// that this panel cannot claim a backup happened unless one actually did.

const STORAGE_KEY = "ka_agapay_admin_settings_v2";

const defaultSettings: SettingsForm = {
  facilityName: "RHU Malasiqui 1",
  address: "Malasiqui, Pangasinan",
  contactNumber: "+63 75 XXX XXXX",
  email: "rhu@malasiqui.gov.ph",
  operatingHours: "8:00 AM – 5:00 PM",

  smsProvider: "Semaphore PH",
  smsApiKey: "",
  smsApiKeyConfigured: true,
  appointmentReminderHours: "24",
  queueAlertAhead: "3",

  sessionTimeoutMinutes: "60",
  maxLoginAttempts: "5",

  lastSavedAt: "",
};

function copyForLang(lang: string) {
  const pag = lang === "pag";
  const tag = lang === "tag" || lang === "tl" || lang === "fil";

  return {
    title: pag ? "Settings Management" : tag ? "Pamamahala ng Settings" : "Settings Management",
    subtitle: pag
      ? "Ayosen so RHU information, notifications, security, tan backup settings ed malinew tan sigurado ya paraan."
      : tag
      ? "Ayusin ang RHU information, notifications, security, at backup settings sa malinaw at ligtas na paraan."
      : "Manage RHU information, notifications, security, and backup settings clearly and safely.",

    eyebrow: "Ka-Agapay System Control",
    heroSteps: pag
      ? "Step 1: Suriin so detalye   Step 2: I-save so valid settings   Step 3: I-test so SMS tan backup"
      : tag
      ? "Step 1: Suriin ang detalye   Step 2: I-save ang valid settings   Step 3: I-test ang SMS at backup"
      : "Step 1: Review details   Step 2: Save valid settings   Step 3: Test SMS and backup",

    saveAll: pag ? "I-save Amin" : tag ? "I-save Lahat" : "Save All",
    reset: pag ? "I-reset Changes" : tag ? "I-reset ang Changes" : "Reset Changes",
    testSms: pag ? "I-test SMS" : tag ? "I-test SMS" : "Test SMS",

    saved: pag ? "Na-save so settings." : tag ? "Na-save ang settings." : "Settings saved successfully.",
    resetDone: pag ? "Na-reset so unsaved changes." : tag ? "Na-reset ang unsaved changes." : "Unsaved changes were reset.",
    smsLooksValid: pag
      ? "Mukhang valid so SMS configuration. Actual sending et depende ed backend provider."
      : tag
      ? "Mukhang valid ang SMS configuration. Ang actual sending ay depende pa rin sa backend provider."
      : "SMS configuration looks valid. Actual sending still depends on the backend provider.",

    unsaved: pag ? "Walay unsaved changes" : tag ? "May unsaved changes" : "Unsaved changes",
    noUnsaved: pag ? "Saved" : tag ? "Saved" : "Saved",

    rhuInfo: pag ? "RHU Information" : tag ? "RHU Information" : "RHU Information",
    rhuInfoHelp: pag
      ? "Sayan so impormasyon ya nanengneng na staff tan residents."
      : tag
      ? "Ito ang impormasyon na nakikita ng staff at residents."
      : "This is the information staff and residents will see.",

    notifications: pag ? "Notifications & SMS" : tag ? "Notifications & SMS" : "Notifications & SMS",
    notificationsHelp: pag
      ? "Controls parad appointment reminders tan queue alerts."
      : tag
      ? "Controls para sa appointment reminders at queue alerts."
      : "Controls appointment reminders and queue alerts.",

    security: pag ? "Security Rules" : tag ? "Security Rules" : "Security Rules",
    securityHelp: pag
      ? "Proteksyon parad admin panel tan login attempts."
      : tag
      ? "Proteksyon para sa admin panel at login attempts."
      : "Protection for the admin panel and login attempts.",

    backup: pag ? "Backup & Retention" : tag ? "Backup & Retention" : "Backup & Retention",
    backupHelp: pag
      ? "Siguraduhen ya walay kopya na importanteng data."
      : tag
      ? "Siguraduhing may kopya ng importanteng data."
      : "Make sure important data has a safe copy.",

    facilityName: pag ? "Facility Name" : tag ? "Facility Name" : "Facility Name",
    facilityNameHelp: pag
      ? "Ngaran na RHU ya ipapakita ed system."
      : tag
      ? "Pangalan ng RHU na ipapakita sa system."
      : "RHU name shown in the system.",

    address: pag ? "Address" : tag ? "Address" : "Address",
    addressHelp: pag
      ? "Lokasyon na RHU parad residents."
      : tag
      ? "Lokasyon ng RHU para sa residents."
      : "RHU location for residents.",

    contactNumber: pag ? "Contact Number" : tag ? "Contact Number" : "Contact Number",
    contactNumberHelp: pag
      ? "Number ya tatawagan na residents no walay concern."
      : tag
      ? "Number na tatawagan ng residents kung may concern."
      : "Number residents can call for concerns.",

    email: pag ? "Email Address" : tag ? "Email Address" : "Email Address",
    emailHelp: pag
      ? "Official email na RHU."
      : tag
      ? "Official email ng RHU."
      : "Official RHU email.",

    hours: pag ? "Operating Hours" : tag ? "Operating Hours" : "Operating Hours",
    hoursHelp: pag
      ? "Oras ya bukas so RHU."
      : tag
      ? "Oras na bukas ang RHU."
      : "RHU open hours.",

    smsProvider: pag ? "SMS Provider" : tag ? "SMS Provider" : "SMS Provider",
    smsProviderHelp: pag
      ? "Provider ya usar parad text alerts."
      : tag
      ? "Provider na gagamitin para sa text alerts."
      : "Provider used for text alerts.",

    smsApiKey: pag ? "SMS API Key" : tag ? "SMS API Key" : "SMS API Key",
    smsApiKeyHelp: pag
      ? "Sensitive key. Ag ipakita ed ordinary staff. I-enter labat no papalitan."
      : tag
      ? "Sensitive key. Huwag ipakita sa ordinary staff. I-enter lang kung papalitan."
      : "Sensitive key. Do not show to ordinary staff. Enter only if replacing.",

    reminderHours: pag
      ? "Appointment Reminder"
      : tag
      ? "Appointment Reminder"
      : "Appointment Reminder",
    reminderHoursHelp: pag
      ? "Pigay oras antis appointment ya mansend na reminder."
      : tag
      ? "Ilang oras bago appointment magpapadala ng reminder."
      : "How many hours before appointment to send a reminder.",

    queueAlert: pag ? "Queue Alert" : tag ? "Queue Alert" : "Queue Alert",
    queueAlertHelp: pag
      ? "Pigay number antis turn nen patient ya mansend na alert."
      : tag
      ? "Ilang number bago turn ng patient magpapadala ng alert."
      : "How many numbers before the patient's turn to send an alert.",

    sessionTimeout: pag ? "Session Timeout" : tag ? "Session Timeout" : "Session Timeout",
    sessionTimeoutHelp: pag
      ? "Minutes antis automatic logout parad security."
      : tag
      ? "Minutes bago automatic logout para sa security."
      : "Minutes before automatic logout for security.",

    maxLogin: pag ? "Max Login Attempts" : tag ? "Max Login Attempts" : "Max Login Attempts",
    maxLoginHelp: pag
      ? "Pigay maling login antis ma-lock so account."
      : tag
      ? "Ilang maling login bago ma-lock ang account."
      : "Wrong login attempts before account lock.",

    lastBackup: pag ? "Last Backup" : tag ? "Last Backup" : "Last Backup",

    backupHealthy: pag
      ? "Naprotektaan so database"
      : tag
      ? "Protektado ang database"
      : "Database is protected",
    backupHealthyHelp: pag
      ? "Nasiguro so pinakabalon backup tan awalay kopya ed labas na server."
      : tag
      ? "Matagumpay ang huling backup at may kopya sa labas ng server."
      : "The most recent backup succeeded and a copy is stored off the server.",

    backupNever: pag
      ? "Anggapo ni backup ya nirekord"
      : tag
      ? "Wala pang naitalang backup"
      : "No backups recorded yet",
    backupNeverHelp: pag
      ? "Anggapoy nirekord ya backup. Kaukolan ya i-install so nightly job ed server. Ipanengneng iya ed IT."
      : tag
      ? "Walang naitalang backup. Kailangang i-install ang nightly job sa server. Ipaalam ito sa IT."
      : "Nothing has run yet. The nightly job still needs to be installed on the server — raise this with IT.",

    backupStale: pag
      ? "Abayag lay sampot ya backup"
      : tag
      ? "Matagal nang walang backup"
      : "Backup is overdue",
    backupStaleHelp: pag
      ? "Say sampot ya matalona ya backup et abayag la. Nayarin tinmundá so nightly job."
      : tag
      ? "Matagal na ang huling matagumpay na backup. Maaaring tumigil ang nightly job."
      : "The last successful backup is older than expected. The nightly job may have stopped running.",

    backupUnprotected: pag
      ? "Say backup et wadman ni labat ed server"
      : tag
      ? "Nasa server pa lang ang backup"
      : "Backup has not left the server",
    backupUnprotectedHelp: pag
      ? "Matalona so dump balet ag ni ni-upload ed labas. No naderal so server, naderal met so backup."
      : tag
      ? "Matagumpay ang dump pero hindi pa naililipat sa labas. Kung masira ang server, kasama ang backup."
      : "The dump succeeded but has not been copied off the server. If the server fails, this copy fails with it.",

    backupUnknown: pag
      ? "Ag naamtaan so status na backup"
      : tag
      ? "Hindi malaman ang status ng backup"
      : "Backup status unavailable",

    backupRunsTitle: pag ? "Sampot ya Runs" : tag ? "Mga Huling Run" : "Recent runs",
    backupCronNote: pag
      ? "Automatiko ya ontatakbo so backup kada labi diad server (cron). Anggapoy button dia ta agto sarag ya patakboen na browser."
      : tag
      ? "Tumatakbo ang backup gabi-gabi sa server (cron). Walang button dito dahil hindi ito kayang patakbuhin ng browser."
      : "Backups run nightly on the server via cron. There is no button here because a browser cannot run one — this panel reports what the server did.",
    backupRefresh: pag ? "I-refresh" : tag ? "I-refresh" : "Refresh",
    backupLoading: pag ? "Manlolodá..." : tag ? "Nilo-load..." : "Loading backup status…",
    backupOffsite: pag ? "Kopya ed labas" : tag ? "Kopya sa labas" : "Off-site copy",
    lastSaved: pag ? "Last Saved" : tag ? "Last Saved" : "Last Saved",

    configured: pag ? "Configured" : tag ? "Configured" : "Configured",
    notConfigured: pag ? "Not configured" : tag ? "Not configured" : "Not configured",

    safetyTitle: pag ? "Real-life safety reminders" : tag ? "Real-life safety reminders" : "Real-life safety reminders",
    safetyBody: pag
      ? "Agbasta salatan so SMS key, security rules, odino backup settings. Say settings et makaapekto ed reminders, login safety, tan data recovery."
      : tag
      ? "Huwag basta palitan ang SMS key, security rules, o backup settings. Ang settings na ito ay nakakaapekto sa reminders, login safety, at data recovery."
      : "Do not casually change the SMS key, security rules, or backup settings. These affect reminders, login safety, and data recovery.",

    errorsTitle: pag ? "Ayosen ni saraya:" : tag ? "Ayusin muna ang mga ito:" : "Fix these first:",
    apiReplacePlaceholder: pag
      ? "Enter new key only if replacing"
      : tag
      ? "Ilagay lang kung papalitan"
      : "Enter new key only if replacing",

    yes: pag ? "On" : tag ? "Oo" : "Yes",
    no: pag ? "Andi" : tag ? "Hindi" : "No",
  };
}

function loadInitialSettings(): SettingsForm {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return defaultSettings;
    }

    const parsed = JSON.parse(saved);

    return {
      ...defaultSettings,
      ...parsed,
      smsApiKey: "",
    };
  } catch {
    return defaultSettings;
  }
}

function stripSecret(settings: SettingsForm) {
  return {
    ...settings,
    smsApiKey: "",
  };
}

function nowText() {
  return new Date().toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toInt(value: string) {
  return Number.parseInt(String(value || "").trim(), 10);
}

function isValidEmail(value: string) {
  if (!value.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export default function Settings() {
  const lang = useLangStore((state) => state.lang);
  const c = copyForLang(lang);

  const [settings, setSettings] = useState<SettingsForm>(() =>
    loadInitialSettings()
  );

  const [snapshot, setSnapshot] = useState(() =>
    JSON.stringify(stripSecret(loadInitialSettings()))
  );

  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [backupLoading, setBackupLoading] = useState(true);
  const [backupError, setBackupError] = useState("");

  useEffect(() => {
    void loadBackupStatus();
    // Mount-only: the panel has an explicit Refresh control rather than polling,
    // because backups change once a night.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasChanges = useMemo(() => {
    return (
      JSON.stringify(stripSecret(settings)) !== snapshot ||
      settings.smsApiKey.trim().length > 0
    );
  }, [settings, snapshot]);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return;

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);

    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasChanges]);

  const apiStatus = settings.smsApiKeyConfigured ? c.configured : c.notConfigured;

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function flash(message: string) {
    setSaved(message);
    window.setTimeout(() => setSaved(""), 2800);
  }

  function validate(): string[] {
    const nextErrors: string[] = [];

    if (!settings.facilityName.trim()) {
      nextErrors.push("Facility Name is required.");
    }

    if (!settings.address.trim()) {
      nextErrors.push("Address is required.");
    }

    if (!settings.contactNumber.trim()) {
      nextErrors.push("Contact Number is required.");
    }

    if (!isValidEmail(settings.email)) {
      nextErrors.push("Email format is invalid.");
    }

    if (!settings.operatingHours.trim()) {
      nextErrors.push("Operating Hours is required.");
    }

    if (!settings.smsProvider.trim()) {
      nextErrors.push("SMS Provider is required.");
    }

    const reminder = toInt(settings.appointmentReminderHours);
    if (Number.isNaN(reminder) || reminder < 1 || reminder > 168) {
      nextErrors.push("Appointment Reminder must be between 1 and 168 hours.");
    }

    const queueAlert = toInt(settings.queueAlertAhead);
    if (Number.isNaN(queueAlert) || queueAlert < 1 || queueAlert > 20) {
      nextErrors.push("Queue Alert must be between 1 and 20.");
    }

    const timeout = toInt(settings.sessionTimeoutMinutes);
    if (Number.isNaN(timeout) || timeout < 10 || timeout > 480) {
      nextErrors.push("Session Timeout must be between 10 and 480 minutes.");
    }

    const maxLogin = toInt(settings.maxLoginAttempts);
    if (Number.isNaN(maxLogin) || maxLogin < 3 || maxLogin > 10) {
      nextErrors.push("Max Login Attempts must be between 3 and 10.");
    }

    return nextErrors;
  }

  function saveSettings() {
    const nextErrors = validate();

    setErrors(nextErrors);

    if (nextErrors.length > 0) {
      return;
    }

    const toSave: SettingsForm = {
      ...settings,
      smsApiKey: "",
      smsApiKeyConfigured:
        settings.smsApiKeyConfigured || settings.smsApiKey.trim().length > 0,
      lastSavedAt: nowText(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    setSettings(toSave);
    setSnapshot(JSON.stringify(stripSecret(toSave)));

    flash(c.saved);
  }

  function resetChanges() {
    const loaded = loadInitialSettings();
    setSettings(loaded);
    setSnapshot(JSON.stringify(stripSecret(loaded)));
    setErrors([]);
    flash(c.resetDone);
  }

  function testSmsConfiguration() {
    const nextErrors = validate();

    if (!settings.smsApiKeyConfigured && !settings.smsApiKey.trim()) {
      nextErrors.push("SMS API Key is not configured.");
    }

    setErrors(nextErrors);

    if (nextErrors.length > 0) {
      return;
    }

    flash(c.smsLooksValid);
  }

  async function loadBackupStatus() {
    setBackupLoading(true);
    setBackupError("");

    try {
      setBackup(await backupsService.status(5));
    } catch (error) {
      setBackup(null);
      setBackupError(getBackupErrorMessage(error));
    } finally {
      setBackupLoading(false);
    }
  }

  return (
    <div className="settings-page">
      <style>{pageStyles}</style>

      <section className="settings-hero">
        <div>
          <div className="hero-kicker">
            <Shield size={16} />
            {c.eyebrow}
          </div>

          <h1>{c.title}</h1>
          <p>{c.subtitle}</p>
          <div className="hero-steps">{c.heroSteps}</div>
        </div>

        <div className="hero-status-card">
          <strong>{hasChanges ? c.unsaved : c.noUnsaved}</strong>
          <span>{settings.lastSavedAt || c.lastSaved}</span>
        </div>
      </section>

      <div className="top-actions">
        <button className="btn-secondary" onClick={resetChanges} disabled={!hasChanges}>
          <RotateCcw size={16} />
          {c.reset}
        </button>

        <button className="btn-secondary" onClick={testSmsConfiguration}>
          <Send size={16} />
          {c.testSms}
        </button>

        <button className="btn-primary" onClick={saveSettings}>
          <Save size={16} />
          {c.saveAll}
        </button>
      </div>

      {saved && (
        <div className="success-message">
          <CheckCircle size={17} />
          {saved}
        </div>
      )}

      {errors.length > 0 && (
        <div className="error-panel">
          <div>
            <AlertTriangle size={18} />
          </div>

          <div>
            <strong>{c.errorsTitle}</strong>
            <ul>
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <section className="safety-banner">
        <AlertTriangle size={18} />
        <div>
          <strong>{c.safetyTitle}</strong>
          <p>{c.safetyBody}</p>
        </div>
      </section>

      <div className="settings-grid">
        <SettingsSection
          title={c.rhuInfo}
          helper={c.rhuInfoHelp}
          icon={<Building2 size={20} />}
        >
          <Field
            label={c.facilityName}
            helper={c.facilityNameHelp}
            value={settings.facilityName}
            onChange={(value) => update("facilityName", value)}
            icon={<Building2 size={16} />}
          />

          <Field
            label={c.address}
            helper={c.addressHelp}
            value={settings.address}
            onChange={(value) => update("address", value)}
            icon={<MapPin size={16} />}
          />

          <Field
            label={c.contactNumber}
            helper={c.contactNumberHelp}
            value={settings.contactNumber}
            onChange={(value) => update("contactNumber", value)}
            icon={<Phone size={16} />}
          />

          <Field
            label={c.email}
            helper={c.emailHelp}
            value={settings.email}
            onChange={(value) => update("email", value)}
            type="email"
            icon={<Mail size={16} />}
          />

          <Field
            label={c.hours}
            helper={c.hoursHelp}
            value={settings.operatingHours}
            onChange={(value) => update("operatingHours", value)}
            icon={<Clock3 size={16} />}
          />
        </SettingsSection>

        <SettingsSection
          title={c.notifications}
          helper={c.notificationsHelp}
          icon={<Bell size={20} />}
        >
          <Field
            label={c.smsProvider}
            helper={c.smsProviderHelp}
            value={settings.smsProvider}
            onChange={(value) => update("smsProvider", value)}
            icon={<Smartphone size={16} />}
          />

          <div className="field">
            <label>{c.smsApiKey}</label>

            <div className="secret-row">
              <KeyRound size={16} />

              <input
                type={showApiKey ? "text" : "password"}
                value={settings.smsApiKey}
                placeholder={c.apiReplacePlaceholder}
                onChange={(event) => update("smsApiKey", event.target.value)}
              />

              <button
                type="button"
                onClick={() => setShowApiKey((value) => !value)}
                aria-label="Toggle API key visibility"
              >
                {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <small>
              {c.smsApiKeyHelp} Status: <b>{apiStatus}</b>
            </small>
          </div>

          <Field
            label={c.reminderHours}
            helper={c.reminderHoursHelp}
            value={settings.appointmentReminderHours}
            onChange={(value) => update("appointmentReminderHours", value)}
            type="number"
            icon={<Bell size={16} />}
          />

          <Field
            label={c.queueAlert}
            helper={c.queueAlertHelp}
            value={settings.queueAlertAhead}
            onChange={(value) => update("queueAlertAhead", value)}
            type="number"
            icon={<Bell size={16} />}
          />
        </SettingsSection>

        <SettingsSection
          title={c.security}
          helper={c.securityHelp}
          icon={<Shield size={20} />}
        >
          <Field
            label={c.sessionTimeout}
            helper={c.sessionTimeoutHelp}
            value={settings.sessionTimeoutMinutes}
            onChange={(value) => update("sessionTimeoutMinutes", value)}
            type="number"
            icon={<Clock3 size={16} />}
          />

          <Field
            label={c.maxLogin}
            helper={c.maxLoginHelp}
            value={settings.maxLoginAttempts}
            onChange={(value) => update("maxLoginAttempts", value)}
            type="number"
            icon={<Shield size={16} />}
          />
        </SettingsSection>

        <SettingsSection
          title={c.backup}
          helper={c.backupHelp}
          icon={<Database size={20} />}
        >
          <BackupStatusPanel
            status={backup}
            loading={backupLoading}
            error={backupError}
            copy={c}
            onRefresh={() => void loadBackupStatus()}
          />
        </SettingsSection>
      </div>
    </div>
  );
}

function getBackupErrorMessage(error: unknown): string {
  const response = (error as { response?: { status?: number } })?.response;

  if (response?.status === 403) {
    return "You do not have permission to view backup status.";
  }

  if (response?.status === 404) {
    return "This server does not expose backup status yet. It needs the latest backend deploy.";
  }

  return "Could not reach the server to check backup status.";
}

/**
 * Reports what the nightly cron actually did. Deliberately read-only.
 *
 * Every value here comes from backup_runs on the server. If the job has never
 * run, this says so plainly instead of showing a comforting date -- that
 * fabricated "Last Backup" string is precisely what this panel replaces.
 */
function BackupStatusPanel({
  status,
  loading,
  error,
  copy,
  onRefresh,
}: {
  status: BackupStatus | null;
  loading: boolean;
  error: string;
  copy: Record<string, string>;
  onRefresh: () => void;
}) {
  if (loading) {
    return (
      <div className="backup-state backup-state-muted">
        <RefreshCw size={17} />
        <div>
          <strong>{copy.backupLoading}</strong>
        </div>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="backup-state backup-state-warn">
        <AlertTriangle size={17} />
        <div>
          <strong>{copy.backupUnknown}</strong>
          <span>{error || copy.backupUnknown}</span>
        </div>
        <button type="button" className="backup-refresh" onClick={onRefresh}>
          <RefreshCw size={14} />
          {copy.backupRefresh}
        </button>
      </div>
    );
  }

  const health: BackupHealth = status.configured ? status.health : "unknown";

  const presentation: Record<
    BackupHealth,
    { tone: string; icon: ReactNode; title: string; detail: string }
  > = {
    healthy: {
      tone: "backup-state-ok",
      icon: <ShieldCheck size={17} />,
      title: copy.backupHealthy,
      detail: copy.backupHealthyHelp,
    },
    never: {
      tone: "backup-state-bad",
      icon: <ShieldAlert size={17} />,
      title: copy.backupNever,
      detail: copy.backupNeverHelp,
    },
    stale: {
      tone: "backup-state-bad",
      icon: <ShieldAlert size={17} />,
      title: copy.backupStale,
      detail: copy.backupStaleHelp,
    },
    unprotected: {
      tone: "backup-state-warn",
      icon: <AlertTriangle size={17} />,
      title: copy.backupUnprotected,
      detail: copy.backupUnprotectedHelp,
    },
    unknown: {
      tone: "backup-state-warn",
      icon: <AlertTriangle size={17} />,
      title: copy.backupUnknown,
      detail: status.message || "",
    },
  };

  const view = presentation[health] ?? presentation.unknown;

  return (
    <div className="backup-panel">
      <div className={`backup-state ${view.tone}`}>
        {view.icon}
        <div>
          <strong>{view.title}</strong>
          <span>{view.detail}</span>
        </div>
        <button type="button" className="backup-refresh" onClick={onRefresh}>
          <RefreshCw size={14} />
          {copy.backupRefresh}
        </button>
      </div>

      {status.last_success ? (
        <div className="backup-summary">
          <div>
            <span>{copy.lastBackup}</span>
            <strong>{formatRunTime(status.last_success.started_at)}</strong>
          </div>
          <div>
            <span>Size</span>
            <strong>{formatBytes(status.last_success.file_size_bytes)}</strong>
          </div>
          <div>
            <span>{copy.backupOffsite}</span>
            <strong>{status.last_success.offsite_status}</strong>
          </div>
        </div>
      ) : null}

      {status.runs.length > 0 ? (
        <div className="backup-runs">
          <h4>{copy.backupRunsTitle}</h4>
          <ul>
            {status.runs.map((run) => (
              <li key={run.id}>
                <span className={`backup-dot backup-dot-${run.status}`} aria-hidden="true" />
                <span className="backup-run-time">{formatRunTime(run.started_at)}</span>
                <span className="backup-run-status">{run.status}</span>
                <span className="backup-run-size">
                  {run.status === "failed"
                    ? run.error_message?.split(/\r?\n/)[0] || "failed"
                    : formatBytes(run.file_size_bytes)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="backup-note">{copy.backupCronNote}</p>
    </div>
  );
}

function SettingsSection({
  title,
  helper,
  icon,
  children,
}: {
  title: string;
  helper: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="section-header">
        <div className="section-icon">{icon}</div>

        <div>
          <h2>{title}</h2>
          <p>{helper}</p>
        </div>
      </div>

      <div className="section-fields">{children}</div>
    </section>
  );
}

function Field({
  label,
  helper,
  value,
  onChange,
  type = "text",
  icon,
}: {
  label: string;
  helper: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>

      <div className="input-with-icon">
        {icon}
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>

      <small>{helper}</small>
    </div>
  );
}

function ToggleCard({
  label,
  helper,
  checked,
  yes,
  no,
  onChange,
}: {
  label: string;
  helper: string;
  checked: boolean;
  yes: string;
  no: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="toggle-card">
      <div>
        <strong>{label}</strong>
        <span>{helper}</span>
      </div>

      <button
        type="button"
        className={checked ? "toggle active" : "toggle"}
        onClick={() => onChange(!checked)}
      >
        {checked ? yes : no}
      </button>
    </div>
  );
}

const pageStyles = `
.settings-page {
  width: 100%;
  min-width: 0;
  display: grid;
  gap: 18px;
  padding-bottom: 40px;
}

.settings-page * {
  box-sizing: border-box;
}

.settings-hero {
  background: linear-gradient(135deg, #064E3B 0%, #0D9488 55%, #5EEAD4 100%);
  color: white;
  border-radius: 28px;
  padding: 30px 32px;
  display: flex;
  justify-content: space-between;
  align-items: stretch;
  gap: 24px;
  box-shadow: 0 18px 50px rgba(6, 95, 70, .16);
}

.hero-kicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 950;
  text-transform: uppercase;
  letter-spacing: .08em;
  opacity: .95;
}

.settings-hero h1 {
  margin: 12px 0 8px;
  font-size: clamp(30px, 4vw, 44px);
  line-height: 1.05;
  font-weight: 950;
}

.settings-hero p {
  max-width: 780px;
  margin: 0;
  line-height: 1.6;
  font-size: 15px;
  color: rgba(255,255,255,.93);
}

.hero-steps {
  margin-top: 18px;
  font-size: 13px;
  font-weight: 900;
  color: rgba(255,255,255,.96);
}

.hero-status-card {
  min-width: 190px;
  border-radius: 22px;
  background: rgba(6, 95, 70, .95);
  color: white;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  padding: 22px;
  text-align: center;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.14);
}

.hero-status-card strong {
  font-size: 18px;
}

.hero-status-card span {
  font-size: 12px;
  opacity: .85;
}

.top-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.success-message {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 16px;
  padding: 13px 16px;
  font-weight: 900;
  background: #DCFCE7;
  color: #166534;
  border: 1px solid #BBF7D0;
}

.error-panel {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-radius: 16px;
  padding: 14px 16px;
  background: #FEE2E2;
  color: #991B1B;
  border: 1px solid #FECACA;
}

.error-panel strong {
  display: block;
  margin-bottom: 6px;
}

.error-panel ul {
  margin: 0;
  padding-left: 18px;
}

.error-panel li {
  margin: 3px 0;
  font-size: 13px;
}

.safety-banner {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  color: #92400E;
  border-radius: 18px;
  padding: 14px 16px;
}

.safety-banner strong {
  display: block;
  color: #78350F;
  margin-bottom: 2px;
}

.safety-banner p {
  margin: 0;
  color: #92400E;
  font-size: 13px;
  line-height: 1.45;
}

.settings-grid {
  display: grid;
  gap: 18px;
}

.settings-section {
  background: white;
  border: 1px solid #E5E7EB;
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, .04);
}

.section-header {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  margin-bottom: 18px;
}

.section-icon {
  width: 44px;
  height: 44px;
  border-radius: 15px;
  display: grid;
  place-items: center;
  background: #CCFBF1;
  color: #0F766E;
  flex-shrink: 0;
}

.section-header h2 {
  margin: 0;
  color: #111827;
  font-size: 18px;
  font-weight: 950;
}

.section-header p {
  margin: 5px 0 0;
  color: #64748B;
  font-size: 13px;
  line-height: 1.45;
}

.section-fields {
  display: grid;
  grid-template-columns: repeat(3, minmax(220px, 1fr));
  gap: 14px;
}

.field {
  display: grid;
  gap: 6px;
}

.field label {
  color: #334155;
  font-size: 13px;
  font-weight: 950;
}

.input-with-icon,
.secret-row {
  min-height: 48px;
  border: 1px solid #CBD5E1;
  border-radius: 15px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 13px;
  color: #64748B;
  background: #F8FAFC;
}

.input-with-icon input,
.secret-row input {
  width: 100%;
  height: 46px;
  border: 0;
  outline: none;
  background: transparent;
  color: #0F172A;
  font-size: 14px;
}

.secret-row button {
  border: 0;
  background: #E2E8F0;
  color: #334155;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.field small {
  color: #64748B;
  font-size: 12px;
  line-height: 1.35;
}

.toggle-card {
  min-height: 96px;
  border: 1px solid #E2E8F0;
  background: #F8FAFC;
  border-radius: 18px;
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toggle-card strong {
  display: block;
  color: #0F172A;
  font-size: 14px;
}

.toggle-card span {
  display: block;
  margin-top: 4px;
  color: #64748B;
  font-size: 12px;
  line-height: 1.35;
}

.toggle {
  border: 1px solid #CBD5E1;
  background: white;
  color: #334155;
  border-radius: 999px;
  padding: 9px 14px;
  font-weight: 950;
  cursor: pointer;
  min-width: 76px;
}

.toggle.active {
  background: #065F46;
  color: white;
  border-color: #065F46;
}

.backup-panel {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Severity is carried by the stripe and icon as well as the words, so an
   overdue backup reads as a problem at a glance rather than needing to be
   read. */
.backup-state {
  border: 1px solid #E2E8F0;
  border-left: 4px solid #94A3B8;
  background: #F8FAFC;
  border-radius: 14px;
  padding: 14px;
  display: flex;
  align-items: flex-start;
  gap: 11px;
}

.backup-state > svg {
  flex: none;
  margin-top: 1px;
  color: #475569;
}

.backup-state > div {
  flex: 1;
  min-width: 0;
}

.backup-state strong {
  display: block;
  color: #0F172A;
  font-size: 14px;
  font-weight: 950;
}

.backup-state span {
  display: block;
  margin-top: 3px;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
}

.backup-state-ok { border-left-color: #0D9488; background: #F0FDFA; }
.backup-state-ok > svg { color: #0F766E; }

.backup-state-warn { border-left-color: #D97706; background: #FFFBEB; }
.backup-state-warn > svg { color: #B45309; }

.backup-state-bad { border-left-color: #DC2626; background: #FEF2F2; }
.backup-state-bad > svg { color: #B91C1C; }

.backup-state-muted { border-left-color: #CBD5E1; }

.backup-refresh {
  flex: none;
  border: 1px solid #CBD5E1;
  border-radius: 12px;
  background: white;
  color: #334155;
  font-weight: 900;
  font-size: 12px;
  min-height: 34px;
  padding: 0 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  white-space: nowrap;
}

.backup-refresh:hover { border-color: #94A3B8; }

.backup-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  padding: 12px 14px;
  background: white;
}

.backup-summary span {
  display: block;
  color: #64748B;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .03em;
}

.backup-summary strong {
  display: block;
  margin-top: 3px;
  color: #0F172A;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.backup-runs h4 {
  margin: 0 0 7px;
  color: #64748B;
  font-size: 11px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .03em;
}

.backup-runs ul {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid #E2E8F0;
  border-radius: 14px;
  overflow: hidden;
  background: white;
}

.backup-runs li {
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto minmax(0, 1.1fr);
  align-items: center;
  gap: 9px;
  padding: 9px 13px;
  font-size: 12px;
  border-bottom: 1px solid #F1F5F9;
}

.backup-runs li:last-child { border-bottom: 0; }

.backup-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94A3B8;
}

.backup-dot-success { background: #0D9488; }
.backup-dot-failed  { background: #DC2626; }
.backup-dot-running { background: #D97706; }

.backup-run-time { color: #0F172A; font-weight: 800; font-variant-numeric: tabular-nums; }
.backup-run-status { color: #64748B; text-transform: uppercase; font-weight: 900; font-size: 11px; }

.backup-run-size {
  color: #475569;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.backup-note {
  margin: 0;
  color: #64748B;
  font-size: 12px;
  line-height: 1.45;
}

@media (max-width: 1180px) {
  .settings-hero {
    flex-direction: column;
  }

  .hero-status-card {
    width: 100%;
    min-height: 110px;
  }

  .section-fields {
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }
}

@media (max-width: 720px) {
  .settings-hero {
    padding: 24px;
    border-radius: 22px;
  }

  .top-actions,
  .top-actions button {
    width: 100%;
  }

  .section-fields {
    grid-template-columns: 1fr;
  }

  .backup-panel,
  .toggle-card {
    flex-direction: column;
    align-items: stretch;
  }
}
`;