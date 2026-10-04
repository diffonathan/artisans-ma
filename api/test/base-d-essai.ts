import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../src/app.module.js';
import { NoyauModule } from '../src/noyau.module.js';

import { Compte } from '../src/domaine/comptes/compte.schema.js';
import { Artisan } from '../src/domaine/artisans/artisan.schema.js';
import { Besoin } from '../src/domaine/besoins/besoin.schema.js';
import { Devis } from '../src/domaine/devis/devis.schema.js';
import { Reservation } from '../src/domaine/reservations/reservation.schema.js';
import { Avis } from '../src/domaine/avis/avis.schema.js';

import { ComptesService } from '../src/domaine/comptes/comptes.service.js';
import { ArtisansService } from '../src/domaine/artisans/artisans.service.js';
import { BesoinsService } from '../src/domaine/besoins/besoins.service.js';
import { DevisService } from '../src/domaine/devis/devis.service.js';
import { ReservationsService } from '../src/domaine/reservations/reservations.service.js';
import { AvisService } from '../src/domaine/avis/avis.service.js';
import { Metier } from '../src/commun/types.js';

/**
 * Les tests tournent contre un VRAI MongoDB — celui du docker-compose.
 *
 * ── Pourquoi pas `mongodb-memory-server` ───────────────────────────────────
 * Parce que la moitié de ce qui est testé ici n'existe que dans un vrai
 * serveur : les transactions multi-documents, les index uniques partiels,
 * `$geoNear` et son index 2dsphere. Une base simulée rendrait les tests verts
 * sans prouver quoi que ce soit — c'est-à-dire pire que pas de test, puisque
 * le vert donnerait confiance.
 *
 * ── Une base par fichier de test ────────────────────────────────────────────
 * Chaque fichier travaille dans sa propre base, nommée d'après lui. Deux
 * fichiers ne peuvent donc pas se marcher dessus, et un échec laisse une base
 * inspectable au lieu d'un état mélangé.
 *
 * ── Avec ou sans la couche GraphQL ──────────────────────────────────────────
 * Par défaut, seul le NOYAU démarre : configuration, base, domaine. Construire
 * le schéma GraphQL coûte quelques secondes par fichier, et un test qui éprouve
 * une règle du domaine n'a aucune raison de les payer.
 *
 * `{ http: true }` démarre l'application complète, pour les fichiers qui
 * interrogent l'API par HTTP.
 *
 * Ce n'est pas qu'une économie : si une règle du domaine cessait d'être
 * vérifiable sans serveur GraphQL, c'est qu'elle aurait glissé dans un
 * résolveur. Le réglage par défaut est donc aussi un garde-fou.
 */
export const creerApplicationDEssai = async (
  nomBase: string,
  options: { http?: boolean } = {},
) => {
  process.env.MONGO_URI = `mongodb://localhost:27018/essai-${nomBase}?directConnection=true`;
  process.env.JWT_SECRET = 'cle-d-essai';
  process.env.NODE_ENV = 'test';

  // scrypt à 2^12 au lieu de 2^16 : 15 ms au lieu de 220 ms par mot de passe.
  //
  // La suite crée une soixantaine de comptes. Au coût de production, cela fait
  // plus de treize secondes de calcul pur dont aucun test n'éprouve la
  // solidité — et c'est ce qui avait fait passer la suite de 39 s à 244 s.
  //
  // L'empreinte porte ses propres paramètres, donc rien ne dépend de ce
  // réglage, et le coût réel reste exercé par un test dédié. Le raisonnement
  // complet est dans `src/domaine/comptes/mot-de-passe.ts`.
  process.env.SCRYPT_COUT_LOG2 = '12';

  const moduleRef = await Test.createTestingModule({
    imports: [options.http ? AppModule : NoyauModule],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();

  // `init()` déclenche `onApplicationBootstrap`, donc `syncIndexes()`.
  //
  // Sans cela, la toute première transaction du fichier de test écrirait dans
  // une collection qui n'existe pas encore, et MongoDB refuserait de la créer
  // au sein d'une transaction. L'erreur ne parlerait pas de collection
  // manquante — elle parlerait de transaction. Voir `preparation-collections.ts`.
  await app.init();

  const connexion = moduleRef.get<Connection>(getConnectionToken());

  const modele = <T>(nom: string) => moduleRef.get<Model<T>>(getModelToken(nom));

  return {
    app,
    moduleRef,
    connexion,
    modeles: {
      comptes: modele<Compte>(Compte.name),
      artisans: modele<Artisan>(Artisan.name),
      besoins: modele<Besoin>(Besoin.name),
      devis: modele<Devis>(Devis.name),
      reservations: modele<Reservation>(Reservation.name),
      avis: modele<Avis>(Avis.name),
    },
    services: {
      comptes: moduleRef.get(ComptesService),
      artisans: moduleRef.get(ArtisansService),
      besoins: moduleRef.get(BesoinsService),
      devis: moduleRef.get(DevisService),
      reservations: moduleRef.get(ReservationsService),
      avis: moduleRef.get(AvisService),
    },

    /** Vide les collections sans détruire les index — ils sont testés aussi. */
    async vider() {
      const collections = await connexion.db!.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
    },

    async fermer() {
      await connexion.dropDatabase();
      await app.close();
    },
  };
};

export type ApplicationDEssai = Awaited<ReturnType<typeof creerApplicationDEssai>>;

/** Marrakech, place Jemaa el-Fna. Sert de point de référence géographique. */
export const MARRAKECH = { latitude: 31.6258, longitude: -7.9891 };

/**
 * Compte les commandes envoyées au serveur MongoDB pendant un travail.
 *
 * C'est l'instrument qui permet de MESURER le nombre d'allers-retours au lieu
 * de l'affirmer. Il repose sur `monitorCommands: true` dans les options de
 * connexion : sans cette option, le pilote n'émet aucun événement et le
 * compteur reste à zéro — ce qui se lirait comme un excellent résultat.
 */
export const compterCommandes = async <T>(
  connexion: Connection,
  travail: () => Promise<T>,
  nomsRetenus = ['find', 'aggregate'],
): Promise<{ resultat: T; commandes: string[] }> => {
  const commandes: string[] = [];
  const client = connexion.getClient();
  const ecoute = (e: { commandName: string }) => {
    if (nomsRetenus.includes(e.commandName)) commandes.push(e.commandName);
  };

  client.on('commandStarted', ecoute);
  try {
    const resultat = await travail();
    return { resultat, commandes };
  } finally {
    client.off('commandStarted', ecoute);
  }
};

/** Fabriques de données d'essai, pour que les tests disent leur intention. */
export const fabriques = {
  async client(essai: ApplicationDEssai, email = `client-${Date.now()}@essai.ma`) {
    const { compte } = await essai.services.comptes.inscrireClient({
      email,
      motDePasse: 'mot-de-passe-assez-long',
      nom: 'Client Essai',
    });
    return compte;
  },

  async artisan(
    essai: ApplicationDEssai,
    options: {
      email?: string;
      metiers?: Metier[];
      latitude?: number;
      longitude?: number;
      rayonKm?: number;
      raisonSociale?: string;
    } = {},
  ) {
    const email = options.email ?? `artisan-${Date.now()}-${Math.random()}@essai.ma`;
    const { compte } = await essai.services.comptes.inscrireArtisan({
      email,
      motDePasse: 'mot-de-passe-assez-long',
      nom: options.raisonSociale ?? 'Artisan Essai',
      raisonSociale: options.raisonSociale ?? 'Artisan Essai SARL',
      metiers: options.metiers ?? [Metier.PLOMBERIE],
      ville: 'Marrakech',
      latitude: options.latitude ?? MARRAKECH.latitude,
      longitude: options.longitude ?? MARRAKECH.longitude,
      rayonKm: options.rayonKm ?? 25,
    });
    const profil = await essai.modeles.artisans.findOne({ compte: compte._id });
    return { compte, profil: profil! };
  },

  async besoin(essai: ApplicationDEssai, client: Types.ObjectId, metier = Metier.PLOMBERIE) {
    return essai.services.besoins.publier(
      {
        metier,
        titre: 'Fuite sous le lavabo de la cuisine',
        description: "Le siphon goutte depuis trois jours, le meuble commence à gonfler.",
        adresse: '12 rue Essai, Marrakech',
        latitude: MARRAKECH.latitude,
        longitude: MARRAKECH.longitude,
        budgetMaxCentimes: 80_000,
      },
      client,
    );
  },

  /**
   * Monte un parcours complet jusqu'à une prestation TERMINÉE — l'état
   * exact où le droit d'avis devient consommable.
   */
  async prestationTerminee(essai: ApplicationDEssai) {
    const client = await fabriques.client(essai);
    const { profil } = await fabriques.artisan(essai);
    const besoin = await fabriques.besoin(essai, client._id);

    const devis = await essai.services.devis.proposer(
      {
        besoin: besoin._id,
        montantCentimes: 45_000,
        delaiJours: 2,
        message: 'Remplacement du siphon et du joint, pièces comprises.',
      },
      profil._id,
    );

    const reservation = await essai.services.devis.accepter(devis._id, client._id, {
      debut: new Date('2026-10-10T09:00:00Z'),
      fin: new Date('2026-10-10T11:00:00Z'),
    });

    await essai.services.reservations.enregistrerPaiement(reservation._id, 'pi_essai_1');
    const terminee = await essai.services.reservations.terminer(reservation._id, profil._id);

    return { client, profil, besoin, devis, reservation: terminee };
  },
};
