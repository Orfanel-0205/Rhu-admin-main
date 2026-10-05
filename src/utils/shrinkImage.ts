// src/utils/shrinkImage.ts
//
// Shrink a phone photo before uploading it for OCR.
//
// A current phone camera takes photos of 15-20 MB (a test photo of the RHU's
// ITR form was 6936 x 9248 pixels, 17 MB). OCR reads a page just as well at
// about 2,400 pixels, and the server shrinks anything bigger before sending it
// to OCR.space anyway -- so uploading the original only makes staff wait on
// the clinic's connection and can run into upload limits.
//
// Never fails: anything the browser cannot decode (a PDF, HEIC outside
// Safari) or that would not get smaller is uploaded as it is.

const SMALL_ENOUGH_BYTES = 1_500_000;

export async function shrinkImageForUpload(file: File, maxEdge = 2400, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.size <= SMALL_ENOUGH_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));

    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "scan";

    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
