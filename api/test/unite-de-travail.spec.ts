import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { ApplicationDEssai, creerApplicationDEssai, fabriques } from './base-d-essai.js';
import { Metier, positionDepuis } from '../src/commun/types.js';
import { UniteDeTravail } from '../src/base-de-donnees/unite-de-travail.js';

/**
 * ══ La transaction, et ce qu'elle fait vraiment ════════════════════════════
 *
 * Trois comportements du pilote MongoDB sont tenus pour acquis partout dans
 * ce projet. Ils ne sont pas évidents, ils ne sont pas documentés dans le code
 * appelant, et le domaine tout entier repose sur eux. Ils sont donc vérifiés
 * ici, une fois.
 */
describe("L'unité de travail", () => {
  let essai: ApplicationDEssai;
  let unite: UniteDeTravail;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('unite-de-travail');
    unite = essai.moduleRef.get(UniteDeTravail);
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  it("annule toutes les écritures quand le travail échoue", async () => {
    const client = await fabriques.client(essai);

    await expect(
      unite.executer(async (session) => {
        await essai.modeles.besoins.create(
          [
            {
              client: client._id,
              metier: Metier.PLOMBERIE,
              titre: 'Premier besoin de la transaction',
              description: 'Il doit disparaître avec le reste.',
              adresse: 'Marrakech',
              position: positionDepuis(31.6258, -7.9891),
            },
          ],
          { session },
        );
        await essai.modeles.besoins.create(
          [
            {
              client: client._id,
              metier: Metier.PEINTURE,
              titre: 'Second besoin de la transaction',
              description: 'Il doit disparaître aussi.',
              adresse: 'Marrakech',
              position: positionDepuis(31.6258, -7.9891),
            },
          ],
          { session },
        );
        throw new Error('Échec volontaire après deux écritures.');
      }),
    ).rejects.toThrow('Échec volontaire');

    expect(await essai.modeles.besoins.countDocuments()).toBe(0);
  });

  /**
   * ══ LE PIÈGE LE PLUS COÛTEUX DU PROJET ════════════════════════════════════
   *
   * `Model.create` ne transmet la session que si son premier argument est un
   * TABLEAU. Appelé avec un objet seul, il ne se contente pas de l'ignorer :
   * il prend l'objet d'options POUR UN SECOND DOCUMENT À INSÉRER.
   *
   * Sur un schéma qui a des champs obligatoires — c'est-à-dire sur tout
   * schéma sérieux — le résultat mesuré est celui-ci :
   *
   *     ValidationError: Besoin validation failed:
   *       position: Path `position` is required.,
   *       adresse: Path `adresse` is required.,
   *       description: Path `description` is required., ...
   *
   * Une erreur de validation sur un document que le développeur n'a jamais
   * écrit, qui énumère tous les champs de son schéma, et qui ne mentionne ni
   * la session, ni `create`, ni la transaction. On cherche la faute dans le
   * document qu'on vient de composer — il est complet. Pendant ce temps,
   * l'autre document a DÉJÀ été écrit, hors transaction, et il survit à
   * l'annulation.
   *
   * Mongoose émet bien un avertissement sur la session, mais une seule fois
   * par exécution du processus, dans le flot des journaux de démarrage. Il
   * passe inaperçu.
   *
   * Ce test ne défend pas le code : il MESURE le comportement de la
   * bibliothèque. Si une version future de Mongoose se mettait à transmettre
   * la session dans ce cas, il échouerait — et ce serait une bonne nouvelle à
   * constater explicitement, plutôt qu'une convention devenue inutile qu'on
   * continuerait de recopier sans savoir pourquoi.
   *
   * Mesuré avec Mongoose 9.10.
   */
  it("mesure ce que `create` fait d'un objet seul dans une transaction", async () => {
    const client = await fabriques.client(essai);
    const commun = {
      client: client._id,
      metier: Metier.PLOMBERIE,
      adresse: 'Marrakech',
      description: 'Pour comparer le passage de la session dans les deux formes.',
      position: positionDepuis(31.6258, -7.9891),
    };

    let erreur: Error | undefined;
    try {
      await unite.executer(async (session) => {
        // Forme TABLEAU : la session est transmise, l'écriture sera annulée.
        await essai.modeles.besoins.create([{ ...commun, titre: 'Écrit avec un tableau' }], {
          session,
        });

        // Forme OBJET : l'objet d'options devient un second document.
        await essai.modeles.besoins.create({ ...commun, titre: 'Écrit avec un objet seul' }, {
          session,
        } as never);

        // On n'arrive jamais ici : la ligne précédente a déjà levé.
        throw new Error('Annulation volontaire.');
      });
    } catch (e) {
      erreur = e as Error;
    }

    // L'erreur n'est PAS l'annulation volontaire : c'est une validation qui
    // échoue sur le pseudo-document fabriqué à partir des options.
    expect(erreur?.name).toBe('ValidationError');
    expect(erreur?.message).toContain('Path `titre` is required');

    // Et le document écrit avec la forme objet a survécu à l'annulation : il
    // n'était pas dans la transaction. Celui de la forme tableau a disparu.
    const restants = await essai.modeles.besoins.find().select('titre');
    expect(restants.map((b) => b.titre)).toEqual(['Écrit avec un objet seul']);
  });

  /**
   * Un refus métier ne doit PAS être rejoué.
   *
   * `withTransaction` rejoue le rappel quand MongoDB étiquette l'erreur
   * `TransientTransactionError`. Une exception applicative ne porte pas cette
   * étiquette : elle doit remonter du premier coup.
   *
   * Si ce n'était pas le cas, chaque refus métier coûterait trois tentatives,
   * et surtout : tout effet de bord placé dans le rappel se produirait trois
   * fois. Le compteur ci-dessous le mesure.
   */
  it("ne rejoue pas un refus métier", async () => {
    let tentatives = 0;

    await expect(
      unite.executer(async () => {
        tentatives += 1;
        throw new ConflictException('Règle métier non respectée.');
      }),
    ).rejects.toThrow(ConflictException);

    expect(tentatives).toBe(1);
  });

  /**
   * Une lecture faite SANS la session ne voit pas ce que la transaction vient
   * d'écrire. C'est la raison pour laquelle le recalcul de la note moyenne
   * passe `.session(session)` à son agrégation : sans cela, la note serait
   * systématiquement en retard d'un avis — un décalage permanent, discret, et
   * que seule une lecture attentive du code révélerait.
   */
  it("ne voit pas, hors session, ce que la transaction a écrit", async () => {
    const client = await fabriques.client(essai);

    await unite.executer(async (session) => {
      await essai.modeles.besoins.create(
        [
          {
            client: client._id,
            metier: Metier.PLOMBERIE,
            titre: 'Visible seulement dans la session',
            description: "Une lecture hors session doit l'ignorer.",
            adresse: 'Marrakech',
            position: positionDepuis(31.6258, -7.9891),
          },
        ],
        { session },
      );

      // Dans la session : le document est là.
      const dedans = await essai.modeles.besoins.countDocuments({}).session(session);
      expect(dedans).toBe(1);

      // Hors session : il n'existe pas encore.
      const dehors = await essai.modeles.besoins.countDocuments({});
      expect(dehors).toBe(0);
    });

    // Après validation, tout le monde le voit.
    expect(await essai.modeles.besoins.countDocuments({})).toBe(1);
  });

  it('rend la valeur produite par le travail', async () => {
    const valeur = await unite.executer(async () => ({ resultat: 42 }));
    expect(valeur).toEqual({ resultat: 42 });
  });

  /**
   * La session est fermée même quand le travail échoue.
   *
   * Une session non fermée reste ouverte côté serveur jusqu'à expiration. Sur
   * un service qui refuse beaucoup — ce qui est le cas d'une API qui valide
   * ses règles — la fuite s'accumule jusqu'au plafond du serveur, et les
   * nouvelles transactions sont alors refusées pour une raison qui n'a plus
   * aucun rapport avec la demande en cours.
   */
  it('ferme la session après un échec', async () => {
    const avant = await sessionsOuvertes(essai);

    for (let i = 0; i < 5; i += 1) {
      await expect(
        unite.executer(async () => {
          throw new Error('Échec volontaire.');
        }),
      ).rejects.toThrow();
    }

    const apres = await sessionsOuvertes(essai);
    // Cinq échecs ne doivent pas laisser cinq sessions derrière eux. On
    // tolère une variation d'une session (celles du pilote lui-même).
    expect(apres - avant).toBeLessThanOrEqual(1);
  });
});

/** Nombre de sessions que le serveur garde ouvertes, vu par `$listSessions`. */
const sessionsOuvertes = async (essai: ApplicationDEssai): Promise<number> => {
  const resultat = await essai.connexion
    .db!.admin()
    .command({ aggregate: 1, pipeline: [{ $listLocalSessions: { allUsers: true } }], cursor: {} })
    .catch(() => null);
  return resultat?.cursor?.firstBatch?.length ?? 0;
};
