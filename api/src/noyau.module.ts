import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { chargerConfiguration } from './configuration/configuration.js';
import { BaseDeDonneesModule } from './base-de-donnees/base-de-donnees.module.js';
import { PreparationCollections } from './base-de-donnees/preparation-collections.js';
import { DomaineModule } from './domaine/domaine.module.js';

/**
 * Tout ce qui fait l'application, SAUF la façon dont on lui parle.
 *
 * ── Pourquoi cette séparation existe ────────────────────────────────────────
 * `AppModule` ajoute GraphQL par-dessus ce noyau. Construire le schéma GraphQL
 * coûte quelques secondes : il faut parcourir toutes les classes décorées,
 * résoudre les types, écrire le fichier `schema.graphql`.
 *
 * Or la plupart des tests n'interrogent pas l'API : ils éprouvent une règle du
 * domaine, en appelant un service. Leur faire construire le schéma à chaque
 * fois était mesurable — 61 secondes sur une suite de 144, pour sept fichiers
 * qui démarraient chacun l'application complète.
 *
 * Mais le gain de temps n'est pas la vraie raison. La vraie raison est que le
 * domaine ne doit RIEN devoir au transport : s'il fallait un serveur GraphQL
 * pour vérifier qu'un avis exige une prestation terminée, c'est que la règle
 * serait dans le résolveur. Pouvoir démarrer le noyau seul est donc un
 * contrôle d'architecture autant qu'une optimisation — et il échouerait si la
 * frontière se brouillait.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // La validation est faite par le schéma, pas par des `process.env.X ||`
      // dispersés : une variable manquante arrête le démarrage en la nommant.
      load: [() => chargerConfiguration()],
      cache: true,
    }),
    BaseDeDonneesModule,
    DomaineModule,
  ],
  providers: [PreparationCollections],
  exports: [DomaineModule],
})
export class NoyauModule {}
