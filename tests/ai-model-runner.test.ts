/** Deterministic tests for the SDK-facing runModel seam: controlled async
 *  iterables stand in for the provider, so stream/abort/error behavior is
 *  locked without any network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModel } from '../src/features/referee/ai/modelRunner.ts';

const STEP = { type: 'user_input' as const, content: [{ type: 'text' as const, text: 'שאלה' }] };
const IMG_STEP = { type: 'user_input' as const, content: [{ type: 'image' as const, data: 'AA', mime_type: 'image/jpeg' as const }] };
const INTERACTIONS_MODEL = { name: 'gemini-x', kind: 'interactions' as const, config: { temperature: 1 } };
const GC_MODEL = { name: 'gemini-y', kind: 'generateContent' as const, config: {} };

async function* iterate<T>(items: T[]): AsyncIterable<T> { for (const item of items) yield item; }

function interactionsClient(createResult: unknown, captured?: { params?: unknown }) {
  return {
    interactions: {
      create: async (params: unknown) => { if (captured) captured.params = params; if (createResult instanceof Error) throw createResult; return createResult; },
    },
    models: { generateContentStream: async () => iterate([]), generateContent: async () => ({}) },
  };
}

test('interactions non-stream: output_text wins', async () => {
  const client = interactionsClient({ output_text: 'תשובה', outputs: [{ type: 'text', text: 'ignored' }] });
  const text = await runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: false });
  assert.equal(text, 'תשובה');
});

test('interactions non-stream: outputs array joins text outputs only', async () => {
  const client = interactionsClient({ outputs: [{ type: 'text', text: 'א' }, { type: 'thought', text: 'no' }, { type: 'text', text: 'ב' }] });
  const text = await runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: false });
  assert.equal(text, 'אב');
});

test('interactions non-stream: empty response maps to empty string', async () => {
  const client = interactionsClient({});
  const text = await runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: false });
  assert.equal(text, '');
});

test('interactions params: model prefixed, config and system instruction passed, stream flag through', async () => {
  const captured: { params?: any } = {};
  const client = interactionsClient({ output_text: 'x' }, captured);
  await runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: false });
  assert.equal(captured.params.model, 'models/gemini-x');
  assert.deepEqual(captured.params.generation_config, { temperature: 1 });
  assert.equal(captured.params.system_instruction, 'sys');
  assert.equal(captured.params.stream, false);
});

test('interactions stream: content.delta and step.delta text accumulate and forward', async () => {
  const seen: string[] = [];
  const client = interactionsClient(iterate([
    { event_type: 'content.delta', delta: { type: 'text', text: 'הת' } },
    { event_type: 'step.delta', delta: { type: 'text', text: 'שובה ' } },
    { event_type: 'content.delta', delta: { type: 'thought', text: 'skip' } },
    { event_type: 'content.delta', delta: { type: 'text', text: '42' } },
    null,
    { event_type: 'step.stop' },
    { event_type: 'interaction.completed', interaction: { status: 'completed' } },
  ]));
  const text = await runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true, onText: t => seen.push(t) });
  assert.equal(text, 'התשובה 42');
  assert.deepEqual(seen, ['הת', 'שובה ', '42']);
});

test('interactions stream: an error event throws its message', async () => {
  const client = interactionsClient(iterate([
    { event_type: 'content.delta', delta: { type: 'text', text: 'partial ' } },
    { event_type: 'error', error: { message: 'backend exploded' } },
  ]));
  await assert.rejects(
    () => runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true }),
    /backend exploded/,
  );
});

test('interactions stream: abort stops iteration and keeps partial text', async () => {
  const controller = new AbortController();
  const seen: string[] = [];
  const client = interactionsClient(iterate([
    { event_type: 'content.delta', delta: { type: 'text', text: 'א' } },
    { event_type: 'content.delta', delta: { type: 'text', text: 'ב' } },
    { event_type: 'content.delta', delta: { type: 'text', text: 'ג' } },
  ]));
  const text = await runModel({
    client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true,
    signal: controller.signal,
    onText: () => { seen.push('x'); controller.abort(); },
  });
  assert.equal(text, 'א');
  assert.equal(seen.length, 1);
});

test('generateContent non-stream: returns text, empty when missing', async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    interactions: { create: async () => ({}) },
    models: { generateContentStream: async () => iterate([]), generateContent: async () => ({ text: 'תשובה' }) },
  };
  assert.equal(await runModel({ client, model: GC_MODEL, input: [STEP], systemInstruction: 'sys', stream: false }), 'תשובה');
  client.models.generateContent = async () => ({});
  assert.equal(await runModel({ client, model: GC_MODEL, input: [STEP], systemInstruction: 'sys', stream: false }), '');
});

test('generateContent stream: chunks accumulate and forward', async () => {
  const seen: string[] = [];
  const client = {
    interactions: { create: async () => ({}) },
    models: { generateContentStream: async () => iterate([{ text: 'א' }, { text: 'ב' }, { candidates: [{ finishReason: 'STOP' }] }]), generateContent: async () => ({}) },
  };
  const text = await runModel({ client, model: GC_MODEL, input: [STEP], systemInstruction: 'sys', stream: true, onText: t => seen.push(t) });
  assert.equal(text, 'אב');
  assert.deepEqual(seen, ['א', 'ב']);
});

test('generateContent: image parts raise media resolution, signal lands in config', async () => {
  let captured: any;
  const client = {
    interactions: { create: async () => ({}) },
    models: {
      generateContentStream: async () => iterate([]),
      generateContent: async (params: any) => { captured = params; return { text: 'x' }; },
    },
  };
  const controller = new AbortController();
  await runModel({ client, model: GC_MODEL, input: [IMG_STEP], systemInstruction: 'sys', stream: false, signal: controller.signal });
  assert.equal(captured.config.mediaResolution, 'MEDIA_RESOLUTION_HIGH');
  assert.equal(captured.config.abortSignal, controller.signal);
});

// --- Stream completion and stall watchdog (answer froze mid-stream, 2026-09-24) ---

const FAST = { firstTextMs: 200, idleMs: 100 };
const text = (t: string) => ({ event_type: 'step.delta', delta: { type: 'text', text: t } });

async function* thenHang<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
  await new Promise(() => {}); // the connection stays open, nothing more arrives
}

test('interactions stream: cut mid-answer (no step.stop, no completed) rejects so the chain retries', async () => {
  const client = interactionsClient(iterate([text('לפי חוק 17 '), text('יש שתי אפשרויות')]));
  await assert.rejects(
    () => runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true }),
    /ended before completion/,
  );
});

test('interactions stream: a closed text step without interaction.completed is accepted', async () => {
  const client = interactionsClient(iterate([text('תשובה'), { event_type: 'step.stop' }]));
  assert.equal(await runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true }), 'תשובה');
});

test('interactions stream: completed with a non-completed status rejects', async () => {
  const client = interactionsClient(iterate([text('חלק'), { event_type: 'step.stop' }, { event_type: 'interaction.completed', interaction: { status: 'incomplete' } }]));
  await assert.rejects(
    () => runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true }),
    /status incomplete/,
  );
});

test('interactions stream: a failed status_update mid-stream rejects', async () => {
  const client = interactionsClient(iterate([text('חלק'), { event_type: 'interaction.status_update', status: 'failed' }]));
  await assert.rejects(
    () => runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true }),
    /failed mid-stream/,
  );
});

test('interactions stream: silence after text started trips the idle watchdog and aborts the request', async () => {
  let requestSignal: AbortSignal | undefined;
  const client = {
    interactions: { create: async (_p: unknown, o?: { signal: AbortSignal }) => { requestSignal = o?.signal; return thenHang([text('לפי חוק 17 (סעיף ב), ')]); } },
    models: { generateContentStream: async () => iterate([]), generateContent: async () => ({}) },
  };
  const seen: string[] = [];
  const started = Date.now();
  await assert.rejects(
    () => runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true, onText: t => seen.push(t), watchdog: FAST }),
    /503 stream stalled.*mid-answer/,
  );
  assert.ok(Date.now() - started < 1000);
  assert.deepEqual(seen, ['לפי חוק 17 (סעיף ב), ']);
  assert.equal(requestSignal?.aborted, true);
});

test('interactions stream: a request that never answers trips the first-text watchdog', async () => {
  const client = interactionsClient(new Promise(() => {}));
  await assert.rejects(
    () => runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true, watchdog: FAST }),
    /503 stream stalled.*before the answer/,
  );
});

test('interactions stream: Stop during a stall resolves quietly with the partial text', async () => {
  const controller = new AbortController();
  const client = interactionsClient(thenHang([text('א')]));
  const pending = runModel({ client, model: INTERACTIONS_MODEL, input: [STEP], systemInstruction: 'sys', stream: true, signal: controller.signal, watchdog: { firstTextMs: 5000, idleMs: 5000 } });
  setTimeout(() => controller.abort(), 30);
  const result = await Promise.race([pending, new Promise(r => setTimeout(() => r('timeout'), 500))]);
  assert.equal(result, 'א');
});

test('generateContent stream: no finish reason means the stream was cut', async () => {
  const client = {
    interactions: { create: async () => ({}) },
    models: { generateContentStream: async () => iterate([{ text: 'א' }, { text: 'ב' }]), generateContent: async () => ({}) },
  };
  await assert.rejects(
    () => runModel({ client, model: GC_MODEL, input: [STEP], systemInstruction: 'sys', stream: true }),
    /ended before completion/,
  );
});

test('generateContent stream: silence mid-answer trips the idle watchdog', async () => {
  const client = {
    interactions: { create: async () => ({}) },
    models: { generateContentStream: async () => thenHang([{ text: 'א' }]), generateContent: async () => ({}) },
  };
  await assert.rejects(
    () => runModel({ client, model: GC_MODEL, input: [STEP], systemInstruction: 'sys', stream: true, watchdog: FAST }),
    /503 stream stalled/,
  );
});
