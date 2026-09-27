// src/components/DuckLeap.tsx
//
// The duck jumps from the dashboard across to the assistant.
//
// WHY THIS EXISTS
// ---------------
// Staff did not know the floating button was the assistant. The mascot on the
// dashboard is the thing people look at first and recognise, so pressing it
// now sends the duck leaping across the screen to land on the launcher, which
// then opens. It is a signpost disguised as a flourish: after seeing it once,
// somebody knows where the assistant lives.
//
// It is one arc, roughly three quarters of a second, and it happens only on a
// deliberate press. Anything longer or more frequent would be an obstacle
// rather than an introduction.
//
// HOW IT FINDS THE LANDING SPOT
// -----------------------------
// The launcher can be dragged, so its position is read from the same saved
// value the assistant itself uses. If nothing is saved, or the saved value is
// unusable, it falls back to the bottom-right corner the launcher defaults to.

import { useEffect, useRef, useState } from "react";
import { CHATBOT_LAUNCHER_KEY } from "./AIChatAssistant";

/** The diving duck. */
const LEAP_SRC = "/kaagapay_dashboard_duck_dive.gif";

/**
 * The dive is drawn wide (760x360), not square like the other mascots.
 * Sizing it to the square dashboard icon would letterbox it and leave a
 * duck floating in a box of empty space, so the flyer is built to the
 * artwork's own shape instead.
 */
const LEAP_ASPECT = 760 / 360;

/**
 * Long enough to watch, short enough not to wait on.
 *
 * The first fifth is a hold: the duck gathers itself on the dashboard and
 * plays its dive before going anywhere. Launching on the first frame threw
 * it across the screen before anybody could see what it was.
 */
const LEAP_MS = 1380;
const HOLD_FRACTION = 0.2;

interface Point {
  left: number;
  top: number;
}

/** Where the launcher is sitting, or where it would sit by default. */
function launcherPoint(size: number): Point {
  const fallback: Point = {
    left: window.innerWidth - size - (window.innerWidth < 480 ? 12 : 28),
    top: window.innerHeight - size - (window.innerWidth < 480 ? 12 : 28),
  };

  try {
    const raw = window.localStorage.getItem(CHATBOT_LAUNCHER_KEY);
    const saved = raw ? JSON.parse(raw) : null;

    if (
      saved &&
      Number.isFinite(Number(saved.left)) &&
      Number.isFinite(Number(saved.top))
    ) {
      return { left: Number(saved.left), top: Number(saved.top) };
    }
  } catch {
    // Unreadable or blocked storage: the corner is a fine answer.
  }

  return fallback;
}

export default function DuckLeap({
  from,
  onArrive,
}: {
  /** Where the duck takes off from, in viewport coordinates. */
  from: DOMRect;
  /** Called once it lands, whether the animation ran or was skipped. */
  onArrive: () => void;
}) {
  const duckRef = useRef<HTMLImageElement>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const duck = duckRef.current;
    if (!duck) return;

    const size = window.innerWidth < 480 ? 46 : 58;
    const target = launcherPoint(size);

    // Travel is measured centre to centre, so the duck lands on the
    // launcher rather than beside it.
    const leapWidth = duck.offsetWidth || from.width;
    const leapHeight = duck.offsetHeight || from.height;

    const deltaX =
      target.left + size / 2 - (from.left + from.width / 2);
    const deltaY =
      target.top + size / 2 - (from.top + from.height / 2);

    // Shrink to roughly the launcher's footprint on arrival.
    const endScale = size / Math.max(leapWidth, leapHeight);

    // Up and over, not a flat slide: a leap reads as the duck travelling to
    // the launcher, where a straight line reads as a glitch.
    const peak = -Math.max(90, Math.abs(deltaX) * 0.22);

    const finish = () => {
      setGone(true);
      onArrive();
    };

    // element.animate is unavailable in a few older embedded browsers, and a
    // missing flourish must never cost somebody the assistant.
    if (typeof duck.animate !== "function") {
      finish();
      return;
    }

    const animation = duck.animate(
      [
        // Gathering itself, still on the dashboard.
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1, offset: 0 },
        {
          transform: "translate(0, 6px) scale(1.04) rotate(-3deg)",
          opacity: 1,
          offset: HOLD_FRACTION,
        },
        // Over the top of the arc.
        {
          transform: `translate(${deltaX * 0.5}px, ${deltaY * 0.5 + peak}px) scale(1.08) rotate(-12deg)`,
          opacity: 1,
          offset: HOLD_FRACTION + (1 - HOLD_FRACTION) * 0.5,
        },
        // Landing on the launcher.
        {
          transform: `translate(${deltaX}px, ${deltaY}px) scale(${endScale}) rotate(6deg)`,
          opacity: 0.92,
          offset: 1,
        },
      ],
      {
        duration: LEAP_MS,
        easing: "cubic-bezier(.34,.72,.34,1)",
        fill: "forwards",
      }
    );

    animation.addEventListener("finish", finish);

    return () => {
      animation.removeEventListener("finish", finish);
      animation.cancel();
    };
    // from/onArrive are stable for the life of one leap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (gone) return null;

  return (
    <img
      ref={duckRef}
      src={LEAP_SRC}
      alt=""
      aria-hidden="true"
      draggable={false}
      style={{
        position: "fixed",
        // Centred on the dashboard icon, at the dive artwork's own shape.
        left: from.left + from.width / 2 - (from.width * 1.9) / 2,
        top: from.top + from.height / 2 - (from.width * 1.9) / LEAP_ASPECT / 2,
        width: from.width * 1.9,
        height: (from.width * 1.9) / LEAP_ASPECT,
        objectFit: "contain",
        // Above the page, below any dialog.
        zIndex: 900,
        pointerEvents: "none",
        willChange: "transform",
      }}
    />
  );
}
