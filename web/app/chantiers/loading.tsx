/**
 * L'écran d'attente de /chantiers.
 *
 * Next enveloppe `page.tsx` dans une frontière `<Suspense>` dont ceci est le
 * repli : il s'affiche DANS le `<main>` de l'enveloppe, donc l'en-tête et la
 * navigation restent à l'écran et cliquables pendant que l'API répond.
 *
 * La page a déjà une frontière interne autour de sa seule liste ; celle-ci
 * couvre en plus l'en-tête de section, qui attend la session.
 */
import type { ReactNode } from 'react';
import { Squelette } from '@/components/Squelette';

export default function Attente(): ReactNode {
  return <Squelette cartes={3} lignes={3} annonce="Chargement des chantiers…" enTete />;
}
