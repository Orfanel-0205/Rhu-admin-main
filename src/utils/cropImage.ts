// src/utils/cropImage.ts
// Canvas-based image cropping helper for the admin banner cropper.
// Returns a real File (not just base64) so it can be appended directly to the
// existing FormData upload field used by Events / Announcements.

import type { Area } from "react-easy-crop";

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    // Allow cropping images loaded from a URL (e.g. existing banner) without
    // tainting the canvas. Object URLs from local files are unaffected.
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

/**
 * Keep very large banners reasonable so uploads stay small and fast.
 * The crop area is scaled down proportionally if it exceeds maxWidth.
 */
const MAX_OUTPUT_WIDTH = 1600;

export interface CroppedImageResult {
  file: File;
  url: string;
}

/** Bounding-box size of a rectangle rotated by `rotation` degrees. */
function rotatedSize(width: number, height: number, rotation: number) {
  const rad = (rotation * Math.PI) / 180;

  return {
    width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
    height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
  };
}

/**
 * Crop the given image source to the pixel area produced by react-easy-crop and
 * return a File + object URL preview.
 *
 * - Preserves PNG transparency when the source is a PNG; otherwise emits JPEG.
 * - Names the file like "cropped-banner.jpg" / "cropped-banner.png".
 * - Optional `rotation` (degrees) must match the rotation given to the
 *   Cropper: react-easy-crop reports crop pixels relative to the ROTATED
 *   image, so the source is pre-rendered rotated first. rotation 0 keeps the
 *   original direct-draw path unchanged.
 */
export async function getCroppedImageFile(
  imageSrc: string,
  cropPixels: Area,
  options?: { fileName?: string; mimeType?: string; rotation?: number }
): Promise<CroppedImageResult> {
  const sourceImage = await createImage(imageSrc);
  const rotation = (((options?.rotation ?? 0) % 360) + 360) % 360;

  let image: HTMLImageElement | HTMLCanvasElement = sourceImage;

  if (rotation !== 0) {
    const bounds = rotatedSize(sourceImage.width, sourceImage.height, rotation);
    const rotatedCanvas = document.createElement("canvas");
    const rotatedCtx = rotatedCanvas.getContext("2d");

    if (!rotatedCtx) {
      throw new Error("Could not create image canvas.");
    }

    rotatedCanvas.width = Math.round(bounds.width);
    rotatedCanvas.height = Math.round(bounds.height);

    rotatedCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
    rotatedCtx.rotate((rotation * Math.PI) / 180);
    rotatedCtx.drawImage(
      sourceImage,
      -sourceImage.width / 2,
      -sourceImage.height / 2
    );

    image = rotatedCanvas;
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create image canvas.");
  }

  // Scale down if the crop is larger than our max output width.
  const scale =
    cropPixels.width > MAX_OUTPUT_WIDTH
      ? MAX_OUTPUT_WIDTH / cropPixels.width
      : 1;

  const outputWidth = Math.round(cropPixels.width * scale);
  const outputHeight = Math.round(cropPixels.height * scale);

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  // Preserve PNG where requested, otherwise default to JPEG for small size.
  const isPng = (options?.mimeType ?? "").includes("png");
  const outputType = isPng ? "image/png" : "image/jpeg";
  const extension = isPng ? "png" : "jpg";

  const baseName = (options?.fileName ?? "cropped-banner").replace(
    /\.[^.]+$/,
    ""
  );
  const finalName = `${baseName || "cropped-banner"}.${extension}`;

  return new Promise<CroppedImageResult>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not crop image."));
          return;
        }

        const file = new File([blob], finalName, { type: outputType });
        const url = URL.createObjectURL(file);

        resolve({ file, url });
      },
      outputType,
      0.9
    );
  });
}

export default getCroppedImageFile;
