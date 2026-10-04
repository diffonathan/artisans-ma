/**
 * La surface de verre, et rien de plus.
 *
 * Carte ne propose ni en-tête ni pied en propriétés : une carte d'artisan, un
 * panneau de devis et une ligne de planning n'ont pas la même anatomie, et des
 * emplacements imposés obligeraient chaque agent à y faire entrer sa mise en
 * page de force. Ce composant garantit UNE chose — que toutes les surfaces de
 * l'application ont la même épaisseur de verre — et laisse l'intérieur libre.
 *
 * La recette du verre vient de la classe globale `.verre` : elle n'est pas
 * recopiée ici, sinon deux fichiers décideraient de l'identité visuelle.
 */
import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import styles from './Carte.module.css';

/** `li` pour une carte dans une liste, `article` pour une fiche autonome. */
export type BaliseCarte = 'div' | 'article' | 'section' | 'aside' | 'li';

export type PaddingCarte = 'aucun' | 'sm' | 'md' | 'lg';

export interface ProprietesCarte extends ComponentPropsWithoutRef<'div'> {
  balise?: BaliseCarte;
  /** `aucun` pour une carte dont le contenu touche les bords (image, tableau). */
  padding?: PaddingCarte;
  /**
   * Ajoute le survol de `.verre-interactif`. À RÉSERVER aux cartes réellement
   * cliquables — une carte informative qui se soulève promet une action qui
   * n'existe pas. Pour une carte entièrement cliquable, préférer `CarteLien`.
   */
  interactive?: boolean;
}

export function Carte({
  balise = 'div',
  padding = 'md',
  interactive = false,
  className,
  children,
  ...reste
}: ProprietesCarte): ReactNode {
  /*
   * Le transtypage est volontaire. Avec `Balise` typée comme l'UNION des cinq
   * balises, TypeScript intersecte leurs tables de propriétés et le contrôle
   * du spread s'effondre sur `never`. Les cinq n'acceptent que les attributs
   * HTML globaux — ceux de ComponentPropsWithoutRef<'div'> — donc le
   * transtypage ne masque aucune incompatibilité réelle.
   */
  const Balise = balise as 'div';

  return (
    <Balise
      {...reste}
      className={[
        'verre',
        interactive ? 'verre-interactif' : null,
        styles.carte,
        styles[padding],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Balise>
  );
}

export interface ProprietesCarteLien
  extends Omit<ComponentPropsWithoutRef<typeof Link>, 'className'> {
  padding?: PaddingCarte;
  className?: string;
}

/**
 * Une carte dont la surface ENTIÈRE est le lien.
 *
 * Un `<Link>` enveloppant le contenu, et non une carte munie d'un lien « Voir »
 * dans un coin : la cible cliquable est alors la carte visible, ce qui est à la
 * fois ce que le lecteur attend et une cible tactile confortable. Le focus
 * clavier atterrit sur la carte elle-même, où le contour global de
 * `:focus-visible` se voit.
 *
 * Conséquence à connaître : rien de cliquable ne doit vivre à l'intérieur. Un
 * bouton imbriqué dans une ancre est invalide, et son clic remonterait au lien.
 */
export function CarteLien({
  padding = 'md',
  className,
  children,
  ...reste
}: ProprietesCarteLien): ReactNode {
  return (
    <Link
      {...reste}
      className={['verre', 'verre-interactif', styles.carte, styles.lien, styles[padding], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </Link>
  );
}
