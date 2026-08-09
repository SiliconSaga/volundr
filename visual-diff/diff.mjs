// Pixel-diff baseline vs candidate screenshots produced by shoot.mjs. Emits
// before/after/diff PNGs for changed routes, an HTML report, a ready-to-post
// sticky comment (comment.md), and summary.json.
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { san } from './slug.mjs';

const [, , baseDir, candDir, pubDir, previewUrl] = process.argv;
if (!baseDir || !candDir || !pubDir || !previewUrl) {
  console.error('usage: diff.mjs <baselineDir> <candidateDir> <publishDir> <previewUrl>');
  process.exit(2);
}
const VIEWPORTS = ['mobile', 'desktop'];
const PXTHRESH = 0.1;   // pixelmatch per-pixel color sensitivity
const MINPIX = 50;      // ignore sub-visual noise below this many changed pixels
const CROP_MARGIN = 48; // px of context kept around the changed region
// Magenta: the site's palette is dark navy, cream and gold, so the marker has to
// be a colour the page itself never uses. Red reads as "part of the design" here.
const HILITE = [255, 0, 212];
// pixelmatch fades unchanged pixels TOWARD WHITE (`drawGrayPixel` blends against
// 255), so its 0.1 default turns a dark page into a near-white sheet with hairline
// marks — legible as data, useless as a picture. Half opacity keeps the page
// readable underneath, which is what tells a reviewer WHERE on the page they are.
const DIFF_ALPHA = 0.5;
// A one-character text edit changes a few hundred pixels, most of them a single
// stroke wide. Grown by a couple of pixels they register at a glance; left raw
// they are invisible until you zoom.
const DILATE = 2;
const BOX_STROKE = 3;   // outline drawn around the changed region on the marked shot

const baseRoutes = JSON.parse(readFileSync(join(baseDir, 'routes.json'), 'utf8'));
const candRoutes = JSON.parse(readFileSync(join(candDir, 'routes.json'), 'utf8'));
const common = candRoutes.filter((r) => baseRoutes.includes(r));
const added = candRoutes.filter((r) => !baseRoutes.includes(r));
const removed = baseRoutes.filter((r) => !candRoutes.includes(r));

function pad(png, w, h) {
  if (png.width === w && png.height === h) return png;
  const out = new PNG({ width: w, height: h });
  out.data.fill(0xff); // white
  PNG.bitblt(png, out, 0, 0, png.width, png.height, 0, 0);
  return out;
}

// Which pixels differ, and the box containing them — read back from pixelmatch's
// own verdict rather than recomputed.
//
// A second opinion here is a bug waiting to happen: pixelmatch decides by YIQ
// distance with anti-aliasing detection, so a hand-rolled per-channel threshold
// disagrees with it at the margins. Whichever pixels it ignores must also be the
// ones we do not ring, do not paint, and do not widen the crop for — otherwise
// the count that says "changed" and the picture that shows what changed are
// answering different questions. `diffMask` gives us exactly its counted pixels:
// only real differences are drawn, anti-aliased ones are left blank.
function changedMask(a, b, w, h, opts) {
  const only = new PNG({ width: w, height: h });
  pixelmatch(a.data, b.data, only.data, w, h, { ...opts, diffMask: true });
  const mask = new Uint8Array(w * h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (only.data[p * 4 + 3] === 0) continue;  // untouched by pixelmatch
      mask[p] = 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { mask, box: maxX < 0 ? null : { minX, minY, maxX, maxY } };
}

// Grow the mask by r pixels. Separable (rows then columns) so the cost stays
// linear in the radius rather than quadratic — these are full-page screenshots.
function dilate(mask, w, h, r) {
  const rows = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      for (let k = x0; k <= x1; k++) rows[y * w + k] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!rows[y * w + x]) continue;
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let k = y0; k <= y1; k++) out[k * w + x] = 1;
    }
  }
  return out;
}

function paint(png, mask, w, h, [r, g, b]) {
  for (let p = 0; p < w * h; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
}

// Copy of `src` with a hollow rectangle drawn around the box. This is the image a
// non-technical reviewer actually reads: their own page, with a ring around the
// part that moved — not a pixel mask, which is a debugging artifact.
function markBox(src, box, w, h, stroke, [r, g, b]) {
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(src, out, 0, 0, w, h, 0, 0);
  if (!box) return out;
  const pad = stroke + 2;
  const x0 = Math.max(0, box.minX - pad), y0 = Math.max(0, box.minY - pad);
  const x1 = Math.min(w - 1, box.maxX + pad), y1 = Math.min(h - 1, box.maxY + pad);
  const put = (x, y) => {
    const i = (y * w + x) * 4;
    out.data[i] = r; out.data[i + 1] = g; out.data[i + 2] = b; out.data[i + 3] = 255;
  };
  for (let s = 0; s < stroke; s++) {
    for (let x = x0; x <= x1; x++) {
      if (y0 + s < h) put(x, y0 + s);
      if (y1 - s >= 0) put(x, y1 - s);
    }
    for (let y = y0; y <= y1; y++) {
      if (x0 + s < w) put(x0 + s, y);
      if (x1 - s >= 0) put(x1 - s, y);
    }
  }
  return out;
}

// Crop a PNG to the box + margin (clamped). Full image back if box is null.
function cropTo(png, box, margin, w, h) {
  if (!box) return png;
  const x0 = Math.max(0, box.minX - margin);
  const y0 = Math.max(0, box.minY - margin);
  const x1 = Math.min(w, box.maxX + margin + 1);
  const y1 = Math.min(h, box.maxY + margin + 1);
  const out = new PNG({ width: x1 - x0, height: y1 - y0 });
  PNG.bitblt(png, out, x0, y0, x1 - x0, y1 - y0, 0, 0);
  return out;
}

mkdirSync(pubDir, { recursive: true });
const changed = [];
for (const r of common) {
  let routeChanged = false;
  for (const vp of VIEWPORTS) {
    const bp = join(baseDir, `${san(r)}__${vp}.png`);
    const cp = join(candDir, `${san(r)}__${vp}.png`);
    if (!existsSync(bp) || !existsSync(cp)) continue;
    const a = PNG.sync.read(readFileSync(bp));
    const b = PNG.sync.read(readFileSync(cp));
    const w = Math.max(a.width, b.width);
    const h = Math.max(a.height, b.height);
    const A = pad(a, w, h);
    const B = pad(b, w, h);
    const diff = new PNG({ width: w, height: h });
    const pmOpts = { threshold: PXTHRESH, alpha: DIFF_ALPHA, diffColor: HILITE };
    const n = pixelmatch(A.data, B.data, diff.data, w, h, pmOpts);
    if (n > MINPIX) {
      routeChanged = true;
      const sub = join(pubDir, san(r));
      mkdirSync(sub, { recursive: true });
      // Crop before/after/diff to a tight box around the change (+ margin) so a
      // one-line edit doesn't post a full-page-tall screenshot. The second pass
      // costs one more comparison, and only on routes that actually changed.
      const { mask, box } = changedMask(A, B, w, h, pmOpts);
      paint(diff, dilate(mask, w, h, DILATE), w, h, HILITE);
      const marked = markBox(B, box, w, h, BOX_STROKE, HILITE);
      writeFileSync(join(sub, `marked__${vp}.png`), PNG.sync.write(cropTo(marked, box, CROP_MARGIN, w, h)));
      writeFileSync(join(sub, `before__${vp}.png`), PNG.sync.write(cropTo(A, box, CROP_MARGIN, w, h)));
      writeFileSync(join(sub, `after__${vp}.png`), PNG.sync.write(cropTo(B, box, CROP_MARGIN, w, h)));
      writeFileSync(join(sub, `diff__${vp}.png`), PNG.sync.write(cropTo(diff, box, CROP_MARGIN, w, h)));
    }
  }
  if (routeChanged) changed.push(r);
}
for (const r of added) {
  const sub = join(pubDir, san(r));
  mkdirSync(sub, { recursive: true });
  for (const vp of VIEWPORTS) {
    const cp = join(candDir, `${san(r)}__${vp}.png`);
    if (existsSync(cp)) copyFileSync(cp, join(sub, `after__${vp}.png`));
  }
}

writeFileSync(join(pubDir, 'summary.json'), JSON.stringify({ changed, added, removed }, null, 2));

// --- HTML report ---
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
let html = `<!doctype html><meta charset=utf8><title>Visual diff PR</title>`
  + `<style>body{font:15px/1.5 system-ui,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem}`
  + `img{max-width:100%;border:1px solid #ccc}h2{margin-top:2.5rem}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.5rem}`
  + `.tag{font:12px monospace;background:#eee;padding:.1rem .4rem;border-radius:3px}</style>`;
html += `<h1>Visual diff</h1><p>${changed.length} changed &middot; ${added.length} new &middot; ${removed.length} removed`
  + ` &middot; ${common.length} routes compared.</p>`;
for (const r of changed) {
  html += `<h2><span class=tag>${esc(r)}</span></h2>`;
  for (const vp of VIEWPORTS) {
    if (!existsSync(join(pubDir, san(r), `diff__${vp}.png`))) continue;
    html += `<h3>${vp}</h3>`
      + `<figure><figcaption>what changed</figcaption><img src="${san(r)}/marked__${vp}.png"></figure>`
      + `<div class=grid>`
      + `<figure><figcaption>before</figcaption><img src="${san(r)}/before__${vp}.png"></figure>`
      + `<figure><figcaption>after</figcaption><img src="${san(r)}/after__${vp}.png"></figure>`
      + `<figure><figcaption>pixel diff</figcaption><img src="${san(r)}/diff__${vp}.png"></figure></div>`;
  }
}
if (added.length) html += `<h2>New pages</h2><ul>${added.map((r) => `<li><span class=tag>${esc(r)}</span> `
  + `<a href="${san(r)}/after__desktop.png">screenshot</a></li>`).join('')}</ul>`;
if (removed.length) html += `<h2>Removed pages</h2><ul>${removed.map((r) => `<li><span class=tag>${esc(r)}</span></li>`).join('')}</ul>`;
writeFileSync(join(pubDir, 'index.html'), html);

// --- sticky comment ---
let md = `<!-- pr-visual-diff -->\n### 🖼️ Visual diff\n\n`;
if (!changed.length && !added.length && !removed.length) {
  md += `No visual changes detected across ${common.length} routes.\n`;
} else {
  if (changed.length) {
    md += `**Changed:** ${changed.map((r) => `\`${r}\``).join(', ')}\n\n`;
    for (const r of changed) {
      md += `#### \`${r}\`\n\n`;
      // Only reference viewport images that were actually emitted (a route can
      // change in one viewport but not the other).
      for (const vp of VIEWPORTS) {
        if (!existsSync(join(pubDir, san(r), `diff__${vp}.png`))) continue;
        // Lead with the page itself, ringed. The pixel mask answers "which
        // pixels" — a question nobody reviewing a campaign site is asking — so it
        // stays one click away rather than being the first thing they see.
        md += `**${vp}** — ![what changed](${previewUrl}${san(r)}/marked__${vp}.png)\n\n`
          + `[before](${previewUrl}${san(r)}/before__${vp}.png) &middot; `
          + `[after](${previewUrl}${san(r)}/after__${vp}.png) &middot; `
          + `[pixel diff](${previewUrl}${san(r)}/diff__${vp}.png)\n\n`;
      }
    }
  }
  if (added.length) md += `**New pages:** ${added.map((r) => `\`${r}\``).join(', ')}\n\n`;
  if (removed.length) md += `**Removed pages:** ${removed.map((r) => `\`${r}\``).join(', ')}\n\n`;
}
md += `\n[Full report](${previewUrl}index.html) &middot; [Preview site](${previewUrl.replace(/_diff\/$/, '')})\n`;
writeFileSync(join(pubDir, 'comment.md'), md);

console.log(`diff: ${changed.length} changed, ${added.length} new, ${removed.length} removed`);
