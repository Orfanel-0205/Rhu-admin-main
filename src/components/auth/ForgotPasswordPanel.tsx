// src/components/auth/ForgotPasswordPanel.tsx
//
// "Forgot password?" on the admin sign-in page.
//
// Two steps: the mobile number or email on the account, then the code that
// was sent to it together with a new password. The code goes by text to the
// account's mobile number, and by email when the account has a real address.
//
// The first step always moves on to the second. The server answers the same
// way whether or not an account matched -- so nobody can use this page to
// find out who has an account -- and this screen must not hint otherwise.
//
// Styled with the sign-in page's own classes (Login.tsx), so the two read as
// one screen.

import { FormEvent, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Lock, RotateCw, UserRound } from "lucide-react";

import { authService } from "../../services/auth";

interface Props {
  /** What was typed in the sign-in form, to save typing it again. */
  initialLogin: string;
  /** Back to sign-in without a change. */
  onCancel: () => void;
  /** The password was changed; the message is shown on the sign-in form. */
  onDone: (message: string) => void;
}

/** The most useful line from a refused request. */
function messageFrom(error: any, fallback: string): string {
  const data = error?.response?.data;
  const fieldErrors = data?.errors ?? {};

  // The password policy says exactly what is missing ("at least one symbol");
  // that beats the generic "The given data was invalid."
  const firstFieldError = Object.values(fieldErrors).flat()[0];

  return String(firstFieldError ?? data?.message ?? fallback);
}

export default function ForgotPasswordPanel({ initialLogin, onCancel, onDone }: Props) {
  const [login, setLogin] = useState(initialLogin);
  const [challenge, setChallenge] = useState("");

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (!challenge || resendIn <= 0) return;

    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [challenge, resendIn]);

  /** Back to step one, e.g. after the code expired. */
  function startOver(message = "") {
    setChallenge("");
    setCode("");
    setPassword("");
    setConfirmation("");
    setInfo("");
    setError(message);
  }

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!login.trim()) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const sent = await authService.forgotPassword(login.trim());

      setChallenge(sent.challenge);
      setResendIn(sent.resendAfter);
      setInfo(sent.message);
    } catch (err: any) {
      setError(messageFrom(err, "The request could not be sent. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password !== confirmation) {
      setError("The two passwords do not match.");
      return;
    }

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const message = await authService.resetPassword({
        challenge,
        code,
        password,
        password_confirmation: confirmation,
      });

      onDone(message);
    } catch (err: any) {
      const data = err?.response?.data;
      const message = messageFrom(err, "The password could not be changed. Try again.");

      if (data?.restart) {
        startOver(message);
      } else {
        setError(message);

        // A wrong code is re-entered; a refused password is retyped.
        if (data?.attempts_left !== undefined) setCode("");
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!challenge || resendIn > 0) return;

    setError("");
    setInfo("");

    try {
      const sent = await authService.resendResetCode(challenge);
      setInfo(sent.message);
      setResendIn(sent.resendAfter);
      setCode("");
    } catch (err: any) {
      const data = err?.response?.data;
      const message = messageFrom(err, "A new code could not be sent.");

      if (data?.restart) startOver(message);
      else setError(message);
    }
  }

  return (
    <>
      {error ? (
        <div className="ka-error-box" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      {info ? (
        <div className="ka-info-box">
          <CheckCircle2 size={18} />
          <span>{info}</span>
        </div>
      ) : null}

      {!challenge ? (
        <form onSubmit={requestCode} className="ka-form">
          <div className="ka-code-intro">
            <KeyRound size={20} />
            <p>
              Enter the mobile number or email on your account. We will send a 6-digit code to its
              mobile number, and to its email if it has one.
            </p>
          </div>

          <label className="ka-label">
            Mobile number or email
            <div className="ka-input-wrap">
              <UserRound size={19} className="ka-input-icon" />
              <input
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="09XXXXXXXXX or name@email.com"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
          </label>

          <button type="submit" disabled={busy || !login.trim()} className="ka-primary-button">
            {busy ? "Sending..." : "Send code"}
            <ArrowRight size={19} />
          </button>

          <div className="ka-code-actions">
            <button type="button" className="ka-text-button" onClick={onCancel}>
              <ArrowLeft size={15} />
              Back to sign in
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={reset} className="ka-form">
          {/*
              What was typed, shown back. The reply is the same whether or
              not an account matched, so a mistyped or old number would
              otherwise just mean a code that never comes, with no clue why.
              Repeating the person's own input reveals nothing about accounts.
          */}
          <div className="ka-code-intro">
            <KeyRound size={20} />
            <p>
              Code requested for <b>{login.trim()}</b>. It only arrives if that is the number or
              email on your account.{" "}
              <button type="button" className="ka-text-button ka-inline-button" onClick={() => startOver()}>
                Change
              </button>
            </p>
          </div>

          <label className="ka-label">
            Code from your phone or email
            <div className="ka-input-wrap">
              <Lock size={19} className="ka-input-icon" />
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-label="6-digit code"
                autoFocus
                required
              />
            </div>
          </label>

          <label className="ka-label">
            New password
            <div className="ka-input-wrap">
              <Lock size={19} className="ka-input-icon" />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="New password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
              />

              <button
                type="button"
                className="ka-eye-button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </div>
          </label>

          <label className="ka-label">
            Confirm new password
            <div className="ka-input-wrap">
              <Lock size={19} className="ka-input-icon" />
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Type it again"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
              />
            </div>
          </label>

          <p className="ka-code-help">
            At least 8 characters, with an uppercase letter, a lowercase letter, a number and a
            symbol. Every device signed in to this account will be signed out.
          </p>

          <button
            type="submit"
            disabled={busy || code.length !== 6 || !password || !confirmation}
            className="ka-primary-button"
          >
            {busy ? "Saving..." : "Set new password"}
            <ArrowRight size={19} />
          </button>

          <div className="ka-code-actions">
            <button type="button" className="ka-text-button" onClick={() => void resend()} disabled={resendIn > 0}>
              <RotateCw size={15} />
              {resendIn > 0 ? `Send a new code in ${resendIn}s` : "Send a new code"}
            </button>

            <button type="button" className="ka-text-button" onClick={onCancel}>
              <ArrowLeft size={15} />
              Back to sign in
            </button>
          </div>

          <p className="ka-code-help">
            No code after a few minutes? Check that the number or email is the one on your account,
            or ask the Super Admin to set a new password for you.
          </p>
        </form>
      )}
    </>
  );
}
