/* ══════════════════════════════════════════════════════════════════════════
   LES DATES ET LES CRÉNEAUX, À L'HEURE DU MAROC

   ── Ce que ce fichier répare ───────────────────────────────────────────────

   Quatre agents ont écrit un formateur de date, et ils ont arbitré la
   question du fuseau de TROIS façons différentes :

     • `app/chantiers/libelles.ts` — `Intl` avec `timeZone: 'Africa/Casablanca'`
       et des libellés `fr-MA`. Juste sur le fuseau, exposé sur la LANGUE :
       un Node compilé en `small-icu` ne connaît que l'anglais et rend
       « March ».
     • `app/mes-besoins/calculs.ts` et `app/mes-reservations/regles.ts` —
       table française écrite à la main, décalage FIXE de +60 minutes. Juste
       sur la langue, faux pendant le Ramadan, où le pays repasse à UTC+0 :
       les créneaux s'affichaient alors une heure en avance.
     • `app/artisan/[id]/fiche.ts` — table française, composantes lues en UTC,
       aucun décalage. Juste sur la langue, et décalé d'une heure onze mois
       sur douze : un avis déposé après 23 h s'affichait la veille.

   Trois écrans donnaient donc trois heures différentes pour le même instant.

   ── Le partage qui règle les trois ─────────────────────────────────────────

   Les deux craintes étaient réelles, mais elles ne portent pas sur la même
   donnée. `small-icu` réduit les données de LANGUE — c'est pour ça que les
   mois sortent en anglais — mais il embarque la base de FUSEAUX complète.
   Les deux responsabilités sont donc séparées :

     • la langue vient des tables ci-dessous, écrites à la main. La sortie est
       identique sur le serveur et dans le navigateur, ce qui ferme aussi le
       risque d'erreur d'hydratation sur une date rendue des deux côtés ;
     • le fuseau vient d'`Intl` avec la locale 'en-US' et des champs
       NUMÉRIQUES uniquement. Aucun nom n'est demandé à l'ICU, donc rien ne
       dépend de ses données de langue — et le Ramadan est traité par la base
       de fuseaux, qui le connaît.

   Vérifié dans cette session : `Africa/Casablanca` rend bien UTC+1 au 3
   octobre 2026 et UTC+0 au 1er mars 2026, en plein Ramadan.

   ── Et si l'ICU ignorait quand même le fuseau ──────────────────────────────

   C'est le défaut que les deux agents du décalage fixe craignaient, et il ne
   se signale pas : un Node bâti sans base de fuseaux rend de l'UTC présenté
   comme de l'heure locale. Il est donc DÉTECTÉ une fois au chargement, par un
   instant témoin dont on connaît la réponse, et le décalage fixe de +60
   minutes sert alors de repli — avec son défaut de Ramadan, mais au moins
   nommé. Une heure fausse qui se tait est pire qu'un décalage assumé.
   ══════════════════════════════════════════════════════════════════════════ */

const FUSEAU = 'Africa/Casablanca';

/** Le repli : le Maroc est à UTC+1 toute l'année, Ramadan excepté. */
const DECALAGE_REPLI_MINUTES = 60;

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'] as const;

/**
 * Le découpeur de composantes.
 *
 * `'en-US'` et non `'fr'` : la locale ne sert qu'à choisir des chiffres, tous
 * les champs demandés étant numériques. En demander une que l'ICU réduit ne
 * change donc rien au résultat, alors que demander un `month: 'long'` l'aurait
 * rendu dépendant d'elle.
 *
 * `hourCycle: 'h23'` et non `hour12: false` : ce dernier rend « 24 » pour
 * minuit dans plusieurs versions d'ICU, ce qui donne une heure que personne
 * n'écrit et qui casse la comparaison de deux instants.
 */
const DECOUPEUR = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSEAU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Les composantes d'un instant, lues dans le fuseau du Maroc.
 *
 * Le jour de la semaine n'est PAS demandé à l'ICU (ce serait un nom, donc une
 * donnée de langue) : il est recalculé à partir des composantes, en les
 * interprétant comme de l'UTC. `getUTCDay` sur une date construite ainsi
 * donne le bon jour de la semaine, le décalage ayant déjà été appliqué par le
 * découpage.
 */
export interface ComposantesLocales {
  annee: number;
  /** De 1 à 12, comme on l'écrit — et non de 0 à 11 comme `getUTCMonth`. */
  mois: number;
  jour: number;
  heures: number;
  minutes: number;
  /** 0 = dimanche, comme `getUTCDay`. */
  jourSemaine: number;
}

/** Vrai quand l'ICU de cette exécution honore réellement `timeZone`. */
const FUSEAU_HONORE = (() => {
  try {
    // Le 3 octobre 2026 à 23 h 30 UTC, le Maroc est à UTC+1 : il est donc
    // déjà le 4 là-bas. Un ICU qui ignore le fuseau répondra « 03 ».
    const parties = DECOUPEUR.formatToParts(new Date('2026-10-03T23:30:00Z'));
    const jour = parties.find((partie) => partie.type === 'day')?.value;
    return jour === '04';
  } catch {
    return false;
  }
})();

const parComposantesIntl = (instant: Date): ComposantesLocales => {
  const parties = DECOUPEUR.formatToParts(instant);
  const lire = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parties.find((partie) => partie.type === type)?.value ?? Number.NaN);

  const annee = lire('year');
  const mois = lire('month');
  const jour = lire('day');
  const heures = lire('hour');
  const minutes = lire('minute');

  return {
    annee,
    mois,
    jour,
    heures,
    minutes,
    jourSemaine: new Date(Date.UTC(annee, mois - 1, jour)).getUTCDay(),
  };
};

const parDecalageFixe = (instant: Date): ComposantesLocales => {
  const decale = new Date(instant.getTime() + DECALAGE_REPLI_MINUTES * 60_000);
  return {
    annee: decale.getUTCFullYear(),
    mois: decale.getUTCMonth() + 1,
    jour: decale.getUTCDate(),
    heures: decale.getUTCHours(),
    minutes: decale.getUTCMinutes(),
    jourSemaine: decale.getUTCDay(),
  };
};

/**
 * Les composantes d'un instant ISO, à l'heure du Maroc, ou `null` si la chaîne
 * n'est pas une date.
 *
 * `null` et non une date de repli : l'appelant choisit quoi afficher, au lieu
 * de recevoir « Invalid Date » dans sa page.
 */
export const composantesAuMaroc = (iso: string): ComposantesLocales | null => {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return FUSEAU_HONORE ? parComposantesIntl(instant) : parDecalageFixe(instant);
};

/** Le quantième : « 1er » le premier du mois, le nombre seul ensuite. */
const quantieme = (jour: number): string => (jour === 1 ? '1er' : String(jour));

const deuxChiffres = (valeur: number): string => String(valeur).padStart(2, '0');

/**
 * « 1er mars 2026 ». `null` sur une date illisible.
 *
 * C'est la forme par défaut : une date de dépôt, une date d'avis, un jour de
 * publication. Le jour de la semaine n'y est pas — savoir qu'un devis est
 * arrivé un jeudi n'apporte rien.
 */
export const formaterDate = (iso: string): string | null => {
  const c = composantesAuMaroc(iso);
  if (!c) return null;
  return `${quantieme(c.jour)} ${MOIS[c.mois - 1]} ${c.annee}`;
};

/**
 * « jeudi 8 octobre 2026 ». `null` sur une date illisible.
 *
 * Le jour de la semaine sert là où quelqu'un doit S'ORGANISER : un créneau
 * d'intervention se retient par « jeudi », pas par « le 8 ».
 */
export const formaterDateAvecJour = (iso: string): string | null => {
  const c = composantesAuMaroc(iso);
  return c ? jourComplet(c) : null;
};

/** « 09:30 », à l'heure du Maroc. `null` sur une date illisible. */
export const formaterHeure = (iso: string): string | null => {
  const c = composantesAuMaroc(iso);
  return c ? heureCourte(c) : null;
};

/**
 * Un créneau, découpé en ses quatre morceaux.
 *
 * Les jours et les heures sont SÉPARÉS, et ce n'est pas un confort : la charte
 * réserve Azeret Mono aux nombres, donc l'écran doit pouvoir poser
 * `class="nombre"` sur « 09:00 » sans l'étendre à « jeudi 8 octobre ». Rendre
 * une phrase toute faite interdirait cette distinction.
 *
 * Les deux écrans qui s'en servent n'en font d'ailleurs pas la même phrase :
 * `/mes-reservations` écrit « jeudi 8 octobre, de 09:00 à 12:00 » dans une
 * liste de définitions, `/mon-planning` met le jour en titre et les heures
 * dessous. C'est pourquoi cette fonction rend des morceaux et pas du texte.
 */
export interface CreneauLisible {
  /** « jeudi 8 octobre 2026 » */
  debutJour: string;
  /** « 09:00 » */
  debutHeure: string;
  finJour: string;
  finHeure: string;
  /** Les deux bornes tombent le même jour : l'écran écrit alors la date une fois. */
  memeJour: boolean;
}

const jourComplet = (c: ComposantesLocales): string =>
  `${JOURS[c.jourSemaine]} ${quantieme(c.jour)} ${MOIS[c.mois - 1]} ${c.annee}`;

const heureCourte = (c: ComposantesLocales): string =>
  `${deuxChiffres(c.heures)}:${deuxChiffres(c.minutes)}`;

/**
 * Le créneau tel qu'il se lit. `null` si l'une des bornes est illisible :
 * l'écran dit alors que le créneau ne se lit pas, ce qui est la vérité.
 *
 * La comparaison des deux jours porte sur les COMPOSANTES et non sur les
 * libellés : un créneau du 14 à 23 h au 15 à 1 h UTC tombe le même jour au
 * Maroc certains mois et pas d'autres, et comparer deux chaînes formatées
 * marcherait par accident.
 */
export const formaterCreneau = (debutIso: string, finIso: string): CreneauLisible | null => {
  const debut = composantesAuMaroc(debutIso);
  const fin = composantesAuMaroc(finIso);
  if (!debut || !fin) return null;

  return {
    debutJour: jourComplet(debut),
    debutHeure: heureCourte(debut),
    finJour: jourComplet(fin),
    finHeure: heureCourte(fin),
    memeJour: debut.annee === fin.annee && debut.mois === fin.mois && debut.jour === fin.jour,
  };
};

/** La forme à deux lignes : le jour d'un côté, les heures de l'autre. */
export interface CreneauCompact {
  /** « jeudi 8 octobre 2026 », ou « du … au … » si les bornes changent de jour. */
  jour: string;
  /** « 09:00 – 12:00 », ou « 23:00 → 02:00 » quand le créneau passe minuit. */
  heures: string;
}

/**
 * Le créneau en deux lignes : un jour, puis une plage d'heures.
 *
 * Le repli est une PHRASE et non `null`, parce que son appelant l'affiche en
 * titre de carte : un titre absent casserait la mise en page, là où une liste
 * de définitions peut simplement dire que la valeur manque.
 */
export const creneauCompact = (debutIso: string, finIso: string): CreneauCompact => {
  const creneau = formaterCreneau(debutIso, finIso);
  if (!creneau) return { jour: 'Créneau indisponible', heures: '' };

  if (creneau.memeJour) {
    return {
      jour: creneau.debutJour,
      heures: `${creneau.debutHeure} – ${creneau.finHeure}`,
    };
  }

  return {
    jour: `du ${creneau.debutJour} au ${creneau.finJour}`,
    heures: `${creneau.debutHeure} → ${creneau.finHeure}`,
  };
};

/** L'instant est-il encore devant nous ? Sert à compter les interventions à venir. */
export const estAVenir = (iso: string, maintenant: number = Date.now()): boolean => {
  const instant = new Date(iso).getTime();
  return Number.isFinite(instant) && instant >= maintenant;
};

/* ── Le sens inverse : une saisie locale vers un instant ─────────────────── */

const SAISIE_LOCALE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/;

/**
 * Le décalage du Maroc, en minutes, à un instant donné.
 *
 * Il est MESURÉ et non supposé : les composantes locales de l'instant sont
 * relues comme de l'UTC, et l'écart avec l'instant est le décalage. C'est ce
 * qui rend la conversion juste pendant le Ramadan comme en dehors.
 */
const decalageMinutes = (instantMs: number): number => {
  const c = FUSEAU_HONORE
    ? parComposantesIntl(new Date(instantMs))
    : parDecalageFixe(new Date(instantMs));
  const commeUtc = Date.UTC(c.annee, c.mois - 1, c.jour, c.heures, c.minutes);
  // Les secondes ne sont pas dans les composantes : l'écart est arrondi à la
  // minute, ce qui est exact — aucun fuseau n'a de décalage à la seconde.
  return Math.round((commeUtc - Math.floor(instantMs / 60_000) * 60_000) / 60_000);
};

/**
 * Lit la valeur d'un `<input type="datetime-local">` comme une HEURE
 * MAROCAINE, et rend l'instant correspondant en ISO.
 *
 * ── Pourquoi pas `new Date(valeur)` ───────────────────────────────────────
 * Parce que « 2026-10-07T09:00 » est une heure sans fuseau, et que `new Date`
 * l'interprète dans le fuseau de la MACHINE QUI LIT. Cette machine est ici le
 * serveur, dont le fuseau est celui de l'hébergeur : un rendez-vous pris à 9 h
 * s'enregistrerait à 9 h UTC, soit 10 h sur place. Le même code dans le
 * navigateur donnerait encore un troisième résultat.
 *
 * ── Pourquoi l'heure du Maroc, et non celle du lecteur ────────────────────
 * Parce que le créneau est l'heure à laquelle l'artisan sonne à la porte.
 * C'est une heure de chantier, et le chantier est au Maroc. Un client qui
 * réserve depuis Bruxelles tape « 9 h » en pensant à l'heure locale du
 * chantier ; interpréter sa saisie dans SON fuseau avancerait le rendez-vous
 * d'une heure sans que rien ne le dise.
 *
 * ── Les deux passes, et pourquoi ──────────────────────────────────────────
 * Le décalage se mesure SUR un instant, et l'instant est précisément ce qu'on
 * cherche : il faut donc une première estimation. La seconde passe corrige le
 * cas où l'estimation tombait de l'autre côté d'un changement d'heure.
 *
 * Le témoin final refuse ce qui n'existe pas : « 2026-02-31T09:00 », que
 * `Date.UTC` accepte en silence en rendant le 3 mars, et l'heure sautée d'un
 * changement d'horloge, qui ne désigne aucun instant.
 */
export const instantDepuisHeureMarocaine = (saisie: string): string | null => {
  const decoupe = SAISIE_LOCALE.exec(saisie.trim());
  if (!decoupe) return null;

  const [annee, mois, jour, heures, minutes] = decoupe.slice(1, 6).map(Number);
  const commeUtc = Date.UTC(annee, mois - 1, jour, heures, minutes);
  if (Number.isNaN(commeUtc)) return null;

  let instantMs = commeUtc - DECALAGE_REPLI_MINUTES * 60_000;
  instantMs = commeUtc - decalageMinutes(instantMs) * 60_000;
  instantMs = commeUtc - decalageMinutes(instantMs) * 60_000;

  const temoin = FUSEAU_HONORE
    ? parComposantesIntl(new Date(instantMs))
    : parDecalageFixe(new Date(instantMs));

  const conforme =
    temoin.annee === annee &&
    temoin.mois === mois &&
    temoin.jour === jour &&
    temoin.heures === heures &&
    temoin.minutes === minutes;

  return conforme ? new Date(instantMs).toISOString() : null;
};
