// Box-edge snapping for the marked ("what changed") screenshots. A raw
// changed-pixel bounding box regularly slices through glyphs: remove one word
// and the box's top edge lands on a comma's topmost pixel — mid-line — so the
// ring reads as a strikethrough over words that never changed. Each edge grows
// outward to the nearest quiet seam of the AFTER image that has room for the
// ring's stroke band; if no seam with room exists within the cap, the raw edge
// stands (the ring may touch glyphs there — exactly the pre-snapping behavior,
// never worse).
export const QUIET_TOLERANCE = 8; // per-channel wiggle allowed within a "uniform" seam
export const SNAP_ROWS = 48;
// Columns get a far larger cap on purpose — reaching the text column's margin
// turns a disorienting mid-paragraph sliver into whole readable lines.
export const SNAP_COLS = 480;

export function isQuietRow(png, y, x0, x1) {
  const i0 = (y * png.width + x0) * 4;
  const r = png.data[i0], g = png.data[i0 + 1], b = png.data[i0 + 2];
  for (let x = x0; x <= x1; x++) {
    const i = (y * png.width + x) * 4;
    if (Math.abs(png.data[i] - r) > QUIET_TOLERANCE
      || Math.abs(png.data[i + 1] - g) > QUIET_TOLERANCE
      || Math.abs(png.data[i + 2] - b) > QUIET_TOLERANCE) return false;
  }
  return true;
}

export function isQuietCol(png, x, y0, y1) {
  const i0 = (y0 * png.width + x) * 4;
  const r = png.data[i0], g = png.data[i0 + 1], b = png.data[i0 + 2];
  for (let y = y0; y <= y1; y++) {
    const i = (y * png.width + x) * 4;
    if (Math.abs(png.data[i] - r) > QUIET_TOLERANCE
      || Math.abs(png.data[i + 1] - g) > QUIET_TOLERANCE
      || Math.abs(png.data[i + 2] - b) > QUIET_TOLERANCE) return false;
  }
  return true;
}

// Expand each box edge outward to the nearest position whose EXTERIOR stroke
// band (`stroke` rows/columns just outside the edge — the exact pixels the
// ring will occupy) is entirely quiet. Rows first with the raw x-extent, then
// columns with the widened y-extent, so a column seam is judged against every
// text line the box now spans.
export function snapBox(png, box, w, h, stroke) {
  if (!box) return box;
  let { minX, minY, maxX, maxY } = box;
  const seek = (start, limit, cap, bandQuiet, dir) => {
    for (let d = 0; d <= cap; d++) {
      const v = start + dir * d;
      if (v < 0 || v > limit) break;
      if (bandQuiet(v)) return v;
    }
    return start; // no seam with room for the stroke: keep the raw edge
  };
  const rowBand = (v, dir) => {
    for (let k = 1; k <= stroke; k++) {
      const y = v + dir * k;
      if (y < 0 || y >= h || !isQuietRow(png, y, minX, maxX)) return false;
    }
    return true;
  };
  const colBand = (v, dir) => {
    for (let k = 1; k <= stroke; k++) {
      const x = v + dir * k;
      if (x < 0 || x >= w || !isQuietCol(png, x, minY, maxY)) return false;
    }
    return true;
  };
  minY = seek(minY, h - 1, SNAP_ROWS, (v) => rowBand(v, -1), -1);
  maxY = seek(maxY, h - 1, SNAP_ROWS, (v) => rowBand(v, +1), +1);
  minX = seek(minX, w - 1, SNAP_COLS, (v) => colBand(v, -1), -1);
  maxX = seek(maxX, w - 1, SNAP_COLS, (v) => colBand(v, +1), +1);
  return { minX, minY, maxX, maxY };
}
