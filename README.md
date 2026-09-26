<p align="center">
  <img src="public/referee-logo.webp" alt="השופט הווירטואלי" width="160" />
</p>

<h1 align="center">שופט וירטואלי | Boeing727</h1>

<p align="center" dir="rtl">
  אפליקציית ווב שעונה על שאלות חוקים של FIRST LEGO League לפי חוברת החוקים של העונה
  <br />
  <a href="https://fllref.abrdns.com"><strong>https://fllref.abrdns.com</strong></a>
</p>

<p align="center">
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React%20%2B%20TypeScript-0066B3?logo=react&logoColor=white" alt="React + TypeScript" /></a>
  <a href="https://firebase.google.com"><img src="https://img.shields.io/badge/Firebase-ED1C24?logo=firebase&logoColor=white" alt="Firebase" /></a>
  <img src="https://img.shields.io/badge/tests-244%20passing-0066B3" alt="244 tests passing" />
</p>

<p align="center">
  <img src="docs/readme-strip.png" alt="" width="100%" height="8" />
</p>

<p align="center">
  <img src="docs/readme-hero.png" alt="מסך הכניסה לאפליקציה" width="720" />
</p>

<div dir="rtl">

## מה האפליקציה עושה

- עונה על שאלות חוקים וניקוד לפי עמודי החוברת הרשמית, עם ציטוט של מספרי החוקים והניקוד המדויק.
- שופטת תמונות מהזירה: מצלמים את הרובוט או את מצב המשימה, ומנוע ה-AI מזהה את המשימה ופוסק לפי החוברת.
- עובדת ב-12 שפות, כולל עברית מלאה (RTL).
- מזהה אוטומטית את העונה לפי החוברת שהועלתה (צבעים, שם וסמל).
- כוללת מסך ניהול לבעלים: תיקוני שופט שדורסים את החוברת, יומן שאלות, פידבק משתמשים, אנליטיקס והעלאת חוברת.

## איך זה בנוי

- **לקוח בלבד**: React + TypeScript + Vite, בלי שרת אפליקציה.
- **Firebase**: Authentication (כניסה עם Google), Firestore (הגדרות, מכסות, יומן), Realtime Database (נוכחות ויומן שאלות), Storage.
- **Cloudflare R2**: אחסון עמודי החוברת כתמונות.
- **מנוע השופט**: קוד צד-לקוח שמרכיב את הבקשה (חוברת, תמונות, היסטוריה, תיקוני שופט) ומחזיר תשובה בזרימה חיה, עם מאגר מפתחות וניסיונות חוזרים אוטומטיים כדי שהתשובה תגיע גם בעומס.
- כל הקוד הכבד (AI, המרת PDF, ניהול) נטען רק כשצריכים אותו, כדי שהדף יפתח מהר.

מבנה מפורט של הקוד והחוקים לשינויים בטוחים: [ARCHITECTURE.md](ARCHITECTURE.md).

## אבטחה ופרטיות

- כללי האבטחה של Firebase (`firestore.rules`, `database.rules.json`, `storage.rules`) הם גבול ההרשאות; מסכי הניהול הם נוחות בלבד.
- מכסת שאלות יומית נאכפת בצד הנתונים.
- מדיניות הפרטיות והתנאים מוצגים באפליקציה עצמה (`/privacy`).

## פיתוח מקומי

```bash
npm ci --ignore-scripts
npm run dev      # שרת פיתוח
npm run lint     # בדיקת טיפוסים (TypeScript strict)
npm test         # מבחני היחידה והקומפוננטות (node --test)
npm run build    # בנייה ל-production לתיקיית dist
```

האתר סטטי ומתארח ב-Netlify מתיקיית `dist` (ההפניות וה-headers ב-`public/_redirects` ו-`public/_headers`). כללי האבטחה של Firebase מופצים מ-`firebase.json`.

</div>
