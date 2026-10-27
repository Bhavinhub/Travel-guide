import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three', '@react-three/fiber'],
          drei: ['@react-three/drei'],
        },
      },
    },
  },
  // Same security headers as production (netlify.toml) so `npm run preview` tests them.
  preview: {
    headers: {
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://upload.wikimedia.org https://thumb.wikimedia.org https://server.arcgisonline.com https://tile.openstreetmap.org https://s3.amazonaws.com; media-src 'self' blob:; connect-src 'self' https://tiles.openfreemap.org https://nominatim.openstreetmap.org https://upload.wikimedia.org https://thumb.wikimedia.org https://en.wikipedia.org https://commons.wikimedia.org https://api.frankfurter.dev https://api.open-meteo.com https://geocoding-api.open-meteo.com https://router.project-osrm.org https://routing.openstreetmap.de https://firestore.googleapis.com https://server.arcgisonline.com https://tile.openstreetmap.org https://s3.amazonaws.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';",
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  test: { environment: 'node' },
} as any);
