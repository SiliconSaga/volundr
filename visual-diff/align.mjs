// Row alignment between the baseline and candidate screenshots, so content
// that merely MOVED is not reported as changed. Comparing pixels at the same
// coordinates turns one taller header into a whole-page diff: every row below
// it shifts, every route is flagged, and the ring wraps the entire page
// (upac-site#2: a new top band, 17 routes ringed top to bottom).
//
// Full-width pixel rows are hashed and matched with a Myers diff over the
// hash sequences; matched rows are identical content, possibly at a new y.
// The aligned baseline is the before image re-laid onto the candidate's rows,
// so a positional pixelmatch against the candidate sees only what really
// changed. Screenshots are deterministic (see shoot.mjs), so exact row
// equality is the right test; a row that differs by anti-aliasing alone stays
// unmatched and pixelmatch's own tolerance judges it, as before.
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';

// Past this many inserted+deleted rows the pages are too different for
// alignment to mean anything; the caller falls back to positional comparison.
// It also bounds the backtrack trace, which grows with the square of it.
export const MAX_EDIT_ROWS = 2000;
// A hunk this short on both sides whose rows each repeat a neighbouring row is
// spacing, not content: a fractional layout offset nudges a blank row from one
// paragraph gap to another. Taller runs stay changes — a solid band growing
// by 50px repeats its neighbours too, and that IS a visible change.
export const SPACING_ROWS = 3;
// Hunks this close (in matched rows) merge into one replacement; see hunksFrom.
export const COALESCE_ROWS = 8;

export function rowHashes(png) {
  const stride = png.width * 4;
  const out = new Array(png.height);
  for (let y = 0; y < png.height; y++) {
    out[y] = createHash('sha1').update(png.data.subarray(y * stride, (y + 1) * stride)).digest('base64');
  }
  return out;
}

// Myers' O((N+M)D) diff. Returns matched [i, j] index pairs in ascending
// order, or null when the edit distance exceeds maxD. Each trace entry keeps
// only the k-range that round can reach, so memory is O(D^2), not O(D(N+M)).
function myers(a, b, maxD) {
  const n = a.length, m = b.length, max = n + m;
  if (max === 0) return [];
  const off = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= Math.min(max, maxD); d++) {
    trace.push(v.slice(off - d, off + d + 1));
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]))
        ? v[off + k + 1]
        : v[off + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[off + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return null;
}

function backtrack(trace, n, m) {
  const pairs = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    if (d === 0) {
      while (x > 0 && y > 0) { pairs.push([x - 1, y - 1]); x--; y--; }
      break;
    }
    const snap = trace[d];
    const at = (k) => snap[k + d];
    const k = x - y;
    const prevK = (k === -d || (k !== d && at(k - 1) < at(k + 1))) ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { pairs.push([x - 1, y - 1]); x--; y--; }
    x = prevX; y = prevY;
  }
  return pairs.reverse();
}

// Matched row pairs for two hash sequences. A shared prefix and suffix are
// peeled off first: most edits touch one region, and a header or footer edit
// then costs Myers only the rows in between.
export function matchRows(ha, hb, maxD = MAX_EDIT_ROWS) {
  const n = ha.length, m = hb.length;
  let pre = 0;
  while (pre < n && pre < m && ha[pre] === hb[pre]) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && ha[n - 1 - suf] === hb[m - 1 - suf]) suf++;
  const mid = myers(ha.slice(pre, n - suf), hb.slice(pre, m - suf), maxD);
  if (!mid) return null;
  const pairs = [];
  for (let i = 0; i < pre; i++) pairs.push([i, i]);
  for (const [i, j] of mid) pairs.push([i + pre, j + pre]);
  for (let s = suf; s > 0; s--) pairs.push([n - s, m - s]);
  return pairs;
}

// The unmatched stretches between matched pairs: before rows [aStart, aEnd)
// became after rows [bStart, bEnd). Either side may be empty — a pure
// insertion or a pure removal.
// Hunks separated by at most `coalesce` matched rows merge into one: Myers
// readily expresses "these rows were replaced" as a removal and an insertion
// one matched row apart, and the inserted half would then be compared against
// blank filler instead of the rows it replaced.
export function hunksFrom(pairs, n, m, coalesce = 0) {
  const hunks = [];
  let pa = 0, pb = 0;
  for (const [i, j] of [...pairs, [n, m]]) {
    if (i > pa || j > pb) {
      const prev = hunks[hunks.length - 1];
      if (prev && pa - prev.aEnd <= coalesce && pb - prev.bEnd <= coalesce) {
        prev.aEnd = i; prev.bEnd = j;
      } else {
        hunks.push({ aStart: pa, aEnd: i, bStart: pb, bEnd: j });
      }
    }
    pa = i + 1; pb = j + 1;
  }
  return hunks;
}

// Align `before` onto `after`'s rows. Both must share a width. Returns null
// when the pages are too different to align (callers compare positionally).
//   baseline   before's pixels laid onto after's rows: matched rows copied
//              from their before row, each hunk's before rows copied
//              top-aligned into it, white where the hunk grew
//   hunks      the real changes; spacing-only hunks (SPACING_ROWS) are
//              dropped and their after rows count as unchanged
//   removedAt  after-row positions where before rows vanished outright —
//              no after pixel differs there, so callers must mark them
//   removedRows how many before rows those removals account for
//   beforeRange(minY, maxY)  the before rows an after-row range came from,
//              for cropping the before pane; empty (max < min) when the range
//              is purely inserted content
export function alignRows(before, after, maxD = MAX_EDIT_ROWS) {
  if (before.width !== after.width) throw new Error('alignRows: widths differ');
  const w = after.width, n = before.height, m = after.height;
  const ha = rowHashes(before), hb = rowHashes(after);
  const pairs = matchRows(ha, hb, maxD);
  if (!pairs) return null;
  // Every hunk row must continue the run just OUTSIDE the hunk. Matching a
  // row of the hunk itself is not enough: a new 2px rule is two identical
  // rows, and it is content, not a wider gap.
  const repeats = (hs, from, to) => {
    for (let i = from; i < to; i++) {
      if (!((from > 0 && hs[i] === hs[from - 1]) || (to < hs.length && hs[i] === hs[to]))) return false;
    }
    return true;
  };
  const isSpacing = (hk) => hk.aEnd - hk.aStart <= SPACING_ROWS && hk.bEnd - hk.bStart <= SPACING_ROWS
    && repeats(ha, hk.aStart, hk.aEnd) && repeats(hb, hk.bStart, hk.bEnd);
  const stride = w * 4;
  const baseline = new PNG({ width: w, height: m });
  baseline.data.fill(0xff);
  const copyRow = (i, j) => before.data.copy(baseline.data, j * stride, i * stride, (i + 1) * stride);
  const bMatch = new Int32Array(m).fill(-1);
  const bHunk = new Int32Array(m).fill(-1);
  for (const [i, j] of pairs) { copyRow(i, j); bMatch[j] = i; }
  const hunks = [];
  for (const hk of hunksFrom(pairs, n, m, COALESCE_ROWS)) {
    if (!isSpacing(hk)) { hunks.push(hk); continue; }
    // Spacing: show the after rows as unchanged, mapped to the nearest before row.
    for (let j = hk.bStart; j < hk.bEnd; j++) {
      after.data.copy(baseline.data, j * stride, j * stride, (j + 1) * stride);
      bMatch[j] = Math.min(n - 1, Math.max(0, Math.min(hk.aStart + (j - hk.bStart), hk.aEnd - 1)));
    }
  }
  // Within a hunk, the unmatched before rows and unmatched after rows pair up
  // in order, so a replaced row is compared with the row it replaced. A
  // coalesced hunk also holds matched rows, which keep their own copy and stay
  // out of the pairing. Unpaired after rows are new content (white filler
  // underneath); unpaired before rows were removed, and get a seam right after
  // the last paired after row — they have no after pixel of their own.
  const aMatched = new Uint8Array(n);
  for (const [i] of pairs) aMatched[i] = 1;
  const removedAt = [];
  let removedRows = 0;
  hunks.forEach((hk, idx) => {
    for (let j = hk.bStart; j < hk.bEnd; j++) bHunk[j] = idx;
    const ua = [], ub = [];
    for (let i = hk.aStart; i < hk.aEnd; i++) if (!aMatched[i]) ua.push(i);
    for (let j = hk.bStart; j < hk.bEnd; j++) if (bMatch[j] < 0) ub.push(j);
    const paired = Math.min(ua.length, ub.length);
    for (let k = 0; k < paired; k++) copyRow(ua[k], ub[k]);
    if (ua.length > paired) {
      removedAt.push(paired ? ub[paired - 1] + 1 : hk.bStart);
      removedRows += ua.length - paired;
    }
  });
  const beforeRange = (minY, maxY) => {
    const top = bMatch[minY] >= 0 ? bMatch[minY] : hunks[bHunk[minY]].aStart;
    const bot = bMatch[maxY] >= 0 ? bMatch[maxY] : hunks[bHunk[maxY]].aEnd - 1;
    return [top, Math.max(bot, top - 1)];
  };
  return { baseline, hunks, removedAt, removedRows, beforeRange };
}
