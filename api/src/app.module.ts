import { Module, ValidationPipe } from '@nestjs/common';
import { APP_GUARD, APP_PIPE } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import { join } from 'node:path';
import type { Request } from 'express';

import { NoyauModule } from './noyau.module.js';
import { DomaineModule } from './domaine/domaine.module.js';
import { FabriqueChargeurs } from './commun/chargeurs.js';
import { GardeAuthentification } from './commun/authentification.js';

/**
 * Le noyau, plus la façon dont on lui parle : GraphQL.
 *
 * Tout ce qui est propre au transport est ici — le schéma, le contexte par
 * requête, la garde d'authentification, la validation des entrées. Le domaine,
 * lui, est dans `NoyauModule` et ne sait pas qu'il est exposé en GraphQL.
 */
@Module({
  imports: [
    NoyauModule,

    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [DomaineModule],
      inject: [FabriqueChargeurs],
      useFactory: (fabrique: FabriqueChargeurs) => ({
        // Schéma produit depuis les classes TypeScript, et ÉCRIT sur le
        // disque. Un schéma qui n'existe qu'en mémoire ne se relit pas, ne se
        // compare pas d'une version à l'autre, et ne permet pas de voir en
        // revue de code qu'un champ vient d'être exposé par accident.
        autoSchemaFile: join(process.cwd(), 'schema.graphql'),
        sortSchema: true,

        // Le bac à sable Apollo, servi sur la même adresse que l'API.
        //
        // `playground: true` ne marche plus : il désignait l'ancien
        // GraphQL Playground, retiré d'Apollo Server 4. Le laisser produit une
        // page blanche — sans message. Le remplaçant est un module d'extension.
        playground: false,
        plugins: [ApolloServerPluginLandingPageLocalDefault({ embed: true })],

        /**
         * Le contexte est construit À CHAQUE REQUÊTE.
         *
         * C'est ce qui donne aux chargeurs leur durée de vie correcte : le
         * regroupement vaut pour une requête, le cache ne doit pas survivre
         * au-delà (voir `chargeurs.ts`).
         *
         * L'en-tête d'autorisation est recopié ici plutôt que lu dans la
         * garde : en GraphQL, remonter à la requête HTTP depuis un
         * `ExecutionContext` demande de passer par `GqlExecutionContext`, et
         * le code qui l'oublie obtient `undefined` sans erreur. Le recopier
         * une fois, à l'endroit où la requête est encore à portée de main,
         * supprime la question.
         */
        context: ({ req }: { req: Request }) => ({
          chargeurs: fabrique.creer(),
          entete: req?.headers?.authorization,
        }),

        formatError: (erreur) => ({
          message: erreur.message,
          code: erreur.extensions?.code,
          chemin: erreur.path,
        }),
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: GardeAuthentification },
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          // `whitelist` retire les champs non déclarés ; `forbidNonWhitelisted`
          // les refuse au lieu de les retirer en silence. Un client qui envoie
          // `role: "ADMIN"` dans une inscription doit obtenir une erreur, pas
          // un succès où son champ a été discrètement ignoré.
          //
          // Attention : la « liste blanche » est faite des propriétés qui
          // portent un décorateur de class-validator, PAS des champs du schéma
          // GraphQL. Un champ sans décorateur est refusé. Le détail est dans
          // `artisans.resolver.ts`.
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
    },
  ],
})
export class AppModule {}
