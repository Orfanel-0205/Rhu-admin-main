// src/components/CoachSpotlight.tsx
//
// Points at the thing the coach is talking about.
//
// WHY
// ---
// The Getting Started coach described each module in a side panel and left
// the reader to work out which of forty-odd controls it meant. Naming a screen
// is not the same as showing it. Twenty-two steps of prose, read beside an
// interface nobody is being pointed at, is a manual rather than a tour.
//
// This dims the page, leaves the relevant sidebar entry lit, and puts the
// step's duck beside it. The reader looks where the duck is looking.
//
// HOW IT FINDS THE TARGET
// -----------------------
// Each step already names the route its module lives at, and the sidebar
// renders those as ordinary links, so `a[href="/queue"]` finds the entry with
// no changes to the sidebar and nothing to keep in step. A route with no
// sidebar entry simply gets no spotlight, which is the right outcome: better
// no pointer than one aimed at the wrong thing.
//
// FOUR PANELS, NOT A MASK
// -----------------------
// The dimming is four rectangles around the target rather than one overlay
// with a hole cut in it. An SVG mask or a huge box-shadow would swallow
// clicks across the whole window; four panels leave the gap genuinely open,
// so the reader can still press the very control being pointed at.

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Breathing room around the highlighted element. */
const PAD = 6;

export default function CoachSpotlight({
  route,
  mascot,
  label,
  says,
  onOpen,
}: {
  /** The step's route; its sidebar entry is what gets lit. */
  route?: string;
  /** The step's duck. */
  mascot: string;
  /** What the duck is pointing at, for anyone using a screen reader. */
  label: string;
  /** One line of Taglish, spoken in a bubble beside the duck. */
  says?: string;
  /** Called after the reader presses the highlighted entry. */
  onOpen?: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!route) {
      setRect(null);
      return;
    }

    let frame = 0;

    const measure = () => {
      // The sidebar may be collapsed, on another breakpoint, or still
      // mounting. Re-measuring on a frame handles all three without needing
      // to know which one it is.
      const target = document.querySelector<HTMLElement>(`a[href="${route}"]`);

      if (!target) {
        setRect(null);
        return;
      }

      const box = target.getBoundingClientRect();

      // Off-screen or hidden: no pointer rather than one aimed at nothing.
      if (box.width === 0 || box.height === 0) {
        setRect(null);
        return;
      }

      setRect({
        top: box.top - PAD,
        left: box.left - PAD,
        width: box.width + PAD * 2,
        height: box.height + PAD * 2,
      });
    };

    const track = () => {
      measure();
      frame = window.requestAnimationFrame(track);
    };

    frame = window.requestAnimationFrame(track);

    return () => window.cancelAnimationFrame(frame);
  }, [route]);

  if (!rect) return null;

  const dim: CSSProperties = {
    position: "fixed",
    background: "rgba(8, 24, 22, 0.55)",
    zIndex: 1200,
    pointerEvents: "none",
  };

  // The duck stands to the right of the entry, or to its left if there is no
  // room, so it never runs off the edge of a narrow window.
  const duckSize = 64;
  const roomRight = window.innerWidth - (rect.left + rect.width) > duckSize + 20;
  const duckLeft = roomRight
    ? rect.left + rect.width + 10
    : Math.max(8, rect.left - duckSize - 10);

  return (
    <>
      {/* Above */}
      <div style={{ ...dim, top: 0, left: 0, right: 0, height: Math.max(0, rect.top) }} />
      {/* Below */}
      <div style={{ ...dim, top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }} />
      {/* Left */}
      <div style={{ ...dim, top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height }} />
      {/* Right */}
      <div style={{ ...dim, top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />

      {/* The ring around the entry itself. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius: 12,
          border: "2px solid #5EEAD4",
          boxShadow: "0 0 0 4px rgba(94,234,212,.25)",
          zIndex: 1201,
          pointerEvents: "none",
        }}
      />

      {/*
          A press target laid exactly over the entry.

          The dimming panels pass clicks through, so the link underneath is
          already reachable -- but a reader on the page the step names
          presses it and nothing appears to happen, because they are
          already there. This forwards the click to the real link AND tells
          the coach to move on, so pressing what is highlighted always does
          something.
      */}
      <button
        type="button"
        onClick={() => {
          document.querySelector<HTMLElement>(`a[href="${route}"]`)?.click();
          onOpen?.();
        }}
        aria-label={`Open ${label}`}
        style={{
          position: "fixed",
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius: 12,
          border: "none",
          background: "transparent",
          cursor: "pointer",
          zIndex: 1203,
        }}
      />

      {/* Says what pressing it will do, because a glow does not. */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: rect.top + rect.height + 8,
          left: rect.left,
          padding: "3px 9px",
          borderRadius: 999,
          background: "#5EEAD4",
          color: "#04302B",
          fontSize: 11,
          fontWeight: 800,
          whiteSpace: "nowrap",
          zIndex: 1202,
          pointerEvents: "none",
        }}
      >
        Click to open
      </div>

      {/*
          What the duck is saying.

          Sits under the mascot rather than beside it, so a long sentence
          grows downward into empty page instead of sideways into the
          coach panel on the right.
      */}
      {says ? (
        <div
          style={{
            position: "fixed",
            top: rect.top + rect.height / 2 + duckSize / 2 + 4,
            left: Math.max(8, Math.min(duckLeft - 40, window.innerWidth - 268)),
            width: 252,
            padding: "10px 13px",
            borderRadius: 14,
            background: "#FFFFFF",
            color: "#0F172A",
            fontSize: 12.5,
            lineHeight: 1.5,
            fontWeight: 600,
            boxShadow: "0 10px 26px rgba(8,24,22,.4)",
            border: "1px solid #5EEAD4",
            zIndex: 1202,
            pointerEvents: "none",
          }}
        >
          {says}
        </div>
      ) : null}

      <img
        src={mascot}
        alt={`Pointing at ${label}`}
        draggable={false}
        style={{
          position: "fixed",
          top: rect.top + rect.height / 2 - duckSize / 2,
          left: duckLeft,
          width: duckSize,
          height: duckSize,
          objectFit: "contain",
          // Faces the entry when standing on its right.
          transform: roomRight ? "scaleX(-1)" : undefined,
          zIndex: 1202,
          pointerEvents: "none",
          filter: "drop-shadow(0 6px 14px rgba(8,24,22,.45))",
        }}
      />
    </>
  );
}
