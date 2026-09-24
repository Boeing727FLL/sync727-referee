
const CLEAN_IMAGE_ANALYSIS_PREFIX = `⚠️⚠️⚠️ [הנחיית שיפוט קריטית - ניתוח עצמאי נקי ללא הטיה] ⚠️⚠️⚠️
עליך לנתח את התמונה/קבצים שהועלו כעת במנותק ובנפרד לחלוטין מכל משימה, חוק או תמונה קודמת שדוברה בצ'אט (כמו משימה 5 או כל נושא קודם). אל תניח בשום אופן שהתמונה הזו קשורה אליהם!
בצע זיהוי אובייקטיבי ונקי של האובייקטים והדגמים המופיעים בתמונה הזו בפועל, והשב רק לפיה.

השאלה המקורית של המשתמש:
`;

export function activeSeason(seasonName: string): string | null {
  const value = seasonName?.trim();
  return value && value !== 'UNKNOWN' ? value : null;
}

export function buildQuestionText(question: string, hasUserFiles: boolean, cognitivePrompt: string): string {
  const prompt = hasUserFiles ? `${CLEAN_IMAGE_ANALYSIS_PREFIX}"${question}"` : question;
  return prompt + cognitivePrompt;
}
