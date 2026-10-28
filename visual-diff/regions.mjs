// Split a page's changed pixels into separate vertical regions. One bounding
// box around every change rings the whole page as soon as two edits sit far
// apart — a header tweak plus a footer tweak (upac-site#2) — so each cluster
// of changed rows gets its own box, ring and crop instead.

// Changed rows closer than this belong to one region. Two crops this close
// would overlap their CROP_MARGIN context anyway.
export const REGION_GAP = 160;
// Beyond this many regions the nearest neighbours merge: a page with dozens
// of scattered edits gets a few readable crops, not a scroll of slivers.
export const MAX_REGIONS = 6;
// Changed rows this close form one BAND: the unit `keep` judges, before any
// grouping by REGION_GAP. A band is one tight run — a text line, an image —
// so a real edit is never judged together with shift noise 100px away.
export const BAND_GAP = 2;

// Regions with no more than `minPix` changed pixels are dropped: the page-level
// noise floor (diff.mjs MINPIX) applied per region, so a stray anti-aliased
// glyph far from the real edit doesn't get a ring and a crop of its own.
// Changed pixels in `box` that a sub-pixel VERTICAL move cannot explain. A
// layout that shifts by a fraction of a pixel (a header 182.4px taller)
// re-samples images and icons below it: each after pixel becomes a blend of
// the before pixel and its neighbour on one side, and — the same move seen
// backwards — each before pixel a blend of the after pixel and its neighbour
// on the other side. A pixel is explained only when both hold, per channel;
// requiring both keeps a genuinely different glyph from passing by chance.
// (upac-site#2: footer logo and social icons ringed though nothing in the
// footer changed.)
export const SHIFT_TOLERANCE = 8;
// A region is shift noise when no more than this share of its changed pixels
// is unexplained. Measured on upac-site's about page: the shifted footer sat
// at 17%; a swapped text line and a pasted-over word both at 98%.
export const SHIFT_NOISE_SHARE = 0.5;

export function unexplainedByShift(before, after, mask, w, h, box, tol = SHIFT_TOLERANCE) {
  const between = (v, p, q) => v >= Math.min(p, q) - tol && v <= Math.max(p, q) + tol;
  const blends = (img, i, other, j, k) => between(img.data[i], other.data[i], other.data[k])
    && between(img.data[i + 1], other.data[i + 1], other.data[k + 1])
    && between(img.data[i + 2], other.data[i + 2], other.data[k + 2]);
  let n = 0;
  for (let y = box.minY; y <= box.maxY; y++) {
    for (let x = box.minX; x <= box.maxX; x++) {
      const p = y * w + x;
      if (!mask[p]) continue;
      const i = p * 4;
      let explained = false;
      for (const s of [-1, 1]) {
        if (y + s < 0 || y + s >= h || y - s < 0 || y - s >= h) continue;
        const fwd = ((y + s) * w + x) * 4, back = ((y - s) * w + x) * 4;
        if (blends(after, i, before, i, fwd) && blends(before, i, after, i, back)) { explained = true; break; }
      }
      if (!explained) n++;
    }
  }
  return n;
}

// Count of mask pixels inside a box.
export function maskCount(mask, w, box) {
  let n = 0;
  for (let y = box.minY; y <= box.maxY; y++) {
    for (let x = box.minX; x <= box.maxX; x++) n += mask[y * w + x];
  }
  return n;
}

export function isShiftNoise(before, after, mask, w, h, box, share = SHIFT_NOISE_SHARE) {
  return unexplainedByShift(before, after, mask, w, h, box) <= share * maskCount(mask, w, box);
}

// The regions to ring, from pixelmatch's mask plus the rows where content was
// removed outright (align.mjs removedAt). Returns the mask with each removal
// seam marked across the full width — removed rows were full-width rows —
// and the region boxes. A region holding a seam always stays: the seam is a
// real change with no differing after pixel, so the shift-noise test, which
// judges only pixelmatch's own pixels, must not be able to explain it away.
export function changeRegions(before, after, pixelMask, seams, w, h, minPix) {
  const mask = pixelMask.slice();
  const seamRows = seams.map((at) => {
    const y1 = Math.min(at, h - 1), y0 = Math.max(0, y1 - 1);
    for (let y = y0; y <= y1; y++) mask.fill(1, y * w, (y + 1) * w);
    return [y0, y1];
  });
  const regions = splitRegions(mask, w, h, REGION_GAP, MAX_REGIONS, minPix, (r) =>
    seamRows.some(([y0, y1]) => y1 >= r.minY && y0 <= r.maxY)
    || !isShiftNoise(before, after, pixelMask, w, h, r));
  return { mask, regions };
}

// A band split at runs of at least PIECE_GAP empty columns, each piece with its
// own tight box and count: a re-sampled logo on the left and an edited link on
// the right of the same rows are judged apart, so the logo's explained pixels
// cannot outvote the link's.
export const PIECE_GAP = 24;

function piecesOf(mask, w, band) {
  const pieces = [];
  let cur = null, empty = 0;
  for (let x = band.minX; x <= band.maxX; x++) {
    let y0 = -1, y1 = -1, count = 0;
    for (let y = band.minY; y <= band.maxY; y++) {
      if (!mask[y * w + x]) continue;
      if (y0 < 0) y0 = y;
      y1 = y;
      count++;
    }
    if (y0 < 0) { empty++; continue; }
    if (cur && empty < PIECE_GAP) {
      cur.maxX = x;
      cur.minY = Math.min(cur.minY, y0);
      cur.maxY = Math.max(cur.maxY, y1);
      cur.count += count;
    } else {
      cur = { minX: x, minY: y0, maxX: x, maxY: y1, count };
      pieces.push(cur);
    }
    empty = 0;
  }
  return pieces;
}

// `keep` judges each band piece on its own, BEFORE pieces group into regions and
// before the MAX_REGIONS cap merges neighbours: merged first, a small real
// edit could ride along inside a big shift-noise box and be dropped with it.
// The pixel floor applies to the grouped region, so an edit spread over a few
// small bands (a short word, a moved period) still counts as a whole.
export function splitRegions(mask, w, h, gap = REGION_GAP, maxRegions = MAX_REGIONS, minPix = 0, keep = () => true) {
  const bands = [];
  let cur = null;
  for (let y = 0; y < h; y++) {
    let x0 = -1, x1 = -1, count = 0;
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x0 < 0) x0 = x;
      x1 = x;
      count++;
    }
    if (x0 < 0) continue;
    if (cur && y - cur.maxY <= BAND_GAP) {
      cur.maxY = y;
      cur.minX = Math.min(cur.minX, x0);
      cur.maxX = Math.max(cur.maxX, x1);
      cur.count += count;
    } else {
      cur = { minX: x0, minY: y, maxX: x1, maxY: y, count };
      bands.push(cur);
    }
  }
  let regions = [];
  // Pieces come out of a band in column order; grouping walks them top to
  // bottom, so sort first. Unsorted, a lower piece on the left preceded a
  // higher one on the right, the row gap went negative, and two edits far
  // apart merged into one page-tall ring.
  const pieces = bands.flatMap((band) => piecesOf(mask, w, band)).sort((p, q) => p.minY - q.minY);
  for (const piece of pieces) {
    const { count, ...box } = piece;
    if (!keep(box)) continue;
    const last = regions[regions.length - 1];
    if (last && piece.minY - last.maxY <= gap) {
      last.minY = Math.min(last.minY, piece.minY);
      last.maxY = Math.max(last.maxY, piece.maxY);
      last.minX = Math.min(last.minX, piece.minX);
      last.maxX = Math.max(last.maxX, piece.maxX);
      last.count += count;
    } else {
      regions.push({ ...piece });
    }
  }
  regions = regions.filter((r) => r.count > minPix).map(({ count, ...box }) => box);
  while (regions.length > maxRegions) {
    let at = 0;
    for (let i = 1; i < regions.length - 1; i++) {
      if (regions[i + 1].minY - regions[i].maxY < regions[at + 1].minY - regions[at].maxY) at = i;
    }
    const [r, s] = [regions[at], regions[at + 1]];
    regions.splice(at, 2, {
      minX: Math.min(r.minX, s.minX), minY: r.minY,
      maxX: Math.max(r.maxX, s.maxX), maxY: s.maxY,
    });
  }
  return regions;
}
