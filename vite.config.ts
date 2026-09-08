import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Beim Entwickeln auf dem Handy setzt die Tauri-CLI TAURI_DEV_HOST, damit das
// Geraet den Dev-Server im WLAN erreicht.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    // Der Rust-Teil hat seinen eigenen Watcher.
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'safari15',
    // Vite 8 minifiziert mit oxc; esbuild ist nicht mehr mitgeliefert.
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
