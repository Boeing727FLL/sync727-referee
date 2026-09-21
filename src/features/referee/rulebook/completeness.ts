/**
 * Fail-closed rulebook completeness policy.
 *
 * The ask path (services/geminiService.ts) attaches the active rulebook to
 * every question, and answering from a partial rulebook is worse than not
 * answering: any gap throws RulebookIncompleteError, and the caller maps it
 * to the localized chat.rulebookIncomplete notice instead of an answer.
 */

export type RulebookDiagnostic = {
  file?: string;
  code: 'empty-listing' | 'source-fetch' | 'empty-text' | 'invalid-pdf' | 'missing-page' | 'page-fetch' | 'fallback-render';
  detail: string;
};

export class RulebookIncompleteError extends Error {
  diagnostic: RulebookDiagnostic;
  constructor(diagnostic: RulebookDiagnostic) {
    super(`Rulebook incomplete [${diagnostic.code}]${diagnostic.file ? ` ${diagnostic.file}` : ''}: ${diagnostic.detail}`);
    this.name = 'RulebookIncompleteError';
    this.diagnostic = diagnostic;
  }
}

/**
 * A pre-rendered PDF page set is complete only when it lists exactly pages
 * 1..expectedPages, contiguously and in order. An EMPTY listing means the
 * rulebook predates pre-rendering; the caller then renders the whole PDF on
 * the fly (verified separately), so it is not an error.
 */
export function assertListedPagesComplete(fileName: string, expectedPages: number, listedPages: number[]): void {
  if (!listedPages.length) return;
  const complete = listedPages.length === expectedPages && listedPages.every((page, index) => page === index + 1);
  if (!complete) {
    throw new RulebookIncompleteError({
      file: fileName,
      code: 'missing-page',
      detail: `Expected pages 1-${expectedPages}; listed [${listedPages.join(', ')}].`,
    });
  }
}
