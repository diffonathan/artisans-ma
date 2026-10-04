import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../commun/authentification.js';
import { PORT_DE_PAIEMENT, type PortDePaiement } from './paiement.port.js';
import { PaiementService } from './paiement.service.js';

/**
 * Le point d'entrée des notifications du prestataire de paiement.
 *
 * ══ POURQUOI UNE ROUTE REST, DANS UN PROJET TOUT EN GRAPHQL ════════════════
 *
 * Parce que ce n'est pas nous qui appelons. Stripe envoie une requête POST
 * avec un corps JSON de SA forme, et il n'a aucune idée de ce qu'est GraphQL.
 * Exposer ce point d'entrée en mutation GraphQL obligerait à lui demander de
 * parler notre langage, ce qu'il ne fera pas.
 *
 * ══ LE PIÈGE DU CORPS BRUT ═════════════════════════════════════════════════
 *
 * La signature est calculée sur les OCTETS EXACTS du corps. NestJS, comme
 * tout serveur Express, analyse le JSON par défaut : à ce moment-là, la suite
 * d'octets d'origine est perdue. La ré-encoder avec `JSON.stringify` ne la
 * retrouve pas — l'ordre des clés, les espaces, les échappements Unicode, la
 * notation des nombres : tout peut différer, et un seul octet d'écart fait
 * échouer la vérification.
 *
 * Le symptôme est cruel : la signature échoue TOUJOURS, le code paraît juste,
 * et l'on cherche la faute dans le secret ou l'horloge. D'où `rawBody: true`
 * à la création de l'application (`main.ts`) et la lecture de `req.rawBody`
 * ici — jamais de `@Body()`.
 *
 * ══ POURQUOI IL RÉPOND 200 À PRESQUE TOUT ══════════════════════════════════
 *
 * Un prestataire de paiement RÉESSAIE quand il reçoit autre chose qu'un 2xx,
 * pendant des heures, puis désactive le point d'entrée. Répondre en erreur
 * pour un événement qu'on ne sait pas traiter — un type qui ne nous concerne
 * pas, une réservation supprimée — ferait donc réessayer indéfiniment une
 * notification qui ne réussira jamais, et finirait par couper le flux des
 * notifications qui, elles, comptent.
 *
 * Les deux seuls refus sont ceux où la requête n'est pas légitime : signature
 * absente ou invalide. Tout le reste est accusé réception, et journalisé.
 */
@Controller('paiement')
export class PaiementControleur {
  private readonly journal = new Logger(PaiementControleur.name);

  constructor(
    @Inject(PORT_DE_PAIEMENT) private readonly prestataire: PortDePaiement,
    private readonly paiement: PaiementService,
  ) {}

  @Public()
  @Post('notification')
  @HttpCode(200)
  async notification(
    @Req() requete: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ recu: boolean; raison: string }> {
    const corpsBrut = requete.rawBody;

    if (!corpsBrut) {
      // Message explicite : c'est une erreur de CONFIGURATION du serveur, pas
      // une requête malformée, et la distinction fait gagner une heure.
      throw new BadRequestException(
        "Corps brut absent. L'application doit être créée avec « rawBody: true » " +
          '— voir main.ts.',
      );
    }

    if (!signature) {
      throw new UnauthorizedException('En-tête de signature absent.');
    }

    let evenement;
    try {
      evenement = this.prestataire.verifierNotification(corpsBrut, signature);
    } catch (erreur) {
      // On ne recopie PAS le message du prestataire dans la réponse : il peut
      // décrire ce qui manque dans la signature, ce qui aide celui qui essaie
      // d'en forger une. Il part dans les journaux, où il sert au diagnostic.
      this.journal.warn(
        `Notification refusée : ${(erreur as Error).message}`,
      );
      throw new UnauthorizedException('Signature invalide.');
    }

    const resultat = await this.paiement.traiterNotification(evenement);
    this.journal.log(
      `Notification ${evenement.type} (${evenement.intention}) : ${resultat.raison}`,
    );
    return { recu: true, raison: resultat.raison };
  }
}
