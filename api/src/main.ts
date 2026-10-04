import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';

const demarrer = async () => {
  const app = await NestFactory.create(AppModule, { cors: true });

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
