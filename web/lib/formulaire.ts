/* ══════════════════════════════════════════════════════════════════════════
   L'ÉTAT QUE `useActionState` FAIT CIRCULER

   ── Ce que ce fichier répare ───────────────────────────────────────────────

   `EtatFormulaire` était déclaré dans `app/actions/authentification.ts`, un
   module `'use server'`. Les types traversent — ils sont effacés — mais une
   CONSTANTE ne peut pas : un module `'use server'` ne peut exporter que des
   fonctions asynchrones. L'état initial de `useActionState` s'écrivait donc
   `{}` littéral, redéclaré dans chaque formulaire :

     • `app/connexion/Formulaire.tsx` — `const ETAT_INITIAL: EtatFormulaire = {}` ;
     • `app/inscription/FormulaireClient.tsx` — la même ligne ;
     • `app/inscription/FormulaireArtisan.tsx` — la même ligne ;
     • `app/mes-reservations/Actions.tsx` et `DepotDAvis.tsx` — des `{}` en
       ligne, non typés.

   Quatre agents ont signalé le manque. Le type et sa valeur initiale vivent
   désormais dans le même module sans directive, lisible depuis un composant
   serveur comme depuis un composant client.

   ── Pourquoi ce module n'importe RIEN ─────────────────────────────────────

   Il est lu par des composants `'use client'`. Lui donner une dépendance
   serveur — la session, le client GraphQL — la tirerait dans le paquet du
   navigateur, ce qui est exactement le défaut de construction documenté dans
   l'en-tête de `lib/domaine.ts`.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * L'état que `useActionState` fait circuler, et que TOUTE Server Action de ce
 * projet rend.
 *
 * Tous les champs sont optionnels : un succès qui redirige n'a rien à dire, et
 * `ETAT_INITIAL` doit pouvoir être l'objet vide.
 *
 * `valeurs` renvoie au formulaire ce qui a été saisi, pour le réafficher au
 * lieu de le perdre. Le mot de passe n'y figure JAMAIS : le réécrire dans le
 * HTML le ferait apparaître dans la source de la page, dans le cache du
 * navigateur et dans tout outil qui enregistre les réponses.
 */
export interface EtatFormulaire {
  /** Par nom de champ du formulaire. */
  erreurs?: Record<string, string>;
  /** Le refus qui ne porte sur aucun champ en particulier. */
  message?: string;
  /** Les valeurs à réafficher, mot de passe exclu. */
  valeurs?: Record<string, string>;
}

/**
 * L'état avant le premier envoi.
 *
 * Une constante partagée et non un `{}` par formulaire : `useActionState`
 * compare l'état par référence pour décider s'il a changé, et un littéral
 * recréé à chaque rendu d'un composant client est une nouvelle référence à
 * chaque fois. Le symptôme serait rare et pénible — un rendu de trop, jamais
 * au même endroit.
 */
export const ETAT_INITIAL: EtatFormulaire = {};
