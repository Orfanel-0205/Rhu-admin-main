// src/components/CallPanel.tsx
//
// The in-app call window for Team Chat: the thing that replaced sending staff
// to a separate Jitsi tab.
//
// It floats above the dashboard rather than taking it over, so a nurse can
// keep reading a patient's record while talking. Audio calls show initials
// instead of a black rectangle, because a video box with nothing in it looks
// broken.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";

import { PeerCall, type CallState } from "../lib/webrtcCall";
import { fetchCallSignals, sendCallSignal, type ChatCall } from "../services/teamChat";

export default function CallPanel({
  call,
  myUserId,
  peerName,
  onEnded,
}: {
  call: ChatCall;
  myUserId: number;
  peerName: string;
  /** Fired when the call ends, however it ends. */
  onEnded: () => void;
}) {
  const [state, setState] = useState<CallState>("idle");
  const [detail, setDetail] = useState<string>("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const engine = useRef<PeerCall | null>(null);

  const isVideo = call.mode === "video";

  useEffect(() => {
    // The person who started the call makes the offer; the other waits for it.
    const peerId = (call.peer?.participants ?? []).find((id) => id !== myUserId) ?? null;

    const peer = new PeerCall({
      iceServers: call.peer?.ice_servers ?? [{ urls: "stun:stun.l.google.com:19302" }],
      video: isVideo,
      isCaller: call.started_by_me,
      transport: {
        send: (type, payload) => sendCallSignal(call.id, type, payload, peerId),
        receive: async () => {
          const { signals, active } = await fetchCallSignals(call.id);

          if (!active) {
            // The other side hung up, or the call was ended elsewhere.
            void peer.hangUp(false);
          }

          return signals;
        },
      },
      handlers: {
        onLocalStream: (stream) => {
          if (localVideo.current) localVideo.current.srcObject = stream;
        },
        onRemoteStream: (stream) => {
          if (remoteVideo.current) remoteVideo.current.srcObject = stream;
        },
        onState: (next, message) => {
          setState(next);
          setDetail(message ?? "");

          if (next === "ended") onEnded();
        },
      },
    });

    engine.current = peer;
    void peer.start();

    return () => {
      void peer.hangUp(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.id]);

  // Call length, started when the two sides actually connect.
  useEffect(() => {
    if (state !== "connected") return;

    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000);

    return () => window.clearInterval(timer);
  }, [state]);

  const status =
    state === "getting-media"
      ? "Turning on your microphone…"
      : state === "connecting"
        ? call.started_by_me
          ? `Calling ${peerName}…`
          : `Connecting to ${peerName}…`
        : state === "connected"
          ? formatDuration(seconds)
          : state === "failed"
            ? "Could not connect"
            : "Call ended";

  return (
    <div style={panelStyle} role="dialog" aria-label={`Call with ${peerName}`}>
      <div style={headerStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 14 }}>{peerName}</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>{status}</div>
        </div>
      </div>

      <div style={stageStyle}>
        {isVideo ? (
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", background: "#0F172A" }}
          />
        ) : (
          <div style={audioStageStyle}>
            <div style={avatarStyle}>{initialsOf(peerName)}</div>
            <audio ref={remoteVideo as any} autoPlay />
          </div>
        )}

        {isVideo ? (
          <video
            ref={localVideo}
            autoPlay
            playsInline
            muted
            style={selfViewStyle}
          />
        ) : (
          <audio ref={localVideo as any} autoPlay muted />
        )}
      </div>

      {state === "failed" && detail ? (
        <div style={errorStyle}>
          {detail}
          {call.peer && !call.peer.relay_configured ? (
            <div style={{ marginTop: 6, opacity: 0.9 }}>
              Calls between different networks need a relay server, which is not set up yet.
              Calls inside the same RHU should still work.
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={controlsStyle}>
        <button
          type="button"
          onClick={() => setMuted(engine.current?.toggleMute() ?? false)}
          style={controlButton(muted)}
          aria-pressed={muted}
          title={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        {isVideo ? (
          <button
            type="button"
            onClick={() => setCameraOff(engine.current?.toggleCamera() ?? true)}
            style={controlButton(cameraOff)}
            aria-pressed={cameraOff}
            title={cameraOff ? "Turn camera on" : "Turn camera off"}
          >
            {cameraOff ? <VideoOff size={18} /> : <Video size={18} />}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void engine.current?.hangUp()}
          style={{ ...controlButton(false), background: "#DC2626", color: "#fff", border: "none" }}
          title="End call"
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </div>
  );
}

function formatDuration(total: number): string {
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (total % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const panelStyle: CSSProperties = {
  position: "fixed",
  right: 20,
  bottom: 20,
  width: 320,
  background: "#0F172A",
  color: "#F8FAFC",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "0 24px 60px rgba(15,23,42,.45)",
  zIndex: 1300,
  display: "grid",
};

const headerStyle: CSSProperties = {
  padding: "12px 14px",
  background: "linear-gradient(135deg, #064E3B, #0F766E)",
};

const stageStyle: CSSProperties = {
  position: "relative",
  height: 200,
  background: "#0B1220",
};

const audioStageStyle: CSSProperties = {
  display: "grid",
  placeItems: "center",
  height: "100%",
};

const avatarStyle: CSSProperties = {
  width: 84,
  height: 84,
  borderRadius: "50%",
  background: "#134E4A",
  color: "#ECFDF5",
  display: "grid",
  placeItems: "center",
  fontSize: 28,
  fontWeight: 900,
};

const selfViewStyle: CSSProperties = {
  position: "absolute",
  right: 10,
  bottom: 10,
  width: 88,
  height: 66,
  objectFit: "cover",
  borderRadius: 10,
  border: "2px solid rgba(255,255,255,.35)",
  background: "#000",
};

const errorStyle: CSSProperties = {
  padding: "10px 14px",
  background: "#7F1D1D",
  color: "#FEE2E2",
  fontSize: 12,
  lineHeight: 1.5,
};

const controlsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  gap: 10,
  padding: 14,
};

function controlButton(active: boolean): CSSProperties {
  return {
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,.25)",
    background: active ? "#FDE68A" : "rgba(255,255,255,.12)",
    color: active ? "#92400E" : "#F8FAFC",
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
  };
}
