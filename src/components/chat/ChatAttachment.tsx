// src/components/chat/ChatAttachment.tsx
//
// Shows a Team Chat picture that is not publicly readable.
//
// These used to sit on the public disk, so the browser could fetch them with a
// plain <img src>. They now live behind a route that checks the viewer is in
// the conversation, which a bare <img> cannot satisfy: it sends no session
// token. So the picture is fetched like any other API call and handed to the
// browser as a blob, the same way resident ID photographs already are.
//
// The object URL is released when the message scrolls away. Without that, an
// afternoon of scrolling through a busy thread quietly holds every photograph
// ever opened in memory.

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

import apiClient from "../../lib/apiClient";

export default function ChatAttachment({
  path,
  alt = "attachment",
  style,
}: {
  /** The API path from the message payload, e.g. /team-chat/messages/12/attachment */
  path: string;
  alt?: string;
  style?: CSSProperties;
}) {
  const [url, setUrl] = useState<string>("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;

    (async () => {
      try {
        const response = await apiClient.get(path, { responseType: "blob" });

        if (cancelled) return;

        objectUrl = URL.createObjectURL(response.data as Blob);
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;

      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) {
    return <div style={{ ...placeholderStyle, ...style }}>Image unavailable</div>;
  }

  if (!url) {
    return <div style={{ ...placeholderStyle, ...style }} aria-busy="true" />;
  }

  return (
    <button
      type="button"
      onClick={() => window.open(url, "_blank", "noopener")}
      style={{ border: 0, background: "none", padding: 0, cursor: "zoom-in", display: "block" }}
      title="Open full size"
    >
      <img src={url} alt={alt} style={style} />
    </button>
  );
}

const placeholderStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  minHeight: 120,
  borderRadius: 10,
  background: "#F1F5F9",
  color: "#94A3B8",
  fontSize: 12,
};
