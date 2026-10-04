import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  ApplicationDEssai,
  compterCommandes,
  creerApplicationDEssai,
  MARRAKECH,
} from './base-d-essai.js';

/**
 * ══ Qui voit quoi ══════════════════════════════════════════════════════════
 *
 * Ce fichier existe à cause d'un défaut trouvé dans ce projet, et non d'une
 * précaution théorique.
 *
 * `besoin(id)` était marqué `@Public()`. Il rendait un `Besoin` dont le champ
 * `adresse` était exposé et dont `demandeur` résolvait un `Compte` entier —
 * e-mail et téléphone compris. N'importe qui, sans jeton, pouvait donc lire
 * les coordonnées d'un client en connaissant un identifiant. Le commentaire
 * de `besoinsPourMoi`, dans le même fichier, promettait pourtant l'inverse.
 *
 * Deux corrections ont été faites, et la seconde est la vraie :
 *   • la lecture exige un compte — nécessaire, mais très insuffisant : un
 *     compte se crée en dix secondes, et aurait suffi à moissonner les
 *     coordonnées de tous les clients ;
 *   • l'adresse est RECOPIÉE sur la réservation à l'acceptation du devis.
 *     L'artisan retenu l'a parce qu'elle est chez lui ; les autres ne l'ont
 *     pas parce qu'elle n'y est pas. Il n'y a donc aucun contrôle à oublier
 *     d'écrire : la règle est une conséquence de l'emplacement de la donnée.
 *
 * Les tests ci-dessous vérifient les deux sens de chaque règle — ce qui est
 * refusé, ET ce qui doit rester accessible. Un test qui ne vérifie que le
 * refus laisse passer une correction trop large, qui casse le parcours.
 */
describe('Qui voit les coordonnées et l’adresse', () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('confidentialite', { http: true });
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  const appeler = async (query: string, jeton?: string) => {
    const req = request(essai.app.getHttpServer()).post('/graphql');
    if (jeton) req.set('Authorization', `Bearer ${jeton}`);
    const reponse = await req.send({ query });
    return reponse.body as {
      data?: Record<string, never>;
      errors?: { message: string; code?: string }[];
    };
  };

  /** Monte un chantier publié par Fatima, et deux artisans distincts. */
  const scene = async () => {
    const clientSession = await essai.services.comptes.inscrireClient({
      email: 'fatima@essai.ma',
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Fatima Benjelloun',
      telephone: '+212 6 11 22 33 44',
    });

    const retenuSession = await essai.services.comptes.inscrireArtisan({
      email: 'retenu@essai.ma',
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Karim Ouazzani',
      raisonSociale: 'Plomberie Ouazzani',
      metiers: ['PLOMBERIE'] as never,
      ville: 'Marrakech',
      latitude: MARRAKECH.latitude,
      longitude: MARRAKECH.longitude,
      rayonKm: 40,
    });

    const curieuxSession = await essai.services.comptes.inscrireArtisan({
      email: 'curieux@essai.ma',
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Autre Artisan',
      raisonSociale: 'Plomberie Concurrente',
      metiers: ['PLOMBERIE'] as never,
      ville: 'Marrakech',
      latitude: MARRAKECH.latitude,
      longitude: MARRAKECH.longitude,
      rayonKm: 40,
    });

    const autreClientSession = await essai.services.comptes.inscrireClient({
      email: 'tiers@essai.ma',
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Omar Sefrioui',
    });

    const profilRetenu = (await essai.services.comptes.artisanDuCompte(
      retenuSession.compte._id,
    ))!;
    const profilCurieux = (await essai.services.comptes.artisanDuCompte(
      curieuxSession.compte._id,
    ))!;

    const besoin = await essai.services.besoins.publier(
      {
        metier: 'PLOMBERIE' as never,
        titre: 'Chauffe-eau à remplacer',
        description: "Le chauffe-eau ne monte plus en température depuis une semaine.",
        adresse: '12 rue Tarik Ibn Ziad, Guéliz, Marrakech',
        latitude: MARRAKECH.latitude,
        longitude: MARRAKECH.longitude,
        budgetMaxCentimes: 450_000,
      },
      clientSession.compte._id,
    );

    return {
      besoin,
      jetonClient: clientSession.jeton,
      jetonRetenu: retenuSession.jeton,
      jetonCurieux: curieuxSession.jeton,
      jetonTiers: autreClientSession.jeton,
      profilRetenu,
      profilCurieux,
      clientId: clientSession.compte._id,
    };
  };

  const CHAMPS = 'adresse nomDemandeur titre demandeur { nom email telephone }';

  it("refuse la lecture d'un besoin sans compte", async () => {
    const s = await scene();

    const reponse = await appeler(`query { besoin(id: "${s.besoin._id}") { ${CHAMPS} } }`);

    expect(reponse.errors?.[0].message).toMatch(/Connexion requise/);
    expect(reponse.data?.besoin).toBeFalsy();
  });

  it('rend au propriétaire son adresse et ses propres coordonnées', async () => {
    const s = await scene();

    const reponse = await appeler(
      `query { besoin(id: "${s.besoin._id}") { ${CHAMPS} } }`,
      s.jetonClient,
    );

    expect(reponse.errors).toBeUndefined();
    const besoin = reponse.data!.besoin as never as {
      adresse: string | null;
      nomDemandeur: string;
      demandeur: { email: string; telephone: string } | null;
    };

    expect(besoin.adresse).toBe('12 rue Tarik Ibn Ziad, Guéliz, Marrakech');
    expect(besoin.demandeur?.email).toBe('fatima@essai.ma');
    expect(besoin.demandeur?.telephone).toBe('+212 6 11 22 33 44');
  });

  /**
   * ══ LE CŒUR DU SUJET ══════════════════════════════════════════════════════
   *
   * Un artisan a tout ce qu'il faut pour chiffrer — le titre, la description,
   * le métier, le budget, la distance — et rien pour contourner la place de
   * marché. Pas d'adresse, pas d'e-mail, pas de téléphone.
   */
  it("ne donne à un artisan ni l'adresse ni les coordonnées, mais un nom d'usage", async () => {
    const s = await scene();

    for (const [qui, jeton] of [
      ['artisan non retenu', s.jetonCurieux],
      ['autre client', s.jetonTiers],
    ] as const) {
      const reponse = await appeler(
        `query { besoin(id: "${s.besoin._id}") { ${CHAMPS} } }`,
        jeton,
      );

      expect(reponse.errors, qui).toBeUndefined();
      const besoin = reponse.data!.besoin as never as {
        adresse: string | null;
        nomDemandeur: string;
        titre: string;
        demandeur: unknown;
      };

      // Ce qui est refusé.
      expect(besoin.adresse, qui).toBeNull();
      expect(besoin.demandeur, qui).toBeNull();

      // Ce qui reste accessible — sinon la correction aurait cassé le parcours.
      expect(besoin.titre, qui).toBe('Chauffe-eau à remplacer');
      expect(besoin.nomDemandeur, qui).toBe('Fatima B.');
    }
  });

  /**
   * ══ LA CONCURRENCE ENTRE ARTISANS ═════════════════════════════════════════
   *
   * `Besoin.devisRecus` n'avait aucun contrôle : il rendait tous les devis à
   * quiconque possédait l'identifiant du besoin. Un artisan lisait donc les
   * prix de ses concurrents avant de déposer le sien.
   *
   * Ce n'est pas une fuite de données personnelles, c'est la destruction de
   * la mise en concurrence — donc du produit. Trouvé par une revue
   * automatisée, pas par une relecture.
   */
  it("ne montre à un artisan que SON devis, et au client tous les devis", async () => {
    const s = await scene();

    await essai.services.devis.proposer(
      { besoin: s.besoin._id, montantCentimes: 380_000, delaiJours: 3, message: 'Offre du premier.' },
      s.profilRetenu._id,
    );
    await essai.services.devis.proposer(
      { besoin: s.besoin._id, montantCentimes: 290_000, delaiJours: 5, message: 'Offre du second.' },
      s.profilCurieux._id,
    );

    const lire = async (jeton?: string) => {
      const r = await appeler(
        `query { besoin(id: "${s.besoin._id}") { devisRecus { montantCentimes } } }`,
        jeton,
      );
      const b = r.data?.besoin as never as { devisRecus: { montantCentimes: number }[] } | undefined;
      return (b?.devisRecus ?? []).map((d) => d.montantCentimes).sort((x, y) => x - y);
    };

    // Le client compare : c'est la fonction même de son écran de décision.
    expect(await lire(s.jetonClient)).toEqual([290_000, 380_000]);

    // Chaque artisan ne voit que le sien — jamais le montant de l'autre.
    expect(await lire(s.jetonRetenu)).toEqual([380_000]);
    expect(await lire(s.jetonCurieux)).toEqual([290_000]);

    // Un client tiers ne voit rien du tout.
    expect(await lire(s.jetonTiers)).toEqual([]);
  });

  /**
   * ══ LES AVIS SONT PUBLICS, LEURS AUTEURS NE LE SONT PAS ═══════════════════
   *
   * `avisDArtisan` est volontairement public — une fiche d'artisan doit
   * s'ouvrir sans compte. Mais le champ `auteur` y résolvait un `Compte`
   * entier : n'importe qui pouvait moissonner l'e-mail et le téléphone de
   * tous les clients ayant laissé un avis, sans même s'inscrire.
   *
   * C'est la MÊME fuite que celle corrigée sur `Besoin.demandeur`, restée
   * ouverte sur `Avis`. D'où la réduction du nom dans un module partagé :
   * une règle de confidentialité recopiée finit par différer d'un endroit à
   * l'autre, et c'est exactement ce qui s'était produit.
   */
  it("n'expose aucune coordonnée sur un avis public", async () => {
    const s = await scene();
    const devis = await essai.services.devis.proposer(
      { besoin: s.besoin._id, montantCentimes: 200_000, delaiJours: 2, message: 'Intervention.' },
      s.profilRetenu._id,
    );
    const reservation = await essai.services.devis.accepter(devis._id, s.clientId, {
      debut: new Date('2026-10-12T09:00:00Z'),
      fin: new Date('2026-10-12T11:00:00Z'),
    });
    await essai.services.reservations.enregistrerPaiement(reservation._id, 'pi_avis');
    await essai.services.reservations.terminer(reservation._id, s.profilRetenu._id);
    await essai.services.avis.deposer(
      { reservation: reservation._id, note: 5, commentaire: 'Ponctuel et soigneux.' },
      s.clientId,
    );

    // Sans aucun jeton : la fiche s'ouvre, et le nom est réduit.
    const publique = await appeler(
      `query { avisDArtisan(artisan: "${s.profilRetenu._id}") { note commentaire nomAuteur } }`,
    );
    expect(publique.errors).toBeUndefined();
    const avis = publique.data!.avisDArtisan as never as { nomAuteur: string }[];
    expect(avis).toHaveLength(1);
    expect(avis[0].nomAuteur).toBe('Fatima B.');

    // Et le compte entier n'existe plus dans le schéma : demander `auteur`
    // est une erreur de requête, pas un champ vide. C'est la bonne barrière —
    // elle ne dépend d'aucun filtrage qu'un résolveur pourrait oublier.
    const tentative = await appeler(
      `query { avisDArtisan(artisan: "${s.profilRetenu._id}") { auteur { email telephone } } }`,
    );
    expect(JSON.stringify(tentative.errors)).toMatch(/auteur/);
  });

  /**
   * Le nom d'usage est réduit CÔTÉ SERVEUR.
   *
   * Une troncature faite à l'affichage laisserait le patronyme entier
   * traverser le réseau, où il se lit dans n'importe quel outil de
   * développement. Ce test vérifie donc la valeur transmise, pas l'écran.
   */
  it("réduit le patronyme au prénom et à l'initiale, et supporte un nom simple", async () => {
    const s = await scene();

    const lu = async (jeton: string) => {
      const r = await appeler(
        `query { besoin(id: "${s.besoin._id}") { nomDemandeur } }`,
        jeton,
      );
      return (r.data!.besoin as never as { nomDemandeur: string }).nomDemandeur;
    };

    expect(await lu(s.jetonCurieux)).toBe('Fatima B.');

    // Un nom en un seul mot n'a pas d'initiale à réduire.
    await essai.modeles.comptes.updateOne({ _id: s.clientId }, { $set: { nom: 'Fatima' } });
    expect(await lu(s.jetonCurieux)).toBe('Fatima');

    // Trois mots : c'est le DERNIER qui fournit l'initiale.
    await essai.modeles.comptes.updateOne(
      { _id: s.clientId },
      { $set: { nom: 'Fatima Zahra Benjelloun' } },
    );
    expect(await lu(s.jetonCurieux)).toBe('Fatima B.');
  });

  /**
   * ══ L'ADRESSE ARRIVE AVEC LA RÉSERVATION ══════════════════════════════════
   *
   * L'artisan retenu ne la lit pas sur le besoin — elle y est toujours
   * refusée. Il la lit sur SA réservation, où elle a été recopiée à
   * l'acceptation, en même temps que le montant.
   */
  it("livre l'adresse et les coordonnées à l'artisan retenu, sur sa réservation", async () => {
    const s = await scene();

    const devis = await essai.services.devis.proposer(
      {
        besoin: s.besoin._id,
        montantCentimes: 380_000,
        delaiJours: 3,
        message: 'Chauffe-eau 80 L, pose et évacuation comprises.',
      },
      s.profilRetenu._id,
    );
    await essai.services.devis.accepter(devis._id, s.clientId, {
      debut: new Date('2026-10-08T09:00:00Z'),
      fin: new Date('2026-10-08T13:00:00Z'),
    });

    // Sur le BESOIN, l'adresse lui reste refusée : rien n'a changé là.
    const vuBesoin = await appeler(
      `query { besoin(id: "${s.besoin._id}") { adresse } }`,
      s.jetonRetenu,
    );
    expect((vuBesoin.data!.besoin as never as { adresse: string | null }).adresse).toBeNull();

    // Sur SON PLANNING, il l'a — ainsi que le téléphone du client.
    const planning = await appeler(
      `query {
        monPlanning {
          adresseIntervention
          montantCentimes
          demandeur { nom telephone }
          chantier { titre }
        }
      }`,
      s.jetonRetenu,
    );

    expect(planning.errors).toBeUndefined();
    const lignes = planning.data!.monPlanning as never as {
      adresseIntervention: string;
      montantCentimes: number;
      demandeur: { nom: string; telephone: string };
      chantier: { titre: string };
    }[];

    expect(lignes).toHaveLength(1);
    expect(lignes[0].adresseIntervention).toBe('12 rue Tarik Ibn Ziad, Guéliz, Marrakech');
    expect(lignes[0].demandeur.telephone).toBe('+212 6 11 22 33 44');
    expect(lignes[0].chantier.titre).toBe('Chauffe-eau à remplacer');

    // Et le concurrent n'a toujours rien : son planning est vide.
    const planningCurieux = await appeler(`query { monPlanning { adresseIntervention } }`, s.jetonCurieux);
    expect(planningCurieux.data!.monPlanning).toEqual([]);
  });

  /**
   * L'adresse recopiée est FIGÉE, comme le montant.
   *
   * Modifier le besoin après coup ne doit pas déplacer un chantier déjà
   * convenu — l'artisan se présenterait ailleurs que là où il est attendu.
   */
  it("fige l'adresse : modifier le besoin ne déplace pas la réservation", async () => {
    const s = await scene();
    const devis = await essai.services.devis.proposer(
      { besoin: s.besoin._id, montantCentimes: 100_000, delaiJours: 1, message: 'Intervention.' },
      s.profilRetenu._id,
    );
    const reservation = await essai.services.devis.accepter(devis._id, s.clientId, {
      debut: new Date('2026-10-08T09:00:00Z'),
      fin: new Date('2026-10-08T11:00:00Z'),
    });

    await essai.modeles.besoins.updateOne(
      { _id: s.besoin._id },
      { $set: { adresse: 'Une tout autre adresse' } },
    );

    const apres = await essai.modeles.reservations.findById(reservation._id);
    expect(apres!.adresseIntervention).toBe('12 rue Tarik Ibn Ziad, Guéliz, Marrakech');
  });
});

/**
 * ══ Les lectures que les pages réclamaient ═════════════════════════════════
 *
 * Trois écrans étaient impossibles à écrire correctement : la fiche d'un
 * artisan, la liste des réservations d'un client, et les devis envoyés par un
 * artisan. Non par manque de données, mais par manque de CHEMINS vers elles.
 */
describe('Les lectures ajoutées pour les écrans', () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('lectures-ecrans', { http: true });
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  const appeler = async (query: string, jeton?: string) => {
    const req = request(essai.app.getHttpServer()).post('/graphql');
    if (jeton) req.set('Authorization', `Bearer ${jeton}`);
    const r = await req.send({ query });
    return r.body as { data?: Record<string, never>; errors?: { message: string }[] };
  };

  const artisanInscrit = async (email: string) => {
    const session = await essai.services.comptes.inscrireArtisan({
      email,
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Karim Ouazzani',
      raisonSociale: 'Plomberie Ouazzani',
      metiers: ['PLOMBERIE'] as never,
      ville: 'Marrakech',
      latitude: MARRAKECH.latitude,
      longitude: MARRAKECH.longitude,
      rayonKm: 40,
    });
    const profil = (await essai.services.comptes.artisanDuCompte(session.compte._id))!;
    return { session, profil };
  };

  /** La fiche d'un artisan est PUBLIQUE : un lien partagé doit s'ouvrir. */
  it('ouvre la fiche d’un artisan sans compte', async () => {
    const { profil } = await artisanInscrit('fiche@essai.ma');

    const reponse = await appeler(`query {
      artisan(id: "${profil._id}") { raisonSociale ville metiers rayonKm noteMoyenne verifie actif }
    }`);

    expect(reponse.errors).toBeUndefined();
    expect((reponse.data!.artisan as never as { raisonSociale: string }).raisonSociale).toBe(
      'Plomberie Ouazzani',
    );
  });

  it('reste lisible pour un artisan désactivé, en le disant', async () => {
    const { profil } = await artisanInscrit('inactif@essai.ma');
    await essai.modeles.artisans.updateOne({ _id: profil._id }, { $set: { actif: false } });

    const reponse = await appeler(`query { artisan(id: "${profil._id}") { actif raisonSociale } }`);

    // Un lien partagé ne doit pas finir en page introuvable : `actif: false`
    // veut dire « n'apparaît plus dans les résultats », pas « n'a jamais
    // existé ». L'écran dira qu'il ne prend pas de nouveaux chantiers.
    expect(reponse.errors).toBeUndefined();
    expect((reponse.data!.artisan as never as { actif: boolean }).actif).toBe(false);
  });

  it('répond « introuvable » pour un identifiant inconnu, et « invalide » pour un identifiant mal formé', async () => {
    const inconnu = await appeler(`query { artisan(id: "000000000000000000000000") { ville } }`);
    expect(inconnu.errors?.[0].message).toMatch(/n'existe pas/);

    const malForme = await appeler(`query { artisan(id: "pas-un-identifiant") { ville } }`);
    expect(malForme.errors?.[0].message).toMatch(/identifiant valide/);
  });

  it('montre à un artisan ses devis envoyés, avec le chantier de chacun', async () => {
    const { session, profil } = await artisanInscrit('devis@essai.ma');
    const client = await essai.services.comptes.inscrireClient({
      email: 'cliente@essai.ma',
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Leïla Amrani',
    });

    for (const titre of ['Fuite sous le lavabo', 'Chauffe-eau à remplacer']) {
      const besoin = await essai.services.besoins.publier(
        {
          metier: 'PLOMBERIE' as never,
          titre,
          description: 'Description suffisamment longue pour passer la validation.',
          adresse: 'Marrakech',
          latitude: MARRAKECH.latitude,
          longitude: MARRAKECH.longitude,
        },
        client.compte._id,
      );
      await essai.services.devis.proposer(
        { besoin: besoin._id, montantCentimes: 120_000, delaiJours: 2, message: 'Intervention.' },
        profil._id,
      );
    }

    const reponse = await appeler(
      `query { mesDevis { montantCentimes statut chantier { titre } } }`,
      session.jeton,
    );

    expect(reponse.errors).toBeUndefined();
    const devis = reponse.data!.mesDevis as never as { chantier: { titre: string } }[];
    expect(devis).toHaveLength(2);
    // Sans `chantier`, cette liste serait deux montants identiques sans objet.
    expect(devis.map((d) => d.chantier.titre).sort()).toEqual([
      'Chauffe-eau à remplacer',
      'Fuite sous le lavabo',
    ]);
  });

  it("expose à l'artisan la distance du chantier, que l'agrégation calculait déjà", async () => {
    const { session } = await artisanInscrit('distance@essai.ma');
    const client = await essai.services.comptes.inscrireClient({
      email: 'loin@essai.ma',
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Omar Sefrioui',
    });

    // Tahannaout, à une trentaine de kilomètres de Marrakech.
    await essai.services.besoins.publier(
      {
        metier: 'PLOMBERIE' as never,
        titre: 'Robinetterie à revoir',
        description: 'Description suffisamment longue pour passer la validation.',
        adresse: 'Tahannaout',
        latitude: 31.3556,
        longitude: -7.9511,
      },
      client.compte._id,
    );

    const reponse = await appeler(
      `query { besoinsPourMoi { titre distanceMetres } }`,
      session.jeton,
    );

    expect(reponse.errors).toBeUndefined();
    const lignes = reponse.data!.besoinsPourMoi as never as { distanceMetres: number }[];
    expect(lignes).toHaveLength(1);
    // Vérifié contre la géographie réelle, pas contre une valeur recopiée.
    expect(lignes[0].distanceMetres).toBeGreaterThan(25_000);
    expect(lignes[0].distanceMetres).toBeLessThan(35_000);
  });

  /**
   * Les champs ajoutés ne recréent pas le N+1 que le projet s'attache à
   * éviter. Vingt réservations avec leur chantier et leur client : trois
   * requêtes, pas quarante-et-une.
   */
  it('groupe les chantiers et les clients des réservations', async () => {
    const { profil } = await artisanInscrit('nplusun@essai.ma');

    const client = await essai.services.comptes.inscrireClient({
      email: 'volume@essai.ma',
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Omar Sefrioui',
    });

    for (let i = 0; i < 20; i += 1) {
      const besoin = await essai.services.besoins.publier(
        {
          metier: 'PLOMBERIE' as never,
          titre: `Chantier numéro ${i}`,
          description: 'Description suffisamment longue pour passer la validation.',
          adresse: `${i} rue de l'Essai, Marrakech`,
          latitude: MARRAKECH.latitude,
          longitude: MARRAKECH.longitude,
        },
        client.compte._id,
      );
      const devis = await essai.services.devis.proposer(
        { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 1, message: 'Intervention.' },
        profil._id,
      );
      await essai.services.devis.accepter(devis._id, client.compte._id, {
        debut: new Date('2026-10-09T09:00:00Z'),
        fin: new Date('2026-10-09T11:00:00Z'),
      });
    }

    const session = await essai.services.comptes.connecter(
      'volume@essai.ma',
      'mot-de-passe-assez-long',
    );

    const { resultat, commandes } = await compterCommandes(essai.connexion, async () =>
      appeler(
        `query { mesReservations { montantCentimes chantier { titre } demandeur { nom } } }`,
        session.jeton,
      ),
    );

    expect(resultat.errors).toBeUndefined();
    expect(resultat.data!.mesReservations).toHaveLength(20);

    // 1 lecture des réservations + 1 lot de chantiers + 1 lot de comptes.
    // Sans chargeurs : 1 + 20 + 20 = 41.
    expect(commandes).toHaveLength(3);
  });
});
