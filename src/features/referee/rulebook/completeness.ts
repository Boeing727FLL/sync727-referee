export type RulebookSource = { name: string; url: string };

export type CompletenessDeps = {
  fetchSource: (file: RulebookSource) => Promise<Blob>;
  countPdfPages: (blob: Blob) => Promise<number>;
  listRenderedPages: (fileName: string) => Promise<number[]>;
  fetchRenderedPage: (fileName: string, page: number) => Promise<Blob>;
  renderPdfFallback: (blob: Blob) => Promise<Array<{ data: Blob }>>;
};

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

export const RULEBOOK_INCOMPLETE_MESSAGE = 'חוברת החוקים הפעילה אינה שלמה כרגע, ולכן אני לא עונה כדי לא להסתמך על חוקים חלקיים. מנהל המערכת צריך לבדוק את קובצי החוברת והעמודים המעובדים.';

export function expectedPageNumbers(total: number): number[] {
  return Array.from({ length: total }, (_, index) => index + 1);
}

export function missingPageNumbers(total: number, actual: number[]): number[] {
  const present = new Set(actual.filter(Number.isInteger));
  return expectedPageNumbers(total).filter(page => !present.has(page));
}

function isPdf(name: string, blob: Blob): boolean {
  return /\.pdf$/i.test(name) || blob.type === 'application/pdf';
}

function isText(name: string, blob: Blob): boolean {
  return /\.(txt|md|json|xml)$/i.test(name) || blob.type.startsWith('text/') || blob.type === 'application/json';
}

async function requireUsableBlob(blob: Blob, diagnostic: RulebookDiagnostic): Promise<void> {
  if (!blob || blob.size === 0) throw new RulebookIncompleteError(diagnostic);
}

/**
 * Verify every active source. A complete pre-rendered PDF must contain every
 * page contiguously and every page object must be readable. Existing PDFs
 * with no rendered-page set remain compatible through the established
 * on-demand full-PDF fallback, but a partial set never silently falls back.
 */
export async function assertRulebookComplete(files: RulebookSource[], deps: CompletenessDeps): Promise<void> {
  if (!files.length) throw new RulebookIncompleteError({ code: 'empty-listing', detail: 'No active source files were listed.' });

  for (const file of files) {
    let source: Blob;
    try {
      source = await deps.fetchSource(file);
      await requireUsableBlob(source, { file: file.name, code: 'source-fetch', detail: 'The source object is empty.' });
    } catch (error) {
      if (error instanceof RulebookIncompleteError) throw error;
      throw new RulebookIncompleteError({ file: file.name, code: 'source-fetch', detail: error instanceof Error ? error.message : String(error) });
    }

    if (isText(file.name, source) && !isPdf(file.name, source)) {
      const text = await source.text();
      if (!text.trim()) throw new RulebookIncompleteError({ file: file.name, code: 'empty-text', detail: 'The text artifact has no rule content.' });
      continue;
    }

    if (!isPdf(file.name, source)) continue;

    let total: number;
    try {
      total = await deps.countPdfPages(source);
      if (!Number.isInteger(total) || total < 1) throw new Error(`Invalid page count: ${total}`);
    } catch (error) {
      throw new RulebookIncompleteError({ file: file.name, code: 'invalid-pdf', detail: error instanceof Error ? error.message : String(error) });
    }

    let pages: number[];
    try {
      pages = [...new Set(await deps.listRenderedPages(file.name))].sort((a, b) => a - b);
    } catch {
      pages = [];
    }

    if (pages.length === 0) {
      try {
        const rendered = await deps.renderPdfFallback(source);
        if (rendered.length !== total || rendered.some(page => !page.data || page.data.size === 0)) {
          throw new Error(`Rendered ${rendered.length} of ${total} pages.`);
        }
      } catch (error) {
        throw new RulebookIncompleteError({ file: file.name, code: 'fallback-render', detail: error instanceof Error ? error.message : String(error) });
      }
      continue;
    }

    const missing = missingPageNumbers(total, pages);
    const extra = pages.filter(page => page < 1 || page > total);
    if (missing.length || extra.length) {
      throw new RulebookIncompleteError({
        file: file.name,
        code: 'missing-page',
        detail: `Expected pages 1-${total}; missing [${missing.join(', ')}]${extra.length ? `; unexpected [${extra.join(', ')}]` : ''}.`,
      });
    }

    for (const page of expectedPageNumbers(total)) {
      try {
        const artifact = await deps.fetchRenderedPage(file.name, page);
        await requireUsableBlob(artifact, { file: file.name, code: 'page-fetch', detail: `Rendered page ${page} is empty.` });
      } catch (error) {
        if (error instanceof RulebookIncompleteError) throw error;
        throw new RulebookIncompleteError({ file: file.name, code: 'page-fetch', detail: `Rendered page ${page}: ${error instanceof Error ? error.message : String(error)}` });
      }
    }
  }
}
