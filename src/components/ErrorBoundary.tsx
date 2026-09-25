// src/components/ErrorBoundary.tsx
//
// What staff see when a screen crashes.
//
// Without this, one bad render anywhere in the dashboard blanks the page.
// React unmounts the whole tree and leaves an empty white document: no
// message, no way back, and nothing a staff member can tell anyone. In a
// clinic with patients waiting, that is the worst shape a failure can take —
// work stops and nobody can describe why.
//
// This catches the crash, keeps the rest of the application alive, and gives
// two things that matter more than an apology: a way to carry on, and a
// specific line to quote when reporting it.
//
// WHAT IT CANNOT CATCH
// --------------------
// React error boundaries only see errors thrown while rendering, in lifecycle
// methods, or in constructors below them. A failure inside an event handler,
// a promise, or a setTimeout does not reach this — those are already covered
// by the toast in lib/apiClient.ts and by each screen's own error state.

import { Component } from "react";
import type { CSSProperties, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Names the screen in the message, so a report says where it happened. */
  area?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // The browser console is where whoever is helping will look first, and it
    // is the only record of the component stack once the page is reloaded.
    console.error("[Ka-Agapay] Screen crashed:", error, info.componentStack);
  }

  private reload = (): void => {
    window.location.reload();
  };

  private goBack = (): void => {
    // Clearing the error first means that if the previous screen is fine, the
    // person lands on it rather than on this message again.
    this.setState({ error: null }, () => window.history.back());
  };

  render(): ReactNode {
    const { error } = this.state;

    if (!error) return this.props.children;

    const where = this.props.area ? ` on ${this.props.area}` : "";

    return (
      <div style={wrapStyle} role="alert">
        <div style={cardStyle}>
          <AlertTriangle size={30} style={{ color: "#B45309" }} />

          <h1 style={titleStyle}>This screen stopped working</h1>

          <p style={bodyStyle}>
            Something went wrong{where}. Nothing you entered has been sent, and
            the rest of Ka-Agapay is still running — patient records are not
            affected.
          </p>

          <div style={actionsStyle}>
            <button type="button" onClick={this.reload} style={primaryStyle}>
              <RefreshCw size={16} />
              Reload this page
            </button>

            <button type="button" onClick={this.goBack} style={secondaryStyle}>
              Go back
            </button>
          </div>

          {/*
              The actual error, shown rather than hidden.

              A staff member cannot fix it, but they can read it down the phone
              or photograph it, and that single line is usually the difference
              between a fix in minutes and an afternoon of guessing.
          */}
          <details style={detailsStyle}>
            <summary style={summaryStyle}>
              Details to report to your system administrator
            </summary>

            <code style={codeStyle}>{error.message || String(error)}</code>
          </details>
        </div>
      </div>
    );
  }
}

const wrapStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minHeight: "60vh",
  padding: 24,
};

const cardStyle: CSSProperties = {
  display: "grid",
  justifyItems: "start",
  gap: 14,
  maxWidth: 560,
  padding: "28px 30px",
  borderRadius: 18,
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 21,
  fontWeight: 900,
  color: "#0F172A",
};

const bodyStyle: CSSProperties = {
  margin: 0,
  fontSize: 14.5,
  lineHeight: 1.6,
  color: "#475569",
};

const actionsStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 2,
};

const primaryStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "11px 20px",
  borderRadius: 999,
  border: "none",
  background: "#047857",
  color: "#FFFFFF",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

const secondaryStyle: CSSProperties = {
  padding: "11px 20px",
  borderRadius: 999,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  fontSize: 14,
  fontWeight: 800,
  cursor: "pointer",
};

const detailsStyle: CSSProperties = {
  width: "100%",
  marginTop: 4,
};

const summaryStyle: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "#92400E",
  cursor: "pointer",
};

const codeStyle: CSSProperties = {
  display: "block",
  marginTop: 8,
  padding: "10px 12px",
  borderRadius: 10,
  background: "#FFFFFF",
  border: "1px solid #FDE68A",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#7C2D12",
  wordBreak: "break-word",
};
