import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv} from 'vite';

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
      target: 'es2022',
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
                id.includes('mupdf') ||
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
