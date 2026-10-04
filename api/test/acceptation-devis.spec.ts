import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApplicationDEssai, creerApplicationDEssai, fabriques } from './base-d-essai.js';
import { StatutDevis } from '../src/domaine/devis/devis.schema.js';
import { StatutBesoin } from '../src/domaine/besoins/besoin.schema.js';

/**
 * ══ Accepter un devis ══════════════════════════════════════════════════════
 *
 * Quatre écritures dans trois collections, et une seule décision. Ce fichier
 * vérifie qu'elles sont indivisibles, et qu'un seul devis peut être accepté
 * même sous requêtes simultanées.
 */
describe('Accepter un devis', () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('acceptation-devis');
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  const creneau = {
    debut: new Date('2026-10-15T09:00:00Z'),
    fin: new Date('2026-10-15T12:00:00Z'),
  };

  it('attribue le besoin, refuse les concurrents et crée la réservation', async () => {
    const client = await fabriques.client(essai);
    const besoin = await fabriques.besoin(essai, client._id);

    const a = await fabriques.artisan(essai, { email: 'a@essai.ma' });
    const b = await fabriques.artisan(essai, { email: 'b@essai.ma' });
    const c = await fabriques.artisan(essai, { email: 'c@essai.ma' });

    const devisA = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Devis de A.' },
      a.profil._id,
    );
    await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 40_000, delaiJours: 3, message: 'Devis de B.' },
      b.profil._id,
    );
    await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 60_000, delaiJours: 1, message: 'Devis de C.' },
      c.profil._id,
    );

    const reservation = await essai.services.devis.accepter(devisA._id, client._id, creneau);

    // 1. Le besoin est attribué.
    const besoinApres = await essai.modeles.besoins.findById(besoin._id);
    expect(besoinApres!.statut).toBe(StatutBesoin.ATTRIBUE);

    // 2. Le devis retenu est accepté, les deux autres refusés.
    const tous = await essai.modeles.devis.find().sort({ montantCentimes: 1 });
    const parStatut = tous.reduce<Record<string, number>>((acc, d) => {
      acc[d.statut] = (acc[d.statut] ?? 0) + 1;
      return acc;
    }, {});
    expect(parStatut).toEqual({ [StatutDevis.ACCEPTE]: 1, [StatutDevis.REFUSE]: 2 });

    // 3. La réservation porte le montant du devis, RECOPIÉ.
    expect(reservation.montantCentimes).toBe(50_000);
    expect(String(reservation.artisan)).toBe(String(a.profil._id));

    // 4. La commission est figée au taux du jour : 8 % de 50 000 = 4 000.
    expect(reservation.commissionCentimes).toBe(4_000);
  });

  /**
   * Le montant est recopié, pas référencé.
   *
   * On modifie le devis APRÈS acceptation — ce que l'API n'autorise pas, mais
   * qu'un script de maintenance ou une migration peut faire. La réservation ne
   * doit pas bouger : c'est l'accord qui a été conclu, pas une vue sur le
   * devis courant.
   */
  it("fige le montant : modifier le devis après coup ne change pas la réservation", async () => {
    const client = await fabriques.client(essai);
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);
    const devis = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Devis initial.' },
      profil._id,
    );

    const reservation = await essai.services.devis.accepter(devis._id, client._id, creneau);

    await essai.modeles.devis.updateOne(
      { _id: devis._id },
      { $set: { montantCentimes: 500_000 } },
    );

    const apres = await essai.modeles.reservations.findById(reservation._id);
    expect(apres!.montantCentimes).toBe(50_000);
  });

  /**
   * ══ LA PREUVE DE CONCURRENCE ══════════════════════════════════════════════
   *
   * Deux devis différents, acceptés en même temps sur le même besoin. C'est le
   * scénario d'un client qui ouvre deux onglets, ou qui clique deux fois.
   *
   * La transaction seule ne suffirait pas : elle garantit que chaque
   * acceptation est indivisible, pas qu'une seule a lieu. Ce qui exclut la
   * seconde, c'est que le filtre du besoin exige `statut: OUVERT` — donc la
   * seconde ne trouve rien à modifier et refuse.
   *
   * Résultat attendu : une réservation, un devis accepté, un devis refusé.
   * Jamais deux réservations sur le même besoin, jamais deux artisans qui
   * croient tous les deux avoir gagné le chantier.
   */
  it("ne laisse accepter qu'un seul devis sur deux acceptations simultanées", async () => {
    const client = await fabriques.client(essai);
    const besoin = await fabriques.besoin(essai, client._id);
    const a = await fabriques.artisan(essai, { email: 'concurrent-a@essai.ma' });
    const b = await fabriques.artisan(essai, { email: 'concurrent-b@essai.ma' });

    const devisA = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Devis de A.' },
      a.profil._id,
    );
    const devisB = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 45_000, delaiJours: 3, message: 'Devis de B.' },
      b.profil._id,
    );

    const issues = await Promise.allSettled([
      essai.services.devis.accepter(devisA._id, client._id, creneau),
      essai.services.devis.accepter(devisB._id, client._id, creneau),
    ]);

    expect(issues.filter((i) => i.status === 'fulfilled')).toHaveLength(1);
    expect(issues.filter((i) => i.status === 'rejected')).toHaveLength(1);

    expect(await essai.modeles.reservations.countDocuments()).toBe(1);
    expect(await essai.modeles.devis.countDocuments({ statut: StatutDevis.ACCEPTE })).toBe(1);

    const besoinApres = await essai.modeles.besoins.findById(besoin._id);
    expect(besoinApres!.statut).toBe(StatutBesoin.ATTRIBUE);
  });

  /**
   * L'indivisibilité, prouvée par l'échec de la dernière écriture.
   *
   * On crée à la main une réservation sur le devis AVANT de l'accepter :
   * l'index unique sur `devis` fera échouer l'étape 4. Les trois premières
   * doivent être annulées — sinon le besoin resterait attribué à un devis
   * accepté qui ne donne droit à aucune prestation, et les concurrents
   * resteraient refusés pour rien.
   */
  it('annule tout si la création de la réservation échoue', async () => {
    const client = await fabriques.client(essai);
    const a = await fabriques.artisan(essai, { email: 'annul-a@essai.ma' });
    const b = await fabriques.artisan(essai, { email: 'annul-b@essai.ma' });
    const besoin = await fabriques.besoin(essai, client._id);

    const devisA = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Devis de A.' },
      a.profil._id,
    );
    const devisB = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 45_000, delaiJours: 3, message: 'Devis de B.' },
      b.profil._id,
    );

    // La place est déjà prise dans l'index unique sur `devis`.
    await essai.modeles.reservations.create({
      devis: devisA._id,
      besoin: besoin._id,
      client: client._id,
      artisan: a.profil._id,
      montantCentimes: 50_000,
      commissionCentimes: 4_000,
      creneau,
      // Recopiée, comme le fait le service : une réservation sans adresse
      // n'existe pas, et le schéma le refuse.
      adresseIntervention: besoin.adresse,
    });

    await expect(
      essai.services.devis.accepter(devisA._id, client._id, creneau),
    ).rejects.toThrow();

    // Rien n'a bougé : le besoin est toujours ouvert, les deux devis toujours
    // envoyés. L'état est exactement celui d'avant la tentative.
    const besoinApres = await essai.modeles.besoins.findById(besoin._id);
    expect(besoinApres!.statut).toBe(StatutBesoin.OUVERT);

    const apresA = await essai.modeles.devis.findById(devisA._id);
    const apresB = await essai.modeles.devis.findById(devisB._id);
    expect(apresA!.statut).toBe(StatutDevis.ENVOYE);
    expect(apresB!.statut).toBe(StatutDevis.ENVOYE);

    // Une seule réservation : celle posée à la main. Pas de seconde.
    expect(await essai.modeles.reservations.countDocuments()).toBe(1);
  });

  it("refuse l'acceptation d'un devis par quelqu'un qui n'est pas le client", async () => {
    const client = await fabriques.client(essai);
    const intrus = await fabriques.client(essai, 'intrus@essai.ma');
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);
    const devis = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Devis.' },
      profil._id,
    );

    await expect(
      essai.services.devis.accepter(devis._id, intrus._id, creneau),
    ).rejects.toThrow(/ne vous appartient pas/);

    expect(await essai.modeles.reservations.countDocuments()).toBe(0);
    const apres = await essai.modeles.devis.findById(devis._id);
    expect(apres!.statut).toBe(StatutDevis.ENVOYE);
  });

  /**
   * ══ L'INDEX UNIQUE PARTIEL ════════════════════════════════════════════════
   *
   * Un artisan ne peut avoir qu'un devis vivant par besoin. Mais s'il retire
   * le sien, il doit pouvoir en déposer un autre.
   *
   * C'est exactement ce qu'un index unique ORDINAIRE rendrait impossible : le
   * devis retiré garderait sa place pour toujours. La clause partielle est ce
   * qui fait la différence, et ces deux tests la montrent.
   */
  it('refuse un second devis du même artisan sur le même besoin', async () => {
    const client = await fabriques.client(essai);
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);

    await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Premier devis.' },
      profil._id,
    );

    await expect(
      essai.services.devis.proposer(
        { besoin: besoin._id, montantCentimes: 40_000, delaiJours: 2, message: 'Second devis.' },
        profil._id,
      ),
    ).rejects.toThrow(/déjà un devis en cours/);
  });

  it('autorise un nouveau devis après retrait du précédent', async () => {
    const client = await fabriques.client(essai);
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);

    const premier = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Premier devis.' },
      profil._id,
    );
    await essai.services.devis.retirer(premier._id, profil._id);

    const second = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 40_000, delaiJours: 2, message: 'Devis révisé.' },
      profil._id,
    );

    expect(second.montantCentimes).toBe(40_000);

    // Le retiré n'est pas supprimé : l'historique est conservé, il ne réserve
    // simplement plus la place dans l'index.
    expect(await essai.modeles.devis.countDocuments()).toBe(2);
    expect(await essai.modeles.devis.countDocuments({ statut: StatutDevis.RETIRE })).toBe(1);
  });

  it("refuse un devis sur un besoin qui n'est plus ouvert", async () => {
    const client = await fabriques.client(essai);
    const a = await fabriques.artisan(essai, { email: 'clos-a@essai.ma' });
    const b = await fabriques.artisan(essai, { email: 'clos-b@essai.ma' });
    const besoin = await fabriques.besoin(essai, client._id);

    const devis = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Devis de A.' },
      a.profil._id,
    );
    await essai.services.devis.accepter(devis._id, client._id, creneau);

    await expect(
      essai.services.devis.proposer(
        { besoin: besoin._id, montantCentimes: 30_000, delaiJours: 1, message: 'Trop tard.' },
        b.profil._id,
      ),
    ).rejects.toThrow(/n'accepte plus de devis/);
  });

  /**
   * Annuler rouvre le besoin et libère l'artisan.
   *
   * L'artisan dont le devis était accepté doit pouvoir proposer à nouveau : la
   * place dans l'index partiel se libère en passant son devis à REFUSE. Sans
   * cela, l'annulation le bloquerait définitivement sur ce chantier.
   */
  it('rouvre le besoin à l’annulation de la réservation', async () => {
    const client = await fabriques.client(essai);
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);
    const devis = await essai.services.devis.proposer(
      { besoin: besoin._id, montantCentimes: 50_000, delaiJours: 2, message: 'Devis.' },
      profil._id,
    );
    const reservation = await essai.services.devis.accepter(devis._id, client._id, creneau);

    await essai.services.reservations.annuler(reservation._id, client._id);

    const besoinApres = await essai.modeles.besoins.findById(besoin._id);
    expect(besoinApres!.statut).toBe(StatutBesoin.OUVERT);
  });
});
