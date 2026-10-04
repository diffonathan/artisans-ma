'use client';

/**
 * La frontière d'erreur du segment racine.
 *
 * 'use client' n'est pas un choix : React exige qu'une frontière d'erreur soit
 * un composant client, et Next refuse de construire ce fichier sans la
 * directive.
 *
 * ── Le piège de version ───────────────────────────────────────────────────
 * La seconde propriété s'appelle `retry` — PAS `reset`. C'est une rupture de
 * Next 16, vérifiée dans
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`.
 * `reset()` existe encore mais ne fait pas la même chose : il vide l'état de
 * la frontière et re-rend les enfants SANS redemander les données. Sur cette
 * application, où toute panne vient d'une lecture de l'API, re-rendre sans
 * relire reproduirait l'erreur à l'identique — le bouton « Réessayer » ne
 * servirait à rien. `retry()` refait la lecture.
 *
 * Ce fichier n'enveloppe pas la disposition racine : une erreur jetée par
 * `app/layout.tsx` lui échappe, et demanderait un `app/global-error.tsx`. Il
 * n'y en a pas, parce que la disposition racine ne lit rien et ne peut donc
 * pas échouer.
 */
import { Bouton, BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import styles from './page.module.css';

export default function PageErreur({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className={styles.etat}>
      <Carte className={styles.etatCarte} padding="lg">
        <p className={styles.etatCodeRouge}>Erreur</p>
        <h1 className={styles.etatTitre}>Quelque chose s&apos;est interrompu</h1>
        <p className={styles.etatTexte}>
          La panne est de notre côté, pas du vôtre. Elle est souvent passagère&nbsp;: réessayer
          refait la lecture et suffit la plupart du temps.
        </p>

        {/*
         * Le `digest` et jamais `error.message` : en production, le message
         * d'une erreur venue d'un composant serveur est volontairement
         * remplacé par un texte générique, pour ne pas faire fuiter de détail
         * d'implémentation. Le digest, lui, est l'empreinte qui permet de
         * retrouver la trace exacte dans les journaux du serveur — c'est donc
         * la seule chose utile à montrer, et la seule qu'on puisse citer sans
         * risque.
         */}
        {error.digest ? (
          <p className={styles.etatRepere}>
            Repère pour le journal&nbsp;: <code className={styles.code}>{error.digest}</code>
          </p>
        ) : null}

        <div className={styles.etatActions}>
          <Bouton
            onClick={() => {
              retry();
            }}
          >
            Réessayer
          </Bouton>
          <BoutonLien variante="secondaire" href={CHEMINS.accueil}>
            Revenir à l&apos;accueil
          </BoutonLien>
        </div>
      </Carte>
    </main>
  );
}
