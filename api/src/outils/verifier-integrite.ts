import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from '../app.module.js';
import { AvisService } from '../domaine/avis/avis.service.js';
import { Avis } from '../domaine/avis/avis.schema.js';
import { Artisan } from '../domaine/artisans/artisan.schema.js';
import { Reservation } from '../domaine/reservations/reservation.schema.js';
import { Devis } from '../domaine/devis/devis.schema.js';

/**
 * ══ Le contrôle qui remplace les clés étrangères absentes ══════════════════
 *
 * MongoDB n'a pas de contrainte référentielle. Un `ObjectId` est un champ de
 * douze octets : la base ne sait pas qu'il désigne un autre document, et ne
 * peut donc pas refuser qu'il désigne un document inexistant.
 *
 * En PostgreSQL, les quatre vérifications ci-dessous seraient inutiles : les
 * situations qu'elles cherchent ne pourraient pas exister. Ici elles peuvent,
 * et la seule réponse honnête est de les CHERCHER régulièrement plutôt que de
 * prétendre les avoir empêchées.
 *
 * ── Ce que ce contrôle est, et ce qu'il n'est pas ───────────────────────────
 * Il n'empêche rien. Il constate, et il sort en erreur s'il trouve quelque
 * chose — ce qui permet de le brancher sur une tâche planifiée ou une chaîne
 * d'intégration, et d'être averti au lieu de l'apprendre d'un utilisateur.
 *
 * C'est strictement plus faible qu'une contrainte. Le dire est plus utile que
 * de l'habiller : une équipe qui croit avoir une garantie se dispense du
 * contrôle, et c'est ainsi qu'on découvre le problème six mois plus tard.
 *
 * Lancer : npm run verifier-integrite
 */
const verifier = async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const modele = <T>(nom: string) => app.get<Model<T>>(getModelToken(nom));
  const avis = modele<Avis>(Avis.name);
  const artisans = modele<Artisan>(Artisan.name);
  const reservations = modele<Reservation>(Reservation.name);
  const devis = modele<Devis>(Devis.name);

  const anomalies: string[] = [];
  const signaler = (quoi: string, combien: number, exemples: unknown[] = []) => {
    if (combien === 0) {
      console.log(`  OK   ${quoi}`);
      return;
    }
    const suffixe = exemples.length ? ` — par exemple ${exemples.slice(0, 3).join(', ')}` : '';
    const ligne = `${quoi} : ${combien}${suffixe}`;
    console.log(`  ÉCHEC ${ligne}`);
    anomalies.push(ligne);
  };

  console.log('\nContrôle d’intégrité référentielle\n');

  // 1. Des avis dont la réservation a disparu. C'est l'anomalie que la clé
  //    étrangère rendrait impossible.
  const avisOrphelins = await app.get(AvisService).avisOrphelins();
  signaler('Avis sans réservation', avisOrphelins.length, avisOrphelins);

  // 2. Des réservations dont le devis a disparu.
  const reservationsOrphelines = await orphelins(reservations, 'devis', 'devis');
  signaler('Réservations sans devis', reservationsOrphelines.length, reservationsOrphelines);

  // 3. Des devis dont l'artisan a disparu.
  const devisOrphelins = await orphelins(devis, 'artisan', 'artisans');
  signaler('Devis sans artisan', devisOrphelins.length, devisOrphelins);

  /**
   * 4. Des notes moyennes qui ne correspondent pas aux avis.
   *
   * Celle-ci n'est pas un problème de référence mais de donnée dupliquée :
   * `artisan.noteMoyenne` est une copie, et une copie peut mentir. Elle est
   * recalculée dans la transaction de l'avis, donc elle ne devrait jamais
   * dériver — ce contrôle vérifie que la promesse tient, au lieu de la
   * supposer. C'est le prix de la dénormalisation : on duplique, et on
   * surveille.
   */
  const divergentes = await notesDivergentes(artisans, avis);
  signaler('Notes moyennes incohérentes', divergentes.length, divergentes);

  await app.close();

  if (anomalies.length > 0) {
    console.error(`\n${anomalies.length} anomalie(s). Sortie en erreur.\n`);
    process.exitCode = 1;
    return;
  }
  console.log('\nAucune anomalie.\n');
};

/**
 * Cherche les documents dont une référence ne pointe sur rien.
 *
 * `$lookup` + `$match: { … $size: 0 }` est la seule façon de poser la question
 * à MongoDB : « quels documents de A n'ont aucun correspondant dans B ? ».
 * C'est une jointure gauche suivie d'un filtre sur l'absence, soit exactement
 * ce qu'un `LEFT JOIN ... WHERE b.id IS NULL` fait en SQL — à ceci près qu'en
 * SQL on n'aurait pas besoin de la poser.
 */
const orphelins = async <T>(
  modele: Model<T>,
  champ: string,
  collectionCible: string,
): Promise<Types.ObjectId[]> => {
  const resultat = await modele.aggregate<{ _id: Types.ObjectId }>([
    {
      $lookup: {
        from: collectionCible,
        localField: champ,
        foreignField: '_id',
        as: 'cible',
      },
    },
    { $match: { cible: { $size: 0 } } },
    { $project: { _id: 1 } },
  ]);
  return resultat.map((r) => r._id);
};

const notesDivergentes = async (
  artisans: Model<Artisan>,
  avis: Model<Avis>,
): Promise<string[]> => {
  const reelles = await avis.aggregate<{ _id: Types.ObjectId; moyenne: number; nombre: number }>([
    { $group: { _id: '$artisan', moyenne: { $avg: '$note' }, nombre: { $sum: 1 } } },
  ]);
  const parArtisan = new Map(reelles.map((r) => [String(r._id), r]));

  const ecarts: string[] = [];
  for await (const artisan of artisans.find().select('noteMoyenne nombreAvis raisonSociale')) {
    const reelle = parArtisan.get(String(artisan._id));
    const nombreAttendu = reelle?.nombre ?? 0;
    const moyenneAttendue = reelle ? Math.round(reelle.moyenne * 10) / 10 : 0;

    if (artisan.nombreAvis !== nombreAttendu || artisan.noteMoyenne !== moyenneAttendue) {
      ecarts.push(
        `${artisan.raisonSociale} (stocké ${artisan.noteMoyenne}/${artisan.nombreAvis}, ` +
          `réel ${moyenneAttendue}/${nombreAttendu})`,
      );
    }
  }
  return ecarts;
};

await verifier();
