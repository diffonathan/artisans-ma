/**
 * L'écran d'attente de /mon-planning.
 *
 * Next enveloppe `page.tsx` dans une frontière `<Suspense>` dont ceci est le
 * repli : il s'affiche DANS le `<main>` de l'enveloppe, donc l'en-tête et la
 * navigation restent à l'écran et cliquables pendant que l'API répond.
 *
 * Deux cartes : un planning tient rarement plus de deux interventions à
 * l'écran, et promettre trois lignes qui n'arrivent pas fait sauter la page.
 */
import type { ReactNode } from 'react';
import { Squelette } from '@/components/Squelette';

export default function Attente(): ReactNode {
  return <Squelette cartes={2} lignes={3} annonce="Chargement de votre planning…" enTete />;
}
