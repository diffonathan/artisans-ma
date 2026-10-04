import { describe, expect, it } from 'vitest';
import {
  NOTES_MINIMALES,
  estInterrogeable,
  libellePosition,
  lireCriteres,
  positionCherchee,
  type ParametresUrl,
} from '../app/recherche/criteres.js';
import { estIdentifiantMongo } from '../app/artisan/[id]/fiche.js';
import { formaterDate } from '../lib/dates.js';
import { VILLES } from '../lib/villes.js';

/**
 * ══ LES CRITÈRES DE RECHERCHE VIENNENT DE L'URL ════════════════════════════
 *
 * `?metier=…&ville=…` est choisi par celui qui tape dans la barre d'adresse,
 * pas par le formulaire : tous les cas tordus sont donc atteignables, et
 * aucun ne doit produire d'écran cassé ni d'appel refusé par l'API.
 *
 * Ce qui est éprouvé ici, et pourquoi chaque cas y est :
 *
 *   • la valeur RÉPÉTÉE (`?metier=A&metier=B`), que `searchParams` rend en
 *     TABLEAU. Lue comme une chaîne, elle donnerait « A,B » — un métier
 *     inexistant, donc une recherche refusée sans que l'écran sache pourquoi ;
 *   • la coordonnée INCOMPLÈTE : une latitude sans longitude. La compléter par
 *     zéro placerait la recherche dans le golfe de Guinée, et l'API
 *     répondrait une liste vide parfaitement valide ;
 *   • la coordonnée HORS BORNES, que les décorateurs de l'API refusent par un
 *     « Bad Request Exception » qui ne nomme aucun champ ;
 *   • la note HORS LISTE, qui ferait divergier le contrôle affiché et le
 *     filtre appliqué — la liste déroulante retomberait sur « peu importe »
 *     pendant que la recherche, elle, filtrerait.
 */
const criteres = (parametres: ParametresUrl) => lireCriteres(parametres);

describe('lireCriteres — le métier', () => {
  it('accepte une valeur de l’énumération', () => {
    expect(criteres({ metier: 'PLOMBERIE' }).metier).toBe('PLOMBERIE');
  });

  it('accepte la minuscule, parce qu’une URL se retape à la main', () => {
    expect(criteres({ metier: 'plomberie' }).metier).toBe('PLOMBERIE');
  });

  it('refuse un métier qui n’existe pas, sans lever', () => {
    expect(criteres({ metier: 'ASTROLOGIE' }).metier).toBeNull();
  });

  it('ne concatène pas une valeur répétée : il prend la première', () => {
    expect(criteres({ metier: ['PEINTURE', 'PLOMBERIE'] }).metier).toBe('PEINTURE');
  });

  it('traite l’absence et le vide de la même façon', () => {
    expect(criteres({}).metier).toBeNull();
    expect(criteres({ metier: '' }).metier).toBeNull();
    expect(criteres({ metier: '   ' }).metier).toBeNull();
  });
});

describe('lireCriteres — la ville', () => {
  it('résout un slug connu en coordonnées', () => {
    const resultat = criteres({ ville: 'marrakech' });
    expect(resultat.ville?.nom).toBe('Marrakech');
    // Les coordonnées du jeu de données de l'API, au chiffre près : c'est ce
    // qui rend les distances affichées vérifiables sur une carte.
    expect(resultat.ville?.latitude).toBe(31.6258);
    expect(resultat.ville?.longitude).toBe(-7.9891);
  });

  it('refuse un slug inconnu', () => {
    expect(criteres({ ville: 'lyon' }).ville).toBeNull();
  });

  it('accepte la casse, pas l’accent : le slug est la clé', () => {
    expect(criteres({ ville: 'MEKNES' }).ville?.nom).toBe('Meknès');
    expect(criteres({ ville: 'meknès' }).ville).toBeNull();
  });

  it('n’a aucun slug en double, sinon le premier gagnerait en silence', () => {
    const slugs = VILLES.map((ville) => ville.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('n’a que des coordonnées plausibles pour le Maroc', () => {
    for (const ville of VILLES) {
      expect(ville.latitude).toBeGreaterThan(20);
      expect(ville.latitude).toBeLessThan(36);
      expect(ville.longitude).toBeGreaterThan(-18);
      expect(ville.longitude).toBeLessThan(0);
    }
  });
});

describe('lireCriteres — le point exact', () => {
  it('lit une position complète', () => {
    expect(criteres({ lat: '31.63', lon: '-7.99' }).point).toEqual({
      latitude: 31.63,
      longitude: -7.99,
    });
  });

  it('refuse une latitude sans longitude, et l’inverse', () => {
    expect(criteres({ lat: '31.63' }).point).toBeNull();
    expect(criteres({ lon: '-7.99' }).point).toBeNull();
  });

  it('refuse une coordonnée hors bornes', () => {
    expect(criteres({ lat: '91', lon: '0' }).point).toBeNull();
    expect(criteres({ lat: '0', lon: '181' }).point).toBeNull();
  });

  it('refuse ce qui n’est pas un nombre, virgule décimale comprise', () => {
    expect(criteres({ lat: 'nord', lon: '-7.99' }).point).toBeNull();
    // `parseFloat('31,6')` rendrait 31, soit soixante kilomètres plus au sud.
    expect(criteres({ lat: '31,6', lon: '-7.99' }).point).toBeNull();
  });

  it('accepte le point d’origine, qui est une position comme une autre', () => {
    expect(criteres({ lat: '0', lon: '0' }).point).toEqual({ latitude: 0, longitude: 0 });
  });
});

describe('lireCriteres — les filtres secondaires', () => {
  it('ne reconnaît comme oui que ce qu’un formulaire produit', () => {
    expect(criteres({ verifies: '1' }).verifieSeulement).toBe(true);
    expect(criteres({ verifies: 'on' }).verifieSeulement).toBe(true);
    expect(criteres({ verifies: 'true' }).verifieSeulement).toBe(true);
  });

  it('ne prend pas la présence du paramètre pour un oui', () => {
    expect(criteres({ verifies: '0' }).verifieSeulement).toBe(false);
    expect(criteres({ verifies: 'non' }).verifieSeulement).toBe(false);
    expect(criteres({ verifies: '' }).verifieSeulement).toBe(false);
  });

  it('accepte les seuils de note proposés, et eux seuls', () => {
    for (const note of NOTES_MINIMALES) {
      expect(criteres({ note: String(note) }).noteMinimale).toBe(note);
    }
  });

  it('ignore un seuil absent de la liste, pour que le contrôle et le filtre s’accordent', () => {
    expect(criteres({ note: '4.37' }).noteMinimale).toBeNull();
    expect(criteres({ note: '5' }).noteMinimale).toBeNull();
    expect(criteres({ note: '0' }).noteMinimale).toBeNull();
    expect(criteres({ note: '12' }).noteMinimale).toBeNull();
    expect(criteres({ note: 'bien' }).noteMinimale).toBeNull();
  });
});

describe('positionCherchee', () => {
  it('rend la ville quand il n’y a qu’elle', () => {
    expect(positionCherchee(criteres({ ville: 'agadir' }))).toEqual({
      latitude: 30.4278,
      longitude: -9.5981,
    });
  });

  /**
   * Les filtres n'envoient jamais les deux à la fois : ce cas vient d'une URL
   * écrite à la main, et entre un centre-ville et des coordonnées, ce sont les
   * coordonnées que quelqu'un a pris la peine de donner.
   */
  it('préfère le point exact à la ville quand l’URL porte les deux', () => {
    expect(positionCherchee(criteres({ ville: 'agadir', lat: '31.5', lon: '-9.7' }))).toEqual({
      latitude: 31.5,
      longitude: -9.7,
    });
  });

  it('rend null quand l’URL ne dit pas où', () => {
    expect(positionCherchee(criteres({ metier: 'PEINTURE' }))).toBeNull();
  });
});

describe('estInterrogeable', () => {
  it('exige un métier ET un endroit : l’API n’accepte pas moins', () => {
    expect(estInterrogeable(criteres({}))).toBe(false);
    expect(estInterrogeable(criteres({ metier: 'PEINTURE' }))).toBe(false);
    expect(estInterrogeable(criteres({ ville: 'safi' }))).toBe(false);
    expect(estInterrogeable(criteres({ metier: 'PEINTURE', ville: 'safi' }))).toBe(true);
    expect(estInterrogeable(criteres({ metier: 'PEINTURE', lat: '31', lon: '-8' }))).toBe(true);
  });

  it('ne se laisse pas convaincre par un métier inventé', () => {
    expect(estInterrogeable(criteres({ metier: 'ASTROLOGIE', ville: 'safi' }))).toBe(false);
  });
});

describe('libellePosition', () => {
  it('nomme la ville, ou la position', () => {
    expect(libellePosition(criteres({ ville: 'tanger' }))).toBe('Tanger');
    expect(libellePosition(criteres({ lat: '35.7', lon: '-5.8' }))).toBe('votre position');
    expect(libellePosition(criteres({}))).toBeNull();
  });
});

/**
 * ══ L'IDENTIFIANT DE L'URL DE FICHE ════════════════════════════════════════
 *
 * `/artisan/<n'importe quoi>` est une URL qu'un robot visite. Le motif est
 * celui de `versObjectId` dans l'API : le contrôler avant l'appel transforme
 * une carte d'erreur en 404, sans aller-retour réseau.
 */
describe('estIdentifiantMongo', () => {
  it('accepte un ObjectId, dans les deux casses', () => {
    expect(estIdentifiantMongo('507f1f77bcf86cd799439011')).toBe(true);
    expect(estIdentifiantMongo('507F1F77BCF86CD799439011')).toBe(true);
  });

  it('refuse ce qui n’en est pas un', () => {
    expect(estIdentifiantMongo('')).toBe(false);
    expect(estIdentifiantMongo('toto')).toBe(false);
    // 23 et 25 chiffres : la longueur est exacte, pas minimale.
    expect(estIdentifiantMongo('507f1f77bcf86cd79943901')).toBe(false);
    expect(estIdentifiantMongo('507f1f77bcf86cd7994390111')).toBe(false);
    // `g` n'est pas hexadécimal.
    expect(estIdentifiantMongo('507f1f77bcf86cd79943901g')).toBe(false);
    // Un retour à la ligne final : `$` sans `\n` toléré, sinon un identifiant
    // suivi d'une charge utile passerait.
    expect(estIdentifiantMongo('507f1f77bcf86cd799439011\n')).toBe(false);
  });
});

/**
 * ══ LA DATE D'UN AVIS ══════════════════════════════════════════════════════
 *
 * Le NOM du mois est écrit à la main et non demandé à `Intl` : il dépend des
 * données de langue de l'ICU, et un Node en `small-icu` rend « March ».
 *
 * Le FUSEAU, lui, vient d'`Intl` — les données de fuseau, elles, sont
 * complètes même en `small-icu`. C'est ce qui a changé : la version qui vivait
 * dans `app/artisan/[id]/fiche.ts` lisait les composantes en UTC, et datait
 * donc de la veille tout avis déposé après 23 h heure locale. Les deux
 * assertions ci-dessous le montrent, et c'est pour cela qu'elles ont été
 * modifiées plutôt que l'implémentation.
 */
describe('formaterDate', () => {
  it('écrit la date en français, à l’heure du Maroc', () => {
    expect(formaterDate('2026-03-12T10:30:00.000Z')).toBe('12 mars 2026');
    expect(formaterDate('2026-08-01T08:00:00.000Z')).toBe('1er août 2026');
    // 23 h 59 UTC un 31 décembre : au Maroc, qui est à UTC+1 en décembre, on
    // est déjà le 1er janvier. La lecture en UTC affichait « 31 décembre ».
    expect(formaterDate('2026-12-31T23:59:59.000Z')).toBe('1er janvier 2027');
  });

  it('lit les composantes au Maroc, et non dans le fuseau de la machine', () => {
    // 23 h 30 UTC un 12 mars : le 12 mars 2026 tombe pendant le Ramadan, où le
    // pays revient à UTC+0 — la date ne glisse donc PAS. Le même instant en
    // octobre glisserait, et c'est le cas suivant.
    expect(formaterDate('2026-03-12T23:30:00.000Z')).toBe('12 mars 2026');
    expect(formaterDate('2026-10-12T23:30:00.000Z')).toBe('13 octobre 2026');
  });

  it('rend null sur une valeur illisible, pour que l’écran omette la date', () => {
    expect(formaterDate('')).toBeNull();
    expect(formaterDate('hier')).toBeNull();
    expect(formaterDate('2026-13-45')).toBeNull();
  });
});
