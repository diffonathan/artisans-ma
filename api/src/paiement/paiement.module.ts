import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomaineModule } from '../domaine/domaine.module.js';
import { PORT_DE_PAIEMENT } from './paiement.port.js';
import { StripeAdaptateur } from './stripe.adaptateur.js';
import { FauxAdaptateur } from './faux.adaptateur.js';
import { PaiementService } from './paiement.service.js';
import { PaiementControleur } from './paiement.controleur.js';
import { PaiementResolver } from './paiement.resolver.js';
import type { Configuration } from '../configuration/configuration.js';

/**
 * Le paiement, et le choix du prestataire au démarrage.
 *
 * ── Pourquoi le faux n'est pas réservé aux tests ────────────────────────────
 * Sans clé Stripe, l'application démarre avec le prestataire factice et le
 * parcours reste jouable de bout en bout. C'est ce qui permet à quiconque
 * clone le dépôt de voir fonctionner la place de marché sans ouvrir un compte
 * chez un prestataire de paiement.
 *
 * Le danger est évident : une clé oubliée en production passerait inaperçue,
 * et l'application encaisserait pour de faux en silence. Deux garde-fous :
 *   • un avertissement au démarrage, qui nomme la variable manquante ;
 *   • l'interface DIT à l'écran que les paiements ne sont pas réels — le dire
 *     dans un journal que personne ne lit ne suffirait pas.
 *
 * Refuser de démarrer sans clé serait l'autre choix défendable. Il rendrait la
 * démonstration impossible sans compte Stripe, ce qui est précisément ce
 * qu'on cherche à éviter ici.
 */
@Module({
  imports: [DomaineModule],
  controllers: [PaiementControleur],
  providers: [
    {
      provide: PORT_DE_PAIEMENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Configuration, true>) => {
        const cle = config.get('STRIPE_CLE_SECRETE', { infer: true });
        const journal = new Logger('Paiement');

        if (!cle) {
          journal.warn(
            'STRIPE_CLE_SECRETE absente : prestataire FACTICE. Les paiements ne ' +
              'sont pas réels. Pour de vrais encaissements, renseigner ' +
              'STRIPE_CLE_SECRETE et STRIPE_SECRET_NOTIFICATION.',
          );
          return new FauxAdaptateur();
        }

        if (!config.get('STRIPE_SECRET_NOTIFICATION', { infer: true })) {
          // On démarre quand même, mais en le disant fort : sans ce secret,
          // les notifications seront refusées, donc aucune réservation ne
          // passera jamais à PAYEE. Le symptôme — « les paiements aboutissent
          // chez Stripe mais rien ne bouge chez nous » — est très coûteux à
          // diagnostiquer si rien ne l'a annoncé.
          journal.error(
            'STRIPE_CLE_SECRETE est posée mais STRIPE_SECRET_NOTIFICATION ne ' +
              "l'est pas. Les notifications seront REFUSÉES, et aucune " +
              'réservation ne passera à PAYEE.',
          );
        }

        journal.log('Prestataire de paiement : Stripe.');
        return new StripeAdaptateur(config);
      },
    },
    PaiementService,
    PaiementResolver,
  ],
  exports: [PORT_DE_PAIEMENT, PaiementService],
})
export class PaiementModule {}
