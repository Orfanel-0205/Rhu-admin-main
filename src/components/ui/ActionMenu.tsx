// src/components/ui/ActionMenu.tsx
// Row-level "kebab" action menu for tables. Keeps table rows clean while still
// exposing View / Restore / Delete / etc. Closes on outside click + Escape.
//
// The menu floats above the page (a portal with fixed position) rather than
// inside the row. Tables sit in a wrapper that scrolls sideways when needed,
// and a scrolling box cuts off anything that sticks out of it -- the menu was
// being clipped by the next row ("Notify Patient" half hidden on the
// Telemedicine board). It opens upward when there is no room below, and
// closes when the page scrolls or resizes, since it would no longer sit next
// to its button.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { color, radius, shadow, space } from "../../theme/tokens";

export interface ActionItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}

interface ActionMenuProps {
  items: ActionItem[];
  label?: string;
  buttonStyle?: CSSProperties;
}

const MENU_WIDTH = 200;
const GAP = 6;
const EDGE = 8;

export default function ActionMenu({ items, label = "Actions", buttonStyle }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Place the menu under its button -- or above it, if the bottom of the
  // window is closer -- and keep it inside the window horizontally.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const button = buttonRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 0;
    const below = button.bottom + GAP;
    const fitsBelow = below + menuHeight <= window.innerHeight - EDGE;

    setPosition({
      top: fitsBelow ? below : Math.max(EDGE, button.top - GAP - menuHeight),
      left: Math.min(
        Math.max(EDGE, button.right - MENU_WIDTH),
        window.innerWidth - MENU_WIDTH - EDGE
      ),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const inside = (target: EventTarget | null) =>
      Boolean(
        target instanceof Node &&
          (buttonRef.current?.contains(target) || menuRef.current?.contains(target))
      );

    const onDown = (e: MouseEvent) => {
      if (!inside(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onMove = (e: Event) => {
      if (!inside(e.target)) setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setPosition(null);
          setOpen((o) => !o);
        }}
        style={{
          width: 32,
          height: 32,
          display: "grid",
          placeItems: "center",
          border: `1px solid ${color.line}`,
          borderRadius: radius.sm,
          background: open ? color.surfaceSunken : color.surface,
          color: color.slateFg,
          cursor: "pointer",
          ...buttonStyle,
        }}
      >
        <MoreHorizontal size={18} />
      </button>

      {open
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              style={{
                position: "fixed",
                top: position?.top ?? -9999,
                left: position?.left ?? -9999,
                // Measured once at -9999, then placed; never seen there.
                visibility: position ? "visible" : "hidden",
                width: MENU_WIDTH,
                maxHeight: `calc(100vh - ${EDGE * 2}px)`,
                overflowY: "auto",
                background: color.surface,
                border: `1px solid ${color.line}`,
                borderRadius: radius.md,
                boxShadow: shadow.pop,
                padding: 6,
                zIndex: 1500,
              }}
            >
              {visible.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    item.onClick();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: space.sm,
                    width: "100%",
                    textAlign: "left",
                    padding: "9px 10px",
                    border: 0,
                    borderRadius: radius.sm,
                    background: "transparent",
                    color: item.disabled
                      ? color.textFaint
                      : item.danger
                      ? color.dangerFg
                      : color.text,
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: item.disabled ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled)
                      (e.currentTarget as HTMLButtonElement).style.background = item.danger
                        ? color.dangerBg
                        : color.surfaceSunken;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  }}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
