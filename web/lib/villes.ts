/* ══════════════════════════════════════════════════════════════════════════
   LES VILLES MAROCAINES, EN UN SEUL ENDROIT

   ── Ce que ce fichier répare ───────────────────────────────────────────────

   Il y avait DEUX listes, écrites par deux agents qui ne se voyaient pas :

     • `app/inscription/position.ts` — huit villes, triées par population, sans
       slug. Elle servait à l'inscription de l'artisan, à la publication d'un
       besoin et à la résolution ville → coordonnées de `app/actions/besoins.ts`.
     • `app/recherche/criteres.ts` — dix-huit villes, triées par slug, avec un
       slug destiné à l'URL de la recherche.

   Les deux divergeaient sur plus que leur longueur : Fès était à
   34.0181/−5.0078 dans l'une et à 34.0331/−5.0003 dans l'autre, soit deux
   kilomètres d'écart sur la même ville. Et la conséquence visible était
   celle-ci : quelqu'un qui avait cherché un artisan à Oujda ne retrouvait pas
   Oujda au moment de publier son chantier.

   La liste retenue est la LONGUE, qui contient la courte, et les coordonnées
   retenues sont les siennes. Les cinq villes du jeu de données de l'API
   (`api/src/outils/semer.ts`) y sont identiques au chiffre près — Marrakech,
   Tahannaout, Essaouira, Casablanca, Agadir — ce qui est la condition pour
   que les distances affichées soient vérifiables sur une carte, comme le
   README le promet.

   ── L'ordre est alphabétique, et c'est un changement ───────────────────────

   La liste courte était triée par population, pour que « les trois premières
   lignes couvrent la plupart des inscriptions ». À huit entrées, c'était
   juste. À dix-huit, chercher « Ouarzazate » dans une liste dont l'ordre
   n'est devinable par personne coûte plus que le gain des trois premières
   lignes. L'ordre alphabétique est le seul qu'un lecteur puisse anticiper.

   ── Pourquoi une liste fermée, et pas un géocodeur ─────────────────────────

   Aucune dépendance n'est ajoutée sur ce chantier, et appeler un service
   tiers depuis une page publique enverrait l'adresse cherchée à un inconnu.
   La contrepartie est assumée : quelqu'un dont le chantier est à vingt
   kilomètres d'une de ces villes part de la ville. C'est pour cela que le
   bouton « utiliser ma position » existe à côté de chaque liste — lui donne
   le point exact.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Ville {
  /** Ce qui voyage dans l'URL de la recherche. Sans accent ni espace. */
  readonly slug: string;
  /** Ce qui s'affiche, et ce que l'API reçoit dans le champ `ville`. */
  readonly nom: string;
  readonly latitude: number;
  readonly longitude: number;
}

export const VILLES: readonly Ville[] = [
  { slug: 'agadir', nom: 'Agadir', latitude: 30.4278, longitude: -9.5981 },
  { slug: 'beni-mellal', nom: 'Béni Mellal', latitude: 32.3373, longitude: -6.3498 },
  { slug: 'casablanca', nom: 'Casablanca', latitude: 33.5731, longitude: -7.5898 },
  { slug: 'el-jadida', nom: 'El Jadida', latitude: 33.2316, longitude: -8.5007 },
  { slug: 'essaouira', nom: 'Essaouira', latitude: 31.5085, longitude: -9.7595 },
  { slug: 'fes', nom: 'Fès', latitude: 34.0331, longitude: -5.0003 },
  { slug: 'kenitra', nom: 'Kénitra', latitude: 34.261, longitude: -6.5802 },
  { slug: 'marrakech', nom: 'Marrakech', latitude: 31.6258, longitude: -7.9891 },
  { slug: 'meknes', nom: 'Meknès', latitude: 33.8935, longitude: -5.5473 },
  { slug: 'nador', nom: 'Nador', latitude: 35.1688, longitude: -2.9335 },
  { slug: 'ouarzazate', nom: 'Ouarzazate', latitude: 30.9335, longitude: -6.937 },
  { slug: 'oujda', nom: 'Oujda', latitude: 34.6814, longitude: -1.9086 },
  { slug: 'rabat', nom: 'Rabat', latitude: 34.0209, longitude: -6.8416 },
  { slug: 'safi', nom: 'Safi', latitude: 32.2994, longitude: -9.2372 },
  { slug: 'sale', nom: 'Salé', latitude: 34.0531, longitude: -6.7985 },
  { slug: 'tahannaout', nom: 'Tahannaout', latitude: 31.3556, longitude: -7.9511 },
  { slug: 'tanger', nom: 'Tanger', latitude: 35.7595, longitude: -5.834 },
  { slug: 'tetouan', nom: 'Tétouan', latitude: 35.5785, longitude: -5.3684 },
];

/** La ville dont le slug est celui-ci, ou `null`. La casse est ignorée. */
export const villeParSlug = (slug: string): Ville | null =>
  VILLES.find((candidate) => candidate.slug === slug.trim().toLowerCase()) ?? null;

/**
 * La ville dont le NOM est exactement celui-ci, ou `null`.
 *
 * La comparaison est exacte, accents compris : le nom vient d'un `<select>`
 * dont les options sortent de cette même liste. L'assouplir — insensible à la
 * casse, accents retirés — ferait accepter « fes » pour « Fès » et masquerait
 * un formulaire fabriqué à la main, que l'appelant doit traiter comme une
 * saisie libre et non comme un choix dans la liste.
 */
export const villeParNom = (nom: string): Ville | null =>
  VILLES.find((candidate) => candidate.nom === nom) ?? null;

/* ── Les coordonnées ─────────────────────────────────────────────────────── */

/** Cinq décimales valent environ 1,1 m à cette latitude. Voir plus bas. */
const DECIMALES = 5;

/**
 * Ramène une coordonnée à la chaîne qu'un champ caché peut porter, ou `null`
 * si elle n'est pas une coordonnée.
 *
 * ── Pourquoi arrondir ─────────────────────────────────────────────────────
 * `navigator.geolocation` rend des flottants doubles bruts :
 * `31.625811999999997` est une valeur courante. Les dix-sept chiffres
 * annoncent une précision que le GPS d'un téléphone ne possède pas — son
 * incertitude est de l'ordre de la dizaine de mètres —, et ils voyagent
 * ensuite dans le corps de la requête puis dans la base. Cinq décimales
 * valent environ 1,1 m de côté : largement sous le bruit de la mesure, et
 * assez pour que deux ateliers de la même rue restent distincts.
 *
 * ── Pourquoi une CHAÎNE et non un nombre ──────────────────────────────────
 * La valeur va dans un `<input type="hidden">`, dont `value` est une chaîne
 * de toute façon. Rendre un nombre obligerait l'appelant à le convertir, et
 * `String(0.0000001)` s'écrit `1e-7` — que `Number()` relit correctement,
 * mais qu'un humain qui inspecte le formulaire lit comme une anomalie. Le
 * passage par `Number(toFixed(…))` supprime à la fois les zéros de queue et
 * le `-0` que produirait une latitude infinitésimale négative.
 *
 * ── Le refus plutôt que l'écrêtage ────────────────────────────────────────
 * Une latitude de 120 n'est pas une latitude qu'on ramène à 90 : c'est une
 * valeur qui vient d'une erreur en amont — un couple inversé, le piège
 * `[longitude, latitude]` que le README de l'API documente. L'écrêter la
 * rendrait plausible et placerait l'atelier au pôle sans rien signaler.
 */
export const normaliserCoordonnee = (valeur: number, maximum: 90 | 180): string | null => {
  if (!Number.isFinite(valeur)) return null;
  if (valeur < -maximum || valeur > maximum) return null;

  // `Number(...)` après `toFixed` : il retire les zéros de queue (« 31.62580 »
  // devient « 31.6258 ») et ramène `-0` à `0`.
  const arrondie = Number(valeur.toFixed(DECIMALES));

  // L'arrondi peut franchir la borne : 89.999999 arrondi à cinq décimales
  // reste 89.99999, mais 180.000004 devient 180 — déjà écarté plus haut. Le
  // contrôle est refait sur la valeur RENDUE, qui est la seule que l'API
  // verra.
  if (arrondie < -maximum || arrondie > maximum) return null;

  return String(arrondie);
};

/**
 * L'écriture française d'une coordonnée, pour l'afficher à l'écran.
 *
 * La virgule décimale est posée à la main et non par `toLocaleString` : le
 * séparateur choisi par l'ICU diffère entre Node et le navigateur, ce qui
 * produit une erreur d'hydratation sur une valeur rendue des deux côtés. Le
 * raisonnement complet est dans `components/Montant.tsx`.
 *
 * Le signe moins est U+2212, le vrai signe moins, comme dans `Montant` : le
 * trait d'union-moins du clavier est plus court et se confond avec une
 * césure dans une suite de chiffres.
 *
 * L'entrée est la chaîne rendue par `normaliserCoordonnee`, et non un
 * nombre : afficher autre chose que ce qui sera envoyé ferait de l'écran un
 * témoignage faux.
 */
export const formaterCoordonnee = (valeur: string): string =>
  valeur.replace('-', '−').replace('.', ',');
