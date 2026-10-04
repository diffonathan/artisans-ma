/**
 * Un montant en dirhams, à partir des CENTIMES rendus par l'API.
 *
 * ── Pourquoi l'argent n'est jamais un flottant ─────────────────────────────
 * L'API stocke `montantCentimes: Int!`, et ce composant ne divise jamais pour
 * calculer : il sépare la partie entière du reste par une division ENTIÈRE.
 * `45000 / 100` donnerait 450 juste, mais `1234 / 100` donne 12.34 dont
 * l'écriture binaire est approchée — et `(0.1 + 0.2) * 100` vaut 30.000000000000004.
 * Sur une facture, une commission arrondie deux fois dans deux composants
 * différents produit deux totaux qui ne se recollent pas, et c'est le genre de
 * défaut qu'on ne trouve qu'au centième devis. Les centimes restent entiers
 * jusqu'au dernier instant : le point décimal n'apparaît qu'en TEXTE.
 */
import type { ReactNode } from 'react';
import styles from './Montant.module.css';

export type TailleMontant = 'normal' | 'grand';

export interface ProprietesMontant {
  /** Montant en centimes, tel que l'API le rend (`montantCentimes`). */
  centimes: number;
  /** `grand` pour le montant vedette d'un devis ; `normal` partout ailleurs. */
  taille?: TailleMontant;
  /** Préfixe l'écriture d'un `+` quand le montant est positif (gain, commission perçue). */
  signeExplicite?: boolean;
  className?: string;
}

/**
 * Groupe les milliers par espace fine insécable, à la main.
 *
 * `toLocaleString('fr-MA')` serait plus court et c'est précisément le piège :
 * le séparateur de groupe qu'il choisit dépend de l'ICU DISPONIBLE. Node sans
 * icu complet rend U+00A0, un navigateur rend U+202F — deux chaînes
 * différentes pour le même nombre, donc une erreur d'hydratation sur un
 * composant rendu côté serveur puis réconcilié côté client. Le séparateur est
 * donc écrit ici, explicitement.
 */
function grouperMilliers(entier: string): string {
  const ESPACE_FINE_INSECABLE = ' ';
  let resultat = '';
  for (let i = 0; i < entier.length; i += 1) {
    // Un séparateur tous les trois chiffres, en partant de la DROITE.
    if (i > 0 && (entier.length - i) % 3 === 0) resultat += ESPACE_FINE_INSECABLE;
    resultat += entier[i];
  }
  return resultat;
}

/** Rend `45000` → `450,00` (sans l'unité, qui n'est pas en Azeret Mono). */
export function formaterCentimes(centimes: number): string {
  // Math.trunc et non Math.round : un centime fractionnaire n'existe pas, et
  // s'il arrivait quand même il viendrait d'un bogue en amont qu'un arrondi
  // silencieux masquerait.
  const absolu = Math.abs(Math.trunc(centimes));
  const dirhams = Math.floor(absolu / 100);
  const centiemes = absolu % 100;
  const signe = centimes < 0 ? '−' : ''; // U+2212, le vrai signe moins.
  return `${signe}${grouperMilliers(String(dirhams))},${String(centiemes).padStart(2, '0')}`;
}

export function Montant({
  centimes,
  taille = 'normal',
  signeExplicite = false,
  className,
}: ProprietesMontant): ReactNode {
  const chiffres = formaterCentimes(centimes);
  const prefixe = signeExplicite && centimes > 0 ? '+' : '';

  return (
    /*
     * La classe globale `.montant` est posée sur l'ENVELOPPE, qui tient donc à
     * la fois la police des nombres et la couleur --or (rôle « valeur » de la
     * charte). L'unité, elle, remet la police du texte : la charte réserve
     * Azeret Mono aux nombres, et « DH » n'en est pas un. La couleur, elle,
     * reste héritée — on ne la réécrit pas par-dessus `.montant`.
     */
    <span className={['montant', styles.montant, styles[taille], className].filter(Boolean).join(' ')}>
      {prefixe}
      {chiffres}
      {/* Espace fine insécable : le nombre et son unité ne se séparent pas en
          bout de ligne, et l'espace reste plus serrée qu'un mot. */}
      <span className={styles.unite}>&#x202f;DH</span>
    </span>
  );
}
