/**
 * L'écran d'attente de le détail d'un chantier.
 *
 * Next enveloppe `page.tsx` dans une frontière `<Suspense>` dont ceci est le
 * repli : il s'affiche DANS le `<main>` de l'enveloppe, donc l'en-tête et la
 * navigation restent à l'écran et cliquables pendant que l'API répond.
 *
 * Trois cartes : le chantier, puis les devis reçus. La page n'a pas de
 * frontière interne — elle attend tout d'une seule requête.
 */
import type { ReactNode } from 'react';
import { Squelette } from '@/components/Squelette';

export default function Attente(): ReactNode {
  return <Squelette cartes={3} lignes={4} annonce="Chargement du chantier…" enTete />;
}
