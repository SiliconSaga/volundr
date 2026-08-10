// Box-edge snapping for the marked ("what changed") screenshots. A raw
// changed-pixel bounding box regularly slices through glyphs: remove one word
// and the box's top edge lands on a comma's topmost pixel — mid-line — so the
// ring reads as a strikethrough over words that never changed. Each edge grows
// outward to the nearest seam of the AFTER image with room for the ring's
// stroke band; if no such seam exists within the cap, the raw edge stands (the
// ring may touch glyphs there — exactly the pre-snapping behavior, never worse).
//
// A seam is NOT merely "uniform pixels": a solid horizontal rule is uniform
// and is content; so is the interior of a solid banner. A qualifying seam must
// be uniform AND match the LOCAL BACKGROUND, estimated by majority vote over
// eight samples on the crop-region perimeter (crops are mostly background —
// corners and edge midpoints of the box-plus-margin region land on it in any
// realistic layout, and the estimate follows dark-themed pages correctly).
// With no clear majority there is no background estimate and no snapping.
export const QUIET_TOLERANCE = 8; // per-channel wiggle allowed within a "uniform" seam
export const SNAP_ROWS = 48;
// Columns get a far larger cap on purpose — reaching the text column's margin
// turns a disorienting mid-paragraph sliver into whole readable lines.
export const SNAP_COLS = 480;
const BG_MARGIN = 48;      // perimeter sampled at box + this margin (the crop region)
const BG_MAJORITY = 5;     // of 8 perimeter samples

function px(png, x, y) {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function same(a, b) {
  return Math.abs(a[0] - b[0]) <= QUIET_TOLERANCE
    && Math.abs(a[1] - b[1]) <= QUIET_TOLERANCE
    && Math.abs(a[2] - b[2]) <= QUIET_TOLERANCE
    && Math.abs(a[3] - b[3]) <= QUIET_TOLERANCE;
}

// Uniform along the row/col within [x0,x1]/[y0,y1], judged against `ref`
// (RGBA) — callers supply the estimated background so "uniform" means
// "uniformly background", not merely "uniformly colored".
export function isQuietRow(png, y, x0, x1, ref) {
  const base = ref ?? px(png, x0, y);
  for (let x = x0; x <= x1; x++) {
    if (!same(px(png, x, y), base)) return false;
  }
  return true;
}

export function isQuietCol(png, x, y0, y1, ref) {
  const base = ref ?? px(png, x, y0);
  for (let y = y0; y <= y1; y++) {
    if (!same(px(png, x, y), base)) return false;
  }
  return true;
}

// Majority color of eight points on the crop-region perimeter (corners + edge
// midpoints of box grown by BG_MARGIN, clamped). Null when fewer than
// BG_MAJORITY samples agree — no estimate, no snapping.
export function localBackground(png, box, w, h) {
  const x0 = Math.max(0, box.minX - BG_MARGIN), y0 = Math.max(0, box.minY - BG_MARGIN);
  const x1 = Math.min(w - 1, box.maxX + BG_MARGIN), y1 = Math.min(h - 1, box.maxY + BG_MARGIN);
  const xm = Math.floor((x0 + x1) / 2), ym = Math.floor((y0 + y1) / 2);
  const samples = [
    px(png, x0, y0), px(png, xm, y0), px(png, x1, y0),
    px(png, x0, ym), px(png, x1, ym),
    px(png, x0, y1), px(png, xm, y1), px(png, x1, y1),
  ];
  for (const cand of samples) {
    let votes = 0;
    for (const s of samples) if (same(s, cand)) votes++;
    if (votes >= BG_MAJORITY) return cand;
  }
  return null;
}

// Expand each box edge outward to the nearest position whose exterior stroke
// band (`stroke` rows/cols just outside the edge — the exact pixels the ring
// will occupy) is entirely background. Rows first with the raw x-extent, then
// columns with the widened y-extent, so a column seam is judged against every
// text line the box now spans.
export function snapBox(png, box, w, h, stroke) {
  if (!box) return box;
  const bg = localBackground(png, box, w, h);
  if (!bg) return box;
  let { minX, minY, maxX, maxY } = box;
  const seek = (start, limit, cap, bandQuiet, dir) => {
    for (let d = 0; d <= cap; d++) {
      const v = start + dir * d;
      if (v < 0 || v > limit) break;
      if (bandQuiet(v)) return v;
    }
    return start; // no qualifying seam: keep the raw edge
  };
  const rowBand = (v, dir) => {
    for (let k = 1; k <= stroke; k++) {
      const y = v + dir * k;
      if (y < 0 || y >= h || !isQuietRow(png, y, minX, maxX, bg)) return false;
    }
    return true;
  };
  const colBand = (v, dir) => {
    for (let k = 1; k <= stroke; k++) {
      const x = v + dir * k;
      if (x < 0 || x >= w || !isQuietCol(png, x, minY, maxY, bg)) return false;
    }
    return true;
  };
  minY = seek(minY, h - 1, SNAP_ROWS, (v) => rowBand(v, -1), -1);
  maxY = seek(maxY, h - 1, SNAP_ROWS, (v) => rowBand(v, +1), +1);
  minX = seek(minX, w - 1, SNAP_COLS, (v) => colBand(v, -1), -1);
  maxX = seek(maxX, w - 1, SNAP_COLS, (v) => colBand(v, +1), +1);
  return { minX, minY, maxX, maxY };
}
