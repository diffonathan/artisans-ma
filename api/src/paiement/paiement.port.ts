/**
 * Ce que le domaine attend d'un prestataire de paiement — et rien de plus.
 *
 * ── Pourquoi une interface plutôt que Stripe directement ────────────────────
 * Pas pour « pouvoir changer de prestataire un jour » : c'est le genre
 * d'abstraction qu'on écrit par superstition et qui ne sert jamais, parce que
 * changer de prestataire veut dire changer de modèle de données, pas changer
 * d'appels.
 *
 * La raison est qu'AUCUNE CLÉ STRIPE n'existe dans cet environnement, et
 * qu'une place de marché dont le paiement n'est testable que chez son auteur
 * n'est pas testable. Le faux adaptateur permet d'éprouver tout ce qui
 * compte — l'idempotence, la vérification de signature, le montant qui ne
 * vient jamais du client, le refus d'encaisser pour un artisan qui ne peut
 * pas être payé — sans appeler Stripe une seule fois.
 *
 * La contrepartie est écrite dans `docs/PAIEMENT.md` : ces tests prouvent que
 * NOTRE code se comporte bien. Ils ne prouvent pas que Stripe se comporte
 * comme on le croit. Seul un essai en mode test contre leur serveur le dirait,
 * et il faut une clé pour cela.
 */

/** Un compte connecté d'artisan, tel que le domaine a besoin de le connaître. */
export interface CompteEncaissement {
  /** L'identifiant chez le prestataire (chez Stripe : « acct_… »). */
  identifiant: string;

  /**
   * Le prestataire accepte-t-il d'encaisser POUR cet artisan ?
   *
   * Ce n'est pas la même chose que « le compte existe ». Un artisan peut
   * commencer son inscription et l'abandonner avant d'avoir fourni ses pièces
   * d'identité : le compte existe, et aucun encaissement n'est possible.
   * Accepter un devis dans cet état créerait une réservation qu'on ne saurait
   * ni encaisser ni reverser — un piège pour le client comme pour l'artisan.
   */
  encaissementsActifs: boolean;
}

/** L'intention de paiement, telle que l'interface doit la restituer. */
export interface IntentionDePaiement {
  identifiant: string;
  /**
   * Le jeton que le navigateur présente au prestataire pour afficher le
   * formulaire de carte. Il est public par conception : il n'autorise que le
   * paiement de CETTE intention, dont le montant est déjà figé côté serveur.
   */
  secretClient: string;
}

/** Un événement reçu du prestataire, une fois sa signature vérifiée. */
export interface EvenementPaiement {
  type: string;
  /** L'identifiant de la réservation, transporté dans les métadonnées. */
  reservation: string | null;
  intention: string;
}

export interface PortDePaiement {
  /**
   * Crée le compte d'encaissement d'un artisan et rend l'adresse où il doit
   * se rendre pour fournir ses pièces.
   */
  ouvrirCompte(options: {
    email: string;
    raisonSociale: string;
    retour: string;
    rafraichir: string;
  }): Promise<{ compte: CompteEncaissement; lien: string }>;

  /** L'état courant d'un compte, relu chez le prestataire. */
  lireCompte(identifiant: string): Promise<CompteEncaissement>;

  /**
   * Crée l'intention de paiement d'une réservation.
   *
   * ── Ce que cette signature interdit, volontairement ────────────────────
   * Elle ne prend PAS de montant. Le montant est lu sur la réservation par
   * l'appelant, et la réservation l'a figé à l'acceptation du devis.
   *
   * C'est la faille classique des places de marché : un montant qui traverse
   * le navigateur revient modifié. Ici il ne peut pas traverser, parce que
   * l'interface ne lui offre aucun chemin.
   */
  creerIntention(options: {
    reservation: string;
    montantCentimes: number;
    commissionCentimes: number;
    compteArtisan: string;
    description: string;
  }): Promise<IntentionDePaiement>;

  /**
   * Vérifie la signature d'une notification et rend l'événement.
   *
   * Prend le corps BRUT, en octets. Un corps déjà analysé puis ré-encodé n'a
   * plus la même suite d'octets — ordre des clés, espaces, échappements — et
   * la signature ne correspond plus. Voir `paiement.controleur.ts`.
   *
   * Lève si la signature est invalide. Sans ce contrôle, n'importe qui peut
   * annoncer « paiement réussi » sur une réservation qui ne l'est pas : le
   * point d'entrée est public par nécessité.
   */
  verifierNotification(corpsBrut: Buffer, signature: string): EvenementPaiement;
}

/** Jeton d'injection : NestJS ne peut pas injecter une interface TypeScript. */
export const PORT_DE_PAIEMENT = Symbol('PortDePaiement');
