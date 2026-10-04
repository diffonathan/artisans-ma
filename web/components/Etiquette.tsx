/**
 * La pastille de statut, pour les trois énumérations du schéma.
 *
 * UN composant et non trois, parce que les onze valeurs de `StatutBesoin`,
 * `StatutDevis` et `StatutReservation` sont deux à deux distinctes : une
 * table unique suffit, et surtout elle rend l'incohérence VISIBLE. Trois
 * tables séparées laisseraient « ACCEPTE » vert d'un côté et accent de
 * l'autre sans que personne ne s'en aperçoive.
 *
 * ── La correspondance statut → rôle de couleur ────────────────────────────
 * Les quatre rôles de la charte, et rien d'autre. Les choix qui ne vont pas
 * de soi sont justifiés sous la table.
 */
import type { ReactNode } from 'react';
import styles from './Etiquette.module.css';

/*
 * Les trois unions reprennent `api/schema.graphql` à la lettre. Déclarées ici
 * et non importées d'un module de types : chaque agent écrit en parallèle, et
 * un fichier de types partagé serait la pire des collisions. Le typage
 * structurel de TypeScript fait que l'union d'un autre module, écrite avec les
 * mêmes littéraux, reste assignable à celles-ci — il n'y a donc rien à
 * réconcilier.
 */
export type StatutBesoin = 'OUVERT' | 'ATTRIBUE' | 'CLOS';
export type StatutDevis = 'ENVOYE' | 'ACCEPTE' | 'REFUSE' | 'RETIRE';
export type StatutReservation = 'A_PAYER' | 'PAYEE' | 'TERMINEE' | 'ANNULEE';
export type Statut = StatutBesoin | StatutDevis | StatutReservation;

/** Les rôles de couleur de la charte, et la seule palette ouverte à ce composant. */
type Role = 'neutre' | 'accent' | 'or' | 'vert' | 'rouge';

/**
 * `Record<Statut, …>` et non un objet littéral : ajouter une valeur à l'une des
 * trois énumérations de l'API sans lui donner de libellé ici devient une
 * ERREUR DE COMPILATION, au lieu d'une pastille vide en production.
 */
const TABLE: Record<Statut, { libelle: string; role: Role }> = {
  // ── Besoin ──
  OUVERT: { libelle: 'Ouvert', role: 'accent' },
  ATTRIBUE: { libelle: 'Attribué', role: 'vert' },
  CLOS: { libelle: 'Clos', role: 'neutre' },

  // ── Devis ──
  ENVOYE: { libelle: 'Envoyé', role: 'neutre' },
  ACCEPTE: { libelle: 'Accepté', role: 'vert' },
  REFUSE: { libelle: 'Refusé', role: 'rouge' },
  RETIRE: { libelle: 'Retiré', role: 'neutre' },

  // ── Réservation ──
  A_PAYER: { libelle: 'À payer', role: 'or' },
  PAYEE: { libelle: 'Payée', role: 'accent' },
  TERMINEE: { libelle: 'Terminée', role: 'vert' },
  ANNULEE: { libelle: 'Annulée', role: 'rouge' },
};

/*
 * Les quatre arbitrages qui ne se déduisent pas de la consigne :
 *
 *   OUVERT → accent, et non neutre. La charte donne à `--primary` les
 *   « éléments actifs » : un besoin ouvert est le seul état d'un chantier où
 *   quelque chose peut encore arriver, et c'est celui qui appelle un devis.
 *
 *   ATTRIBUE → vert, comme ACCEPTE. C'est la même nouvelle vue du côté du
 *   chantier plutôt que du côté du devis ; les peindre différemment ferait
 *   lire deux événements là où il n'y en a qu'un.
 *
 *   RETIRE → neutre, et non rouge. Un artisan qui retire son propre devis n'a
 *   pas été refusé. Dans la liste « mes devis », le rouge transformerait ses
 *   renoncements en série d'échecs.
 *
 *   PAYEE → accent, et non vert. Le vert dit « terminé » dans toute
 *   l'application ; une prestation payée est au contraire celle qui est EN
 *   COURS, et c'est la seule ligne du planning sur laquelle l'artisan doit se
 *   déplacer. L'or est pris par A_PAYER, où il désigne l'argent qu'on attend.
 */

export interface ProprietesEtiquette {
  statut: Statut;
  /** Pastille compacte, pour une ligne de tableau dense. */
  dense?: boolean;
  className?: string;
}

export function Etiquette({ statut, dense = false, className }: ProprietesEtiquette): ReactNode {
  const { libelle, role } = TABLE[statut];

  return (
    <span
      className={[styles.etiquette, styles[role], dense ? styles.dense : null, className]
        .filter(Boolean)
        .join(' ')}
    >
      {/* « Accepté » seul, dans un coin de carte, ne dit pas de QUOI il parle.
          Le préfixe est lu et jamais vu : il rétablit pour un lecteur d'écran
          ce que la mise en page donne à l'œil. */}
      <span className="lecture-seule">Statut&nbsp;: </span>
      {libelle}
    </span>
  );
}

/** Le libellé français d'un statut, pour un titre de page ou un `aria-label`. */
export function libelleStatut(statut: Statut): string {
  return TABLE[statut].libelle;
}
