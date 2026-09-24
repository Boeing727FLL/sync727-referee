import { db } from '../lib/firebase/firestore';
import { R2_PUBLIC_URL } from '../lib/r2Config';
import { listRulebookImagePages } from '../lib/r2';
import { convertPdfToImages, countPdfPages, fileToBase64 } from '../features/referee/rulebook/pdfRendering';
import { classifyFailure, errorText, KeyHealth } from '../features/referee/ai/retryPolicy';
import { runModelChain, type AttemptReport } from '../features/referee/ai/modelChain';
import { buildHistory, toInteractionInput, type HistoryMessage as ChatHistoryMessage, type LegacyPart } from '../features/referee/ai/conversation';
import { activeSeason, buildQuestionText } from '../features/referee/ai/requestPlan';
import { describeRequestFile, imageLabel, textRulebookLabel } from '../features/referee/ai/filePlan';
import { runModel } from '../features/referee/ai/modelRunner';
import { assertListedPagesComplete, RulebookIncompleteError } from '../features/referee/rulebook/completeness';
import { translateFor } from '../locales/index.ts';
import { ASK_ABORTED, failureResult } from '../features/referee/ai/askContract';

// --- Configuration ---
const R2_PROXY_PATH = '/api/r2/file/';
const MIN_HTML_PROBE_BYTES = 500;
const HTML_PROBE_BYTES = 100;
const MODEL_MAX_OUTPUT_TOKENS = 65536;

type RulebookFile = { name: string; url: string };
type UserFile = { url: string; key: string; base64?: string; actualFile?: File };
type ModelChainEntry = { name: string; kind: 'interactions' | 'generateContent'; config: Record<string, unknown> };
type PageImage = { pageIndex: number; data: string; url: string };
type RequestFile = UserFile & { isRulebook: boolean };
type FetchedBlob = { data: Blob; mimeType: string };


// thinking_summaries streams short thought events while the model thinks.
// Without them the connection sits silent for 10-40s, and phone networks
// and proxies drop idle connections (measured: an idle stream was cut at
// ~11s), which showed up as "network error" and a wasted attempt. The
// summaries are not shown in the answer (only text deltas are collected).
const LIVE_EVENTS = (() => { try { return localStorage.getItem('referee_page_urls') === '1'; } catch { return false; } })();
const SUMMARIES = LIVE_EVENTS ? { thinking_summaries: 'auto' } : {};
const INTERACTION_CONFIG = { max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, thinking_level: 'high', ...SUMMARIES };
// The owner's primary models run with medium thinking (his AI Studio
// config). The Interactions API only accepts the snake_case field name.
const PRIMARY_INTERACTION_CONFIG = { max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, thinking_level: 'medium', ...SUMMARIES };
const MODEL_CHAIN: ModelChainEntry[] = [
  { name: 'gemini-3.7-flash', kind: 'interactions', config: PRIMARY_INTERACTION_CONFIG },
  { name: 'gemini-3.6-flash', kind: 'interactions', config: INTERACTION_CONFIG },
  { name: 'gemini-3.5-flash', kind: 'interactions', config: INTERACTION_CONFIG },
  // gemini-3.1-pro-preview removed: it has no free tier (every free key
  // answers 429 "limit: 0"), so it only added failed requests.
  { name: 'gemini-3.5-flash-lite', kind: 'generateContent', config: { thinkingConfig: { thinkingLevel: 'HIGH' }, mediaResolution: 'MEDIA_RESOLUTION_HIGH' } },
];

// --- File parts ---
function resolveR2Url(url: string): string {
  if (!url.includes(R2_PROXY_PATH)) return url;
  const fileKey = url.substring(url.indexOf(R2_PROXY_PATH) + R2_PROXY_PATH.length);
  return `${R2_PUBLIC_URL}/${fileKey}`;
}

async function fetchBlob(url: string, signal?: AbortSignal): Promise<FetchedBlob | null> {
  try {
    const response = await fetch(resolveR2Url(url), { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return {
      data: await response.blob(),
      mimeType: response.headers.get('content-type') || 'image/jpeg',
    };
  } catch (error) {
    console.error('Could not fetch blob:', url, error);
    return null;
  }
}

async function getInlineBlob(file: RequestFile, signal?: AbortSignal): Promise<Blob | File | null> {
  if (file.actualFile) return file.actualFile;
  if (file.base64) return (await fetch(file.base64, { signal })).blob();
  if (file.url.startsWith('data:')) return (await fetch(file.url, { signal })).blob();
  return null;
}

async function appendImagePart(
  parts: LegacyPart[],
  prefixText: string,
  blob: Blob | File,
  mimeType = 'image/jpeg',
): Promise<void> {
  parts.push({ text: prefixText });
  parts.push({
    inlineData: {
      data: await fileToBase64(blob),
      mimeType,
    },
  });
}

function appendBase64ImagePart(parts: LegacyPart[], prefixText: string, data: string, mimeType = 'image/jpeg', url?: string): void {
  parts.push({ text: prefixText });
  // The public URL rides along: requests send the page by link (Gemini
  // fetches it) and keep the bytes only for the inline fallback.
  parts.push({ inlineData: { data, mimeType }, ...(url ? { fileData: { fileUri: url, mimeType } } : {}) });
}

async function fetchR2ImageSet(fileName: string, signal?: AbortSignal): Promise<{ pages: PageImage[]; listedPages: number[] }> {
  let pageNumbers: number[];
  try {
    pageNumbers = await listRulebookImagePages(fileName);
  } catch (error) {
    throw new RulebookIncompleteError({ file: fileName, code: 'page-fetch', detail: `Rendered page listing failed: ${error instanceof Error ? error.message : String(error)}` });
  }
  const results = await mapPool(pageNumbers, 6, async (pageIndex) => {
    if (signal?.aborted) return null;
    const encodedFileName = encodeURIComponent(fileName);
    const imageUrl = `${R2_PUBLIC_URL}/fll-rules-images/${encodedFileName}/page_${pageIndex}.jpg`;
    const response = await fetch(imageUrl, { signal });
    if (!response.ok) throw new RulebookIncompleteError({ file: fileName, code: 'page-fetch', detail: `Rendered page ${pageIndex} returned HTTP ${response.status}.` });
    const imageData = await response.arrayBuffer();
    const isHtmlError = imageData.byteLength < MIN_HTML_PROBE_BYTES &&
      new TextDecoder().decode(new Uint8Array(imageData.slice(0, HTML_PROBE_BYTES))).includes('<html');
    if (!imageData.byteLength || isHtmlError) throw new RulebookIncompleteError({ file: fileName, code: 'page-fetch', detail: `Rendered page ${pageIndex} is empty or corrupt.` });
    return { pageIndex, url: imageUrl, data: await fileToBase64(new Blob([imageData], { type: 'image/jpeg' })) };
  });
  return { pages: results.filter((page): page is PageImage => page !== null), listedPages: pageNumbers };
}

/** Bounded-concurrency map that preserves input order. */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(Math.max(size, 1), Math.max(items.length, 1))).fill(0).map(async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// --- API key pool ---
let GEMINI_KEYS: string[] = [];

// Cooldowns persist across refreshes, stored under a short fingerprint of
// each key (never the key value). Fingerprints stay correct when keys are
// added to or removed from the pool; positions would not.
const HEALTH_STORAGE = 'gemini_key_health_v2';
let keyHealthInstance: KeyHealth | null = null;
export function keyFingerprint(key: string): string {
  // FNV-1a 32-bit: enough to tell ~100 keys apart, reveals nothing usable.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
function keyHealthFor(keys: string[]): KeyHealth {
  if (keyHealthInstance) return keyHealthInstance;
  const storage = typeof localStorage !== 'undefined' ? localStorage : undefined;
  // v1 stored pool positions, which shift when keys are removed.
  try { storage?.removeItem('gemini_key_health_v1'); } catch { /* ignore */ }
  const byFingerprint = new Map(keys.map(key => [keyFingerprint(key), key]));
  const splitId = (id: string): [string, string | null] => {
    const at = id.indexOf('\u0000');
    return at < 0 ? [id, null] : [id.slice(0, at), id.slice(at + 1)];
  };
  keyHealthInstance = new KeyHealth(storage ? {
    storage,
    name: HEALTH_STORAGE,
    idOf: id => {
      const [head, model] = splitId(id);
      const ref = head === '*' ? '*' : `#${keyFingerprint(head)}`;
      return model === null ? ref : `${ref}\u0000${model}`;
    },
    fromId: stored => {
      const [head, model] = splitId(stored);
      const key = head === '*' ? '*' : byFingerprint.get(head.slice(1));
      if (!key) return null;
      return model === null ? key : `${key}\u0000${model}`;
    },
  } : undefined);
  return keyHealthInstance;
}

/** Session flag: false once Google failed to fetch the rule book page URLs.
 *  Until verified on the live site, URL mode is opt-in per browser:
 *  localStorage.referee_page_urls = '1'. */
let pageUrlsWork = (() => { try { return localStorage.getItem('referee_page_urls') === '1'; } catch { return false; } })();
/** Errors that mean Google could not fetch a URL part (not overload/quota). */
export function isUrlFetchError(error: unknown): boolean {
  const lower = errorText(error).toLowerCase();
  return /url_retrieval|retriev|fetch the (file|url|content)|unsupported (uri|url)|invalid (uri|url)|file_uri|cannot access|could not access/.test(lower);
}

/** Stall watchdog for one attempt: no stream event at all within this long. */
const STALL_FIRST_EVENT_MS = 75_000;
const STALL_BETWEEN_EVENTS_MS = 45_000;

/** Last attempts (model, outcome, duration - never a key), readable from the
 *  console as window.__refereeAttempts to diagnose slow answers on a device. */
function recordAttempt(report: AttemptReport): void {
  try {
    const host = globalThis as unknown as { __refereeAttempts?: Array<AttemptReport & { at: string }> };
    const list = host.__refereeAttempts ?? (host.__refereeAttempts = []);
    list.push({ ...report, at: new Date().toISOString() });
    if (list.length > 40) list.splice(0, list.length - 40);
  } catch { /* diagnostics only */ }
}

/** A random starting key spreads every user's questions over the whole pool. */
function randomStart(size: number): number {
  return size > 0 ? Math.floor(Math.random() * size) : 0;
}

function getEnvKey(): string | undefined {
  return (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || import.meta.env?.VITE_GEMINI_API_KEY;
}

async function ensureKeysLoaded(): Promise<void> {
  if (GEMINI_KEYS.length > 0) return;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const docRef = doc(db, "secrets", "api_keys");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      const values = (Array.isArray(data.gemini_keys) ? data.gemini_keys : Object.values(data)) as unknown[];
      // Pool entries may be plaintext (legacy) or ENC1 vault envelopes — see src/lib/keyVault.ts.
      const { decryptPoolEntries } = await import('../lib/keyVault');
      const keys = await decryptPoolEntries(values);
      if (keys.length) GEMINI_KEYS = keys;
      console.log("Gemini key pool loaded.");
    }
  } catch (err) {
    console.error("Error fetching Gemini keys from Firestore:", err);
  }
}

export async function getAllApiKeys(): Promise<string[]> {
  await ensureKeysLoaded();
  const envKey = getEnvKey();
  const list = [...GEMINI_KEYS];
  if (envKey && !list.includes(envKey)) list.push(envKey);
  if (list.length === 0) throw new Error("No API keys configured");
  return list;
}

// --- Referee corrections ---
let REFEREE_CORRECTIONS: string | null = null;

async function getRefereeCorrections(): Promise<string> {
  if (REFEREE_CORRECTIONS !== null) return REFEREE_CORRECTIONS;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const docSnap = await getDoc(doc(db, "app_config", "corrections"));
    REFEREE_CORRECTIONS = docSnap.exists() ? String(docSnap.data().text || '') : '';
  } catch (err) {
    console.error("Error fetching referee corrections:", err);
    REFEREE_CORRECTIONS = '';
  }
  return REFEREE_CORRECTIONS;
}

export function invalidateCorrectionsCache(): void {
  REFEREE_CORRECTIONS = null;
}

/**
 * Health-aware round-robin over the pooled Gemini keys. Shared by every
 * caller (ask path, season-identity generation) so no path pins keys[0] or
 * burns a cooled-down key. Returns null when every key is cooling or the
 * pool is empty; callers must treat null as "try later", never as fatal.
 */
export async function acquireApiKey(): Promise<string | null> {
  const keys = await getAllApiKeys();
  const available = keyHealthFor(keys).available(keys);
  if (!available.length) return null;
  return available[randomStart(available.length)];
}

// --- Core AI logic ---
export const GeminiService = {
  /**
   * Ask the virtual referee. Result contract: see ai/askContract.ts -
   * resolves ASK_ABORTED when aborted, otherwise user-visible text
   * (answers and honest Hebrew failure messages alike); never rejects for
   * expected failures.
   */
  async askRulebook(
    question: string,
    history: ChatHistoryMessage[],
    rulebookFiles: RulebookFile[] = [],
    seasonName: string = "SUBMERGED",
    userFiles?: UserFile[],
    onChunk?: (text: string) => void,
    language: string = 'he',
    signal?: AbortSignal,
    onStreamReset?: () => void
  ) {
    try {
      console.log("Processing FLL Query directly on the client-side...");
      const [{ GoogleGenAI }, { buildSystemPrompt, addCorrections, COGNITIVE_PROMPT, ANSWER_PROMPT }] = await Promise.all([
        import('@google/genai'),
        import('./geminiPrompts'),
      ]);

      const allFiles: RequestFile[] = [
        ...(rulebookFiles || []).map(file => ({ url: file.url, key: file.name, isRulebook: true })),
        ...(userFiles || []).map(file => ({ ...file, isRulebook: false })),
      ];
      const contents = buildHistory(history);
      const currentParts: LegacyPart[] = [];

      let activeSystemPrompt = buildSystemPrompt(language, activeSeason(seasonName));

      // Owner corrections override every other instruction.
      const correctionsText = (await getRefereeCorrections()).trim();
      if (correctionsText) activeSystemPrompt = addCorrections(activeSystemPrompt, correctionsText);

      await ensureKeysLoaded();

      let globalImageIndex = 1;

      // Label every image so the model can separate rules, updates and user photos.
      const pagePrefixText = (fileName: string, isUserPhoto: boolean, pageIndex?: number) =>
        imageLabel(globalImageIndex++, fileName, isUserPhoto, pageIndex);

      const appendPdfPages = async (
        pdf: Blob | File,
        fileName: string,
        isUserPhoto: boolean,
        log: (count: number) => string,
        countAsRulebook: boolean,
      ): Promise<number | null> => {
        const pages = await convertPdfToImages(pdf);
        console.log(log(pages.length));
        let attached = 0;
        for (let pageIndex = 1; pageIndex <= pages.length; pageIndex++) {
          if (signal?.aborted) return null;
          const page = pages[pageIndex - 1];
          await appendImagePart(currentParts, pagePrefixText(fileName, isUserPhoto, pageIndex), page.data);
          if (countAsRulebook) attached++;
        }
        return attached;
      };

      let attachedRulebookImages = 0;
      if (allFiles.length) {
        currentParts.push({ text: `Below are all the rulebook pages and user photos loaded into your context.
They are structured in sequence:
1. RULEBOOK PAGES (official rules of FLL)
2. USER PHOTO (the photo of the field/robot that you must judge)

VERY IMPORTANT INSTRUCTION FOR IDENTIFICATION:
- Official rulebook document images are prefixed with '--- RULEBOOK PAGE ... ---'. Do NOT judge these as the user's query! Use them ONLY as a dictionary of rules.
- The actual user's photo to be judged is prefixed with '--- USER PHOTO ... ---'. It shows a robot or the field state that the user is asking about. You MUST look at the USER PHOTO to identify which mission or game state the user is asking about!
\n\n` });
        
        for (const file of allFiles) {
          if (signal?.aborted) return ASK_ABORTED;
          const { fileName, isPdf, isText, isUserPhoto, isR2Rulebook } = describeRequestFile(file);

          if (isPdf) {
            if (isR2Rulebook) {
              console.log(`Fetching pre-processed PDF images from R2 for ${fileName} dynamically...`);
              const fetched = await fetchBlob(file.url, signal);
              if (signal?.aborted) return ASK_ABORTED;
              if (!fetched) throw new RulebookIncompleteError({ file: fileName, code: 'source-fetch', detail: 'The source PDF could not be fetched.' });
              let expectedPages: number;
              try {
                expectedPages = await countPdfPages(fetched.data);
                if (!Number.isInteger(expectedPages) || expectedPages < 1) throw new Error(`Invalid page count ${expectedPages}`);
              } catch (error) {
                throw new RulebookIncompleteError({ file: fileName, code: 'invalid-pdf', detail: error instanceof Error ? error.message : String(error) });
              }

              const imageSet = await fetchR2ImageSet(fileName, signal);
              const uploadedImages = imageSet.pages;
              if (signal?.aborted) return ASK_ABORTED;
              assertListedPagesComplete(fileName, expectedPages, imageSet.listedPages);

              console.log(`Loaded ${uploadedImages.length} of ${expectedPages} pages for ${fileName}`);
              if (uploadedImages.length === 0) {
                console.log(`No pre-processed images found for ${fileName}, converting the complete PDF on the fly...`);
                try {
                  const attached = await appendPdfPages(
                    fetched.data,
                    fileName,
                    isUserPhoto,
                    count => `Converted ${count} pages on the fly for ${fileName}`,
                    true,
                  );
                  if (attached === null) return ASK_ABORTED;
                  if (attached !== expectedPages) throw new Error(`Attached ${attached} of ${expectedPages} pages.`);
                  attachedRulebookImages += attached;
                } catch (err) {
                  if (err instanceof RulebookIncompleteError) throw err;
                  throw new RulebookIncompleteError({ file: fileName, code: 'fallback-render', detail: err instanceof Error ? err.message : String(err) });
                }
              }

              for (const image of uploadedImages) {
                appendBase64ImagePart(currentParts, pagePrefixText(fileName, isUserPhoto, image.pageIndex), image.data, 'image/jpeg', image.url);
                attachedRulebookImages++;
              }
            } else {
              const pdfBlob = await getInlineBlob(file, signal) || (await fetchBlob(file.url, signal))?.data;
              if (signal?.aborted) return ASK_ABORTED;
  
              if (pdfBlob) {
                const attached = await appendPdfPages(
                  pdfBlob,
                  fileName,
                  isUserPhoto,
                  count => `Successfully rendered ${count} visual pages for PDF: ${fileName}`,
                  false,
                );
                if (attached === null) return ASK_ABORTED;
              }
            }
          } else if (isText) {
            const textBlob = await getInlineBlob(file, signal) || (await fetchBlob(file.url, signal))?.data;
            if (signal?.aborted) return ASK_ABORTED;
            if (!textBlob) throw new RulebookIncompleteError({ file: fileName, code: 'source-fetch', detail: 'The text rulebook could not be fetched.' });
            const text = await textBlob.text();
            if (!text.trim()) throw new RulebookIncompleteError({ file: fileName, code: 'empty-text', detail: 'The text rulebook is empty.' });
            currentParts.push({ text: textRulebookLabel(fileName, text) });
            if (file.isRulebook) attachedRulebookImages++;
          } else {
            let mimeType = 'image/jpeg';
            let blobToUpload: Blob | File | null = null;

            if (file.actualFile) {
              mimeType = file.actualFile.type || mimeType;
              blobToUpload = file.actualFile;
            } else if (file.base64) {
              mimeType = file.base64.split(';base64,')[0].split(':')[1] || mimeType;
            } else if (file.url && file.url.startsWith('data:')) {
              mimeType = file.url.split(';base64,')[0].split(':')[1];
            }

            const inlineBlob = await getInlineBlob(file, signal);
            if (signal?.aborted) return ASK_ABORTED;
            if (inlineBlob) {
              blobToUpload = inlineBlob;
            } else if (file.url) {
              const fetched = await fetchBlob(file.url, signal);
              if (signal?.aborted) return ASK_ABORTED;
              if (fetched) {
                mimeType = fetched.mimeType;
                blobToUpload = fetched.data;
              }
            }

            if (blobToUpload) {
              await appendImagePart(currentParts, pagePrefixText(fileName, isUserPhoto), blobToUpload, mimeType);
              if (file.isRulebook) attachedRulebookImages++;
            }
          }
        }
        currentParts.push({ text: "\n--- END OF FILES ---\n\n" });
      }

      const hasUserFiles = Boolean(userFiles?.length);
      const expectedRulebook = (rulebookFiles || []).length;
      if (expectedRulebook > 0 && attachedRulebookImages === 0 && !hasUserFiles) {
        return translateFor(language, 'chat.rulebookPagesFailed');
      }
      const modifiedQuestion = buildQuestionText(question, hasUserFiles, COGNITIVE_PROMPT + ANSWER_PROMPT);

      currentParts.push({ text: modifiedQuestion });

      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts.push(...currentParts);
      } else {
        contents.push({
          role: 'user',
          parts: currentParts
        });
      }

      // Rule book pages go by public URL (Google fetches them; the phone
      // uploads a few KB instead of ~20 page images). The inline copy is the
      // fallback if Google can't fetch the links.
      const inlineInput = toInteractionInput(contents);
      const urlInput = toInteractionInput(contents, { preferUri: true });
      const hasUrlParts = JSON.stringify(urlInput) !== JSON.stringify(inlineInput);
      const effectiveChain = MODEL_CHAIN;

      const callModel = (client: any, model: ModelChainEntry, input: Parameters<typeof runModel>[0]['input'], stream: boolean, onText: ((text: string) => void) | undefined, attemptSignal: AbortSignal, onActivity: () => void) =>
        runModel({ client, model, input, systemInstruction: activeSystemPrompt, stream, signal: attemptSignal, onText, onActivity });


      let responseText = '';
      const allKeys = await getAllApiKeys();
      // True once any attempt has streamed final-answer chunks into the UI.
      let streamedBubbleLive = false;

      // One call per question: the answer streams straight from the first
      // request (the old draft -> critique -> final passes tripled the
      // requests per question). Keys start at a random pool position.
      const outcome = await runModelChain({
        models: effectiveChain,
        keys: allKeys,
        health: keyHealthFor(allKeys),
        modelId: entry => entry.name,
        rotationIndex: randomStart(allKeys.length),
        signal,
        onAttempt: recordAttempt,
        attempt: async (key, modelEntry) => {
          const client = new GoogleGenAI({ apiKey: key });
          // A retried attempt restarts the answer from zero: the caller
          // drops the partial bubble the failed attempt streamed, so a
          // stale half-finished think block is never concatenated into
          // the fresh answer.
          let attemptStreamed = false;
          // Stall watchdog: a request that sends nothing at all (not even
          // thinking events) for too long is dropped and the chain moves
          // on, instead of hanging the question. The user's Stop still
          // aborts through the parent signal.
          const attemptController = new AbortController();
          const onParentAbort = () => attemptController.abort();
          signal?.addEventListener('abort', onParentAbort, { once: true });
          let stalled = false;
          let watchdog: ReturnType<typeof setTimeout> | undefined;
          const arm = (ms: number) => {
            clearTimeout(watchdog);
            watchdog = setTimeout(() => { stalled = true; attemptController.abort(); }, ms);
          };
          arm(STALL_FIRST_EVENT_MS);
          let answer: string;
          const onText = (chunk: string) => {
            if (!attemptStreamed) {
              attemptStreamed = true;
              if (streamedBubbleLive) onStreamReset?.();
            }
            streamedBubbleLive = true;
            onChunk?.(chunk);
          };
          const onActivity = () => arm(STALL_BETWEEN_EVENTS_MS);
          try {
            if (hasUrlParts && pageUrlsWork) {
              try {
                answer = await callModel(client, modelEntry, urlInput, true, onText, attemptController.signal, onActivity);
              } catch (error) {
                if (!(isUrlFetchError(error) || classifyFailure(error).kind === 'request') || signal?.aborted || stalled) throw error;
                // Google couldn't fetch the page links: send the bytes for
                // the rest of this session.
                console.warn('[referee] page URLs rejected, falling back to inline pages:', errorText(error).slice(0, 200));
                pageUrlsWork = false;
                arm(STALL_FIRST_EVENT_MS);
                answer = await callModel(client, modelEntry, inlineInput, true, onText, attemptController.signal, onActivity);
              }
            } else {
              answer = await callModel(client, modelEntry, inlineInput, true, onText, attemptController.signal, onActivity);
            }
          } catch (error) {
            if (stalled && !signal?.aborted) throw new Error('504 stream stalled');
            throw error;
          } finally {
            clearTimeout(watchdog);
            signal?.removeEventListener('abort', onParentAbort);
          }
          if (stalled && !signal?.aborted) throw new Error('504 stream stalled');
          if (!answer.trim()) throw new Error('503 empty model answer');
          responseText = answer;
          return true;
        },
      });

      // An abort landing mid-stream unwinds the stream early with partial
      // text; the contract still resolves ASK_ABORTED so the partial answer
      // is never counted or logged.
      if (signal?.aborted || outcome.status === 'aborted') return ASK_ABORTED;
      if (!responseText) {
        throw new Error(outcome.status === 'exhausted' && outcome.lastFailureKind === 'quota' ? '429 RESOURCE_EXHAUSTED: all keys cooling down' : 'All models and API keys were exhausted without a successful answer.');
      }

      return responseText;

    } catch (error: unknown) {
      if (signal?.aborted) return ASK_ABORTED;
      if (error instanceof RulebookIncompleteError) {
        console.error('Active rulebook completeness check failed:', error.diagnostic);
        return failureResult(translateFor(language, 'chat.rulebookIncomplete'));
      }
      const errMsg = errorText(error);
      const is429 = errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("quota");
      if (is429) {
        console.warn("[referee] quota exceeded on every key/model:", errMsg.substring(0, 300));
        return failureResult(translateFor(language, 'chat.serviceBusy'));
      }
      console.error("[referee] ask failed:", errMsg.substring(0, 500), error);
      return failureResult(translateFor(language, 'chat.serviceTemporaryFailure'));
    }
  }
};
