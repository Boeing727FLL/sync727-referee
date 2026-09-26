/** File fetching and request-part building for the referee engine: R2
 *  rulebook pages, inline PDFs/text/images and the parts the model sees. */
import { R2_PUBLIC_URL } from '../../../lib/r2Config';
import { listRulebookImagePages } from '../../../lib/r2';
import { fileToBase64 } from '../rulebook/pdfRendering';
import { RulebookIncompleteError } from '../rulebook/completeness';
import type { LegacyPart } from './conversation';

export type UserFile = { url: string; key: string; base64?: string; actualFile?: File };
export type RequestFile = UserFile & { isRulebook: boolean };
export type PageImage = { pageIndex: number; data: string; url: string };
type FetchedBlob = { data: Blob; mimeType: string };

const R2_PROXY_PATH = '/api/r2/file/';
const MIN_HTML_PROBE_BYTES = 500;
const HTML_PROBE_BYTES = 100;

function resolveR2Url(url: string): string {
  if (!url.includes(R2_PROXY_PATH)) return url;
  const fileKey = url.substring(url.indexOf(R2_PROXY_PATH) + R2_PROXY_PATH.length);
  return `${R2_PUBLIC_URL}/${fileKey}`;
}

export async function fetchBlob(url: string, signal?: AbortSignal): Promise<FetchedBlob | null> {
  try {
    const response = await fetch(resolveR2Url(url), { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return {
      data: await response.blob(),
      mimeType: response.headers.get('content-type') || 'image/jpeg',
    };
  } catch (error) {
    console.error('Could not fetch blob:', url, error);
    return null;
  }
}

export async function getInlineBlob(file: RequestFile, signal?: AbortSignal): Promise<Blob | File | null> {
  if (file.actualFile) return file.actualFile;
  if (file.base64) return (await fetch(file.base64, { signal })).blob();
  if (file.url.startsWith('data:')) return (await fetch(file.url, { signal })).blob();
  return null;
}

export async function appendImagePart(
  parts: LegacyPart[],
  prefixText: string,
  blob: Blob | File,
  mimeType = 'image/jpeg',
): Promise<void> {
  parts.push({ text: prefixText });
  parts.push({
    inlineData: {
      data: await fileToBase64(blob),
      mimeType,
    },
  });
}

export function appendBase64ImagePart(parts: LegacyPart[], prefixText: string, data: string, mimeType = 'image/jpeg', url?: string): void {
  parts.push({ text: prefixText });
  // The public URL rides along: requests send the page by link (the model
  // fetches it) and keep the bytes only for the inline fallback.
  parts.push({ inlineData: { data, mimeType }, ...(url ? { fileData: { fileUri: url, mimeType } } : {}) });
}

export async function fetchR2ImageSet(fileName: string, signal?: AbortSignal): Promise<{ pages: PageImage[]; listedPages: number[] }> {
  let pageNumbers: number[];
  try {
    pageNumbers = await listRulebookImagePages(fileName);
  } catch (error) {
    throw new RulebookIncompleteError({ file: fileName, code: 'page-fetch', detail: `Rendered page listing failed: ${error instanceof Error ? error.message : String(error)}` });
  }
  const results = await mapPool(pageNumbers, 6, async (pageIndex) => {
    if (signal?.aborted) return null;
    const encodedFileName = encodeURIComponent(fileName);
    const imageUrl = `${R2_PUBLIC_URL}/fll-rules-images/${encodedFileName}/page_${pageIndex}.jpg`;
    const response = await fetch(imageUrl, { signal });
    if (!response.ok) throw new RulebookIncompleteError({ file: fileName, code: 'page-fetch', detail: `Rendered page ${pageIndex} returned HTTP ${response.status}.` });
    const imageData = await response.arrayBuffer();
    const isHtmlError = imageData.byteLength < MIN_HTML_PROBE_BYTES &&
      new TextDecoder().decode(new Uint8Array(imageData.slice(0, HTML_PROBE_BYTES))).includes('<html');
    if (!imageData.byteLength || isHtmlError) throw new RulebookIncompleteError({ file: fileName, code: 'page-fetch', detail: `Rendered page ${pageIndex} is empty or corrupt.` });
    return { pageIndex, url: imageUrl, data: await fileToBase64(new Blob([imageData], { type: 'image/jpeg' })) };
  });
  return { pages: results.filter((page): page is PageImage => page !== null), listedPages: pageNumbers };
}

/** Bounded-concurrency map that preserves input order. */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(Math.max(size, 1), Math.max(items.length, 1))).fill(0).map(async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
