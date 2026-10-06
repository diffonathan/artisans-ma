import { NestFactory } from '@nestjs/core';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import { AppModule } from '../app.module.js';
import { ComptesService } from '../domaine/comptes/comptes.service.js';
import { BesoinsService } from '../domaine/besoins/besoins.service.js';
import { DevisService } from '../domaine/devis/devis.service.js';
import { ReservationsService } from '../domaine/reservations/reservations.service.js';
import { AvisService } from '../domaine/avis/avis.service.js';
import { Metier } from '../commun/types.js';

/**
 * Remplit la base d'un jeu de données jouable.
 *
 * ── Deux règles tenues ici ──────────────────────────────────────────────────
 *
 * 1. TOUT passe par les services du domaine. Rien n'est inséré directement en
 *    base. Un jeu de données écrit à la main produit des états que l'API ne
 *    sait pas produire — une réservation sans devis accepté, un avis sans
 *    droit consommé — et l'on finit par déboguer des situations impossibles.
 *    Semer par les services, c'est aussi éprouver le parcours complet.
 *
 * 2. Les coordonnées sont réelles. Marrakech, Casablanca, Agadir, Essaouira,
 *    Tahannaout : les distances que la recherche calcule sont donc
 *    vérifiables sur une carte. Des coordonnées inventées rendraient la
 *    recherche géographique impossible à juger à l'œil.
 *
 * Lancer : npm run semer
 */

const VILLES = {
  marrakech: { latitude: 31.6258, longitude: -7.9891 },
  tahannaout: { latitude: 31.3556, longitude: -7.9511 },
  essaouira: { latitude: 31.5085, longitude: -9.7595 },
  casablanca: { latitude: 33.5731, longitude: -7.5898 },
  agadir: { latitude: 30.4278, longitude: -9.5981 },
};

const MOT_DE_PASSE = 'demonstration-2026';

const ARTISANS = [
  {
    email: 'karim.plomberie@exemple.ma',
    nom: 'Karim Ouazzani',
    raisonSociale: 'Plomberie Ouazzani',
    metiers: [Metier.PLOMBERIE, Metier.CLIMATISATION],
    ville: 'Marrakech',
    position: VILLES.marrakech,
    rayonKm: 30,
    verifie: true,
  },
  {
    email: 'said.electricite@exemple.ma',
    nom: 'Saïd Benali',
    raisonSociale: 'Benali Électricité',
    metiers: [Metier.ELECTRICITE],
    ville: 'Marrakech',
    position: VILLES.marrakech,
    rayonKm: 25,
    verifie: true,
  },
  {
    email: 'atelier.bois@exemple.ma',
    nom: 'Mohamed Tazi',
    raisonSociale: 'Atelier du Bois',
    metiers: [Metier.MENUISERIE, Metier.CARRELAGE],
    ville: 'Tahannaout',
    position: VILLES.tahannaout,
    // Rayon volontairement court : il ne couvre PAS Marrakech, à 30 km. Sert
    // à voir l'effet du rayon propre à chaque artisan dans la recherche.
    rayonKm: 10,
    verifie: false,
  },
  {
    email: 'peinture.atlantique@exemple.ma',
    nom: 'Youssef Idrissi',
    raisonSociale: 'Peinture Atlantique',
    metiers: [Metier.PEINTURE],
    ville: 'Essaouira',
    position: VILLES.essaouira,
    // Rayon volontairement long : couvre Marrakech malgré 170 km.
    rayonKm: 200,
    verifie: true,
  },
  {
    email: 'maconnerie.sud@exemple.ma',
    nom: 'Hassan Chraibi',
    raisonSociale: 'Maçonnerie du Sud',
    metiers: [Metier.MACONNERIE, Metier.CARRELAGE],
    ville: 'Agadir',
    position: VILLES.agadir,
    rayonKm: 60,
    verifie: true,
  },
  {
    email: 'serrurier.express@exemple.ma',
    nom: 'Rachid Alaoui',
    raisonSociale: 'Serrurier Express',
    metiers: [Metier.SERRURERIE],
    ville: 'Casablanca',
    position: VILLES.casablanca,
    rayonKm: 40,
    verifie: false,
  },
];

const semer = async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const connexion = app.get<Connection>(getConnectionToken());

  const comptes = app.get(ComptesService);
  const besoins = app.get(BesoinsService);
  const devis = app.get(DevisService);
  const reservations = app.get(ReservationsService);
  const avis = app.get(AvisService);


  // ── `--si-vide` : semer seulement une base neuve ─────────────────────────
  //
  // Le semis VIDE la base avant de la remplir. Lancé à chaque démarrage, il
  // réinitialiserait la démonstration à chaque réveil du conteneur — c'est-à-
  // dire à chaque visite après quinze minutes de calme — et effacerait le
  // parcours d'un visiteur sous ses yeux.
  //
  // D'où ce mode, qui est celui du déploiement : on sème si la base est
  // neuve, on ne touche à rien sinon. Il remplace un réglage qu'il fallait
  // mettre à 1 pour la première mise en ligne puis remettre à 0 — trois
  // passages au tableau de bord, et une démonstration vide le jour où l'on
  // oubliait le premier.
  //
  // Le test porte sur les COMPTES et non sur l'existence de collections :
  // Mongoose les crée vides au démarrage en synchronisant les index, donc
  // « il existe des collections » ne veut pas dire « il y a des données ».
  // C'est le piège de cette vérification, et il est silencieux.
  if (process.argv.includes('--si-vide')) {
    const dejaLa = await connexion
      .db!.collection('comptes')
      .countDocuments({}, { limit: 1 });
    if (dejaLa > 0) {
      console.log('Base déjà peuplée : rien à semer, et surtout rien à effacer.');
      await app.close();
      return;
    }
    console.log('Base neuve : semis.');
  }

  // On repart de zéro à chaque exécution, pour que la commande soit
  // rejouable. Sinon la seconde exécution échoue sur les adresses en double,
  // et l'on ne sait plus quel état on a sous les yeux.
  console.log(`\nBase : ${connexion.name}`);
  for (const collection of await connexion.db!.collections()) {
    await collection.deleteMany({});
  }
  console.log('Collections vidées.');

  // ── Les artisans ─────────────────────────────────────────────────────────
  const profils = new Map<string, { _id: import('mongoose').Types.ObjectId }>();
  for (const a of ARTISANS) {
    const { compte } = await comptes.inscrireArtisan({
      email: a.email,
      motDePasse: MOT_DE_PASSE,
      nom: a.nom,
      raisonSociale: a.raisonSociale,
      metiers: a.metiers,
      ville: a.ville,
      latitude: a.position.latitude,
      longitude: a.position.longitude,
      rayonKm: a.rayonKm,
    });
    const profil = (await comptes.artisanDuCompte(compte._id))!;
    profils.set(a.email, profil);

    if (a.verifie) {
      await connexion
        .collection('artisans')
        .updateOne({ _id: profil._id }, { $set: { verifie: true } });
    }
  }
  console.log(`${ARTISANS.length} artisans inscrits.`);

  // ── Les clients ──────────────────────────────────────────────────────────
  const clients = [];
  for (const [email, nom] of [
    ['fatima.benjelloun@exemple.ma', 'Fatima Benjelloun'],
    ['omar.sefrioui@exemple.ma', 'Omar Sefrioui'],
    ['leila.amrani@exemple.ma', 'Leïla Amrani'],
  ]) {
    const { compte } = await comptes.inscrireClient({
      email,
      motDePasse: MOT_DE_PASSE,
      nom,
      telephone: '+212 6 00 00 00 00',
    });
    clients.push(compte);
  }
  console.log(`${clients.length} clients inscrits.`);

  // ── Un parcours COMPLET, jusqu'à l'avis ──────────────────────────────────
  const besoinTermine = await besoins.publier(
    {
      metier: Metier.PLOMBERIE,
      titre: 'Chauffe-eau à remplacer',
      description:
        "Le chauffe-eau de 80 litres ne monte plus en température. Installation d'origine, " +
        'accès par la terrasse. Devis pour fourniture et pose.',
      adresse: 'Quartier Guéliz, Marrakech',
      latitude: VILLES.marrakech.latitude,
      longitude: VILLES.marrakech.longitude,
      budgetMaxCentimes: 450_000,
    },
    clients[0]._id,
  );

  const devisRetenu = await devis.proposer(
    {
      besoin: besoinTermine._id,
      montantCentimes: 380_000,
      delaiJours: 3,
      message:
        'Chauffe-eau 80 L de marque, pose comprise, évacuation de l’ancien. Garantie 2 ans.',
    },
    profils.get('karim.plomberie@exemple.ma')!._id,
  );

  // Un concurrent, pour que le refus automatique soit visible.
  await devis.proposer(
    {
      besoin: besoinTermine._id,
      montantCentimes: 420_000,
      delaiJours: 1,
      message: 'Intervention le jour même, modèle supérieur, garantie 3 ans.',
    },
    profils.get('said.electricite@exemple.ma')!._id,
  );

  const reservation = await devis.accepter(devisRetenu._id, clients[0]._id, {
    debut: new Date('2026-10-08T09:00:00Z'),
    fin: new Date('2026-10-08T13:00:00Z'),
  });
  await reservations.enregistrerPaiement(reservation._id, 'pi_demonstration_1');
  await reservations.terminer(reservation._id, profils.get('karim.plomberie@exemple.ma')!._id);
  await avis.deposer(
    {
      reservation: reservation._id,
      note: 5,
      commentaire:
        'Arrivé à l’heure, a protégé le sol, a emporté l’ancien chauffe-eau. Devis respecté au dirham.',
    },
    clients[0]._id,
  );
  console.log('1 parcours complet : besoin → 2 devis → réservation → paiement → avis.');

  // ── Un besoin avec des devis en attente ──────────────────────────────────
  const besoinEnCours = await besoins.publier(
    {
      metier: Metier.ELECTRICITE,
      titre: 'Tableau électrique à mettre aux normes',
      description:
        'Appartement de 1998, tableau d’origine sans différentiel. Trois disjoncteurs sautent ' +
        'régulièrement. Souhaite un diagnostic puis une remise aux normes.',
      adresse: 'Avenue Mohammed V, Marrakech',
      latitude: VILLES.marrakech.latitude,
      longitude: VILLES.marrakech.longitude,
      budgetMaxCentimes: 900_000,
    },
    clients[1]._id,
  );
  await devis.proposer(
    {
      besoin: besoinEnCours._id,
      montantCentimes: 750_000,
      delaiJours: 5,
      message: 'Diagnostic inclus, tableau 2 rangées, 4 différentiels, mise à la terre vérifiée.',
    },
    profils.get('said.electricite@exemple.ma')!._id,
  );

  // ── Des besoins ouverts, sans devis ──────────────────────────────────────
  await besoins.publier(
    {
      metier: Metier.MENUISERIE,
      titre: 'Placard sur mesure dans une chambre',
      description:
        'Niche de 2,40 m de large sur 2,70 m de haut. Souhaite des portes coulissantes et ' +
        'une penderie sur la moitié gauche.',
      adresse: 'Quartier Hivernage, Marrakech',
      latitude: VILLES.marrakech.latitude,
      longitude: VILLES.marrakech.longitude,
      budgetMaxCentimes: 1_200_000,
    },
    clients[2]._id,
  );
  await besoins.publier(
    {
      metier: Metier.PEINTURE,
      titre: 'Repeindre un salon et un couloir',
      description:
        'Environ 55 m² de murs, plafond compris. Peinture mate blanche, deux couches. ' +
        'Les meubles peuvent être déplacés au centre de la pièce.',
      adresse: 'Route de Casablanca, Marrakech',
      latitude: VILLES.marrakech.latitude,
      longitude: VILLES.marrakech.longitude,
      budgetMaxCentimes: 600_000,
    },
    clients[2]._id,
  );

  console.log('2 besoins ouverts, 1 besoin avec un devis en attente.\n');
  console.log('Comptes de démonstration — mot de passe commun :', MOT_DE_PASSE);
  console.log('  client  : fatima.benjelloun@exemple.ma  (a un avis déposé)');
  console.log('  client  : leila.amrani@exemple.ma       (2 besoins ouverts)');
  console.log('  artisan : karim.plomberie@exemple.ma    (noté 5/5)');
  console.log('  artisan : said.electricite@exemple.ma   (1 devis en attente)\n');

  await app.close();
};

await semer();
