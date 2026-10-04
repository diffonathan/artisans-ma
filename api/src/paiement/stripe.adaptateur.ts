import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type {
  CompteEncaissement,
  EvenementPaiement,
  IntentionDePaiement,
  PortDePaiement,
} from './paiement.port.js';
import type { Configuration } from '../configuration/configuration.js';

/**
 * L'implémentation Stripe Connect, en comptes « Express ».
 *
 * ── Pourquoi Connect, et pas un simple encaissement ─────────────────────────
 * L'argent ne nous appartient pas. Il va de la poche du client à celle de
 * l'artisan, et la place de marché prélève une commission au passage.
 * Encaisser sur notre propre compte puis reverser à la main ferait de nous un
 * établissement de paiement, ce qui demande un agrément. Connect fait circuler
 * l'argent sans qu'il nous appartienne jamais.
 *
 * ── Le choix du « destination charge » ──────────────────────────────────────
 * Trois montages existent chez Stripe. Celui-ci encaisse sur notre compte,
 * prélève `application_fee_amount`, et transfère le reste au compte de
 * l'artisan dans la même opération.
 *
 * Ce qu'il coûte, et qu'il faut savoir dire : c'est NOUS qui apparaissons sur
 * le relevé bancaire du client, et c'est nous qui portons le risque
 * d'impayé — une contestation de carte nous est reprochée, pas à l'artisan.
 * Le montage « direct charge », où l'artisan encaisse en son nom, inverse les
 * deux. Pour une place de marché naissante, porter le risque est le prix de la
 * confiance du client, qui ne connaît pas l'artisan.
 */
@Injectable()
export class StripeAdaptateur implements PortDePaiement {
  private readonly journal = new Logger(StripeAdaptateur.name);
  private readonly stripe: Stripe;
  private readonly secretNotification: string;

  constructor(config: ConfigService<Configuration, true>) {
    const cle = config.get('STRIPE_CLE_SECRETE', { infer: true });
    if (!cle) {
      throw new Error(
        "STRIPE_CLE_SECRETE est absente. L'adaptateur Stripe ne doit pas être " +
          'instancié sans elle — voir paiement.module.ts, qui choisit le faux ' +
          'adaptateur quand la clé manque.',
      );
    }

    // La version d'API est ÉPINGLÉE. Sans cela, Stripe applique la version du
    // compte, qui change quand on clique dans leur tableau de bord — et le
    // code se met à recevoir des champs différents sans qu'aucun déploiement
    // n'ait eu lieu. Une panne sans modification est la plus coûteuse à
    // diagnostiquer.
    // La version est celle que le SDK installé attend. Le compilateur la
    // vérifie : une montée de version du paquet qui changerait l'API fait
    // échouer la compilation, et non le service en production.
    this.stripe = new Stripe(cle, { apiVersion: '2026-09-30.endive' });

    this.secretNotification = config.get('STRIPE_SECRET_NOTIFICATION', { infer: true }) ?? '';
  }

  async ouvrirCompte(options: {
    email: string;
    raisonSociale: string;
    retour: string;
    rafraichir: string;
  }): Promise<{ compte: CompteEncaissement; lien: string }> {
    const compte = await this.stripe.accounts.create({
      type: 'express',
      // Le Maroc n'est pas, à ce jour, un pays où Stripe ouvre des comptes
      // connectés. La démonstration déclare donc la France. C'est écrit ici
      // plutôt que caché : un lecteur qui connaît le dossier le verrait tout
      // de suite, et ne pas le dire décrédibiliserait le reste.
      country: 'FR',
      email: options.email,
      business_profile: { name: options.raisonSociale },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    const lien = await this.stripe.accountLinks.create({
      account: compte.id,
      // `refresh_url` est appelée si le lien a expiré — ils durent quelques
      // minutes. Sans elle, un artisan qui revient le lendemain tombe sur une
      // page morte et n'a aucun moyen de recommencer.
      refresh_url: options.rafraichir,
      return_url: options.retour,
      type: 'account_onboarding',
    });

    return { compte: this.versCompte(compte), lien: lien.url };
  }

  async lireCompte(identifiant: string): Promise<CompteEncaissement> {
    const compte = await this.stripe.accounts.retrieve(identifiant);
    return this.versCompte(compte);
  }

  async creerIntention(options: {
    reservation: string;
    montantCentimes: number;
    commissionCentimes: number;
    compteArtisan: string;
    description: string;
  }): Promise<IntentionDePaiement> {
    const intention = await this.stripe.paymentIntents.create(
      {
        amount: options.montantCentimes,
        currency: 'mad',
        description: options.description,
        application_fee_amount: options.commissionCentimes,
        transfer_data: { destination: options.compteArtisan },
        // L'identifiant de la réservation voyage dans les métadonnées, et
        // c'est par là qu'il revient dans la notification. L'alternative —
        // retrouver la réservation par le montant et la date — serait fausse
        // dès que deux réservations se ressemblent.
        metadata: { reservation: options.reservation },
        automatic_payment_methods: { enabled: true },
      },
      {
        // Clé d'idempotence : si cet appel est rejoué — un rechargement de
        // page, un nouvel essai après une coupure réseau — Stripe rend la
        // MÊME intention au lieu d'en créer une seconde. Sans elle, un client
        // qui clique deux fois se retrouve avec deux intentions pour une
        // réservation, et peut payer deux fois.
        idempotencyKey: `intention-${options.reservation}`,
      },
    );

    if (!intention.client_secret) {
      throw new ServiceUnavailableException(
        "Stripe n'a pas rendu de secret client pour cette intention.",
      );
    }

    return { identifiant: intention.id, secretClient: intention.client_secret };
  }

  verifierNotification(corpsBrut: Buffer, signature: string): EvenementPaiement {
    if (!this.secretNotification) {
      // Refuser plutôt que d'accepter sans vérifier. Le point d'entrée est
      // public par nécessité : sans signature vérifiée, n'importe qui peut
      // annoncer « paiement réussi » sur une réservation qui ne l'est pas.
      throw new ServiceUnavailableException(
        'STRIPE_SECRET_NOTIFICATION est absente : les notifications ne peuvent ' +
          'pas être vérifiées, donc elles sont refusées.',
      );
    }

    // `constructEvent` lève si la signature ne correspond pas, si l'horodatage
    // est trop ancien (rejeu), ou si le corps a été modifié d'un seul octet.
    const evenement = this.stripe.webhooks.constructEvent(
      corpsBrut,
      signature,
      this.secretNotification,
    );

    const objet = evenement.data.object as Stripe.PaymentIntent;
    return {
      type: evenement.type,
      reservation: objet.metadata?.reservation ?? null,
      intention: objet.id,
    };
  }

  /**
   * `charges_enabled` seul ne suffit pas : un compte peut accepter des
   * paiements sans pouvoir recevoir de virement, et l'argent reste alors
   * bloqué chez Stripe. Les deux sont exigés avant de laisser un artisan
   * remporter un chantier.
   */
  private versCompte(compte: Stripe.Account): CompteEncaissement {
    return {
      identifiant: compte.id,
      encaissementsActifs: Boolean(compte.charges_enabled && compte.payouts_enabled),
    };
  }
}
