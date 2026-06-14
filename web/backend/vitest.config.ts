import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // ne scanne que les sources — sinon vitest ramasse les .js compiles dans dist/
    include: ['src/**/*.test.ts'],
    // dotenv/config charge .env avant les tests (sinon JWT_SECRET manque a l'import auth.ts)
    setupFiles: ['dotenv/config'],
    // les tests d'integration tapent tous la meme DB — on serialise par fichier
    // pour qu'ils ne se marchent pas dessus (sinon flaky sous --coverage).
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.ts'],
      // exclus : point d'entree + couches IO (SSH reel, filesystem cartes)
      // qui se testent en integration/hardware, pas en unitaire.
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        'src/services/sshConnection.ts',
        'src/services/wsSsh.ts',
        'src/lib/mapStorage.ts',
        'src/controllers/mapController.ts',
        'src/controllers/sshController.ts',
      ],
      thresholds: { lines: 70 },
    },
  },
})
