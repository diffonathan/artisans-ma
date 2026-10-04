import type { NextConfig } from 'next';

/**
 * Configuration délibérément vide.
 *
 * Turbopack est le constructeur par défaut en Next 16 : il n'y a aucun
 * drapeau --turbopack à ajouter aux scripts, et rien à déclarer ici.
 *
 * Deux options que ce projet laisse ÉTEINTES, et pourquoi :
 *
 *   reactCompiler — mémoïse automatiquement les composants clients. Le gain
 *   est réel mais il change la façon dont les rendus se déclenchent : un
 *   composant qui mutait un objet reçu en props, ou qui s'appuyait sur une
 *   égalité référentielle, cesse de se rendre au bon moment. Le front n'existe
 *   pas encore ; l'activer maintenant ferait porter à chaque agent le risque
 *   d'un bogue de rendu qu'il attribuerait à son propre code. C'est une
 *   décision à prendre une fois l'interface écrite et observable.
 *
 *   cacheComponents — rend le cache explicite : tout ce qui n'est pas marqué
 *   'use cache' devient dynamique, et une lecture de cookies() ou de searchParams
 *   hors d'une frontière <Suspense> devient une erreur de construction. Ce
 *   n'est pas un réglage de performance, c'est un modèle d'exécution : il
 *   impose où sont les frontières de suspense de chaque page. Les pages de ce
 *   projet lisent toutes la session depuis un cookie ; décider cela avant
 *   qu'elles soient écrites reviendrait à contraindre leur structure à
 *   l'aveugle.
 *
 * Les deux s'activent sans migration de données. Les laisser pour plus tard ne
 * coûte donc rien, alors que les allumer trop tôt coûte du débogage.
 */
const configuration: NextConfig = {
  /**
   * La racine de l'espace de travail, posée explicitement.
   *
   * Sans elle, Turbopack la DÉDUIT en remontant jusqu'au fichier de
   * verrouillage le plus haut — et il en trouve deux : celui de ce projet et
   * celui de `Documents/Projet/`, qui n'a aucun rapport avec lui. Il retient
   * le second, le signale dans un avertissement qu'on finit par ne plus lire,
   * et résout dès lors les modules depuis un dossier étranger.
   *
   * `import.meta.dirname` plutôt qu'un chemin en dur : la valeur reste juste
   * si le dépôt est cloné ailleurs.
   */
  turbopack: {
    root: import.meta.dirname,
  },

  /**
   * Sortie autonome, pour l'image de production.
   *
   * `next build` produit alors `.next/standalone/` : un serveur minimal et
   * uniquement les fichiers de `node_modules` que le code atteint réellement.
   * L'image finale n'a donc pas besoin d'un `npm ci` — elle recopie un dossier.
   *
   * Ce qui compte ici n'est pas la taille de l'image mais la MÉMOIRE :
   * l'offre gratuite de Render donne 512 Mio, et le conteneur fait tourner
   * DEUX processus Node — l'API NestJS et ce serveur. `next start` chargerait
   * l'arbre complet des dépendances ; le serveur autonome ne charge que le
   * nécessaire.
   *
   * Deux pièges que la documentation signale et qu'on paie sinon au premier
   * déploiement : le serveur autonome ne recopie NI `public/` NI
   * `.next/static/`. Sans eux, la page s'affiche sans aucune feuille de style
   * et sans police — ce qui ressemble à un bogue de rendu, pas à un fichier
   * manquant. Le Dockerfile les remet en place explicitement.
   */
  output: 'standalone',
};

export default configuration;
