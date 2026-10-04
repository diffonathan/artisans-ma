/**
 * /inscription/artisan — le parcours du professionnel.
 *
 * ── Pourquoi une route et non un état de `/inscription` ───────────────────
 * Parce qu'un parcours de treize champs se recharge, se partage et se reprend.
 * Un bouton qui aurait fait apparaître les neuf champs supplémentaires aurait
 * donné une seule adresse aux deux parcours : revenir en arrière aurait rouvert
 * la page du particulier, et un lien « Devenir artisan » — l'enveloppe en
 * porte un dans son pied — n'aurait eu nulle part à pointer. Le raisonnement
 * complet est dans `../Choix.tsx`.
 *
 * Ce fichier réutilise la feuille et le sélecteur du dossier parent : les deux
 * parcours doivent avoir exactement la même forme, et la seule façon d'en être
 * sûr est qu'il n'existe qu'une déclaration.
 *
 * ── Ce qui n'est pas ici ──────────────────────────────────────────────────
 * Aucune enveloppe, pour la raison écrite en entier dans `/connexion`. Et
 * aucune métadonnée `icons` : l'icône d'onglet est `app/icon.svg`, par la
 * convention de fichier, et un `icons` déclaré dans un objet `metadata`
 * l'écraserait en silence.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Carte } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import { destinationSure } from '@/lib/destination';
import { lireSession } from '@/lib/session';
import { Choix } from '../Choix';
import { FormulaireArtisan } from '../FormulaireArtisan';
import styles from '../page.module.css';

export const metadata: Metadata = {
  title: 'S’inscrire comme artisan',
  description:
    'Déclarez vos métiers, la ville de votre atelier et le rayon dans lequel ' +
    'vous vous déplacez : vous verrez les chantiers que ce rayon couvre.',
};

export default async function PageInscriptionArtisan(props: PageProps<'/inscription/artisan'>) {
  const parametres = await props.searchParams;

  const brute = parametres.suite;
  const suite = destinationSure(typeof brute === 'string' ? brute : '');

  if (await lireSession()) redirect(suite);

  const cheminConnexion = `${CHEMINS.connexion}?suite=${encodeURIComponent(suite)}`;

  return (
    <main className={`${styles.page} ${styles.pageLarge}`} id="contenu">
      <p className={styles.retour}>
        <Link href={CHEMINS.accueil}>Artisans.ma</Link>
      </p>

      <header className={styles.ouverture}>
        <h1 className={styles.titre}>S&apos;inscrire comme artisan</h1>
        <p className={styles.chapeau}>
          Trois choses décident de ce que vous verrez&nbsp;: vos métiers, la
          position de votre atelier et le rayon dans lequel vous acceptez de
          vous déplacer. Chacune est expliquée sous son champ.
        </p>
      </header>

      <Choix courant="artisan" suite={suite} />

      <Carte balise="section" className={styles.panneau} padding="lg">
        <h2 className={styles.titrePanneau}>Je suis artisan</h2>
        <p className={styles.chapeauPanneau}>
          Un client publie un chantier avec son adresse&nbsp;; vous le recevez si
          votre rayon la couvre, et vous proposez un devis. L&apos;adresse exacte
          et le téléphone du client vous sont communiqués si votre devis est
          retenu.
        </p>

        <FormulaireArtisan suite={suite} />
      </Carte>

      <p className={styles.bascule}>
        Vous avez déjà un compte&nbsp;? <Link href={cheminConnexion}>Se connecter</Link>
      </p>
    </main>
  );
}
