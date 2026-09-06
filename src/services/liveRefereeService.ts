/**
 * Live Referee voice session (Gemini Live API: talk + show missions on camera).
 *
 * PIPELINE (see start()):
 *   1. Rulebook pages load from R2 as visual reference (capped, best-effort).
 *   2. A websocket session opens (API keys rotate on failure, up to 3 tries).
 *   3. The microphone streams 16kHz PCM; the speaker plays 24kHz PCM back.
 *   4. Optional camera frames flow about twice a second for visual judging.
 *   5. stop() tears everything down: tracks, contexts, socket, timers.
 *
 * DESIGN NOTES for beginners:
 * - The camera is AUXILIARY: if frames stop flowing, only the camera is
 *   switched off and the voice call continues. The microphone is CORE: if
 *   its socket dies, the whole session is dead and is torn down honestly.
 * - Server answers arrive as events (audio chunks, transcripts, turn end,
 *   interruptions). This file translates them into the LiveCallbacks the
 *   modal renders; it never touches the screen itself.
 */

import { GoogleGenAI, Modality, MediaResolution, ThinkingLevel } from '@google/genai';
import { getNextApiKey, getRefereeCorrections } from './geminiService';

// ---------------------------------------------------------------------------
// Model, media & tuning constants
// ---------------------------------------------------------------------------

export const LIVE_MODEL = 'gemini-3.1-flash-live-preview';

/** Upper bound on rulebook pages injected as session context. */
const MAX_RULEBOOK_PAGES = 40;

/** R2 probe batch size when scanning pre-rendered page images. */
const PROBE_BATCH_SIZE = 8;

/** Consecutive 404s that mark "no more pages" for one rulebook file. */
const PROBE_MAX_MISSES = 3;

const R2_BASE = 'https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev';
const JPEG_MIME = 'image/jpeg';
const MIC_MIME = 'audio/pcm;rate=16000';
const MIC_SAMPLE_RATE = 16000;
const OUT_SAMPLE_RATE = 24000;

/** Give up connecting if the socket is not open by then. */
const CONNECT_TIMEOUT_MS = 20_000;

/** API keys to try before reporting a connection failure. */
const CONNECT_KEY_ATTEMPTS = 3;

/** Camera frame size/quality/cadence: light enough to stream continuously. */
const FRAME_WIDTH = 384;
const FRAME_JPEG_QUALITY = 0.5;
const FRAME_INTERVAL_MS = 2_000;
const FIRST_FRAME_DELAY_MS = 600;

/** Camera on but delivering no picture for this long => report it once. */
const CAM_NO_SIGNAL_MS = 6_000;

/** Consecutive failed frame sends that switch the camera off by itself. */
const CAM_MAX_FAILURES = 3;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LiveStatus = 'idle' | 'loading-book' | 'connecting' | 'live' | 'error';

export interface LiveTranscriptLine {
  who: 'user' | 'model';
  text: string;
}

export interface LiveCallbacks {
  onStatus: (s: LiveStatus, detail?: string) => void;
  onBookProgress: (loaded: number) => void;
  onUserText: (text: string) => void;
  onModelText: (text: string, done: boolean) => void;
  onInterrupted: () => void;
  // Camera failed repeatedly: the service already switched it off, the
  // voice session continues. UI should sync its toggle + explain.
  onCameraLost?: (detail?: string) => void;
}

export interface LiveStartOptions {
  seasonName: string;
  rulebookFiles: { name: string; url: string }[];
  callbacks: LiveCallbacks;
}

// ---------------------------------------------------------------------------
// Small internal helpers
// ---------------------------------------------------------------------------

/** Base64-encode a buffer without blowing the call stack on big blobs. */
function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return btoa(s);
}

/** Read the `rate=` parameter from an audio MIME type, else the fallback. */
function parsePcmRate(mimeType: string, fallback: number): number {
  try {
    for (const param of mimeType.split(';').map(p => p.trim())) {
      const [k, v] = param.split('=').map(p => p.trim());
      if (k === 'rate') {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n > 0) return n;
      }
    }
  } catch { /* malformed type: use the fallback */ }
  return fallback;
}

/** Stop every track of a media stream, ignoring already-stopped ones. */
function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach(t => { try { t.stop(); } catch { /* noop */ } });
}

/**
 * Translate a getUserMedia rejection into a Hebrew message for the given
 * device kind. Anything but an explicit denial means "not found".
 */
function friendlyMediaError(e: any, kind: 'mic' | 'cam'): Error {
  const denied = e?.name === 'NotAllowedError';
  if (kind === 'mic') {
    return new Error(denied
      ? 'הגישה למיקרופון נחסמה. אפשר גישה למיקרופון בדפדפן ונסה שוב.'
      : 'לא נמצא מיקרופון. בדוק שהמכשיר מחובר ונסה שוב.');
  }
  return new Error(denied
    ? 'הגישה למצלמה נחסמה. אפשר גישה למצלמה בדפדפן ונסה שוב.'
    : 'לא נמצאה מצלמה. בדוק שהמכשיר מחובר ונסה שוב.');
}

// ---------------------------------------------------------------------------
// Hebrew live-judge system prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(seasonName: string, corrections: string): string {
  return `You are a live FIRST LEGO League referee judge. You talk with a team next to the competition table, by voice, in English only.

Behavior rules:
- Always respond in English only, even if addressed in another language.
- Speak naturally and friendly, short. 1 to 3 sentences, unless asked to elaborate.
- Mention mission numbers and scoring conditions when relevant.
- When shown a mission on camera: first describe in one sentence what you see, then rule: legal or not, and how many points.
- If unsure: say so and ask to show it closer or to quote the rule.
- Never invent rules. Anything not in the rulebook or the brief, say you do not know and refer to a human referee.
- No LaTeX, no dollar signs, no special arrows. Numbers in plain words.
- Gracious professionalism comes before any achievement.

Key rules brief for the ${seasonName} season:
- The robot is fully autonomous after launch. It must not be touched outside home.
- Home and the launch area are the only places where touching the robot or equipment is allowed.
- Touching the robot outside home mid-match carries a penalty.
- Missions do not have to be done in order, unless a mission states otherwise.
- All equipment must fully fit inside home or the launch area before the match starts.
- Motors and sensors are limited per the season rulebook.
- Bonuses and precision tokens follow each mission's exact conditions.
${corrections ? `\nOfficial referee corrections that must be obeyed (they override the rulebook):\n${corrections}\n` : ''}
The full rulebook pages were attached as reference at the start of this call. Use them before your general knowledge.`;
}

// ---------------------------------------------------------------------------
// Rulebook pages from R2 (pre-rendered image sets, same flow as text judge)
// ---------------------------------------------------------------------------

/**
 * Fetch rulebook pages as base64 JPEGs. Files are probed page by page;
 * 404s are EXPECTED — three consecutive misses simply mean "last page".
 * Capped and fully skippable: an empty result just means the judge works
 * from the rules brief instead.
 */
async function fetchRulebookPages(
  files: { name: string; url: string }[],
  onProgress: (loaded: number) => void,
  isCancelled: () => boolean,
): Promise<{ data: string; mimeType: string }[]> {
  const pages: { data: string; mimeType: string }[] = [];

  for (const file of files) {
    if (isCancelled() || pages.length >= MAX_RULEBOOK_PAGES) break;
    const url = file.url || '';
    // Only R2 image-set rulebooks are supported (same flow as the text judge).
    if (!url.includes('fll-rules')) continue;
    const rawName = file.name || 'rulebook';
    const fileName = rawName.split('/').pop() || rawName;
    const encoded = encodeURIComponent(fileName);

    let page = 1;
    let consecutiveMisses = 0;
    while (consecutiveMisses < PROBE_MAX_MISSES && pages.length < MAX_RULEBOOK_PAGES) {
      if (isCancelled()) break;
      // Probe one batch in parallel; pages stay ordered by index.
      const batch: number[] = [];
      for (let k = 0; k < PROBE_BATCH_SIZE && pages.length + batch.length < MAX_RULEBOOK_PAGES; k++) {
        batch.push(page + k);
      }
      const results = await Promise.all(batch.map(async (p) => {
        try {
          const res = await fetch(`${R2_BASE}/fll-rules-images/${encoded}/page_${p}.jpg`);
          if (!res.ok) return null;
          const buf = await res.arrayBuffer();
          if (buf.byteLength < 500) return null;
          const head = new TextDecoder().decode(new Uint8Array(buf.slice(0, 100)));
          if (head.includes('<html')) return null;
          return { data: arrayBufferToBase64(buf), mimeType: JPEG_MIME };
        } catch {
          return null;
        }
      }));
      let batchMisses = 0;
      for (let i = 0; i < batch.length; i++) {
        const r = results[i];
        if (r) {
          consecutiveMisses = 0;
          batchMisses = 0;
          pages.push({ data: r.data, mimeType: r.mimeType });
          onProgress(pages.length);
        } else {
          consecutiveMisses++;
          batchMisses++;
          if (consecutiveMisses >= PROBE_MAX_MISSES) break;
        }
      }
      page += batch.length;
      if (batchMisses === batch.length) break;
    }
  }
  return pages;
}

// ---------------------------------------------------------------------------
// Live session: socket + mic + speaker + camera + captions
// ---------------------------------------------------------------------------

export class LiveRefereeSession {
  // -- connection --
  private session: any = null;
  private cancelled = false;
  // Once a send fails with a dead socket, the session is unusable. Tear it
  // down once with an honest error instead of spamming a throw per frame.
  private transportDead = false;

  // -- microphone --
  private micStream: MediaStream | null = null;
  private micCtx: AudioContext | null = null;
  private micNode: AudioWorkletNode | null = null;
  private micOn = true;

  // -- speaker --
  private outCtx: AudioContext | null = null;
  private playQueue: Float32Array[] = [];
  private playCursor = 0;
  private playSources: AudioBufferSourceNode[] = [];

  // -- camera --
  private camTimer: ReturnType<typeof setInterval> | null = null;
  private camFailures = 0;
  private camNoSignalSince: number | null = null;
  private camStream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;

  // -- captions --
  private modelPending = '';

  constructor(private opts: LiveStartOptions) {}

  /** A send failed on a dead socket: report once, then go quiet. */
  private handleTransportDead(): void {
    if (this.transportDead || this.cancelled) return;
    this.transportDead = true;
    this.opts.callbacks.onStatus('error', 'החיבור לשופט החי נותק. סגרו ופתחו שיחה חדשה.');
    void this.cleanup();
  }

  /** Camera gave up (no signal / repeated send failures): switch it off and
   * let the voice call continue, telling the UI exactly what happened. */
  private loseCamera(detail: string): void {
    this.camFailures = 0;
    this.camNoSignalSince = null;
    void this.setCameraEnabled(false, null).catch(() => {});
    try { this.opts.callbacks.onCameraLost?.(detail); } catch { /* noop */ }
  }

  /**
   * Full startup: rulebook reference, socket connect, then microphone.
   * Throws a Hebrew, user-ready error when the mic or the worklet fails.
   */
  async start(): Promise<void> {
    const { callbacks, seasonName, rulebookFiles } = this.opts;
    this.cancelled = false;
    this.transportDead = false;
    callbacks.onStatus('loading-book');

    const corrections = await getRefereeCorrections().catch(() => '');
    if (this.cancelled) return;
    const systemPrompt = buildSystemPrompt(seasonName || 'BIOGLOW', corrections || '');

    // Connect (rotates API keys on failure, up to CONNECT_KEY_ATTEMPTS tries).
    callbacks.onStatus('connecting');
    let lastErr: any = null;
    for (let attempt = 0; attempt < CONNECT_KEY_ATTEMPTS; attempt++) {
      if (this.cancelled) return;
      try {
        const apiKey = await getNextApiKey();
        if (this.cancelled) return;
        await this.connectOnce(apiKey, systemPrompt);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (lastErr || this.cancelled) {
      if (!this.cancelled) {
        callbacks.onStatus('error', 'החיבור לשופט החי נכשל. בדוק חיבור לאינטרנט ונסה שוב.');
      }
      await this.cleanup();
      return;
    }

    // Inject the rulebook as visual reference (best effort, capped).
    try {
      const pages = await fetchRulebookPages(
        rulebookFiles || [],
        (n) => callbacks.onBookProgress(n),
        () => this.cancelled,
      );
      if (!this.cancelled && this.session && pages.length > 0) {
        const parts: any[] = [{
          text: `--- חוברת החוקים הרשמית כרפרנס (${pages.length} עמודים). השתמש בה לפני הידע הכללי. ענה בעברית בקול. ---`,
        }];
        for (const p of pages) parts.push({ inlineData: { data: p.data, mimeType: p.mimeType } });
        this.session.sendClientContent({
          turns: [{ role: 'user', parts }],
          turnComplete: false,
        });
      }
    } catch (e) {
      console.warn('live rulebook inject failed (continuing without it):', e);
    }
    if (this.cancelled) return;

    // Start the microphone after everything is ready.
    await this.startMic();
    if (this.cancelled) return;
    callbacks.onStatus('live');
  }

  /**
   * Open one websocket, resolving when the server says hello and rejecting
   * on error, server close, or timeout. The `settled` flag guarantees a
   * single outcome even if a doomed attempt answers late.
   */
  private connectOnce(apiKey: string, systemPrompt: string): Promise<void> {
    const { callbacks } = this.opts;
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; reject(new Error('live connect timeout')); }
      }, CONNECT_TIMEOUT_MS);
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      try {
        const ai = new GoogleGenAI({ apiKey });
        ai.live.connect({
          model: LIVE_MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Alnilam' } },
              languageCode: 'en',
            },
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            contextWindowCompression: {
              // @ts-ignore SDK types lag behind the wire format here
              slidingWindow: { targetTokens: '52428' },
              // @ts-ignore SDK types lag behind the wire format here
              triggerTokens: '104857',
            } as any,
            systemInstruction: systemPrompt,
          },
          callbacks: {
            onopen: () => {
              // Resolve the promise but keep listening via the shared handler.
              done(() => resolve());
            },
            onmessage: (msg: any) => this.handleMessage(msg),
            onerror: (e: any) => {
              console.warn('live session error:', e?.message || e);
              done(() => reject(new Error(e?.message || 'live error')));
            },
            onclose: (e: any) => {
              // The close code/reason is the single best clue when a session
              // dies in the field (quota, model access, network), so log it.
              console.warn('live socket closed:', e?.code, e?.reason);
              if (!settled) {
                done(() => reject(new Error(e?.reason || 'live closed')));
              } else if (!this.cancelled) {
                const reason = e?.reason ? `: ${e.reason}` : '';
                callbacks.onStatus('error', `החיבור לשופט החי נותק${reason}. נסה שוב.`);
                void this.cleanup();
              }
            },
          },
        }).then((s: any) => {
          this.session = s;
        }).catch((e: any) => {
          done(() => reject(e));
        });
      } catch (e) {
        done(() => reject(e));
      }
    });
  }

  /**
   * Translate one server event into callbacks: queued audio, live captions,
   * interruptions (user talked over the judge), and finished turns.
   */
  private handleMessage(message: any): void {
    const { callbacks } = this.opts;
    if (!message) return;
    if (message?.goAway) {
      console.warn('live server goAway (closing soon):', message.goAway);
    }

    // Audio output -> playback queue.
    try {
      const parts = message?.serverContent?.modelTurn?.parts;
      if (Array.isArray(parts)) {
        for (const part of parts) {
          const inline = part?.inlineData;
          if (inline?.data) {
            // The rate is parsed (and documented) but playback always runs
            // on the fixed 24kHz output context the model was asked for.
            const rate = parsePcmRate(inline.mimeType || '', OUT_SAMPLE_RATE);
            void rate;
            this.enqueueAudio(inline.data);
          }
        }
      }
    } catch (e) {
      console.warn('live audio parse failed:', e);
    }

    const sc = message?.serverContent;
    if (!sc) return;

    if (sc.interrupted) {
      this.clearPlayback();
      this.modelPending = '';
      callbacks.onInterrupted();
    }
    if (typeof sc.inputTranscription?.text === 'string' && sc.inputTranscription.text.trim()) {
      callbacks.onUserText(sc.inputTranscription.text.trim());
    }
    if (typeof sc.outputTranscription?.text === 'string' && sc.outputTranscription.text) {
      this.modelPending += sc.outputTranscription.text;
      callbacks.onModelText(this.modelPending, false);
    }
    if (sc.turnComplete) {
      const done = this.modelPending.trim();
      this.modelPending = '';
      if (done) callbacks.onModelText(done, true);
    }
  }

  // ===== microphone =====

  /** Ask for the mic and start streaming 16kHz PCM frames to the socket. */
  private async startMic(): Promise<void> {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e: any) {
      throw friendlyMediaError(e, 'mic');
    }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    this.micCtx = new AC({ sampleRate: MIC_SAMPLE_RATE });
    try {
      // Same-origin static file: allowed by the CSP (blob: workers are not).
      const base = (import.meta.env?.BASE_URL as string) || '/';
      await this.micCtx.audioWorklet.addModule(`${base}live-mic-worklet.js`);
    } catch (e) {
      throw new Error('טעינת מעבד השמע נכשלה. נסה כרום מעודכן.');
    }
    const src = this.micCtx.createMediaStreamSource(this.micStream);
    this.micNode = new AudioWorkletNode(this.micCtx, 'live-mic-proc');
    this.micNode.port.onmessage = (ev: MessageEvent) => {
      if (!this.micOn || this.cancelled || !this.session || this.transportDead) return;
      try {
        const b64 = arrayBufferToBase64(ev.data as ArrayBuffer);
        this.session.sendRealtimeInput({
          audio: { data: b64, mimeType: MIC_MIME },
        });
      } catch {
        this.handleTransportDead();
      }
    };
    src.connect(this.micNode);
    if (this.micCtx.state === 'suspended') {
      await this.micCtx.resume().catch(() => {});
    }
  }

  /** Mute/unmute locally. Muting also ends the audio stream server-side. */
  setMicEnabled(on: boolean): void {
    this.micOn = on;
    if (!on && this.session) {
      try { this.session.sendRealtimeInput({ audioStreamEnd: true }); } catch { /* noop */ }
    }
  }

  // ===== speaker (model voice playback) =====

  /** Lazily create the fixed-rate output context (24kHz, like the model). */
  private ensureOutCtx(): AudioContext | null {
    if (this.outCtx) return this.outCtx;
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.outCtx = new AC({ sampleRate: OUT_SAMPLE_RATE });
      if (this.outCtx.state === 'suspended') {
        void this.outCtx.resume().catch(() => {});
      }
      this.playCursor = this.outCtx.currentTime;
      return this.outCtx;
    } catch {
      return null;
    }
  }

  /** Decode one base64 PCM chunk and schedule it right after the previous one. */
  private enqueueAudio(b64: string): void {
    const ctx = this.ensureOutCtx();
    if (!ctx) return;
    try {
      const raw = atob(b64);
      const len = raw.length / 2;
      if (len <= 0) return;
      const float = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const v = (raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8));
        float[i] = (v >= 0x8000 ? v - 0x10000 : v) / 0x8000;
      }
      this.playQueue.push(float);
      this.pumpPlayback();
    } catch (e) {
      console.warn('live playback enqueue failed:', e);
    }
  }

  /** Drain the queue onto a gapless timeline of scheduled buffers. */
  private pumpPlayback(): void {
    const ctx = this.outCtx;
    if (!ctx || this.playQueue.length === 0) return;
    try {
      if (this.playCursor < ctx.currentTime) this.playCursor = ctx.currentTime + 0.05;
      while (this.playQueue.length > 0) {
        const chunk = this.playQueue.shift()!;
        const buf = ctx.createBuffer(1, chunk.length, ctx.sampleRate);
        buf.getChannelData(0).set(chunk);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(this.playCursor);
        this.playSources.push(src);
        src.onended = () => {
          const i = this.playSources.indexOf(src);
          if (i >= 0) this.playSources.splice(i, 1);
        };
        this.playCursor += buf.duration;
      }
    } catch (e) {
      console.warn('live playback pump failed:', e);
    }
  }

  /** Stop everything audible immediately (used on interruption/teardown). */
  private clearPlayback(): void {
    this.playQueue = [];
    try {
      const ctx = this.outCtx;
      if (ctx) this.playCursor = ctx.currentTime;
      for (const s of this.playSources) {
        try { s.stop(); } catch { /* already ended */ }
      }
    } catch { /* noop */ }
    this.playSources = [];
  }

  // ===== camera (auxiliary: never kills the voice call) =====

  /**
   * Turn the camera on/off. Frames flow on an interval; any persistent
   * failure switches the camera back off with an explanation while the
   * conversation continues by voice.
   */
  async setCameraEnabled(on: boolean, videoEl: HTMLVideoElement | null): Promise<void> {
    if (on) {
      this.videoEl = videoEl;
      try {
        this.camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
        });
      } catch (e: any) {
        throw friendlyMediaError(e, 'cam');
      }
      if (videoEl) {
        videoEl.srcObject = this.camStream;
        try {
          await videoEl.play();
        } catch {
          throw new Error('הפעלת התצוגה המקדימה נכשלה. סגור אפליקציות מצלמה אחרות ונסה שוב.');
        }
      }
      this.camFailures = 0;
      this.camNoSignalSince = null;
      if (this.camTimer) clearInterval(this.camTimer);
      this.camTimer = setInterval(() => this.captureFrame(), FRAME_INTERVAL_MS);
      // Send one frame right away so the judge sees the field immediately.
      setTimeout(() => this.captureFrame(), FIRST_FRAME_DELAY_MS);
    } else {
      if (this.camTimer) { clearInterval(this.camTimer); this.camTimer = null; }
      stopTracks(this.camStream);
      this.camStream = null;
      if (this.videoEl) {
        try { this.videoEl.srcObject = null; } catch { /* noop */ }
        this.videoEl = null;
      }
    }
  }

  /** Grab one small JPEG from the preview and stream it to the judge. */
  private captureFrame(): void {
    const video = this.videoEl;
    if (!video || this.cancelled || !this.session || this.transportDead) return;
    if (video.readyState < 2 || video.videoWidth === 0) {
      // Camera is on but delivers no picture. Report once if stuck this way
      // (usually another app holds the camera).
      if (this.camNoSignalSince == null) {
        this.camNoSignalSince = Date.now();
      } else if (Date.now() - this.camNoSignalSince > CAM_NO_SIGNAL_MS) {
        this.loseCamera('לא מתקבל אות וידאו מהמצלמה. בדוק שהיא לא תפוסה באפליקציה אחרת.');
      }
      return;
    }
    let b64: string | null = null;
    try {
      const scale = FRAME_WIDTH / video.videoWidth;
      const canvas = document.createElement('canvas');
      canvas.width = FRAME_WIDTH;
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx2d = canvas.getContext('2d');
      if (!ctx2d) return;
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', FRAME_JPEG_QUALITY);
      b64 = dataUrl.split(',')[1] || null;
    } catch { return; }
    if (!b64) return;
    this.camNoSignalSince = null;
    try {
      // NOTE: the `media` field is deprecated server-side (the server closes
      // the socket on mediaChunks). Video frames go through `video`.
      this.session.sendRealtimeInput({ video: { data: b64, mimeType: JPEG_MIME } });
      this.camFailures = 0;
    } catch {
      // Camera is auxiliary: after a few consecutive failures switch it off
      // and keep the voice session alive instead of tearing everything down.
      this.camFailures++;
      if (this.camFailures >= CAM_MAX_FAILURES) {
        this.loseCamera('שליחת תמונה נכשלה שוב ושוב. המצלמה כובתה, השיחה ממשיכה בקול.');
      }
    }
  }

  // ===== typed messages (bypass voice) =====

  /** Send a typed line into the live conversation (also echoed locally). */
  sendText(text: string): void {
    if (!this.session || !text.trim()) return;
    try {
      this.session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: text.trim() }] }],
        turnComplete: true,
      });
    } catch (e) {
      console.warn('live sendText failed:', e);
    }
  }

  // ===== teardown (always safe to call twice) =====

  /** End the call: stop hardware, close contexts, close the socket. */
  async stop(): Promise<void> {
    this.cancelled = true;
    await this.cleanup();
  }

  private async cleanup(): Promise<void> {
    if (this.camTimer) { clearInterval(this.camTimer); this.camTimer = null; }
    stopTracks(this.camStream);
    this.camStream = null;
    stopTracks(this.micStream);
    this.micStream = null;
    try { this.micNode?.disconnect(); } catch { /* noop */ }
    this.micNode = null;
    if (this.micCtx) {
      await this.micCtx.close().catch(() => {});
      this.micCtx = null;
    }
    this.clearPlayback();
    if (this.outCtx) {
      await this.outCtx.close().catch(() => {});
      this.outCtx = null;
    }
    if (this.session) {
      try { await this.session.close(); } catch { /* noop */ }
      this.session = null;
    }
    this.modelPending = '';
    this.playQueue = [];
  }
}
