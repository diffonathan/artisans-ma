import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Types } from 'mongoose';
import {
  ApplicationDEssai,
  compterCommandes,
  creerApplicationDEssai,
  fabriques,
  MARRAKECH,
} from './base-d-essai.js';
import { FabriqueChargeurs } from '../src/commun/chargeurs.js';
import { ComptesService } from '../src/domaine/comptes/comptes.service.js';
import { Metier } from '../src/commun/types.js';

/**
 * ══ Le problème N+1, mesuré ════════════════════════════════════════════════
 *
 * Dire « DataLoader évite le N+1 » ne prouve rien : c'est la documentation de
 * DataLoader. Ce fichier COMPTE les commandes envoyées au serveur MongoDB,
 * avec et sans chargeur, sur la même requête GraphQL.
 *
 * Le comptage passe par l'événement `commandStarted` du pilote, activé par
 * `monitorCommands: true` dans les options de connexion. Sans cette option,
 * aucun événement n'est émis et le compteur reste à zéro — ce qui se lirait
 * comme un résultat parfait. L'instrument est donc vérifié d'abord, par un
 * cas dont on connaît la réponse.
 */
describe('Le nombre de requêtes envoyées à MongoDB', () => {
  let essai: ApplicationDEssai;

  beforeAll(async () => {
    essai = await creerApplicationDEssai('n-plus-un', { http: true });
  });
  afterAll(async () => essai.fermer());
  beforeEach(async () => essai.vider());

  /** Vérifie l'instrument avant de s'en servir. */
  it('compte bien les commandes — une lecture, une commande', async () => {
    await fabriques.client(essai);

    const { commandes } = await compterCommandes(essai.connexion, async () => {
      await essai.modeles.comptes.findOne({});
    });

    expect(commandes).toEqual(['find']);
  });

  /**
   * ══ LA MESURE ═════════════════════════════════════════════════════════════
   *
   * Vingt artisans, et une requête GraphQL qui demande pour chacun le nom de
   * son titulaire. Le résolveur de champ est appelé vingt fois.
   *
   * Sans regroupement : 1 agrégation (la recherche) + 20 lectures = 21.
   * Avec le chargeur : 1 agrégation + 1 lecture groupée = 2.
   *
   * Le test compare les deux dans le même processus, sur les mêmes données.
   */
  it('passe de 21 à 2 requêtes grâce au chargeur groupé', async () => {
    const titulaires: Types.ObjectId[] = [];
    for (let i = 0; i < 20; i += 1) {
      const { profil } = await fabriques.artisan(essai, {
        email: `artisan-${i}@essai.ma`,
        raisonSociale: `Artisan numéro ${i}`,
        rayonKm: 50,
      });
      titulaires.push(profil.compte);
    }

    const chargeurs = essai.moduleRef.get(FabriqueChargeurs).creer();
    const comptes = essai.moduleRef.get(ComptesService);

    // ── Sans regroupement : ce que fait un résolveur naïf ──────────────────
    const naif = await compterCommandes(essai.connexion, async () => {
      const trouves = await essai.services.artisans.rechercher({
        metier: Metier.PLOMBERIE,
        position: MARRAKECH,
        limite: 20,
      });
      // Une lecture par artisan, exactement ce que GraphQL déclenche quand le
      // résolveur de champ interroge la base lui-même.
      for (const a of trouves) {
        await comptes.parIdentifiants([a.compte]);
      }
      return trouves.length;
    });

    // ── Avec le chargeur : les vingt demandes rassemblées en un lot ────────
    const groupe = await compterCommandes(essai.connexion, async () => {
      const trouves = await essai.services.artisans.rechercher({
        metier: Metier.PLOMBERIE,
        position: MARRAKECH,
        limite: 20,
      });
      // `Promise.all` est essentiel : DataLoader rassemble ce qui est demandé
      // DANS LE MÊME TOUR de boucle d'événements. Une boucle `for await`
      // enverrait vingt lots d'un élément — le chargeur serait là, et ne
      // servirait à rien. C'est l'erreur la plus facile à commettre, et la
      // plus silencieuse.
      await Promise.all(trouves.map((a) => chargeurs.compte.load(a.compte)));
      return trouves.length;
    });

    expect(naif.resultat).toBe(20);
    expect(groupe.resultat).toBe(20);

    expect(naif.commandes).toHaveLength(21);
    expect(groupe.commandes).toHaveLength(2);
  });

  /**
   * Le contre-exemple, écrit exprès : un chargeur mal utilisé ne gagne rien.
   *
   * Même chargeur, mêmes données, mais les demandes sont attendues une par
   * une. Chaque `await` ferme le tour d'événements, donc chaque lot ne
   * contient qu'un élément. Vingt-et-une commandes à nouveau.
   *
   * Ce test est là pour que la mesure ne soit pas confondue avec de la magie :
   * c'est le regroupement temporel qui fait le gain, pas la présence de l'outil.
   */
  it("ne gagne rien si les demandes sont attendues l'une après l'autre", async () => {
    for (let i = 0; i < 20; i += 1) {
      await fabriques.artisan(essai, { email: `sequentiel-${i}@essai.ma`, rayonKm: 50 });
    }

    const chargeurs = essai.moduleRef.get(FabriqueChargeurs).creer();

    const { commandes } = await compterCommandes(essai.connexion, async () => {
      const trouves = await essai.services.artisans.rechercher({
        metier: Metier.PLOMBERIE,
        position: MARRAKECH,
        limite: 20,
      });
      for (const a of trouves) {
        await chargeurs.compte.load(a.compte);
      }
    });

    expect(commandes).toHaveLength(21);
  });

  /**
   * La requête GraphQL complète, de bout en bout.
   *
   * On interroge l'API par HTTP, comme un vrai client, et l'on compte. Le
   * contexte GraphQL crée un jeu de chargeurs neuf pour cette requête : le
   * regroupement doit donc se produire sans que le test l'orchestre.
   */
  it('groupe aussi dans une vraie requête GraphQL', async () => {
    for (let i = 0; i < 15; i += 1) {
      await fabriques.artisan(essai, { email: `gql-${i}@essai.ma`, rayonKm: 50 });
    }

    const requete = `
      query {
        rechercherArtisans(entree: {
          metier: PLOMBERIE
          latitude: ${MARRAKECH.latitude}
          longitude: ${MARRAKECH.longitude}
          limite: 15
        }) {
          raisonSociale
          distanceMetres
          titulaire { nom email }
        }
      }
    `;

    const { resultat, commandes } = await compterCommandes(essai.connexion, async () =>
      request(essai.app.getHttpServer()).post('/graphql').send({ query: requete }),
    );

    expect(resultat.status).toBe(200);
    expect(resultat.body.errors).toBeUndefined();
    expect(resultat.body.data.rechercherArtisans).toHaveLength(15);
    expect(resultat.body.data.rechercherArtisans[0].titulaire.nom).toBeTruthy();

    // 1 agrégation pour la recherche, 1 lecture groupée pour les quinze
    // titulaires. Sans le chargeur, ce serait 16.
    expect(commandes).toHaveLength(2);
  });

  /**
   * ══ L'ORDRE DU LOT ════════════════════════════════════════════════════════
   *
   * DataLoader associe les valeurs aux clés PAR POSITION. Or une requête
   * `{ _id: { $in: [...] } }` rend les documents dans l'ordre de l'index, pas
   * dans celui de la liste.
   *
   * Les identifiants sont donc demandés ici dans l'ordre DÉCROISSANT, à
   * l'inverse de celui où MongoDB les rendra. Un chargeur qui rendrait le
   * résultat brut attribuerait le premier document à la dernière clé : les
   * noms seraient permutés, sans aucune erreur.
   *
   * Un test écrit avec deux documents insérés dans l'ordre croissant ne
   * verrait jamais rien.
   */
  it('associe chaque document à la bonne clé, même demandées à rebours', async () => {
    const comptes = [];
    for (let i = 0; i < 5; i += 1) {
      comptes.push(await fabriques.client(essai, `ordre-${i}@essai.ma`));
    }

    // Les ObjectId sont croissants dans le temps : on inverse pour que l'ordre
    // demandé soit l'opposé de celui que l'index rendra.
    const aRebours = [...comptes].reverse();
    const chargeurs = essai.moduleRef.get(FabriqueChargeurs).creer();

    const charges = await Promise.all(aRebours.map((c) => chargeurs.compte.load(c._id)));

    expect(charges.map((c) => c!.email)).toEqual(aRebours.map((c) => c.email));
  });

  /** Une clé introuvable doit rendre `null`, et non décaler ce qui suit. */
  it('rend null pour une clé introuvable sans décaler les autres', async () => {
    const un = await fabriques.client(essai, 'present-1@essai.ma');
    const deux = await fabriques.client(essai, 'present-2@essai.ma');
    const absent = new Types.ObjectId();

    const chargeurs = essai.moduleRef.get(FabriqueChargeurs).creer();
    const charges = await Promise.all([
      chargeurs.compte.load(un._id),
      chargeurs.compte.load(absent),
      chargeurs.compte.load(deux._id),
    ]);

    expect(charges[0]!.email).toBe('present-1@essai.ma');
    expect(charges[1]).toBeNull();
    expect(charges[2]!.email).toBe('present-2@essai.ma');
  });

  /**
   * Deux `ObjectId` égaux mais distincts doivent compter pour une seule clé.
   *
   * DataLoader indexe son cache par identité (`===`) par défaut : sans
   * `cacheKeyFn`, ces deux objets seraient deux clés différentes, et la même
   * ligne serait demandée deux fois dans le même lot. Le regroupement
   * marcherait encore, le cache non.
   */
  it('reconnaît deux ObjectId égaux comme une seule clé', async () => {
    const compte = await fabriques.client(essai, 'une-seule-cle@essai.ma');

    const chargeurs = essai.moduleRef.get(FabriqueChargeurs).creer();

    const { commandes } = await compterCommandes(essai.connexion, async () => {
      await Promise.all([
        chargeurs.compte.load(compte._id),
        chargeurs.compte.load(new Types.ObjectId(String(compte._id))),
      ]);
    });

    expect(commandes).toHaveLength(1);
  });
});
