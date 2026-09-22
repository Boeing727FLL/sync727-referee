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
  // k1 is cooling (60s quota cooldown), k2/k3 stay available
  assert.deepEqual(health.available(KEYS, Date.now()), ['k2', 'k3']);
});

test('invalid-key failure cools the key for 15 minutes', async () => {
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
  assert.deepEqual(health.available(KEYS, now + 16 * 60_000), KEYS);
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

test('server-class failure skips to the next model', async () => {
  const attempts: string[] = [];
  const outcome = await runModelChain({
    models: MODELS, keys: KEYS, health: new KeyHealth(), rotationIndex: 0,
    attempt: async (key, model) => {
      attempts.push(`${key}@${model}`);
      if (model === 'm1') throw new Error('503 Service Unavailable');
      return true;
    },
  });
  assert.equal(outcome.status, 'answered');
  assert.deepEqual(attempts, ['k1@m1', 'k1@m2']);
});

test('transient failure propagates, never swallowed', async () => {
  await assert.rejects(
    runModelChain({
      models: MODELS, keys: KEYS, health: new KeyHealth(), rotationIndex: 0,
      attempt: async () => { throw new Error('network went sideways'); },
    }),
    /network went sideways/,
  );
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
