import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

const demarrer = async () => {
  const app = await NestFactory.create(AppModule, {
    cors: true,

    /**
     * Le corps BRUT est conservé, et c'est indispensable au paiement.
     *
     * La signature des notifications du prestataire est calculée sur les
     * octets exacts du corps. Sans cette option, Express analyse le JSON et
     * la suite d'octets d'origine est perdue : la ré-encoder avec
     * `JSON.stringify` ne la retrouve pas, parce que l'ordre des clés, les
     * espaces et les échappements peuvent différer.
     *
     * Le symptôme est cruel — la signature échoue TOUJOURS, le code paraît
     * juste, et l'on cherche la faute dans le secret ou dans l'horloge.
     * Voir `paiement/paiement.controleur.ts`.
     */
    rawBody: true,
  });

  // Arrêt propre : sur SIGTERM, NestJS attend la fin des requêtes en cours et
  // ferme la connexion MongoDB. Sans cet appel, un redéploiement coupe les
  // requêtes au milieu — y compris des transactions, qui restent alors
  // ouvertes côté serveur jusqu'à expiration.
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  new Logger('Artisans').log(`API GraphQL sur http://localhost:${port}/graphql`);
};

await demarrer();
