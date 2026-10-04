import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ApplicationDEssai, creerApplicationDEssai, MARRAKECH } from './base-d-essai.js';

/**
 * ══ Le parcours complet, par HTTP ══════════════════════════════════════════
 *
 * Les autres fichiers appellent les services directement : c'est plus direct
 * pour éprouver une règle. Celui-ci passe par l'API GraphQL comme un vrai
 * client — avec les jetons, les rôles, la validation des entrées et le format
 * des erreurs.
 *
 * Il répond à une question que les tests de service ne posent pas : le
 * domaine est-il réellement ATTEIGNABLE, et les garanties tiennent-elles
 * encore une fois traversées les couches de transport ?
 */
describe('Le parcours client-artisan de bout en bout', () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('parcours-graphql', { http: true });
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

  it('va du besoin publié à l’avis déposé', async () => {
    // ── 1. Un client s'inscrit ────────────────────────────────────────────
    const inscriptionClient = await appeler(`
      mutation {
        inscrireClient(entree: {
          email: "fatima@essai.ma"
          motDePasse: "mot-de-passe-assez-long"
          nom: "Fatima B."
        }) { jeton compte { email role } }
      }
    `);
    expect(inscriptionClient.errors).toBeUndefined();
    const jetonClient = (inscriptionClient.data!.inscrireClient as never as { jeton: string }).jeton;

    // ── 2. Un artisan s'inscrit — compte et profil en une transaction ─────
    const inscriptionArtisan = await appeler(`
      mutation {
        inscrireArtisan(entree: {
          email: "karim@essai.ma"
          motDePasse: "mot-de-passe-assez-long"
          nom: "Karim O."
          raisonSociale: "Plomberie Karim"
          metiers: [PLOMBERIE]
          ville: "Marrakech"
          latitude: ${MARRAKECH.latitude}
          longitude: ${MARRAKECH.longitude}
          rayonKm: 30
        }) { jeton compte { role } }
      }
    `);
    expect(inscriptionArtisan.errors).toBeUndefined();
    const jetonArtisan = (
      inscriptionArtisan.data!.inscrireArtisan as never as { jeton: string }
    ).jeton;

    // ── 3. Le client publie un besoin ─────────────────────────────────────
    const publication = await appeler(
      `
      mutation {
        publierBesoin(entree: {
          metier: PLOMBERIE
          titre: "Fuite sous le lavabo"
          description: "Le siphon goutte depuis trois jours, le meuble gonfle."
          adresse: "12 rue Essai, Marrakech"
          latitude: ${MARRAKECH.latitude}
          longitude: ${MARRAKECH.longitude}
          budgetMaxCentimes: 80000
        }) { _id statut titre }
      }
    `,
      jetonClient,
    );
    expect(publication.errors).toBeUndefined();
    const besoin = publication.data!.publierBesoin as never as { _id: string; statut: string };
    expect(besoin.statut).toBe('OUVERT');

    // ── 4. L'artisan voit le chantier dans son rayon ──────────────────────
    const vuArtisan = await appeler(
      `query { besoinsPourMoi { _id titre demandeur { nom } } }`,
      jetonArtisan,
    );
    expect(vuArtisan.errors).toBeUndefined();
    const chantiers = vuArtisan.data!.besoinsPourMoi as never as { _id: string }[];
    expect(chantiers).toHaveLength(1);
    expect(chantiers[0]._id).toBe(besoin._id);

    // ── 5. L'artisan propose un devis ─────────────────────────────────────
    const proposition = await appeler(
      `
      mutation {
        proposerDevis(entree: {
          besoin: "${besoin._id}"
          montantCentimes: 45000
          delaiJours: 2
          message: "Remplacement du siphon et du joint, pièces comprises."
        }) { _id statut montantCentimes auteur { raisonSociale } }
      }
    `,
      jetonArtisan,
    );
    expect(proposition.errors).toBeUndefined();
    const devis = proposition.data!.proposerDevis as never as {
      _id: string;
      statut: string;
      auteur: { raisonSociale: string };
    };
    expect(devis.statut).toBe('ENVOYE');
    // Le champ `auteur` passe par le chargeur groupé : il doit être résolu.
    expect(devis.auteur.raisonSociale).toBe('Plomberie Karim');

    // ── 6. Le client accepte ──────────────────────────────────────────────
    const acceptation = await appeler(
      `
      mutation {
        accepterDevis(
          id: "${devis._id}"
          creneau: { debut: "2026-10-20T09:00:00Z", fin: "2026-10-20T11:00:00Z" }
        ) { _id statut montantCentimes commissionCentimes avisDeposeA }
      }
    `,
      jetonClient,
    );
    expect(acceptation.errors).toBeUndefined();
    const reservation = acceptation.data!.accepterDevis as never as {
      _id: string;
      statut: string;
      montantCentimes: number;
      commissionCentimes: number;
      avisDeposeA: string | null;
    };
    expect(reservation.statut).toBe('A_PAYER');
    expect(reservation.montantCentimes).toBe(45_000);
    expect(reservation.commissionCentimes).toBe(3_600); // 8 % de 45 000
    expect(reservation.avisDeposeA).toBeNull();

    // ── 7. Le paiement ────────────────────────────────────────────────────
    const paiement = await appeler(
      `
      mutation {
        payerReservation(id: "${reservation._id}", referencePaiement: "pi_essai") {
          statut
        }
      }
    `,
      jetonClient,
    );
    expect(paiement.errors).toBeUndefined();
    expect((paiement.data!.payerReservation as never as { statut: string }).statut).toBe('PAYEE');

    // ── 8. L'artisan termine ──────────────────────────────────────────────
    const fin = await appeler(
      `mutation { terminerPrestation(id: "${reservation._id}") { statut } }`,
      jetonArtisan,
    );
    expect(fin.errors).toBeUndefined();
    expect((fin.data!.terminerPrestation as never as { statut: string }).statut).toBe('TERMINEE');

    // ── 9. L'avis, enfin possible ─────────────────────────────────────────
    const avis = await appeler(
      `
      mutation {
        deposerAvis(entree: {
          reservation: "${reservation._id}"
          note: 5
          commentaire: "Ponctuel, travail propre, a nettoyé derrière lui."
        }) { note nomAuteur }
      }
    `,
      jetonClient,
    );
    expect(avis.errors).toBeUndefined();
    expect((avis.data!.deposerAvis as never as { note: number }).note).toBe(5);

    // ── 10. La note de l'artisan est à jour, et publique ──────────────────
    const recherche = await appeler(`
      query {
        rechercherArtisans(entree: {
          metier: PLOMBERIE
          latitude: ${MARRAKECH.latitude}
          longitude: ${MARRAKECH.longitude}
        }) { raisonSociale noteMoyenne nombreAvis distanceMetres }
      }
    `);
    expect(recherche.errors).toBeUndefined();
    const trouves = recherche.data!.rechercherArtisans as never as {
      noteMoyenne: number;
      nombreAvis: number;
    }[];
    expect(trouves).toHaveLength(1);
    expect(trouves[0].noteMoyenne).toBe(5);
    expect(trouves[0].nombreAvis).toBe(1);
  });

  it('laisse la recherche accessible sans compte, et le reste non', async () => {
    const publique = await appeler(`
      query {
        rechercherArtisans(entree: {
          metier: PLOMBERIE
          latitude: ${MARRAKECH.latitude}
          longitude: ${MARRAKECH.longitude}
        }) { raisonSociale }
      }
    `);
    expect(publique.errors).toBeUndefined();
    expect(publique.data!.rechercherArtisans).toEqual([]);

    const privee = await appeler(`query { mesBesoins { _id } }`);
    expect(privee.errors?.[0].message).toMatch(/Connexion requise/);
  });

  it('refuse à un artisan les opérations réservées aux clients', async () => {
    const inscription = await appeler(`
      mutation {
        inscrireArtisan(entree: {
          email: "roles@essai.ma"
          motDePasse: "mot-de-passe-assez-long"
          nom: "Artisan Rôles"
          raisonSociale: "Rôles SARL"
          metiers: [ELECTRICITE]
          ville: "Marrakech"
          latitude: ${MARRAKECH.latitude}
          longitude: ${MARRAKECH.longitude}
          rayonKm: 20
        }) { jeton }
      }
    `);
    const jeton = (inscription.data!.inscrireArtisan as never as { jeton: string }).jeton;

    const refus = await appeler(
      `
      mutation {
        publierBesoin(entree: {
          metier: ELECTRICITE
          titre: "Un besoin publié par un artisan"
          description: "Cette opération est réservée aux comptes clients."
          adresse: "Marrakech"
          latitude: ${MARRAKECH.latitude}
          longitude: ${MARRAKECH.longitude}
        }) { _id }
      }
    `,
      jeton,
    );

    expect(refus.errors?.[0].message).toMatch(/ne concerne pas votre type de compte/);
  });

  it('ignore un jeton falsifié comme une absence de jeton', async () => {
    const reponse = await appeler(`query { moi { email } }`, 'ceci.nest.pas-un-jeton');
    expect(reponse.errors?.[0].message).toMatch(/Connexion requise/);
  });

  /**
   * La validation des entrées remonte un message utile, pas un code.
   *
   * Un mot de passe trop court doit produire la phrase écrite dans le
   * décorateur — c'est elle que l'interface affichera.
   */
  it('refuse un mot de passe trop court avec un message lisible', async () => {
    const reponse = await appeler(`
      mutation {
        inscrireClient(entree: {
          email: "court@essai.ma"
          motDePasse: "court"
          nom: "Trop Court"
        }) { jeton }
      }
    `);
    expect(reponse.errors).toBeDefined();
    expect(JSON.stringify(reponse.errors)).toMatch(/au moins 12 caractères|Bad Request/);
  });

  /**
   * Un identifiant mal formé est une erreur du client (400), pas une panne du
   * serveur (500).
   *
   * Toute chaîne de douze octets est un ObjectId valide pour le pilote : sans
   * contrôle explicite, `"clients"` serait accepté et la requête répondrait
   * « introuvable » au lieu de « identifiant invalide ». Voir
   * `commun/identifiants.ts`.
   */
  it("traite un identifiant mal formé comme une erreur de requête", async () => {
    const reponse = await appeler(`query { avisDArtisan(artisan: "pas-un-identifiant") { note } }`);
    expect(reponse.errors).toBeDefined();
    expect(reponse.errors![0].code).not.toBe('INTERNAL_SERVER_ERROR');
  });

  /**
   * Le mot de passe n'est exposé par aucun champ — même en le demandant.
   *
   * `empreinteMotDePasse` n'a pas de `@Field`, donc il n'est pas dans le
   * schéma. Le demander est une erreur de schéma GraphQL, détectée avant toute
   * exécution — ce qui est la bonne barrière : elle ne dépend d'aucun filtrage
   * que quelqu'un pourrait oublier dans un résolveur.
   */
  it("n'expose pas l'empreinte du mot de passe dans le schéma", async () => {
    const reponse = await appeler(`query { moi { email empreinteMotDePasse } }`);
    expect(JSON.stringify(reponse.errors)).toMatch(/empreinteMotDePasse/);
  });
});
