import {
  Args,
  Context,
  ID,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { ForbiddenException } from '@nestjs/common';
import type { Types } from 'mongoose';
import { Reservation } from './reservation.schema.js';
import { ReservationsService } from './reservations.service.js';
import { Artisan } from '../artisans/artisan.schema.js';
import { Besoin } from '../besoins/besoin.schema.js';
import { Compte } from '../comptes/compte.schema.js';
import { Role } from '../../commun/types.js';
import { CompteConnecte, Roles } from '../../commun/authentification.js';
import { versObjectId } from '../../commun/identifiants.js';
import { ComptesService } from '../comptes/comptes.service.js';
import type { ContexteGraphQL } from '../../commun/chargeurs.js';

@Resolver(() => Reservation)
export class ReservationsResolver {
  constructor(
    private readonly reservations: ReservationsService,
    private readonly comptes: ComptesService,
  ) {}

  @Roles(Role.CLIENT)
  @Query(() => [Reservation])
  mesReservations(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    return this.reservations.deClient(connecte.id);
  }

  @Roles(Role.ARTISAN)
  @Query(() => [Reservation], { description: 'Mon planning, par créneau croissant.' })
  async monPlanning(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    const profil = await this.comptes.artisanDuCompte(connecte.id);
    if (!profil) return [];
    return this.reservations.dArtisan(profil._id);
  }

  /**
   * Enregistre un paiement.
   *
   * ── Pourquoi cette mutation n'existerait pas en production ──────────────
   * Le passage à PAYEE est déclenché, dans une vraie exploitation, par la
   * notification du prestataire de paiement — une requête signée, reçue sur
   * un point d'entrée dédié, et vérifiée avant d'être crue. Pas par le client,
   * qui n'a aucune raison d'être cru sur ce point.
   *
   * Elle est exposée ici pour que le parcours soit jouable de bout en bout
   * sans clé de paiement, et le dire fait partie du travail : une démo qui
   * laisse croire que le client déclare lui-même ses paiements est une démo
   * trompeuse.
   */
  @Roles(Role.CLIENT)
  @Mutation(() => Reservation, {
    description:
      'Marque la réservation comme payée. Rejouable sans effet : la seconde fois ne change rien. ' +
      "En production, cette bascule viendrait de la notification signée du prestataire, pas du client.",
  })
  async payerReservation(
    @Args('id', { type: () => ID }) id: string,
    @Args('referencePaiement') referencePaiement: string,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    const reservations = await this.reservations.deClient(connecte.id);
    const cible = versObjectId(id);
    if (!reservations.some((r) => String(r._id) === String(cible))) {
      throw new ForbiddenException("Cette réservation ne vous appartient pas.");
    }
    return this.reservations.enregistrerPaiement(cible, referencePaiement);
  }

  @Roles(Role.ARTISAN)
  @Mutation(() => Reservation, {
    description: "Déclare la prestation terminée — c'est ce qui ouvre le droit d'avis.",
  })
  async terminerPrestation(
    @Args('id', { type: () => ID }) id: string,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    const profil = await this.comptes.artisanDuCompte(connecte.id);
    if (!profil) throw new ForbiddenException("Votre compte n'a pas de profil artisan.");
    return this.reservations.terminer(versObjectId(id), profil._id);
  }

  @Roles(Role.CLIENT)
  @Mutation(() => Reservation)
  annulerReservation(
    @Args('id', { type: () => ID }) id: string,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    return this.reservations.annuler(versObjectId(id), connecte.id);
  }

  @ResolveField(() => Artisan, { nullable: true })
  prestataire(@Parent() reservation: Reservation, @Context() ctx: ContexteGraphQL) {
    return ctx.chargeurs.artisan.load(reservation.artisan);
  }

  /**
   * Le chantier concerné.
   *
   * Sans lui, le client lisait « 450,00 DH, le 8 octobre, Plomberie
   * Ouazzani » sans savoir de quelle intervention il s'agissait. La liste
   * était juste et illisible.
   */
  @ResolveField(() => Besoin, { nullable: true })
  chantier(@Parent() reservation: Reservation, @Context() ctx: ContexteGraphQL) {
    return ctx.chargeurs.besoin.load(reservation.besoin);
  }

  /**
   * Le client, avec ses coordonnées.
   *
   * Aucune garde ici, et ce n'est pas un oubli : toute réservation qu'un
   * lecteur peut atteindre est une réservation dont il est partie.
   * `mesReservations` filtre sur son compte, `monPlanning` sur son profil, et
   * chaque mutation ne rend que la réservation qu'elle vient de toucher.
   * Aucun chemin ne mène à la réservation d'un tiers.
   *
   * La garantie vient donc de la forme du schéma, pas d'un contrôle. Si une
   * requête rendant des réservations à quelqu'un qui n'en est pas partie
   * apparaissait un jour, c'est ELLE qu'il faudrait garder — et le test
   * `confidentialite.spec.ts` est là pour le rappeler.
   */
  @ResolveField(() => Compte, { nullable: true })
  demandeur(@Parent() reservation: Reservation, @Context() ctx: ContexteGraphQL) {
    return ctx.chargeurs.compte.load(reservation.client);
  }
}
