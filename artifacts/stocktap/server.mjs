/**
 * StockTap production server
 *
 * Serves the Vite-built dist/public directory with:
 *   - Brotli / gzip pre-compressed asset serving (Content-Encoding + Vary)
 *   - Correct Content-Type for compressed twins (avoids "application/x-brotli")
 *   - Cache-Control: public, max-age=31536000, immutable  for /assets/* (hashed)
 *   - Cache-Control: no-cache  for index.html, sw.js, manifest, icons
 *   - SPA fallback: every unknown path returns index.html
 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '18320', 10);
const DIST = path.join(__dirname, 'dist/public');

/** Correct Content-Type for each source extension.
 *  Used when we serve the pre-compressed .br / .gz twin so that
 *  Content-Type reflects the original file, not the compression format. */
const CONTENT_TYPES = {
  '.js':          'application/javascript; charset=utf-8',
  '.css':         'text/css; charset=utf-8',
  '.html':        'text/html; charset=utf-8',
  '.json':        'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg':         'image/svg+xml',
  '.ico':         'image/x-icon',
  '.png':         'image/png',
  '.woff2':       'font/woff2',
  '.txt':         'text/plain; charset=utf-8',
  '.xml':         'application/xml; charset=utf-8',
};

const app = express();

app.use((req, res, next) => {
  const urlPath = req.path;

  /* ── Cache policy ──────────────────────────────────────────────────── */
  if (urlPath.startsWith('/assets/')) {
    /* Hashed bundles: immutable — CDNs and browsers cache for 1 year */
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else {
    /* index.html, sw.js, manifest.webmanifest, icons — always revalidate */
    res.setHeader('Cache-Control', 'no-cache');
  }

  /* ── Pre-compressed serving ────────────────────────────────────────── */
  const ext = path.extname(urlPath);
  if (!ext) return next();           /* no extension → directory-like path */

  const filePath = path.join(DIST, urlPath);
  const ae = req.headers['accept-encoding'] ?? '';

  let encoding = '';
  if (ae.includes('br') && fs.existsSync(filePath + '.br')) {
    encoding = 'br';
  } else if ((ae.includes('gzip') || ae.includes('deflate')) &&
             fs.existsSync(filePath + '.gz')) {
    encoding = 'gzip';
  }

  if (encoding) {
    const ct = CONTENT_TYPES[ext];
    /* Set the correct Content-Type for the original file format */
    if (ct) res.setHeader('Content-Type', ct);
    res.setHeader('Content-Encoding', encoding);
    res.setHeader('Vary', 'Accept-Encoding');
    /* Bypass express.static — it would re-detect Content-Type from the
       .br/.gz extension, overriding the correct type we just set. */
    return res.sendFile(filePath + (encoding === 'br' ? '.br' : '.gz'));
  }

  next();
});

/* Pre-rendered static pages — registered BEFORE express.static so directory
   paths don't trigger a trailing-slash redirect first.
   Search-engine crawlers receive the full <head> without executing JavaScript. */
app.get('/about', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST, 'about.html'));
});

app.get('/guides', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST, 'guides/index.html'));
});
app.get('/guides/:slug', (req, res, next) => {
  const file = path.join(DIST, 'guides', `${req.params.slug}.html`);
  if (!fs.existsSync(file)) return next();   // unknown slug → SPA catch-all
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(file);
});

/* Static file serving for files without a pre-compressed twin.
   index: false — we handle the SPA fallback below. */
app.use(express.static(DIST, { index: false }));

/* SPA fallback — extensionless paths get the app shell; everything else 404s.
 *
 * Rules (applied in order):
 *   1. Path has a file extension  →  real 404. This means a static file was
 *      requested that doesn't exist on disk (.xml, .txt, .png, .map, .js …).
 *      A soft-200/HTML response here causes Google to index garbage URLs as
 *      valid pages, which is actively harmful for SEO.
 *   2. Path starts with /api/     →  real 404 JSON. Any /api route that
 *      reached this handler wasn't matched by a real route handler.
 *   3. Extensionless path         →  serve index.html (SPA shell).
 *      Every wouter client-side route falls into this bucket.
 *
 * Using app.use (not app.get('*')) because Express 5 / path-to-regexp v8 no
 * longer accepts bare '*' wildcards; app.use with no path is the correct
 * Express-5-safe catch-all. */
app.use((req, res) => {
  const ext = path.extname(req.path);

  // Extension path that made it this far is a missing static file → real 404
  if (ext) {
    res.status(404).set('Content-Type', 'text/plain').send('Not Found');
    return;
  }

  // Unmatched /api/ route → JSON 404
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  // Client-side route → SPA shell
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(DIST, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`StockTap serving on :${PORT}`);
});
