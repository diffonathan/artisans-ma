/**
 * Les barres grises qui tiennent la place d'une liste pendant que l'API
 * répond.
 *
 * ── Pourquoi cette primitive existe ───────────────────────────────────────
 * Six écrans de liste en avaient besoin, et six l'ont écrite : `app/recherche`,
 * `app/mes-besoins`, `app/mes-reservations`, `app/chantiers`, `app/mes-devis`,
 * `app/mon-planning`, plus `SqueletteReperes` dans `app/mon-compte`. Trois
 * agents ont signalé le manque dans leur compte rendu. Les sept copies
 * différaient déjà sur deux points visibles — l'une pulsait, l'autre non — et
 * sur la hauteur des barres.
 *
 * ── L'animation, et pourquoi elle est là ──────────────────────────────────
 * Un squelette immobile se lit comme du contenu cassé ; un squelette qui
 * respire se lit comme une attente. La pulsation porte sur l'OPACITÉ et non
 * sur un balayage de dégradé : moins de peinture, et la règle globale de
 * `globals.css` la réduit à 1 ms sous `prefers-reduced-motion` sans qu'il y
 * ait deux apparences à écrire.
 *
 * ── Le rôle ARIA ──────────────────────────────────────────────────────────
 * `role="status"` sur le conteneur, et `aria-hidden` sur les barres : un
 * lecteur d'écran entend « Chargement… » une fois, au lieu d'énumérer dix-huit
 * rectangles vides. Le texte est en `.lecture-seule` (globals.css) et non
 * `aria-label` : un libellé posé sur un conteneur de contenu n'est pas annoncé
 * de la même façon selon le lecteur.
 */
import type { ReactNode } from 'react';
import { Carte } from './Carte';
import styles from './Squelette.module.css';

export type DispositionSquelette = 'colonne' | 'grille';

export interface ProprietesSquelette {
  /** Combien de cartes. Trois par défaut : assez pour montrer qu'il y en aura plusieurs. */
  cartes?: number;
  /** Combien de barres par carte. Trois par défaut : un titre et deux lignes. */
  lignes?: number;
  /**
   * 'colonne' — des cartes pleine largeur, l'une sous l'autre : une liste de
   * chantiers, de devis, de réservations.
   * 'grille' — des cartes côte à côte : les résultats de la recherche.
   */
  disposition?: DispositionSquelette;
  /** Ce qu'un lecteur d'écran entend. « Chargement… » par défaut. */
  annonce?: string;
  /**
   * Ajoute la place d'un titre et d'un chapeau au-dessus des cartes.
   *
   * C'est ce dont les `loading.tsx` ont besoin, et eux seuls : ils remplacent
   * la page ENTIÈRE, en-tête de section comprise. Une frontière `<Suspense>`
   * posée à l'intérieur d'une page, elle, n'attend que la liste — son titre
   * est déjà à l'écran, et en remettre un second serait un doublon visible.
   */
  enTete?: boolean;
  className?: string;
}

/** Les largeurs des barres, en boucle. Inégales, sinon le bloc se lit comme un tableau. */
const LARGEURS = ['70%', '85%', '45%', '60%'] as const;

export function Squelette({
  cartes = 3,
  lignes = 3,
  disposition = 'colonne',
  annonce = 'Chargement…',
  enTete = false,
  className,
}: ProprietesSquelette): ReactNode {
  const grille = (
    <div
      className={[styles.squelette, styles[disposition], enTete ? null : className]
        .filter(Boolean)
        .join(' ')}
      role={enTete ? undefined : 'status'}
    >
      {enTete ? null : <span className="lecture-seule">{annonce}</span>}
      {Array.from({ length: cartes }, (_, rang) => (
        <Carte key={rang} className={styles.carte} aria-hidden="true">
          {Array.from({ length: lignes }, (_, ligne) => (
            <span
              key={ligne}
              className={[styles.barre, ligne === 0 ? styles.barreTitre : null]
                .filter(Boolean)
                .join(' ')}
              style={{ width: LARGEURS[ligne % LARGEURS.length] }}
            />
          ))}
        </Carte>
      ))}
    </div>
  );

  if (!enTete) return grille;

  return (
    <div className={[styles.page, className].filter(Boolean).join(' ')} role="status">
      <span className="lecture-seule">{annonce}</span>
      <div className={styles.enTete} aria-hidden="true">
        <span className={`${styles.barre} ${styles.barreSurtitre}`} />
        <span className={`${styles.barre} ${styles.barreGrandTitre}`} />
        <span className={`${styles.barre} ${styles.barreChapeau}`} />
      </div>
      {grille}
    </div>
  );
}
