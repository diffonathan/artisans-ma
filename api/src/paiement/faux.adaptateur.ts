import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CompteEncaissement,
  EvenementPaiement,
  IntentionDePaiement,
  PortDePaiement,
} from './paiement.port.js';

/**
 * Le prestataire de paiement, en faux — pour les tests et la démonstration.
 *
 * ── Ce qu'il est, et ce qu'il n'est pas ─────────────────────────────────────
 * Il IMITE le contrat, il ne simule pas Stripe. Il permet d'éprouver tout ce
 * qui relève de NOTRE code : l'idempotence, le refus d'une signature fausse,
 * le montant qui ne peut pas venir du client, le refus d'encaisser pour un
 * artisan dont les versements ne sont pas ouverts.
 *
 * Il ne dit rien de la façon dont Stripe se comporte réellement. Un faux
 * complaisant donnerait une suite verte et une fausse confiance ; celui-ci
 * est donc conçu pour ÉCHOUER là où Stripe échouerait :
 *   • une signature invalide est refusée, par un vrai calcul HMAC ;
 *   • un compte n'est pas actif à sa création — il faut l'activer, comme un
 *     artisan doit fournir ses pièces ;
 *   • une intention rejouée rend la même, comme la clé d'idempotence.
 *
 * ── Pourquoi un HMAC pour de faux ───────────────────────────────────────────
 * On aurait pu accepter toute signature non vide. Le test de la signature
 * serait alors devenu une formalité, et la seule chose qui protège un point
 * d'entrée public ne serait plus éprouvée nulle part. Le calcul est de six
 * lignes ; s'en passer aurait coûté la seule garantie de ce flux.
 */
@Injectable()
export class FauxAdaptateur implements PortDePaiement {
  private readonly journal = new Logger(FauxAdaptateur.name);

  /** Le secret du faux. Fixe et public : il ne protège rien de réel. */
  static readonly SECRET = 'faux-secret-de-demonstration';

  private readonly comptes = new Map<string, CompteEncaissement>();
  private readonly intentions = new Map<string, IntentionDePaiement>();
  private compteur = 0;

  constructor() {
    this.journal.warn(
      'Prestataire de paiement FACTICE : aucune clé Stripe. Les encaissements ' +
        'ne sont pas réels, et les montants affichés ne débitent personne.',
    );
  }

  async ouvrirCompte(options: {
    email: string;
    raisonSociale: string;
    retour: string;
    rafraichir: string;
  }): Promise<{ compte: CompteEncaissement; lien: string }> {
    this.compteur += 1;
    const identifiant = `acct_faux_${this.compteur}`;

    // INACTIF à la création, comme chez Stripe : un compte existe bien avant
    // que son titulaire ait fourni ses pièces. C'est précisément l'état que le
    // domaine doit refuser, donc le faux doit savoir le produire.
    const compte: CompteEncaissement = { identifiant, encaissementsActifs: false };
    this.comptes.set(identifiant, compte);

    // Le lien pointe vers l'URL de retour avec le compte en paramètre : la
    // démonstration peut ainsi enchaîner sans page d'inscription réelle.
    return { compte, lien: `${options.retour}?compte=${identifiant}&faux=1` };
  }

  async lireCompte(identifiant: string): Promise<CompteEncaissement> {
    return this.comptes.get(identifiant) ?? { identifiant, encaissementsActifs: false };
  }

  /** Propre au faux : ce que ferait l'artisan en fournissant ses pièces. */
  activer(identifiant: string): void {
    this.comptes.set(identifiant, { identifiant, encaissementsActifs: true });
  }

  async creerIntention(options: {
    reservation: string;
    montantCentimes: number;
    commissionCentimes: number;
    compteArtisan: string;
    description: string;
  }): Promise<IntentionDePaiement> {
    // Idempotence par la réservation, comme la clé d'idempotence de Stripe :
    // deux appels pour la même réservation rendent la même intention. Sans
    // cela, un double clic produirait deux intentions, donc deux débits
    // possibles.
    const existante = this.intentions.get(options.reservation);
    if (existante) return existante;

    const intention: IntentionDePaiement = {
      identifiant: `pi_faux_${options.reservation}`,
      secretClient: `pi_faux_${options.reservation}_secret`,
    };
    this.intentions.set(options.reservation, intention);
    return intention;
  }

  verifierNotification(corpsBrut: Buffer, signature: string): EvenementPaiement {
    const attendue = FauxAdaptateur.signer(corpsBrut);
    const fournie = Buffer.from(signature ?? '', 'utf8');
    const reference = Buffer.from(attendue, 'utf8');

    // Comparaison à temps constant, comme pour les mots de passe : un `===`
    // s'arrête au premier octet différent, et le temps de réponse renseigne
    // alors sur le nombre d'octets corrects.
    if (
      fournie.length !== reference.length ||
      !timingSafeEqual(fournie, reference)
    ) {
      throw new UnauthorizedException('Signature de notification invalide.');
    }

    const charge = JSON.parse(corpsBrut.toString('utf8')) as {
      type?: string;
      data?: { object?: { id?: string; metadata?: { reservation?: string } } };
    };

    return {
      type: charge.type ?? '',
      reservation: charge.data?.object?.metadata?.reservation ?? null,
      intention: charge.data?.object?.id ?? '',
    };
  }

  /** Signe un corps comme le ferait le prestataire. Sert aux tests. */
  static signer(corpsBrut: Buffer): string {
    return createHmac('sha256', FauxAdaptateur.SECRET).update(corpsBrut).digest('hex');
  }
}
