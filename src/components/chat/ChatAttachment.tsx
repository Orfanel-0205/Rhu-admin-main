// src/components/chat/ChatAttachment.tsx
//
// Whatever was attached to a message, drawn as the thing it actually is.
//
// These files are not public: they are served by a route that checks the
// viewer belongs in that conversation, which a bare <img src> or <video src>
// can never satisfy because neither sends a session token. Everything here is
// fetched like any other API call and handed to the browser as a blob.
//
// WHY THE KIND COMES FROM THE SERVER
//   A voice note recorded in Chrome arrives as webm, and so does a video clip.
//   Guessing from the mime type would play a midwife's spoken message inside a
//   video frame. The upload decides what it is and says so.

import type { CSSProperties } from "react";
import { Download, FileText } from "lucide-react";

import { usePrivateImage } from "../../hooks/usePrivateImage";

export interface AttachmentMeta {
  kind?: "image" | "video" | "audio" | "file";
  mime?: string;
  name?: string;
  size?: number;
}

/** "2.4 MB" — so somebody on barangay data knows before they tap. */
function readableSize(bytes?: number): string {
  if (!bytes || bytes < 1) return "";

  const mb = bytes / (1024 * 1024);

  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function ChatAttachment({
  path,
  meta,
  style,
}: {
  /** API path from the message payload, e.g. /team-chat/messages/12/attachment */
  path: string;
  meta?: AttachmentMeta | null;
  style?: CSSProperties;
}) {
  const { url, failed } = usePrivateImage(path);

  // Older messages predate the kind being recorded, and every one of them is a
  // photograph, because that is all this used to accept.
  const kind = meta?.kind ?? "image";
  const name = meta?.name || "attachment";
  const size = readableSize(meta?.size);

  if (failed) {
    return <div style={{ ...placeholderStyle, ...style }}>Attachment unavailable</div>;
  }

  if (!url) {
    return <div style={{ ...placeholderStyle, ...style }} aria-busy="true" />;
  }

  if (kind === "image") {
    return (
      <button
        type="button"
        onClick={() => window.open(url, "_blank", "noopener")}
        style={bareButtonStyle}
        title="Open full size"
      >
        <img src={url} alt={name} style={style} />
      </button>
    );
  }

  if (kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        style={{ maxWidth: 280, maxHeight: 280, borderRadius: 10, display: "block", ...style }}
      />
    );
  }

  if (kind === "audio") {
    return (
      <div style={voiceStyle}>
        <div style={{ fontSize: 11.5, fontWeight: 800, opacity: 0.75, marginBottom: 5 }}>
          Voice message{size ? ` · ${size}` : ""}
        </div>

        <audio src={url} controls preload="metadata" style={{ width: "100%", maxWidth: 260 }} />
      </div>
    );
  }

  // Anything else: a laboratory result, a referral, a spreadsheet. Named and
  // sized, because "attachment" tells the reader nothing about whether to open
  // it now or later.
  return (
    <a href={url} download={name} style={fileCardStyle}>
      <FileText size={20} style={{ flexShrink: 0 }} />

      <span style={{ minWidth: 0 }}>
        <span style={fileNameStyle}>{name}</span>
        {size ? <span style={fileSizeStyle}>{size}</span> : null}
      </span>

      <Download size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
    </a>
  );
}

const placeholderStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minHeight: 96,
  minWidth: 140,
  borderRadius: 10,
  background: "#F1F5F9",
  color: "#94A3B8",
  fontSize: 12,
};

const bareButtonStyle: CSSProperties = {
  border: 0,
  background: "none",
  padding: 0,
  cursor: "zoom-in",
  display: "block",
};

const voiceStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(15,23,42,.05)",
  minWidth: 220,
};

const fileCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "11px 13px",
  borderRadius: 12,
  background: "rgba(15,23,42,.05)",
  color: "inherit",
  textDecoration: "none",
  maxWidth: 280,
};

const fileNameStyle: CSSProperties = {
  display: "block",
  fontWeight: 700,
  fontSize: 13,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const fileSizeStyle: CSSProperties = {
  display: "block",
  fontSize: 11.5,
  opacity: 0.7,
};
