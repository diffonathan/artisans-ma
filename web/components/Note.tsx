/**
 * La note d'un artisan : cinq étoiles, la valeur, et le nombre d'avis.
 *
 * Le nombre d'avis n'est pas décoratif, c'est la moitié de l'information :
 * `5,0` sur un avis et `4,6` sur quatre-vingts ne disent pas la même chose, et
 * l'API rend les deux champs côte à côte (`noteMoyenne`, `nombreAvis`)
 * précisément pour qu'on ne les sépare pas. D'où leur réunion dans UN
 * composant plutôt que deux.
 */
import type { ReactNode } from 'react';
import styles from './Note.module.css';

export type TailleNote = 'normal' | 'grand';

export interface ProprietesNote {
  /** `artisan.noteMoyenne`, de 0 à 5. */
  note: number;
  /** `artisan.nombreAvis`. À 0, aucune étoile n'est dessinée — voir plus bas. */
  nombreAvis: number;
  /** Masque « (n avis) » quand le compte est déjà affiché à côté. */
  avecNombreAvis?: boolean;
  taille?: TailleNote;
  className?: string;
}

/**
 * Une étoile dans une boîte de 20, répétée cinq fois par `translate`.
 *
 * Pas de `<defs><use>` : deux composants Note sur la même page partagent un
 * seul espace de noms d'identifiants SVG, et le second `id` déclaré gagnerait
 * silencieusement pour les deux — le piège déjà documenté dans brand/README.md.
 * Cinq tracés répétés coûtent quelques octets et aucune surprise.
 */
const ETOILE =
  'M10 1.9l2.47 5.01 5.53.8-4 3.9.95 5.5L10 14.5l-4.95 2.6.95-5.5-4-3.9 5.53-.8z';
const POSITIONS = [0, 1, 2, 3, 4];

function RangeeEtoiles({ classe }: { classe: string }) {
  return (
    <svg className={classe} viewBox="0 0 100 20" aria-hidden="true" focusable="false">
      {POSITIONS.map((index) => (
        <path key={index} d={ETOILE} fill="currentColor" transform={`translate(${index * 20} 0)`} />
      ))}
    </svg>
  );
}

/**
 * Le palier de couleur.
 *
 * La charte confie `--vert` à « note élevée » et `--or` aux montants
 * exclusivement : des étoiles dorées mangeraient le rôle « valeur » sur une
 * fiche qui affiche aussi un prix. Trois paliers et non cinq, parce qu'un
 * dégradé de couleurs sur une note demande au lecteur de retenir une échelle
 * au lieu de lire un verdict.
 */
function palier(note: number): 'haute' | 'moyenne' | 'basse' {
  if (note >= 4) return 'haute';
  if (note >= 2.5) return 'moyenne';
  return 'basse';
}

export function Note({
  note,
  nombreAvis,
  avecNombreAvis = true,
  taille = 'normal',
  className,
}: ProprietesNote): ReactNode {
  /*
   * Sans avis, l'API rend `noteMoyenne: 0` — ce n'est pas une mauvaise note,
   * c'est l'absence de note. Dessiner cinq étoiles vides et un « 0,0 » rouge
   * accuserait un artisan qui n'a simplement pas encore travaillé par ici.
   */
  if (nombreAvis <= 0) {
    return (
      <span className={[styles.note, styles[taille], styles.sansAvis, className].filter(Boolean).join(' ')}>
        Pas encore d&apos;avis
      </span>
    );
  }

  // toFixed et non Intl : la virgule est posée à la main, pour la même raison
  // qu'un séparateur de milliers choisi par l'ICU diverge entre Node et le
  // navigateur (voir Montant.tsx).
  const valeur = note.toFixed(1).replace('.', ',');
  // Borné : une note hors [0, 5] viendrait d'un bogue en amont, et une barre
  // de remplissage à 120 % déborderait sans rien signaler.
  const pourcentage = Math.min(100, Math.max(0, (note / 5) * 100));

  return (
    <span
      className={[styles.note, styles[taille], styles[palier(note)], className].filter(Boolean).join(' ')}
    >
      <span className={styles.etoiles} aria-hidden="true">
        <RangeeEtoiles classe={`${styles.rangee} ${styles.vides}`} />
        {/* Le remplissage partiel est un recadrage, pas une demi-étoile
            dessinée : la largeur est la seule valeur dynamique, donc le seul
            style en ligne — et ce n'est pas une couleur. */}
        <span className={styles.pleines} style={{ width: `${pourcentage}%` }}>
          <RangeeEtoiles classe={styles.rangee} />
        </span>
      </span>
      <span className={`nombre ${styles.valeur}`}>{valeur}</span>
      {/* Lu par les lecteurs d'écran, invisible à l'œil : « 4,8 » seul ne dit
          pas sur combien, et les étoiles sont aria-hidden. */}
      <span className="lecture-seule">&nbsp;sur 5</span>
      {avecNombreAvis ? (
        <span className={styles.compte}>
          (<span className="nombre">{nombreAvis}</span>&nbsp;avis)
        </span>
      ) : null}
    </span>
  );
}
