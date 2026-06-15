import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/e2e/**', '**/node_modules/**', '**/tests/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      // scope unitaire : logique (stores, libs) + composants présentables.
      // Les pages, vues 3D/canvas et composants WS sont couverts par les E2E.
      include: [
        'src/stores/**',
        'src/lib/**',
        'src/components/StatusBadge.tsx',
        'src/components/MissionProgress.tsx',
        'src/components/DegradedModeBanner.tsx',
        'src/components/BottomNav.tsx',
      ],
      exclude: [
        'src/lib/sounds.ts', // WebAudio
        'src/lib/notifications.ts', // Notification API navigateur
        'src/stores/mappingStore.ts', // flux mapping — couvert par E2E
      ],
      thresholds: { lines: 60 },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'RobLaude — Assistant Robotique',
        short_name: 'RobLaude',
        description: "Robot d'assistance autonome pour personnes a mobilite reduite en ERP",
        lang: 'fr',
        theme_color: '#7c3aed',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
})
