// src/components/ui/ActionMenu.tsx
// Row-level "kebab" action menu for tables. Keeps table rows clean while still
// exposing View / Restore / Delete / etc. Closes on outside click + Escape.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
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

export default function ActionMenu({ items, label = "Actions", buttonStyle }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = items.filter((i) => !i.hidden);
  if (visible.length === 0) return null;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
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

      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            minWidth: 184,
            background: color.surface,
            border: `1px solid ${color.line}`,
            borderRadius: radius.md,
            boxShadow: shadow.pop,
            padding: 6,
            zIndex: 40,
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
        </div>
      ) : null}
    </div>
  );
}
