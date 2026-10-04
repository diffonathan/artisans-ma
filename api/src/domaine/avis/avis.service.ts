import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { ClientSession } from 'mongoose';
import { Avis, DocumentAvis } from './avis.schema.js';
import { Reservation, StatutReservation } from '../reservations/reservation.schema.js';
import { Artisan } from '../artisans/artisan.schema.js';
import { UniteDeTravail } from '../../base-de-donnees/unite-de-travail.js';

export interface EntreeAvis {
  reservation: Types.ObjectId;
  note: number;
  commentaire: string;
}

@Injectable()
export class AvisService {
  constructor(
    @InjectModel(Avis.name) private readonly avis: Model<Avis>,
    @InjectModel(Reservation.name) private readonly reservations: Model<Reservation>,
    @InjectModel(Artisan.name) private readonly artisans: Model<Artisan>,
    private readonly uniteDeTravail: UniteDeTravail,
  ) {}

  /**
   * Dépose un avis, et ne le dépose que s'il est mérité.
   *
   * ══ Ce qu'« avis vérifié » veut dire ici ═══════════════════════════════════
   *
   * La promesse affichée au visiteur est : « cet avis vient d'un client qui a
   * réellement payé cette prestation ». Il faut donc pouvoir répondre à
   * quelqu'un qui demande comment on l'empêche d'en inventer un.
   *
   * ── Ce que PostgreSQL ferait ────────────────────────────────────────────
   * Une clé étrangère `avis.reservation -> reservations(id)`, et la base
   * refuserait physiquement un avis dont la réservation n'existe pas. On
   * pourrait même aller plus loin avec un déclencheur : refuser l'insertion
   * si la réservation n'est pas TERMINEE.
   *
   * ── Ce que MongoDB n'a pas ──────────────────────────────────────────────
   * Rien de tout cela. Pas de clé étrangère, pas de contrainte référentielle,
   * pas de déclencheur. `avis.reservation` est un champ qui contient douze
   * octets ; la base ne sait pas qu'il désigne autre chose.
   *
   * Dire « la base refuse » serait donc faux, et je ne le dis pas.
   *
   * ── Ce qu'on met à la place, et qui tient ───────────────────────────────
   * Trois mécanismes, dont deux sont dans la base :
   *
   *   1. LE DROIT D'AVIS EST UN JETON, CONSOMMÉ PAR COMPARAISON-ET-ÉCHANGE.
   *      Le premier geste n'est pas de lire la réservation puis de décider :
   *      c'est d'écrire `avisDeposeA` en exigeant DANS LE FILTRE qu'il valait
   *      `null`, que le statut est TERMINEE, et que le client est bien
   *      l'auteur. Si le filtre ne trouve rien, il n'y a rien à modifier et
   *      l'on s'arrête. La vérification et la réservation du droit sont la
   *      MÊME écriture — donc indivisibles, sans verrou applicatif.
   *
   *      Un `if (reservation.avisDeposeA === null)` suivi d'une écriture
   *      laisserait passer deux avis déposés dans la même milliseconde.
   *
   *   2. UN INDEX UNIQUE SUR `reservation`. Deuxième barrière, redondante
   *      avec la première — volontairement. Si un futur chemin de code oublie
   *      de consommer le jeton, l'index refuse quand même le second avis.
   *
   *   3. LA TRANSACTION. L'avis, le jeton consommé et la note moyenne de
   *      l'artisan forment une seule écriture : jamais d'avis sans jeton
   *      consommé, jamais de note qui ne corresponde pas aux avis.
   *
   * ── Ce qui reste non garanti, et qu'il faut savoir dire ─────────────────
   * Quelqu'un qui écrit DIRECTEMENT dans la base — pas à travers l'API —
   * peut insérer un avis pointant vers une réservation inexistante. MongoDB
   * l'acceptera. En PostgreSQL, non.
   *
   * La contrainte est donc remplacée par un CONTRÔLE, pas par une garantie :
   * la commande `verifier-integrite` recense les avis orphelins et sort en
   * erreur s'il en trouve. C'est plus faible, et c'est le prix de MongoDB
   * sur ce point précis. Le dire est plus utile que de l'habiller.
   */
  async deposer(entree: EntreeAvis, client: Types.ObjectId): Promise<DocumentAvis> {
    return this.uniteDeTravail.executer(async (session) => {
      // 1. Consommation du jeton. Tout est dans le filtre, rien dans un `if`.
      const reservation = await this.reservations.findOneAndUpdate(
        {
          _id: entree.reservation,
          client,
          statut: StatutReservation.TERMINEE,
          avisDeposeA: null,
        },
        { $set: { avisDeposeA: new Date() } },
        { session, returnDocument: 'after' },
      );

      if (!reservation) {
        // Un seul message pour quatre refus possibles (réservation
        // inexistante, pas la vôtre, pas terminée, déjà notée). Distinguer
        // les cas renseignerait un inconnu sur l'existence de réservations
        // qui ne sont pas les siennes.
        throw new ConflictException(
          "Cette prestation n'est pas notable : soit elle n'est pas terminée, " +
            'soit elle a déjà reçu votre avis, soit elle ne vous concerne pas.',
        );
      }

      // 2. L'avis lui-même. Tableau d'un élément : c'est la seule forme de
      //    `create` à laquelle Mongoose transmet la session — voir le détail
      //    dans `devis.service.ts` et la mesure dans
      //    `test/unite-de-travail.spec.ts`.
      const [avis] = await this.avis.create(
        [
          {
            reservation: reservation._id,
            artisan: reservation.artisan,
            client,
            note: entree.note,
            commentaire: entree.commentaire,
          },
        ],
        { session },
      );

      // 3. La note moyenne de l'artisan, dans la même écriture.
      await this.recalculerNote(reservation.artisan, session);

      return avis;
    });
  }

  /**
   * Recalcule la note d'un artisan à partir de ses avis.
   *
   * ── Pourquoi tout recalculer au lieu d'incrémenter ──────────────────────
   * Une moyenne glissante (`$inc` sur le total et le nombre) coûte une
   * écriture au lieu d'une agrégation. Mais elle DÉRIVE : il suffit qu'un
   * avis soit un jour supprimé, corrigé, ou masqué par la modération, pour
   * que le cumul ne corresponde plus aux avis réellement affichés. Et comme
   * rien ne le signale, l'écart grandit sans qu'on le sache.
   *
   * Recalculer depuis la source donne un résultat exact par construction : la
   * note affichée est, à chaque instant, la moyenne des avis présents. Le
   * coût est une agrégation sur les avis d'UN artisan — quelques dizaines de
   * documents, servis par l'index `{ artisan: 1 }`.
   *
   * Si le volume rendait un jour ce calcul trop lourd, le remplacement ne
   * serait pas la moyenne glissante mais un recalcul différé — en gardant la
   * propriété « la note est toujours vérifiable ».
   *
   * `arrondi à 0,1` : afficher 4,333 333 3 étoiles n'a pas de sens, et
   * stocker la valeur arrondie évite que deux écrans l'arrondissent
   * différemment.
   */
  private async recalculerNote(artisan: Types.ObjectId, session: ClientSession): Promise<void> {
    const [agregat] = await this.avis
      .aggregate<{ somme: number; nombre: number }>([
        { $match: { artisan } },
        { $group: { _id: null, somme: { $sum: '$note' }, nombre: { $sum: 1 } } },
      ])
      // L'agrégation DOIT recevoir la session : sans elle, elle lit l'état
      // d'avant la transaction et ne voit pas l'avis qu'on vient d'insérer.
      // La note serait alors systématiquement en retard d'un avis.
      .session(session);

    const nombre = agregat?.nombre ?? 0;
    const moyenne = nombre === 0 ? 0 : Math.round((agregat.somme / nombre) * 10) / 10;

    await this.artisans.updateOne(
      { _id: artisan },
      { $set: { noteMoyenne: moyenne, nombreAvis: nombre } },
      { session },
    );
  }

  /**
   * Recense les avis dont la réservation a disparu.
   *
   * C'est le contrôle qui remplace la clé étrangère absente. Il n'empêche
   * rien — il constate. Appelé par la commande `verifier-integrite`, il
   * permet au moins de savoir, au lieu de supposer.
   */
  async avisOrphelins(): Promise<Types.ObjectId[]> {
    const orphelins = await this.avis.aggregate<{ _id: Types.ObjectId }>([
      {
        $lookup: {
          from: 'reservations',
          localField: 'reservation',
          foreignField: '_id',
          as: 'r',
        },
      },
      { $match: { r: { $size: 0 } } },
      { $project: { _id: 1 } },
    ]);
    return orphelins.map((o) => o._id);
  }
}
