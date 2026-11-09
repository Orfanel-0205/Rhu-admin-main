// src/components/SignatureCard.tsx
//
// My Profile → My Signature, for the MHO and doctors.
//
// Draw it on the pad, or upload a photo of it signed on paper: the server
// extracts the signature (drops the paper, crops to the strokes) and shows the
// result before anything is saved, with a slider for faint ink or a shadowy
// photo. The photo is turned upright and shrunk in the browser first, so a
// phone picture taken sideways still reads. It appears on the e-prescriptions, lab requests and ITRs
// this person issues from the moment it is saved, never on ones issued
// before, and never on a controlled-drug prescription (official DDB form).
// Saving or removing asks for the account password again.

import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Eraser, Lock, PenLine, Trash2, Upload } from "lucide-react";

import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";
import {
  getMySignature,
  previewSignature,
  removeMySignature,
  saveMySignature,
  STRICTNESS,
  type StaffSignature,
} from "../services/signature";

type Mode = "draw" | "upload";

/**
 * The photo as an upright PNG no larger than maxSide. Browsers apply the
 * camera's rotation (EXIF) when they draw an image, which the server cannot
 * read, and a 12-megapixel photo becomes a small upload.
 */
async function uprightPng(file: File, maxSide = 1600): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file is not a picture that can be read. Use a PNG or JPG."));
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("Could not read that picture.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SignatureCard() {
  const padRef = useRef<SignaturePadHandle | null>(null);
  const [current, setCurrent] = useState<StaffSignature | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("draw");
  const [padEmpty, setPadEmpty] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [upright, setUpright] = useState<Blob | null>(null);
  const [extracted, setExtracted] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [strictness, setStrictness] = useState<number>(STRICTNESS.default);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Set once a save or a removal answers: on a slow connection the first
  // load can come back after it, and must not put the old signature back.
  const changedHere = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getMySignature()
      .then((signature) => !cancelled && !changedHere.current && setCurrent(signature))
      .catch(() => !cancelled && !changedHere.current && setError("Could not load your signature."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setUpright(null);
    setExtracted(null);
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);

    let cancelled = false;
    uprightPng(file)
      .then((blob) => !cancelled && setUpright(blob))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Extract again whenever the photo or the slider changes, after the slider
  // settles, so dragging it does not send a request per step.
  useEffect(() => {
    if (!upright) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setExtracting(true);
      setError("");
      try {
        const image = await previewSignature(upright, strictness);
        if (!cancelled) setExtracted(image);
      } catch (err: any) {
        if (!cancelled) {
          setExtracted(null);
          setError(serverMessage(err, "Could not find a signature in that photo."));
        }
      } finally {
        if (!cancelled) setExtracting(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [upright, strictness]);

  function serverMessage(err: any, fallback: string): string {
    const errors = err?.response?.data?.errors;
    const first = errors ? (Object.values(errors)[0] as string[] | undefined)?.[0] : null;
    return first || err?.response?.data?.message || fallback;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");

    const image = mode === "draw" ? await padRef.current?.toBlob() : extracted ? upright : null;
    if (!image) {
      setError(
        mode === "draw"
          ? "Sign on the pad first."
          : file
            ? "No signature was found in that photo yet. Adjust the slider or take a clearer photo."
            : "Choose a photo of your signature first."
      );
      return;
    }
    if (!password) {
      setError("Enter your current password to save your signature.");
      return;
    }

    setBusy(true);
    try {
      const res = await saveMySignature(image, mode === "draw" ? "drawn" : "uploaded", password, strictness);
      changedHere.current = true;
      setCurrent(res.signature);
      setLoading(false);
      setMessage(res.message);
      setPassword("");
      setFile(null);
      setStrictness(STRICTNESS.default);
      padRef.current?.clear();
    } catch (err: any) {
      setError(serverMessage(err, "Could not save your signature."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setMessage("");
    setError("");
    if (!password) {
      setError("Enter your current password below to remove your signature.");
      return;
    }
    if (!window.confirm("Remove your signature? Documents you issue from now on will have a blank signature line.")) {
      return;
    }

    setBusy(true);
    try {
      const res = await removeMySignature(password);
      changedHere.current = true;
      setCurrent(null);
      setLoading(false);
      setMessage(res.message);
      setPassword("");
    } catch (err: any) {
      setError(serverMessage(err, "Could not remove your signature."));
    } finally {
      setBusy(false);
    }
  }

  const canSave = !busy && password !== "" && (mode === "draw" ? !padEmpty : extracted !== null && !extracting);

  return (
    <section style={styles.card}>
      <h2 style={styles.title}>
        <PenLine size={20} />
        My Signature
      </h2>
      <p style={styles.sub}>
        Printed on the e-prescriptions, lab requests and ITRs you issue from now on. Documents issued before you
        save it stay unsigned. Controlled-drug prescriptions are never signed: they need the official DDB form.
      </p>

      {message ? (
        <div style={styles.success}>
          <CheckCircle2 size={17} />
          {message}
        </div>
      ) : null}
      {error ? (
        <div style={styles.error}>
          <AlertCircle size={17} />
          {error}
        </div>
      ) : null}

      <div style={styles.currentBox}>
        <div style={styles.currentLabel}>Current signature</div>
        {loading ? (
          <div style={styles.muted}>Loading…</div>
        ) : current?.image ? (
          <div style={styles.currentRow}>
            <img src={current.image} alt="Your saved signature" style={styles.currentImage} />
            <div style={styles.currentMeta}>
              <span>
                {current.source === "uploaded" ? "Uploaded" : "Drawn"}
                {current.saved_at ? ` · saved ${new Date(current.saved_at).toLocaleString()}` : ""}
              </span>
              <button type="button" onClick={remove} disabled={busy} style={styles.dangerButton}>
                <Trash2 size={15} />
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div style={styles.muted}>None yet: your documents print a blank signature line.</div>
        )}
      </div>

      <form onSubmit={save} style={styles.form}>
        <div style={styles.tabs} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "draw"}
            onClick={() => setMode("draw")}
            style={mode === "draw" ? styles.tabOn : styles.tab}
          >
            <PenLine size={15} />
            Draw
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "upload"}
            onClick={() => setMode("upload")}
            style={mode === "upload" ? styles.tabOn : styles.tab}
          >
            <Upload size={15} />
            Upload a photo
          </button>
        </div>

        {mode === "draw" ? (
          <div>
            <SignaturePad ref={padRef} onChange={setPadEmpty} />
            <div style={styles.padFooter}>
              <span style={styles.muted}>Sign above the line with your mouse, finger or stylus.</span>
              <button type="button" onClick={() => padRef.current?.clear()} style={styles.linkButton}>
                <Eraser size={15} />
                Clear
              </button>
            </div>
          </div>
        ) : (
          <div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              style={styles.fileInput}
            />
            <p style={styles.muted}>
              Sign on plain white paper with a dark pen and take a clear, well-lit photo with the signature filling
              most of it. The paper is removed automatically; check the result before saving.
            </p>
            {preview ? (
              <div style={styles.compare}>
                <figure style={styles.figure}>
                  <figcaption style={styles.caption}>Your photo</figcaption>
                  <img src={preview} alt="Chosen signature photo" style={styles.uploadPreview} />
                </figure>
                <figure style={styles.figure}>
                  <figcaption style={styles.caption}>
                    Extracted signature{extracting ? " (working…)" : ""}
                  </figcaption>
                  <div style={styles.extractedBox}>
                    {extracted ? (
                      <img src={extracted} alt="Signature extracted from the photo" style={styles.extractedImage} />
                    ) : (
                      <span style={styles.muted}>{extracting ? "Finding the signature…" : "Nothing found yet"}</span>
                    )}
                  </div>
                </figure>
              </div>
            ) : null}
            {preview ? (
              <label style={styles.sliderLabel}>
                <span style={styles.labelText}>Ink detection</span>
                <input
                  type="range"
                  min={STRICTNESS.min}
                  max={STRICTNESS.max}
                  step={5}
                  value={strictness}
                  onChange={(event) => setStrictness(Number(event.target.value))}
                  aria-label="Ink detection: lower picks up faint ink, higher ignores shadows"
                />
                <span style={styles.sliderEnds}>
                  <span>Picks up faint ink</span>
                  <span>Ignores shadows and smudges</span>
                </span>
              </label>
            ) : null}
          </div>
        )}

        <label style={styles.label}>
          <span style={styles.labelText}>
            <Lock size={16} />
            Current Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            style={styles.input}
          />
        </label>

        <button type="submit" disabled={!canSave} style={canSave ? styles.primary : styles.primaryDisabled}>
          <PenLine size={18} />
          {busy ? "Saving..." : current?.image ? "Replace Signature" : "Save Signature"}
        </button>
      </form>
    </section>
  );
}

const button: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  cursor: "pointer",
  fontWeight: 900,
};

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#FFFFFF",
    borderRadius: 24,
    border: "1px solid #E2E8F0",
    boxShadow: "0 16px 40px rgba(15,23,42,0.06)",
    padding: 24,
    marginTop: 20,
  },
  title: {
    margin: 0,
    color: "#0F172A",
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: "-0.03em",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  sub: { margin: "6px 0 16px", color: "#64748B", lineHeight: 1.5, fontWeight: 600, maxWidth: 820 },
  success: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    background: "#ECFDF5",
    color: "#047857",
    border: "1px solid #A7F3D0",
    fontWeight: 800,
    marginBottom: 14,
  },
  error: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 14,
    background: "#FEF2F2",
    color: "#991B1B",
    border: "1px solid #FECACA",
    fontWeight: 800,
    marginBottom: 14,
  },
  currentBox: { border: "1px solid #E2E8F0", borderRadius: 16, padding: 14, background: "#F8FAFC" },
  currentLabel: { fontWeight: 900, color: "#334155", fontSize: 14, marginBottom: 8 },
  currentRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16 },
  currentImage: { height: 64, maxWidth: 320, background: "#FFFFFF", borderRadius: 10, padding: 6, border: "1px solid #E2E8F0" },
  currentMeta: { display: "grid", gap: 8, color: "#64748B", fontWeight: 700, fontSize: 13 },
  muted: { color: "#64748B", fontWeight: 600, fontSize: 13, lineHeight: 1.5, margin: "6px 0" },
  form: { display: "grid", gap: 16, marginTop: 18, maxWidth: 720 },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap" },
  tab: {
    ...button,
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid #CBD5E1",
    background: "#FFFFFF",
    color: "#334155",
  },
  tabOn: {
    ...button,
    height: 40,
    padding: "0 14px",
    borderRadius: 12,
    border: "1px solid #047857",
    background: "#ECFDF5",
    color: "#047857",
  },
  padFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" },
  linkButton: { ...button, border: "none", background: "transparent", color: "#047857", padding: 6 },
  fileInput: { fontWeight: 700 },
  uploadPreview: { maxHeight: 140, maxWidth: "100%", borderRadius: 12, border: "1px solid #E2E8F0" },
  compare: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 8 },
  figure: { margin: 0, display: "grid", gap: 6 },
  caption: { fontWeight: 900, color: "#334155", fontSize: 13 },
  // A faint checkerboard shows that the background really is transparent.
  extractedBox: {
    minHeight: 140,
    display: "grid",
    placeItems: "center",
    borderRadius: 12,
    border: "1px solid #E2E8F0",
    backgroundColor: "#FFFFFF",
    backgroundImage:
      "linear-gradient(45deg, #F1F5F9 25%, transparent 25%), linear-gradient(-45deg, #F1F5F9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #F1F5F9 75%), linear-gradient(-45deg, transparent 75%, #F1F5F9 75%)",
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
    padding: 8,
  },
  extractedImage: { maxHeight: 120, maxWidth: "100%" },
  sliderLabel: { display: "grid", gap: 6, marginTop: 12, maxWidth: 460 },
  sliderEnds: { display: "flex", justifyContent: "space-between", color: "#64748B", fontSize: 12, fontWeight: 700 },
  label: { display: "grid", gap: 8 },
  labelText: { display: "inline-flex", alignItems: "center", gap: 8, color: "#334155", fontWeight: 900, fontSize: 14 },
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
  primary: { ...button, height: 52, borderRadius: 16, border: "none", background: "#047857", color: "#FFFFFF", fontSize: 15 },
  primaryDisabled: {
    ...button,
    height: 52,
    borderRadius: 16,
    border: "none",
    background: "#94A3B8",
    color: "#FFFFFF",
    fontSize: 15,
    cursor: "not-allowed",
  },
  dangerButton: {
    ...button,
    height: 34,
    padding: "0 12px",
    borderRadius: 10,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    color: "#B91C1C",
    fontSize: 13,
    width: "fit-content",
  },
};
