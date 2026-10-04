import { describe, expect, it } from 'vitest';
import { compterDevisRecus, ordonnerParArrivee, validerCreneau } from '../app/mes-besoins/calculs.js';
import { BUDGET_MAXIMUM_CENTIMES, lireBudgetEnDirhams } from '../lib/argent.js';
import { formaterDate, instantDepuisHeureMarocaine } from '../lib/dates.js';

/**
 * ══ Les calculs du parcours client ═════════════════════════════════════════
 *
 * Quatre sujets, et chacun porte une erreur qu'une relecture ne voit pas.
 *
 *   • LE BUDGET. La conversion dirhams → centimes est la seule place du front
 *     où de l'argent est CALCULÉ. Écrite en flottant — `Number(x) * 100` —
 *     elle est juste la plupart du temps, ce qui est la forme d'erreur la plus
 *     coûteuse : personne ne la cherche.
 *
 *   • LE CRÉNEAU. L'API ne contrôle que le type des deux bornes : une fin
 *     antérieure au début passerait, et la réservation née comme cela est
 *     figée. Et la valeur d'un `datetime-local` n'a pas de fuseau, donc
 *     l'instant obtenu dépend de la machine qui lit, serveur ou navigateur.
 *
 *   • L'ORDRE DES DEVIS. L'API les rend triés par montant croissant. Afficher
 *     cet ordre ferait de la première ligne une recommandation.
 *
 *   • LA DATE. `toLocaleDateString` rend « October » sur un Node sans ICU
 *     complet, et un séparateur différent du navigateur — donc une erreur
 *     d'hydratation sur une date rendue des deux côtés.
 */

describe('Le budget saisi en dirhams', () => {
  it('rend des centimes entiers', () => {
    expect(lireBudgetEnDirhams('4500')).toEqual({ etat: 'lu', centimes: 450_000 });
    expect(lireBudgetEnDirhams('1')).toEqual({ etat: 'lu', centimes: 100 });
  });

  it('accepte la virgule comme le point', () => {
    expect(lireBudgetEnDirhams('1500,50')).toEqual({ etat: 'lu', centimes: 150_050 });
    expect(lireBudgetEnDirhams('1500.50')).toEqual({ etat: 'lu', centimes: 150_050 });
  });

  it('complète une seule décimale', () => {
    // « 12,5 DH » vaut 1250 centimes, pas 125.
    expect(lireBudgetEnDirhams('12,5')).toEqual({ etat: 'lu', centimes: 1250 });
  });

  /**
   * Le cas qui condamne la version en flottant.
   *
   * `1.005 * 100` vaut 100.49999999999999 : arrondi, cela donne 100 centimes
   * au lieu de 101. `19.99 * 100` vaut 1998.9999999999998, que l'arrondi
   * rattrape — d'où une fonction qui semble correcte tant qu'on l'éprouve sur
   * le second cas.
   */
  it("ne perd pas de centime sur les valeurs que le flottant trahit", () => {
    expect(lireBudgetEnDirhams('1,005')).toMatchObject({ etat: 'invalide' });
    expect(lireBudgetEnDirhams('19,99')).toEqual({ etat: 'lu', centimes: 1999 });
    expect(lireBudgetEnDirhams('1,01')).toEqual({ etat: 'lu', centimes: 101 });
    expect(lireBudgetEnDirhams('8,29')).toEqual({ etat: 'lu', centimes: 829 });
    expect(lireBudgetEnDirhams('0,07')).toEqual({ etat: 'lu', centimes: 7 });
  });

  it('retire les espaces de groupement, y compris la fine insécable', () => {
    expect(lireBudgetEnDirhams('12 000')).toEqual({ etat: 'lu', centimes: 1_200_000 });
    expect(lireBudgetEnDirhams('12 000')).toEqual({ etat: 'lu', centimes: 1_200_000 });
    // U+202F : celle que `Montant` écrit, donc celle qu'un copier-coller
    // depuis un montant affiché rapporte dans le champ.
    expect(lireBudgetEnDirhams('12 000,50')).toEqual({ etat: 'lu', centimes: 1_200_050 });
  });

  it('traite le champ vide comme une absence, pas comme une erreur', () => {
    expect(lireBudgetEnDirhams('')).toEqual({ etat: 'absent' });
    expect(lireBudgetEnDirhams('   ')).toEqual({ etat: 'absent' });
  });

  it('refuse ce qui ne se lit pas comme une somme', () => {
    for (const saisie of ['environ 4500', '4500 DH', '-200', '4e3', '1,2,3', '.5', '4500,']) {
      expect(lireBudgetEnDirhams(saisie), saisie).toMatchObject({ etat: 'invalide' });
    }
  });

  it('refuse zéro, parce que ne rien annoncer se fait en laissant le champ vide', () => {
    expect(lireBudgetEnDirhams('0')).toMatchObject({ etat: 'invalide' });
    expect(lireBudgetEnDirhams('0,00')).toMatchObject({ etat: 'invalide' });
  });

  it('refuse ce qui dépasserait le plafond', () => {
    const limite = BUDGET_MAXIMUM_CENTIMES / 100;
    expect(lireBudgetEnDirhams(String(limite))).toEqual({
      etat: 'lu',
      centimes: BUDGET_MAXIMUM_CENTIMES,
    });
    expect(lireBudgetEnDirhams(String(limite + 1))).toMatchObject({ etat: 'invalide' });
  });
});

describe("L'heure saisie, lue comme une heure marocaine", () => {
  /**
   * Le Maroc est à UTC+1 : 9 h sur place est 8 h UTC. C'est l'assertion qui
   * tient tout le reste — et elle est VRAIE QUEL QUE SOIT le fuseau de la
   * machine qui exécute ce test, ce qui est précisément ce que `new Date` ne
   * garantit pas.
   */
  it('décale de l’heure du Maroc, et non de celle de la machine', () => {
    expect(instantDepuisHeureMarocaine('2026-10-07T09:00')).toBe('2026-10-07T08:00:00.000Z');
    expect(instantDepuisHeureMarocaine('2026-01-01T00:30')).toBe('2025-12-31T23:30:00.000Z');
  });

  it('accepte les secondes que certains navigateurs ajoutent', () => {
    expect(instantDepuisHeureMarocaine('2026-10-07T09:00:00')).toBe('2026-10-07T08:00:00.000Z');
  });

  it('refuse une date qui n’existe pas', () => {
    // `Date.UTC(2026, 1, 31)` ne lève pas : il rend le 3 mars. Sans le témoin
    // qui relit les composantes, un rendez-vous pris le 31 février serait
    // enregistré trois jours plus tard.
    expect(instantDepuisHeureMarocaine('2026-02-31T09:00')).toBeNull();
    expect(instantDepuisHeureMarocaine('2026-13-01T09:00')).toBeNull();
    expect(instantDepuisHeureMarocaine('2026-10-07T25:00')).toBeNull();
  });

  it('refuse ce qui n’a pas la forme d’un champ datetime-local', () => {
    for (const saisie of ['', 'demain', '07/10/2026 09:00', '2026-10-07', '2026-10-07T09']) {
      expect(instantDepuisHeureMarocaine(saisie), saisie).toBeNull();
    }
  });
});

describe("Le créneau d'intervention", () => {
  const maintenant = new Date('2026-10-01T12:00:00.000Z');

  it('accepte un créneau à venir, et rend deux instants absolus', () => {
    expect(validerCreneau('2026-10-07T09:00', '2026-10-07T12:00', maintenant)).toEqual({
      etat: 'ok',
      debut: '2026-10-07T08:00:00.000Z',
      fin: '2026-10-07T11:00:00.000Z',
    });
  });

  it('refuse une fin antérieure au début — ce que l’API accepterait', () => {
    const lecture = validerCreneau('2026-10-07T12:00', '2026-10-07T09:00', maintenant);
    expect(lecture.etat).toBe('refus');
    if (lecture.etat === 'refus') expect(lecture.erreurs.fin).toBeTruthy();
  });

  it('refuse un créneau de durée nulle', () => {
    const lecture = validerCreneau('2026-10-07T09:00', '2026-10-07T09:00', maintenant);
    expect(lecture.etat).toBe('refus');
    if (lecture.etat === 'refus') expect(lecture.erreurs.fin).toBeTruthy();
  });

  it('refuse un début déjà passé', () => {
    const lecture = validerCreneau('2026-09-30T09:00', '2026-09-30T12:00', maintenant);
    expect(lecture.etat).toBe('refus');
    if (lecture.etat === 'refus') expect(lecture.erreurs.debut).toBeTruthy();
  });

  it('nomme les deux champs manquants séparément', () => {
    const lecture = validerCreneau('', '', maintenant);
    expect(lecture.etat).toBe('refus');
    if (lecture.etat === 'refus') {
      expect(Object.keys(lecture.erreurs).sort()).toEqual(['debut', 'fin']);
    }
  });
});

describe('Les devis reçus', () => {
  it('ne compte pas les devis retirés', () => {
    expect(
      compterDevisRecus([
        { statut: 'ENVOYE' },
        { statut: 'RETIRE' },
        { statut: 'REFUSE' },
        { statut: 'ACCEPTE' },
      ]),
    ).toBe(3);
    expect(compterDevisRecus([])).toBe(0);
  });

  /**
   * L'ordre d'arrivée, et non celui que l'API rend.
   *
   * Les devis arrivent triés par montant croissant : le tableau d'entrée de ce
   * test est donc exactement ce que la page reçoit, le moins cher en tête,
   * alors qu'il est arrivé en dernier.
   */
  it('remet les devis dans leur ordre d’arrivée', () => {
    const recus = [
      { id: 'moins-cher', createdAt: '2026-10-03T10:00:00.000Z' },
      { id: 'moyen', createdAt: '2026-10-01T10:00:00.000Z' },
      { id: 'plus-cher', createdAt: '2026-10-02T10:00:00.000Z' },
    ];

    expect(ordonnerParArrivee(recus).map((devis) => devis.id)).toEqual([
      'moyen',
      'plus-cher',
      'moins-cher',
    ]);
  });

  it('ne modifie pas le tableau reçu de l’API', () => {
    // Le tableau vient de la réponse GraphQL, que le reste de la page lit
    // aussi : un `sort` en place changerait l'ordre sous les pieds d'un autre
    // composant, sans erreur et sans trace.
    const recus = [
      { id: 'second', createdAt: '2026-10-02T10:00:00.000Z' },
      { id: 'premier', createdAt: '2026-10-01T10:00:00.000Z' },
    ];
    ordonnerParArrivee(recus);
    expect(recus.map((devis) => devis.id)).toEqual(['second', 'premier']);
  });
});

describe('La date écrite en français', () => {
  it('écrit le jour, le mois en lettres et l’année', () => {
    expect(formaterDate('2026-10-03T09:30:00.000Z')).toBe('3 octobre 2026');
    expect(formaterDate('2026-01-31T12:00:00.000Z')).toBe('31 janvier 2026');
    // Le premier du mois s'écrit « 1er » : la seule irrégularité de
    // l'écriture française des dates, et celle qu'on oublie.
    expect(formaterDate('2026-08-01T06:00:00.000Z')).toBe('1er août 2026');
  });

  it('lit l’instant à l’heure du Maroc, et non à celle de la machine', () => {
    // 23 h 30 UTC le 2 octobre est déjà le 3 octobre à Marrakech. Un test
    // écrit à midi n'aurait jamais distingué les deux lectures.
    expect(formaterDate('2026-10-02T23:30:00.000Z')).toBe('3 octobre 2026');
  });

  it('rend null sur une date illisible, plutôt que « Invalid Date »', () => {
    expect(formaterDate('')).toBeNull();
    expect(formaterDate('pas une date')).toBeNull();
  });
});
