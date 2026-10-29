// Run with: npm test (node --test). Far-apart edits must stay separate
// regions; upac-site#2's header + footer edits were one page-tall ring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { splitRegions, isRenderNoise, changeRegions } from './regions.mjs';

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

test('a bar moved by half a pixel is render noise', () => {
  const before = bars((y) => (y >= 7 && y < 13 ? 20 : 240));
  // Half a pixel down: the top and bottom edge rows become 50/50 blends.
  const after = bars((y) => (y === 7 || y === 13 ? 130 : y > 7 && y < 13 ? 20 : 240));
  assert.ok(isRenderNoise(before, after, diffMask(before, after), 20, BAR));
});

test('a bar recoloured is a real change, not render noise', () => {
  const before = bars((y) => (y >= 7 && y < 13 ? 20 : 240));
  const after = bars((y) => (y >= 7 && y < 13 ? 200 : 240));
  assert.ok(!isRenderNoise(before, after, diffMask(before, after), 20, BAR));
});

test('a removed section gets a ring though no after pixel differs', () => {
  // Pure removal: pixelmatch saw nothing, the seam is the whole story.
  const flat = bars(() => 240);
  const { mask, regions } = changeRegions(flat, flat, new Uint8Array(400), [10], 20, 20, 5);
  assert.equal(regions.length, 1);
  assert.ok(regions[0].minY <= 10 && regions[0].maxY >= 9);
  assert.equal(mask[10 * 20], 1, 'the seam is marked in the returned mask');
});

test('a seam keeps its region even when the pixels around it look like render noise', () => {
  const before = bars((y) => (y >= 7 && y < 13 ? 20 : 240));
  const after = bars((y) => (y === 7 || y === 13 ? 130 : y > 7 && y < 13 ? 20 : 240));
  const pm = diffMask(before, after);
  assert.equal(changeRegions(before, after, pm, [], 20, 20, 5).regions.length, 0, 'render noise alone is dropped');
  assert.equal(changeRegions(before, after, pm, [12], 20, 20, 5).regions.length, 1, 'with a seam it stays');
});

test('a real edit near render noise is judged on its own, not with the noise', () => {
  // Noise band at 100-130, real edit at 200-210: within REGION_GAP of each
  // other, so they would group — but the noise is dropped first.
  const r = splitRegions(mask([[100, 130, 0, 49], [200, 210, 10, 20]]), W, H, 160, 6, 50,
    (box) => box.minY !== 100);
  assert.deepEqual(r, [{ minX: 10, minY: 200, maxX: 20, maxY: 210 }]);
});

test('a real edit beside render noise in the same rows keeps its ring', () => {
  // 120 wide: a bar at x 0-39 moves half a pixel (noise), a bar at x 80-119
  // is recoloured (real). Same rows, so one band — judged as two pieces.
  const make = (left, right) => {
    const png = new PNG({ width: 120, height: 20 });
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 120; x++) {
        const i = (y * 120 + x) * 4;
        const v = x < 40 ? left(y) : x >= 80 ? right(y) : 240;
        png.data[i] = png.data[i + 1] = png.data[i + 2] = v; png.data[i + 3] = 255;
      }
    }
    return png;
  };
  const bar = (y) => (y >= 7 && y < 13 ? 20 : 240);
  const before = make(bar, bar);
  const after = make((y) => (y === 7 || y === 13 ? 130 : y > 7 && y < 13 ? 20 : 240),
    (y) => (y >= 7 && y < 13 ? 200 : 240));
  const pm = new Uint8Array(120 * 20);
  for (let p = 0; p < pm.length; p++) pm[p] = before.data[p * 4] !== after.data[p * 4] ? 1 : 0;
  const { regions } = changeRegions(before, after, pm, [], 120, 20, 5);
  assert.equal(regions.length, 1);
  assert.equal(regions[0].minX, 80, 'only the recoloured bar is ringed');
});

test('pieces of one tall band group top to bottom, not left to right', () => {
  // One band (rows 0-999 joined by a dropped noise column at x 100), with a
  // real edit low on the left and another high on the right, 800 rows apart.
  const W2 = 200;
  const m = new Uint8Array(W2 * H);
  for (const [y0, y1, x0, x1] of [[0, 999, 100, 100], [900, 920, 0, 5], [100, 120, 190, 199]]) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m[y * W2 + x] = 1;
  }
  const r = splitRegions(m, W2, H, 160, 6, 50, (box) => box.minX !== 100);
  assert.deepEqual(r.map((x) => [x.minY, x.maxY]), [[100, 120], [900, 920]]);
});

test('the pixel floor applies to a grouped region, not to each band', () => {
  // Three 30-pixel bands 40 rows apart: each under the floor of 50, together over it.
  const r = splitRegions(mask([[100, 102, 0, 9], [140, 142, 0, 9], [180, 182, 0, 9]]), W, H, 160, 6, 50);
  assert.deepEqual(r, [{ minX: 0, minY: 100, maxX: 9, maxY: 182 }]);
});

test('regions are judged before the cap merges them', () => {
  // Four regions, cap 3: the two closest (400 and 590) would merge. Dropping
  // the one at 590 first must leave the one at 400 standing on its own.
  const spans = [[0, 0], [200, 200], [400, 400], [590, 590]].map(([a, b]) => [a, b, 0, 0]);
  const r = splitRegions(mask(spans), W, H, 160, 3, 0, (box) => box.minY !== 590);
  assert.deepEqual(r.map((x) => [x.minY, x.maxY]), [[0, 0], [200, 200], [400, 400]]);
});

test('past the cap, the closest neighbours merge first', () => {
  const spans = [[0, 0], [200, 200], [400, 400], [590, 590]].map(([a, b]) => [a, b, 0, 0]);
  const r = splitRegions(mask(spans), W, H, 160, 3);
  assert.deepEqual(r.map((x) => [x.minY, x.maxY]), [[0, 0], [200, 200], [400, 590]]);
});
