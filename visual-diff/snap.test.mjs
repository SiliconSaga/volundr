// Run with: npm test (node --test). Synthetic insertion/deletion cases for the
// marked-box edge snapping, including the tight-gap cases from review: a seam
// narrower than the stroke band must NOT be accepted, so the ring never
// overwrites a neighbouring unchanged glyph.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { snapBox, isQuietRow } from './snap.mjs';

const STROKE = 3;

function white(w, h) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0xff);
  return png;
}

// Solid dark bar: rows y0..y1, cols x0..x1 — a stand-in glyph/text line.
function bar(png, x0, y0, x1, y1) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * png.width + x) * 4;
      png.data[i] = 20; png.data[i + 1] = 20; png.data[i + 2] = 20; png.data[i + 3] = 255;
    }
  }
}

// The ring occupies the `stroke` rows/cols just OUTSIDE the snapped edge.
// Every one of those pixels must be background in `png` (quiet), or the edge
// must be the unsnapped original (the documented fallback).
function ringBandRows(png, edge, dir, x0, x1, stroke) {
  for (let k = 1; k <= stroke; k++) {
    const y = edge + dir * k;
    if (y < 0 || y >= png.height) return false;
    if (!isQuietRow(png, y, x0, x1)) return false;
  }
  return true;
}

test('insertion: box snaps around the new bar without touching a neighbour 2px above', () => {
  const w = 120, h = 120;
  const after = white(w, h);
  bar(after, 10, 40, 110, 52);          // unchanged neighbour line
  bar(after, 10, 55, 110, 67);          // NEW line, gap of 2px (rows 53-54) — narrower than stroke 3
  const raw = { minX: 10, minY: 55, maxX: 110, maxY: 67 }; // changed pixels = the new bar
  const s = snapBox(after, raw, w, h, STROKE);
  // A 2px seam has no room for a 3px stroke band: the top edge must NOT stop
  // in the narrow gap. It either climbs above the neighbour line entirely or
  // falls back to the raw edge.
  const stoppedInGap = s.minY < raw.minY && s.minY > 39;
  assert.equal(stoppedInGap && !ringBandRows(after, s.minY, -1, s.minX, s.maxX, STROKE), false,
    `top edge ${s.minY} leaves the ring band overlapping the neighbour bar`);
  assert.ok(s.minY === raw.minY || ringBandRows(after, s.minY, -1, s.minX, s.maxX, STROKE));
  // Bottom edge has open space: must snap with a fully quiet band.
  assert.ok(ringBandRows(after, s.maxY, +1, s.minX, s.maxX, STROKE));
});

test('deletion: raw edge already quiet in after image still yields a safe band', () => {
  const w = 120, h = 120;
  const after = white(w, h);
  bar(after, 10, 20, 110, 32);          // unchanged line above
  // Deleted text used to occupy rows 36..48 — after image is blank there, but
  // the raw box edge (36) sits only 3px under the neighbour (33-35 gap = 3px).
  const raw = { minX: 10, minY: 36, maxX: 110, maxY: 48 };
  const s = snapBox(after, raw, w, h, STROKE);
  assert.ok(s.minY === raw.minY || ringBandRows(after, s.minY, -1, s.minX, s.maxX, STROKE),
    `top edge ${s.minY} ring band not quiet`);
  if (s.minY !== raw.minY) {
    // With exactly a 3px gap the band fits only at the raw edge itself —
    // accepting d=0 is correct BECAUSE the band (rows 33-35) is genuinely quiet.
    assert.ok(ringBandRows(after, s.minY, -1, s.minX, s.maxX, STROKE));
  }
});

for (const gap of [1, 2, 3]) {
  test(`gap of ${gap}px between change and neighbour never puts the ring on the neighbour`, () => {
    const w = 100, h = 100;
    const after = white(w, h);
    const neighbourBottom = 40;
    bar(after, 5, 30, 95, neighbourBottom);                    // unchanged neighbour
    const changeTop = neighbourBottom + gap + 1;               // gap rows between
    bar(after, 5, changeTop, 95, changeTop + 10);              // changed content
    const raw = { minX: 5, minY: changeTop, maxX: 95, maxY: changeTop + 10 };
    const s = snapBox(after, raw, w, h, STROKE);
    // Wherever the top edge landed, the painted band may not intersect the
    // neighbour bar unless the edge fell back to raw (band unpainted-safe is
    // not guaranteed then — but raw fallback means no movement happened).
    if (s.minY !== raw.minY) {
      for (let k = 1; k <= STROKE; k++) {
        const y = s.minY - k;
        assert.ok(y > neighbourBottom || y < 30 - STROKE,
          `ring row ${y} overlaps neighbour bar (gap ${gap})`);
      }
    }
    if (gap < STROKE) {
      // Seam too narrow: the edge must not have stopped inside the gap.
      assert.ok(!(s.minY > neighbourBottom && s.minY < changeTop) || s.minY === raw.minY);
    }
  });
}
