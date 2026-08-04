import axios from 'axios';
import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Configure pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Cache for extracted rulebook text
const rulebookCache = new Map<string, string>();

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
      const data = new Uint8Array(response.data);
      const loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;
      
      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // Improved text extraction with basic layout preservation and Hebrew reversal
        const lines: Map<number, { x: number, str: string }[]> = new Map();
        
        textContent.items.forEach((item: any) => {
          const y = Math.round(item.transform[5]);
          const x = Math.round(item.transform[4]);
          const str = item.str;
          
          if (!lines.has(y)) lines.set(y, []);
          lines.get(y)!.push({ x, str });
        });
        
        // Sort lines by Y (top to bottom)
        const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);
        const pageText = sortedY.map(y => {
          // Sort items in the line by X (left to right)
          const lineItems = lines.get(y)!.sort((a, b) => a.x - b.x);
          return lineItems.map(item => item.str).join(" ");
        }).join("\n");
        
        text += `--- Page ${i} ---\n${pageText}\n\n`;
      }
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
      const data = new Uint8Array(arrayBuffer);
      const loadingTask = pdfjs.getDocument({ data });
      const pdf = await loadingTask.promise;
      
      let text = "";
      for (let i = 1; i <= Math.min(pdf.numPages, 50); i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const lines: Map<number, { x: number, str: string }[]> = new Map();
        
        textContent.items.forEach((item: any) => {
          const y = Math.round(item.transform[5]);
          const x = Math.round(item.transform[4]);
          const str = item.str;
          
          if (!lines.has(y)) lines.set(y, []);
          lines.get(y)!.push({ x, str });
        });
        
        const sortedY = Array.from(lines.keys()).sort((a, b) => b - a);
        const pageText = sortedY.map(y => {
          const lineItems = lines.get(y)!.sort((a, b) => a.x - b.x);
          return lineItems.map(item => item.str).join(" ");
        }).join("\n");
        
        text += `--- Page ${i} ---\n${pageText}\n\n`;
      }
      return text;
    } else if (file.type.startsWith('text/') || file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.json')) {
      return await file.text();
    }
  } catch (err) {
    console.error("Error extracting text from file:", file.name, err);
  }
  return "";
}

// Convert PDF pages to images (JPEG Blobs) using pdfjs
export async function convertPdfToImages(pdfInput: File | Blob, scaleFactor: number = 2.0, specificPage?: number): Promise<{ data: Blob; name: string }[]> {
  try {
    const arrayBuffer = await pdfInput.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    const images: { data: Blob; name: string }[] = [];

    // Convert all pages of the PDF to JPEG images to ensure the model sees every detail/symbol
    const totalPages = pdf.numPages;
    console.log(`Rendering PDF visually to JPEG images: total ${totalPages} pages (Scale: ${scaleFactor})...`);

    const startPage = specificPage ? specificPage : 1;
    const endPage = specificPage ? specificPage : totalPages;

    for (let i = startPage; i <= endPage; i++) {
      try {
        const page = await pdf.getPage(i);
        // scale 2.0 is sufficient for reading small icons, drawings, symbols, and Hebrew text on diagrams without blowing up file sizes
        const viewport = page.getViewport({ scale: scaleFactor });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({
            canvasContext: context,
            viewport: viewport
          } as any).promise;

          const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob((b) => resolve(b), 'image/jpeg', scaleFactor >= 5.0 ? 1.0 : 0.85);
          });

          if (blob) {
            images.push({
              data: blob,
              name: `page_${i}.jpg`
            });
          }
        }
      } catch (pageErr) {
        console.error(`Error rendering PDF page ${i} to visual image:`, pageErr);
      }
    }
    return images;
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

async function getNextApiKey(): Promise<string> {
  if (GEMINI_KEYS.length === 0) {
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
    modelName: string = "gemini-3.6-flash",
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
      const systemPrompt = `CRITICAL: You MUST respond in ${langName} (language code: ${language}). ALL your answers must be in ${langName}. This overrides any other language instructions below.

אתה שופט וירטואלי של FLL. מקורך: התמונות המצורפות בלבד - ספר החוקים, ספר הניקוד ומסמך העדכונים.

⚠️⚠️⚠️ חשוב ביותר: ⚠️⚠️⚠️
התמונות המצורפות להודעה הן המקור הראשי והסמכותי שלך לפסיקות ולניקוד! הן כוללות את ספר החוקים, ספר הניקוד ומסמך העדכונים (Updates).
עליך לעיין בכל התמונות המצורפות ביסודיות לפני כל תשובה - הן הבסיס לכל פסק.
אתה חייב לצטט את מספר החוק והניקוד המדויק מתוך התמונות המצורפות בכל תשובה.
תמונות המסומנות '--- RULEBOOK PAGE ---' או '--- RULEBOOK IMAGE ---' או '--- RULEBOOK ---' הן ספר החוקים/הניקוד - השתמש בהן רק כמילון חוקים, לא כשאלת המשתמש.
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

      let currentApiKey = await getNextApiKey();
      let uploadClient = new GoogleGenAI({ apiKey: currentApiKey });

      let globalImageIndex = 1;

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
              const uploadedImages: { pageIndex: number; fileData: any }[] = [];
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
                  const uploadResult = await uploadClient.files.upload({
                    file: blobToUpload,
                    config: { mimeType: 'image/jpeg' },
                  });
                  
                  uploadedImages.push({
                    pageIndex,
                    fileData: {
                      fileUri: uploadResult.uri,
                      mimeType: uploadResult.mimeType || 'image/jpeg'
                    }
                  });
                  pageIndex++;
                } catch (e) {
                  consecutiveMisses++;
                  pageIndex++;
                }
              }
              
console.log(`Loaded ${uploadedImages.length} pages for ${fileName}`);
              uploadedImages
                .sort((a: any, b: any) => a.pageIndex - b.pageIndex)
                .forEach((res: any) => {
                  const prefixText = fileTypeStr === 'user_image' 
                    ? `Image ${globalImageIndex++}:\n--- USER PHOTO (Analyze this to see what the user is asking about) | FILE: ${fileName} ---\n`
                    : `Image ${globalImageIndex++}:\n--- RULEBOOK PAGE (Use this as reference only) | FILE: ${fileName} | PAGE: ${res.pageIndex} ---\n`;
                  currentParts.push({ text: prefixText });
                  currentParts.push({ fileData: res.fileData });
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
                    const uploadResult = await uploadClient.files.upload({
                      file: pageImg.data,
                      config: { mimeType: 'image/jpeg' },
                    });
                    const prefixText = fileTypeStr === 'user_image' 
                      ? `Image ${globalImageIndex++}:\n--- USER PHOTO (Analyze this to see what the user is asking about) | FILE: ${fileName} ---\n`
                      : `Image ${globalImageIndex++}:\n--- RULEBOOK PAGE (Use this as reference only) | FILE: ${fileName} | PAGE: ${pageIndex} ---\n`;
                    currentParts.push({ text: prefixText });
                    currentParts.push({
                      fileData: {
                        fileUri: uploadResult.uri,
                        mimeType: uploadResult.mimeType || 'image/jpeg'
                      }
                    });
                    pageIndex++;
                  } catch (err: any) {
                    console.error(`Failed to upload PDF page ${pageImg.name}:`, err);
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
              let uploadSuccess = false;
              let uploadAttempts = 0;
              while (uploadAttempts < 15 && !uploadSuccess) {
                if (signal?.aborted) return '';
                uploadAttempts++;
                try {
                  const uploadResult = await uploadClient.files.upload({
                    file: blobToUpload,
                    config: { mimeType: mimeType },
                  });
                  
                  let fileInfo = await uploadClient.files.get({ name: uploadResult.name });
                  while (fileInfo.state === 'PROCESSING') {
                    console.log(`Waiting for media file ${fileName} to process...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    fileInfo = await uploadClient.files.get({ name: uploadResult.name });
                  }
                  
                  if (fileInfo.state === 'FAILED') {
                    throw new Error(`Media processing failed in Gemini backend for ${fileName}.`);
                  }
                  
                  const prefixText = fileTypeStr === 'user_image' 
                    ? `Image ${globalImageIndex++}:\n--- USER PHOTO (Analyze this to see what the user is asking about) | FILE: ${fileName} ---\n`
                    : `Image ${globalImageIndex++}:\n--- RULEBOOK PAGE (Use this as reference only) | FILE: ${fileName} ---\n`;
                  currentParts.push({ text: prefixText });
                  currentParts.push({
                    fileData: {
                      fileUri: uploadResult.uri,
                      mimeType: uploadResult.mimeType || mimeType
                    }
                  });
                  uploadSuccess = true;
                } catch (uploadErr: any) {
                  const errMsg = uploadErr?.message || JSON.stringify(uploadErr);
                  if (errMsg.includes("403") || errMsg.includes("leaked") || errMsg.includes("PERMISSION_DENIED") || errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID")) {
                    markKeyUnhealthy(currentApiKey);
                    if (uploadAttempts >= 15) throw new Error(`All rotated API keys are invalid. Could not upload ${fileName}.`);
                    currentApiKey = await getNextApiKey();
                    uploadClient = new GoogleGenAI({ apiKey: currentApiKey });
                  } else if (errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("Quota exceeded") || errMsg.includes("RESOURCE_EXHAUSTED")) {
                    if (uploadAttempts >= 15) throw new Error(`שגיאה בהעלאת הקובץ ${fileName} למודל בינה מלאכותית. ${uploadErr}`);
                    currentApiKey = await getNextApiKey();
                    uploadClient = new GoogleGenAI({ apiKey: currentApiKey });
                    console.warn(`Quota exceeded (429) during upload, rotating API key and retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  } else {
                    throw new Error(`שגיאה בהעלאת הקובץ ${fileName} למודל בינה מלאכותית. ${uploadErr}`);
                  }
                }
              }
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

      const generateContentConfig: any = {
        temperature: 0.8,
        maxOutputTokens: 65536,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        abortSignal: signal,
      };

      if (useNativeSystemInstruction) {
        generateContentConfig.systemInstruction = activeSystemPrompt;
      }

      let responseText = "";
      let attempts = 0;
      let maxAttempts = 15;
      let success = false;
      // using currentApiKey which has the latest valid key from the upload steps

      while (attempts < maxAttempts && !success) {
        if (signal?.aborted) return '';
        attempts++;
        const client = new GoogleGenAI({ apiKey: currentApiKey });

        try {
          const responseStream = await client.models.generateContentStream({
            model: googleModelName,
            contents: contents,
            config: generateContentConfig
          });

          let functionCallsToExecute: any[] = [];
          let currentPassText = "";

          for await (const chunk of responseStream) {
            if (chunk.functionCalls && chunk.functionCalls.length > 0) {
              functionCallsToExecute.push(...chunk.functionCalls);
            }
            if (chunk.text) {
              currentPassText += chunk.text;
            }
          }

          if (functionCallsToExecute.length > 0) {
            // Append the model's function calls to contents
            contents.push({
              role: 'model',
              parts: functionCallsToExecute.map(fc => ({ functionCall: fc }))
            });

            // Execute the function calls
            const functionResponsesParts = [];
            for (const fc of functionCallsToExecute) {
              if (signal?.aborted) return responseText || '';
              if (fc.name === "read_website_content") {
                const urlToRead = (fc.args as any).url;
                if (onChunk) onChunk(`\n\n[השופט קורא את האתר: ${urlToRead}...]\n\n`);
                try {
                  console.log(`Reading website: ${urlToRead}`);
                  const jinaRes = await axios.get(`https://r.jina.ai/${urlToRead}`);
                  let content = "";
                  if (typeof jinaRes.data === 'string') {
                    content = jinaRes.data.substring(0, 30000);
                  } else if (jinaRes.data && jinaRes.data.data && jinaRes.data.data.content) {
                    content = jinaRes.data.data.content.substring(0, 30000);
                  }
                  functionResponsesParts.push({
                    functionResponse: {
                      name: fc.name,
                      response: { content: content || "No content found" }
                    }
                  });
                } catch (err) {
                  console.error(`Failed to read website ${urlToRead}:`, err);
                  functionResponsesParts.push({
                    functionResponse: {
                      name: fc.name,
                      response: { error: `Failed to fetch website: ${err}` }
                    }
                  });
                }
              } else if (fc.name === "zoom_in_high_resolution") {
                const filename = (fc.args as any).filename;
                const pageNumber = (fc.args as any).page_number;
                const xP = (fc.args as any).x_percent ?? 0;
                const yP = (fc.args as any).y_percent ?? 0;
                const wP = (fc.args as any).width_percent ?? 100;
                const hP = (fc.args as any).height_percent ?? 100;
                
                try {
                  console.log(`Zooming into ${filename}...`);
                  
                  // Find the file in rulebookFiles or userFiles
                  const allFiles = [...(rulebookFiles || []), ...(userFiles || [])];
                  let fileToZoom = allFiles.find(f => {
                    const nameStr = (f as any).name || (f as any).key || f.url || '';
                    return nameStr.toLowerCase().includes(filename.toLowerCase());
                  });
                  
                  // Resilient Fallback: If no match found and we have userFiles, pick the first user file!
                  if (!fileToZoom) {
                    if (userFiles && userFiles.length > 0) {
                      fileToZoom = userFiles[0];
                    } else if (allFiles.length > 0) {
                      fileToZoom = allFiles[0];
                    }
                  }
                  
                  if (fileToZoom) {
                    let fileBlob: Blob | File | null = null;
                    if ((fileToZoom as any).actualFile) {
                      fileBlob = (fileToZoom as any).actualFile;
                    } else if ((fileToZoom as any).base64) {
                      const fetchRes = await fetch((fileToZoom as any).base64);
                      fileBlob = await fetchRes.blob();
                    } else if (fileToZoom.url) {
                      let fetchUrl = fileToZoom.url;
                      if (fetchUrl.includes('/api/r2/file/')) {
                        const fileKey = fetchUrl.substring(fetchUrl.indexOf('/api/r2/file/') + '/api/r2/file/'.length);
                        fetchUrl = `https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev/${fileKey}`;
                      }
                      const res = await axios.get(fetchUrl, { responseType: 'blob' });
                      fileBlob = res.data;
                    }
                    
                    if (fileBlob) {
                      if (fileBlob.type === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
                        const pageImages = await convertPdfToImages(fileBlob, 5.0, pageNumber);
                        if (pageImages.length > 0) {
                          let pageImgBlob = pageImages[0].data;
                          
                          if (wP < 100 || hP < 100) {
                            const croppedBlob = await cropAndScaleImage(pageImgBlob, xP, yP, wP, hP);
                            if (croppedBlob) pageImgBlob = croppedBlob;
                          }

                          const uploadClient = new GoogleGenAI({ apiKey: currentApiKey });
                          const uploadResult = await uploadClient.files.upload({
                            file: pageImgBlob,
                            config: { mimeType: 'image/jpeg' },
                          });
                          
                          let fileInfo = await uploadClient.files.get({ name: uploadResult.name });
                          while (fileInfo.state === 'PROCESSING') {
                            await new Promise(resolve => setTimeout(resolve, 1500));
                            fileInfo = await uploadClient.files.get({ name: uploadResult.name });
                          }
                          
                          functionResponsesParts.push({
                             text: `Image ${globalImageIndex++}:\n--- HIGH RESOLUTION ZOOM (4K, CROP ${xP}%,${yP}% to ${wP}%,${hP}%) FOR ${filename} PAGE ${pageNumber} ---\n`
                          });
                          functionResponsesParts.push({
                             fileData: {
                               fileUri: uploadResult.uri,
                               mimeType: 'image/jpeg'
                             }
                          });
                          
                          functionResponsesParts.push({
                             functionResponse: {
                               name: fc.name,
                               response: { success: true, message: `High resolution zoom image of page ${pageNumber} has been attached to this message. Analyze it carefully.` }
                             }
                          });
                        } else {
                          functionResponsesParts.push({
                            functionResponse: {
                              name: fc.name,
                              response: { error: `Could not render page ${pageNumber} from PDF.` }
                            }
                          });
                        }
                      } else {
                        // IT IS AN IMAGE
                        let imgBlob = fileBlob;
                        if (wP < 100 || hP < 100) {
                          const croppedBlob = await cropAndScaleImage(imgBlob, xP, yP, wP, hP);
                          if (croppedBlob) imgBlob = croppedBlob;
                        } else {
                          // Still scale to 4K if no crop was requested
                          const croppedBlob = await cropAndScaleImage(imgBlob, 0, 0, 100, 100);
                          if (croppedBlob) imgBlob = croppedBlob;
                        }

                        const uploadClient = new GoogleGenAI({ apiKey: currentApiKey });
                        const uploadResult = await uploadClient.files.upload({
                          file: imgBlob,
                          config: { mimeType: fileBlob.type || 'image/jpeg' },
                        });
                        
                        let fileInfo = await uploadClient.files.get({ name: uploadResult.name });
                        while (fileInfo.state === 'PROCESSING') {
                          await new Promise(resolve => setTimeout(resolve, 1500));
                          fileInfo = await uploadClient.files.get({ name: uploadResult.name });
                        }
                        
                        functionResponsesParts.push({
                           text: `Image ${globalImageIndex++}:\n--- HIGH RESOLUTION ZOOM (4K, CROP ${xP}%,${yP}% to ${wP}%,${hP}%) FOR ${filename} ---\n`
                        });
                        functionResponsesParts.push({
                           fileData: {
                             fileUri: uploadResult.uri,
                             mimeType: fileBlob.type || 'image/jpeg'
                           }
                        });

                        functionResponsesParts.push({
                           functionResponse: {
                             name: fc.name,
                             response: { success: true, message: `High resolution 4K zoomed image chunk has been attached to this message. Analyze it carefully.` }
                           }
                        });
                      }
                    } else {
                      functionResponsesParts.push({
                        functionResponse: {
                          name: fc.name,
                          response: { error: `Could not load file data for ${filename}.` }
                        }
                      });
                    }
                  } else {
                    functionResponsesParts.push({
                      functionResponse: {
                        name: fc.name,
                        response: { error: `File ${filename} not found in current context.` }
                      }
                    });
                  }
                } catch (err) {
                  console.error(`Failed to zoom into ${filename}:`, err);
                  functionResponsesParts.push({
                    functionResponse: {
                      name: fc.name,
                      response: { error: `Failed to zoom: ${err}` }
                    }
                  });
                }
              }
            }

            // Append the function responses to contents
            contents.push({
              role: 'user',
              parts: functionResponsesParts
            });
            
            // Do not mark success = true so it continues the loop
            // Reduce attempts so it doesn't count against the max Attempts
            attempts--;
            continue;
          }

          // --- NO MORE FUNCTION CALLS: Ready for supreme cognitive synthesis! ---
          try {
            // Strip image parts AND their description text from contents for text-only validation passes
            // (models like gemma may not support image input in multi-turn contexts)
            const stripImages = (msgs: any[]) => msgs.map(m => {
              const filteredParts = (m.parts || []).filter((p: any) => {
                if (p.fileData || p.inlineData) return false;
                if (p.text && /^Image \d+:\n---/.test(p.text)) return false;
                if (p.text && p.text.includes('--- HIGH RESOLUTION ZOOM')) return false;
                return true;
              });
              return { ...m, parts: filteredParts };
            });

            // Append the silent reasoning draft to the contents
            contents.push({
              role: 'model',
              parts: [{ text: currentPassText }]
            });

            // Pass 1: Silent Red Team Adversarial Critique
            const critiquePrompt = `[מערכת בקרה קוגניטיבית עילאית Claude Fable 5 - שלב א' בקורת עצמית עוינת (Adversarial Critique)]:
נתח את טיוטת החשיבה, פסיקות החוקים והניקוד שלך עד כה בהשוואה לתמונות הזום שבוצעו. העמד את עצמך במבחן ביקורתי מחמיר (Red Teaming):
- האם ישנה טעות כלשהי בזיהוי המשימה או בחוקים שלה? (זכור: יש להתעלם מהיסטוריית משימות קודמות!).
- האם עיקרון מגע הדדי וסימטריות המגע מתקיימים במלואם? (האם ציוד נוגע בדגם או להפך, מה שפוסל את הניקוד?)
- האם חוקי הניקוד חושבו בצורה מדויקת ומעודכנת על פי העדכונים הרשמיים?
- האם ישנם חצים או סימני LaTeX/דולר ($ / \$\$) אסורים בטיוטה שלך?
נסח בקצרה את מסקנות הביקורת והתיקונים שחובה לבצע.`;

            contents.push({
              role: 'user',
              parts: [{ text: critiquePrompt }]
            });

            // Disable tools for the validation phase to keep it fast and purely cognitive
            const validationConfig = {
              ...generateContentConfig,
              tools: undefined,
              toolConfig: undefined
            };

            // Run the critique silently (without streaming to onChunk!)
            const critiqueResult = await client.models.generateContent({
              model: googleModelName,
              contents: stripImages(contents),
              config: validationConfig
            });

            const critiqueText = critiqueResult.text || "אין הערות קריטיות.";

            const strippedCritique = critiqueText.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();

            if (strippedCritique) {
              // Pass 2: Final Polishing & Streaming to the user
              contents.push({
                role: 'model',
                parts: [{ text: critiqueText }]
              });

              const finalPrompt = `[שלב ב' הפקת התשובה הסופית]:
על בסיס הביקורת, כתוב את התשובה כמו שאתה מדבר עם קבוצה ליד שולחן התחרות. ישיר, ידידותי, מעודד. אל תשתמש ב"פסק הדין הסופי" או שפה משפטית. פשוט תענה לשאלה בצורה טבעית, ציין את מספרי הכללים הרלוונטיים ותנאי הניקוד. ללא LaTeX/$, ללא חצים יוניקוד, הצג חישובים פשוטים.`;

              contents.push({
                role: 'user',
                parts: [{ text: finalPrompt }]
              });

              const finalConfig = {
                ...generateContentConfig,
                tools: undefined,
                toolConfig: undefined
              };

              const validationStream = await client.models.generateContentStream({
                model: googleModelName,
                contents: stripImages(contents),
                config: finalConfig
              });

              let finalPassChunks = '';
              for await (const chunk of validationStream) {
                if (chunk.text) {
                  finalPassChunks += chunk.text;
                  if (onChunk) onChunk(chunk.text);
                }
              }
              responseText = finalPassChunks;
              if (!responseText && currentPassText) {
                responseText = currentPassText;
              }
            } else {
              responseText = currentPassText;
            }
          } catch (valErr) {
            console.warn("Self-correction failed, using draft response");
            responseText = currentPassText;
          }

          success = true;
        } catch (genErr: any) {
          console.warn(`Attempt ${attempts} failed, retrying...`);
          const errMsg = genErr?.message || JSON.stringify(genErr);
          if (errMsg.includes("403") || errMsg.includes("leaked") || errMsg.includes("PERMISSION_DENIED") || errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID")) {
            markKeyUnhealthy(currentApiKey);
            if (attempts >= maxAttempts) {
              throw new Error("All rotated API keys are invalid or leaked. Please update keys.");
            }
            // Need to get a new key for the next attempt
            currentApiKey = await getNextApiKey();
          } else if (errMsg.includes("500") || errMsg.includes("INTERNAL") || errMsg.includes("503") || errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("Quota exceeded")) {
            const is429 = errMsg.includes("429") || errMsg.includes("Too Many Requests") || errMsg.includes("Quota exceeded") || errMsg.includes("RESOURCE_EXHAUSTED");
            if (is429) {
              currentApiKey = await getNextApiKey();
              console.warn(`Quota exceeded (429) on attempt ${attempts}. Rotating API key, retrying...`);
              if (attempts >= maxAttempts) {
                return 'מערכת השופט עמוסה כרגע. אנא נסה שוב בעוד דקה.';
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              const delay = 2000;
              console.warn(`Transient error on attempt ${attempts}: ${errMsg}. Retrying in ${delay/1000}s...`);
              if (attempts >= maxAttempts) {
                throw genErr;
              }
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          } else {
            throw genErr; // Other unrecoverable errors throw immediately
          }
        }
      }

      if (!responseText) {
        throw new Error("Empty response received from Gemini.");
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
