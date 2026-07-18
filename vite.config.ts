import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // Create / update the public/version.json with the current build timestamp
  const buildTimestamp = Date.now().toString();
  try {
    const publicDir = path.resolve(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }
    const versionPath = path.resolve(publicDir, 'version.json');
    fs.writeFileSync(versionPath, JSON.stringify({ version: buildTimestamp }));
  } catch (e) {
    console.error('Failed to create public/version.json:', e);
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        includeAssets: ['AppLogo.png', 'logo.png', 'Logo2.png', 'silent.mp3'],
        manifest: {
          name: 'Sync 727 - Team OS',
          short_name: 'Sync 727',
          description: 'מערכת ניהול קבוצה חכמה לצוותי FLL',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/AppLogo.png?v=2',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/AppLogo.png?v=2',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            },
          ],
        },
        workbox: {
          importScripts: ['/push-sw.js'],
          maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,woff2}'],
          globIgnores: ['**/version.json'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200]
                },
              }
            },
            {
              // Cache images aggressively
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'images-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                },
              },
            },
            {
              // Save external data (like FLL rules from R2, API data) on the device, 
              // but always pull the latest updates in the background.
              urlPattern: /^https:\/\/(pub-9b07ff19511b4468a47d28bb2cb58176\.r2\.dev|2d106fb460c2e5c4df4201020f56d44a\.r2\.cloudflarestorage\.com)\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'app-data-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            },
          ]
        },
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __APP_VERSION__: JSON.stringify(buildTimestamp),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'util': path.resolve(__dirname, 'src/util-shim.ts'),
      },
    },
    server: {
      hmr: false,
    },
    build: {
      chunkSizeWarningLimit: 2000,
      sourcemap: false,
      rollupOptions: {
        maxParallelFileOps: 3,
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              if (
                id.includes('pdfjs-dist') ||
                id.includes('pdf-lib') ||
                id.includes('jspdf') ||
                id.includes('html2canvas')
              ) {
                return 'vendor-pdf-tools';
              }
              if (
                id.includes('@mlc-ai') ||
                id.includes('wllama') ||
                id.includes('@mediapipe')
              ) {
                return 'vendor-local-ai';
              }
              if (id.includes('recharts') || id.includes('d3')) {
                return 'vendor-charts';
              }
              if (id.includes('lucide-react')) {
                return 'vendor-icons';
              }
              return 'vendor';
            }
          }
        }
      }
    },
  };
});
