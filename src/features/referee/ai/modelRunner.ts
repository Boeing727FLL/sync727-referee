import { stepsToContents, type InteractionStep } from './conversation';

type ModelEntry = { name: string; kind: 'interactions' | 'generateContent'; config: Record<string, unknown> };
type StreamEvent = { event_type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };

type Client = {
  interactions: { create: (params: unknown, options?: { signal: AbortSignal }) => Promise<unknown> };
  models: {
    generateContentStream: (params: unknown) => Promise<AsyncIterable<GenChunk>>;
    generateContent: (params: unknown) => Promise<{ text?: string }>;
  };
};

async function collectInteractionStream(stream: AsyncIterable<unknown>, signal?: AbortSignal, onText?: (text: string) => void, onActivity?: () => void): Promise<string> {
  let text = '';
  for await (const value of stream) {
    if (signal?.aborted) break;
    onActivity?.();
    if (!value || typeof value !== 'object') continue;
    const event = value as StreamEvent;
    if (event.event_type === 'error' && event.error) {
      const err = event.error as { message?: string; code?: unknown; status?: unknown };
      const code = [err.code, err.status].filter(v => v !== undefined && v !== null && v !== '').join(' ');
      throw new Error(`${code ? code + ' ' : ''}${err.message || 'Interaction stream error'}`);
    }
    if ((event.event_type === 'step.delta' || event.event_type === 'content.delta') && event.delta?.type === 'text' && event.delta.text) {
      text += event.delta.text;
      onText?.(event.delta.text);
    }
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

type GenChunk = { text?: string; candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
function partsText(chunk: GenChunk | undefined): string {
  const parts = chunk?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return chunk?.text || '';
  return parts.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
}

export async function runModel(options: {
  client: Client;
  model: ModelEntry;
  input: InteractionStep[];
  systemInstruction: string;
  stream: boolean;
  signal?: AbortSignal;
  onText?: (text: string) => void;
  /** Called on every stream event (thinking included), for stall detection. */
  onActivity?: () => void;
}): Promise<string> {
  const { client, model, input, systemInstruction, stream, signal, onText, onActivity } = options;
  if (model.kind === 'interactions') {
    const params = { model: model.name.startsWith('models/') ? model.name : `models/${model.name}`, input, generation_config: model.config, system_instruction: systemInstruction, stream };
    const requestOptions = signal ? { signal } : undefined;
    if (stream) return collectInteractionStream(await client.interactions.create(params, requestOptions) as AsyncIterable<unknown>, signal, onText, onActivity);
    return interactionText(await client.interactions.create(params, requestOptions));
  }
  const liveEvents = (() => { try { return localStorage.getItem('referee_page_urls') !== '0'; } catch { return false; } })();
  const config: Record<string, unknown> = { thinkingConfig: { thinkingLevel: 'HIGH', ...(liveEvents ? { includeThoughts: true } : {}) } };
  if (signal) config.abortSignal = signal;
  if (input.some(step => step.content.some(part => part.type === 'image'))) config.mediaResolution = 'MEDIA_RESOLUTION_HIGH';
  const params = { model: model.name, config, contents: stepsToContents(input), systemInstruction };
  if (stream) {
    let text = '';
    for await (const chunk of await client.models.generateContentStream(params)) {
      if (signal?.aborted) break;
      onActivity?.();
      // Thought parts keep the connection alive; only answer text is kept.
      const answerText = partsText(chunk);
      if (answerText) { text += answerText; onText?.(answerText); }
    }
    return text;
  }
  return (await client.models.generateContent(params))?.text || '';
}
