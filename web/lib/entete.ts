/* ══════════════════════════════════════════════════════════════════════════
   LE COMPTE TEL QUE L'EN-TÊTE L'AFFICHE

   ── Ce que ce fichier répare ───────────────────────────────────────────────

   Huit pages portaient la même quinzaine de lignes, recopiées : lire la
   session, demander `moi { nom role }`, et retomber proprement sur deux
   pannes distinctes. `app/page.tsx`, `app/recherche/page.tsx`,
   `app/artisan/[id]/page.tsx`, `app/technique/page.tsx`,
   `app/mes-besoins/entete.tsx`, `app/chantiers/page.tsx`,
   `app/mes-devis/page.tsx`, `app/mon-planning/page.tsx`,
   `app/mes-reservations/page.tsx`. Cinq agents sur six ont signalé ce manque,
   et l'un l'a appelé « le plus coûteux de ce chantier ».

   Il n'existe plus qu'un appelant : `app/layout.tsx`, qui monte l'enveloppe
   pour toutes les routes.

   ── Pourquoi `Enveloppe` ne le fait pas elle-même ──────────────────────────

   Parce qu'elle porte `'use client'` : elle a besoin de `usePathname` pour
   marquer la rubrique courante, et lire l'URL depuis un composant serveur
   n'existe pas dans l'App Router. Lire un cookie et appeler l'API sont au
   contraire des gestes de serveur. La couture est donc là : ce module résout
   le compte côté serveur, l'enveloppe le reçoit en propriété.
   ══════════════════════════════════════════════════════════════════════════ */

import type { CompteEnveloppe } from '@/components/Enveloppe';
import type { Role } from '@/lib/domaine';
import { estNonAuthentifie } from '@/lib/erreurs';
import { appelerGraphQLAvecSession } from '@/lib/graphql';
import { lireSession } from '@/lib/session';

/**
 * Le compte à afficher dans la barre, ou `null` pour un visiteur.
 *
 * Le cookie ne porte que l'identifiant et le rôle ; le NOM se demande à
 * l'API. D'où les deux replis, qui ne disent pas la même chose :
 *
 *   - `UNAUTHENTICATED` : le jeton est périmé ou révoqué. On redevient
 *     visiteur, parce qu'un en-tête « connecté » dont toutes les requêtes
 *     échouent est pire qu'un bouton « Se connecter » ;
 *   - toute autre panne (API arrêtée, réseau) : le jeton est probablement bon
 *     et c'est l'API qui manque. On garde la navigation du rôle, avec un
 *     libellé générique — l'application doit rester navigable API éteinte,
 *     sinon c'est l'en-tête qui tombe en panne le premier et toutes les pages
 *     avec lui.
 *
 * Cette fonction ne lève JAMAIS. Elle est appelée depuis la disposition
 * racine : une exception y remplacerait toutes les pages du site par la
 * frontière d'erreur, panne d'API comprise.
 */
export const compteDEntete = async (): Promise<CompteEnveloppe | null> => {
  const session = await lireSession();
  if (!session) return null;

  try {
    const reponse = await appelerGraphQLAvecSession<{ moi: { nom: string; role: Role } }>(
      'query NomDuCompte { moi { nom role } }',
    );
    return { nom: reponse.moi.nom, role: reponse.moi.role };
  } catch (erreur) {
    if (estNonAuthentifie(erreur)) return null;
    return { nom: 'Mon compte', role: session.role };
  }
};
