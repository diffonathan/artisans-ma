/**
 * Le 404.
 *
 * Il ne reprend pas l'enveloppe. Deux raisons, et la seconde suffirait :
 * l'enveloppe est montée par la page d'accueil et non par la disposition
 * racine (voir l'en-tête de `page.tsx`), et un 404 n'a de toute façon pas de
 * rubrique courante à marquer. Il se suffit donc à lui-même, et porte ses
 * propres chemins de retour.
 */
import type { Metadata } from 'next';
import { BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Page introuvable',
};

export default function PageIntrouvable() {
  return (
    <main className={styles.etat}>
      <Carte className={styles.etatCarte} padding="lg">
        {/* Le code est un nombre : Azeret Mono, par la classe globale. */}
        <p className={`nombre ${styles.etatCode}`}>404</p>
        <h1 className={styles.etatTitre}>Cette page n&apos;existe pas</h1>
        <p className={styles.etatTexte}>
          L&apos;adresse est peut-être incomplète, ou la page a changé de nom. Rien n&apos;est perdu
          de votre côté&nbsp;: vos chantiers, vos devis et vos réservations sont intacts.
        </p>
        <div className={styles.etatActions}>
          <BoutonLien href={CHEMINS.accueil}>Revenir à l&apos;accueil</BoutonLien>
          <BoutonLien variante="secondaire" href={CHEMINS.recherche}>
            Chercher un artisan
          </BoutonLien>
        </div>
      </Carte>
    </main>
  );
}
