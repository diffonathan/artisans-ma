/**
 * L'écran d'attente de /recherche.
 *
 * Next enveloppe `page.tsx` dans une frontière `<Suspense>` dont ceci est le
 * repli : il s'affiche DANS le `<main>` de l'enveloppe, donc l'en-tête et la
 * navigation restent à l'écran et cliquables pendant que l'API répond.
 *
 * La grille reprend la largeur de colonne des résultats : six cartes, qui est
 * ce qu'un écran large affiche d'un coup.
 */
import type { ReactNode } from 'react';
import { Squelette } from '@/components/Squelette';

export default function Attente(): ReactNode {
  return <Squelette cartes={6} lignes={3} disposition="grille" annonce="Chargement de la recherche…" enTete />;
}
