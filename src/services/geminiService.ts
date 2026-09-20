import { db } from '../lib/firebase';
import { R2_PUBLIC_URL } from '../lib/r2Config';
import { listRulebookImagePages } from '../lib/r2';
import { convertPdfToImages, fileToBase64 } from '../features/referee/rulebook/pdfRendering';
import { classifyFailure, errorText, KeyHealth, rotateCandidates } from '../features/referee/ai/retryPolicy';
import { buildHistory, stepsToContents, textStep, toInteractionInput, toInteractionParts, toInteractionTextOnly, type HistoryMessage as ChatHistoryMessage, type InteractionStep, type LegacyMessage, type LegacyPart } from '../features/referee/ai/conversation';

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
type StreamEvent = {
  event_type?: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string };
};

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

async function collectStreamedText(
  stream: AsyncIterable<unknown>,
  signal?: AbortSignal,
  onText?: (text: string) => void,
): Promise<string> {
  let text = '';
  for await (const value of stream) {
    if (signal?.aborted) break;
    if (!value || typeof value !== 'object') continue;
    const event = value as StreamEvent;
    if (event.event_type === 'error' && event.error) {
      throw new Error(event.error.message || 'Interaction stream error');
    }
    if ((event.event_type === 'step.delta' || event.event_type === 'content.delta') &&
      event.delta?.type === 'text' && event.delta.text) {
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
  return response.outputs
    .filter((output): output is { type: 'text'; text: string } =>
      !!output && typeof output === 'object' &&
      (output as { type?: unknown }).type === 'text' &&
      typeof (output as { text?: unknown }).text === 'string')
    .map(output => output.text)
    .join('');
}

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

async function fetchR2ImageSet(fileName: string, signal?: AbortSignal): Promise<PageImage[]> {
  let pageNumbers: number[] = [];
  try {
    pageNumbers = await listRulebookImagePages(fileName);
  } catch (error) {
    console.warn('Could not list rendered R2 pages; using PDF fallback:', error);
    return [];
  }
  // Bounded parallel fetch (order preserved) — much faster than serial.
  const results = await mapPool(pageNumbers, 6, async (pageIndex) => {
    if (signal?.aborted) return null;
    try {
      const encodedFileName = encodeURIComponent(fileName);
      const imageUrl = `${R2_PUBLIC_URL}/fll-rules-images/${encodedFileName}/page_${pageIndex}.jpg`;
      const response = await fetch(imageUrl, { signal });
      if (!response.ok) return null;
      const imageData = await response.arrayBuffer();
      const isHtmlError = imageData.byteLength < MIN_HTML_PROBE_BYTES &&
        new TextDecoder().decode(new Uint8Array(imageData.slice(0, HTML_PROBE_BYTES))).includes('<html');
      if (isHtmlError) return null;

      const blob = new Blob([imageData], { type: 'image/jpeg' });
      return { pageIndex, data: await fileToBase64(blob) };
    } catch {
      return null;
    }
  });
  return results.filter((p): p is PageImage => p !== null);
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

async function getAllApiKeys(): Promise<string[]> {
  await ensureKeysLoaded();
  const envKey = getEnvKey();
  const list = [...GEMINI_KEYS];
  if (envKey && !list.includes(envKey)) list.push(envKey);
  if (list.length === 0) throw new Error("No API keys configured");
  return list;
}

// --- Referee corrections ---
let REFEREE_CORRECTIONS: string | null = null;

export async function getRefereeCorrections(): Promise<string> {
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

export async function getNextApiKey(): Promise<string> {
  const keys = await getAllApiKeys();
  const available = keyHealth.available(keys);
  const candidates = available.length ? available : keys;
  const index = parseInt(localStorage.getItem('gemini_key_rotation_index') || '0', 10);
  const key = candidates[index % candidates.length];
  localStorage.setItem('gemini_key_rotation_index', String((index + 1) % candidates.length));
  return key;
}

// --- Core AI logic ---
export const GeminiService = {
  async askRulebook(
    question: string,
    history: ChatHistoryMessage[],
    rulebookFiles: RulebookFile[] = [],
    seasonName: string = "SUBMERGED",
    userFiles?: UserFile[],
    onChunk?: (text: string) => void,
    language: string = 'he',
    signal?: AbortSignal
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

      const trimmedSeason = seasonName && seasonName.trim();
      const currentSeason = trimmedSeason && seasonName !== 'UNKNOWN' ? trimmedSeason : null;
      let activeSystemPrompt = buildSystemPrompt(language, currentSeason);

      // Owner corrections override every other instruction.
      const correctionsText = (await getRefereeCorrections()).trim();
      if (correctionsText) activeSystemPrompt = addCorrections(activeSystemPrompt, correctionsText);

      await ensureKeysLoaded();

      let globalImageIndex = 1;

      // Label every image so the model can separate rules, updates and user photos.
      const pagePrefixText = (fileName: string, isUserPhoto: boolean, pageIndex?: number): string => {
        if (isUserPhoto) {
          return `Image ${globalImageIndex++}:\n--- USER PHOTO (Analyze this to see what the user is asking about) | FILE: ${fileName} ---\n`;
        }
        if (/update/i.test(fileName)) {
          return `Image ${globalImageIndex++}:\n--- UPDATES PAGE (Official updates document - overrides the base rulebook) | FILE: ${fileName}${pageIndex ? ` | PAGE: ${pageIndex}` : ''} ---\n`;
        }
        return `Image ${globalImageIndex++}:\n--- RULEBOOK PAGE (Use this as reference only) | FILE: ${fileName}${pageIndex ? ` | PAGE: ${pageIndex}` : ''} ---\n`;
      };

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
          try {
            await appendImagePart(currentParts, pagePrefixText(fileName, isUserPhoto, pageIndex), page.data);
            if (countAsRulebook) attached++;
          } catch (error) {
            console.error(`Failed to attach PDF page ${page.name}:`, error);
          }
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
          if (signal?.aborted) return '';
          const partsBefore = currentParts.length;
          const rawFileName = file.actualFile?.name || file.key || 'file';
          const fileName = rawFileName.split('/').pop() || rawFileName;
          const isPdf = file.actualFile?.type === 'application/pdf' || /\.pdf$/i.test(fileName) || file.url?.toLowerCase().endsWith('.pdf');
          const isText = file.actualFile?.type?.startsWith('text/') || /\.(txt|json|xml)$/i.test(fileName);
          const isUserPhoto = !file.isRulebook;

          if (isPdf) {
            const isR2Rulebook = !file.actualFile && file.url.includes('fll-rules');
            
            if (isR2Rulebook) {
              console.log(`Fetching pre-processed PDF images from R2 for ${fileName} dynamically...`);
              const uploadedImages = await fetchR2ImageSet(fileName, signal);
              if (signal?.aborted) return '';
              
              console.log(`Loaded ${uploadedImages.length} pages for ${fileName}`);

              if (uploadedImages.length === 0 && file.url) {
                console.log(`No pre-processed images found for ${fileName}, converting PDF on the fly...`);
                try {
                  const fetched = await fetchBlob(file.url, signal);
                  if (signal?.aborted) return '';
                  if (fetched) {
                    const attached = await appendPdfPages(
                      fetched.data,
                      fileName,
                      isUserPhoto,
                      count => `Converted ${count} pages on the fly for ${fileName}`,
                      true,
                    );
                    if (attached === null) return '';
                    attachedRulebookImages += attached;
                  }
                } catch (err) {
                  console.error(`Failed to fetch/convert PDF for ${fileName}:`, err);
                }
              }

              for (const image of uploadedImages) {
                appendBase64ImagePart(currentParts, pagePrefixText(fileName, isUserPhoto, image.pageIndex), image.data);
                attachedRulebookImages++;
              }
            } else {
              const pdfBlob = await getInlineBlob(file, signal) || (await fetchBlob(file.url, signal))?.data;
              if (signal?.aborted) return '';
  
              if (pdfBlob) {
                const attached = await appendPdfPages(
                  pdfBlob,
                  fileName,
                  isUserPhoto,
                  count => `Successfully rendered ${count} visual pages for PDF: ${fileName}`,
                  false,
                );
                if (attached === null) return '';
              }
            }
          } else if (!isText) {
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
            if (signal?.aborted) return '';
            if (inlineBlob) {
              blobToUpload = inlineBlob;
            } else if (file.url) {
              const fetched = await fetchBlob(file.url, signal);
              if (signal?.aborted) return '';
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

      let modifiedQuestion = question;

      const hasUserFiles = Boolean(userFiles?.length);

      const expectedRulebook = (rulebookFiles || []).length;
      if (expectedRulebook > 0 && attachedRulebookImages === 0 && !hasUserFiles) {
        return 'שגיאה בטעינת חוברת החוקים. לא הצלחתי לטעון אף עמוד, ולכן אני לא עונה כדי לא להמציא. נסו שוב, ואם זה חוזר, העלו מחדש את קובץ החוקים דרך מסך ההעלאה.';
      }
      if (hasUserFiles) {
        modifiedQuestion = `⚠️⚠️⚠️ [הנחיית שיפוט קריטית - ניתוח עצמאי נקי ללא הטיה] ⚠️⚠️⚠️
עליך לנתח את התמונה/קבצים שהועלו כעת במנותק ובנפרד לחלוטין מכל משימה, חוק או תמונה קודמת שדוברה בצ'אט (כמו משימה 5 או כל נושא קודם). אל תניח בשום אופן שהתמונה הזו קשורה אליהם!
בצע זיהוי אובייקטיבי ונקי של האובייקטים והדגמים המופיעים בתמונה הזו בפועל, והשב רק לפיה.

השאלה המקורית של המשתמש:
"${question}"`;
      }

      modifiedQuestion += COGNITIVE_PROMPT;

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

      const callModel = async (
        client: any,
        modelEntry: ModelChainEntry,
        stepInput: InteractionStep[],
        isStream: boolean,
        onText?: (text: string) => void,
      ): Promise<string> => {
        if (modelEntry.kind === 'interactions') {
          const prefixed = modelEntry.name.startsWith('models/') ? modelEntry.name : `models/${modelEntry.name}`;
          const params = {
            model: prefixed,
            input: stepInput,
            generation_config: modelEntry.config,
            system_instruction: activeSystemPrompt,
            stream: isStream,
          };
          const reqOptions = signal ? { signal } : undefined;
          if (isStream) {
            const stream = await client.interactions.create(params, reqOptions);
            return collectStreamedText(stream as AsyncIterable<unknown>, signal, onText);
          }
          return interactionText(await client.interactions.create(params, reqOptions));
        }
        const gcContents = stepsToContents(stepInput);
        const gcConfig: Record<string, unknown> = { thinkingConfig: { thinkingLevel: 'HIGH' } };
        if (signal) gcConfig.abortSignal = signal;
        if (stepInput.some(step => step.content.some(part => part.type === 'image'))) {
          gcConfig.mediaResolution = 'MEDIA_RESOLUTION_HIGH';
        }
        if (isStream) {
          const stream = await client.models.generateContentStream({
            model: modelEntry.name,
            config: gcConfig,
            contents: gcContents,
            systemInstruction: activeSystemPrompt,
          });
          let text = '';
          for await (const chunk of stream) {
            if (signal?.aborted) break;
            if (chunk?.text) {
              text += chunk.text;
              onText?.(chunk.text);
            }
          }
          return text;
        }
        const result = await client.models.generateContent({
          model: modelEntry.name,
          config: gcConfig,
          contents: gcContents,
          systemInstruction: activeSystemPrompt,
        });
        return (result && result.text) || '';
      };

      let responseText = '';
      let lastFailureKind: ReturnType<typeof classifyFailure>['kind'] | null = null;
      const allKeys = await getAllApiKeys();

      modelLoop: for (let modelIndex = 0; modelIndex < effectiveChain.length; modelIndex++) {
        const modelEntry = effectiveChain[modelIndex];
        const availableKeys = keyHealth.available(allKeys);
        if (!availableKeys.length) {
          lastFailureKind = 'quota';
          break;
        }
        const rotationIndex = parseInt(localStorage.getItem('gemini_key_rotation_index') || '0', 10);
        const candidates = rotateCandidates(availableKeys, rotationIndex);
        localStorage.setItem('gemini_key_rotation_index', String((rotationIndex + 1) % availableKeys.length));
        for (const key of candidates) {
          if (signal?.aborted) return '';
          const client = new GoogleGenAI({ apiKey: key });
          try {
            const draftText = await callModel(client, modelEntry, interactionInput, false);

            let finalAnswer = draftText;
            // The critique re-sees the user's photos (rulebook images stay
            // out to avoid resending them) so visual claims get verified.
            const critiquePhotoSteps: InteractionStep[] = userPhotoParts.length
              ? [{ type: 'user_input', content: userPhotoParts.flatMap(toInteractionParts) }]
              : [];
            const critiquePrompt = userPhotoParts.length
              ? CRITIQUE_PROMPT + PHOTO_CRITIQUE_ADDENDUM
              : CRITIQUE_PROMPT;
            const critiqueInput: InteractionStep[] = [
              ...textOnlyInput,
              ...critiquePhotoSteps,
              ...(draftText.trim() ? [textStep('model_output', draftText)] : []),
              textStep('user_input', critiquePrompt),
            ];
            const critiqueText = (await callModel(client, modelEntry, critiqueInput, false)) || "אין הערות קריטיות.";
            const strippedCritique = critiqueText.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();

            if (strippedCritique) {
              const finalInput: InteractionStep[] = [
                ...critiqueInput,
                textStep('model_output', critiqueText),
                textStep('user_input', FINAL_PROMPT),
              ];
              const streamedText = await callModel(client, modelEntry, finalInput, true, onChunk);
              finalAnswer = streamedText || draftText;
            }

            responseText = finalAnswer;
            break modelLoop;

          } catch (error: unknown) {
            const decision = classifyFailure(error, signal?.aborted);
            lastFailureKind = decision.kind;
            if (decision.kind === 'aborted') return '';
            keyHealth.coolDown(key, decision.cooldownMs);
            if (decision.tryNextKey) continue;
            if (decision.tryNextModel) continue modelLoop;
            throw error;
          }
        }
      }

      if (!responseText) {
        throw new Error(lastFailureKind === 'quota' ? '429 RESOURCE_EXHAUSTED: all keys cooling down' : 'All models and API keys were exhausted without a successful answer.');
      }

      return responseText;

    } catch (error: unknown) {
      if (signal?.aborted) return '';
      const errMsg = errorText(error);
      const is429 = errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("quota");
      if (is429) {
        console.warn("Quota exceeded, returning friendly message");
        return 'מערכת השופט הווירטואלי עמוסה כרגע. אנא המתן כדקה ונסה שוב.';
      }
      console.warn("Gemini error:", errMsg.substring(0, 200));
      return 'השופט הווירטואלי נתקל בתקלה זמנית. אנא נסה שוב.';
    }
  }
};
