/**
 * Publier un chantier.
 *
 * La page est un composant SERVEUR : elle exige la session, monte
 * l'enveloppe, explique ce qui va se passer, et délègue la saisie à
 * `Formulaire.tsx`, le seul morceau qui a besoin du navigateur.
 *
 * Il n'y a rien à lire dans l'API pour afficher cet écran — pas de liste,
 * donc pas d'état vide, pas de squelette d'attente et pas de panne de
 * lecture. Les trois états du formulaire, eux, sont dans le formulaire :
 * vierge, refusé par champ, refusé globalement.
 */
import type { Metadata } from 'next';

import { Carte } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import { exigerRole } from '@/lib/session';
import { Formulaire } from './Formulaire';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Publier un chantier',
  description:
    "Décrivez votre chantier : les artisans de ce métier dont la zone d'intervention couvre votre adresse vous enverront un devis.",
};

export default async function PagePublierUnBesoin() {
  /*
   * CLIENT seul, et pas ADMIN.
   *
   * `publierBesoin` porte `@Roles(Role.CLIENT)` côté API, et la garde ne
   * laisse pas passer ADMIN. Afficher le formulaire à un administrateur lui
   * ferait saisir six champs pour recevoir « Votre type de compte n'a pas
   * accès à cette opération ». La redirection vers l'accueil, que fait
   * `exigerRole`, lui dit la même chose sans lui faire perdre son temps.
   *
   * `suite` est renseigné pour qu'un visiteur déconnecté qui suit un lien
   * vers cette page y revienne après s'être inscrit : c'est le parcours
   * d'arrivée le plus probable depuis l'accueil.
   */
  await exigerRole(['CLIENT'], { suite: CHEMINS.publierBesoin });

  return (
    <div className={styles.page}>
      <header className={styles.enTete}>
        <p className={styles.surtitre}>Espace client</p>
        <h1 className={styles.titre}>Publier un chantier</h1>
        <p className={styles.phrase}>
          Décrivez le chantier une fois. Les artisans de ce métier dont le rayon
          d&apos;intervention couvre votre adresse le verront et vous enverront un devis.
        </p>
      </header>

      <div className={styles.corps}>
        <Formulaire />

        {/*
         * Ce qui se passe après l'envoi, écrit AVANT l'envoi.
         *
         * Le client s'apprête à publier une adresse et un numéro de
         * téléphone sur une place de marché qu'il découvre. Lui dire à ce
         * moment-là qui verra quoi n'est pas une précaution juridique :
         * c'est la réponse à la question qu'il se pose en remplissant le
         * champ « adresse ».
         */}
        <Carte balise="aside" padding="lg" className={styles.aparte}>
          <h2 className={styles.aparteTitre}>Ce que les artisans voient</h2>
          <ul className={styles.aparteListe}>
            <li>
              Le métier, le titre, la description et la distance qui les sépare du chantier.
            </li>
            <li>
              Votre prénom et l&apos;initiale de votre nom — « Fatima B. » —, jamais votre nom
              complet.
            </li>
            <li>
              <strong>Ni votre adresse exacte, ni votre téléphone, ni votre e-mail.</strong> Ils
              ne sont transmis qu&apos;à l&apos;artisan dont vous acceptez le devis, au moment
              où vous l&apos;acceptez.
            </li>
          </ul>
          <p className={styles.aparteFin}>
            Le budget maximal, si vous en annoncez un, est visible de tous les artisans du
            secteur.
          </p>
        </Carte>
      </div>
    </div>
  );
}
