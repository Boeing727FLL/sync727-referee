/** Deterministic tests for the ask path's model x key rotation loop. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { runModelChain } from '../src/features/referee/ai/modelChain.ts';
import { KeyHealth } from '../src/features/referee/ai/retryPolicy.ts';

const MODELS = ['m1', 'm2'];
const KEYS = ['k1', 'k2', 'k3'];

function abortError(): Error {
  const err = new Error('aborted');
  err.name = 'AbortError';
  return err;
}

test('first key answers: one attempt, rotation advanced once', async () => {
  const attempts: string[] = [];
  const rotations: number[] = [];
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health: new KeyHealth(), rotationIndex: 0,
    onRotation: n => rotations.push(n),
    attempt: async (key, model) => { attempts.push(`${key}@${model}`); return true; },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1']);
  assert.deepEqual(rotations, [1]);
});

test('quota failure cools the key and the next key answers', async () => {
  const health = new KeyHealth();
  const attempts: string[] = [];
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health, rotationIndex: 0,
    attempt: async key => {
      attempts.push(key);
      if (key === 'k1') throw new Error('429 Too Many Requests');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1', 'k2']);
  // k1 is cooling on m1 only (quota is per model); it still serves m2
  assert.deepEqual(health.available(KEYS, Date.now(), 'm1'), ['k2', 'k3']);
  assert.deepEqual(health.available(KEYS, Date.now(), 'm2'), KEYS);
});

test('invalid-key failure cools the key for a day', async () => {
  const health = new KeyHealth();
  const now = Date.now();
  await runModelChain({
    models: MODELS, keys: KEYS, health, rotationIndex: 0,
    attempt: async key => {
      if (key === 'k1') throw new Error('403 API key not valid');
      return true;
    },
  });
  assert.deepEqual(health.available(KEYS, now + 60_000), ['k2', 'k3']);
  assert.deepEqual(health.available(KEYS, now + 23 * 3600_000), ['k2', 'k3']);
  assert.deepEqual(health.available(KEYS, now + 25 * 3600_000), KEYS);
});

test('request-class failure skips to the next model without cooling the key', async () => {
  const health = new KeyHealth();
  const attempts: string[] = [];
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health, rotationIndex: 0,
    attempt: async (key, model) => {
      attempts.push(`${key}@${model}`);
      if (model === 'm1') throw new Error('400 schema unsupported');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  // m1 tried once, then the next model starts a fresh key rotation
  assert.deepEqual(attempts, ['k1@m1', 'k1@m2']);
  assert.deepEqual(health.available(KEYS), KEYS);
});

test('server-class failure moves straight to the next model (no same-model retry)', async () => {
  const attempts: string[] = [];
  const sleeps: number[] = [];
  const health = new KeyHealth();
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health, rotationIndex: 0,
    sleep: async ms => { sleeps.push(ms); },
    attempt: async (key, model) => {
      attempts.push(`${key}@${model}`);
      if (model === 'm1') throw new Error('503 Service Unavailable');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1', 'k1@m2']);
  assert.equal(sleeps.length, 0);
  // the overloaded model rests briefly for every key; others unaffected
  assert.deepEqual(health.available(KEYS, Date.now(), 'm1'), []);
  assert.deepEqual(health.available(KEYS, Date.now(), 'm2'), KEYS);
});

test('a 503 on the first model is answered by the next model on the first try', async () => {
  const attempts: string[] = [];
  let failures = 0;
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health: new KeyHealth(), rotationIndex: 0,
    sleep: async () => {},
    attempt: async (key, model) => {
      attempts.push(`${key}@${model}`);
      if (failures++ === 0) throw new Error('503 UNAVAILABLE: The model is overloaded');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1', 'k1@m2']);
});

test('no-free-tier model (429 limit: 0) is skipped at once, not tried on every key', async () => {
  const attempts: string[] = [];
  const health = new KeyHealth();
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health, rotationIndex: 0,
    attempt: async (key, model) => {
      attempts.push(`${key}@${model}`);
      if (model === 'm1') throw new Error('429 RESOURCE_EXHAUSTED: Quota exceeded for metric generate_content_free_tier_requests, limit: 0');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1', 'k1@m2']);
  assert.deepEqual(health.available(KEYS, Date.now() + 60 * 60_000, 'm1'), []);
});

test('quota on every key for one model still lets the next model answer', async () => {
  const attempts: string[] = [];
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health: new KeyHealth(), rotationIndex: 0,
    attempt: async (key, model) => {
      attempts.push(`${key}@${model}`);
      if (model === 'm1') throw new Error('429 Too Many Requests');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1', 'k2@m1', 'k3@m1', 'k1@m2']);
});

test('unknown failure moves to the next model instead of ending the ask', async () => {
  const attempts: string[] = [];
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health: new KeyHealth(), rotationIndex: 0,
    attempt: async (key, model) => {
      attempts.push(`${key}@${model}`);
      if (model === 'm1') throw new Error('something went sideways');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1', 'k1@m2']);
});

test('in-stream "high demand" error (no HTTP code) falls back to the next model at once', async () => {
  const attempts: string[] = [];
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health: new KeyHealth(), rotationIndex: 0,
    sleep: async () => {},
    attempt: async (key, model) => {
      attempts.push(`${key}@${model}`);
      if (model === 'm1') throw new Error('gemini-3.8-flash is currently experiencing high demand, spikes in demand are usually temporary. Please try again later.');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1', 'k1@m2']);
});

test('abort mid-attempt ends the chain as aborted and cools nothing', async () => {
  const health = new KeyHealth();
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health, rotationIndex: 0,
    attempt: async () => { throw abortError(); },
  });
  assert.equal(outcome.status, 'aborted');
  assert.deepEqual(health.available(KEYS), KEYS);
});

test('pre-aborted signal ends the chain before any attempt', async () => {
  let called = 0;
  const controller = new AbortController();
  controller.abort();
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health: new KeyHealth(), rotationIndex: 0,
    signal: controller.signal,
    attempt: async () => { called++; return true; },
  });
  assert.equal(outcome.status, 'aborted');
  assert.equal(called, 0);
});

test('every key quota-cooled ends exhausted with the quota kind', async () => {
  const health = new KeyHealth();
  for (const key of KEYS) health.coolDown(key, 60_000);
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health, rotationIndex: 0,
    attempt: async () => true,
  });
  assert.deepEqual(outcome, { status: 'exhausted', lastFailureKind: 'quota' });
});

test('all keys failing all models ends exhausted with the last failure kind', async () => {
  const outcome = await runModelChain({
    models: MODELS, keys: ['k1'], health: new KeyHealth(), rotationIndex: 0,
    attempt: async () => { throw new Error('429 quota exceeded'); },
  });
  assert.deepEqual(outcome, { status: 'exhausted', lastFailureKind: 'quota' });
});

test('rotation offset starts mid-pool and wraps', async () => {
  const attempts: string[] = [];
  const rotations: number[] = [];
  await runModelChain({
    models: ['m1'], keys: KEYS, health: new KeyHealth(), rotationIndex: 1,
    onRotation: n => rotations.push(n),
    attempt: async key => { attempts.push(key); return key === 'k1'; },
  });
  assert.deepEqual(attempts, ['k2', 'k3', 'k1']);
  assert.deepEqual(rotations, [2]);
});

test('a failing attempt that streamed nothing loses nothing: next attempt wins', async () => {
  // Covers the retry race: attempt 1 fails after partial work, attempt 2's
  // success is the only outcome the caller sees.
  const outcome = await runModelChain({
    models: ['m1'], keys: ['k1', 'k2'], health: new KeyHealth(), rotationIndex: 0,
    attempt: async key => {
      if (key === 'k1') throw new Error('429 Too Many Requests');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
});

// --- rotation rules (2026-09-24) ---
import { MAX_KEYS_PER_MODEL, MODEL_TIME_BUDGET_MS } from '../src/features/referee/ai/modelChain.ts';
import { classifyFailure, msUntilDailyReset } from '../src/features/referee/ai/retryPolicy.ts';

const POOL = Array.from({ length: 120 }, (_, i) => `k${i}`);

test('429s walk at most MAX_KEYS_PER_MODEL keys per model, then fall back', async () => {
  const attempts: string[] = [];
  const outcome = await runModelChain({
    models: ['m1', 'm2', 'm3'], keys: POOL, health: new KeyHealth(), rotationIndex: 7,
    attempt: async (key, model) => { attempts.push(`${key}@${model}`); if (model !== 'm3') throw new Error('429 RESOURCE_EXHAUSTED'); return true; },
  });
  assert.equal(outcome.status, 'answered');
  assert.equal(attempts.filter(a => a.endsWith('@m1')).length, MAX_KEYS_PER_MODEL);
  assert.equal(attempts.filter(a => a.endsWith('@m2')).length, MAX_KEYS_PER_MODEL);
  assert.equal(attempts[0], 'k7@m1');
});

test('a network failure (no HTTP answer) moves to the next model and rests the failed one', async () => {
  const attempts: string[] = [];
  const health = new KeyHealth();
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health, rotationIndex: 0,
    attempt: async (key, model) => { attempts.push(`${key}@${model}`); if (model === 'm1') throw new TypeError('Failed to fetch'); return true; },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1', 'k1@m2']);
  assert.deepEqual(health.available(KEYS, Date.now(), 'm1'), []);
});

test('any quota answer makes an exhausted ask report quota (busy), even if a later model failed differently', async () => {
  const outcome = await runModelChain({
    models: ['m1', 'm2'], keys: KEYS, health: new KeyHealth(), rotationIndex: 0, sleep: async () => {},
    attempt: async (_key, model) => { throw new Error(model === 'm1' ? '429 Too Many Requests' : '503 Service Unavailable'); },
  });
  assert.deepEqual(outcome, { status: 'exhausted', lastFailureKind: 'quota' });
});

test('the key walk on one model stops at the time budget', async () => {
  let clock = 0;
  const attempts: string[] = [];
  await runModelChain({
    models: ['m1', 'm2'], keys: POOL, health: new KeyHealth(), rotationIndex: 0, now: () => clock,
    attempt: async (key, model) => { attempts.push(`${key}@${model}`); if (model === 'm1') { clock += MODEL_TIME_BUDGET_MS; throw new Error('429'); } return true; },
  });
  assert.deepEqual(attempts, ['k0@m1', 'k0@m2']);
});

test('daily-limit 429 parks the key until the daily reset; per-minute uses retryDelay', () => {
  const daily = classifyFailure(new Error('429 Quota exceeded for metric generate_content_free_tier_requests, quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier'));
  assert.equal(daily.kind, 'quota');
  assert.ok(daily.cooldownMs > 60 * 60_000 || daily.cooldownMs === msUntilDailyReset());
  const minute = classifyFailure(new Error('429 RESOURCE_EXHAUSTED ... "retryDelay": "23s"'));
  assert.equal(minute.cooldownMs, 23_000);
});

test('cooldowns survive a reload through storage, stored without key values', () => {
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  const keys = ['AIzaSECRET1', 'AIzaSECRET2'];
  const store = () => ({ storage, name: 'h', idOf: (id: string) => id.replace(/AIzaSECRET(\d)/, '#$1'), fromId: (s: string) => s.replace(/#(\d)/, 'AIzaSECRET$1') });
  new KeyHealth(store()).coolDown('AIzaSECRET1', 60_000, Date.now(), 'm1');
  assert.ok(!mem.get('h')!.includes('AIza'));
  assert.deepEqual(new KeyHealth(store()).available(keys, Date.now(), 'm1'), ['AIzaSECRET2']);
});

test('in-stream quota error ("quota_exceeded Resource has been exhausted") is quota, not transient', () => {
  assert.equal(classifyFailure(new Error('quota_exceeded Resource has been exhausted (e.g. check quota).')).kind, 'quota');
});

test('worst case before the answering model stays short: 503 on the first three models = 3 attempts, not ~12', async () => {
  const attempts: string[] = [];
  const reports: string[] = [];
  const outcome = await runModelChain({
    models: ['a', 'b', 'c', 'd'], keys: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'], health: new KeyHealth(), rotationIndex: 0, sleep: async () => {},
    onAttempt: r => reports.push(`${r.model}:${r.ok ? 'ok' : r.kind}`),
    attempt: async (key, model) => { attempts.push(`${key}@${model}`); if (model !== 'd') throw new Error('503 UNAVAILABLE: high demand'); return true; },
  });
  assert.equal(outcome.status, 'answered');
  assert.equal(attempts.length, 4);
  assert.deepEqual(reports, ['a:server', 'b:server', 'c:server', 'd:ok']);
});

test('a stalled stream is classified as a server failure (next model), not an abort', async () => {
  const { classifyFailure } = await import('../src/features/referee/ai/retryPolicy.ts');
  assert.equal(classifyFailure(new Error('504 stream stalled')).kind, 'server');
});

test('rule book pages with a public URL are sent by link in URL mode, by bytes otherwise', async () => {
  const { toInteractionInput, stepsToContents } = await import('../src/features/referee/ai/conversation.ts');
  const contents = [{ role: 'user' as const, parts: [{ text: 'p1' }, { inlineData: { data: 'AAAA', mimeType: 'image/jpeg' }, fileData: { fileUri: 'https://pub.example/page_1.jpg', mimeType: 'image/jpeg' } }, { inlineData: { data: 'BBBB', mimeType: 'image/png' } }] }];
  const byUrl = toInteractionInput(contents, { preferUri: true });
  assert.deepEqual(byUrl[0].content[1], { type: 'image', uri: 'https://pub.example/page_1.jpg', mime_type: 'image/jpeg', resolution: 'ultra_high' });
  // a user photo without a URL still goes inline
  assert.equal((byUrl[0].content[2] as { data?: string }).data, 'BBBB');
  const inline = toInteractionInput(contents);
  assert.equal((inline[0].content[1] as { data?: string }).data, 'AAAA');
  // generateContent path keeps the link as fileData
  assert.deepEqual(stepsToContents(byUrl)[0].parts[1], { fileData: { fileUri: 'https://pub.example/page_1.jpg', mimeType: 'image/jpeg' } });
});

test('models on a short rest are tried last, not skipped (no instant "busy" right after a bad question)', async () => {
  const health = new KeyHealth();
  health.coolDownModel('m1', 60_000);
  health.coolDownModel('m2', 60_000);
  const attempts: string[] = [];
  const outcome = await runModelChain({
    models: ['m1', 'm2', 'm3'], keys: KEYS, health, rotationIndex: 0, sleep: async () => {},
    attempt: async (key, model) => { attempts.push(`${key}@${model}`); if (model === 'm3') throw new Error('503 overloaded'); return true; },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m3', 'k1@m1']);
});
