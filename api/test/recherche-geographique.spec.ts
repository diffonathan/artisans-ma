import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApplicationDEssai,
  creerApplicationDEssai,
  fabriques,
  MARRAKECH,
} from './base-d-essai.js';
import { Metier } from '../src/commun/types.js';

/**
 * ══ La recherche géographique ══════════════════════════════════════════════
 *
 * La question posée n'est pas « quels artisans sont près d'ici ? » mais
 * « quels artisans acceptent de venir ici ? ». Le seuil est propre à chaque
 * artisan, ce que `maxDistance` ne sait pas exprimer.
 *
 * Ces tests utilisent de vraies coordonnées, à de vraies distances : le calcul
 * sphérique de MongoDB est vérifié contre la géographie, pas contre une
 * approximation plate.
 */
describe('Chercher un artisan qui accepte de venir', () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('recherche-geo');
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  /** Ville réelles, pour que les distances soient vérifiables. */
  const CASABLANCA = { latitude: 33.5731, longitude: -7.5898 }; // ~ 240 km
  const ESSAOUIRA = { latitude: 31.5085, longitude: -9.7595 }; // ~ 170 km
  const TAHANNAOUT = { latitude: 31.3556, longitude: -7.9511 }; // ~ 30 km

  /**
   * ══ LE CŒUR DU SUJET ══════════════════════════════════════════════════════
   *
   * Deux artisans, et c'est le PLUS LOIN qui doit sortir.
   *
   *   • le voisin de Tahannaout est à 30 km, mais n'annonce que 10 km de
   *     rayon : il refuse de venir ;
   *   • celui d'Essaouira est à 170 km, et annonce 200 km : il vient.
   *
   * Un `maxDistance` unique ne peut pas produire ce résultat : réglé à 30 km
   * il garderait le mauvais, réglé à 200 km il garderait les deux. Seul le
   * `$expr` qui compare la distance calculée au rayon DU DOCUMENT le peut.
   */
  it("retient l'artisan éloigné qui couvre, et écarte le proche qui ne couvre pas", async () => {
    await fabriques.artisan(essai, {
      email: 'voisin@essai.ma',
      raisonSociale: 'Plomberie de Tahannaout',
      latitude: TAHANNAOUT.latitude,
      longitude: TAHANNAOUT.longitude,
      rayonKm: 10,
    });
    await fabriques.artisan(essai, {
      email: 'lointain@essai.ma',
      raisonSociale: 'Plomberie d’Essaouira',
      latitude: ESSAOUIRA.latitude,
      longitude: ESSAOUIRA.longitude,
      rayonKm: 200,
    });

    const trouves = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: MARRAKECH,
    });

    expect(trouves).toHaveLength(1);
    expect(trouves[0].raisonSociale).toBe('Plomberie d’Essaouira');

    // La distance calculée est cohérente avec la géographie réelle :
    // Marrakech–Essaouira fait environ 170 km à vol d'oiseau.
    expect(trouves[0].distanceMetres).toBeGreaterThan(150_000);
    expect(trouves[0].distanceMetres).toBeLessThan(190_000);
  });

  /**
   * ══ LE PIÈGE DE L'ORDRE DES COORDONNÉES ═══════════════════════════════════
   *
   * GeoJSON écrit [longitude, latitude]. Inverser les deux ne provoque aucune
   * erreur : la requête réussit et ne trouve rien.
   *
   * Ce test inverse volontairement les deux valeurs pour montrer le symptôme
   * exact — une liste vide, jamais un message. C'est la raison pour laquelle
   * le code ne range jamais les coordonnées à la main mais passe par
   * `positionDepuis(latitude, longitude)`.
   */
  it('ne trouve rien si on inverse latitude et longitude', async () => {
    await fabriques.artisan(essai, {
      email: 'sur-place@essai.ma',
      latitude: MARRAKECH.latitude,
      longitude: MARRAKECH.longitude,
      rayonKm: 50,
    });

    const correct = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: MARRAKECH,
    });
    expect(correct).toHaveLength(1);

    // Les deux valeurs échangées : 31,6 devient une longitude et -7,98 une
    // latitude. Le point désigné tombe dans l'océan Indien, à 4 000 km.
    const inverse = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: { latitude: MARRAKECH.longitude, longitude: MARRAKECH.latitude },
    });
    expect(inverse).toHaveLength(0);
  });

  it('écarte les artisans hors du plafond global, même avec un très grand rayon', async () => {
    // Un artisan en Islande qui annoncerait 200 km de rayon reste à plus de
    // 4 000 km : le plafond de `$geoNear` l'écarte avant tout calcul.
    await fabriques.artisan(essai, {
      email: 'islande@essai.ma',
      latitude: 64.1466,
      longitude: -21.9426,
      rayonKm: 200,
    });

    const trouves = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: MARRAKECH,
    });
    expect(trouves).toHaveLength(0);
  });

  it('filtre sur le métier pendant la recherche, pas après', async () => {
    await fabriques.artisan(essai, {
      email: 'plombier@essai.ma',
      raisonSociale: 'Le Plombier',
      metiers: [Metier.PLOMBERIE],
      rayonKm: 50,
    });
    await fabriques.artisan(essai, {
      email: 'peintre@essai.ma',
      raisonSociale: 'Le Peintre',
      metiers: [Metier.PEINTURE],
      rayonKm: 50,
    });
    await fabriques.artisan(essai, {
      email: 'polyvalent@essai.ma',
      raisonSociale: 'Le Polyvalent',
      metiers: [Metier.PLOMBERIE, Metier.CARRELAGE],
      rayonKm: 50,
    });

    const plombiers = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: MARRAKECH,
    });

    const noms = plombiers.map((a) => a.raisonSociale).sort();
    expect(noms).toEqual(['Le Plombier', 'Le Polyvalent']);
  });

  it('écarte les artisans inactifs et, sur demande, les non vérifiés', async () => {
    const actif = await fabriques.artisan(essai, { email: 'actif@essai.ma', rayonKm: 50 });
    const inactif = await fabriques.artisan(essai, { email: 'inactif@essai.ma', rayonKm: 50 });
    await essai.modeles.artisans.updateOne({ _id: inactif.profil._id }, { $set: { actif: false } });
    await essai.modeles.artisans.updateOne({ _id: actif.profil._id }, { $set: { verifie: true } });

    const nonVerifie = await fabriques.artisan(essai, { email: 'nonverif@essai.ma', rayonKm: 50 });

    const tous = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: MARRAKECH,
    });
    expect(tous.map((a) => String(a._id)).sort()).toEqual(
      [String(actif.profil._id), String(nonVerifie.profil._id)].sort(),
    );

    const verifiesSeulement = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: MARRAKECH,
      verifieSeulement: true,
    });
    expect(verifiesSeulement).toHaveLength(1);
    expect(String(verifiesSeulement[0]._id)).toBe(String(actif.profil._id));
  });

  it('trie par note décroissante, puis par distance', async () => {
    const proche = await fabriques.artisan(essai, {
      email: 'proche-mauvais@essai.ma',
      raisonSociale: 'Proche mais mal noté',
      rayonKm: 50,
    });
    const loin = await fabriques.artisan(essai, {
      email: 'loin-bon@essai.ma',
      raisonSociale: 'Plus loin mais bien noté',
      latitude: TAHANNAOUT.latitude,
      longitude: TAHANNAOUT.longitude,
      rayonKm: 50,
    });

    await essai.modeles.artisans.updateOne(
      { _id: proche.profil._id },
      { $set: { noteMoyenne: 2.5, nombreAvis: 4 } },
    );
    await essai.modeles.artisans.updateOne(
      { _id: loin.profil._id },
      { $set: { noteMoyenne: 4.8, nombreAvis: 12 } },
    );

    const trouves = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: MARRAKECH,
    });

    expect(trouves.map((a) => a.raisonSociale)).toEqual([
      'Plus loin mais bien noté',
      'Proche mais mal noté',
    ]);
  });

  /**
   * L'index 2dsphere est indispensable, et son absence ne se dégrade pas.
   *
   * On le supprime, et `$geoNear` échoue — il ne se rabat pas sur un balayage
   * complet comme le ferait un index ordinaire. C'est une bonne nouvelle :
   * l'erreur est explicite au lieu d'être une lenteur inexpliquée. Le test
   * repose l'index ensuite, pour ne pas perturber les suivants.
   */
  it("échoue explicitement si l'index 2dsphere manque", async () => {
    await fabriques.artisan(essai, { email: 'index@essai.ma', rayonKm: 50 });

    await essai.modeles.artisans.collection.dropIndex('position_2dsphere');

    await expect(
      essai.services.artisans.rechercher({ metier: Metier.PLOMBERIE, position: MARRAKECH }),
    ).rejects.toThrow(/\$geoNear/);

    await essai.modeles.artisans.syncIndexes();

    const apres = await essai.services.artisans.rechercher({
      metier: Metier.PLOMBERIE,
      position: MARRAKECH,
    });
    expect(apres).toHaveLength(1);
  });

  /**
   * Le sens inverse de la question : les chantiers dans MON rayon.
   *
   * Ici le rayon est une constante — celle de l'artisan qui regarde — donc
   * `maxDistance` suffit et `$expr` est inutile. C'est le même index qui sert
   * aux deux sens.
   */
  it('montre à un artisan les besoins de son rayon, et pas les autres', async () => {
    const client = await fabriques.client(essai);

    // Un besoin à Marrakech, un à Casablanca (240 km).
    await fabriques.besoin(essai, client._id);
    await essai.services.besoins.publier(
      {
        metier: Metier.PLOMBERIE,
        titre: 'Chauffe-eau à remplacer',
        description: 'Le chauffe-eau ne monte plus en température depuis une semaine.',
        adresse: 'Casablanca',
        latitude: CASABLANCA.latitude,
        longitude: CASABLANCA.longitude,
      },
      client._id,
    );

    const local = await essai.services.besoins.ouvertsPourArtisan(
      [Metier.PLOMBERIE],
      MARRAKECH,
      50,
    );
    expect(local).toHaveLength(1);
    expect(local[0].adresse).toContain('Marrakech');

    const national = await essai.services.besoins.ouvertsPourArtisan(
      [Metier.PLOMBERIE],
      MARRAKECH,
      300,
    );
    expect(national).toHaveLength(2);
  });
});
