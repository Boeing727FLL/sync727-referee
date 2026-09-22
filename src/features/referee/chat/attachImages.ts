/**
 * Photo-attachment validation (pure decisions, toasts chosen by the caller).
 *
 * Two provider constraints drive this (ai.google.dev/gemini-api/docs/
 * image-understanding): inline images must be PNG/JPEG/WEBP/HEIC/HEIF, and
 * the TOTAL request - prompt, rulebook pages and photos together - is
 * capped at 20MB. Photos therefore keep a raw-bytes budget (config) that
 * leaves room for the rest instead of failing at the API as a generic
 * "communication error".
 */

import { ALLOWED_IMAGE_TYPES, MAX_ATTACH_TOTAL_BYTES, MAX_ATTACHED_IMAGES } from '../config';

export type AttachCandidate = { type: string; size: number };

export type AttachRejection = 'nonImage' | 'unsupportedType' | 'tooLarge' | 'tooMany';

export type AttachSelection<T> = {
  accepted: T[];
  /** Count per rejection reason, in evaluation order; a file is counted once. */
  rejected: Record<AttachRejection, number>;
};

export function selectAttachableImages<T extends AttachCandidate>(
  picked: readonly T[],
  current: { count: number; bytes: number },
): AttachSelection<T> {
  const rejected: Record<AttachRejection, number> = { nonImage: 0, unsupportedType: 0, tooLarge: 0, tooMany: 0 };
  const accepted: T[] = [];
  let count = current.count;
  let bytes = current.bytes;
  for (const file of picked) {
    if (!file.type.startsWith('image/')) { rejected.nonImage++; continue; }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) { rejected.unsupportedType++; continue; }
    if (count >= MAX_ATTACHED_IMAGES) { rejected.tooMany++; continue; }
    if (bytes + file.size > MAX_ATTACH_TOTAL_BYTES) { rejected.tooLarge++; continue; }
    accepted.push(file);
    count++;
    bytes += file.size;
  }
  return { accepted, rejected };
}
