/**
 * Le choix préalable : « Je cherche un artisan » ou « Je suis artisan ».
 *
 * ── Pourquoi un choix avant le formulaire ─────────────────────────────────
 * Les deux parcours n'ont pas la même taille. Un particulier a besoin de
 * quatre champs ; un artisan en a treize — raison sociale, métiers, ville,
 * position, rayon d'intervention. Afficher les treize à tout le monde fait
 * partir celui qui n'en remplirait que quatre, et un formulaire unique à
 * champs qui apparaissent oblige à choisir de toute façon, mais après avoir
 * commencé à écrire.
 *
 * Le choix est donc une bifurcation d'URL, et non un état : chaque parcours a
 * son adresse, se partage, se recharge et revient en arrière. `/inscription`
 * pour le particulier, `/inscription/artisan` pour le professionnel.
 *
 * ── Pourquoi ce composant vit ici et non dans components/ ────────────────
 * Deux pages s'en servent, et ce sont les deux pages de ce dossier. Le socle
 * n'a pas de primitive « sélecteur de parcours », et en inventer une dans
 * `components/` serait écrire dans les fichiers d'un autre agent. Si un
 * troisième parcours apparaissait ailleurs, ces lignes auraient leur place
 * là-bas.
 *
 * Aucune directive : deux liens et une condition. Rien à faire côté client —
 * le parcours courant est connu de la page qui rend ce composant, et n'a donc
 * pas besoin d'être lu dans l'URL par `usePathname`.
 */
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CHEMINS } from '@/components/chemins';
import styles from './page.module.css';

export type Parcours = 'client' | 'artisan';

export interface ProprietesChoix {
  /** Le parcours affiché par la page qui monte ce composant. */
  courant: Parcours;
  /** La destination de retour, transportée d'un parcours à l'autre. */
  suite: string;
}

interface Voie {
  parcours: Parcours;
  chemin: string;
  libelle: string;
  precision: string;
}

const VOIES: readonly Voie[] = [
  {
    parcours: 'client',
    chemin: CHEMINS.inscription,
    libelle: 'Je cherche un artisan',
    precision: 'Quatre champs',
  },
  {
    parcours: 'artisan',
    chemin: CHEMINS.inscriptionArtisan,
    libelle: 'Je suis artisan',
    precision: 'Votre entreprise et votre zone',
  },
];

export function Choix({ courant, suite }: ProprietesChoix): ReactNode {
  return (
    /*
     * Une liste et non une suite de <div> : ce sont deux options de même rang,
     * et `aria-label` dit à quoi elles servent. Pas de role="tablist" — ces
     * deux-là naviguent, elles ne basculent pas un panneau, et promettre une
     * bascule au clavier (flèches) qu'on ne câble pas serait pire que rien.
     */
    <nav className={styles.choix} aria-label="Type de compte à créer">
      <ul className={styles.voies}>
        {VOIES.map((voie) => {
          const active = voie.parcours === courant;
          const cible = `${voie.chemin}?suite=${encodeURIComponent(suite)}`;

          return (
            <li key={voie.parcours} className={styles.voie}>
              {active ? (
                /*
                 * Le parcours courant n'est PAS un lien vers la page qu'on
                 * regarde déjà : un lien qui ne mène nulle part se présente
                 * quand même au clavier et à un lecteur d'écran comme une
                 * destination. `aria-current` dit ce qu'il est.
                 */
                <span className={`${styles.etiquetteVoie} ${styles.voieCourante}`} aria-current="page">
                  {voie.libelle}
                  <span className={styles.precisionVoie}>{voie.precision}</span>
                </span>
              ) : (
                <Link className={styles.etiquetteVoie} href={cible}>
                  {voie.libelle}
                  <span className={styles.precisionVoie}>{voie.precision}</span>
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
