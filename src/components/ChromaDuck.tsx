// src/components/ChromaDuck.tsx
//
// Plays the duck clip with its green background removed.
//
// WHY THIS IS NEEDED
// ------------------
// MP4 carries no transparency. A clip exported "with no background" ends up
// with that background flattened into the picture, which is why the duck
// arrived sitting on a bright green square.
//
// There are two honest ways out. The better one is a file that supports alpha
// -- WebM with VP9, or an animated WebP -- which costs nothing at runtime. The
// other is to key the green out per frame in the browser, which is what this
// does, because it works with the file we have and needs no tooling.
//
// HOW IT WORKS
// ------------
// The video plays hidden. Every frame is drawn to a small canvas, any pixel
// where green clearly dominates is made transparent, and the canvas is what
// the page shows. The canvas is deliberately small: the duck renders at about
// 90px, so there is no reason to inspect a million source pixels to fill it.
//
// WHEN IT DOES NOT RUN
// --------------------
// Reduced motion, a missing 2D context, or a video that will not play all fall
// back to the still poster. The mascot is decoration; it must never be the
// reason a dashboard looks broken.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

/** Square working canvas. Larger than the duck is drawn, small enough to be cheap. */
const SAMPLE = 160;

/**
 * Is this pixel part of the green screen?
 *
 * Deliberately generous on what counts as green and strict about it having to
 * dominate: a duck's white feathers and teal scrubs must survive, while the
 * darker green at the edge of the key, where the backdrop shades off, must
 * not. Comparing green against both other channels does that better than
 * matching one exact colour would.
 */
function isBackdrop(r: number, g: number, b: number): boolean {
  return g > 90 && g > r * 1.25 && g > b * 1.25;
}

export default function ChromaDuck({
  src,
  poster,
  alt,
  canvasRef,
  style,
}: {
  src: string;
  /** Shown until the first frame is keyed, and instead of it where motion is unwelcome. */
  poster: string;
  alt: string;
  /** The visible element, so the leap can measure where it starts from. */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  style?: CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  /** False until a frame has actually been keyed, so the poster covers the gap. */
  const [painting, setPainting] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) return;

    const reduced =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduced) return;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    let frame = 0;
    let stopped = false;

    const paint = () => {
      if (stopped) return;

      frame = window.requestAnimationFrame(paint);

      if (video.readyState < 2 || video.videoWidth === 0) return;

      context.drawImage(video, 0, 0, SAMPLE, SAMPLE);

      let image;
      try {
        image = context.getImageData(0, 0, SAMPLE, SAMPLE);
      } catch {
        // A tainted canvas would throw here. Same-origin files do not, but
        // stopping cleanly beats a console full of errors.
        stopped = true;
        window.cancelAnimationFrame(frame);
        return;
      }

      const pixels = image.data;

      for (let i = 0; i < pixels.length; i += 4) {
        if (isBackdrop(pixels[i], pixels[i + 1], pixels[i + 2])) {
          pixels[i + 3] = 0;
        }
      }

      context.putImageData(image, 0, 0);
      setPainting(true);
    };

    const start = () => {
      void video.play().catch(() => {
        // Autoplay refused. The poster is already showing.
      });
      frame = window.requestAnimationFrame(paint);
    };

    if (video.readyState >= 2) start();
    else video.addEventListener("loadeddata", start, { once: true });

    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      video.removeEventListener("loadeddata", start);
    };
  }, [canvasRef]);

  return (
    <>
      <video
        ref={videoRef}
        src={src}
        loop
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{ display: "none" }}
      />

      {/* The poster holds the space until the first keyed frame lands. */}
      {!painting ? (
        <img src={poster} alt={alt} draggable={false} style={style} />
      ) : null}

      <canvas
        ref={canvasRef}
        width={SAMPLE}
        height={SAMPLE}
        aria-label={alt}
        role="img"
        style={{ ...style, display: painting ? (style?.display ?? "block") : "none" }}
      />
    </>
  );
}
