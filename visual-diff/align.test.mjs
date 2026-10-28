// Run with: npm test (node --test). Row alignment must turn "everything moved
// down because the header grew" into "the header grew" — the upac-site#2
// regression ringed 17 whole pages for one new top band.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { alignRows, matchRows, hunksFrom } from './align.mjs';

const W = 40;

// A page as a list of row shades: each row is a solid full-width line.
function page(shades) {
  const png = new PNG({ width: W, height: shades.length });
  shades.forEach((s, y) => {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      png.data[i] = s; png.data[i + 1] = s; png.data[i + 2] = s; png.data[i + 3] = 255;
    }
  });
  return png;
}

const body = Array.from({ length: 60 }, (_, y) => (y * 37) % 251);

function changedRows(a, b) {
  const out = new PNG({ width: a.width, height: a.height });
  pixelmatch(a.data, b.data, out.data, a.width, a.height, { threshold: 0.1, diffMask: true });
  const rows = new Set();
  for (let p = 0; p < a.width * a.height; p++) if (out.data[p * 4 + 3]) rows.add(Math.floor(p / a.width));
  return [...rows].sort((x, y) => x - y);
}

test('identical pages align with no hunks', () => {
  const al = alignRows(page(body), page(body));
  assert.deepEqual(al.hunks, []);
  assert.deepEqual(changedRows(al.baseline, page(body)), []);
});

test('a band inserted at the top is the only change once aligned', () => {
  const band = [5, 5, 5, 5, 5];
  const after = page([...band, ...body]);
  const al = alignRows(page(body), after);
  assert.deepEqual(al.hunks, [{ aStart: 0, aEnd: 0, bStart: 0, bEnd: 5 }]);
  assert.deepEqual(changedRows(al.baseline, after), [0, 1, 2, 3, 4]);
  // Purely inserted rows came from no before rows: an empty range at the seam.
  const [top, bot] = al.beforeRange(0, 4);
  assert.ok(bot < top, 'inserted content maps to an empty before range');
  assert.equal(top, 0);
});

test('a row edited mid-page is caught in place, with the rest matched', () => {
  const edited = [...body];
  edited[30] = 250;
  const al = alignRows(page(body), page(edited));
  assert.deepEqual(changedRows(al.baseline, page(edited)), [30]);
  assert.deepEqual(al.beforeRange(30, 30), [30, 30]);
});

test('removed rows are reported where they vanished', () => {
  const after = page([...body.slice(0, 20), ...body.slice(26)]);
  const al = alignRows(page(body), after);
  assert.deepEqual(al.removedAt, [20]);
  assert.equal(al.removedRows, 6);
  assert.deepEqual(changedRows(al.baseline, after), [], 'a pure removal leaves no differing after pixel');
  // An after range spanning the seam maps back over the removed rows.
  assert.deepEqual(al.beforeRange(19, 20), [19, 26]);
});

test('a header that grew AND a footer edit stay two separate hunks', () => {
  const after = [9, 9, 9, 9, 9, ...body.slice(0, 50), 200, ...body.slice(51)];
  const al = alignRows(page(body), page(after));
  assert.equal(al.hunks.length, 2);
  assert.deepEqual(changedRows(al.baseline, page(after)), [0, 1, 2, 3, 4, 55]);
});

test('a gap one row taller is spacing, not a change', () => {
  const before = [...body.slice(0, 30), 7, 7, ...body.slice(30)];
  const after = [...body.slice(0, 30), 7, 7, 7, ...body.slice(30)];
  const al = alignRows(page(before), page(after));
  assert.deepEqual(al.hunks, []);
  assert.deepEqual(al.removedAt, []);
  assert.deepEqual(changedRows(al.baseline, page(after)), []);
});

test('a solid band growing past the spacing limit is still a change', () => {
  const before = [...body.slice(0, 30), 7, 7, ...body.slice(30)];
  const after = [...body.slice(0, 30), 7, 7, 7, 7, 7, 7, 7, ...body.slice(30)];
  const al = alignRows(page(before), page(after));
  assert.equal(al.hunks.length, 1);
});

test('rows replaced in place stay one hunk compared against what they replaced', () => {
  // Myers can split a same-size replacement into a removal and an insertion
  // around one coincidentally matching row; coalescing keeps them together.
  // Shades 251-255 never occur in `body` (all values are mod 251).
  const after = [...body];
  [after[40], after[41], after[42], after[44], after[45]] = [252, 253, 254, 255, 251];
  const al = alignRows(page(body), page(after));
  assert.equal(al.hunks.length, 1);
  assert.deepEqual(al.removedAt, []);
  assert.deepEqual(changedRows(al.baseline, page(after)), [40, 41, 42, 44, 45]);
});

test('pages too different to align return null', () => {
  const other = body.map((s) => (s + 1) % 251);
  assert.equal(alignRows(page(body), page(other), 10), null);
});

test('matchRows and hunksFrom agree on a simple sequence', () => {
  const pairs = matchRows(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e']);
  assert.deepEqual(pairs, [[0, 0], [2, 2], [3, 3]]);
  assert.deepEqual(hunksFrom(pairs, 4, 5), [
    { aStart: 1, aEnd: 2, bStart: 1, bEnd: 2 },
    { aStart: 4, aEnd: 4, bStart: 4, bEnd: 5 },
  ]);
});
