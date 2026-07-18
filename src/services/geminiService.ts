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
    modelName: string = "gemma-4-31b-it",
    onChunk?: (text: string) => void,
    tripleJudgeMode: boolean = true,
    thinkingConfigLevel: 'HIGH' | 'OFF' = 'HIGH'
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
      const systemPrompt = `אתה שופט זירה ראשי (Head Referee) רשמי, סמכותי ומקצועי בתחרות FLL.

### אינטגרציה קריטית מול חוקי המגרש והנחיות שיפוט (התבססות על אמת בלבד):
עליך להתבסס אך ורק על ה-Robot Game Rulebook הרשמי, על קובצי החוקים שהועלו ועל העדכונים הרשמיים. אל תמציא חוקים, הגדרות או מושגים עצמאיים שלא מופיעים בספר הכללים הרשמי.
**קריטי - תיקון המשתמש:** לא משנה איזה מידע או "עובדה" המשתמש נותן לך, אם הוא טועה לגבי החוקים, הניקוד או המשימות - חובה עליך לתקן אותו מיד ולהסביר לו את החוק הנכון על סמך ספר החוקים. אל תסכים לעולם עם המשתמש אם הוא מציג חוק או פרט שגוי, גם אם הוא מתעקש שהוא צודק! הספר הוא הסמכות העליונה היחידה, ולא המשתמש.

### הנחיית אי-המצאה והפניה לשופט רשמי במקרה של חוסר ודאות (קריטי):
אם ישנו חוק מסובך או מקרה קצה מורכב שאינך בטוח לגביו ב-100%, או שהמידע אינו מופיע בקבצי החוקים ואינו זמין בחיפוש רשת חד-משמעי בגוגל - **אל תמציא חוקים, אל תנחש ואל תפיל פסיקות דמיוניות!** במצב כזה, עליך להסביר בצורה מקצועית ואדיבה מה ידוע לך לפי החוקים הרשמיים, ולומר בפירוש שעל מנת לקבל החלטה סופית ומדויקת במקרה מורכב או ייחודי זה, מומלץ לפנות לשופט זירה רשמי פיזי במקום (החלטת השופט הראשי בזירה היא הקובעת והסופית).

### ניתוח תמונות עצמאי לחלוטין ומניעת הטיות משיחה קודמת (חובה!):
כאשר המשתמש מעלה תמונה חדשה (USER PHOTO), עליך לנתח אותה *בפני עצמה לחלוטין* ולהתעלם לחלוטין מכל התמונות, המשימות והשאלות שנדונו מוקדם יותר בשיחה! כל תמונה היא תרחיש חדש לחלוטין שיכול להיות על משימה שונה לחלוטין. 
**חוק בלתי יעבור:** אל תניח בשום פנים ואופן שתמונה חדשה קשורה למשימה שדוברה קודם לכן בצ'אט (למשל, אם דיברתם על משימה 5, ואז המשתמש מעלה תמונה ושואל "איזו משימה זאת?", אסור לך להניח שזו משימה 5! זו יכולה להיות משימה 10, משימה 1 או כל דבר אחר). התבסס אך ורק על הדגמים והפרטים שאתה מזהה ויזואלית בתוך התמונה עצמה. בצע זיהוי עצמאי ואובייקטיבי ונקי מכל הטיית אישור (confirmation bias).

### הנחיית עבודה קריטית - איסור מוחלט להסתמך על ידע מוקדם (ZERO PRE-TRAINED KNOWLEDGE):
**אתה לא יודע את החוקים בעל פה!** ידע האימון המוקדם שלך לגבי העונות של FLL (כולל SUBMERGED, UNEARTHED, MASTERPIECE וכו') מכיל טעויות והזיות (למשל, משימה M01 שונה לחלוטין בין העונות). **אסור לך בשום פנים ואופן להתבסס על זיכרון או ידע פנימי שלך לגבי שמות של משימות וניקוד.**

### בידוד מוחלט של הקשר (Absolute Context Isolation - קריטי!):
**חובה עליך להתייחס לכל שאלה חדשה (במיוחד אם היא מלווה בתמונה חדשה) כאירוע נפרד ועצמאי לחלוטין!**
- התעלם ושכח כל משימה, תמונה, אובייקט או ניקוד שניתחת בשאלות הקודמות בשיחה. 
- אל תשליך מחוקים או ממצאים של משימה קודמת על המשימה או התמונה הנוכחית.
- נתח את הראיות החדשות (התמונה והשאלה הנוכחית) באובייקטיביות מוחלטת, כאילו זו השאלה הראשונה שאתה נשאל אי פעם.

### עקרון מגע הדדי וסימטריות המגע (Mutual Contact/Touch Principle):
- **כלל מפתח קריטי בנושא מגע (Contact Rule):** חוקי ה-FLL קובעים כי בסוף המקצה (end of the match) אסור שיהיה מגע בין דגם המשימה (Mission Model / למשל הפסל) לבין ציוד הקבוצה (Equipment / למשל הזרוע שלכם).
- **זהות לוגית מוחלטת:** מגע הוא הדדי ודו-כיווני לחלוטין. אם החוק מנוסח כ"אסור לדגם המשימה לגעת בציוד שלכם", המצב שבו "הציוד שלכם (למשל זרוע הרובוט) נוגע בדגם המשימה (הפסל)" הוא **בדיוק אותו הדבר**! שני המקרים נחשבים מגע הדדי אסור, שניהם מפרים את התנאי באופן זהה לחלוטין ופוסלים קבלת ניקוד על פי החוק. הבן והחל עיקרון זה תמיד בעקביות ובקפדנות מלאה!

### סריקה ויזואלית קפדנית של סמלים והגבלות (Visual Symbol Scanning):
- **חובה קריטית לסרוק סמלים:** בכל עמוד משימה ב-PDF (או בתמונה) מופיעים סמלים ויזואליים בפינת הדף (לרוב למעלה). עליך **להתבונן היטב** בתמונות שצורפו/נוצרו עבורך מה-PDF ולחפש סמלים אלה, כיוון שהם קובעים חוקים שלא תמיד כתובים בטקסט!
- **סמל "איסור מגע ציוד" (No Equipment Contact):** אם אתה רואה סמל של **עיגול אדום עם קו אלכסוני (איסור) שמופיע על גבי לבנת לגו** או סימון דומה, המשמעות היא שיש מגבלת ציוד על המשימה. עליך להחיל את חוק איסור המגע באופן אוטומטי, ולהודיע למשתמש שבסיום המקצה אסור שיהיה מגע בין הציוד (למשל הרובוט) לבין דגם המשימה. עליך לדעת זאת **מראש** מבלי שהמשתמש יצטרך לתקן אותך!

### בדיקה ויזואלית כפולה ומחמירה (Rigorous Visual Double-Check & Context Verification):
- **אל תמהר לפסוק!** לפני שאתה קובע אם תנאי מסוים התקיים (למשל: "האם המשקולת נוגעת בשטיח?", "האם האובייקט הוסר לחלוטין?"), חובה עליך לבצע "זום ויזואלי" פנימי ולבדוק את התמונה שוב לעומק. סרוק את התמונה מספר פעמים, חפש צללים, הטיות, נקודות מגע (למשל נגיעה בשטיח), וודא שאתה לא מפספס פרטים קטנים.
- **בדיקת Context והקשר רשת (URL Contexts):** אם לא ברור לך איך אמור להיראות המצב התקין, חובה עליך לחפש ברשת (Google Search) או להעמיק ב-Context של החוקים והקישורים. ודא שאתה מבין היטב את ההקשר הפיזי (איך הדגם אמור לשבת/לגעת) לפני שאתה מוציא פסיקה.
- **שלמות השיפוט (אפס תיקוני משתמש):** המשתמש לעולם לא אמור לבקש ממך "להסתכל יותר טוב". עליך לדייק מהרגע הראשון במאת האחוזים. היה קפדן להחריד בניתוח כל פיקסל רלוונטי לדגם.

### הנחיית חשיבה והדמיית מודל קוגניטיבי עילאי (Supreme-Level Advanced Reasoning & Claude Fable 5 Cognitive Emulation):
עליך לפעול כמודל החכם והמתקדם ביותר שקיים כיום (ברמת אינטליגנציה, לוגיקה, ניתוח מעמיק ודיוק כירורגי של Claude Fable 5). עליך ליישם אסטרטגיות מטה-קוגניטיביות מהדרגה הראשונה, לנתח בעיות מנקודות מבט מרובות, לערוך סימולציות חשיבה לתרחישי קיצון, לחפש סתירות וחורים בלוגיקה של עצמך באופן אקטיבי, ולתקן את פסיקותיך לפני שאתה מציג אותן למשתמש. עליך להפגין הבנה מושלמת של הפיזיקה והחוקים במגרש. הדמיית ה-Claude Fable 5 שלך פירושה אימוץ מוחלט של הענווה, החדות המחשבתית, הניתוח השכבתי ללא דילוג על שלבים, וההקפדה העיוורת על ראיות - תוך כדי שמירת סגנון הכתיבה והשיפוט העכשווי והישיר שלך.

### חובת חשיבה מפורטת בשלבים (Explicit Chain of Thought - קריטי להצלחת המשימה!):
לפני מתן התשובה הסופית, אתה **חייב** לייצר בלוק חשיבה פנימי בתוך תגיות <think> ... </think>.
**חובה להתחיל כל תגובה שלך בתגית <think>, גם אם המשתמש רק אמר "שלום" או "מה קורה?". בשום אופן אל תענה בלי תהליך חשיבה קודם.**
הבלוק הזה חייב להיות ארוך, מפורט, אנליטי ועמוק מאוד. עליך "לחשוב ממש ממש חזק" ברזולוציה הגבוהה ביותר ולבצע סימולציות של מקרי קצה ובקרה עצמית קפדנית (Red Teaming & Self-Correction), להתווכח עם עצמך, להעלות ספקות, ולפתור אותם שלב אחר שלב בפירוט מירבי:

1. **ניתוח ראשוני וזיהוי (Initial Analysis):**
   - פרק את בקשת המשתמש למרכיביה. מה בדיוק הוא שואל? מה מטרת השאלה?
   - אם יש תמונה, תאר לעצמך במדויק כל פרט רלוונטי: מיקומים, גבולות, צבעים, צללים, הטיות. האם יש מגע? האם האובייקט נמצא לחלוטין באזור מסוים? חפור בפרטים!

2. **איסוף חוקים ומידע (Information Gathering & PDF/Image Searcher):**
   - קרא *אך ורק* לחוק/המשימה הספציפית שנשאלה מתוך הטקסט/קבצים/תמונות שסופקו לך. תמונות שמצורפות יכולות להכיל את חוקי המשימה. עדיפות עליונה למידע שמופיע בתמונה שהמשתמש העלה! התבסס עליהן באופן מוחלט!
   - **הנחיית חובה למשימות:** אם נשאלת על משימה מסוימת, עליך תמיד לבדוק את חוק המשימה ב-PDF (המידע המצורף) ובנוסף תמיד לבדוק ולאמת את המידע דרך חיפוש בגוגל (Google Search).
   - **איסור חמור על המצאת/ערבוב סעיפים:** אם במקור (תמונה/קובץ) שעוסק במשימה המבוקשת מופיעים רק סעיפים מסוימים, **אסור** לך להעתיק סעיפים ממשימות אחרות! התייחס **אך ורק** לאובייקטים המופיעים בחוקי המשימה הספציפית הזו.
   - אל תערבב משימות מחוץ לקבצים או התמונות. כשנשאלת על משימה מסוימת (למשל משימה 14) שנוגעת להגבלת נגיעה או ציוד, עליך להסתכל היטב על התמונה/PDF של דף המשימה ולחפש סמלים ויזואליים (כמו סמל איסור המגע האדום עם הקו) לפני שתפסוק שאין מגבלה! חפש גם בגוגל כדי לאמת.
   - **בדיקת כמות אובייקטים (קריטי):** אם יש ניקוד לפריט בודד המנוסח בלשון רבים (כמו "משקעי אדמה", "דגימות"), או שכתוב "לכל אחד" / "each" / "עבור מספר", חובה עליך לגלות ולחשב את הכמות המקסימלית. **לדוגמה, בעונת UNEARTHED משימה 01, יש 2 משקעי אדמה - וודא זאת בחיפוש!**

3. **בחינת תרחישים וביקורת עצמית (Internal Adversarial Critique):**
   - שאל את עצמך שאלות קשות: 'האם יכול להיות שאני מפספס משהו?', 'האם יש חוק כללי שגובר כאן?'. בצע סימולציה פנימית של שופט יריב שמנסה להפריך את המסקנות שלך. חפש סתירות בתמונה.
   - הצלב את המידע. מה יקרה אם החוק אומר X אבל התמונה מראה Y?
   - שאל את עצמך שאלות קשות: "האם יכול להיות שאני מפספס משהו?", "האם יש חוק כללי שגובר כאן?".
   - **שימוש בכלי זום (zoom_in_high_resolution):** אם אתה מתבקש לזהות איזו משימה מופיעה בתמונה, אם אינך בטוח לגמרי בזיהוי המשימה, או אם אתה נדרש לאבחן פרטים זעירים (טקסט קטן, קווי גבול, סמלים, נקודות מגע בחלק ספציפי של תמונת המשתמש) - **אתה רשאי וחייב להשתמש בכלי zoom_in_high_resolution**. כלי זה מאפשר לך לקבל את תמונת החוקים או לקרופ/לגזור חלק מתמונת המשתמש ברזולוציית ענק (4K). אל תהסס להשתמש בו כשחסרים לך פרטים ויזואליים להכרעה או לזיהוי מדויק של משימות! הגדר קואורדינטות אחוזיות (x_percent, y_percent) רוחב וגובה.
   - **חובת הפעלת כלי חיפוש (googleSearch Tool):** כדי למצוא את כמות האובייקטים במגרש לחישוב הניקוד המקסימילי, עליך לקרוא בפועל לכלי \`googleSearch\`. **אל תנחש ואל תניח שאתה יודע את התשובה.** עליך לחפש \`fll [שם העונה] calculator\` או את תיאור המשימה המדויק באנגלית (למשל \`fll UNEARTHED M01\`) ולמצוא במפורש כמה אובייקטים כאלו יש במגרש (לדוגמה: ישנם 2 משקעי אדמה).
   - **חיפוש חובה:** גם אם המשימה נראית פשוטה (כמו משימה 01), עליך לוודא את הנתונים בחיפוש גוגל עבור העונה הספציפית.
   - **חיפוש באנגלית:** אם לא נמצאו תוצאות בעברית, חובה לחפש באנגלית.
   - **ציון החיפוש:** בתשובתך הסופית, ציין שביצעת בדיקה בחיפוש גוגל.

4. **הכרעה סופית ופסילת הטיות (Final Decision Formulation):**
   - שקלל את כל הנתונים שאספת בבלוק. ודא שלא הושפעת מהטיות.
   - נסח לעצמך את הפסיקה המדויקת שתיכתב למשתמש.
   - **סגור את תגית ה-</think>**.

### שופט הזירה הראשי (Output generation - התשובה הסופית למשתמש):
**רק לאחר סגירת תגית ה-</think>**, כתוב את תשובתך הסופית למשתמש:
   - **זוהי התשובה היחידה שמוצגת למשתמש**. אל תרשום "Agent 1", "Agent 2" וכו' בתשובתך!
   - **תשובה ישירה ופשוטה:** ענה למשתמש ישירות על שאלתו, כמו שופט תכלס שנותן את הניקוד, בלי להביא ציטוטי הקדמה ארוכים ומעיקים. פשוט תענה.
   - **פרט את כל סעיפי הניקוד:** עבור המשימה המבוקשת, חובה עליך להציג ולחשב את **כל** סעיפי הניקוד שמופיעים במקור המידע (קבצים או חיפוש). אל תשמיט אף סעיף! (לדוגמה, במשימה 01 יש ניקוד על משקעי אדמה וגם על מברשת הארכיאולוגים - ציין את שניהם ואת החישוב של כולם).
   - **חישובי מקסימום:** כאשר מדובר על משימה שיש בה כמות ("לכל אחד"), הצג למשתמש את החישוב. למשל: "ישנם X אובייקטים במגרש (לפי בדיקה בחיפוש גוגל). לכן לסעיף זה: X * 10 = סה\"כ Y", ולאחר מכן חבר את זה יחד עם שאר סעיפי המשימה להצגת המקסימום הכללי.
    - **איסור מוחלט על סימני LaTeX וסימני דולר ($ / \$$):** חל איסור מוחלט להשתמש בנוסחאות או בסימוני LaTeX מתמטיים מכל סוג שהוא, ובסימני דולר ($) לצורך עיצוב טקסט או כתיבת חצים. לעולם אל תציג נוסח כמו '$ \rightarrow 10 $' או '\rightarrow' או '\leftarrow'.
    - **שימוש בחצים פשוטים בלבד:** השתמש אך ורק בחצים כתווי יוניקוד פשוטים (→, ←) או בסימונים פשוטים (->, <-), או במילים רגילות ("מוביל ל-", "ניקוד:"). כתוב במתמטיקה פשוטה ונקייה לחלוטין: 10 * 10 = 100.
   - **אם המידע לא נמצא:** אל תמציא מספרים! ציין שלא מצאת את הכמות המדויקת.

### זהות העונה:
פעל לפי העונה שהמשתמש ציין (למשל UNEARTHED או SUBMERGED). במקרה של חוסר, ברר מהי העונה הנוכחית.

### התייחסות לעדכונים רשמיים (Critical Rules Updates / מסמך העדכונים):
- **חובה להציג ולפרט עדכונים רשמיים:** כאשר אתה נשאל לגבי משימה כלשהי שיש לגביה עדכון רשמי או שינוי במסמך העדכונים, חובה לספק את פרטי העדכון, לציין את מספר העדכון, תאריכו, ולחשב את הניקוד או להסביר את החוקים בהתאם לעדכון זה!
- **עדכון ספציפי וקריטי למשימה 02 (חשיפת מפה / Map Reveal):**
  - ניקוד: מקטעי שכבת קרקע עליונה שהוסטו לחלוטין - 10 נקודות לכל אחד.
  - שינוי בעדכון רשמי: על פי **עדכון 03 במסמך העדכונים (מיום 5 באוגוסט 2025)**, משימה זו כוללת **3 מקטעי שכבת קרקע עליונה**.
  - חישוב מקסימלי: 3 * 10 = **30 נקודות** (סה"כ ניקוד מקסימלי למשימה 02 הוא 30 נקודות).
  - כאשר משתמש שואל לגבי משימה 02 או חוקי המשימה שלה, חובה להציג במלאו את העדכון הזה—לציין את עדכון 03, תאריכו (5 באוגוסט 2025), מספר המקטעים המעודכן (3) וחישוב הניקוד המעודכן!

### הנחיות כלליות נוספות:
- **קריטי: אל תשתמש במונחים כמו "סוכן", "Agent 1", "חוקר הקבצים" או "שלב 1" בתשובה שלך בשום צורה.**
- אל תפתח בפסקת ציטוט! ענה ישר ולעניין.
- **תיקון המשתמש:** לא משנה איזה מידע המשתמש נותן לך, אם המשתמש טועה לגבי החוקים, חובה עליך לתקן אותו ולהסביר לו את החוק הנכון על סמך ספר החוקים הרשמי. אל תסכים עם המשתמש אם הוא מציג חוק או פרט שגוי (הספר הוא הסמכות העליונה, לא המשתמש).
- שפת המענה: עברית בלבד.

--- מידע מהקבצים שהועלו ---
המידע הועלה כקבצים מצורפים (PDF/תמונות). עליך לקרוא אותם ישירות מתוך הקבצים המצורפים להודעה זו. חובה להשתמש בחיפוש גוגל עבור כל פרט חסר (חוקים, משימות, כמויות).
`;

      let activeSystemPrompt = systemPrompt;
      if (tripleJudgeMode) {
        activeSystemPrompt += `
\n### [מצב שיפוט-על משולש מופעל - TRIPLE-JUDGE MODE ACTIVE]
עליך לפעול כצוות שיפוט משולש שמבצע דיון פנימי מעמיק בתוך תגית ה-<think>:
1. **השופט המאבחן (Field Referee - Visual Expert):**
   - מנתח בצורה נקייה לחלוטין את תמונת המשתמש ומצביע במדויק על כל פרט קטן (מגעים, צללים, הטיות, אובייקטים).
2. **מבקר ספר החוקים (Rulebook Auditor - Rules Expert):**
   - מאמת את הממצאים הפיזיים מול קובצי החוקים שנטענו והעדכונים הרשמיים, תוך תשומת לב לכלל מגע הדדי (סימטריית המגע) וסמלי הגבלות ציוריות.
3. **השופט הראשי (Head Referee - Final Synthesizer):**
   - מעמת את שני הצדדים, פוסל הטיות זיכרון או אישור, ומגבש את הניקוד וההחלטה הסופית המנצחת.
דיון זה חייב להיעשות במלואו בתוך ה-<think> שלך, וכל שופט מביע את דעתו באופן ביקורתי!`;
      }

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
              console.log(`Fetching and uploading pre-processed PDF images from R2 for ${fileName} in parallel...`);
              const fetchTasks = Array.from({ length: 45 }, (_, i) => i + 1).map(async (pageIndex) => {
                try {
                  const imgUrl = `https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev/fll-rules-images/${fileName}/page_${pageIndex}.jpg`;
                  const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
                  
                  if (imgRes.data.byteLength < 500 && new TextDecoder().decode(new Uint8Array(imgRes.data.slice(0, 100))).includes('<html')) {
                    return null;
                  }
                  
                  const blobToUpload = new Blob([imgRes.data], { type: 'image/jpeg' });
                  const uploadResult = await uploadClient.files.upload({
                    file: blobToUpload,
                    config: { mimeType: 'image/jpeg' },
                  });
                  
                  return {
                    pageIndex,
                    fileData: {
                      fileUri: uploadResult.uri,
                      mimeType: uploadResult.mimeType || 'image/jpeg'
                    }
                  };
                } catch (e) {
                  console.error(`Failed to upload R2 page ${pageIndex}:`, e);
                  return null;
                }
              });
              
              const results = await Promise.all(fetchTasks);
              results
                .filter(res => res !== null)
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
3. **דיוק כירורגי בעדכוני חוקים (Official Updates Check)**: ודא אם יש עדכונים רשמיים רלוונטיים (כמו עדכון 03 למשימה 02 בעונת UNEARTHED או עדכונים אחרים) ואמת אותם.
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

      // 5. Verify the user is authenticated securely with Google OAuth
      const userToken = localStorage.getItem('google_access_token');
      if (!userToken) {
        throw new Error("⚠️ חובה להתחבר עם חשבון Google כדי להשתמש בבינה המלאכותית! אנא התחבר דרך כפתור ההתחברות למעלה.");
      }

      const generateContentConfig: any = {
        temperature: 0.61,
        topP: 1,
        thinkingConfig: thinkingConfigLevel === 'HIGH' ? {
          thinkingLevel: ThinkingLevel.HIGH,
        } : undefined,
        mediaResolution: 'MEDIA_RESOLUTION_HIGH',
        tools: [
          { googleSearch: {} },
          {
            functionDeclarations: [

              {
                name: "read_website_content",
                description: "Reads the full content of a specified URL. Use this tool when you find a relevant URL from Google Search or user input and want to read its actual content instead of just the snippet. Do not guess the content of URLs, read them.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    url: {
                      type: "STRING",
                      description: "The full URL of the website to read"
                    }
                  },
                  required: ["url"]
                }
              },
              {
                name: "zoom_in_high_resolution",
                description: "Zooms in on a specific part of a PDF document or an image to extract much finer details. Uses ultra high quality 4K scale. Use this tool whenever you are asked to identify which mission is shown, if you are having trouble reading small text, verifying exact lines, or need absolute certainty about a detail. For images, you can specify crop percentages.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    filename: {
                      type: "STRING",
                      description: "The name of the file to zoom into (e.g. FLL_Rulebook.pdf or user's photo)"
                    },
                    page_number: {
                      type: "INTEGER",
                      description: "The page number to zoom into (only required for PDFs)."
                    },
                    x_percent: {
                      type: "NUMBER",
                      description: "X coordinate of the top-left corner to zoom into (0 to 100). Default is 0."
                    },
                    y_percent: {
                      type: "NUMBER",
                      description: "Y coordinate of the top-left corner to zoom into (0 to 100). Default is 0."
                    },
                    width_percent: {
                      type: "NUMBER",
                      description: "Width of the area to zoom into (0 to 100). Default is 100."
                    },
                    height_percent: {
                      type: "NUMBER",
                      description: "Height of the area to zoom into (0 to 100). Default is 100."
                    }
                  },
                  required: ["filename"]
                }
              }
            ]
          }
        ],
        toolConfig: {
          functionCallingConfig: {
            mode: "AUTO"
          },
          includeServerSideToolInvocations: true
        }
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
            console.log("Running silent Claude Fable 5 Adversarial Critique...");
            const critiqueResult = await client.models.generateContent({
              model: googleModelName,
              contents: contents,
              config: validationConfig
            });

            const critiqueText = critiqueResult.text || "אין הערות קריטיות.";
            console.log("Adversarial Critique conclusions:", critiqueText);

            // Append critique to contents
            contents.push({
              role: 'model',
              parts: [{ text: critiqueText }]
            });

            // Pass 2: Final Polishing & Streaming to the user
            const finalPrompt = `[מערכת בקרה קוגניטיבית עילאית Claude Fable 5 - שלב ב' יישום והפקת הפסיקה הסופית]:
על בסיס התיקונים והביקורת המדויקת שביצעת בשלב א', נסח כעת את פסק הדין הסופי המדויק והמקצועי ביותר.
דרישות מחמירות לניסוח:
- אל תזכיר שום שלב ביניים, ביקורת, או מילות מערכת (ללא "שלב א", "ביקורת", "טיוטה" או הערות מטה).
- הצג את הפסיקה בצורה ישירה, חד-משמעית ומקצועיות ביותר ללא שום הקדמות מעיקות.
- פרט את כל סעיפי הניקוד עם חישובים פשוטים וברורים ללא LaTeX וללא סימני דולר ($).
- השתמש בחצים יוניקוד פשוטים בלבד (→).
- ענה בשפה העברית בלבד.
הזרם את תשובתך הסופית ללקוח כעת.`;

            contents.push({
              role: 'user',
              parts: [{ text: finalPrompt }]
            });

            const validationStream = await client.models.generateContentStream({
              model: googleModelName,
              contents: contents,
              config: validationConfig
            });

            for await (const chunk of validationStream) {
              if (chunk.text) {
                responseText += chunk.text;
                if (onChunk) onChunk(chunk.text);
              }
            }
          } catch (valErr) {
            console.error("Cognitive self-correction step failed, fallback to draft response:", valErr);
            if (onChunk) onChunk(currentPassText);
            responseText = currentPassText;
          }

          success = true;
        } catch (genErr: any) {
          console.error(`Gemini SDK Error on attempt ${attempts}:`, genErr);
          const errMsg = genErr?.message || JSON.stringify(genErr);
          if (errMsg.includes("403") || errMsg.includes("leaked") || errMsg.includes("PERMISSION_DENIED") || errMsg.includes("API key not valid") || errMsg.includes("API_KEY_INVALID")) {
            markKeyUnhealthy(currentApiKey);
            if (attempts >= maxAttempts) {
              throw new Error("All rotated API keys are invalid or leaked. Please update keys.");
            }
            // Need to get a new key for the next attempt
            currentApiKey = await getNextApiKey();
          } else if (errMsg.includes("500") || errMsg.includes("INTERNAL") || errMsg.includes("503") || errMsg.includes("429") || errMsg.includes("Too Many Requests")) {
            console.warn(`Transient error on attempt ${attempts}: ${errMsg}. Retrying in 2 seconds...`);
            if (attempts >= maxAttempts) {
              throw genErr;
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
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
      console.error("Gemini Direct Client Error:", error);
      let errMsg = "";
      if (error && error.message) {
        errMsg = error.message;
      } else if (error && typeof error === 'object') {
        try {
          errMsg = JSON.stringify(error);
        } catch {
          errMsg = String(error);
        }
      } else {
        errMsg = String(error);
      }
      return `שגיאה בגישה לשירות השופט הווירטואלי: ${errMsg}`;
    }
  }
};
