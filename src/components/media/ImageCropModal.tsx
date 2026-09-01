// src/components/media/ImageCropModal.tsx
// Reusable banner image crop modal for the Ka-Agapay admin.
// Drag to reposition, zoom slider, grid guide, Cancel / Apply Crop.
// Produces a real cropped File via src/utils/cropImage.ts.

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { RotateCcw, RotateCw, Undo2, X } from "lucide-react";
import { getCroppedImageFile } from "../../utils/cropImage";

/** Friendly name for the active crop frame (e.g. "16:9 Banner"). */
function aspectLabel(aspect: number): string {
  if (Math.abs(aspect - 16 / 9) < 0.01) return "16:9 Banner";
  if (Math.abs(aspect - 4 / 3) < 0.01) return "4:3 Card";
  if (Math.abs(aspect - 3) < 0.01) return "3:1 Wide";
  if (Math.abs(aspect - 1) < 0.01) return "1:1 Square";
  return `${Math.round(aspect * 100) / 100}:1`;
}

export interface CropAspectPreset {
  label: string;
  value: number;
}

export interface ImageCropModalProps {
  open: boolean;
  imageSrc: string | null;
  aspect?: number;
  /** Selectable aspect-ratio presets (banner / card / square, etc.). */
  presets?: CropAspectPreset[];
  title?: string;
  /** Optional source mime type so PNG transparency can be preserved. */
  mimeType?: string;
  /** Optional base file name for the cropped output. */
  fileName?: string;
  onCancel: () => void;
  onApply: (file: File, previewUrl: string) => void;
}

export default function ImageCropModal({
  open,
  imageSrc,
  aspect = 16 / 9,
  presets,
  title = "Crop Banner Image",
  mimeType,
  fileName = "cropped-banner.jpg",
  onCancel,
  onApply,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [activeAspect, setActiveAspect] = useState(aspect);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start each crop session at the recommended aspect for the current context.
  useEffect(() => {
    if (open) {
      setActiveAspect(aspect);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
    }
  }, [open, aspect]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const chooseAspect = useCallback((value: number) => {
    setActiveAspect(value);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  // Reset Crop: back to the untouched starting frame.
  const resetCrop = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
  }, []);

  const rotateBy = useCallback((delta: number) => {
    setRotation((current) => (((current + delta) % 360) + 360) % 360);
    setCrop({ x: 0, y: 0 });
  }, []);

  const handleApply = async () => {
    if (!imageSrc || !croppedAreaPixels) {
      setError("Please adjust the crop first.");
      return;
    }

    setCropping(true);
    setError(null);

    try {
      const { file, url } = await getCroppedImageFile(
        imageSrc,
        croppedAreaPixels,
        { fileName, mimeType, rotation }
      );

      onApply(file, url);
      // Reset for the next time the modal is opened.
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setRotation(0);
      setCroppedAreaPixels(null);
    } catch (err) {
      console.error("[ImageCropModal] Crop failed:", err);
      setError("Could not crop image. Please try another file.");
    } finally {
      setCropping(false);
    }
  };

  if (!open || !imageSrc) return null;

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div>
            <h3 style={titleStyle}>{title}</h3>
            <p style={subtitleStyle}>
              Drag to reposition. Use zoom to fit the banner.
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            style={closeButtonStyle}
          >
            <X size={16} />
          </button>
        </div>

        {presets && presets.length > 0 ? (
          <div style={presetRowStyle}>
            <span style={presetHintStyle}>Frame:</span>
            {presets.map((p) => {
              const on = Math.abs(p.value - activeAspect) < 0.001;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => chooseAspect(p.value)}
                  style={{ ...presetButtonStyle, ...(on ? presetButtonActiveStyle : {}) }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div style={cropAreaStyle}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            aspect={activeAspect}
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={onCropComplete}
          />

          {/* Frame indicator — always tells staff which shape they are
              cropping to (the grid overlay is the crop guide). */}
          <span style={aspectBadgeStyle}>{aspectLabel(activeAspect)}</span>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={toolRowStyle}>
            <label style={zoomLabelStyle}>
              Zoom&nbsp;
              <span style={{ color: "#0F766E" }}>{Math.round(zoom * 100)}%</span>
            </label>

            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => rotateBy(-90)}
                style={toolButtonStyle}
                title="Rotate left 90°"
              >
                <RotateCcw size={14} />
                Rotate Left
              </button>

              <button
                type="button"
                onClick={() => rotateBy(90)}
                style={toolButtonStyle}
                title="Rotate right 90°"
              >
                <RotateCw size={14} />
                Rotate Right
              </button>

              <button
                type="button"
                onClick={resetCrop}
                style={toolButtonStyle}
                title="Reset crop, zoom, and rotation"
              >
                <Undo2 size={14} />
                Reset Crop
              </button>
            </div>
          </div>

          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            style={{ width: "100%", accentColor: "#0F766E" }}
            aria-label="Zoom"
          />

          {rotation !== 0 ? (
            <p style={{ fontSize: 11.5, color: "#6B7280", margin: "4px 0 0", fontWeight: 700 }}>
              Rotated {rotation}° — Reset Crop returns to the original.
            </p>
          ) : null}
        </div>

        {error && (
          <p style={{ fontSize: 12, color: "#DC2626", marginTop: 8 }}>{error}</p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={cropping}
            style={cancelButtonStyle}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={cropping}
            style={{ ...applyButtonStyle, opacity: cropping ? 0.7 : 1 }}
          >
            {cropping ? "Cropping…" : "Apply Crop"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 9999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  width: "100%",
  maxWidth: 720,
  padding: 20,
  boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 14,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  color: "#0F172A",
};

const subtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  color: "#6B7280",
  fontSize: 12,
};

const closeButtonStyle: React.CSSProperties = {
  border: "none",
  background: "#F3F4F6",
  borderRadius: 999,
  width: 32,
  height: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  color: "#374151",
};

const presetRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  marginBottom: 12,
};

const presetHintStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  color: "#6B7280",
  marginRight: 2,
};

const presetButtonStyle: React.CSSProperties = {
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: "#374151",
  borderRadius: 999,
  padding: "6px 12px",
  fontSize: 12.5,
  fontWeight: 800,
  cursor: "pointer",
};

const presetButtonActiveStyle: React.CSSProperties = {
  background: "#0F766E",
  color: "#FFFFFF",
  borderColor: "#0F766E",
};

const cropAreaStyle: React.CSSProperties = {
  position: "relative",
  width: "100%",
  height: 380,
  background: "#111827",
  borderRadius: 12,
  overflow: "hidden",
};

const zoomLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#374151",
  marginBottom: 6,
};

const toolRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 6,
};

const toolButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  minHeight: 32,
  padding: "0 11px",
  borderRadius: 999,
  border: "1px solid #E5E7EB",
  background: "#FFFFFF",
  color: "#374151",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const aspectBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: 10,
  right: 10,
  zIndex: 2,
  background: "rgba(15, 118, 110, 0.92)",
  color: "#FFFFFF",
  borderRadius: 999,
  padding: "4px 11px",
  fontSize: 11.5,
  fontWeight: 900,
  pointerEvents: "none",
};

const cancelButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "11px 0",
  borderRadius: 8,
  border: "1px solid #E5E7EB",
  background: "#fff",
  cursor: "pointer",
  fontWeight: 700,
  color: "#374151",
};

const applyButtonStyle: React.CSSProperties = {
  flex: 1,
  padding: "11px 0",
  borderRadius: 8,
  border: "none",
  background: "#0F766E",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};
