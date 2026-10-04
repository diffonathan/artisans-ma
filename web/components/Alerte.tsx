/**
 * Un message qui ne porte sur aucun champ : un refus de l'API, une
 * confirmation, une mise en garde.
 *
 * ── Pourquoi cette primitive existe ───────────────────────────────────────
 * `Champ` rend l'erreur d'UN champ ; rien ne rendait celle d'un formulaire.
 * Trois agents sur six ont donc redéclaré le même bloc — bordure, fond dilué,
 * `role="alert"` — sous le même nom `.refus`, dans sept modules CSS :
 * `app/connexion`, `app/inscription`, `app/chantiers`, `app/mes-devis`,
 * `app/mon-planning`, `app/mes-reservations`, et `.messageGlobal` dans
 * `app/mes-besoins/[id]` et `app/publier-un-besoin`. Sept copies de la même
 * recette, qui auraient dérivé l'une après l'autre.
 *
 * ── Le rôle ARIA, et pourquoi il est une propriété ────────────────────────
 * `role="alert"` interrompt un lecteur d'écran pour annoncer le nœud dès qu'il
 * APPARAÎT. C'est juste pour un refus arrivé après un envoi, et c'est faux
 * pour un encart présent au chargement de la page : l'annonce couperait la
 * lecture du titre. D'où `annonce` :
 *
 *   - 'interruption' (le défaut pour `ton="rouge"`) → `role="alert"` ;
 *   - 'polie' → `role="status"`, annoncé quand le lecteur en a fini ;
 *   - 'aucune' → rien, pour un encart décoratif de mise en contexte.
 *
 * ── Le losange ────────────────────────────────────────────────────────────
 * Repris de `Champ.module.css` : la couleur seule ne distingue pas une erreur
 * d'une aide pour un lecteur daltonien. Il est `aria-hidden`, le rôle ARIA
 * portant déjà la nature du message.
 */
import type { ReactNode } from 'react';
import styles from './Alerte.module.css';

/**
 * Les trois tons, qui sont trois des quatre rôles de la charte. Il n'y a pas
 * de ton « vert » : une alerte annonce un refus, une attente ou une mise en
 * garde, et un succès s'annonce en montrant le résultat, pas en l'écrivant.
 */
export type TonAlerte = 'rouge' | 'or' | 'accent';

export type AnnonceAlerte = 'interruption' | 'polie' | 'aucune';

export interface ProprietesAlerte {
  children: ReactNode;
  /** Le défaut est 'rouge' : la grande majorité de ces blocs sont des refus. */
  ton?: TonAlerte;
  annonce?: AnnonceAlerte;
  /** Un intitulé court, au-dessus du texte. Omis la plupart du temps. */
  titre?: string;
  className?: string;
  /** Pour un `aria-describedby` qui pointe sur ce bloc. */
  id?: string;
}

const ROLE: Record<AnnonceAlerte, string | undefined> = {
  interruption: 'alert',
  polie: 'status',
  aucune: undefined,
};

export function Alerte({
  children,
  ton = 'rouge',
  annonce,
  titre,
  className,
  id,
}: ProprietesAlerte): ReactNode {
  // Un refus s'annonce en interrompant ; une mise en garde ou un encart
  // d'accent attendent leur tour. Le défaut suit donc le ton.
  const annonceEffective: AnnonceAlerte = annonce ?? (ton === 'rouge' ? 'interruption' : 'polie');

  return (
    <div
      id={id}
      className={[styles.alerte, styles[ton], className].filter(Boolean).join(' ')}
      role={ROLE[annonceEffective]}
    >
      <span className={styles.marqueur} aria-hidden="true">
        ◆
      </span>
      <div className={styles.corps}>
        {titre ? <p className={styles.titre}>{titre}</p> : null}
        {/* `div` et non `p` : l'appelant passe parfois deux paragraphes, et un
            `<p>` dans un `<p>` est refermé par l'analyseur HTML — le second
            paragraphe sortirait du bloc, sans bordure et sans son rôle. */}
        <div className={styles.texte}>{children}</div>
      </div>
    </div>
  );
}
