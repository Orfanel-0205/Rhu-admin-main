// src/lib/webrtcCall.ts
//
// A one-to-one call between two staff browsers, in the dashboard itself.
//
// The audio and video go directly between the two browsers; the server only
// carries the handshake (an offer, an answer, and each side's network routes).
// That is why this replaced sending staff out to a Jitsi window: fewer moving
// parts, nothing to sign in to, and the conversation never leaves the two
// people having it.
//
// HOW A CALL COMES TOGETHER
//   1. Both sides open a microphone (and camera, for a video call).
//   2. The caller describes what it can send — the "offer" — and posts it.
//   3. The callee answers with what it can receive.
//   4. Both then post the network routes they can be reached on, as the
//      browser discovers them, and the first pair that works wins.
//
// WHAT CAN GO WRONG, HONESTLY
//   Without a TURN relay configured, step 4 fails whenever neither side can be
//   reached directly — most calls between mobile data and a home connection.
//   The call then rings, connects to nothing, and times out. `onState` reports
//   "failed" so the interface can say so plainly rather than showing a frozen
//   screen.

export type CallState =
  | "idle"
  | "getting-media"
  | "connecting"
  | "connected"
  | "failed"
  | "ended";

export interface CallHandlers {
  onLocalStream: (stream: MediaStream) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onState: (state: CallState, detail?: string) => void;
}

export interface CallTransport {
  /** Post one handshake step to the other side. */
  send: (type: "offer" | "answer" | "ice" | "hangup", payload: unknown) => Promise<void>;
  /** Anything addressed to us since the last ask. */
  receive: () => Promise<
    Array<{ type: string; payload: any; from_user_id: number }> | null
  >;
}

const POLL_MS = 1200;

export class PeerCall {
  private pc: RTCPeerConnection | null = null;
  private local: MediaStream | null = null;
  private remote = new MediaStream();
  private poll: number | null = null;
  private stopped = false;
  private politeWait: Promise<void> | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private candidateTimer: number | null = null;
  private failures = 0;

  constructor(
    private readonly options: {
      iceServers: RTCIceServer[];
      video: boolean;
      /**
       * Which side speaks first.
       *
       * This used to be "did I start the call", which looked obvious and was
       * wrong: the server reuses an existing active call, so both browsers
       * could believe they were the receiver and neither would ever send an
       * offer — the call sat on "Connecting…" forever. Both sides now work it
       * out from the two user ids, which they agree on by definition.
       */
      isOfferer: boolean;
      transport: CallTransport;
      handlers: CallHandlers;
    }
  ) {}

  async start(): Promise<void> {
    const { handlers, iceServers, video, isOfferer, transport } = this.options;

    handlers.onState("getting-media");

    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
      });
    } catch (error: any) {
      // Permission refused, or no microphone at all. Both are the person's to
      // fix, so say which rather than "call failed".
      handlers.onState(
        "failed",
        error?.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in the browser address bar, then try again."
          : "No microphone or camera was found on this computer."
      );
      return;
    }

    handlers.onLocalStream(this.local);
    handlers.onState("connecting");

    this.pc = new RTCPeerConnection({ iceServers });

    this.local.getTracks().forEach((track) => this.pc?.addTrack(track, this.local!));

    this.pc.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!this.remote.getTracks().some((t) => t.id === track.id)) {
          this.remote.addTrack(track);
        }
      });

      handlers.onRemoteStream(this.remote);
    };

    // Network routes are found in bursts, and one request each is what pushed
    // a call past the server's rate limit. They are collected for a moment and
    // sent together instead.
    this.pc.onicecandidate = (event) => {
      if (!event.candidate) return;

      this.pendingCandidates.push(event.candidate.toJSON());

      if (this.candidateTimer === null) {
        this.candidateTimer = window.setTimeout(() => {
          this.candidateTimer = null;
          this.flushCandidates();
        }, 400);
      }
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;

      if (state === "connected") {
        handlers.onState("connected");
      } else if (state === "failed") {
        handlers.onState(
          "failed",
          "The call could not connect. This usually means the two devices are on networks that cannot reach each other directly."
        );
      } else if (state === "disconnected") {
        handlers.onState("connecting", "Reconnecting…");
      }
    };

    if (isOfferer) {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await transport.send("offer", offer);
    }

    this.startPolling();
    this.watchForSilence();
  }

  /**
   * A call that has not connected within this long is not going to. Saying so
   * beats a panel that reads "Connecting…" until someone gives up, and names
   * the likely reason so it can actually be fixed.
   */
  private watchForSilence(): void {
    window.setTimeout(() => {
      if (this.stopped || !this.pc) return;

      if (this.pc.connectionState !== "connected") {
        this.options.handlers.onState(
          "failed",
          "The call did not connect. The two devices are probably on networks that cannot reach each other directly."
        );
      }
    }, 20000);
  }

  /** Mute or unmute the microphone. Returns the new muted state. */
  toggleMute(): boolean {
    const track = this.local?.getAudioTracks()[0];

    if (!track) return false;

    track.enabled = !track.enabled;

    return !track.enabled;
  }

  /** Turn the camera off or on. Returns the new "camera off" state. */
  toggleCamera(): boolean {
    const track = this.local?.getVideoTracks()[0];

    if (!track) return true;

    track.enabled = !track.enabled;

    return !track.enabled;
  }

  hasVideo(): boolean {
    return (this.local?.getVideoTracks().length ?? 0) > 0;
  }

  async hangUp(announce = true): Promise<void> {
    if (this.stopped) return;

    this.stopped = true;

    if (this.poll !== null) {
      window.clearInterval(this.poll);
      this.poll = null;
    }

    if (this.candidateTimer !== null) {
      window.clearTimeout(this.candidateTimer);
      this.candidateTimer = null;
    }

    if (announce) {
      try {
        await this.options.transport.send("hangup", {});
      } catch {
        // The other side also learns from the call ending server-side.
      }
    }

    this.local?.getTracks().forEach((track) => track.stop());
    this.remote.getTracks().forEach((track) => track.stop());

    try {
      this.pc?.close();
    } catch {
      // Already closed.
    }

    this.pc = null;
    this.options.handlers.onState("ended");
  }

  private flushCandidates(): void {
    if (this.pendingCandidates.length === 0 || this.stopped) return;

    const batch = this.pendingCandidates;
    this.pendingCandidates = [];

    void this.options.transport
      .send("ice", { candidates: batch })
      .catch(() => this.noteFailure());
  }

  /**
   * A handshake request that fails is not a network problem the person can
   * fix by waiting, so after a few in a row the call says so rather than
   * sitting on "Connecting…". Being refused by the server looks exactly like
   * silence from the other side, and staff deserve the difference.
   */
  private noteFailure(): void {
    this.failures += 1;

    if (this.failures === 4) {
      this.options.handlers.onState(
        "failed",
        "The server is refusing the call setup. This usually clears in a minute; if it keeps happening, tell IT the call signalling is being rate limited."
      );
    }
  }

  private startPolling(): void {
    this.poll = window.setInterval(() => {
      void this.drain();
    }, POLL_MS);

    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.stopped || !this.pc) return;

    // One drain at a time: signals must be applied in the order they arrived,
    // and an overlapping fetch would interleave them.
    if (this.politeWait) return;

    let release = () => {};
    this.politeWait = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      const signals = await this.options.transport.receive();

      // A successful exchange clears the failure streak.
      this.failures = 0;

      for (const signal of signals ?? []) {
        if (this.stopped || !this.pc) break;

        if (signal.type === "offer") {
          await this.pc.setRemoteDescription(new RTCSessionDescription(signal.payload));

          const answer = await this.pc.createAnswer();
          await this.pc.setLocalDescription(answer);
          await this.options.transport.send("answer", answer);
        } else if (signal.type === "answer") {
          if (this.pc.signalingState !== "stable") {
            await this.pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
          }
        } else if (signal.type === "ice") {
          // Sent in batches now; older single-candidate messages still work.
          const candidates: RTCIceCandidateInit[] = Array.isArray(signal.payload?.candidates)
            ? signal.payload.candidates
            : [signal.payload];

          for (const candidate of candidates) {
            try {
              await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch {
              // A route that arrives before the description it belongs to is
              // safe to drop; more will follow.
            }
          }
        } else if (signal.type === "hangup") {
          await this.hangUp(false);
          return;
        }
      }
    } catch {
      // One dropped poll is not a dropped call; a run of them means the
      // server is refusing us, which the person needs told.
      this.noteFailure();
    } finally {
      release();
      this.politeWait = null;
    }
  }
}
