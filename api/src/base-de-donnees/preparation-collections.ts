import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

/**
 * Crée les collections et les index AVANT que l'application accepte du trafic.
 *
 * ── Le piège que cette classe existe pour éviter ────────────────────────────
 * Une transaction MongoDB ne peut pas créer une collection dans toutes les
 * configurations : la première écriture transactionnelle dans une collection
 * qui n'existe pas encore échoue avec
 *
 *     Cannot create namespace ... in multi-document transaction
 *
 * En développement on ne le voit jamais : on a lancé une écriture simple
 * avant, qui a créé la collection au passage. Sur une base neuve — un
 * environnement de recette, un test qui part de zéro — la toute première
 * opération du domaine est une transaction, et elle échoue.
 *
 * L'erreur est d'autant plus déroutante qu'elle ne parle pas de collection
 * manquante mais de transaction. Elle disparaît si on relance. Donc elle
 * passe pour un aléa.
 *
 * `syncIndexes()` crée la collection en même temps que ses index. On l'appelle
 * sur tous les modèles, une fois, au démarrage, et le problème n'existe plus.
 *
 * ── Et en production ? ──────────────────────────────────────────────────────
 * `syncIndexes()` SUPPRIME les index qui ne sont plus déclarés dans le schéma.
 * Sur une grosse collection, poser un index bloque les écritures. Dans une
 * vraie exploitation, cette étape serait une migration lancée séparément,
 * avant le déploiement, et l'application démarrerait en vérifiant seulement
 * que les index attendus sont là. Le lancer au démarrage est un choix
 * d'application qui s'installe elle-même, pas une pratique à recopier.
 */
@Injectable()
export class PreparationCollections implements OnApplicationBootstrap {
  private readonly journal = new Logger(PreparationCollections.name);

  constructor(@InjectConnection() private readonly connexion: Connection) {}

  async onApplicationBootstrap(): Promise<void> {
    const noms = Object.keys(this.connexion.models);

    for (const nom of noms) {
      await this.connexion.models[nom].syncIndexes();
    }

    this.journal.log(`${noms.length} collections prêtes, index synchronisés.`);
  }
}
