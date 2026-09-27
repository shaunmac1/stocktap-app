import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";
import { compression } from "vite-plugin-compression2";

// Pin the Node build/test tooling to UTC. This has no effect on the deployed
// app (the Cloudflare Worker ignores this file; the browser bundle reads the
// device's own timezone via `Date`, which is what src/lib/wages.ts relies on
// intentionally — close-time caps are meant to be computed in the venue's own
// local time). Without this, `pnpm test`/`vitest run` gives different results
// depending on which timezone the machine running them happens to be in.
if (!process.env.TZ) {
  process.env.TZ = "UTC";
}

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "StockTap",
        short_name: "StockTap",
        description: "Stock-taking by weight for UK pubs, bars and restaurants",
        theme_color: "#1a2e1a",
        background_color: "#f8faf8",
        display: "standalone",
        orientation: "portrait",
        scope: basePath,
        start_url: basePath,
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Pull in our push/notificationclick handlers (public/push-sw.js) so
        // the app can receive web-push while closed.
        importScripts: ["push-sw.js"],
        // html intentionally excluded — index.html is served network-first
        // via runtimeCaching so a stale cached document never points at a
        // deleted hashed bundle (the root cause of the blank-screen bug).
        globPatterns: ["**/*.{js,css,ico,png,svg,woff2}"],
        navigateFallback: null,
        directoryIndex: null,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Network-first for ALL navigation requests.
            // networkTimeoutSeconds: 5 — after 5 s offline, fall back to
            // the most-recently-cached index.html so the app still opens.
            urlPattern: ({ request }: { request: Request }) =>
              request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "navigate-cache",
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Bottle photos: fetched when a line is first shown, then kept for
            // offline counting in the cellar. Not precached (2,000+ files).
            urlPattern: ({ url }: { url: URL }) => url.pathname.startsWith("/bottles/"),
            handler: "CacheFirst",
            options: {
              cacheName: "bottle-photos",
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
    // Pre-compress all JS/CSS/HTML/SVG assets at build time.
    // sirv-cli (the production server) reads these .br/.gz files and sets
    // the correct Content-Encoding header — zero CPU cost per request.
    // Brotli is served first to browsers that advertise Accept-Encoding: br;
    // gzip is the fallback for older clients.
    compression({ algorithm: "brotliCompress", exclude: [/\.(png|jpe?g|gif|webp|ico|woff2?)$/] }),
    compression({ algorithm: "gzip",            exclude: [/\.(png|jpe?g|gif|webp|ico|woff2?)$/] }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
  test: {
    // Vitest runs test files in worker threads/processes that don't inherit
    // this file's top-level `process.env.TZ` side effect, so it's set again
    // here via the option Vitest actually plumbs into each worker's env.
    env: { TZ: "UTC" },
  },
});
