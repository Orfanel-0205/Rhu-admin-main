// src/pages/Login.tsx

import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Phone,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { authService } from "../services/auth";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [mobileNumber, setMobileNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");

    try {
      const response = await authService.login({
        mobile_number: mobileNumber.trim(),
        password,
      });

      setAuth(response.user, response.token);
      navigate("/dashboard", { replace: true });
    } catch (error: any) {
      setError(
        error?.response?.data?.message ||
          error?.message ||
          "Unable to sign in. Please check your mobile number and password."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="ka-login-page">
      <section className="ka-login-info">
        <div className="ka-brand">
          <div className="ka-logo-box">
            <img src="/logo.png" alt="Ka-Agapay Logo" className="ka-logo" />
          </div>

          <div>
            <h1>Ka-Agapay</h1>
            <p>RHU Admin Portal</p>
          </div>
        </div>

        <div className="ka-hero">
          <div className="ka-secure-badge">
            <ShieldCheck size={17} />
            Secure RHU staff access
          </div>

          <h2>Simple dashboard for safer and faster RHU service.</h2>

          <p>
            Manage queueing, appointments, announcements, users, inventory,
            consultations, telemedicine, and reports in one professional admin
            portal designed for easy use.
          </p>
        </div>

        <div className="ka-benefits">
          <Benefit text="Large readable fields" />
          <Benefit text="Clear next-step buttons" />
          <Benefit text="Safe approval workflow" />
          <Benefit text="Audit and delete history" />
        </div>
      </section>

      <section className="ka-login-form-area">
        <div className="ka-login-card">
          <div className="ka-card-header">
            <div className="ka-card-logo">
              <img src="/logo.png" alt="Ka-Agapay Logo" />
            </div>

            <div>
              <h2>Sign in</h2>
              <p>Use your approved RHU staff account.</p>
            </div>
          </div>

          {error ? (
            <div className="ka-error-box">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={submit} className="ka-form">
            <label className="ka-label">
              Mobile Number
              <div className="ka-input-wrap">
                <Phone size={19} className="ka-input-icon" />
                <input
                  value={mobileNumber}
                  onChange={(event) => setMobileNumber(event.target.value)}
                  placeholder="09XXXXXXXXX"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                />
              </div>
            </label>

            <label className="ka-label">
              Password
              <div className="ka-input-wrap">
                <Lock size={19} className="ka-input-icon" />
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter your password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
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

            <button
              type="submit"
              disabled={loading}
              className="ka-primary-button"
            >
              {loading ? "Signing in..." : "Sign in to dashboard"}
              <ArrowRight size={19} />
            </button>
          </form>

          <div className="ka-divider" />

          {/* Sir Ayco — registration is invitation-only. The /register page
              only opens through a signed one-time link from the Super Admin,
              so there is deliberately NO public Register button here. */}
          <div className="ka-register-panel">
            <div>
              <UserPlus size={18} style={{ marginBottom: -3, marginRight: 6 }} />
              <strong>New RHU staff?</strong>
              <p>
                Registration is by invitation. Ask the Super Admin for your
                personal registration link — it is signed, expires, and works
                exactly once.
              </p>
            </div>
          </div>
        </div>
      </section>

      <style>{`
        * {
          box-sizing: border-box;
        }

        .ka-login-page {
          min-height: 100vh;
          width: 100%;
          background:
            radial-gradient(circle at top left, rgba(20, 184, 166, 0.18), transparent 34%),
            linear-gradient(135deg, #064e3b 0%, #047857 42%, #ecfdf5 42%, #f8fafc 100%);
          display: grid;
          grid-template-columns: minmax(420px, 1.15fr) minmax(420px, 0.85fr);
          overflow: hidden;
          color: #0f172a;
        }

        .ka-login-info {
          min-height: 100vh;
          padding: 56px;
          color: #ffffff;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 42px;
          position: relative;
          z-index: 1;
        }

        .ka-login-info::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            rgba(6, 78, 59, 0.92),
            rgba(4, 120, 87, 0.86)
          );
          z-index: -1;
        }

        .ka-brand {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .ka-logo-box {
          width: 70px;
          height: 70px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.14);
          border: 1px solid rgba(255, 255, 255, 0.24);
          display: grid;
          place-items: center;
          padding: 8px;
          flex-shrink: 0;
        }

        .ka-logo {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .ka-brand h1 {
          margin: 0;
          font-size: 31px;
          font-weight: 950;
          letter-spacing: -0.04em;
          color: #ffffff;
        }

        .ka-brand p {
          margin: 3px 0 0;
          font-size: 15px;
          font-weight: 800;
          color: #d1fae5;
        }

        .ka-hero {
          max-width: 820px;
        }

        .ka-secure-badge {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          padding: 10px 14px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.13);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #ffffff;
          font-size: 15px;
          font-weight: 900;
          margin-bottom: 24px;
        }

        .ka-hero h2 {
          margin: 0;
          max-width: 760px;
          font-size: clamp(42px, 5vw, 64px);
          line-height: 1.03;
          letter-spacing: -0.065em;
          font-weight: 950;
          color: #ffffff;
        }

        .ka-hero p {
          margin: 24px 0 0;
          max-width: 760px;
          color: #e0f2fe;
          font-size: 19px;
          line-height: 1.75;
          font-weight: 650;
        }

        .ka-benefits {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          max-width: 760px;
        }

        .ka-benefit {
          display: flex;
          align-items: center;
          gap: 11px;
          min-height: 58px;
          padding: 15px 17px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.13);
          border: 1px solid rgba(255, 255, 255, 0.22);
          color: #ffffff;
          font-size: 15px;
          font-weight: 900;
        }

        .ka-benefit svg {
          flex-shrink: 0;
          color: #bbf7d0;
        }

        .ka-login-form-area {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 42px;
          background: rgba(248, 250, 252, 0.82);
        }

        .ka-login-card {
          width: 100%;
          max-width: 500px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 30px;
          padding: 34px;
          box-shadow: 0 30px 90px rgba(15, 23, 42, 0.16);
        }

        .ka-card-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 26px;
        }

        .ka-card-logo {
          width: 66px;
          height: 66px;
          border-radius: 22px;
          background: #ecfdf5;
          display: grid;
          place-items: center;
          padding: 8px;
          flex-shrink: 0;
        }

        .ka-card-logo img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }

        .ka-card-header h2 {
          margin: 0;
          color: #0f172a;
          font-size: 31px;
          font-weight: 950;
          letter-spacing: -0.045em;
        }

        .ka-card-header p {
          margin: 5px 0 0;
          color: #475569;
          font-size: 15px;
          font-weight: 700;
        }

        .ka-error-box {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 17px;
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
          font-weight: 800;
          line-height: 1.5;
          margin-bottom: 18px;
        }

        .ka-error-box svg {
          flex-shrink: 0;
          margin-top: 2px;
        }

        .ka-form {
          display: grid;
          gap: 18px;
        }

        .ka-label {
          display: grid;
          gap: 8px;
          color: #334155;
          font-size: 14px;
          font-weight: 950;
        }

        .ka-input-wrap {
          position: relative;
        }

        .ka-input-icon {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
        }

        .ka-input-wrap input {
          width: 100%;
          height: 54px;
          border-radius: 17px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #0f172a;
          padding: 0 52px 0 48px;
          font-size: 16px;
          font-weight: 800;
          outline: none;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }

        .ka-input-wrap input:focus {
          border-color: #10b981;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.13);
        }

        .ka-input-wrap input::placeholder {
          color: #94a3b8;
          font-weight: 750;
        }

        .ka-eye-button {
          position: absolute;
          right: 9px;
          top: 50%;
          transform: translateY(-50%);
          width: 39px;
          height: 39px;
          border: none;
          border-radius: 13px;
          background: transparent;
          color: #64748b;
          display: grid;
          place-items: center;
          cursor: pointer;
        }

        .ka-eye-button:hover {
          background: #e2e8f0;
        }

        .ka-primary-button {
          width: 100%;
          height: 56px;
          border: none;
          border-radius: 18px;
          background: #047857;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 16px 28px rgba(4, 120, 87, 0.24);
          transition: transform 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease;
        }

        .ka-primary-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 20px 34px rgba(4, 120, 87, 0.28);
        }

        .ka-primary-button:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .ka-divider {
          height: 1px;
          width: 100%;
          background: #e2e8f0;
          margin: 26px 0;
        }

        .ka-register-panel {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 17px;
          border-radius: 20px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
        }

        .ka-register-panel strong {
          display: block;
          color: #0f172a;
          font-size: 15px;
          font-weight: 950;
          margin-bottom: 4px;
        }

        .ka-register-panel p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
          line-height: 1.55;
          font-weight: 650;
        }

        .ka-register-button {
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 15px;
          border-radius: 15px;
          background: #ecfdf5;
          color: #047857;
          border: 1px solid #a7f3d0;
          text-decoration: none;
          font-size: 14px;
          font-weight: 950;
          white-space: nowrap;
        }

        .ka-register-button:hover {
          background: #d1fae5;
        }

        @media (max-width: 1100px) {
          .ka-login-page {
            grid-template-columns: 1fr;
            background: #f8fafc;
            overflow: auto;
          }

          .ka-login-info {
            min-height: auto;
            padding: 36px 24px;
          }

          .ka-login-info::after {
            background: linear-gradient(135deg, #064e3b, #047857);
          }

          .ka-hero h2 {
            font-size: 42px;
          }

          .ka-login-form-area {
            min-height: auto;
            padding: 28px 20px 44px;
          }

          .ka-login-card {
            max-width: 620px;
          }
        }

        @media (max-width: 640px) {
          .ka-login-info {
            padding: 28px 18px;
            gap: 26px;
          }

          .ka-brand h1 {
            font-size: 25px;
          }

          .ka-logo-box {
            width: 58px;
            height: 58px;
            border-radius: 18px;
          }

          .ka-hero h2 {
            font-size: 34px;
            letter-spacing: -0.045em;
          }

          .ka-hero p {
            font-size: 16px;
          }

          .ka-benefits {
            grid-template-columns: 1fr;
          }

          .ka-login-form-area {
            padding: 18px;
          }

          .ka-login-card {
            padding: 22px;
            border-radius: 24px;
          }

          .ka-card-header {
            align-items: flex-start;
          }

          .ka-card-logo {
            width: 58px;
            height: 58px;
            border-radius: 19px;
          }

          .ka-card-header h2 {
            font-size: 27px;
          }

          .ka-register-panel {
            align-items: stretch;
            flex-direction: column;
          }

          .ka-register-button {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <div className="ka-benefit">
      <CheckCircle2 size={18} />
      <span>{text}</span>
    </div>
  );
}