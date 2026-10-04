import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // Next résout `@/*` tout seul via tsconfig ; vitest, non. Sans cet alias,
    // le premier import `@/lib/...` échoue sur « Cannot find package », ce qui
    // se lit comme une dépendance manquante alors que c'est un chemin interne.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    // Les tests portent sur des fonctions pures — pas de DOM, pas de rendu de
    // composant. Rien à simuler, donc rien à installer pour simuler.
    environment: 'node',
  },
});
