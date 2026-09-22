/** Photo-attachment validation: provider MIME allowlist, count and byte budget. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectAttachableImages } from '../src/features/referee/chat/attachImages.ts';
import { MAX_ATTACH_TOTAL_BYTES } from '../src/features/referee/config.ts';

const img = (type: string, size: number) => ({ type, size });

test('non-image files are rejected as nonImage', () => {
  const { accepted, rejected } = selectAttachableImages([img('application/pdf', 100)], { count: 0, bytes: 0 });
  assert.equal(accepted.length, 0);
  assert.equal(rejected.nonImage, 1);
});

test('only provider-decodable image types pass (SVG/TIFF/BMP/GIF rejected)', () => {
  const picked = [img('image/png', 1), img('image/svg+xml', 1), img('image/tiff', 1), img('image/heic', 1), img('image/gif', 1), img('image/bmp', 1)];
  const { accepted, rejected } = selectAttachableImages(picked, { count: 0, bytes: 0 });
  assert.deepEqual(accepted.map(f => f.type), ['image/png', 'image/heic']);
  assert.equal(rejected.unsupportedType, 4);
});

test('a fourth photo is rejected by count even when tiny', () => {
  const current = { count: 3, bytes: 100 };
  const { accepted, rejected } = selectAttachableImages([img('image/png', 1)], current);
  assert.equal(accepted.length, 0);
  assert.equal(rejected.tooMany, 1);
});

test('the byte budget is cumulative across existing and new attachments', () => {
  const half = MAX_ATTACH_TOTAL_BYTES / 2;
  const current = { count: 1, bytes: half };
  const { accepted, rejected } = selectAttachableImages(
    [img('image/jpeg', half + 1), img('image/jpeg', half)], current);
  // First overflows (half+1 + half > budget), second lands exactly full.
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].size, half);
  assert.equal(rejected.tooLarge, 1);
});

test('a file is counted once, by the first failing check', () => {
  const { rejected } = selectAttachableImages([img('image/svg+xml', MAX_ATTACH_TOTAL_BYTES * 2)], { count: 0, bytes: 0 });
  assert.deepEqual(rejected, { nonImage: 0, unsupportedType: 1, tooLarge: 0, tooMany: 0 });
});
