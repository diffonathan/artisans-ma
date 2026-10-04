import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { UniteDeTravail } from './unite-de-travail.js';
import type { Configuration } from '../configuration/configuration.js';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) => ({
        uri: config.get('MONGO_URI', { infer: true }),

        // Les index déclarés dans les schémas sont créés au démarrage.
        //
        // En production ce serait un mauvais choix : la création d'un index
        // sur une grosse collection bloque, et deux instances qui démarrent
        // en même temps la lancent deux fois. Les index y seraient posés par
        // une migration, avant le déploiement. Ici, l'application est son
        // propre installateur — et plusieurs garanties du domaine SONT des
        // index uniques : les créer silencieusement en retard reviendrait à
        // démarrer sans elles.
        autoIndex: true,

        // Nécessaire pour compter les requêtes envoyées au serveur. C'est ce
        // qui permet au test du N+1 de MESURER le nombre d'allers-retours au
        // lieu de l'affirmer. Le coût est une écoute d'événement par commande.
        monitorCommands: true,
      }),
    }),
  ],
  providers: [UniteDeTravail],
  exports: [UniteDeTravail],
})
export class BaseDeDonneesModule {}
