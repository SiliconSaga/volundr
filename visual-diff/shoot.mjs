// Serve one built Jekyll site and screenshot every sitemap route at two
// viewports. Deterministic by construction: reduced-motion emulation, fonts
// awaited, animations frozen at capture, and all non-local requests blocked
// (third-party embeds can't inject nondeterminism).
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { san } from './slug.mjs';

const [, , siteDir, outDir] = process.argv;
if (!siteDir || !outDir) { console.error('usage: shoot.mjs <siteDir> <outDir>'); process.exit(2); }

const sitemapPath = join(siteDir, 'sitemap.xml');
if (!existsSync(sitemapPath)) {
  console.error(`FATAL: ${sitemapPath} missing — enable jekyll-sitemap + url in _config.ci.yml (ci-config.rb carries both into the build overlay).`);
  process.exit(1);
}
const xml = await readFile(sitemapPath, 'utf8');
const routes = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => new URL(m[1]).pathname)
  // jekyll-sitemap also lists static files (committed PDF/PNG deliverables,
  // fonts, scripts). Only page-like routes can be screenshotted — a goto()
  // on a PDF is a download, which kills the whole run.
  .filter((p) => p.endsWith('/') || p.endsWith('.html') || !extname(p))
  .sort();
if (routes.length === 0) { console.error('FATAL: sitemap has no <loc> entries.'); process.exit(1); }

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.xml': 'application/xml', '.ico': 'image/x-icon',
  '.webp': 'image/webp', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};
const server = createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let fp = join(siteDir, p);
    if (p.endsWith('/') || !extname(fp)) fp = join(fp, 'index.html');
    const s = await stat(fp).catch(() => null);
    if (!s || s.isDirectory()) { res.statusCode = 404; res.end('404'); return; }
    res.setHeader('Content-Type', MIME[extname(fp)] || 'application/octet-stream');
    createReadStream(fp).pipe(res);
  } catch { res.statusCode = 500; res.end('500'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const IMAGE_WAIT_MS = 10000;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: 'reduce',
      deviceScaleFactor: 1,
    });
    await ctx.route('**/*', (route) => {
      const h = new URL(route.request().url()).hostname;
      if (h === 'localhost' || h === '127.0.0.1') route.continue();
      else route.abort();
    });
    const page = await ctx.newPage();
    for (const r of routes) {
      await page.goto(base + r, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      // A full-page shot never scrolls, so loading="lazy" images below the fold
      // may or may not have loaded — upac-site#2's home page lost a gallery
      // image in one build and not the other. Scroll through the page, as a
      // reader would, so lazy images (and scroll-triggered loaders) start,
      // leaving every attribute as the page set it; then wait until no image
      // is still loading. `complete` drops back to false while an error
      // handler's fallback source loads, so that is waited for too. The wait
      // is bounded: an image whose request was aborted never settles, and one
      // stuck image must not hold every remaining route hostage — it is
      // reported and the shot taken as the page stands.
      await page.evaluate(async () => {
        const frame = () => new Promise((done) => requestAnimationFrame(() => done()));
        for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
          window.scrollTo(0, y);
          await frame();
        }
        window.scrollTo(0, 0);
        await frame();
      });
      try {
        await page.waitForFunction(() => [...document.images].every((img) => img.complete),
          null, { timeout: IMAGE_WAIT_MS });
      } catch {
        const pending = await page.evaluate(() => [...document.images]
          .filter((img) => !img.complete).map((img) => img.currentSrc || img.src));
        console.warn(`WARN ${r} at ${vp.name}: images still loading after ${IMAGE_WAIT_MS}ms: ${pending.join(', ')}`);
      }
      await page.screenshot({
        path: join(outDir, `${san(r)}__${vp.name}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
    await ctx.close();
  }
} finally {
  // Always release the browser + server, even if a capture threw (a route
  // error still aborts the run — better to fail loud than misreport a route).
  await browser.close();
  server.close();
}
await writeFile(join(outDir, 'routes.json'), JSON.stringify(routes, null, 2));
console.log(`shot ${routes.length} routes x ${VIEWPORTS.length} viewports from ${siteDir}`);
