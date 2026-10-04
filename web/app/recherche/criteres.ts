/* ══════════════════════════════════════════════════════════════════════════
   LES CRITÈRES DE RECHERCHE, LUS DEPUIS L'URL

   ── Pourquoi l'URL, et non un état de composant ────────────────────────────

   Une recherche d'artisan se partage (« regarde, c'est lui »), se met en
   favori, se recharge, et revient par le bouton « précédent ». Un `useState`
   dans un composant de filtres perd les quatre : l'adresse de la page ne dit
   plus ce qu'elle affiche. Les critères vivent donc dans la chaîne de requête,
   et ce fichier est le seul endroit qui sait la lire.

   ── Pourquoi ce module est à part, et non dans page.tsx ────────────────────

   Même raison que `lib/destination.ts` dans le socle : une fonction qui
   valide une entrée venue du client doit pouvoir être éprouvée sans traîner
   `next/headers`, le client GraphQL et la session. Ici l'entrée est choisie
   par quelqu'un qui tape dans la barre d'adresse, donc tous les cas tordus
   sont atteignables — `?metier=<n'importe quoi>`, `?note=12`, une latitude
   sans longitude. Les cas sont figés dans `test/recherche.spec.ts`.

   ── Ce que ce module n'est pas ─────────────────────────────────────────────

   Il n'appelle pas l'API et ne connaît pas GraphQL. Il traduit une URL en
   critères, et répond à une seule question de plus : « en a-t-on assez pour
   chercher ? »
   ══════════════════════════════════════════════════════════════════════════ */

import { METIERS } from '@/lib/domaine';
import type { Metier } from '@/lib/domaine';
import { villeParSlug, type Ville } from '@/lib/villes';

/* ── Les notes minimales proposées ───────────────────────────────────────── */

/**
 * Les seuils offerts par la liste déroulante.
 *
 * Fermer la liste a une conséquence utile : une valeur fabriquée à la main
 * dans l'URL (`?note=4.37`) est simplement IGNORÉE, donc le contrôle affiché
 * et la recherche effectuée ne peuvent pas se contredire. Accepter n'importe
 * quel nombre de 0 à 5 aurait laissé la liste retomber sur « peu importe »
 * alors que le filtre, lui, s'appliquait.
 *
 * Pas de seuil à 5 : il ne garderait que les artisans dont AUCUN client n'a
 * jamais mis 4, c'est-à-dire presque personne, et donnerait une liste vide
 * qu'on prendrait pour une panne.
 */
export const NOTES_MINIMALES: readonly number[] = [3, 3.5, 4, 4.5];

/**
 * Le plafond de `$geoNear` dans l'API (`PLAFOND_METRES`, 200 km).
 *
 * Recopié ici pour l'écrire à l'écran : c'est la distance au-delà de laquelle
 * plus aucun artisan ne sort, quel que soit son rayon déclaré. Le dire évite
 * de laisser croire qu'une liste vide signifie « personne dans ce métier ».
 */
export const PLAFOND_RECHERCHE_KM = 200;

/* ── Les noms des paramètres, écrits une fois ────────────────────────────── */

export const PARAMETRES = {
  metier: 'metier',
  ville: 'ville',
  latitude: 'lat',
  longitude: 'lon',
  verifies: 'verifies',
  note: 'note',
} as const;

/* ── La lecture ──────────────────────────────────────────────────────────── */

export interface PointRecherche {
  latitude: number;
  longitude: number;
}

export interface Criteres {
  metier: Metier | null;
  /** La ville choisie dans la liste, si le slug de l'URL en désigne une. */
  ville: Ville | null;
  /** Un point exact, venu du bouton « utiliser ma position ». */
  point: PointRecherche | null;
  verifieSeulement: boolean;
  noteMinimale: number | null;
}

/** Ce que `searchParams` rend en Next 16 : un objet simple, valeurs répétables. */
export type ParametresUrl = Record<string, string | string[] | undefined>;

/**
 * La première valeur d'un paramètre.
 *
 * `?metier=PLOMBERIE&metier=PEINTURE` est une URL valide, et `searchParams`
 * rend alors un tableau. Lire la valeur comme une chaîne donnerait
 * `undefined` sur le type, et `String(tableau)` donnerait
 * « PLOMBERIE,PEINTURE » — un métier qui n'existe pas, donc une recherche
 * refusée sans explication.
 */
const premiere = (valeur: string | string[] | undefined): string => {
  if (Array.isArray(valeur)) return (valeur[0] ?? '').trim();
  return (valeur ?? '').trim();
};

const nombre = (brut: string): number | null => {
  if (brut === '') return null;
  // `Number` et non `parseFloat` : `parseFloat('31,6')` rend 31 en silence, ce
  // qui déplace le point de recherche de soixante kilomètres sans rien dire.
  const valeur = Number(brut);
  return Number.isFinite(valeur) ? valeur : null;
};

/**
 * Le point exact, s'il est complet ET plausible.
 *
 * Les deux coordonnées sont exigées ensemble : une latitude seule ne désigne
 * rien, et compléter l'autre par zéro placerait la recherche dans le golfe de
 * Guinée. Les bornes sont celles des décorateurs de l'API
 * (`@Min(-90)/@Max(90)`, `@Min(-180)/@Max(180)`) : les refuser ici donne un
 * écran qui explique, au lieu d'un « Bad Request Exception » qui ne nomme
 * aucun champ.
 */
const lirePoint = (parametres: ParametresUrl): PointRecherche | null => {
  const latitude = nombre(premiere(parametres[PARAMETRES.latitude]));
  const longitude = nombre(premiere(parametres[PARAMETRES.longitude]));
  if (latitude === null || longitude === null) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
};

/**
 * `true` seulement pour les trois écritures qu'un formulaire peut produire.
 *
 * `verifies=0` et `verifies=non` valent donc `false` : un paramètre présent
 * n'est pas un paramètre vrai, et traiter toute présence comme un oui rendrait
 * la case impossible à décocher par l'URL.
 */
const lireDrapeau = (valeur: string | string[] | undefined): boolean => {
  const brut = premiere(valeur).toLowerCase();
  return brut === '1' || brut === 'true' || brut === 'on';
};

export const lireCriteres = (parametres: ParametresUrl): Criteres => {
  const metierBrut = premiere(parametres[PARAMETRES.metier]).toUpperCase();
  const metier = (METIERS as readonly string[]).includes(metierBrut)
    ? (metierBrut as Metier)
    : null;

  const ville = villeParSlug(premiere(parametres[PARAMETRES.ville]));

  const note = nombre(premiere(parametres[PARAMETRES.note]));

  return {
    metier,
    ville,
    point: lirePoint(parametres),
    verifieSeulement: lireDrapeau(parametres[PARAMETRES.verifies]),
    // Hors de la liste proposée : ignoré. Voir NOTES_MINIMALES.
    noteMinimale: note !== null && NOTES_MINIMALES.includes(note) ? note : null,
  };
};

/**
 * Le point où l'on cherche, ou `null` s'il n'y en a pas.
 *
 * Le point exact l'emporte sur la ville quand les deux sont dans l'URL. Les
 * filtres n'envoient jamais les deux à la fois, donc ce cas vient d'une URL
 * écrite à la main — et entre un centre-ville et des coordonnées, les
 * coordonnées sont ce que quelqu'un a pris la peine de donner.
 */
export const positionCherchee = (criteres: Criteres): PointRecherche | null => {
  if (criteres.point) return criteres.point;
  if (criteres.ville) {
    return { latitude: criteres.ville.latitude, longitude: criteres.ville.longitude };
  }
  return null;
};

/**
 * Peut-on interroger l'API ?
 *
 * Il faut un métier — `EntreeRecherche.metier` n'est pas optionnel — et un
 * point. Sans les deux, la page n'affiche pas une erreur : elle affiche le
 * formulaire et dit ce qui manque.
 */
export const estInterrogeable = (criteres: Criteres): boolean =>
  criteres.metier !== null && positionCherchee(criteres) !== null;

/** Le nom de l'endroit cherché, pour une phrase lisible. */
export const libellePosition = (criteres: Criteres): string | null => {
  if (criteres.point) return 'votre position';
  return criteres.ville ? criteres.ville.nom : null;
};
