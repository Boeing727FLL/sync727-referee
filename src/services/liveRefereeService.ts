/**
 * liveRefereeService.ts — voice Live referee, no backend required.
 *
 * SECURITY MODEL (no Netlify/Firebase functions):
 * 1. Take one rotated key from the existing encrypted vault pool
 *    (same keys the chat already uses at runtime).
 * 2. Use it for a single tiny `tokens.create` call that mints a
 *    single-use ephemeral token (v1alpha): 6-min message expiry,
 *    90-sec connect window, and `liveConnectConstraints` that LOCK the
 *    model + referee config — a tampered client cannot turn it into a
 *    general chatbot.
 * 3. Connect the Live WebSocket with the token as if it were an API key.
 *    The vault key itself is never embedded anywhere; the token dies
 *    after one session.
 *
 * Model: gemini-3.8-live-extended-thinking (audio in/out, Hebrew referee).
 */
import {
  GoogleGenAI,
  MediaResolution,
  Modality,
  ThinkingLevel,
  type LiveConnectConfig,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import { getNextApiKey, getRefereeCorrections, getRulebookLiveParts } from './geminiService';
import { LIVE_MAX_SESSION_MS } from '../lib/liveQuota';

/** Rulebook files the main chat loaded (passed in from the page). */
export interface LiveRulebookFile { name: string; url: string; }

export interface LiveStartOptions {
  files?: LiveRulebookFile[];
  season?: string;
}

/** Live voice model with background reasoning. */
export const LIVE_MODEL = 'models/gemini-3.8-live-extended-thinking';
/** Ephemeral token: messages accepted this long after mint. */
const TOKEN_TTL_MS = 6 * 60 * 1000;
/** Ephemeral token: new sessions accepted this long after mint. */
const TOKEN_CONNECT_WINDOW_MS = 90 * 1000;

const REFEREE_SYSTEM_INSTRUCTION = [
  'אתה "השופט הווירטואלי" — עוזר קולי של קבוצת רובוטיקה בתחרות FIRST LEGO League.',
  'כללים:',
  '1. ענה תמיד בעברית מדוברת, קצר — משפט עד שלושה משפטים.',
  '2. ענה על חוקי המשחק, ניקוד, משימות הזירה והתנהלות תחרות.',
  '3. אם אינך בטוח — אמור זאת במפורש ואל תמציא חוקים.',
  '4. לשאלה מורכבת שדורשת ציטוט מדויק מספר החוקים — הפנה את המשתמש לצ\'אט הכתוב.',
  '5. תשובותיך אינן רשמיות ואינן מחליפות שופט אנושי.',
].join('\n');

/** Single config object: locked into the token AND used on connect. */
function buildLiveConfig(season?: string, corrections?: string): LiveConnectConfig {
  let instruction = REFEREE_SYSTEM_INSTRUCTION;
  if (season && season !== 'UNKNOWN') {
    instruction += `\n\nCurrent season: ${season}. Prefer its missions and scoring.`;
  }
  if (corrections && corrections.trim()) {
    instruction += `\n\nOwner corrections (override everything above):\n${corrections.trim()}`;
  }
  instruction += '\n\nThe official rulebook page images arrive as your first turn, marked --- RULEBOOK PAGE --- / --- UPDATES PAGE ---. Treat them as your rule dictionary.';
  return {
    responseModalities: [Modality.AUDIO],
    systemInstruction: instruction,
    mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
    thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
  };
}

/** Mint a single-use ephemeral Live token from one vault key. */
async function mintLiveToken(lockedConfig: LiveConnectConfig): Promise<string> {
  let vaultKey: string;
  try {
    vaultKey = await getNextApiKey();
  } catch {
    throw new Error('אין מפתחות זמינים לשיחת לייב. נסו שוב מאוחר יותר.');
  }
  const minter = new GoogleGenAI({ apiKey: vaultKey, httpOptions: { apiVersion: 'v1alpha' } });
  const token = await minter.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
      newSessionExpireTime: new Date(Date.now() + TOKEN_CONNECT_WINDOW_MS).toISOString(),
      liveConnectConstraints: { model: LIVE_MODEL, config: lockedConfig },
    },
  });
  if (!token?.name) throw new Error('יצירת חיבור הלייב נכשלה. נסו שוב.');
  return token.name;
}

/**
 * Downscale a rulebook JPEG so the opening turn stays light on the wire.
 * At MEDIUM media resolution (256 tokens/image) anything above ~1024px is
 * wasted bytes; readability of rules text is preserved.
 */
function downscaleJpegBase64(b64: string, maxDim = 1024, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          if (scale >= 1) { resolve(b64); return; }
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(b64); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const url = canvas.toDataURL('image/jpeg', quality);
          resolve(url.includes(',') ? url.split(',')[1] : b64);
        } catch {
          resolve(b64);
        }
      };
      img.onerror = () => resolve(b64);
      img.src = `data:image/jpeg;base64,${b64}`;
    } catch {
      resolve(b64);
    }
  });
}

function b64encode(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

function downsampleTo16k(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
    return out;
  }
  const ratio = inputRate / 16000;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const idx = Math.floor(i * ratio);
    const v = Math.max(-1, Math.min(1, input[idx]));
    out[i] = v * 0x7fff;
  }
  return out;
}

export type LiveStatus = 'connecting' | 'loading-rules' | 'live' | 'listening' | 'speaking' | 'thinking' | 'ended';
export type LiveEndReason = 'user' | 'timeout' | 'error' | 'closed';

export interface LiveCallbacks {
  onStatus: (s: LiveStatus) => void;
  /** Live captions: who ('you' | 'referee') + text. */
  onTranscript: (who: 'you' | 'referee', text: string) => void;
  onError: (message: string) => void;
  onEnd: (reason: LiveEndReason) => void;
}

const HEBREW_ERRORS: Array<[RegExp, string]> = [
  [/not.?allowed|permission|denied/i, 'הגישה למיקרופון נדחתה. אפשרו מיקרופון בהגדרות הדפדפן ונסו שוב.'],
  [/not.?found|no.*microphone|device/i, 'לא נמצא מיקרופון. חברו מיקרופון ונסו שוב.'],
];

function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  for (const [re, he] of HEBREW_ERRORS) if (re.test(raw)) return he;
  return 'החיבור ללייב נכשל. בדקו חיבור לאינטרנט ונסו שוב.';
}

/**
 * One Live referee voice session. Quota is consumed by the caller AFTER
 * `onStatus('live')` fires (failed connects cost nothing).
 */
export class LiveRefereeSession {
  private cb: LiveCallbacks;
  private session: Session | null = null;
  private micStream: MediaStream | null = null;
  private micCtx: AudioContext | null = null;
  private micProc: ScriptProcessorNode | null = null;
  private playCtx: AudioContext | null = null;
  private playGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private nextPlayTime = 0;
  private micOn = true;
  private stopped = false;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private speakResetTimer: ReturnType<typeof setTimeout> | null = null;
  private levelRaf = 0;
  private lastStatus: LiveStatus = 'connecting';
  private startOpts: LiveStartOptions = {};
  private liveConfig: LiveConnectConfig | null = null;

  constructor(cb: LiveCallbacks) {
    this.cb = cb;
  }

  private setStatus(s: LiveStatus): void {
    if (this.stopped && s !== 'ended') return;
    this.lastStatus = s;
    this.cb.onStatus(s);
  }

  /** Open mic + lock config + mint token + connect. Must be called from a user gesture. */
  async start(opts: LiveStartOptions = {}): Promise<void> {
    this.startOpts = opts;
    this.setStatus('connecting');
    // 1. Microphone first (needs the user gesture + permission).
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      throw new Error(friendlyError(err));
    }
    this.micStream = stream;
    // 2. Build the locked referee config (season + owner corrections baked in).
    let corrections = '';
    try {
      corrections = (await getRefereeCorrections()).trim();
    } catch { /* corrections are best-effort */ }
    this.liveConfig = buildLiveConfig(opts.season, corrections);
    // 3. Mint single-use token, then connect Live with it.
    const tokenName = await mintLiveToken(this.liveConfig);
    if (this.stopped) { stream.getTracks().forEach(t => t.stop()); return; }
    const ai = new GoogleGenAI({ apiKey: tokenName, httpOptions: { apiVersion: 'v1alpha' } });
    try {
      this.session = await ai.live.connect({
        model: LIVE_MODEL,
        config: this.liveConfig,
        callbacks: {
          onopen: () => void this.handleOpen(),
          onmessage: (msg: LiveServerMessage) => this.handleMessage(msg),
          onerror: () => this.fail('החיבור ללייב נקטע. נסו שוב.'),
          onclose: () => {
            if (!this.stopped) this.finish('closed');
          },
        },
      });
    } catch (err) {
      stream.getTracks().forEach(t => t.stop());
      throw new Error(friendlyError(err));
    }
  }

  private async handleOpen(): Promise<void> {
    if (this.stopped) return;
    this.startMicPipe();
    this.startPlaybackCtx();
    this.startLevelLoop();
    // Rulebook context first (same page images the text chat uses),
    // then the greeting nudge — and only then is the session "live".
    await this.sendRulebookContext();
    if (this.stopped) return;
    this.setStatus('live');
    // Nudge the referee to greet in Hebrew so users instantly hear it works.
    try {
      this.session?.sendClientContent({ turns: ['הצג את עצמך במשפט אחד בעברית'] });
    } catch { /* greeting is best-effort */ }
    this.maxTimer = setTimeout(() => this.finish('timeout'), LIVE_MAX_SESSION_MS);
  }

  /**
   * Send the rulebook page images as opening turns (chunked per ~10 pages
   * so no single WebSocket message gets unwieldy). Best-effort: a session
   * without rulebook context is still useful.
   */
  private async sendRulebookContext(): Promise<void> {
    const files = this.startOpts.files ?? [];
    if (!files.length || !this.session) return;
    this.setStatus('loading-rules');
    try {
      const parts = await getRulebookLiveParts(files);
      if (this.stopped || !this.session || parts.length <= 2) return;
      // Split into chunks of ~10 images (20 parts) + keep texts with images.
      const CHUNK_PARTS = 20;
      for (let i = 0; i < parts.length; i += CHUNK_PARTS) {
        if (this.stopped || !this.session) return;
        const slice = parts.slice(i, i + CHUNK_PARTS);
        const liveParts = [];
        for (const p of slice) {
          if (p.inlineData) {
            liveParts.push({
              inlineData: { data: await downscaleJpegBase64(p.inlineData.data), mimeType: p.inlineData.mimeType },
            });
          } else if (p.text) {
            liveParts.push({ text: p.text });
          }
        }
        try {
          this.session.sendClientContent({ turns: [{ role: 'user', parts: liveParts }] });
        } catch {
          return; // transport hiccup — continue without the rest
        }
      }
    } catch (err) {
      console.warn('Live rulebook context failed, continuing without it:', err);
    }
  }

  private startMicPipe(): void {
    if (!this.micStream) return;
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error('הדפדפן לא תומך בהקלטת אודיו.');
    const ctx = new Ctx();
    void ctx.resume().catch(() => undefined);
    const src = ctx.createMediaStreamSource(this.micStream);
    // ScriptProcessor is deprecated but universal; 5-min sessions only.
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (ev) => {
      if (this.stopped || !this.micOn || !this.session) return;
      const input = ev.inputBuffer.getChannelData(0);
      // Mic activity → "listening" pulse (unless model is speaking).
      let peak = 0;
      for (let i = 0; i < input.length; i += 8) {
        const a = Math.abs(input[i]);
        if (a > peak) peak = a;
      }
      if (peak > 0.08 && this.lastStatus === 'live') this.setStatus('listening');
      else if (peak <= 0.02 && this.lastStatus === 'listening') this.setStatus('live');
      const pcm16 = downsampleTo16k(input, ctx.sampleRate);
      try {
        this.session.sendRealtimeInput({
          audio: { data: b64encode(new Uint8Array(pcm16.buffer)), mimeType: 'audio/pcm;rate=16000' },
        });
      } catch { /* transient send failure — keep going */ }
    };
    src.connect(proc);
    proc.connect(ctx.destination);
    this.micCtx = ctx;
    this.micProc = proc;
  }

  private startPlaybackCtx(): void {
    try {
      this.playCtx = new AudioContext({ sampleRate: 24000 });
    } catch {
      this.playCtx = new AudioContext();
    }
    void this.playCtx.resume().catch(() => undefined);
    this.playGain = this.playCtx.createGain();
    this.analyser = this.playCtx.createAnalyser();
    this.analyser.fftSize = 512;
    this.playGain.connect(this.analyser);
    this.analyser.connect(this.playCtx.destination);
    this.nextPlayTime = this.playCtx.currentTime;
  }

  private playPcm24k(b64: string): void {
    if (!this.playCtx || !this.playGain) return;
    try {
      const raw = atob(b64);
      const bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      const int16 = new Int16Array(bytes.buffer);
      const floats = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) floats[i] = int16[i] / 0x8000;
      const buf = this.playCtx.createBuffer(1, floats.length, 24000);
      buf.getChannelData(0).set(floats);
      const src = this.playCtx.createBufferSource();
      src.buffer = buf;
      src.connect(this.playGain);
      const startAt = Math.max(this.playCtx.currentTime, this.nextPlayTime);
      src.start(startAt);
      this.nextPlayTime = startAt + buf.duration;
      this.setStatus('speaking');
      if (this.speakResetTimer) clearTimeout(this.speakResetTimer);
      this.speakResetTimer = setTimeout(() => {
        if (this.lastStatus === 'speaking') this.setStatus('live');
      }, Math.max(900, buf.duration * 1000 + 400));
    } catch { /* skip corrupt chunk */ }
  }

  /** Barge-in: user interrupted → drop queued model audio. */
  private flushPlayback(): void {
    if (this.playCtx) this.nextPlayTime = this.playCtx.currentTime;
  }

  private startLevelLoop(): void {
    const data = new Uint8Array(256);
    const tick = () => {
      if (this.stopped) return;
      // Reserved for future volume-driven orb animation; keeps analyser warm.
      this.analyser?.getByteTimeDomainData(data);
      this.levelRaf = requestAnimationFrame(tick);
    };
    this.levelRaf = requestAnimationFrame(tick);
  }

  private handleMessage(msg: LiveServerMessage): void {
    if (this.stopped) return;
    const sc = msg.serverContent;
    if (!sc) return;
    if (sc.interrupted) {
      this.flushPlayback();
      if (this.lastStatus === 'speaking') this.setStatus('listening');
      return;
    }
    const status = String(sc.interactionStatus ?? '');
    if (status === 'IN_PROGRESS' && this.lastStatus !== 'speaking') this.setStatus('thinking');
    else if (status === 'IDLE' && this.lastStatus === 'thinking') this.setStatus('live');
    const inText = sc.inputTranscription?.text;
    if (inText) this.cb.onTranscript('you', inText);
    const outText = sc.outputTranscription?.text;
    if (outText) this.cb.onTranscript('referee', outText);
    const parts = sc.modelTurn?.parts ?? [];
    for (const part of parts) {
      const inline = (part as { inlineData?: { data?: string; mimeType?: string } }).inlineData;
      if (inline?.data) this.playPcm24k(inline.data);
      const text = (part as { text?: string }).text;
      if (text) this.cb.onTranscript('referee', text);
    }
  }

  setMicEnabled(on: boolean): void {
    this.micOn = on;
    if (!on && this.lastStatus === 'listening') this.setStatus('live');
  }

  get micEnabled(): boolean {
    return this.micOn;
  }

  sendText(text: string): void {
    const clean = text.trim();
    if (!clean || !this.session || this.stopped) return;
    try {
      this.session.sendClientContent({ turns: [clean] });
      this.cb.onTranscript('you', clean);
    } catch { /* ignore */ }
  }

  private fail(message: string): void {
    if (this.stopped) return;
    this.cb.onError(message);
    this.finish('error');
  }

  private cleanup(): void {
    this.stopped = true;
    if (this.maxTimer) clearTimeout(this.maxTimer);
    if (this.speakResetTimer) clearTimeout(this.speakResetTimer);
    cancelAnimationFrame(this.levelRaf);
    try { this.micProc?.disconnect(); } catch { /* ignore */ }
    try { this.session?.close(); } catch { /* ignore */ }
    try { void this.micCtx?.close(); } catch { /* ignore */ }
    try { void this.playCtx?.close(); } catch { /* ignore */ }
    this.micStream?.getTracks().forEach(t => { try { t.stop(); } catch { /* ignore */ } });
    this.session = null;
  }

  /** User-initiated close. */
  stop(): void {
    if (this.stopped) return;
    this.cleanup();
    this.cb.onStatus('ended');
    this.cb.onEnd('user');
  }

  /** Internal close (timeout / error / server close). */
  private finish(reason: LiveEndReason): void {
    if (this.stopped) {
      if (reason === 'timeout') this.cb.onEnd('timeout');
      return;
    }
    const wasTimeout = reason === 'timeout';
    this.cleanup();
    this.cb.onStatus('ended');
    this.cb.onEnd(reason);
    void wasTimeout;
  }
}
