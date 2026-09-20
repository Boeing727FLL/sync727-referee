/** Product timing and UI constants. Keeping these together makes tuning auditable. */
export const STOPPED_TEXT = 'הפעולה הופסקה על ידי המשתמש.';
export const DAY_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_REPROMPT_DAYS = 14;
export const FEEDBACK_QUIET_AFTER_SUBMIT_DAYS = 45;
export const FEEDBACK_PROMPT_DELAY_MS = 2_500;
export const TOAST_MS = 2_600;
export const ENTER_FLASH_MS = 1_200;
export const TYPEWRITER_TICK_MS = 35;
export const MAX_ATTACHED_IMAGES = 3;

export const MENU_ROW_CLASS = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/70 text-slate-700 hover:text-slate-900 font-bold text-sm transition-colors text-right cursor-pointer';
export const MISSION_ACCENTS = ['#FFC400', '#0B6BCB', '#7FB35E', '#E1251B'] as const;
export const GRID_BG = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='56' height='56'>` +
  `<path d='M56 0H0v56' fill='none' stroke='rgba(255,255,255,0.18)' stroke-width='1'/></svg>`
);
