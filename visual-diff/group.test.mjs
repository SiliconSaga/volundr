// Run with: npm test (node --test). The grouping key must depend on the
// changed region alone — the mtl-soccer#6 regression was per-page context
// (each page's own heading inside the crop margin) leaking into the key and
// scattering one identical nav change into 18 one-route groups.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { regionKey } from './group.mjs';

function white(w, h) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0xff);
  return png;
}

function bar(png, x0, y0, x1, y1, shade) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = shade; png.data[i + 1] = shade; png.data[i + 2] = shade; png.data[i + 3] = 255;
    }
  }
}

// A synthetic page: shared "header" band up top, page-specific body content.
function page(bodyShade, bodyTop, withNavItem) {
  const png = white(120, 120);
  bar(png, 0, 0, 119, 15, 40);                       // shared header band
  if (withNavItem) bar(png, 70, 4, 90, 11, 230);     // the "new nav item"
  bar(png, 10, bodyTop, 110, bodyTop + 20, bodyShade); // per-page body
  return png;
}

const BOX = { minX: 70, minY: 4, maxX: 90, maxY: 11 };

test('identical change groups across pages with different body content', () => {
  const keyA = regionKey(page(20, 60, false), page(20, 60, true), BOX);
  const keyB = regionKey(page(90, 55, false), page(90, 55, true), BOX);
  assert.equal(keyA, keyB, 'same header change on two different pages must share a key');
});

test('a different change in the same box gets a different key', () => {
  const differentAfter = page(20, 60, false);
  bar(differentAfter, 72, 5, 88, 10, 120);           // different item pixels
  const keyA = regionKey(page(20, 60, false), page(20, 60, true), BOX);
  const keyC = regionKey(page(20, 60, false), differentAfter, BOX);
  assert.notEqual(keyA, keyC);
});

test('the same pixels at a different box position get a different key', () => {
  const before = page(20, 60, false);
  const after = page(20, 60, true);
  const shifted = { minX: 69, minY: 3, maxX: 89, maxY: 10 };
  assert.notEqual(regionKey(before, after, BOX), regionKey(before, after, shifted));
});
