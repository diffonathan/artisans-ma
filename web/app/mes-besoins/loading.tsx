/**
 * L'écran d'attente de /mes-besoins.
 *
 * Next enveloppe `page.tsx` dans une frontière `<Suspense>` dont ceci est le
 * repli : il s'affiche DANS le `<main>` de l'enveloppe, donc l'en-tête et la
 * navigation restent à l'écran et cliquables pendant que l'API répond.
 *
 * Même forme que le repli interne de la page, pour que le passage de
 * l'un à l'autre ne se voie pas.
 */
import type { ReactNode } from 'react';
import { Squelette } from '@/components/Squelette';

export default function Attente(): ReactNode {
  return <Squelette cartes={3} lignes={2} annonce="Chargement de vos chantiers…" enTete />;
}
