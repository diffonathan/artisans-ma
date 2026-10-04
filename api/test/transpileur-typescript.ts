import ts from 'typescript';
import type { Plugin } from 'vite';

/**
 * Transpile les fichiers TypeScript avec le compilateur TypeScript lui-même,
 * pour obtenir `emitDecoratorMetadata`.
 *
 * ══ Pourquoi ce fichier existe ═════════════════════════════════════════════
 *
 * NestJS lit la métadonnée `design:paramtypes` pour savoir quoi injecter dans
 * un constructeur. Cette métadonnée est produite par l'option
 * `emitDecoratorMetadata`, que seul le compilateur TypeScript sait émettre.
 *
 * Or Vite — donc vitest — transforme le TypeScript avec esbuild, qui ne la
 * produit PAS, et ne le signale pas. Le symptôme est un constructeur dont
 * tous les paramètres valent `undefined`, et une erreur de NestJS qui parle
 * de dépendance introuvable sans dire pourquoi.
 *
 * ── Le chemin normal, et pourquoi il est fermé ici ──────────────────────────
 * La réponse habituelle est `unplugin-swc` : swc produit la métadonnée, et
 * c'est le compilateur que Nest utilise lui-même. Sur cette machine, son
 * module natif refuse de se charger :
 *
 *     SWC native addon: validate cache root C:\Users\...\AppData\Local\swc:
 *     DACL grants replacement rights 0x1f01ff to SID S-1-15-3-...
 *
 * swc vérifie les droits du dossier où il recopie son binaire, et remonte la
 * chaîne des dossiers parents. Déplacer ce cache ne change rien : le contrôle
 * remonte jusqu'à `C:\`, dont les droits sont ceux de Windows. Il n'y a donc
 * aucun emplacement acceptable sur cette machine, et l'option
 * `SWC_NATIVE_BINDING_CACHE` ne peut pas y remédier.
 *
 * ── La solution retenue ────────────────────────────────────────────────────
 * `ts.transpileModule` fait le travail en pur JavaScript : le paquet
 * `typescript` est déjà là, et aucun module natif ne peut échouer à se
 * charger. C'est plus lent que swc — quelques secondes sur ce projet — et
 * c'est un prix acceptable pour des tests qui démarrent partout.
 *
 * ── Deux réglages qui ne sont pas des détails ──────────────────────────────
 *
 * `useDefineForClassFields: false`. Avec une cible ES2022 ou plus récente,
 * TypeScript active cette option par défaut, et une propriété déclarée sans
 * valeur (`nom: string;`) devient alors une vraie définition de champ, posée
 * à `undefined` à la construction. Sur une classe que Mongoose ou
 * class-transformer remplit, cela écrase ce qui vient d'être écrit. Le même
 * réglage est posé dans `tsconfig.json`, pour que le code compilé pour la
 * production et le code compilé pour les tests se comportent pareil — une
 * divergence entre les deux produit des tests verts sur du code faux.
 *
 * `transpileModule` ne vérifie pas les types : il traduit, fichier par
 * fichier. C'est voulu — la vérification est le travail de `tsc --noEmit`,
 * lancé séparément. Mélanger les deux rendrait chaque test dépendant de la
 * compilation de tout le projet.
 */
export const transpileurTypeScript = (): Plugin => ({
  name: 'transpileur-typescript',
  enforce: 'pre',

  transform(code: string, identifiant: string) {
    if (!identifiant.endsWith('.ts') || identifiant.includes('node_modules')) return null;

    const sortie = ts.transpileModule(code, {
      fileName: identifiant,
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2023,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        useDefineForClassFields: false,
        esModuleInterop: true,
        sourceMap: true,
        inlineSources: true,
      },
    });

    return {
      code: sortie.outputText,
      map: sortie.sourceMapText ? JSON.parse(sortie.sourceMapText) : null,
    };
  },
});
