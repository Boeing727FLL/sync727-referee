export type HistoryMessage = { role: 'user' | 'model'; text: string; files?: unknown[] };
export type LegacyPart = { text?: string; inlineData?: { data: string; mimeType?: string }; fileData?: { fileUri: string; mimeType?: string } };
type LegacyMessage = { role: 'user' | 'model'; parts: LegacyPart[] };
export type InteractionPart = { type: 'text'; text: string } | { type: 'image'; data?: string; uri?: string; mime_type?: string; resolution?: 'high' | 'ultra_high' };
export type InteractionStep = { type: 'user_input' | 'model_output'; content: InteractionPart[] };

const HISTORICAL_IMAGE_NOTE = '\n[הערת מערכת: המשתמש צירף תמונה בהודעה זו. התמונה ההיא כבר לא מוצגת לך, ולכן אל תשליך מהתשובה שלך עליה לתמונות עתידיות שיועלו].';

export function buildHistory(history: HistoryMessage[]): LegacyMessage[] {
  const contents: LegacyMessage[] = [];
  for (const message of history) {
    const role = message.role === 'user' ? 'user' : 'model';
    if (!contents.length && role === 'model') continue;
    const text = (message.text || ' ') + (role === 'user' && message.files?.length ? HISTORICAL_IMAGE_NOTE : '');
    const previous = contents[contents.length - 1];
    if (previous?.role === role) previous.parts.push({ text: `\n\n${text}` });
    else contents.push({ role, parts: [{ text }] });
  }
  return contents;
}

export function toInteractionParts(part: LegacyPart): InteractionPart[] {
  if (part.inlineData) return [{ type: 'image', data: part.inlineData.data, mime_type: part.inlineData.mimeType || 'image/jpeg', resolution: 'ultra_high' }];
  if (part.fileData) return [{ type: 'image', uri: part.fileData.fileUri, mime_type: part.fileData.mimeType || 'image/jpeg', resolution: 'ultra_high' }];
  const text = (part.text ?? '').trim();
  return text ? [{ type: 'text', text: part.text ?? '' }] : [];
}

export function toInteractionInput(messages: LegacyMessage[]): InteractionStep[] {
  return messages.map(message => ({ type: message.role === 'model' ? 'model_output' : 'user_input', content: message.parts.flatMap(toInteractionParts) }));
}

export function toInteractionTextOnly(messages: LegacyMessage[]): InteractionStep[] {
  return messages.map(message => ({
    type: message.role === 'model' ? 'model_output' as const : 'user_input' as const,
    content: message.parts.filter(part => !part.fileData && !part.inlineData && !(part.text && /^Image \d+:\n---/.test(part.text)) && !(part.text && part.text.includes('--- HIGH RESOLUTION ZOOM'))).map(part => ({ type: 'text' as const, text: part.text ?? '' })).filter(part => part.text.trim()),
  })).filter(message => message.content.length);
}

export function stepsToContents(steps: InteractionStep[]): LegacyMessage[] {
  return steps.map(step => ({ role: step.type === 'model_output' ? 'model' : 'user', parts: step.content.map(part => part.type === 'image' ? { inlineData: { data: part.data || '', mimeType: part.mime_type || 'image/jpeg' } } : { text: part.text }) }));
}

export function textStep(type: InteractionStep['type'], text: string): InteractionStep { return { type, content: [{ type: 'text', text }] }; }
