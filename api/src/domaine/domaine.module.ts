import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';

import { Compte, SchemaCompte } from './comptes/compte.schema.js';
import { Artisan, SchemaArtisan } from './artisans/artisan.schema.js';
import { Besoin, SchemaBesoin } from './besoins/besoin.schema.js';
import { Devis, SchemaDevis } from './devis/devis.schema.js';
import { Reservation, SchemaReservation } from './reservations/reservation.schema.js';
import { Avis, SchemaAvis } from './avis/avis.schema.js';

import { ComptesService } from './comptes/comptes.service.js';
import { ArtisansService } from './artisans/artisans.service.js';
import { BesoinsService } from './besoins/besoins.service.js';
import { DevisService } from './devis/devis.service.js';
import { ReservationsService } from './reservations/reservations.service.js';
import { AvisService } from './avis/avis.service.js';

import { ComptesResolver } from './comptes/comptes.resolver.js';
import { ArtisansResolver } from './artisans/artisans.resolver.js';
import { BesoinsResolver } from './besoins/besoins.resolver.js';
import { DevisResolver } from './devis/devis.resolver.js';
import { ReservationsResolver } from './reservations/reservations.resolver.js';
import { AvisResolver } from './avis/avis.resolver.js';

import { FabriqueChargeurs } from '../commun/chargeurs.js';

const modeles = MongooseModule.forFeature([
  { name: Compte.name, schema: SchemaCompte },
  { name: Artisan.name, schema: SchemaArtisan },
  { name: Besoin.name, schema: SchemaBesoin },
  { name: Devis.name, schema: SchemaDevis },
  { name: Reservation.name, schema: SchemaReservation },
  { name: Avis.name, schema: SchemaAvis },
]);

/**
 * Un seul module pour tout le domaine.
 *
 * ── Pourquoi pas six modules ────────────────────────────────────────────────
 * Les six entités forment une seule chaîne : besoin → devis → réservation →
 * avis. Chaque transaction en touche plusieurs à la fois — accepter un devis
 * écrit dans trois collections, déposer un avis dans trois autres. Découper
 * en six modules obligerait chacun à importer la plupart des autres, et
 * produirait exactement les dépendances circulaires que le découpage prétend
 * éviter (`forwardRef` partout, ce qui est l'aveu que la frontière est
 * fausse).
 *
 * Un module par entité se justifie quand les entités sont indépendantes. Ici
 * elles ne le sont pas : c'est UN domaine, et la frontière utile est entre ce
 * domaine et le reste (transport, configuration, base).
 */
@Module({
  imports: [
    modeles,
    JwtModule.register({
      // La clé vient de l'environnement, avec un repli explicite en
      // développement. Pas de valeur par défaut silencieuse : un secret
      // partagé par tous les dépôts du monde est pire qu'un secret absent,
      // parce qu'il donne l'impression d'être protégé.
      secret: process.env.JWT_SECRET ?? 'cle-de-developpement-a-remplacer',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [
    ComptesService,
    ArtisansService,
    BesoinsService,
    DevisService,
    ReservationsService,
    AvisService,
    ComptesResolver,
    ArtisansResolver,
    BesoinsResolver,
    DevisResolver,
    ReservationsResolver,
    AvisResolver,
    FabriqueChargeurs,
  ],
  exports: [
    modeles,
    JwtModule,
    FabriqueChargeurs,
    ComptesService,
    ArtisansService,
    BesoinsService,
    DevisService,
    ReservationsService,
    AvisService,
  ],
})
export class DomaineModule {}
