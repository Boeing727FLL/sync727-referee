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
export async function convertPdfToImages(pdfInput: File | Blob): Promise<{ data: Blob; name: string }[]> {
  try {
    const arrayBuffer = await pdfInput.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    const images: { data: Blob; name: string }[] = [];

    // Convert all pages of the PDF to JPEG images to ensure the model sees every detail/symbol
    const totalPages = pdf.numPages;
    console.log(`Rendering PDF visually to JPEG images: total ${totalPages} pages...`);

    for (let i = 1; i <= totalPages; i++) {
      try {
        const page = await pdf.getPage(i);
        // scale 2.0 is sufficient for reading small icons, drawings, symbols, and Hebrew text on diagrams without blowing up file sizes
        const viewport = page.getViewport({ scale: 2.0 });
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
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85);
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
    history: { role: 'user' | 'model', text: string }[],
    rulebookFiles: { name: string, url: string }[] = [],
    seasonName: string = "SUBMERGED",
    userFiles?: { url: string, key: string, base64?: string, actualFile?: File }[],
    modelName: string = "gemma-4-31b-it",
    onChunk?: (text: string) => void
  ) {
    try {
      console.log("Processing FLL Query directly on the client-side...");

      // Merge rulebookFiles into userFiles so they are all processed natively
      const allFiles = [...(userFiles || [])];
      if (rulebookFiles && rulebookFiles.length > 0) {
        rulebookFiles.forEach(f => {
          allFiles.push({ url: f.url, key: f.name });
        });
      }

      // 2. Map chosen model to modern, valid GoogleGenAI API options
      const activeModel = modelName;

      // 3. Build contents array representing conversation history for a multi-turn chat
      const contents: any[] = [];
      
      // Populate history
      history.forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      });

      // Assemble current turn parts
      const currentParts: any[] = [];

      // 4. Set up official FLL Head Referee system prompt
      const systemPrompt = `אתה שופט זירה ראשי (Head Referee) רשמי, סמכותי ומקצועי בתחרות FLL.

### אינטגרציה קריטית מול חוקי המגרש והנחיות שיפוט (התבססות על אמת בלבד):
אם הקבוצה או המשתמש מצטטים חוק ישיר מתוך ספר החוקים הרשמי (באנגלית או בעברית), אל תתווכח, אל תשלול עמדות מבוססות באופן שרירותי, ואל תמציא חוקים, הגדרות או מושגים עצמאיים שלא מופיעים בספר הכללים הרשמי (לדוגמה, אל תמציא או תלביש מושגים מנופחים כמו 'Snapshot Principle' וכדומה). עליך להתבסס אך ורק על ה-Robot Game Rulebook הרשמי, על קובצי החוקים שהועלו ועל העדכונים הרשמיים. אם מתברר ששגית או שהבנת חוק באופן לא מדויק, הודה בטעות מייד בצורה מקצועית, עניינית ואדיבה, ותקן את המענה בהתבסס על הכלל הנכון.

### הנחיית עבודה קריטית - איסור מוחלט להסתמך על ידע מוקדם (ZERO PRE-TRAINED KNOWLEDGE):
**אתה לא יודע את החוקים בעל פה!** ידע האימון המוקדם שלך לגבי העונות של FLL (כולל SUBMERGED, UNEARTHED, MASTERPIECE וכו') מכיל טעויות והזיות (למשל, משימה M01 שונה לחלוטין בין העונות). **אסור לך בשום פנים ואופן להתבסס על זיכרון או ידע פנימי שלך לגבי שמות של משימות וניקוד.**

### עקרון מגע הדדי וסימטריות המגע (Mutual Contact/Touch Principle):
- **כלל מפתח קריטי בנושא מגע (Contact Rule):** חוקי ה-FLL קובעים כי בסוף המקצה (end of the match) אסור שיהיה מגע בין דגם המשימה (Mission Model / למשל הפסל) לבין ציוד הקבוצה (Equipment / למשל הזרוע שלכם).
- **זהות לוגית מוחלטת:** מגע הוא הדדי ודו-כיווני לחלוטין. אם החוק מנוסח כ"אסור לדגם המשימה לגעת בציוד שלכם", המצב שבו "הציוד שלכם (למשל זרוע הרובוט) נוגע בדגם המשימה (הפסל)" הוא **בדיוק אותו הדבר**! שני המקרים נחשבים מגע הדדי אסור, שניהם מפרים את התנאי באופן זהה לחלוטין ופוסלים קבלת ניקוד על פי החוק. הבן והחל עיקרון זה תמיד בעקביות ובקפדנות מלאה!

### סריקה ויזואלית קפדנית של סמלים והגבלות (Visual Symbol Scanning):
- **חובה קריטית לסרוק סמלים:** בכל עמוד משימה ב-PDF (או בתמונה) מופיעים סמלים ויזואליים בפינת הדף (לרוב למעלה). עליך **להתבונן היטב** בתמונות שצורפו/נוצרו עבורך מה-PDF ולחפש סמלים אלה, כיוון שהם קובעים חוקים שלא תמיד כתובים בטקסט!
- **סמל "איסור מגע ציוד" (No Equipment Contact):** אם אתה רואה סמל של **עיגול אדום עם קו אלכסוני (איסור) שמופיע על גבי לבנת לגו** או סימון דומה, המשמעות היא שיש מגבלת ציוד על המשימה. עליך להחיל את חוק איסור המגע באופן אוטומטי, ולהודיע למשתמש שבסיום המקצה אסור שיהיה מגע בין הציוד (למשל הרובוט) לבין דגם המשימה. עליך לדעת זאת **מראש** מבלי שהמשתמש יצטרך לתקן אותך!

### ביצוע המשימה השלבים (Internal Chain of Thought - אל תציג את המונחים "שלב 1", "Agent", אלא פעל לפיהם פנימית):

1. **חוקר הקבצים והתמונות (PDF/Image Searcher):**
   - קרא *אך ורק* לחוק/המשימה הספציפית שנשאלה מתוך הטקסט/קבצים/תמונות שסופקו לך. תמונות שמצורפות יכולות להכיל את חוקי המשימה. עדיפות עליונה למידע שמופיע בתמונה שהמשתמש העלה! התבסס עליהן באופן מוחלט!
   - **הנחיית חובה למשימות:** אם נשאלת על משימה מסוימת, עליך תמיד לבדוק את חוק המשימה ב-PDF (המידע המצורף) ובנוסף תמיד לבדוק ולאמת את המידע דרך חיפוש בגוגל (Google Search).
   - **איסור חמור על המצאת/ערבוב סעיפים:** אם במקור (תמונה/קובץ) שעוסק במשימה המבוקשת מופיעים רק סעיפים מסוימים, **אסור** לך להעתיק סעיפים ממשימות אחרות! התייחס **אך ורק** לאובייקטים המופיעים בחוקי המשימה הספציפית הזו.
   - אל תערבב משימות מחוץ לקבצים או התמונות. כשנשאלת על משימה מסוימת (למשל משימה 14) שנוגעת להגבלת נגיעה או ציוד, עליך להסתכל היטב על התמונה/PDF של דף המשימה ולחפש סמלים ויזואליים (כמו סמל איסור המגע האדום עם הקו) לפני שתפסוק שאין מגבלה! חפש גם בגוגל כדי לאמת.
   - **בדיקת כמות אובייקטים (קריטי):** אם יש ניקוד לפריט בודד המנוסח בלשון רבים (כמו "משקעי אדמה", "דגימות"), או שכתוב "לכל אחד" / "each" / "עבור מספר", חובה עליך לגלות ולחשב את הכמות המקסימלית. **לדוגמה, בעונת UNEARTHED משימה 01, יש 2 משקעי אדמה - וודא זאת בחיפוש!**

2. **חוקר הרשת (איתור כמויות ומידע חסר - חובה להפעיל כלי מערכת):**
   - **חובת הפעלת כלי חיפוש (googleSearch Tool):** כדי למצוא את כמות האובייקטים במגרש לחישוב הניקוד המקסימילי, עליך לקרוא בפועל לכלי \`googleSearch\`. **אל תנחש ואל תניח שאתה יודע את התשובה.** עליך לחפש \`fll [שם העונה] calculator\` או את תיאור המשימה המדויק באנגלית (למשל \`fll UNEARTHED M01\`) ולמצוא במפורש כמה אובייקטים כאלו יש במגרש (לדוגמה: ישנם 2 משקעי אדמה).
   - **חיפוש חובה:** גם אם המשימה נראית פשוטה (כמו משימה 01), עליך לוודא את הנתונים בחיפוש גוגל עבור העונה הספציפית.
   - **חיפוש באנגלית:** אם לא נמצאו תוצאות בעברית, חובה לחפש באנגלית.
   - **ציון החיפוש:** בתשובתך, ציין שביצעת בדיקה בחיפוש גוגל.

3. **שופט הזירה הראשי (Output generation):**
   - **זוהי התשובה היחידה שמוצגת למשתמש**. אל תרשום "Agent 1", "Agent 2" וכו' בתשובתך!
   - **תשובה ישירה ופשוטה:** ענה למשתמש ישירות על שאלתו, כמו שופט תכלס שנותן את הניקוד, בלי להביא ציטוטי הקדמה ארוכים ומעיקים. פשוט תענה.
   - **פרט את כל סעיפי הניקוד:** עבור המשימה המבוקשת, חובה עליך להציג ולחשב את **כל** סעיפי הניקוד שמופיעים במקור המידע (קבצים או חיפוש). אל תשמיט אף סעיף! (לדוגמה, במשימה 01 יש ניקוד על משקעי אדמה וגם על מברשת הארכיאולוגים - ציין את שניהם ואת החישוב של כולם).
   - **חישובי מקסימום:** כאשר מדובר על משימה שיש בה כמות ("לכל אחד"), הצג למשתמש את החישוב. למשל: "ישנם X אובייקטים במגרש (לפי בדיקה בחיפוש גוגל). לכן לסעיף זה: X * 10 = סה\"כ Y", ולאחר מכן חבר את זה יחד עם שאר סעיפי המשימה להצגת המקסימום הכללי.
   - כתוב בצורה ישירה, ללא שימוש במקורות חיצוניים בסגנון אקדמי וללא סימני LaTex מתמטיים מורכבים. השתמש במתמטיקה רגילה: 10 * 10 = 100.
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
- אם המשתמש נתן הוראה סותרת בשיחה - הוא הסמכות.
- **שפת המענה: עברית בלבד.**

--- מידע מהקבצים שהועלו ---
המידע הועלה כקבצים מצורפים (PDF/תמונות). עליך לקרוא אותם ישירות מתוך הקבצים המצורפים להודעה זו. חובה להשתמש בחיפוש גוגל עבור כל פרט חסר (חוקים, משימות, כמויות).
`;

      // Use the requested model directly
      const googleModelName = activeModel;

      // If we are calling a model that does not support system instructions natively, we prepend it.
      const useNativeSystemInstruction = googleModelName.startsWith('gemini-');
      if (!useNativeSystemInstruction) {
        currentParts.push({ text: `System Instructions:\n${systemPrompt}\n\nUser Question:` });
      }

      let currentApiKey = await getNextApiKey();
      let uploadClient = new GoogleGenAI({ apiKey: currentApiKey });

      // Extract and append text or base64 components from allFiles
      if (allFiles.length > 0) {
        currentParts.push({ text: "[\n" });
        let isFirstFileItem = true;
        
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
                         
          const fileTypeStr = rulebookFiles.some(r => r.name === file.key || r.url === file.url) ? "rulebook_image" : "user_image";

          if (isPdf) {
            // Check if it's a pre-processed R2 rulebook
            const isR2Rulebook = !file.actualFile && file.url && file.url.includes('fll-rules');
            
            if (isR2Rulebook) {
              console.log(`Fetching pre-processed PDF images from R2 for ${fileName} in parallel...`);
              const fetchTasks = Array.from({ length: 45 }, (_, i) => i + 1).map(async (pageIndex) => {
                try {
                  const imgUrl = `https://pub-9b07ff19511b4468a47d28bb2cb58176.r2.dev/fll-rules-images/${fileName}/page_${pageIndex}.jpg`;
                  const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
                  
                  if (imgRes.data.byteLength < 500 && new TextDecoder().decode(new Uint8Array(imgRes.data.slice(0, 100))).includes('<html')) {
                    return null;
                  }
                  
                  let binary = '';
                  const bytes = new Uint8Array(imgRes.data);
                  for (let i = 0; i < bytes.byteLength; i++) {
                    binary += String.fromCharCode(bytes[i]);
                  }
                  
                  return {
                    pageIndex,
                    inlineData: {
                      data: btoa(binary),
                      mimeType: 'image/jpeg'
                    }
                  };
                } catch (e) {
                  return null;
                }
              });
              
              const results = await Promise.all(fetchTasks);
              results
                .filter(res => res !== null)
                .sort((a: any, b: any) => a.pageIndex - b.pageIndex)
                .forEach((res: any) => {
                  if (!isFirstFileItem) currentParts.push({ text: ",\n" });
                  currentParts.push({ text: `  {\n    "type": "${fileTypeStr}",\n    "filename": "${fileName}",\n    "page": ${res.pageIndex},\n    "image": ` });
                  currentParts.push({ inlineData: res.inlineData });
                  currentParts.push({ text: `\n  }` });
                  isFirstFileItem = false;
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
                    const arrayBuffer = await pageImg.data.arrayBuffer();
                    let binary = '';
                    const bytes = new Uint8Array(arrayBuffer);
                    for (let i = 0; i < bytes.byteLength; i++) {
                      binary += String.fromCharCode(bytes[i]);
                    }
                    if (!isFirstFileItem) currentParts.push({ text: ",\n" });
                    currentParts.push({ text: `  {\n    "type": "${fileTypeStr}",\n    "filename": "${fileName}",\n    "page": ${pageIndex},\n    "image": ` });
                    currentParts.push({
                      inlineData: {
                        data: btoa(binary),
                        mimeType: 'image/jpeg'
                      }
                    });
                    currentParts.push({ text: `\n  }` });
                    isFirstFileItem = false;
                    pageIndex++;
                  } catch (err: any) {
                    console.error(`Failed to inline PDF page ${pageImg.name}:`, err);
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
                  
                  if (!isFirstFileItem) currentParts.push({ text: ",\n" });
                  currentParts.push({ text: `  {\n    "type": "${fileTypeStr}",\n    "filename": "${fileName}",\n    "image": ` });
                  currentParts.push({
                    fileData: {
                      fileUri: uploadResult.uri,
                      mimeType: uploadResult.mimeType || mimeType
                    }
                  });
                  currentParts.push({ text: `\n  }` });
                  isFirstFileItem = false;
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
        currentParts.push({ text: "\n]\n\n" });
      }

      // Add user query to the current turn parts
      currentParts.push({ text: question });

      contents.push({
        role: 'user',
        parts: currentParts
      });

      // 5. Verify the user is authenticated securely with Google OAuth
      const userToken = localStorage.getItem('google_access_token');
      if (!userToken) {
        throw new Error("⚠️ חובה להתחבר עם חשבון Google כדי להשתמש בבינה המלאכותית! אנא התחבר דרך כפתור ההתחברות למעלה.");
      }

      const generateContentConfig: any = {
        temperature: 0.8,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
        tools: [{ googleSearch: {} }]
      };

      if (useNativeSystemInstruction) {
        generateContentConfig.systemInstruction = systemPrompt;
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

          for await (const chunk of responseStream) {
            if (chunk.text) {
              responseText += chunk.text;
              if (onChunk) onChunk(chunk.text);
            }
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
            // Note: If we rotate keys, previously uploaded files using the old key will be inaccessible.
            // In a robust implementation, we'd re-upload them here. But for now we rotate the key.
          } else {
            throw genErr; // Other errors (e.g. 500, network error) throw immediately
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
