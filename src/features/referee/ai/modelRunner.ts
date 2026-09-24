import { stepsToContents, type InteractionStep } from './conversation';

type ModelEntry = { name: string; kind: 'interactions' | 'generateContent'; config: Record<string, unknown> };
type StreamEvent = {
  event_type?: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string };
  status?: string;
  interaction?: { status?: string };
};

type Client = {
  interactions: { create: (params: unknown, options?: { signal: AbortSignal }) => Promise<unknown> };
  models: {
    generateContentStream: (params: unknown) => Promise<AsyncIterable<{ text?: string; candidates?: { finishReason?: unknown }[] }>>;
    generateContent: (params: unknown) => Promise<{ text?: string }>;
  };
};

/**
 * Stream watchdogs. A live stream can go silent without closing (overloaded
 * backend, dropped mobile connection); before these, the chat then froze
 * mid-answer forever. Before the first answer text the model may think in
 * silence for a long time (full rule book at ultra_high), so that window is
 * wide; once text is flowing, a long gap means the stream is dead.
 */
export const FIRST_TEXT_TIMEOUT_MS = 150_000;
export const STREAM_IDLE_TIMEOUT_MS = 45_000;

type Watchdog = { firstTextMs: number; idleMs: number };
const DEFAULT_WATCHDOG: Watchdog = { firstTextMs: FIRST_TEXT_TIMEOUT_MS, idleMs: STREAM_IDLE_TIMEOUT_MS };

const TERMINAL_FAILED_STATUSES = new Set(['failed', 'cancelled', 'incomplete', 'budget_exceeded']);

class StreamStalledError extends Error {
  constructor(ms: number, textStarted: boolean) {
    super(`503 stream stalled: no data for ${Math.round(ms / 1000)}s ${textStarted ? 'mid-answer' : 'before the answer'}`);
    this.name = 'StreamStalledError';
  }
}

/** One attempt's abort: the caller's Stop, or the watchdog. */
function linkedController(signal?: AbortSignal): { controller: AbortController; unlink: () => void } {
  const controller = new AbortController();
  if (!signal) return { controller, unlink: () => {} };
  if (signal.aborted) controller.abort();
  const onAbort = () => controller.abort();
  signal.addEventListener('abort', onAbort, { once: true });
  return { controller, unlink: () => signal.removeEventListener('abort', onAbort) };
}

/**
 * Resolve `promise`, or throw StreamStalledError after `ms` (and abort the
 * attempt). The caller's Stop ends the wait at once.
 */
function withDeadline<T>(promise: Promise<T>, ms: number, textStarted: boolean, controller: AbortController, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new StreamStalledError(ms, textStarted));
      controller.abort();
    }, ms);
    onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
  promise.catch(() => {}); // a late rejection after the deadline is expected
  return Promise.race([promise, deadline]).finally(() => {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  });
}

/**
 * Drive a provider stream with the watchdog. `onValue` returns true once
 * answer text has started (switches to the short idle window).
 */
async function pumpStream<T>(
  open: () => Promise<AsyncIterable<T>>,
  controller: AbortController,
  signal: AbortSignal | undefined,
  watchdog: Watchdog,
  onValue: (value: T) => void,
  textStarted: () => boolean,
): Promise<void> {
  let stream: AsyncIterable<T>;
  try {
    stream = await withDeadline(open(), watchdog.firstTextMs, false, controller, signal);
  } catch (error) {
    if (signal?.aborted) return;
    throw error;
  }
  const iterator = stream[Symbol.asyncIterator]();
  try {
    for (;;) {
      if (signal?.aborted) return;
      const started = textStarted();
      const step = await withDeadline(iterator.next(), started ? watchdog.idleMs : watchdog.firstTextMs, started, controller, signal);
      if (step.done) return;
      if (signal?.aborted) return;
      onValue(step.value);
    }
  } catch (error) {
    // The caller's Stop surfaces as a quiet end, never a provider error.
    if (signal?.aborted) return;
    throw error;
  } finally {
    Promise.resolve(iterator.return?.()).catch(() => {});
  }
}

async function collectInteractionStream(
  open: (signal: AbortSignal) => Promise<AsyncIterable<unknown>>,
  signal: AbortSignal | undefined,
  onText: ((text: string) => void) | undefined,
  watchdog: Watchdog,
): Promise<string> {
  const { controller, unlink } = linkedController(signal);
  let text = '';
  let finalStatus: string | null = null;
  // Text deltas since the last step.stop: a stream cut inside a text step
  // never closed it, so the answer is known to be partial.
  let openTextStep = false;
  let sawStepStop = false;
  try {
    await pumpStream(() => open(controller.signal), controller, signal, watchdog, (value) => {
      if (!value || typeof value !== 'object') return;
      const event = value as StreamEvent;
      if (event.event_type === 'error' && event.error) {
        const err = event.error as { message?: string; code?: unknown; status?: unknown };
        const code = [err.code, err.status].filter(v => v !== undefined && v !== null && v !== '').join(' ');
        throw new Error(`${code ? code + ' ' : ''}${err.message || 'Interaction stream error'}`);
      }
      if ((event.event_type === 'step.delta' || event.event_type === 'content.delta') && event.delta?.type === 'text' && event.delta.text) {
        text += event.delta.text;
        openTextStep = true;
        onText?.(event.delta.text);
        return;
      }
      if (event.event_type === 'step.stop' || event.event_type === 'content.stop') {
        openTextStep = false;
        sawStepStop = true;
        return;
      }
      if (event.event_type === 'interaction.status_update' && event.status && TERMINAL_FAILED_STATUSES.has(event.status)) {
        throw new Error(`503 interaction ${event.status} mid-stream`);
      }
      if (event.event_type === 'interaction.completed' || event.event_type === 'interaction.complete') {
        finalStatus = event.interaction?.status || 'completed';
      }
    }, () => text.length > 0);
  } finally {
    unlink();
  }
  if (signal?.aborted) return text;
  if (finalStatus !== null && finalStatus !== 'completed') {
    throw new Error(`503 interaction ended with status ${finalStatus}`);
  }
  // Without interaction.completed the stream was cut. Tolerate only a
  // stream whose text step was properly closed.
  if (finalStatus === null && (openTextStep || !sawStepStop)) {
    throw new Error('503 interaction stream ended before completion');
  }
  return text;
}

function interactionText(interaction: unknown): string {
  if (!interaction || typeof interaction !== 'object') return '';
  const response = interaction as { output_text?: unknown; outputs?: unknown };
  if (typeof response.output_text === 'string' && response.output_text) return response.output_text;
  if (!Array.isArray(response.outputs)) return '';
  return response.outputs.filter((output): output is { type: 'text'; text: string } => !!output && typeof output === 'object' && (output as { type?: unknown }).type === 'text' && typeof (output as { text?: unknown }).text === 'string').map(output => output.text).join('');
}

export async function runModel(options: {
  client: Client;
  model: ModelEntry;
  input: InteractionStep[];
  systemInstruction: string;
  stream: boolean;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  /** Test seam for the stream watchdog windows. */
  watchdog?: Partial<Watchdog>;
}): Promise<string> {
  const { client, model, input, systemInstruction, stream, signal, onText } = options;
  const watchdog: Watchdog = { ...DEFAULT_WATCHDOG, ...options.watchdog };
  if (model.kind === 'interactions') {
    const params = { model: model.name.startsWith('models/') ? model.name : `models/${model.name}`, input, generation_config: model.config, system_instruction: systemInstruction, stream };
    const requestOptions = signal ? { signal } : undefined;
    if (stream) {
      return collectInteractionStream(
        attemptSignal => client.interactions.create(params, { signal: attemptSignal }) as Promise<AsyncIterable<unknown>>,
        signal, onText, watchdog,
      );
    }
    return interactionText(await client.interactions.create(params, requestOptions));
  }
  const config: Record<string, unknown> = { thinkingConfig: { thinkingLevel: 'HIGH' } };
  if (signal) config.abortSignal = signal;
  if (input.some(step => step.content.some(part => part.type === 'image'))) config.mediaResolution = 'MEDIA_RESOLUTION_HIGH';
  const params = { model: model.name, config, contents: stepsToContents(input), systemInstruction };
  if (stream) {
    const { controller, unlink } = linkedController(signal);
    config.abortSignal = controller.signal;
    let text = '';
    let finishReason: string | null = null;
    try {
      await pumpStream(() => client.models.generateContentStream(params), controller, signal, watchdog, (chunk) => {
        const reason = chunk?.candidates?.[0]?.finishReason;
        if (reason) finishReason = String(reason);
        if (chunk?.text) { text += chunk.text; onText?.(chunk.text); }
      }, () => text.length > 0);
    } finally {
      unlink();
    }
    if (signal?.aborted) return text;
    // A stream that closed without a finish reason was cut mid-answer.
    if (finishReason === null) throw new Error('503 generateContent stream ended before completion');
    return text;
  }
  return (await client.models.generateContent(params))?.text || '';
}
