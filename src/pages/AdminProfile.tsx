// src/pages/AdminProfile.tsx

import { FormEvent, useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  User,
} from "lucide-react";

import { authService } from "../services/auth";
import { roleLabel as centralRoleLabel } from "../services/users";
import { useAuthStore } from "../store/authStore";
import { ImageUploader } from "../components/ImageUploader";

export default function AdminProfile() {
  const currentUser = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const token = useAuthStore((state) => state.token);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    mobile_number: "",
    barangay: "",
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: "",
    password: "",
    password_confirmation: "",
  });

  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");

    try {
      const user = await authService.getMyProfile();

      setForm({
        first_name: user.first_name ?? "",
        last_name: user.last_name ?? "",
        email: user.email ?? "",
        mobile_number: user.mobile_number ?? user.phone ?? "",
        barangay: user.barangay ?? "",
      });

      setRole(String(user.role ?? ""));
      setStatus(String(user.account_status ?? user.status ?? ""));
      setAvatarUrl((user as any).avatar_url ?? (user as any).avatar ?? null);

      if (token) {
        setAuth(user, token);
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to load profile."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleAvatar(file: File | null) {
    if (!file) return;

    setUploadingAvatar(true);
    setError("");
    setSaved("");

    try {
      const { avatar_url } = await authService.uploadAvatar(file);
      setAvatarUrl(avatar_url);
      // Refresh currentUser (via setAuth in load) so the new picture appears
      // everywhere it is used, including the Team Chat avatar.
      await load();
      setSaved("Profile picture updated.");
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Could not upload your profile picture."
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  function updatePassword(key: keyof typeof passwordForm, value: string) {
    setPasswordForm((current) => ({ ...current, [key]: value }));
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSavingProfile(true);
    setSaved("");
    setError("");

    try {
      const updated = await authService.updateMyProfile({
        ...form,
        email: form.email.trim() || null,
        barangay: form.barangay.trim() || null,
      });

      if (token) {
        setAuth(updated, token);
      }

      setSaved("Profile updated successfully.");
    } catch (err: any) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to update profile."
      );
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setSavingPassword(true);
    setSaved("");
    setError("");

    try {
      await authService.changePassword(passwordForm);

      setPasswordForm({
        current_password: "",
        password: "",
        password_confirmation: "",
      });

      setSaved("Password changed successfully.");
    } catch (err: any) {
      const errors = err?.response?.data?.errors;
      const firstError = errors
        ? Object.values(errors).flat().filter(Boolean)[0]
        : null;

      setError(
        String(
          firstError ||
            err?.response?.data?.message ||
            err?.message ||
            "Failed to change password."
        )
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.hero}>
        <div>
          <div style={styles.kicker}>
            <ShieldCheck size={16} />
            Account Profile
          </div>

          <h1 style={styles.title}>My Profile</h1>

          <p style={styles.subtitle}>
            Review your RHU staff account details. Keep your mobile number
            updated because it is used for secure login.
          </p>
        </div>

        <button onClick={load} style={styles.refreshButton}>
          <RefreshCw size={17} />
          Refresh
        </button>
      </section>

      {saved ? (
        <div style={styles.successBox}>
          <CheckCircle2 size={18} />
          {saved}
        </div>
      ) : null}

      {error ? (
        <div style={styles.errorBox}>
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}

      {loading ? (
        <div style={styles.card}>Loading profile...</div>
      ) : (
        <div style={styles.grid}>
          <section style={styles.card}>
            <div style={styles.profileHeader}>
              <div style={styles.avatar}>
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
                  />
                ) : (
                  (form.first_name || currentUser?.name || "A").slice(0, 1).toUpperCase()
                )}
              </div>

              <div>
                <h2 style={styles.cardTitle}>
                  {form.first_name} {form.last_name}
                </h2>
                <p style={styles.cardSub}>
                  {roleLabel(role)} • {statusLabel(status)}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <ImageUploader
                label={uploadingAvatar ? "Uploading photo…" : "Profile Picture (used in Team Chat)"}
                value={avatarUrl}
                onChange={handleAvatar}
                maxSizeMB={4}
                aspect={1}
              />
              <p style={{ fontSize: 11.5, color: "#6B7280", margin: "6px 0 0" }}>
                A square photo helps coworkers recognize you in Team Chat.
              </p>
            </div>

            <form onSubmit={saveProfile} style={styles.form}>
              <div style={styles.twoCols}>
                <Field label="First Name" icon={<User size={17} />}>
                  <input
                    value={form.first_name}
                    onChange={(event) => update("first_name", event.target.value)}
                    style={styles.input}
                    required
                  />
                </Field>

                <Field label="Last Name" icon={<User size={17} />}>
                  <input
                    value={form.last_name}
                    onChange={(event) => update("last_name", event.target.value)}
                    style={styles.input}
                    required
                  />
                </Field>
              </div>

              <Field label="Mobile Number" icon={<Phone size={17} />}>
                <input
                  value={form.mobile_number}
                  onChange={(event) =>
                    update("mobile_number", event.target.value)
                  }
                  placeholder="09XXXXXXXXX"
                  inputMode="tel"
                  style={styles.input}
                  required
                />
              </Field>

              <Field label="Email Optional" icon={<Mail size={17} />}>
                <input
                  value={form.email}
                  onChange={(event) => update("email", event.target.value)}
                  type="email"
                  style={styles.input}
                />
              </Field>

              <Field label="Barangay Optional" icon={<MapPin size={17} />}>
                <input
                  value={form.barangay}
                  onChange={(event) => update("barangay", event.target.value)}
                  style={styles.input}
                />
              </Field>

              <button
                type="submit"
                disabled={savingProfile}
                style={styles.primaryButton}
              >
                <Save size={18} />
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </form>
          </section>

          <section style={styles.card}>
            <h2 style={styles.cardTitle}>Change Password</h2>
            <p style={styles.cardSub}>
              Use a strong password with uppercase, lowercase, number, and
              symbol.
            </p>

            <form onSubmit={changePassword} style={styles.form}>
              <Field label="Current Password" icon={<Lock size={17} />}>
                <input
                  value={passwordForm.current_password}
                  onChange={(event) =>
                    updatePassword("current_password", event.target.value)
                  }
                  type="password"
                  style={styles.input}
                  required
                />
              </Field>

              <Field label="New Password" icon={<Lock size={17} />}>
                <input
                  value={passwordForm.password}
                  onChange={(event) =>
                    updatePassword("password", event.target.value)
                  }
                  type="password"
                  style={styles.input}
                  required
                />
              </Field>

              <Field label="Confirm New Password" icon={<Lock size={17} />}>
                <input
                  value={passwordForm.password_confirmation}
                  onChange={(event) =>
                    updatePassword("password_confirmation", event.target.value)
                  }
                  type="password"
                  style={styles.input}
                  required
                />
              </Field>

              <button
                type="submit"
                disabled={savingPassword}
                style={styles.secondaryButton}
              >
                <Lock size={18} />
                {savingPassword ? "Updating..." : "Update Password"}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label style={styles.label}>
      <span style={styles.labelText}>
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function roleLabel(role: string) {
  // Delegate to the central mapper so the panelist relabels ("MHO (Doctor)",
  // "RHU Admin (Super Admin)") appear here too; empty stays "RHU Staff".
  return role ? centralRoleLabel(role) : "RHU Staff";
}

function statusLabel(status: string) {
  return status ? status.replace(/_/g, " ").replace(/\b\w/g, (x) => x.toUpperCase()) : "Active";
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: 24,
    background: "#F8FAFC",
    minHeight: "100vh",
  },
  hero: {
    background: "linear-gradient(135deg, #064E3B, #14B8A6)",
    color: "#FFFFFF",
    borderRadius: 28,
    padding: 28,
    display: "flex",
    justifyContent: "space-between",
    gap: 20,
    alignItems: "center",
    marginBottom: 20,
  },
  kicker: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 900,
    color: "#A7F3D0",
    marginBottom: 10,
  },
  title: {
    margin: 0,
    fontSize: 36,
    fontWeight: 900,
    letterSpacing: "-0.04em",
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#D1FAE5",
    maxWidth: 720,
    lineHeight: 1.6,
    fontWeight: 600,
  },
  refreshButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "12px 16px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.35)",
    background: "rgba(255,255,255,0.12)",
    color: "#FFFFFF",
    fontWeight: 900,
    cursor: "pointer",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1.2fr 0.8fr",
    gap: 20,
  },
  card: {
    background: "#FFFFFF",
    borderRadius: 24,
    border: "1px solid #E2E8F0",
    boxShadow: "0 16px 40px rgba(15,23,42,0.06)",
    padding: 24,
  },
  profileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 22,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 22,
    background: "#ECFDF5",
    color: "#047857",
    display: "grid",
    placeItems: "center",
    fontSize: 28,
    fontWeight: 900,
  },
  cardTitle: {
    margin: 0,
    color: "#0F172A",
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: "-0.03em",
  },
  cardSub: {
    margin: "6px 0 0",
    color: "#64748B",
    lineHeight: 1.5,
    fontWeight: 600,
  },
  form: {
    display: "grid",
    gap: 16,
    marginTop: 18,
  },
  twoCols: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 16,
  },
  label: {
    display: "grid",
    gap: 8,
  },
  labelText: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    color: "#334155",
    fontWeight: 900,
    fontSize: 14,
  },
  input: {
    width: "100%",
    height: 50,
    borderRadius: 16,
    border: "1px solid #CBD5E1",
    background: "#F8FAFC",
    padding: "0 14px",
    fontSize: 15,
    fontWeight: 700,
    outline: "none",
    boxSizing: "border-box",
  },
  primaryButton: {
    height: 52,
    borderRadius: 16,
    border: "none",
    background: "#047857",
    color: "#FFFFFF",
    fontWeight: 900,
    fontSize: 15,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    cursor: "pointer",
  },
  secondaryButton: {
    height: 52,
    borderRadius: 16,
    border: "1px solid #A7F3D0",
    background: "#ECFDF5",
    color: "#047857",
    fontWeight: 900,
    fontSize: 15,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    cursor: "pointer",
  },
  successBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: "#ECFDF5",
    color: "#047857",
    border: "1px solid #A7F3D0",
    fontWeight: 900,
    marginBottom: 16,
  },
  errorBox: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    background: "#FEF2F2",
    color: "#991B1B",
    border: "1px solid #FECACA",
    fontWeight: 900,
    marginBottom: 16,
  },
};