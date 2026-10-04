import { describe, expect, it } from 'vitest';
import {
  VILLES,
  formaterCoordonnee,
  normaliserCoordonnee,
} from '../lib/villes.js';

/**
 * ══ La position de l'atelier ═══════════════════════════════════════════════
 *
 * Deux choses sont éprouvées ici, et la seconde est la plus utile.
 *
 * 1. `normaliserCoordonnee` reçoit ce que `navigator.geolocation` rend, c'est-
 *    à-dire un flottant double brut, et ce qu'un formulaire fabriqué peut
 *    rendre, c'est-à-dire n'importe quoi. Sa sortie part dans un champ caché
 *    puis dans l'API, où elle devient la position qui décide quels chantiers
 *    l'artisan verra pendant toute la vie du compte.
 *
 * 2. Les coordonnées des huit villes. Le piège documenté par le README de
 *    l'API est l'ordre GeoJSON `[longitude, latitude]`, qui ne provoque
 *    AUCUNE erreur quand on l'inverse — seulement une liste de résultats
 *    vide, et un artisan qui ne reçoit jamais de chantier sans savoir
 *    pourquoi. Un couple inversé sort du Maroc : la latitude devient
 *    négative, donc le contrôle d'enveloppe ci-dessous l'attrape. C'est le
 *    seul moyen mécanique de voir une transposition dans une table écrite à
 *    la main.
 */

/**
 * L'enveloppe du territoire marocain, prise large : du Sahara (≈ 21° N) à la
 * Méditerranée (≈ 36° N), de l'Atlantique (≈ −17° E) à la frontière
 * algérienne (≈ −1° E). Volontairement généreuse — elle n'est pas là pour
 * valider une adresse, mais pour qu'une transposition latitude/longitude en
 * sorte à coup sûr : une longitude marocaine, lue comme une latitude, est
 * négative et donc hors de [21, 36].
 */
const LATITUDE_MIN = 21;
const LATITUDE_MAX = 36;
const LONGITUDE_MIN = -17;
const LONGITUDE_MAX = -1;

describe('Les villes proposées à l’inscription', () => {
  it('place chaque ville dans l’enveloppe du Maroc — donc aucun couple inversé', () => {
    for (const ville of VILLES) {
      expect(ville.latitude, `latitude de ${ville.nom}`).toBeGreaterThanOrEqual(LATITUDE_MIN);
      expect(ville.latitude, `latitude de ${ville.nom}`).toBeLessThanOrEqual(LATITUDE_MAX);
      expect(ville.longitude, `longitude de ${ville.nom}`).toBeGreaterThanOrEqual(LONGITUDE_MIN);
      expect(ville.longitude, `longitude de ${ville.nom}`).toBeLessThanOrEqual(LONGITUDE_MAX);
    }
  });

  it('n’a ni doublon de nom ni nom vide', () => {
    const noms = VILLES.map((ville) => ville.nom);
    expect(new Set(noms).size).toBe(noms.length);
    // L'API exige 2 à 80 caractères pour `ville` ; un nom d'une lettre serait
    // refusé après coup, par un message qui ne nommerait pas le fautif.
    for (const nom of noms) expect(nom.length).toBeGreaterThanOrEqual(2);
  });

  it('rend des coordonnées que la normalisation accepte telles quelles', () => {
    // Si une ville portait plus de cinq décimales, la valeur envoyée à l'API
    // différerait de celle écrite ici — et les distances mesurées par les
    // tests de l'API ne seraient plus celles de l'écran.
    for (const ville of VILLES) {
      expect(normaliserCoordonnee(ville.latitude, 90)).toBe(String(ville.latitude));
      expect(normaliserCoordonnee(ville.longitude, 180)).toBe(String(ville.longitude));
    }
  });
});

describe('La normalisation d’une coordonnée', () => {
  it('coupe le bruit du GPS à cinq décimales', () => {
    // Forme réellement rendue par navigator.geolocation : le double le plus
    // proche de 31,625812 s'écrit avec dix-sept chiffres significatifs.
    expect(normaliserCoordonnee(31.625811999999997, 90)).toBe('31.62581');
    expect(normaliserCoordonnee(-7.98910000000001, 180)).toBe('-7.9891');
  });

  it('retire les zéros de queue plutôt que de les figer', () => {
    // `toFixed(5)` seul rendrait « 31.60000 », que l'API relit correctement
    // mais qui annonce une mesure au décimètre là où il n'y en a pas.
    expect(normaliserCoordonnee(31.6, 90)).toBe('31.6');
    expect(normaliserCoordonnee(34, 90)).toBe('34');
  });

  it('ne laisse jamais sortir « −0 »', () => {
    // String(-0) vaut « 0 », mais `(-0.000001).toFixed(5)` vaut « -0.00000 » :
    // sans le passage par Number, le champ caché porterait un zéro signé, et
    // l'équateur deviendrait une valeur suspecte à la lecture.
    expect(normaliserCoordonnee(-0.000001, 90)).toBe('0');
    expect(normaliserCoordonnee(-0, 180)).toBe('0');
  });

  it('refuse une valeur hors des bornes, au lieu de l’y ramener', () => {
    // Le cas concret : un couple inversé. Une longitude marocaine passe pour
    // une latitude valide (−7,98 est dans [−90, 90]), mais une latitude lue
    // comme une longitude reste valide aussi — c'est pourquoi le contrôle des
    // villes ci-dessus existe en plus de celui-ci.
    expect(normaliserCoordonnee(120, 90)).toBeNull();
    expect(normaliserCoordonnee(-90.00001, 90)).toBeNull();
    expect(normaliserCoordonnee(181, 180)).toBeNull();
    expect(normaliserCoordonnee(-180.5, 180)).toBeNull();
  });

  it('accepte exactement les bornes', () => {
    expect(normaliserCoordonnee(90, 90)).toBe('90');
    expect(normaliserCoordonnee(-90, 90)).toBe('-90');
    expect(normaliserCoordonnee(180, 180)).toBe('180');
  });

  it('refuse ce qui n’est pas un nombre fini', () => {
    expect(normaliserCoordonnee(Number.NaN, 90)).toBeNull();
    expect(normaliserCoordonnee(Number.POSITIVE_INFINITY, 90)).toBeNull();
    expect(normaliserCoordonnee(Number.NEGATIVE_INFINITY, 180)).toBeNull();
  });

  it('rend une chaîne que Number relit à l’identique', () => {
    // C'est le contrat réel : la Server Action fait `Number(brut)`. Une
    // écriture que `Number` relirait autrement déplacerait l'atelier.
    for (const brut of [31.625811999999997, -7.9891, 0, 35.7595, -17.1, 89.999999]) {
      const rendue = normaliserCoordonnee(brut, 180);
      expect(rendue).not.toBeNull();
      expect(Number(rendue)).toBe(Number(brut.toFixed(5)));
    }
  });
});

describe('L’écriture française d’une coordonnée', () => {
  it('pose la virgule décimale', () => {
    expect(formaterCoordonnee('31.6258')).toBe('31,6258');
  });

  it('remplace le trait d’union par le vrai signe moins', () => {
    // U+2212. Le trait d'union-moins du clavier est plus court et se lit comme
    // une césure au milieu d'une suite de chiffres.
    expect(formaterCoordonnee('-7.9891')).toBe('−7,9891');
  });

  it('laisse un entier intact', () => {
    expect(formaterCoordonnee('34')).toBe('34');
  });
});
