// src/components/SignaturePad.tsx
//
// A pad to sign on with a mouse, a finger or a stylus (My Profile → My
// Signature). Strokes are drawn on a transparent canvas at the screen's real
// pixel density, so the saved signature is sharp on the PDF; the server crops
// it and keeps the background transparent (StaffSignatures).
//
// Resizing the window clears the pad: stretching the strokes to a new width
// would distort them, and a signature is quick to redo.

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export type SignaturePadHandle = {
  clear: () => void;
  isEmpty: () => boolean;
  toBlob: () => Promise<Blob | null>;
};

type Props = {
  height?: number;
  onChange?: (empty: boolean) => void;
};

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(function SignaturePad(
  { height = 180, onChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const empty = useRef(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const markEmpty = useCallback((value: boolean) => {
    if (empty.current !== value) {
      empty.current = value;
      onChangeRef.current?.(value);
    }
  }, []);

  const fit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const width = canvas.getBoundingClientRect().width;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0F172A";
    ctx.fillStyle = "#0F172A";
    ctx.lineWidth = 2.6;

    empty.current = true;
    onChangeRef.current?.(true);
  }, [height]);

  useEffect(() => {
    fit();

    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;

    let lastWidth = canvas.getBoundingClientRect().width;
    const observer = new ResizeObserver(() => {
      const width = canvas.getBoundingClientRect().width;
      if (Math.abs(width - lastWidth) > 1) {
        lastWidth = width;
        fit();
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [fit]);

  useImperativeHandle(
    ref,
    () => ({
      clear: fit,
      isEmpty: () => empty.current,
      toBlob: () =>
        new Promise((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas || empty.current) return resolve(null);
          canvas.toBlob((blob) => resolve(blob), "image/png");
        }),
    }),
    [fit]
  );

  function pointFrom(event: { clientX: number; clientY: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const p = pointFrom(event);
    last.current = p;

    // A tap is a dot: the dot over an "i" or a full stop.
    ctx.beginPath();
    ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx || !last.current) return;

    // A stylus or a fast mouse reports several points per frame; drawing
    // each keeps curves round instead of turning them into corners.
    const native = event.nativeEvent as PointerEvent;
    const events = typeof native.getCoalescedEvents === "function" ? native.getCoalescedEvents() : [native];

    for (const e of events.length ? events : [native]) {
      const p = pointFrom(e);
      const mid = { x: (last.current.x + p.x) / 2, y: (last.current.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(last.current.x, last.current.y);
      ctx.quadraticCurveTo(last.current.x, last.current.y, mid.x, mid.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last.current = p;
    }

    markEmpty(false);
  }

  function onPointerUp() {
    if (drawing.current) markEmpty(false);
    drawing.current = false;
    last.current = null;
  }

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Signature pad: sign here with your mouse, finger or stylus"
      role="img"
      style={{
        width: "100%",
        height,
        display: "block",
        borderRadius: 16,
        border: "1px dashed #94A3B8",
        background:
          "linear-gradient(to bottom, transparent calc(100% - 42px), #CBD5E1 calc(100% - 42px), #CBD5E1 calc(100% - 41px), transparent calc(100% - 41px)), #FFFFFF",
        touchAction: "none",
        cursor: "crosshair",
      }}
    />
  );
});
