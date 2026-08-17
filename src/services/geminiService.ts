import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Cache for extracted rulebook text
const rulebookCache = new Map<string, string>();

// Lazy MuPDF loader. MuPDF renders PDF pages to JPEG in WASM without relying on
// ReadableStream/canvas readback, so it is safe even in environments where pdf.js fails.
let mupdfLibPromise: Promise<typeof import('mupdf')> | null = null;
async function getMupdfLib(): Promise<typeof import('mupdf')> {
  if (!mupdfLibPromise) {
    (globalThis as any).$libmupdf_wasm_Module = { locateFile: () => '/mupdf-wasm.wasm' };
    mupdfLibPromise = import('mupdf');
  }
  return mupdfLibPromise;
}

// Extract plain text from PDF bytes using MuPDF (maxPages limits runaway PDFs)
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

async function extractTextFromUrl(url: string): Promise<string> {
  if (rulebookCache.has(url)) return rulebookCache.get(url)!;

  try {
    let response = await axios.get(url, { responseType: 'arraybuffer' });
    let contentType = String(response.headers['content-type'] || '');

    // Check if what we got is actually HTML (e.g. from an error page, redirect, or SPA fallback)
    const textPreview = new TextDecoder().decode(new Uint8Array(response.data.slice(0, 100)));
    if (textPreview.trim().startsWith('<!doctype') || textPreview.trim().startsWith('<html') || contentType.includes('text/html')) {
      console.warn("API returned HTML instead of a file. Falling back to direct R2 public bucket download for:", url);
      // Extract the key
      const fileKey = url.includes('/api/r2/file/') ? url.substring(url.indexOf('/api/r2/file/') + '/api/r2/file/'.length) : url;
      const fallbackUrl = `https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev/${fileKey}`;
      response = await axios.get(fallbackUrl, { responseType: 'arraybuffer' });
      contentType = String(response.headers['content-type'] || 'application/pdf');
    }

    const fileName = url.split('/').pop()?.split('?')[0] || 'file';

    let text = "";

    if (contentType.includes('application/pdf') || fileName.toLowerCase().endsWith('.pdf')) {
      text = await extractPdfText(new Uint8Array(response.data), 50);
    } else {
      // Assume text-based
      text = new TextDecoder().decode(response.data);
    }

    rulebookCache.set(url, text);
    return text;
  } catch (error) {
    console.error(`Error extracting text from ${url}:`, error);
    return "";
  }
}

// Convert a File or Blob to a base64 string
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

// Local text extractor for uploaded custom files (PDF/TXT)
export async function extractTextFromFile(file: File): Promise<string> {
  try {
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      return await extractPdfText(new Uint8Array(arrayBuffer), 50);
    } else if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.json')) {
      return await file.text();
    }
  } catch (err) {
    console.error("Error extracting text from file:", file.name, err);
  }
  return "";
}

// Convert PDF pages to images (JPEG Blobs) using MuPDF WASM
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

// Client-side 4K Zoom & Crop implementation for images
async function cropAndScaleImage(imageBlob: Blob, xPercent: number, yPercent: number, wPercent: number, hPercent: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      // Source dimensions
      const sx = (xPercent / 100) * img.width;
      const sy = (yPercent / 100) * img.height;
      const sw = (wPercent / 100) * img.width;
      const sh = (hPercent / 100) * img.height;

      // Ensure dimensions are valid
      if (sw <= 0 || sh <= 0) return resolve(null);

      // Target 4K resolution mapping (scaling up the crop so the model gets maximum detail)
      let scale = 1;
      const maxDim = Math.max(sw, sh);
      if (maxDim > 0 && maxDim < 3840) {
         scale = Math.min(3840 / maxDim, 4); // max scale by 4x to avoid browser crashing
      }

      canvas.width = sw * scale;
      canvas.height = sh * scale;

      // Draw the cropped portion scaled up
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((b) => resolve(b), 'image/jpeg', 1.0);
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(imageBlob);
  });
}

// Client-side secure API keys pool
let GEMINI_KEYS: string[] = [];

const unhealthyKeys = new Set<string>();

async function ensureKeysLoaded(): Promise<void> {
  if (GEMINI_KEYS.length > 0) return;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const docRef = doc(db, "secrets", "api_keys");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      console.log("Firebase API keys document data:", data);
      if (data.gemini_keys && Array.isArray(data.gemini_keys)) {
        GEMINI_KEYS = data.gemini_keys;
      } else {
        // Check if it's stored as fields like 0: "key", 1: "key" or any string keys
        const keys = [];
        for (const key in data) {
          if (typeof data[key] === 'string' && data[key].startsWith('AIza')) {
            keys.push(data[key]);
          }
        }
        if (keys.length > 0) GEMINI_KEYS = keys;
      }
      console.log("Loaded GEMINI_KEYS from Firebase:", GEMINI_KEYS.length, "keys.");
    }
  } catch (err) {
    console.error("Error fetching Gemini keys from Firestore:", err);
  }
}

// Full snapshot of every available API key (the pool from Firebase + any env fallback).
async function getAllApiKeys(): Promise<string[]> {
  await ensureKeysLoaded();
  const envKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
                 (import.meta.env?.VITE_GEMINI_API_KEY);
  const list = [...GEMINI_KEYS];
  if (envKey && !list.includes(envKey)) list.push(envKey);
  if (list.length === 0) throw new Error("No API keys configured");
  return list;
}

async function getNextApiKey(): Promise<string> {
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
  console.warn(`Marking API key as unhealthy: ${key.substring(0, 10)}...`);
  unhealthyKeys.add(key);
}

export const GeminiService = {
  async askRulebook(
    question: string,
    history: { role: 'user' | 'model', text: string, files?: any[] }[],
    rulebookFiles: { name: string, url: string }[] = [],
    seasonName: string = "SUBMERGED",
    userFiles?: { url: string, key: string, base64?: string, actualFile?: File }[],
    modelName: string = "gemini-3.7-flash",
    onChunk?: (text: string) => void,
    tripleJudgeMode: boolean = true,
    thinkingConfigLevel: 'HIGH' | 'OFF' | 'LOW' = 'HIGH',
    language: string = 'he',
    signal?: AbortSignal
  ) {
    try {
      console.log("Processing FLL Query directly on the client-side...");

      // Merge rulebookFiles first, then userFiles last, so they are processed in order and user's photos are closest to the question
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

      // 2. Map chosen model to modern, valid GoogleGenAI API options
      const activeModel = modelName;

      // 3. Build contents array representing conversation history for a multi-turn chat
      const contents: any[] = [];
      
      // Populate history and ensure strict alternating roles starting with 'user'
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

      // 4. Set up official FLL Head Referee system prompt
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

      // Use the requested model directly
      const googleModelName = activeModel;

      // If we are calling a model that does not support system instructions natively, we prepend it.
      const useNativeSystemInstruction = googleModelName.startsWith('gemini-');
      if (!useNativeSystemInstruction) {
        currentParts.push({ text: `System Instructions:\n${activeSystemPrompt}\n\nUser Question:` });
      }

      // Load the key pool early so the first model attempt can start immediately.
      await ensureKeysLoaded();

      let globalImageIndex = 1;

      // Build the text prefix that precedes each attached image so the model can tell
      // user photos, rulebook pages, and official updates pages apart.
      const pagePrefixText = (fileName: string, isUserPhoto: boolean, pageIndex?: number): string => {
        if (isUserPhoto) {
          return `Image ${globalImageIndex++}:\n--- USER PHOTO (Analyze this to see what the user is asking about) | FILE: ${fileName} ---\n`;
        }
        if (/update/i.test(fileName)) {
          return `Image ${globalImageIndex++}:\n--- UPDATES PAGE (Official updates document - overrides the base rulebook) | FILE: ${fileName}${pageIndex ? ` | PAGE: ${pageIndex}` : ''} ---\n`;
        }
        return `Image ${globalImageIndex++}:\n--- RULEBOOK PAGE (Use this as reference only) | FILE: ${fileName}${pageIndex ? ` | PAGE: ${pageIndex}` : ''} ---\n`;
      };

      // Extract and append text or base64 components from allFiles
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
            // Check if it's a pre-processed R2 rulebook
            const isR2Rulebook = !file.actualFile && file.url && file.url.includes('fll-rules');
            
            if (isR2Rulebook) {
              console.log(`Fetching pre-processed PDF images from R2 for ${fileName} dynamically...`);
              const uploadedImages: { pageIndex: number; inlineData: any }[] = [];
              let pageIndex = 1;
              let consecutiveMisses = 0;
              const maxMisses = 3;
              // URL-encode the filename for R2 (handles Hebrew chars)
              const encodedFileName = encodeURIComponent(fileName);
              
              while (consecutiveMisses < maxMisses) {
                if (signal?.aborted) return '';
                try {
                  const imgUrl = `https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev/fll-rules-images/${encodedFileName}/page_${pageIndex}.jpg`;
                  const imgRes = await fetch(imgUrl);
                  const imgData = await imgRes.arrayBuffer();
                  
                  if (imgRes.status === 404 || (imgData.byteLength < 500 && new TextDecoder().decode(new Uint8Array(imgData.slice(0, 100))).includes('<html'))) {
                    consecutiveMisses++;
                    pageIndex++;
                    continue;
                  }
                  
                  consecutiveMisses = 0;
                  const blobToUpload = new Blob([imgData], { type: 'image/jpeg' });

                  uploadedImages.push({
                    pageIndex,
                    inlineData: {
                      data: await fileToBase64(blobToUpload),
                      mimeType: 'image/jpeg'
                    }
                  });
                  pageIndex++;
                } catch (e) {
                  consecutiveMisses++;
                  pageIndex++;
                }
              }
              
console.log(`Loaded ${uploadedImages.length} pages for ${fileName}`);

              if (uploadedImages.length === 0 && file.url) {
                console.log(`No pre-processed images found for ${fileName}, converting PDF on the fly...`);
                try {
                  let fetchUrl = file.url;
                  if (fetchUrl.includes('/api/r2/file/')) {
                    const fileKey = fetchUrl.substring(fetchUrl.indexOf('/api/r2/file/') + '/api/r2/file/'.length);
                    fetchUrl = `https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev/${fileKey}`;
                  }
                  const res = await axios.get(fetchUrl, { responseType: 'blob' });
                  const pdfBlob = res.data;
                  if (pdfBlob) {
                    const pageImages = await convertPdfToImages(pdfBlob);
                    console.log(`Converted ${pageImages.length} pages on the fly for ${fileName}`);
                    let pageIndex = 1;
                    for (const pageImg of pageImages) {
                      if (signal?.aborted) return '';
                      try {
                        const prefixText = pagePrefixText(fileName, fileTypeStr === 'user_image', pageIndex);
                        currentParts.push({ text: prefixText });
                        currentParts.push({
                          inlineData: {
                            data: await fileToBase64(pageImg.data),
                            mimeType: 'image/jpeg'
                          }
                        });
                        pageIndex++;
                      } catch (err: any) {
                        console.error(`Failed to attach PDF page ${pageImg.name}:`, err);
                      }
                    }
                  }
                } catch (err) {
                  console.error(`Failed to fetch/convert PDF for ${fileName}:`, err);
                }
              }

              uploadedImages
                .sort((a: any, b: any) => a.pageIndex - b.pageIndex)
                .forEach((res: any) => {
                  const prefixText = pagePrefixText(fileName, fileTypeStr === 'user_image', res.pageIndex);
                  currentParts.push({ text: prefixText });
                  currentParts.push({ inlineData: res.inlineData });
                });
            } else {
              // Fetch the PDF blob to convert pages to visual images for Gemma
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
                try {
                  let fetchUrl = file.url;
                  if (fetchUrl.includes('/api/r2/file/')) {
                    const fileKey = fetchUrl.substring(fetchUrl.indexOf('/api/r2/file/') + '/api/r2/file/'.length);
                    fetchUrl = `https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev/${fileKey}`;
                  }
                  const res = await axios.get(fetchUrl, { responseType: 'blob' });
                  pdfBlob = res.data;
                } catch (err) {
                  console.error("Could not fetch PDF URL for visual rendering:", file.url, err);
                }
              }
  
              if (pdfBlob) {
                const pageImages = await convertPdfToImages(pdfBlob);
                console.log(`Successfully rendered ${pageImages.length} visual pages for PDF: ${fileName}`);
                
                let pageIndex = 1;
                for (const pageImg of pageImages) {
                  if (signal?.aborted) return '';
                  try {
                    const prefixText = pagePrefixText(fileName, fileTypeStr === 'user_image', pageIndex);
                    currentParts.push({ text: prefixText });
                    currentParts.push({
                      inlineData: {
                        data: await fileToBase64(pageImg.data),
                        mimeType: 'image/jpeg'
                      }
                    });
                    pageIndex++;
                  } catch (err: any) {
                    console.error(`Failed to attach PDF page ${pageImg.name}:`, err);
                  }
                }
              }
            }
          } else if (!isText) {
            // Treat as media/binary file (images)
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
              try {
                let fetchUrl = file.url;
                if (fetchUrl.includes('/api/r2/file/')) {
                  const fileKey = fetchUrl.substring(fetchUrl.indexOf('/api/r2/file/') + '/api/r2/file/'.length);
                  fetchUrl = `https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev/${fileKey}`;
                }
                const res = await axios.get(fetchUrl, { responseType: 'blob' });
                mimeType = String(res.headers['content-type'] || mimeType);
                blobToUpload = res.data;
              } catch (err) {
                console.error("Could not fetch media URL for upload:", file.url, err);
              }
            }

            if (blobToUpload) {
              const prefixText = pagePrefixText(fileName, fileTypeStr === 'user_image');
              currentParts.push({ text: prefixText });
              currentParts.push({
                inlineData: {
                  data: await fileToBase64(blobToUpload),
                  mimeType
                }
              });
            }
          }
        }
        currentParts.push({ text: "\n--- END OF FILES ---\n\n" });
      }

      // Extract URL context using Jina Reader API if URLs are present in the question
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const urls = question.match(urlRegex);
      let urlContextText = '';
      if (urls && urls.length > 0) {
        urlContextText += "\n\n[הערת מערכת: המשתמש סיפק קישורים. המערכת קראה את התוכן שלהם כדי לאפשר לך להתייחס אליו:]\n";
        for (const url of urls) {
          try {
            console.log(`Fetching context for URL: ${url}`);
            const jinaRes = await axios.get(`https://r.jina.ai/${url}`);
            if (typeof jinaRes.data === 'string') {
               urlContextText += `\n--- תוכן מהאתר ${url} ---\n${jinaRes.data.substring(0, 15000)}\n------------------------\n`;
            } else if (jinaRes.data && jinaRes.data.data && jinaRes.data.data.content) {
               urlContextText += `\n--- תוכן מהאתר ${url} ---\n${jinaRes.data.data.content.substring(0, 15000)}\n------------------------\n`;
            }
          } catch (err) {
            console.error(`Failed to fetch context for ${url}:`, err);
            urlContextText += `\n--- שגיאה בחילוץ תוכן מהאתר ${url} ---\n`;
          }
        }
      }

      // Add user query to the current turn parts
      let modifiedQuestion = question + urlContextText;

      const hasUserFiles = userFiles && userFiles.length > 0;
      if (hasUserFiles) {
        modifiedQuestion = `⚠️⚠️⚠️ [הנחיית שיפוט קריטית - ניתוח עצמאי נקי ללא הטיה] ⚠️⚠️⚠️
עליך לנתח את התמונה/קבצים שהועלו כעת במנותק ובנפרד לחלוטין מכל משימה, חוק או תמונה קודמת שדוברה בצ'אט (כמו משימה 5 או כל נושא קודם). אל תניח בשום אופן שהתמונה הזו קשורה אליהם!
בצע זיהוי אובייקטיבי ונקי של האובייקטים והדגמים המופיעים בתמונה הזו בפועל, והשב רק לפיה.

השאלה המקורית של המשתמש:
"${question}"`;
      }

      // Claude Fable 5 Cognitive Emulation Wrapper to enforce extreme reasoning depth functionally:
      modifiedQuestion += `\n\n[הוראת הפעלה קוגניטיבית עילאית למודל - רמת Claude Fable 5]:
עליך לפעול כמערכת חשיבה מתקדמת (Cognitive Reasoning Engine) בעלת רמת אינטליגנציה ודיוק אבסולוטיים של Claude Fable 5. לפני מתן פסקת התשובה הסופית, עליך ליישם את השלבים הבאים בבלוק ה- <think> שלך:
1. **ניתוח סותר אקטיבי (Red Teaming)**: העלה לפחות ספק אחד או סתירה אפשרית לגבי ההבנה הראשונית שלך. שאל את עצמך "מה אם אני טועה והמצב הוא הפוך?" ונסה להפריך את המסקנה שלך על סמך ראיות מוחשיות וחוקי ה-Rulebook.
2. **אימות מגע הדדי ופיזיקלי (Mutual Contact Validation)**: ודא שחוקי איסור המגע או סימטריית המגע מתקיימים במלואם.
3. **דיוק כירורגי בעדכוני חוקים (Official Updates Check)**: ודא אם יש עדכונים רשמיים רלוונטיים ואמת אותם.
4. **ענה בעברית מקצועית, רהוטה וחד-משמעית בלבד.**`;

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
            return { type: 'text', text: p.text ?? '' };
          }),
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
              .map((p: any) => ({ type: 'text', text: p.text ?? '' })),
          }))
          .filter((t: any) => t.content.length > 0);

      // Convert step_list back to the classic { role, parts } format for generateContent.
      const stepsToContents = (steps: any[]): any[] =>
        (steps || []).map((s: any) => ({
          role: s.type === 'model_output' ? 'model' : 'user',
          parts: (s.content || []).map((c: any) =>
            c.type === 'image'
              ? { inlineData: { data: c.data, mimeType: c.mime_type || 'image/jpeg' } }
              : { text: c.text ?? '' }
          ),
        }));

      // Collect streamed text from an Interactions SSE stream.
      const collectStreamedText = async (stream: any, onText?: (text: string) => void): Promise<string> => {
        let text = '';
        for await (const event of stream) {
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
      const modelChain: { name: string; kind: 'interactions' | 'generateContent'; config: any }[] = [
        {
          name: googleModelName,
          kind: 'interactions',
          config: { max_output_tokens: 65536, thinking_level: 'high' },
        },
        {
          name: 'gemini-3.6-flash',
          kind: 'interactions',
          config: { max_output_tokens: 65536, thinking_level: 'high' },
        },
        {
          name: 'gemini-3.5-flash',
          kind: 'interactions',
          config: { max_output_tokens: 65536, thinking_level: 'high' },
        },
        {
          name: 'gemini-3.1-pro-preview',
          kind: 'interactions',
          config: { temperature: 1, max_output_tokens: 65536, topP: 0.95, thinking_level: 'high' },
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
        modelEntry: { name: string; kind: 'interactions' | 'generateContent'; config: any },
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
            tools: [{ type: 'google_search' }],
          };
          if (isStream) {
            const stream = await client.interactions.create(params);
            return collectStreamedText(stream, onText);
          }
          return interactionText(await client.interactions.create(params));
        }
        // Standard generateContent fallback (gemini-3.5-flash-lite)
        const gcContents = stepsToContents(stepInput);
        const gcConfig: any = { thinkingConfig: { thinkingLevel: 'HIGH' } };
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
      const allKeys = await getAllApiKeys();

      for (let mi = 0; mi < effectiveChain.length && !success; mi++) {
        const modelEntry = effectiveChain[mi];
        console.log(`Attempting model ${mi + 1}/${effectiveChain.length}: ${modelEntry.name} (${modelEntry.kind})`);
        // Last resort: ignore known-bad keys so all 120 are genuinely re-tried.
        if (mi === effectiveChain.length - 1) {
          unhealthyKeys.clear();
        }
        let triedAnyKeyForModel = false;

        for (const key of allKeys) {
          if (signal?.aborted) return '';
          if (unhealthyKeys.has(key)) continue;
          triedAnyKeyForModel = true;

          const client = new GoogleGenAI({ apiKey: key });

          try {
            // PASS 1 — Generate the draft silently (only the final polished answer is streamed).
            const draftText = await callModel(client, modelEntry, toInteractionInput(contents), false);

            // PASS 2 — Silent Red Team Adversarial Critique (text-only, no streaming).
            const critiqueInput = [
              ...toInteractionTextOnly(contents),
              { type: 'model_output', content: [{ type: 'text', text: draftText }] },
              { type: 'user_input', content: [{ type: 'text', text: critiquePrompt }] },
            ];
            const critiqueText = (await callModel(client, modelEntry, critiqueInput, false)) || "אין הערות קריטיות.";
            const strippedCritique = critiqueText.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();

            let finalAnswer = draftText;
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
            console.log(`Referee answer generated with model ${modelEntry.name} (key ${key.substring(0, 10)}...).`);
            break;
          } catch (err: any) {
            const errMsg = err?.message || JSON.stringify(err);
            if (isKeyInvalidErr(errMsg)) {
              console.warn(`Key ${key.substring(0, 10)}... invalid (${errMsg.substring(0, 120)}). Moving to next key.`);
              markKeyUnhealthy(key);
            } else if (isRequestLevelErr(errMsg)) {
              console.warn(`Model ${modelEntry.name} unusable for this request (${errMsg.substring(0, 120)}). Switching to next model.`);
              break; // Same request error will repeat for every key — fail fast to the next model.
            } else if (isTransientErr(errMsg)) {
              console.warn(`Transient error on model ${modelEntry.name}, key ${key.substring(0, 10)}... (${errMsg.substring(0, 120)}). Rotating key.`);
              if (isQuotaErr(errMsg)) markKeyUnhealthy(key);
            } else {
              console.warn(`Model ${modelEntry.name}, key ${key.substring(0, 10)}... failed (${errMsg.substring(0, 150)}). Moving to next key.`);
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
