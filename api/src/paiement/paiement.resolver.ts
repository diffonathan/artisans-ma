import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { Types } from 'mongoose';
import { PaiementService } from './paiement.service.js';
import { Role } from '../commun/types.js';
import { CompteConnecte, Roles } from '../commun/authentification.js';
import { versObjectId } from '../commun/identifiants.js';

@Resolver()
export class PaiementResolver {
  constructor(private readonly paiement: PaiementService) {}

  /**
   * L'artisan ouvre ses encaissements et reçoit l'adresse où fournir ses
   * pièces. Rejouable : les liens d'inscription expirent en quelques minutes.
   */
  @Roles(Role.ARTISAN)
  @Mutation(() => String, {
    description:
      "Ouvre les encaissements de l'artisan et rend l'adresse où fournir ses pièces. " +
      'Rejouable : un lien expiré se remplace sans recréer le compte.',
  })
  ouvrirEncaissements(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    return this.paiement.ouvrirEncaissements(connecte.id);
  }

  /**
   * Relit l'état chez le prestataire. Appelé au retour de l'artisan sur
   * `/mon-compte`, parce que la notification d'activation peut arriver après
   * lui — et qu'un artisan qui vient de tout remplir doit voir que c'est fait.
   */
  @Roles(Role.ARTISAN)
  @Query(() => Boolean, {
    description: "Relit l'état des encaissements chez le prestataire.",
  })
  mesEncaissementsSontActifs(@CompteConnecte() connecte: { id: Types.ObjectId }) {
    return this.paiement.rafraichirEtat(connecte.id);
  }

  /**
   * Prépare le paiement et rend le secret client.
   *
   * ── Ce que cette signature n'accepte PAS, et pourquoi ──────────────────
   * Aucun montant. Il est lu sur la réservation, qui l'a figé à l'acceptation
   * du devis. Un montant qui traverserait le navigateur reviendrait modifié :
   * c'est la faille la plus répandue des places de marché, et elle se ferme
   * en n'offrant aucun chemin plutôt qu'en contrôlant une valeur reçue.
   *
   * Le secret rendu est public par conception : il n'autorise que le paiement
   * de CETTE intention, dont le montant est déjà fixé côté serveur.
   */
  @Roles(Role.CLIENT)
  @Mutation(() => String, {
    description:
      'Prépare le paiement de la réservation et rend le secret client. ' +
      "Le montant n'est jamais transmis : il est lu sur la réservation.",
  })
  preparerPaiement(
    @Args('reservation', { type: () => ID }) reservation: string,
    @CompteConnecte() connecte: { id: Types.ObjectId },
  ) {
    return this.paiement.preparerPaiement(versObjectId(reservation, 'reservation'), connecte.id);
  }
}
