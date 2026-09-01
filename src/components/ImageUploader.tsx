// src/components/ImageUploader.tsx
// Drag-and-drop image uploader with preview, validation, and cropper.
// The crop modal is the reusable ImageCropModal (src/components/media).
// Public API is unchanged so Events / Announcements keep working.
//
// Event Creation redesign: after an upload the thumbnail persists with an
// explicit action row — Replace Image / Re-crop Image / Remove Image — and
// the empty state now states the recommended size, formats, and max size.
// The picked source image is retained (until removed/replaced) so Re-crop
// reopens the cropper on the same photo without re-picking it.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Crop, RefreshCw, Trash2, Upload } from "lucide-react";
import ImageCropModal, { type CropAspectPreset } from "./media/ImageCropModal";

interface ImageUploaderProps {
  value?: string | null;
  onChange: (file: File | null) => void;
  label?: string;
  maxSizeMB?: number;
  aspect?: number;
  /**
   * Optional selectable crop frames. OFF by default so the crop modal stays
   * minimal (crop area + zoom + Cancel + Apply only) for non-technical staff —
   * the fixed `aspect` prop is the single source of the frame. Pass
   * CMS_CROP_PRESETS (or a custom list) to opt back in for a specific form.
   */
  presets?: CropAspectPreset[];
}

const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

// Common CMS frames kept available for forms that want a frame choice
// (e.g. Announcements). The form's `aspect` prop sets which one starts active.
export const CMS_CROP_PRESETS: CropAspectPreset[] = [
  { label: "Banner 16:9", value: 16 / 9 },
  { label: "Wide 3:1", value: 3 },
  { label: "Card 4:3", value: 4 / 3 },
  { label: "Square 1:1", value: 1 },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function ImageUploader({
  value,
  onChange,
  label = "Banner Image",
  maxSizeMB = 5,
  aspect = 16 / 9,
  presets,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [croppedFile, setCroppedFile] = useState<File | null>(null);

  const [sourceFileName, setSourceFileName] = useState("banner.jpg");
  const [sourceMimeType, setSourceMimeType] = useState("image/jpeg");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  // Track object URLs we created so we can revoke them and avoid memory leaks.
  const previewBlobRef = useRef<string | null>(null);

  useEffect(() => {
    setPreview(value ?? null);
  }, [value]);

  // Revoke any object URLs still alive when the component unmounts.
  useEffect(() => {
    return () => {
      if (sourceImage) URL.revokeObjectURL(sourceImage);
      if (previewBlobRef.current) URL.revokeObjectURL(previewBlobRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const revokeSource = useCallback(() => {
    if (sourceImage) {
      URL.revokeObjectURL(sourceImage);
      setSourceImage(null);
    }
  }, [sourceImage]);

  const validate = useCallback(
    (file: File): string | null => {
      if (!ACCEPTED.includes(file.type)) {
        return "Only JPG, PNG, and WebP images are accepted.";
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        return `Image must be under ${maxSizeMB} MB.`;
      }

      return null;
    },
    [maxSizeMB]
  );

  const openCropper = useCallback(
    (file: File) => {
      const validationError = validate(file);

      if (validationError) {
        setError(validationError);
        return;
      }

      setError(null);
      setSourceFileName(file.name || "banner.jpg");
      setSourceMimeType(file.type || "image/jpeg");

      // Replace any previous source URL before creating a new one.
      if (sourceImage) URL.revokeObjectURL(sourceImage);

      const objectUrl = URL.createObjectURL(file);
      setSourceImage(objectUrl);
      setCropOpen(true);
    },
    [validate, sourceImage]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);

      const file = event.dataTransfer.files[0];

      if (file) {
        openCropper(file);
      }
    },
    [openCropper]
  );

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      openCropper(file);
    }

    event.target.value = "";
  };

  const handleRemove = () => {
    setPreview(null);
    setError(null);
    setCroppedFile(null);
    revokeSource();
    setCropOpen(false);

    if (previewBlobRef.current) {
      URL.revokeObjectURL(previewBlobRef.current);
      previewBlobRef.current = null;
    }

    onChange(null);
  };

  // Cancel keeps the previous selection untouched. The source stays alive so
  // Re-crop can be pressed again later (it is revoked on remove/replace).
  const handleCancelCrop = useCallback(() => {
    setCropOpen(false);
  }, []);

  const handleApplyCrop = useCallback(
    (file: File, previewUrl: string) => {
      // Revoke the previous cropped preview blob if there was one.
      if (previewBlobRef.current) {
        URL.revokeObjectURL(previewBlobRef.current);
      }
      previewBlobRef.current = previewUrl;

      setPreview(previewUrl);
      setCroppedFile(file);
      onChange(file);
      setCropOpen(false);
      setError(null);
      // NOTE: the source image is intentionally KEPT so "Re-crop Image" can
      // reopen the same photo. It is revoked on remove/replace/unmount.
    },
    [onChange]
  );

  const canRecrop = Boolean(sourceImage);

  return (
    <div>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          color: "#374151",
          marginBottom: 6,
        }}
      >
        {label}
      </label>

      {preview ? (
        <div>
          <img
            src={preview}
            alt="Banner preview"
            style={{
              width: "100%",
              height: 190,
              objectFit: "cover",
              borderRadius: 12,
              border: "2px solid #E5E7EB",
              display: "block",
            }}
          />

          {/* Post-upload metadata + explicit actions — the empty upload box
              never comes back until the user removes the image. */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 8,
            }}
          >
            {croppedFile ? (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#047857",
                  background: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  borderRadius: 999,
                  padding: "4px 10px",
                }}
              >
                ✓ Cropped · {formatBytes(croppedFile.size)}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#475569",
                  background: "#F1F5F9",
                  border: "1px solid #E2E8F0",
                  borderRadius: 999,
                  padding: "4px 10px",
                }}
              >
                Saved banner
              </span>
            )}

            <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                style={actionButtonStyle}
              >
                <RefreshCw size={13} />
                Replace Image
              </button>

              {canRecrop ? (
                <button
                  type="button"
                  onClick={() => setCropOpen(true)}
                  style={actionButtonStyle}
                >
                  <Crop size={13} />
                  Re-crop Image
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleRemove}
                style={{
                  ...actionButtonStyle,
                  color: "#B91C1C",
                  borderColor: "#FECACA",
                  background: "#FEF2F2",
                }}
              >
                <Trash2 size={13} />
                Remove Image
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          aria-label="Upload banner image"
          style={{
            border: `2px dashed ${dragging ? "#0F766E" : "#D1D5DB"}`,
            borderRadius: 12,
            padding: "26px 16px",
            textAlign: "center",
            cursor: "pointer",
            background: dragging ? "#F0FDF9" : "#FAFAFA",
            transition: "all 0.15s ease",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                background: "#F0FDF9",
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Upload size={22} color="#0F766E" />
            </div>

            <div>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: "#374151",
                  margin: 0,
                }}
              >
                Upload Banner — click or drag &amp; drop
              </p>
              <p
                style={{
                  fontSize: 11.5,
                  color: "#6B7280",
                  margin: "5px 0 0",
                  lineHeight: 1.6,
                }}
              >
                Recommended size: 1600×900 (16:9) · Formats: JPG, PNG, WebP
                <br />
                Maximum file size: {maxSizeMB} MB · You crop before it uploads
              </p>
            </div>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={handleChange}
        style={{ display: "none" }}
      />

      {error && (
        <p style={{ fontSize: 12, color: "#DC2626", marginTop: 6 }}>{error}</p>
      )}

      <ImageCropModal
        open={cropOpen}
        imageSrc={sourceImage}
        aspect={aspect}
        presets={presets}
        title="Crop Banner Image"
        fileName={sourceFileName}
        mimeType={sourceMimeType}
        onCancel={handleCancelCrop}
        onApply={handleApplyCrop}
      />
    </div>
  );
}

const actionButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minHeight: 34,
  padding: "0 12px",
  borderRadius: 10,
  border: "1px solid #CBD5E1",
  background: "#FFFFFF",
  color: "#334155",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
};

export default ImageUploader;
