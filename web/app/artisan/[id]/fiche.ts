/* ══════════════════════════════════════════════════════════════════════════
   LA FORME D'UN IDENTIFIANT, POUR LA FICHE D'ARTISAN

   Ce module est à part pour la même raison que `lib/destination.ts` dans le
   socle : il traite une valeur venue du dehors — un segment d'URL — et une
   fonction qu'on ne peut pas éprouver sans démarrer Next est une fonction
   qu'on n'éprouve pas. Les cas sont figés dans `test/recherche.spec.ts`.

   `formaterDateFr` était ici aussi. Elle est passée dans `lib/dates.ts` avec
   les trois autres formateurs de date du projet : celle-ci lisait les
   composantes en UTC, donc datait de la veille tout avis déposé après 23 h
   heure locale.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * La forme d'un `ObjectId` MongoDB : vingt-quatre chiffres hexadécimaux.
 *
 * Le même motif que `versObjectId` dans `api/src/commun/identifiants.ts`. Le
 * contrôler ICI évite un aller-retour réseau pour une URL qui ne peut pas
 * désigner d'artisan — `/artisan/toto` vient d'un robot ou d'un lien tronqué,
 * et mérite un 404 immédiat plutôt qu'un « Le champ « identifiant » n'est pas
 * un identifiant valide. » affiché dans une carte d'erreur.
 *
 * Ce n'est PAS un contrôle de sécurité : c'est l'API qui refuse les
 * identifiants qu'elle n'aime pas. C'est une économie de requête et un
 * meilleur code de statut.
 */
const MOTIF_OBJECT_ID = /^[0-9a-fA-F]{24}$/;

export const estIdentifiantMongo = (valeur: string): boolean => MOTIF_OBJECT_ID.test(valeur);
