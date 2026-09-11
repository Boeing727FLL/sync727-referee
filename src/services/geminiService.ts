import axios from 'axios';
import { db } from '../lib/firebase';
import { R2_PUBLIC_URL } from '../lib/r2Config';
import { listRulebookImagePages } from '../lib/r2';

// --- Configuration ---
const R2_PROXY_PATH = '/api/r2/file/';
const MIN_HTML_PROBE_BYTES = 500;
const HTML_PROBE_BYTES = 100;
const MODEL_MAX_OUTPUT_TOKENS = 65536;

type RulebookFile = { name: string; url: string };
type UserFile = { url: string; key: string; base64?: string; actualFile?: File };
type ChatHistoryMessage = { role: 'user' | 'model'; text: string; files?: unknown[] };
type ModelChainEntry = { name: string; kind: 'interactions' | 'generateContent'; config: Record<string, unknown> };
type PageImage = { pageIndex: number; data: string };
type RequestFile = UserFile & { isRulebook: boolean };
type FetchedBlob = { data: Blob; mimeType: string };
type LegacyPart = {
  text?: string;
  inlineData?: { data: string; mimeType?: string };
  fileData?: { fileUri: string; mimeType?: string };
};
type LegacyMessage = { role: 'user' | 'model'; parts: LegacyPart[] };
type InteractionPart =
  | { type: 'text'; text: string }
  | { type: 'image'; data?: string; uri?: string; mime_type?: string; resolution?: 'high' };
type InteractionStep = { type: 'user_input' | 'model_output'; content: InteractionPart[] };
type StreamEvent = {
  event_type?: string;
  delta?: { type?: string; text?: string };
  error?: { message?: string };
};

const INTERACTION_CONFIG = { max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, thinking_level: 'high' };
const MODEL_CHAIN: ModelChainEntry[] = [
  { name: 'gemini-3.6-flash', kind: 'interactions', config: INTERACTION_CONFIG },
  { name: 'gemini-3.5-flash', kind: 'interactions', config: INTERACTION_CONFIG },
  { name: 'gemini-3.1-pro-preview', kind: 'interactions', config: { temperature: 1, max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, topP: 0.95, thinking_level: 'high' } },
  { name: 'gemini-3.5-flash-lite', kind: 'generateContent', config: { thinkingConfig: { thinkingLevel: 'HIGH' }, mediaResolution: 'MEDIA_RESOLUTION_HIGH' } },
];

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && error.message) return String(error.message);
  try {
    return typeof error === 'string' ? error : JSON.stringify(error) || String(error);
  } catch {
    return String(error);
  }
}

function buildHistory(history: ChatHistoryMessage[]): LegacyMessage[] {
  const contents: LegacyMessage[] = [];
  for (const message of history) {
    const role = message.role === 'user' ? 'user' : 'model';
    if (!contents.length && role === 'model') continue;

    let text = message.text || ' ';
    if (role === 'user' && message.files?.length) {
      text += '\n[הערת מערכת: המשתמש צירף תמונה בהודעה זו. התמונה ההיא כבר לא מוצגת לך, ולכן אל תשליך מהתשובה שלך עליה לתמונות עתידיות שיועלו].';
    }

    const previous = contents[contents.length - 1];
    if (previous?.role === role) previous.parts.push({ text: `\n\n${text}` });
    else contents.push({ role, parts: [{ text }] });
  }
  return contents;
}

function toInteractionInput(messages: LegacyMessage[]): InteractionStep[] {
  return (messages || []).map(message => ({
    type: (message.role === 'model' ? 'model_output' : 'user_input') as InteractionStep['type'],
    content: message.parts.flatMap(toInteractionParts),
  }));
}

function toInteractionParts(part: LegacyPart): InteractionPart[] {
  if (part.inlineData) {
    return [{ type: 'image', data: part.inlineData.data, mime_type: part.inlineData.mimeType || 'image/jpeg', resolution: 'high' }];
  }
  if (part.fileData) {
    return [{ type: 'image', uri: part.fileData.fileUri, mime_type: part.fileData.mimeType || 'image/jpeg', resolution: 'high' }];
  }
  const text = (part.text ?? '').trim();
  return text ? [{ type: 'text', text: part.text ?? '' }] : [];
}

function toInteractionTextOnly(messages: LegacyMessage[]): InteractionStep[] {
  return (messages || [])
    .map(message => ({
      type: (message.role === 'model' ? 'model_output' : 'user_input') as InteractionStep['type'],
      content: (message.parts || [])
        .filter((part: LegacyPart) => !part.fileData && !part.inlineData &&
          !(part.text && /^Image \d+:\n---/.test(part.text)) &&
          !(part.text && part.text.includes('--- HIGH RESOLUTION ZOOM')))
        .map((part: LegacyPart) => ({ type: 'text', text: part.text ?? '' } as const))
        .filter(part => part.text && part.text.trim()),
    }))
    .filter(message => message.content.length);
}

function stepsToContents(steps: InteractionStep[]): LegacyMessage[] {
  return (steps || []).map(step => {
    const role: LegacyMessage['role'] = step.type === 'model_output' ? 'model' : 'user';
    return {
      role,
      parts: (step.content || []).map(part => part.type === 'image'
        ? { inlineData: { data: part.data, mimeType: part.mime_type || 'image/jpeg' } }
        : { text: part.text }),
    };
  });
}

function textStep(type: InteractionStep['type'], text: string): InteractionStep {
  return { type, content: [{ type: 'text', text }] };
}

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

const isKeyInvalidError = (message: string): boolean =>
  ['403', '401', 'leaked', 'PERMISSION_DENIED', 'API key not valid', 'API_KEY_INVALID'].some(value => message.includes(value));

const isQuotaError = (message: string): boolean =>
  message.includes('429') || message.includes('Too Many Requests') ||
  message.includes('Quota exceeded') || message.includes('RESOURCE_EXHAUSTED');

function isRequestLevelError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('400') && [
    'schema', 'model', 'unsupported', 'not found', 'input format',
    'unknown field', 'invalid argument', 'not enabled',
  ].some(value => lower.includes(value));
}

// --- PDF tools ---
let mupdfLibPromise: Promise<typeof import('mupdf')> | null = null;

async function getMupdfLib(): Promise<typeof import('mupdf')> {
  if (!mupdfLibPromise) {
    (globalThis as any).$libmupdf_wasm_Module = { locateFile: () => '/mupdf-wasm.wasm' };
    mupdfLibPromise = import('mupdf');
  }
  return mupdfLibPromise;
}

async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Render PDF pages so diagrams and symbols remain visible to the model.
export async function convertPdfToImages(pdfInput: File | Blob, scaleFactor = 2, specificPage?: number): Promise<{ data: Blob; name: string }[]> {
  try {
    const mupdf = await getMupdfLib();
    const arrayBuffer = await pdfInput.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const images: { data: Blob; name: string }[] = [];
    let doc: any = null;
    try {
      doc = mupdf.Document.openDocument(data, 'application/pdf');
      const totalPages = doc.countPages();

      console.log(`Rendering PDF visually to JPEG images: total ${totalPages} pages (Scale: ${scaleFactor})...`);

      const startPage = specificPage || 1;
      const endPage = specificPage || totalPages;
      const colorspace = mupdf.ColorSpace.DeviceRGB;

      for (let i = startPage; i <= endPage; i++) {
        try {
          const page = doc.loadPage(i - 1);
          const pixmap = page.toPixmap(mupdf.Matrix.scale(scaleFactor, scaleFactor), colorspace, false, true);
          const jpegBytes = pixmap.asJPEG(scaleFactor >= 5.0 ? 100 : 85);

          const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
          images.push({
            data: blob,
            name: `page_${i}.jpg`
          });
          pixmap.destroy();
          page.destroy();
        } catch (pageErr) {
          console.error(`Error rendering PDF page ${i} to visual image:`, pageErr);
        }
      }
      return images;
    } finally {
      doc?.destroy();
    }
  } catch (err) {
    console.error("Error in convertPdfToImages:", err);
    return [];
  }
}

// --- File parts ---
function resolveR2Url(url: string): string {
  if (!url.includes(R2_PROXY_PATH)) return url;
  const fileKey = url.substring(url.indexOf(R2_PROXY_PATH) + R2_PROXY_PATH.length);
  return `${R2_PUBLIC_URL}/${fileKey}`;
}

async function fetchBlob(url: string, signal?: AbortSignal): Promise<FetchedBlob | null> {
  try {
    const response = await axios.get(resolveR2Url(url), { responseType: 'blob', signal });
    return {
      data: response.data as Blob,
      mimeType: String(response.headers['content-type'] || 'image/jpeg'),
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
  const pages: PageImage[] = [];

  try {
    const pageNumbers = await listRulebookImagePages(fileName);
    for (const pageIndex of pageNumbers) {
      if (signal?.aborted) break;
      const encodedFileName = encodeURIComponent(fileName);
      const imageUrl = `${R2_PUBLIC_URL}/fll-rules-images/${encodedFileName}/page_${pageIndex}.jpg`;
      const response = await fetch(imageUrl, { signal });
      if (!response.ok) continue;
      const imageData = await response.arrayBuffer();
      const isHtmlError = imageData.byteLength < MIN_HTML_PROBE_BYTES &&
        new TextDecoder().decode(new Uint8Array(imageData.slice(0, HTML_PROBE_BYTES))).includes('<html');
      if (isHtmlError) continue;

      const blob = new Blob([imageData], { type: 'image/jpeg' });
      pages.push({ pageIndex, data: await fileToBase64(blob) });
    }
  } catch (error) {
    console.warn('Could not list rendered R2 pages; using PDF fallback:', error);
  }

  return pages;
}

// --- API key pool ---
let GEMINI_KEYS: string[] = [];

const unhealthyKeys = new Set<string>();

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
  await ensureKeysLoaded();

  const availableKeys = GEMINI_KEYS.filter(k => !unhealthyKeys.has(k));
  if (availableKeys.length) {
    const index = parseInt(localStorage.getItem('gemini_key_rotation_index') || '0', 10);
    const key = availableKeys[index % availableKeys.length];
    localStorage.setItem('gemini_key_rotation_index', String((index + 1) % availableKeys.length));
    return key;
  }

  if (GEMINI_KEYS.length) {
    console.warn("All keys are unhealthy, resetting state");
    unhealthyKeys.clear();
    return GEMINI_KEYS[0];
  }

  const envKey = getEnvKey();
  if (envKey) return envKey;
  throw new Error("No API keys configured");
}

function markKeyUnhealthy(key: string): void {
  if (key !== 'proxy-key') unhealthyKeys.add(key);
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
      let success = false;
      const allKeys = await getAllApiKeys();

      for (let mi = 0; mi < effectiveChain.length && !success; mi++) {
        const modelEntry = effectiveChain[mi];
        console.log(`Attempting model ${mi + 1}/${effectiveChain.length}: ${modelEntry.name} (${modelEntry.kind})`);
        if (mi === effectiveChain.length - 1) {
          unhealthyKeys.clear();
        }
        for (const key of allKeys) {
          if (signal?.aborted) return '';
          if (unhealthyKeys.has(key)) continue;

          const client = new GoogleGenAI({ apiKey: key });

          try {
            const draftText = await callModel(client, modelEntry, interactionInput, false);

            let finalAnswer = draftText;
            const critiqueInput: InteractionStep[] = [
              ...textOnlyInput,
              ...(draftText.trim() ? [textStep('model_output', draftText)] : []),
              textStep('user_input', CRITIQUE_PROMPT),
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
            success = true;
            break;
          } catch (err: unknown) {
            if (signal?.aborted) return '';
            const errMsg = errorMessage(err);
            if (isKeyInvalidError(errMsg)) {
              markKeyUnhealthy(key);
            } else if (isRequestLevelError(errMsg)) {
              break;
            } else if (isQuotaError(errMsg)) markKeyUnhealthy(key);
          }
        }
      }

      if (!responseText) {
        throw new Error("All models and API keys were exhausted without a successful answer.");
      }

      return responseText;

    } catch (error: unknown) {
      if (signal?.aborted) return '';
      const errMsg = errorMessage(error);
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
