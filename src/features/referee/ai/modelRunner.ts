import { stepsToContents, type InteractionStep } from './conversation';

type ModelEntry = { name: string; kind: 'interactions' | 'generateContent'; config: Record<string, unknown> };
type StreamEvent = { event_type?: string; delta?: { type?: string; text?: string }; error?: { message?: string } };

type Client = {
  interactions: { create: (params: unknown, options?: { signal: AbortSignal }) => Promise<unknown> };
  models: {
    generateContentStream: (params: unknown) => Promise<AsyncIterable<{ text?: string }>>;
    generateContent: (params: unknown) => Promise<{ text?: string }>;
  };
};

async function collectInteractionStream(stream: AsyncIterable<unknown>, signal?: AbortSignal, onText?: (text: string) => void): Promise<string> {
  let text = '';
  for await (const value of stream) {
    if (signal?.aborted) break;
    if (!value || typeof value !== 'object') continue;
    const event = value as StreamEvent;
    if (event.event_type === 'error' && event.error) throw new Error(event.error.message || 'Interaction stream error');
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

export async function runModel(options: {
  client: Client;
  model: ModelEntry;
  input: InteractionStep[];
  systemInstruction: string;
  stream: boolean;
  signal?: AbortSignal;
  onText?: (text: string) => void;
}): Promise<string> {
  const { client, model, input, systemInstruction, stream, signal, onText } = options;
  if (model.kind === 'interactions') {
    const params = { model: model.name.startsWith('models/') ? model.name : `models/${model.name}`, input, generation_config: model.config, system_instruction: systemInstruction, stream };
    const requestOptions = signal ? { signal } : undefined;
    if (stream) return collectInteractionStream(await client.interactions.create(params, requestOptions) as AsyncIterable<unknown>, signal, onText);
    return interactionText(await client.interactions.create(params, requestOptions));
  }
  const config: Record<string, unknown> = { thinkingConfig: { thinkingLevel: 'HIGH' } };
  if (signal) config.abortSignal = signal;
  if (input.some(step => step.content.some(part => part.type === 'image'))) config.mediaResolution = 'MEDIA_RESOLUTION_HIGH';
  const params = { model: model.name, config, contents: stepsToContents(input), systemInstruction };
  if (stream) {
    let text = '';
    for await (const chunk of await client.models.generateContentStream(params)) {
      if (signal?.aborted) break;
      if (chunk?.text) { text += chunk.text; onText?.(chunk.text); }
    }
    return text;
  }
  return (await client.models.generateContent(params))?.text || '';
}
