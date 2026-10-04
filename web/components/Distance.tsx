/**
 * Une distance, à partir des MÈTRES rendus par `$geoNear`.
 *
 * Le champ `distanceMetres` est nullable dans le schéma : il n'existe que sur
 * un artisan sorti d'une recherche géographique, et vaut `null` sur une fiche
 * ouverte par identifiant. Ce composant accepte donc `null` et ne rend RIEN
 * plutôt que « 0 m » — une distance inconnue n'est pas une distance nulle, et
 * « à 0 m » placerait l'artisan dans le salon du client.
 */
import type { ReactNode } from 'react';
import styles from './Distance.module.css';

export interface ProprietesDistance {
  /** `artisan.distanceMetres` ou `besoin.distanceMetres`, tel quel. */
  metres: number | null | undefined;
  /**
   * `false` rend « 2,4 km » au lieu de « à 2,4 km » — pour une colonne de
   * tableau déjà intitulée. Défaut : `true`.
   */
  avecPrefixe?: boolean;
  className?: string;
}

/**
 * Rend la distance en deux morceaux, parce que seul le premier porte Azeret
 * Mono : la charte réserve la police des nombres aux nombres, et « km » n'en
 * est pas un.
 *
 * Les paliers d'arrondi sont choisis sur ce qu'un lecteur peut FAIRE de la
 * valeur, pas sur une règle uniforme :
 *   • sous 1 km, au plus proche décamètre — « 847 m » affiche une précision
 *     que le géocodage d'une adresse marocaine ne possède pas ;
 *   • de 1 à 100 km, une décimale — c'est l'échelle où 2,4 et 2,9 se décident
 *     différemment ;
 *   • au-delà, l'entier : à 170 km, le dixième de kilomètre est du bruit.
 */
function decomposer(metres: number): { valeur: string; unite: string } {
  const absolu = Math.max(0, Math.round(metres));

  // L'arrondi AVANT la comparaison au seuil, et pas après : 999 m arrondis au
  // décamètre donnent 1000, et « 1000 m » est la seule écriture que ce
  // composant ne doit jamais produire — c'est « 1,0 km ».
  const decametres = Math.round(absolu / 10) * 10;
  if (decametres < 1000) {
    return { valeur: String(decametres), unite: 'm' };
  }

  const kilometres = decametres / 1000;
  if (kilometres < 100) {
    return { valeur: kilometres.toFixed(1).replace('.', ','), unite: 'km' };
  }
  return { valeur: String(Math.round(kilometres)), unite: 'km' };
}

export function Distance({ metres, avecPrefixe = true, className }: ProprietesDistance): ReactNode {
  if (metres === null || metres === undefined || Number.isNaN(metres)) return null;

  const { valeur, unite } = decomposer(metres);

  return (
    <span className={[styles.distance, className].filter(Boolean).join(' ')}>
      {avecPrefixe ? 'à ' : null}
      {/* `.nombre` donne la police et l'alignement tabulaire, sans couleur :
          la classe globale la laisse au contexte, et c'est le conteneur qui la
          pose ici. */}
      <span className="nombre">{valeur}</span>
      <span className={styles.unite}>&#x202f;{unite}</span>
    </span>
  );
}
