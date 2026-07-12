import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Ensure VITE_SITE_ORIGIN is always defined so Vite's built-in %VITE_*% HTML
// replacement never emits a warning and never leaves a literal placeholder in
// the built output.  Override by exporting VITE_SITE_ORIGIN or SITE_ORIGIN
// before running the build.
if (!process.env.VITE_SITE_ORIGIN) {
  process.env.VITE_SITE_ORIGIN = (process.env.SITE_ORIGIN || 'https://careerai.app').replace(/\/$/, '');
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
