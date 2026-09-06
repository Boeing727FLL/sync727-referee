/**
 * GeminiService — the AI brain of the Virtual Referee.
 *
 * PIPELINE of askRulebook() (the only entry point the chat uses):
 *   1. Keys & corrections load (pooled API keys, admin referee overrides).
 *   2. History is normalized (strict user/model alternation for the API).
 *   3. Rulebook files become labeled image parts (R2 image sets, or PDF
 *      pages rendered locally when no pre-render exists).
 *   4. Three silent passes per model: draft -> adversarial critique ->
 *      streamed polished answer (only the last one reaches the screen).
 *   5. On failure the model/key fallback chain rotates until something
 *      answers; aborts always win immediately and return silence.
 *
 * Prompt strings below are PRODUCT BEHAVIOR (wording = answers), so the
 * refactor documents everything around them and never rewords them.
 */

import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import { db } from '../lib/firebase';

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Public R2 host serving rulebook PDFs and pre-rendered page images. */
const R2_PUBLIC_HOST = 'https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev';
const JPEG_MIME = 'image/jpeg';

/** Marker of backend-proxied file URLs that must be rewritten to direct R2. */
const R2_PROXY_MARKER = '/api/r2/file/';

/** R2 probe batch size when scanning pre-rendered page images. */
const R2_PROBE_BATCH = 8;

/** Consecutive 404s that mark "no more pages" for one rulebook file. */
const R2_PROBE_MAX_MISSES = 3;

/** Bodies smaller than this are error pages, not images. */
const MIN_VALID_IMAGE_BYTES = 500;

/** Leading bytes sniffed to detect HTML error pages in disguise. */
const SNIFF_BYTES = 100;

/** Cap on PDF text extraction so runaway documents cannot hang a question. */
const PDF_TEXT_MAX_PAGES = 50;

/** Output budget requested from every model in the fallback chain. */
const MODEL_MAX_OUTPUT_TOKENS = 65536;

// ---------------------------------------------------------------------------
// Shared types (type-only changes; zero runtime impact)
// ---------------------------------------------------------------------------

/** A rulebook file known by display name + reachable URL. */
export type RulebookFileRef = { name: string; url: string };

/** A user-attached file in any of its carried forms. */
export type UserFileRef = { url: string; key: string; base64?: string; actualFile?: File };

/** One chat history message as the UI stores it. */
export type ChatHistoryMessage = { role: 'user' | 'model'; text: string; files?: any[] };

/** One pre-rendered rulebook page (base64 JPEG + 1-based index). */
type PageImage = { pageIndex: number; data: string; mimeType: string };

/** One entry of the model fallback chain (two SDK dialects). */
type ModelChainEntry = { name: string; kind: 'interactions' | 'generateContent'; config: any };

// ---------------------------------------------------------------------------
// PDF tooling (MuPDF WASM: renders pages without pdf.js/canvas pitfalls)
// ---------------------------------------------------------------------------

let mupdfLibPromise: Promise<typeof import('mupdf')> | null = null;

/** Load the MuPDF WASM module once and reuse it for every conversion. */
async function getMupdfLib(): Promise<typeof import('mupdf')> {
  if (!mupdfLibPromise) {
    (globalThis as any).$libmupdf_wasm_Module = { locateFile: () => '/mupdf-wasm.wasm' };
    mupdfLibPromise = import('mupdf');
  }
  return mupdfLibPromise;
}

/** Plain text of PDF bytes, page-delimited, capped for safety. */
async function extractPdfText(data: Uint8Array, maxPages: number): Promise<string> {
  const mupdf = await getMupdfLib();
  let doc: any = null;
  try {
    doc = mupdf.Document.openDocument(data, 'application/pdf');
    const totalPages = doc.countPages();
    let text = "";
    for (let i = 0; i < Math.min(totalPages, maxPages); i++) {
      const page = doc.loadPage(i);
      const stext = page.toStructuredText();
      const pageText = stext.asText();
      text += `--- Page ${i + 1} ---\n${pageText.trim()}\n\n`;
      stext.destroy();
      page.destroy();
    }
    return text;
  } finally {
    doc?.destroy();
  }
}

/** A File/Blob as a base64 string (no data-URL prefix). */
async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Render every page of a PDF to JPEG blobs (the judge reads pictures, not
 * text, so diagrams and symbols survive). Returns [] on any failure.
 */
export async function convertPdfToImages(pdfInput: File | Blob, scaleFactor: number = 2.0, specificPage?: number): Promise<{ data: Blob; name: string }[]> {
  try {
    const mupdf = await getMupdfLib();
    const arrayBuffer = await pdfInput.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const images: { data: Blob; name: string }[] = [];
    let doc: any = null;
    try {
      doc = mupdf.Document.openDocument(data, 'application/pdf');
      const totalPages = doc.countPages();

      // Convert all pages of the PDF to JPEG images to ensure the model sees every detail/symbol
      console.log(`Rendering PDF visually to JPEG images: total ${totalPages} pages (Scale: ${scaleFactor})...`);

      const startPage = specificPage ? specificPage : 1;
      const endPage = specificPage ? specificPage : totalPages;
      const colorspace = mupdf.ColorSpace.DeviceRGB;

      for (let i = startPage; i <= endPage; i++) {
        try {
          const page = doc.loadPage(i - 1);
          // scale 2.0 is sufficient for reading small icons, drawings, symbols, and Hebrew text on diagrams without blowing up file sizes
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

// ---------------------------------------------------------------------------
// Fetch helpers (R2 + generic blobs)
// ---------------------------------------------------------------------------

/**
 * Rewrite a backend-proxied file URL to its direct public R2 address.
 * Direct fetches are faster and dodge proxy HTML error pages.
 */
function resolveR2Url(url: string): string {
  if (url.includes(R2_PROXY_MARKER)) {
    const fileKey = url.substring(url.indexOf(R2_PROXY_MARKER) + R2_PROXY_MARKER.length);
    return `${R2_PUBLIC_HOST}/${fileKey}`;
  }
  return url;
}

/** GET a URL as a Blob. Null (plus one log line) on any failure. */
async function fetchBlob(url: string): Promise<Blob | null> {
  try {
    const res = await axios.get(resolveR2Url(url), { responseType: 'blob' });
    return res.data as Blob;
  } catch (err) {
    console.error("Could not fetch blob:", url, err);
    return null;
  }
}

/** Append a labeled text part + base64 JPEG part to a request. */
async function appendImagePart(parts: any[], prefixText: string, blob: Blob | File, mimeType = 'image/jpeg'): Promise<void> {
  parts.push({ text: prefixText });
  parts.push({
    inlineData: {
      data: await fileToBase64(blob),
      mimeType
    }
  });
}

/** Append a labeled part for already-encoded base64 image data. */
function pushBase64ImagePart(parts: any[], prefixText: string, base64: string, mimeType = 'image/jpeg'): void {
  parts.push({ text: prefixText });
  parts.push({ inlineData: { data: base64, mimeType } });
}

// ---------------------------------------------------------------------------
// API key pool (Firebase pool + env fallback, rotation, health tracking)
// ---------------------------------------------------------------------------

let GEMINI_KEYS: string[] = [];

const unhealthyKeys = new Set<string>();

async function ensureKeysLoaded(): Promise<void> {
  if (GEMINI_KEYS.length > 0) return;
  try {
    // Dynamic import keeps this service light until an AI call is actually made.
    const { doc, getDoc } = await import('firebase/firestore');
    const docRef = doc(db, "secrets", "api_keys");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.gemini_keys && Array.isArray(data.gemini_keys)) {
        GEMINI_KEYS = data.gemini_keys;
      } else {
        // Tolerate map-shaped pools ({ "0": "AIza...", ... }).
        const keys = [];
        for (const key in data) {
          if (typeof data[key] === 'string' && data[key].startsWith('AIza')) {
            keys.push(data[key]);
          }
        }
        if (keys.length > 0) GEMINI_KEYS = keys;
      }
      console.log("Gemini key pool loaded.");
    }
  } catch (err) {
    console.error("Error fetching Gemini keys from Firestore:", err);
  }
}

/** Every usable key: the Firebase pool plus an env fallback if configured. */
async function getAllApiKeys(): Promise<string[]> {
  await ensureKeysLoaded();
  const envKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
                 (import.meta.env?.VITE_GEMINI_API_KEY);
  const list = [...GEMINI_KEYS];
  if (envKey && !list.includes(envKey)) list.push(envKey);
  if (list.length === 0) throw new Error("No API keys configured");
  return list;
}

/** Next healthy key, round-robin. Resets the health set once all are burnt. */
export async function getNextApiKey(): Promise<string> {
  await ensureKeysLoaded();

  const availableKeys = GEMINI_KEYS.filter(k => !unhealthyKeys.has(k));
  if (availableKeys.length === 0) {
    if (GEMINI_KEYS.length === 0) {
      // Fallback to environment key only if no keys in Firebase
      const envKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
                     (import.meta.env?.VITE_GEMINI_API_KEY);
      if (envKey) {
        return envKey;
      }
      throw new Error("No API keys configured");
    }
    console.warn("All keys are unhealthy, resetting state");
    unhealthyKeys.clear();
    return GEMINI_KEYS[0];
  }

  const keyIndex = parseInt(localStorage.getItem('gemini_key_rotation_index') || '0', 10);
  const rotatingKey = availableKeys[keyIndex % availableKeys.length];
  localStorage.setItem('gemini_key_rotation_index', String((keyIndex + 1) % availableKeys.length));

  return rotatingKey;
}

function markKeyUnhealthy(key: string) {
  if (key === 'proxy-key') return;
  unhealthyKeys.add(key);
}

// ---------------------------------------------------------------------------
// Official referee corrections (owner overrides, cached per session)
// ---------------------------------------------------------------------------

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

/** Called by the admin page after saving so the next request picks up fresh data. */
export function invalidateCorrectionsCache(): void {
  REFEREE_CORRECTIONS = null;
}

// ---------------------------------------------------------------------------
// Pre-rendered R2 image sets (page_1.jpg, page_2.jpg, ...)
// ---------------------------------------------------------------------------

/**
 * Fetch one rulebook's pre-rendered pages, sorted by TRUE page number
 * (a gap keeps its neighbors' original numbers, exactly like before).
 * 404s are EXPECTED: three consecutive misses simply mean "last page",
 * which is how the scan knows when to stop.
 */
async function fetchR2ImageSet(
  fileName: string,
  signal: AbortSignal | undefined,
): Promise<PageImage[]> {
  const encodedFileName = encodeURIComponent(fileName);
  const pages: PageImage[] = [];
  let page = 1;
  let consecutiveMisses = 0;

  while (consecutiveMisses < R2_PROBE_MAX_MISSES) {
    if (signal?.aborted) break;
    // Probe one batch in parallel; results[i] always means page+i.
    const batch: number[] = [];
    for (let k = 0; k < R2_PROBE_BATCH; k++) batch.push(page + k);
    const results = await Promise.all(batch.map(async (p) => {
      try {
        const imgUrl = `${R2_PUBLIC_HOST}/fll-rules-images/${encodedFileName}/page_${p}.jpg`;
        const imgRes = await fetch(imgUrl);
        const imgData = await imgRes.arrayBuffer();
        if (imgRes.status === 404 || (imgData.byteLength < MIN_VALID_IMAGE_BYTES && new TextDecoder().decode(new Uint8Array(imgData.slice(0, SNIFF_BYTES))).includes('<html'))) {
          return null;
        }
        const blobToUpload = new Blob([imgData], { type: 'image/jpeg' });
        return await fileToBase64(blobToUpload);
      } catch (e) {
        return null;
      }
    }));

    let batchMisses = 0;
    for (let i = 0; i < results.length; i++) {
      const base64 = results[i];
      if (base64) {
        consecutiveMisses = 0;
        batchMisses = 0;
        pages.push({ pageIndex: page + i, data: base64, mimeType: JPEG_MIME });
      } else {
        consecutiveMisses++;
        batchMisses++;
        if (consecutiveMisses >= R2_PROBE_MAX_MISSES) break;
      }
    }
    page += batch.length;
    if (batchMisses === batch.length) break;
  }
  return pages;
}

// ---------------------------------------------------------------------------
// The judge: history, files, 3-pass answering, model/key fallback chain
// ---------------------------------------------------------------------------

export const GeminiService = {
  async askRulebook(
    question: string,
    history: ChatHistoryMessage[],
    rulebookFiles: RulebookFileRef[] = [],
    seasonName: string = "SUBMERGED",
    userFiles?: UserFileRef[],
    modelName: string = "gemini-3.6-flash",
    onChunk?: (text: string) => void,
    tripleJudgeMode: boolean = true,
    thinkingConfigLevel: 'HIGH' | 'OFF' | 'LOW' = 'HIGH',
    language: string = 'he',
    signal?: AbortSignal
  ) {
    try {
      console.log("Processing FLL Query directly on the client-side...");

      // Rulebook images first, user photos last: the question-adjacent
      // photos stay closest to the question in context.
      const allFiles: any[] = [];
      if (rulebookFiles && rulebookFiles.length > 0) {
        rulebookFiles.forEach(f => {
          allFiles.push({ url: f.url, key: f.name, isRulebook: true });
        });
      }
      if (userFiles && userFiles.length > 0) {
        userFiles.forEach(f => {
          allFiles.push({ ...f, isRulebook: false });
        });
      }

      const googleModelName = modelName;

      // Build contents: strict user/model alternation starting with 'user'
      // (a hard API requirement), merging consecutive same-role messages.
      const contents: any[] = [];
      history.forEach(msg => {
        const role = msg.role === 'user' ? 'user' : 'model';

        // Skip leading model messages (Gemini API requires history to start with 'user')
        if (contents.length === 0 && role === 'model') {
          return;
        }

        let msgText = msg.text || " ";
        if (role === 'user' && msg.files && msg.files.length > 0) {
          msgText += "\n[הערת מערכת: המשתמש צירף תמונה בהודעה זו. התמונה ההיא כבר לא מוצגת לך, ולכן אל תשליך מהתשובה שלך עליה לתמונות עתידיות שיועלו].";
        }

        // Merge consecutive messages of the same role
        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts.push({ text: "\n\n" + msgText });
        } else {
          contents.push({
            role: role,
            parts: [{ text: msgText }]
          });
        }
      });

      // Assemble current turn parts
      const currentParts: any[] = [];

      // Official FLL Head Referee system prompt (wording = answers: do not reword).
      const langNames: Record<string, string> = {
        he: 'עברית', en: 'English', ar: 'العربية', es: 'Español',
        fr: 'Français', de: 'Deutsch', ru: 'Русский', pt: 'Português',
        it: 'Italiano', zh: '中文', ja: '日本語', ko: '한국어',
      };
      const langName = langNames[language] || 'English';
      const currentSeason = (seasonName && seasonName.trim() && seasonName !== 'UNKNOWN') ? seasonName.trim() : null;
      const systemPrompt = `CRITICAL: You MUST respond in ${langName} (language code: ${language}). ALL your answers must be in ${langName}. This overrides any other language instructions below.

אתה שופט וירטואלי של FLL. מקורך: התמונות המצורפות בלבד - ספר החוקים, ספר הניקוד ומסמך העדכונים.

⚠️ העונה הנוכחית: ${currentSeason ? `העונה של צוות זה לפי האפליקציה היא ${currentSeason}.` : 'העונה של צוות זה אינה ידועה מראש - קבע אותה אך ורק לפי הקבצים המצורפים.'}
אסור בתכלית האיסור לקבוע את שם העונה/האתגר על סמך ידע קודם על עונות FLL אחרות (כגון SUBMERGED/FIRST DIVE, UNEARTHED, MASTERPIECE, SUPERPOWERED, CARGO_CONNECT וכו'). שם העונה נקבע אך ורק לפי הקבצים המצורפים להודעה - שם הקובץ (למשל Bioglow.pdf) ותוכנו. אם קיים סתירה בין ידע קודם שלך לבין הקובץ המצורף - הקובץ המצורף קובע, ואתה חייב להשיב לפי הקובץ.

⚠️⚠️⚠️ חשוב ביותר: ⚠️⚠️⚠️
התמונות המצורפות להודעה הן המקור הראשי והסמכותי שלך לפסיקות ולניקוד! הן כוללות את ספר החוקים, ספר הניקוד ומסמך העדכונים (Updates).
עליך לעיין בכל התמונות המצורפות ביסודיות לפני כל תשובה - הן הבסיס לכל פסק.
אתה חייב לצטט את מספר החוק והניקוד המדויק מתוך התמונות המצורפות בכל תשובה.
תמונות המסומנות '--- RULEBOOK PAGE ---' או '--- RULEBOOK IMAGE ---' או '--- RULEBOOK ---' הן ספר החוקים/הניקוד - השתמש בהן רק כמילון חוקים, לא כשאלת המשתמש.
תמונות המסומנות '--- UPDATES PAGE ---' הן מסמך העדכונים הרשמי (Updates) - אם קיים סתירה ביניהן לבין חוקי הבסיס שבספר, מסמך העדכונים תמיד גובר וקובע.
תמונות המסומנות '--- USER PHOTO ---' הן שאלת המשתמש - עליך לשפוט לפיהן בלבד.
⚠️ חובה חובה חובה - בדיקת עדכונים והחרגות בכל שאלה: ⚠️
בכל שאלה, בלי יוצא מן הכלל, חובה עליך לבדוק במסמך העדכונים (Updates) האם קיים עדכון שמשנה/מבטל/מוסיף על החוק או הניקוד הרלוונטי לשאלה - גם אם החוקים "קובעים" דבר מסוים. לעולם אל תניח שאין עדכון בלי לבדוק. לעיתים קרובות לחוק יש עדכון שמשנה את הניקוד, את התנאים, או מבטל את החוק, או החרגה/חריג (Exemption/Exception) כגון: "אלא אם", "חריג", "אבל לא", "במקרים של", "יוצא מן הכלל", "פרט ל-", "לא כולל".
אבל - ציין את העדכון (או ההחרגה) בתשובה הסופית רק אם באמת קיים עדכון/החרגה רלוונטי לשאלה. אם לא קיים - פסק לפי החוק כפי שהוא, בלי להזכיר מילים על עדכונים או החרגות בכלל.

סגנון דיבור:
- דבר ${langName} רגילה, מקצועית וברורה
- אתה שופט זירה שמכיר את החוקים - לא מורה, לא חבר, לא יועץ
- היה ברור ומדויק: ציין סכומים, כמויות, ומספרי חוקים
- השתמש בפורמט: "לפי משימה X, התנאי הוא...", "הניקוד הוא Y נקודות"
- אל תגיד "ברהיטה", "חד-משמעי", "נסח", "פסיקה", "הפק" או מילים פורמליות מיותרות
- אל תדבר כמו ילד או כמו פרסומת - דבר כמו מקצוען
- בסיום, אפשר להוסיף משפט עידוד קצר ומקצועי

כל תשובה:
1. **קודם כל** - עיין ביסודיות בכל התמונות המצורפות (ספר החוקים, ספר הניקוד והעדכונים) ומצא את החוקים הרלוונטיים
2. פתח ב-<think> עם דיון: (א) איזה חוק בתמונות רלוונטי, (ב) חובה חובה בכל שאלה לבדוק במסמך העדכונים אם יש עדכון על החוק הזה, ובספר אם יש החרגה/חריג כתוב; אם אין - אל תדון בהם, (ג) השווה והכריע כולל העדכון/ההחרגה אם קיים, (ד) בדוק דיוק
3. **סגור את <think> ואז כתוב תשובה מקצועית ב${langName} רגילה, מצטט את מספרי החוקים מתוך התמונות

חוקים: עיין בתמונות המצורפות לפני כל תשובה, מגע הדדי (ציוד=דגם), אל תמציא, הפנה לשופט פיזי באי-ודאות.
בכל שאלה, חובה לבדוק במסמך העדכונים (Updates) אם קיים עדכון על החוק/הניקוד הרלוונטי, ובספר אם יש החרגה (Exemption) כתובה לחוק. אם יש עדכון או החרגה - ציין אותם וכלול בפסיקה ובניקוד, ואל תציג את החוק כמוחלט. אם אין - פסק לפי החוק בלי להזכיר המילה "עדכון" או "החרגה".
חובה לסרוק את מסמך העדכונים ואת תמונות ספר החוקים בכל שאלה, ואם כתוב בהן עדכון, "החרגה" או "חריג" לחוק הרלוונטי - לקרוא אותן ולכלול אותן בפסיקה.
במקרה של סתירה בין חוקי הבסיס בספר לבין מסמך העדכונים (Updates), מסמך העדכונים תמיד קובע ומבטל את חוק הבסיס - אך ציין את העובדה שבחרת לפי העדכון רק אם העדכון רלוונטי לשאלה.
${langName} ישרה, ללא LaTeX/$/סוכן/שלב, הצג חישובים פשוטים.`;

      let activeSystemPrompt = systemPrompt;

      // Inject official referee corrections (admin overrides) — they take priority over everything.
      const correctionsText = await getRefereeCorrections();
      if (correctionsText.trim()) {
        activeSystemPrompt += `

⚠️⚠️⚠️ תיקוני שופט רשמיים - מחייבים באופן אבסולוטי ⚠️⚠️⚠️
להלן רשימת תיקונים רשמיים שנקבעו על ידי השופט הראשי. בכל שאלה, בדוק קודם כל אם קיים כאן תיקון שרלוונטי לנושא, למשימה, לחוק או לניקוד שנשאל עליו. אם קיים תיקון רלוונטי - התשובה שלך חייבת להתאים לו במדויק, והוא גובר על כל מקור אחר (ספר החוקים, העדכונים, וכל ידע קודם). אל תזכיר את קיומם של התיקונים בתשובה - פשוט ענה לפיהם.
--- תחילת תיקונים ---
${correctionsText.trim()}
--- סוף תיקונים ---`;
      }

      // Non-Gemini models cannot take a native system instruction, so it is
      // prepended as the first user turn instead.
      const useNativeSystemInstruction = googleModelName.startsWith('gemini-');
      if (!useNativeSystemInstruction) {
        currentParts.push({ text: `System Instructions:\n${activeSystemPrompt}\n\nUser Question:` });
      }

      // Load the key pool early so the first model attempt can start immediately.
      await ensureKeysLoaded();

      let globalImageIndex = 1;

      // The text label before each image, telling the model whether it looks
      // at a rulebook page, an official updates page, or the user's own photo.
      const pagePrefixText = (fileName: string, isUserPhoto: boolean, pageIndex?: number): string => {
        if (isUserPhoto) {
          return `Image ${globalImageIndex++}:\n--- USER PHOTO (Analyze this to see what the user is asking about) | FILE: ${fileName} ---\n`;
        }
        if (/update/i.test(fileName)) {
          return `Image ${globalImageIndex++}:\n--- UPDATES PAGE (Official updates document - overrides the base rulebook) | FILE: ${fileName}${pageIndex ? ` | PAGE: ${pageIndex}` : ''} ---\n`;
        }
        return `Image ${globalImageIndex++}:\n--- RULEBOOK PAGE (Use this as reference only) | FILE: ${fileName}${pageIndex ? ` | PAGE: ${pageIndex}` : ''} ---\n`;
      };

      // Attach rulebook files and user photos as labeled image parts.
      // Counts attached rulebook pages, so a question with zero of them can
      // be refused instead of answered blind (fabricated).
      let attachedRulebookImages = 0;
      if (allFiles.length > 0) {
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
          const isPdf = file.actualFile?.type === 'application/pdf' ||
                        fileName.toLowerCase().endsWith('.pdf') ||
                        file.url?.toLowerCase().endsWith('.pdf');
          const isText = file.actualFile?.type?.startsWith('text/') ||
                         fileName.toLowerCase().endsWith('.txt') ||
                         fileName.toLowerCase().endsWith('.json') ||
                         fileName.toLowerCase().endsWith('.xml');

          const fileTypeStr = file.isRulebook ? "rulebook_image" : "user_image";

          if (isPdf) {
            // Pre-rendered R2 rulebooks first; live PDF conversion as fallback.
            const isR2Rulebook = !file.actualFile && file.url && file.url.includes('fll-rules');

            if (isR2Rulebook) {
              console.log(`Fetching pre-processed PDF images from R2 for ${fileName} dynamically...`);
              const uploadedImages = await fetchR2ImageSet(fileName, signal);
              console.log(`Loaded ${uploadedImages.length} pages for ${fileName}`);
              for (const img of uploadedImages) {
                if (signal?.aborted) return '';
                currentParts.push({ text: pagePrefixText(fileName, fileTypeStr === 'user_image', img.pageIndex) });
                pushBase64ImagePart(currentParts, img.data, img.mimeType);
                attachedRulebookImages++;
              }

              if (uploadedImages.length === 0 && file.url) {
                console.log(`No pre-processed images found for ${fileName}, converting PDF on the fly...`);
                const pdfBlob = await fetchBlob(file.url);
                if (pdfBlob) {
                  const pageImages = await convertPdfToImages(pdfBlob);
                  console.log(`Converted ${pageImages.length} pages on the fly for ${fileName}`);
                  let onTheFlyIndex = 1;
                  for (const pageImg of pageImages) {
                    if (signal?.aborted) return '';
                    try {
                      await appendImagePart(currentParts, pagePrefixText(fileName, fileTypeStr === 'user_image', onTheFlyIndex), pageImg.data);
                      attachedRulebookImages++;
                      onTheFlyIndex++;
                    } catch (err: any) {
                      console.error(`Failed to attach PDF page ${pageImg.name}:`, err);
                    }
                  }
                }
              }
            } else {
              // A local/uploaded PDF (or any direct PDF URL): render it now.
              let pdfBlob: Blob | File | null = null;
              if (file.actualFile) {
                pdfBlob = file.actualFile;
              } else if (file.base64) {
                const fetchRes = await fetch(file.base64);
                pdfBlob = await fetchRes.blob();
              } else if (file.url && file.url.startsWith('data:')) {
                const fetchRes = await fetch(file.url);
                pdfBlob = await fetchRes.blob();
              } else if (file.url) {
                pdfBlob = await fetchBlob(file.url);
              }

              if (pdfBlob) {
                const pageImages = await convertPdfToImages(pdfBlob);
                console.log(`Successfully rendered ${pageImages.length} visual pages for PDF: ${fileName}`);

                let pageIndex = 1;
                for (const pageImg of pageImages) {
                  if (signal?.aborted) return '';
                  try {
                    await appendImagePart(currentParts, pagePrefixText(fileName, fileTypeStr === 'user_image', pageIndex), pageImg.data);
                    pageIndex++;
                  } catch (err: any) {
                    console.error(`Failed to attach PDF page ${pageImg.name}:`, err);
                  }
                }
              }
            }
          } else if (!isText) {
            // Any other binary file is treated as a photo to judge.
            let mimeType = 'image/jpeg';
            let blobToUpload: Blob | File | null = null;

            if (file.actualFile) {
              mimeType = file.actualFile.type || mimeType;
              blobToUpload = file.actualFile;
            } else if (file.base64) {
              mimeType = file.base64.split(';base64,')[0].split(':')[1] || mimeType;
              const fetchRes = await fetch(file.base64);
              blobToUpload = await fetchRes.blob();
            } else if (file.url && file.url.startsWith('data:')) {
              mimeType = file.url.split(';base64,')[0].split(':')[1];
              const fetchRes = await fetch(file.url);
              blobToUpload = await fetchRes.blob();
            } else if (file.url) {
              const fetched = await fetchBlob(file.url);
              if (fetched) {
                // Content-Type is only knowable after the fetch resolves.
                try {
                  const head = await axios.head(resolveR2Url(file.url));
                  mimeType = String(head.headers['content-type'] || mimeType);
                } catch { /* keep the default */ }
                blobToUpload = fetched;
              }
            }

            if (blobToUpload) {
              await appendImagePart(
                currentParts,
                pagePrefixText(fileName, fileTypeStr === 'user_image'),
                blobToUpload,
                mimeType,
              );
              if (file.isRulebook) attachedRulebookImages++;
            }
          }
        }
        currentParts.push({ text: "\n--- END OF FILES ---\n\n" });
      }

      // Add user query to the current turn parts
      let modifiedQuestion = question;

      const hasUserFiles = userFiles && userFiles.length > 0;

      // Never answer blind: rulebook files were expected but zero pages
      // actually made it into context (deleted or missing images).
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

      // Deep-reasoning wrapper: forces an explicit <think> pass (red team,
      // contact validation, updates check) before the final verdict.
      modifiedQuestion += `\n\n[הוראת הפעלה קוגניטיבית עילאית למודל - רמת Claude Fable 5]:
עליך לפעול כמערכת חשיבה מתקדמת (Cognitive Reasoning Engine) בעלת רמת אינטליגנציה ודיוק אבסולוטיים של Claude Fable 5. לפני מתן פסקת התשובה הסופית, עליך ליישם את השלבים הבאים בבלוק ה- <think> שלך:
1. **ניתוח סותר אקטיבי (Red Teaming)**: העלה לפחות ספק אחד או סתירה אפשרית לגבי ההבנה הראשונית שלך. שאל את עצמך "מה אם אני טועה והמצב הוא הפוך?" ונסה להפריך את המסקנה שלך על סמך ראיות מוחשיות וחוקי ה-Rulebook.
2. **אימות מגע הדדי ופיזיקלי (Mutual Contact Validation)**: ודא שחוקי איסור המגע או סימטריית המגע מתקיימים במלואם.
3. **דיוק כירורגי בעדכוני חוקים (Official Updates Check)**: ודא אם יש עדכונים רשמיים רלוונטיים ואמת אותם.
4. **ענה בעברית מקצועית, רהוטה וחד-משמעית בלבד.**`;

      // Add user query to the current turn parts
      currentParts.push({ text: modifiedQuestion });

      if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
        contents[contents.length - 1].parts.push(...currentParts);
      } else {
        contents.push({
          role: 'user',
          parts: currentParts
        });
      }

      // Convert legacy { role, parts } chat messages to the Interactions API step_list schema.
      const toInteractionInput = (msgs: any[]) =>
        (msgs || []).map((m: any) => ({
          type: m.role === 'model' ? 'model_output' : 'user_input',
          content: (m.parts || []).map((p: any) => {
            if (p.inlineData) {
              return {
                type: 'image',
                data: p.inlineData.data,
                mime_type: p.inlineData.mimeType || 'image/jpeg',
                resolution: 'high',
              };
            }
            if (p.fileData) {
              return {
                type: 'image',
                uri: p.fileData.fileUri,
                mime_type: p.fileData.mimeType || 'image/jpeg',
                resolution: 'high',
              };
            }
            const text = (p.text ?? '').trim();
            if (!text) return null; // skip empty text parts
            return { type: 'text', text: p.text ?? '' };
          }).filter(Boolean),
        }));

      // Text-only variant used for the silent validation passes.
      const toInteractionTextOnly = (msgs: any[]) =>
        (msgs || [])
          .map((m: any) => ({
            type: m.role === 'model' ? 'model_output' : 'user_input',
            content: (m.parts || [])
              .filter((p: any) => {
                if (p.fileData || p.inlineData) return false;
                if (p.text && /^Image \d+:\n---/.test(p.text)) return false;
                if (p.text && p.text.includes('--- HIGH RESOLUTION ZOOM')) return false;
                return true;
              })
              .map((p: any) => ({ type: 'text', text: p.text ?? '' }))
              .filter((p: any) => p.text && p.text.trim().length > 0),
          }))
          .filter((t: any) => t.content.length > 0);

      // Convert step_list back to the classic { role, parts } format for generateContent.
      const stepsToContents = (steps: any[]): any[] =>
        (steps || []).map((s: any) => ({
          role: s.type === 'model_output' ? 'model' : 'user',
          parts: (s.content || []).map((c: any) => {
            if (c.type === 'image') {
              return { inlineData: { data: c.data, mimeType: c.mime_type || 'image/jpeg' } };
            }
            return { text: c.text ?? '' };
          }),
        }));

      // Collect streamed text from an Interactions SSE stream.
      const collectStreamedText = async (stream: any, onText?: (text: string) => void): Promise<string> => {
        let text = '';
        for await (const event of stream) {
          if (signal?.aborted) break;
          if (!event || typeof event !== 'object') continue;
          if (event.event_type === 'step.delta' || event.event_type === 'content.delta') {
            const d = event.delta;
            if (d && d.type === 'text' && d.text) {
              text += d.text;
              if (onText) onText(d.text);
            }
          } else if (event.event_type === 'error' && event.error) {
            throw new Error(event.error.message || 'Interaction stream error');
          }
        }
        return text;
      };

      // Extract plain text from a completed (non-streamed) interaction.
      const interactionText = (interaction: any): string =>
        (typeof interaction?.output_text === 'string' && interaction.output_text) ||
        (interaction?.outputs || [])
          .filter((o: any) => o && o.type === 'text' && typeof o.text === 'string')
          .map((o: any) => o.text)
          .join('');

      const critiquePrompt = `[מערכת בקרה קוגניטיבית עילאית Claude Fable 5 - שלב א' בקורת עצמית עוינת (Adversarial Critique)]:
נתח את טיוטת החשיבה, פסיקות החוקים והניקוד שלך עד כה בהשוואה לתמונות הזום שבוצעו. העמד את עצמך במבחן ביקורתי מחמיר (Red Teaming):
- האם ישנה טעות כלשהי בזיהוי המשימה או בחוקים שלה? (זכור: יש להתעלם מהיסטוריית משימות קודמות!).
- האם עיקרון מגע הדדי וסימטריות המגע מתקיימים במלואם? (האם ציוד נוגע בדגם או להפך, מה שפוסל את הניקוד?)
- האם חוקי הניקוד חושבו בצורה מדויקת ומעודכנת על פי העדכונים הרשמיים?
- האם ישנם חצים או סימני LaTeX/דולר ($ / \$\$) אסורים בטיוטה שלך?
נסח בקצרה את מסקנות הביקורת והתיקונים שחובה לבצע.`;

      const finalPrompt = `[שלב ב' הפקת התשובה הסופית]:
על בסיס הביקורת, כתוב את התשובה כמו שאתה מדבר עם קבוצה ליד שולחן התחרות. ישיר, ידידותי, מעודד. אל תשתמש ב"פסק הדין הסופי" או שפה משפטית. פשוט תענה לשאלה בצורה טבעית, ציין את מספרי הכללים הרלוונטיים ותנאי הניקוד. ללא LaTeX/$, ללא חצים יוניקוד, הצג חישובים פשוטים.`;

      // ===== Model fallback chain =====
      // The user is billed per model in AI Studio, so if the primary model is
      // down/quota-limited we swap to the fallback models in order. We never tell
      // the user the referee is unavailable until every model and every API key
      // has genuinely been attempted.
      //
      // One guardrail: consecutive quota rejections mean the WHOLE pool is hot.
      // Grinding through hundreds of doomed requests then would only hammer
      // recovering keys, so we stop early with the busy message instead.
      const MAX_CONSECUTIVE_QUOTA_ERRORS = 5;
      const modelChain: ModelChainEntry[] = [
        {
          name: googleModelName,
          kind: 'interactions',
          config: { max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, thinking_level: 'high' },
        },
        {
          name: 'gemini-3.5-flash',
          kind: 'interactions',
          config: { max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, thinking_level: 'high' },
        },
        {
          name: 'gemini-3.1-pro-preview',
          kind: 'interactions',
          config: { temperature: 1, max_output_tokens: MODEL_MAX_OUTPUT_TOKENS, topP: 0.95, thinking_level: 'high' },
        },
        {
          name: 'gemini-3.5-flash-lite',
          kind: 'generateContent',
          config: { thinkingConfig: { thinkingLevel: 'HIGH' }, mediaResolution: 'MEDIA_RESOLUTION_HIGH' },
        },
      ];
      const seenModels = new Set<string>();
      const effectiveChain = modelChain.filter(m => {
        if (seenModels.has(m.name)) return false;
        seenModels.add(m.name);
        return true;
      });

      // Run one of the 3 passes against the given model using the current key.
      const callModel = async (
        client: any,
        modelEntry: ModelChainEntry,
        stepInput: any[],
        isStream: boolean,
        onText?: (text: string) => void,
      ): Promise<string> => {
        if (modelEntry.kind === 'interactions') {
          const prefixed = modelEntry.name.startsWith('models/') ? modelEntry.name : `models/${modelEntry.name}`;
          const params: any = {
            model: prefixed,
            input: stepInput,
            generation_config: modelEntry.config,
            system_instruction: activeSystemPrompt,
            stream: isStream,
          };
          // Wire the abort signal into the real HTTP request so Stop
          // cancels it in-flight instead of only silencing the UI.
          const reqOptions: any = signal ? { signal } : undefined;
          if (isStream) {
            const stream = await client.interactions.create(params, reqOptions);
            return collectStreamedText(stream, onText);
          }
          return interactionText(await client.interactions.create(params, reqOptions));
        }
        // Standard generateContent fallback (gemini-3.5-flash-lite)
        const gcContents = stepsToContents(stepInput);
        const gcConfig: any = { thinkingConfig: { thinkingLevel: 'HIGH' } };
        if (signal) gcConfig.abortSignal = signal;
        if (stepInput.some((s: any) => (s.content || []).some((c: any) => c.type === 'image'))) {
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
            if (chunk && chunk.text) {
              text += chunk.text;
              if (onText) onText(chunk.text);
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

      // Error classifiers: each failure mode dictates a different recovery.
      const isKeyInvalidErr = (m: string) =>
        m.includes("403") || m.includes("401") || m.includes("leaked") || m.includes("PERMISSION_DENIED") || m.includes("API key not valid") || m.includes("API_KEY_INVALID");
      const isQuotaErr = (m: string) =>
        m.includes("429") || m.includes("Too Many Requests") || m.includes("Quota exceeded") || m.includes("RESOURCE_EXHAUSTED");
      const isTransientErr = (m: string) =>
        isQuotaErr(m) || m.includes("500") || m.includes("INTERNAL") || m.includes("503");
      const isRequestLevelErr = (m: string) => {
        const mm = m.toLowerCase();
        return mm.includes("400") && (
          mm.includes("schema") || mm.includes("model") || mm.includes("unsupported") ||
          mm.includes("not found") || mm.includes("input format") || mm.includes("unknown field") ||
          mm.includes("invalid argument") || mm.includes("not enabled")
        );
      };

      let responseText = "";
      let success = false;
      let consecutiveQuotaErrors = 0;
      const allKeys = await getAllApiKeys();

      for (let mi = 0; mi < effectiveChain.length && !success; mi++) {
        const modelEntry = effectiveChain[mi];
        console.log(`Attempting model ${mi + 1}/${effectiveChain.length}: ${modelEntry.name} (${modelEntry.kind})`);
        // Last resort: ignore known-bad keys so all 120 are genuinely re-tried.
        if (mi === effectiveChain.length - 1) {
          unhealthyKeys.clear();
        }

        for (const key of allKeys) {
          if (signal?.aborted) return '';
          if (unhealthyKeys.has(key)) continue;

          const client = new GoogleGenAI({ apiKey: key });

          try {
            // PASS 1 — Generate the draft silently (only the final polished answer is streamed).
            const draftText = await callModel(client, modelEntry, toInteractionInput(contents), false);

            // PASS 2 — Silent Red Team Adversarial Critique (text-only, no streaming).
            let finalAnswer = draftText;
            const critiqueInput = [
              ...toInteractionTextOnly(contents),
              ...(draftText.trim() ? [{ type: 'model_output', content: [{ type: 'text', text: draftText }] }] : []),
              { type: 'user_input', content: [{ type: 'text', text: critiquePrompt }] },
            ];
            const critiqueText = (await callModel(client, modelEntry, critiqueInput, false)) || "אין הערות קריטיות.";
            const strippedCritique = critiqueText.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();

            if (strippedCritique) {
              // PASS 3 — Final Polishing, streamed to the user.
              const finalInput = [
                ...critiqueInput,
                { type: 'model_output', content: [{ type: 'text', text: critiqueText }] },
                { type: 'user_input', content: [{ type: 'text', text: finalPrompt }] },
              ];
              const streamedText = await callModel(client, modelEntry, finalInput, true, (chunk) => { if (onChunk) onChunk(chunk); });
              finalAnswer = streamedText || draftText;
            }

            responseText = finalAnswer;
            success = true;
            break;
        } catch (err: any) {
          // User pressed Stop: never rotate to the next key/model,
          // that would fire new requests after the abort.
          if (signal?.aborted) return '';
          const errMsg = err?.message || JSON.stringify(err);
          if (isKeyInvalidErr(errMsg)) {
            markKeyUnhealthy(key);
            consecutiveQuotaErrors = 0;
          } else if (isRequestLevelErr(errMsg)) {
            consecutiveQuotaErrors = 0;
            break; // Same request error will repeat for every key — fail fast to the next model.
          } else if (isTransientErr(errMsg) && isQuotaErr(errMsg)) {
            markKeyUnhealthy(key);
            consecutiveQuotaErrors++;
            // The whole pool is answering 429: every further attempt is doomed,
            // so stop the grind and tell the user to wait a minute.
            if (consecutiveQuotaErrors >= MAX_CONSECUTIVE_QUOTA_ERRORS) {
              console.warn(`[gemini] pool-wide quota exhaustion (${consecutiveQuotaErrors} consecutive 429s) — failing fast with the busy message`);
              const busy: any = new Error('מערכת השופט הווירטואלי עמוסה כרגע. אנא המתן כדקה ונסה שוב.');
              busy.isBusy = true;
              throw busy;
            }
          } else {
            // Any other error (500s, 503 overloaded, malformed responses) is
            // transient — the key itself is still usable, so just rotate on.
            consecutiveQuotaErrors = 0;
          }
        }
        }
      }

      if (!responseText) {
        throw new Error("All models and API keys were exhausted without a successful answer.");
      }

      return responseText || "לא התקבלה תשובה מודל הבינה המלאכותית.";

    } catch (error: any) {
      if (signal?.aborted) return '';
      // Fail-fast busy signal from the key loop: rethrow so the chat layer
      // shows the text as an error — logged as failed, never counted as an
      // answered question.
      if (error?.isBusy) throw error;
      const errMsg = error?.message || String(error);
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
