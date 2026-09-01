// src/components/ui/ConfirmDialog.tsx
// Centered confirmation modal used before destructive/irreversible actions.
// Controlled via `open`.
//
// Supports two independent safeguards, which can be combined:
//
//   matchText     — type-to-confirm. The user must retype the record's real
//                   name before the confirm button enables. Friction that
//                   forces the actor to look at WHICH record they are about to
//                   destroy; it is a UX guard, NOT a security boundary, and
//                   never replaces backend authorization.
//   requireReason — captures the "why" that the audit trail stores.
//
// Both patterns already existed separately in this app (Events had the typed
// match, Announcements had the reason box), each as a private copy inside a
// very large page file. This shared component is the two of them merged so new
// call sites reuse one implementation instead of adding a third.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import {
  color,
  dangerButton,
  ghostButton,
  primaryButton,
  radius,
  shadow,
  space,
} from "../../theme/tokens";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  busy?: boolean;

  /**
   * When set, the user must retype this string before confirming. Matching is
   * case-insensitive and whitespace-trimmed: the point is to prove the actor
   * identified the right record, and casing does not distinguish one record
   * from another — failing someone over "paracetamol" vs "Paracetamol" adds
   * frustration, not safety.
   */
  matchText?: string;
  matchLabel?: ReactNode;

  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  defaultReason?: string;
  /** Minimum characters for a reason to count as given. */
  minReasonLength?: number;

  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const normalize = (value: string) => value.trim().toLowerCase();

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy,
  matchText,
  matchLabel,
  requireReason = false,
  reasonLabel = "Reason",
  reasonPlaceholder = "Why is this being removed?",
  defaultReason = "",
  minReasonLength = 1,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState(defaultReason);
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Reset every time the dialog opens. Without this a previous successful match
  // would still be sitting in state when the dialog is reopened for a DIFFERENT
  // record, leaving the confirm button already enabled for the wrong item.
  useEffect(() => {
    if (open) {
      setTyped("");
      setReason(defaultReason);
      // Focus the first guard so the safeguard is obviously the next step.
      const id = window.setTimeout(() => firstFieldRef.current?.focus(), 40);
      return () => window.clearTimeout(id);
    }
  }, [open, defaultReason, matchText]);

  if (!open) return null;

  const needsMatch = Boolean(matchText && matchText.trim());
  const matched = !needsMatch || normalize(typed) === normalize(matchText!);
  const reasonOk = !requireReason || reason.trim().length >= minReasonLength;
  const canConfirm = matched && reasonOk && !busy;

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    border: `1px solid ${color.line}`,
    borderRadius: radius.md,
    padding: "9px 11px",
    fontSize: 13.5,
    outline: "none",
    fontFamily: "inherit",
  };

  const labelStyle = {
    display: "block",
    fontSize: 12,
    fontWeight: 800,
    color: color.ink,
    marginBottom: 5,
  };

  return (
    <div
      onClick={busy ? undefined : onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        display: "grid",
        placeItems: "center",
        zIndex: 80,
        padding: space.lg,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          background: color.surface,
          borderRadius: radius.xl,
          boxShadow: shadow.pop,
          padding: space["2xl"],
        }}
      >
        <div style={{ display: "flex", gap: space.md, alignItems: "flex-start" }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              background: tone === "danger" ? color.dangerBg : color.brandTintBg,
              border: `1px solid ${tone === "danger" ? color.dangerBorder : color.brandBorder}`,
              color: tone === "danger" ? color.dangerFg : color.brandDark,
            }}
          >
            <AlertTriangle size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: color.ink }}>{title}</h3>
            {message ? (
              <div style={{ marginTop: 6, fontSize: 13.5, color: color.textMuted, lineHeight: 1.55 }}>
                {message}
              </div>
            ) : null}
          </div>
        </div>

        {needsMatch ? (
          <div style={{ marginTop: space.xl }}>
            <label style={labelStyle} htmlFor="ka-confirm-match">
              {matchLabel ?? (
                <>
                  Type <code
                    style={{
                      background: color.dangerBg,
                      color: color.dangerFg,
                      border: `1px solid ${color.dangerBorder}`,
                      borderRadius: 6,
                      padding: "1px 6px",
                      fontWeight: 900,
                      wordBreak: "break-word",
                    }}
                  >{matchText}</code> to confirm deletion
                </>
              )}
            </label>
            <input
              id="ka-confirm-match"
              ref={firstFieldRef as React.Ref<HTMLInputElement>}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={matchText}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={typed.length > 0 && !matched}
              style={{
                ...fieldStyle,
                borderColor:
                  typed.length === 0
                    ? color.line
                    : matched
                      ? color.brandBorder
                      : color.dangerBorder,
              }}
            />
            {typed.length > 0 && !matched ? (
              <div style={{ marginTop: 5, fontSize: 11.5, color: color.dangerFg, fontWeight: 700 }}>
                The name does not match yet.
              </div>
            ) : null}
          </div>
        ) : null}

        {requireReason ? (
          <div style={{ marginTop: space.lg }}>
            <label style={labelStyle} htmlFor="ka-confirm-reason">
              {reasonLabel}
            </label>
            <textarea
              id="ka-confirm-reason"
              ref={!needsMatch ? (firstFieldRef as React.Ref<HTMLTextAreaElement>) : undefined}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
            {minReasonLength > 1 ? (
              <div style={{ marginTop: 5, fontSize: 11.5, color: color.textMuted }}>
                {reason.trim().length}/{minReasonLength} characters minimum
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: space.sm, marginTop: space.xl }}>
          <button type="button" onClick={onCancel} disabled={busy} style={ghostButton}>
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => canConfirm && onConfirm(reason.trim())}
            disabled={!canConfirm}
            title={
              !matched
                ? "Type the exact name to enable this"
                : !reasonOk
                  ? "Enter a reason to enable this"
                  : undefined
            }
            style={{
              ...(tone === "danger" ? dangerButton : primaryButton),
              fontWeight: 800,
              opacity: canConfirm ? 1 : 0.5,
              cursor: canConfirm ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
