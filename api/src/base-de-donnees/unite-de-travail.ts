import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
/**
 * `import type`, et non un import ordinaire — pour une raison qui ne se voit
 * qu'après la compilation.
 *
 * ── Le piège ────────────────────────────────────────────────────────────────
 * Ce projet est en modules ES (`"type": "module"`), et mongoose est un module
 * CommonJS. Node sait en tirer certains exports nommés — `Types`, `Model`,
 * `Schema` — parce que son analyseur les repère dans le source. Il ne voit pas
 * `Connection` ni `ClientSession`.
 *
 * Normalement cela n'aurait aucune importance : les deux ne servent ici que
 * comme types, et TypeScript efface les imports qui ne sont pas utilisés comme
 * valeurs. Sauf que `emitDecoratorMetadata` — indispensable à l'injection de
 * NestJS — a besoin des types des paramètres de constructeur POUR LES ÉCRIRE
 * dans la métadonnée. TypeScript PRÉSERVE donc l'import, et le code compilé
 * demande à Node un export qui n'existe pas :
 *
 *     SyntaxError: The requested module 'mongoose' does not provide
 *                  an export named 'Connection'
 *
 * ── Pourquoi c'est particulièrement vicieux ─────────────────────────────────
 * Les tests ne le voient pas. Vite — donc vitest — fait lui-même l'interop
 * CommonJS et sert gentiment l'export manquant. La suite entière passe au vert
 * sur un code qui ne démarre pas une fois construit. Le symptôme n'apparaît
 * qu'en lançant le binaire compilé, c'est-à-dire en production.
 *
 * `import type` rend l'import explicitement effaçable : la métadonnée reçoit
 * `Object` à la place du type, ce qui ne gêne personne puisque le jeton
 * d'injection vient de `@InjectConnection()` et non du type.
 */
import type { ClientSession, Connection } from 'mongoose';

/**
 * Exécute un travail « tout ou rien » dans une transaction MongoDB.
 *
 * ── Pourquoi cette classe existe ────────────────────────────────────────────
 * MongoDB n'a pas de clé étrangère. Aucune contrainte ne peut dire « cet avis
 * ne doit pas exister sans sa réservation ». Le seul outil qui reste pour
 * écrire plusieurs documents de façon indivisible est la transaction.
 *
 * Elle porte donc, dans ce projet, le poids que portent les contraintes
 * référentielles ailleurs. Autant la centraliser, et écrire ici une fois ce
 * qu'il faut savoir pour l'utiliser sans se tromper.
 *
 * ── Trois pièges, dans l'ordre où on les rencontre ──────────────────────────
 *
 * 1. `withTransaction` RÉESSAIE. Le pilote rejoue automatiquement le rappel
 *    quand MongoDB signale une erreur étiquetée `TransientTransactionError`
 *    (conflit d'écriture, bascule de nœud). Le rappel peut donc s'exécuter
 *    deux fois, trois fois. Tout effet qui n'est pas dans la transaction —
 *    envoyer un courriel, appeler Stripe, incrémenter un compteur en mémoire —
 *    se produira autant de fois. Ces effets vont APRÈS, jamais dedans.
 *
 * 2. Un refus métier ne doit pas être réessayé — et ne l'est pas. Le pilote
 *    ne rejoue que ce qui porte l'étiquette de MongoDB. Une exception
 *    applicative n'en a pas : la transaction est annulée et l'erreur remonte
 *    telle quelle. C'est le comportement voulu, mais il repose sur un détail
 *    du pilote, donc il est vérifié par un test.
 *
 * 3. Chaque opération doit recevoir la session. Un `Model.create()` qui
 *    l'oublie écrit EN DEHORS de la transaction : l'annulation ne le rattrape
 *    pas, et le document reste. Rien ne prévient. C'est l'erreur la plus
 *    coûteuse du lot, parce qu'elle ne se voit qu'en cas d'échec — donc
 *    jamais pendant le développement.
 */
@Injectable()
export class UniteDeTravail {
  private readonly journal = new Logger(UniteDeTravail.name);

  constructor(@InjectConnection() private readonly connexion: Connection) {}

  async executer<T>(travail: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connexion.startSession();
    let tentatives = 0;

    try {
      // `withTransaction` renvoie la valeur du rappel selon les versions du
      // pilote. On la capture dans une variable plutôt que de s'y fier.
      let resultat!: T;

      await session.withTransaction(async () => {
        tentatives += 1;
        resultat = await travail(session);
      });

      if (tentatives > 1) {
        this.journal.warn(
          `Transaction aboutie après ${tentatives} tentatives (conflit d'écriture).`,
        );
      }

      return resultat;
    } finally {
      // `endSession` libère la session côté serveur. L'oublier fuit une
      // session par appel, jusqu'au plafond du serveur.
      await session.endSession();
    }
  }
}
