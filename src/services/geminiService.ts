import { db } from '../lib/firebase/firestore';
import { R2_PUBLIC_URL } from '../lib/r2Config';
import { listRulebookImagePages } from '../lib/r2';
import { convertPdfToImages, countPdfPages, fileToBase64 } from '../features/referee/rulebook/pdfRendering';
import { errorText, KeyHealth } from '../features/referee/ai/retryPolicy';
import { runModelChain } from '../features/referee/ai/modelChain';
import { buildHistory, toInteractionInput, toInteractionTextOnly, type HistoryMessage as ChatHistoryMessage, type LegacyPart } from '../features/referee/ai/conversation';
import { activeSeason, buildQuestionText, critiquePlan, finalPlan, visibleCritique } from '../features/referee/ai/requestPlan';
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
type PageImage = { pageIndex: number; data: string };
type RequestFile = UserFile & { isRulebook: boolean };
type FetchedBlob = { data: Blob; mimeType: string };


const INTERACTION_CONFIG = { max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, thinking_level: 'high' };
// When user photos are attached, the self-critique re-sees them so visual
// claims in the draft get verified against the actual photo.
const PHOTO_CRITIQUE_ADDENDUM = '\n[ביקורת חזותית: צורפה תמונת משתמש (ראה מעלה, USER PHOTO). בדוק שהזיהוי החזותי בטיוטה — משימה, מיקום, מגע, ניקוד — תואם את מה שבאמת רואים בתמונה. אם לא, תקן.]';
const MODEL_CHAIN: ModelChainEntry[] = [
  { name: 'gemini-3.6-flash', kind: 'interactions', config: INTERACTION_CONFIG },
  { name: 'gemini-3.5-flash', kind: 'interactions', config: INTERACTION_CONFIG },
  { name: 'gemini-3.1-pro-preview', kind: 'interactions', config: { temperature: 1, max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, topP: 0.95, thinking_level: 'high' } },
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

function appendBase64ImagePart(parts: LegacyPart[], prefixText: string, data: string, mimeType = 'image/jpeg'): void {
  parts.push({ text: prefixText });
  parts.push({ inlineData: { data, mimeType } });
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
    return { pageIndex, data: await fileToBase64(new Blob([imageData], { type: 'image/jpeg' })) };
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

const keyHealth = new KeyHealth();

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
  const available = keyHealth.available(keys);
  if (!available.length) return null;
  const raw = parseInt(localStorage.getItem('gemini_key_rotation_index') || '0', 10);
  const index = Number.isInteger(raw) && raw >= 0 ? raw : 0;
  localStorage.setItem('gemini_key_rotation_index', String((index + 1) % available.length));
  return available[index % available.length];
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
      const [{ GoogleGenAI }, { buildSystemPrompt, addCorrections, COGNITIVE_PROMPT, CRITIQUE_PROMPT, FINAL_PROMPT }] = await Promise.all([
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
      // User-photo parts (tracked separately so the critique can re-see them
      // without resending the whole rulebook).
      const userPhotoParts: LegacyPart[] = [];
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
          const partsBefore = currentParts.length;
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
                appendBase64ImagePart(currentParts, pagePrefixText(fileName, isUserPhoto, image.pageIndex), image.data);
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
          if (isUserPhoto) userPhotoParts.push(...currentParts.slice(partsBefore));
        }
        currentParts.push({ text: "\n--- END OF FILES ---\n\n" });
      }

      const hasUserFiles = Boolean(userFiles?.length);
      const expectedRulebook = (rulebookFiles || []).length;
      if (expectedRulebook > 0 && attachedRulebookImages === 0 && !hasUserFiles) {
        return translateFor(language, 'chat.rulebookPagesFailed');
      }
      const modifiedQuestion = buildQuestionText(question, hasUserFiles, COGNITIVE_PROMPT);

      currentParts.push({ text: modifiedQuestion });

      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts.push(...currentParts);
      } else {
        contents.push({
          role: 'user',
          parts: currentParts
        });
      }

      const interactionInput = toInteractionInput(contents);
      const textOnlyInput = toInteractionTextOnly(contents);
      const effectiveChain = MODEL_CHAIN;

      const callModel = (client: any, model: ModelChainEntry, input: Parameters<typeof runModel>[0]['input'], stream: boolean, onText?: (text: string) => void) =>
        runModel({ client, model, input, systemInstruction: activeSystemPrompt, stream, signal, onText });


      let responseText = '';
      const allKeys = await getAllApiKeys();
      // True once any attempt has streamed final-answer chunks into the UI.
      let streamedBubbleLive = false;

      // One rotation decision per ask: the starting key is read once and
      // advanced per model iteration (see ai/modelChain.ts).
      const rotationRaw = parseInt(localStorage.getItem('gemini_key_rotation_index') || '0', 10);
      const outcome = await runModelChain({
        models: effectiveChain,
        keys: allKeys,
        health: keyHealth,
        rotationIndex: Number.isInteger(rotationRaw) && rotationRaw >= 0 ? rotationRaw : 0,
        onRotation: next => localStorage.setItem('gemini_key_rotation_index', String(next)),
        signal,
        attempt: async (key, modelEntry) => {
          const client = new GoogleGenAI({ apiKey: key });
          const draftText = await callModel(client, modelEntry, interactionInput, false);

          let finalAnswer = draftText;
          // The critique re-sees the user's photos (rulebook images stay
          // out to avoid resending them) so visual claims get verified.
          const critiqueInput = critiquePlan({
            textOnlyInput,
            userPhotoParts,
            draftText,
            critiquePrompt: CRITIQUE_PROMPT,
            photoAddendum: PHOTO_CRITIQUE_ADDENDUM,
          });
          const critiqueText = (await callModel(client, modelEntry, critiqueInput, false)) || "אין הערות קריטיות.";

          if (visibleCritique(critiqueText)) {
            const finalInput = finalPlan(critiqueInput, critiqueText, FINAL_PROMPT);
            // A retried attempt restarts the answer from zero: the caller
            // drops the partial bubble the failed attempt streamed, so a
            // stale half-finished think block is never concatenated into
            // the fresh answer.
            let attemptStreamed = false;
            const streamedText = await callModel(client, modelEntry, finalInput, true, (chunk: string) => {
              if (!attemptStreamed) {
                attemptStreamed = true;
                if (streamedBubbleLive) onStreamReset?.();
              }
              streamedBubbleLive = true;
              onChunk?.(chunk);
            });
            finalAnswer = streamedText || draftText;
          }

          responseText = finalAnswer;
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
        console.warn("Quota exceeded, returning friendly message");
        return failureResult(translateFor(language, 'chat.serviceBusy'));
      }
      console.warn("Gemini error:", errMsg.substring(0, 200));
      return failureResult(translateFor(language, 'chat.serviceTemporaryFailure'));
    }
  }
};
