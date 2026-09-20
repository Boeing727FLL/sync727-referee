import { textStep, toInteractionParts, type InteractionStep, type LegacyPart } from './conversation';

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

export function appendCurrentTurn(history: LegacyPart[][], currentParts: LegacyPart[]): LegacyPart[][] {
  return [...history, currentParts];
}

export function critiquePlan(options: {
  textOnlyInput: InteractionStep[];
  userPhotoParts: LegacyPart[];
  draftText: string;
  critiquePrompt: string;
  photoAddendum: string;
}): InteractionStep[] {
  const photoStep: InteractionStep[] = options.userPhotoParts.length
    ? [{ type: 'user_input', content: options.userPhotoParts.flatMap(toInteractionParts) }]
    : [];
  return [
    ...options.textOnlyInput,
    ...photoStep,
    ...(options.draftText.trim() ? [textStep('model_output', options.draftText)] : []),
    textStep('user_input', options.critiquePrompt + (options.userPhotoParts.length ? options.photoAddendum : '')),
  ];
}

export function visibleCritique(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/<think>[\s\S]*/g, '').trim();
}

export function finalPlan(critiqueInput: InteractionStep[], critiqueText: string, finalPrompt: string): InteractionStep[] {
  return [...critiqueInput, textStep('model_output', critiqueText), textStep('user_input', finalPrompt)];
}
