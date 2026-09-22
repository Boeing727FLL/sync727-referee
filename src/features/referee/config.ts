/** Product timing and UI constants. Keeping these together makes tuning auditable. */
export const DAY_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_REPROMPT_DAYS = 14;
export const FEEDBACK_QUIET_AFTER_SUBMIT_DAYS = 45;
export const FEEDBACK_PROMPT_DELAY_MS = 2_500;
export const TOAST_MS = 2_600;
export const ENTER_FLASH_MS = 1_200;
export const TYPEWRITER_TICK_MS = 35;
export const MAX_ATTACHED_IMAGES = 3;
/**
 * Photo attachments share one inline-bytes budget with the rulebook pages:
 * the provider caps the TOTAL request (prompt + all inline images) at 20MB
 * (ai.google.dev/gemini-api/docs/image-understanding). Keeping photos at
 * or below 10MB raw (~13.3MB after base64) leaves room for the rulebook
 * and prompt instead of dying at the API with a generic error.
 */
export const MAX_ATTACH_TOTAL_BYTES = 10 * 1024 * 1024;
/** Formats the provider actually decodes (same source as the cap above). */
export const ALLOWED_IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
]);

export const MENU_ROW_CLASS = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] text-white/70 hover:text-white font-bold text-sm transition-colors text-start cursor-pointer';
export const GRID_BG = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'>` +
  `<path d='M56 0H0v56' fill='none' stroke='rgba(255,255,255,0.18)' stroke-width='1'/></svg>`
);
