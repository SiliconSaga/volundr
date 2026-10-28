// Run with: npm test (node --test). Far-apart edits must stay separate
// regions; upac-site#2's header + footer edits were one page-tall ring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { splitRegions, isShiftNoise } from './regions.mjs';

const W = 50, H = 1000;

function mask(spans) {
  const m = new Uint8Array(W * H);
  for (const [y0, y1, x0, x1] of spans) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W + x] = 1;
  }
  return m;
}

test('no changed pixels, no regions', () => {
  assert.deepEqual(splitRegions(new Uint8Array(W * H), W, H), []);
});

test('a header edit and a footer edit are two regions', () => {
  const r = splitRegions(mask([[10, 40, 0, 49], [900, 920, 5, 30]]), W, H);
  assert.deepEqual(r, [
    { minX: 0, minY: 10, maxX: 49, maxY: 40 },
    { minX: 5, minY: 900, maxX: 30, maxY: 920 },
  ]);
});

test('edits within the gap merge into one region', () => {
  const r = splitRegions(mask([[100, 110, 10, 20], [200, 210, 30, 40]]), W, H);
  assert.deepEqual(r, [{ minX: 10, minY: 100, maxX: 40, maxY: 210 }]);
});

test('a region at or under the pixel floor is dropped', () => {
  // 31x41 header block survives; a 2x3 speck far below does not.
  const r = splitRegions(mask([[10, 40, 0, 30], [900, 902, 7, 8]]), W, H, 160, 6, 50);
  assert.deepEqual(r, [{ minX: 0, minY: 10, maxX: 30, maxY: 40 }]);
});

// A 20x20 image with a dark 6px-tall bar; `shade(y)` gives each row's grey.
function bars(shade) {
  const png = new PNG({ width: 20, height: 20 });
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      const i = (y * 20 + x) * 4;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = shade(y); png.data[i + 3] = 255;
    }
  }
  return png;
}
const diffMask = (a, b) => {
  const m = new Uint8Array(400);
  for (let p = 0; p < 400; p++) m[p] = a.data[p * 4] !== b.data[p * 4] ? 1 : 0;
  return m;
};
const BAR = { minX: 0, minY: 0, maxX: 19, maxY: 19 };

test('a bar moved by half a pixel is shift noise', () => {
  const before = bars((y) => (y >= 7 && y < 13 ? 20 : 240));
  // Half a pixel down: the top and bottom edge rows become 50/50 blends.
  const after = bars((y) => (y === 7 || y === 13 ? 130 : y > 7 && y < 13 ? 20 : 240));
  assert.ok(isShiftNoise(before, after, diffMask(before, after), 20, 20, BAR));
});

test('a bar recoloured is a real change, not shift noise', () => {
  const before = bars((y) => (y >= 7 && y < 13 ? 20 : 240));
  const after = bars((y) => (y >= 7 && y < 13 ? 200 : 240));
  assert.ok(!isShiftNoise(before, after, diffMask(before, after), 20, 20, BAR));
});

test('past the cap, the closest neighbours merge first', () => {
  const spans = [[0, 0], [200, 200], [400, 400], [590, 590]].map(([a, b]) => [a, b, 0, 0]);
  const r = splitRegions(mask(spans), W, H, 160, 3);
  assert.deepEqual(r.map((x) => [x.minY, x.maxY]), [[0, 0], [200, 200], [400, 590]]);
});
