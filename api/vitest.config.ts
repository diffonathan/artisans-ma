import { defineConfig } from 'vitest/config';
import { transpileurTypeScript } from './test/transpileur-typescript.js';

export default defineConfig({
  plugins: [transpileurTypeScript()],

  // La transformation par défaut est désactivée pour que le transpileur
  // ci-dessus soit le seul à traiter le TypeScript : laisser les deux ferait
  // repasser un code déjà transpilé dans un outil qui le croit encore
  // TypeScript.
  //
  // `oxc`, et non `esbuild` : vitest 4 a remplacé esbuild par Oxc, et
  // `esbuild: false` n'a plus d'effet — il est simplement ignoré, avec un
  // avertissement qu'on peut manquer. Le réglage qui agit est `oxc: false`.
  oxc: false,

  test: {
    globals: true,
    root: './',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],

    // Les tests écrivent dans un vrai MongoDB. Chaque fichier a sa propre
    // base, mais le replica set à un nœud sérialise de toute façon les
    // transactions concurrentes : paralléliser ne gagnerait rien et rendrait
    // les échecs illisibles.
    fileParallelism: false,

    // Un parcours complet (inscription avec scrypt, quatre transactions,
    // agrégations) dépasse largement les 5 secondes par défaut. scrypt à
    // 64 Mio coûte à lui seul une centaine de millisecondes par mot de passe,
    // et les fabriques en créent plusieurs par test.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
