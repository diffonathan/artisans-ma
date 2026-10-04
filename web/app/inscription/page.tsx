/**
 * /inscription — le parcours du particulier.
 *
 * ── Le choix d'abord, mais pas le choix SEUL ──────────────────────────────
 * Un écran qui ne porterait que deux boutons ferait payer un clic à tout le
 * monde pour n'apprendre à personne ce qui l'attend derrière. Les deux voies
 * sont donc présentées en haut — `Choix.tsx` dit pourquoi elles existent — et
 * la plus courte est OUVERTE : le particulier a quatre champs sous les yeux,
 * et l'artisan a un lien vers les siens. L'asymétrie est le sujet même du
 * choix.
 *
 * ── Pourquoi cette page ne monte pas l'enveloppe ──────────────────────────
 * Même raison que `/connexion`, où c'est écrit en entier : l'enveloppe est
 * montée par l'accueil en attendant de remonter dans la disposition racine,
 * et son bouton « Aide » n'a personne pour l'écouter hors de l'accueil.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Carte } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import { destinationSure } from '@/lib/destination';
import { lireSession } from '@/lib/session';
import { Choix } from './Choix';
import { FormulaireClient } from './FormulaireClient';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Créer un compte',
  description:
    'Créez un compte pour décrire votre chantier et recevoir les devis des ' +
    'artisans dont la zone d’intervention couvre votre adresse.',
};

export default async function PageInscription(props: PageProps<'/inscription'>) {
  // `searchParams` est asynchrone en Next 16 : l'accès synchrone est supprimé.
  const parametres = await props.searchParams;

  /*
   * `suite` sort dans deux `href` de cette page — le sélecteur de parcours la
   * transporte vers `/inscription/artisan`, et le lien du bas vers
   * `/connexion`. On n'écrit pas dans une URL à nous une chaîne reçue du
   * client sans l'avoir ramenée à un chemin interne. La Server Action la
   * revalide ensuite, le champ caché étant modifiable depuis le navigateur.
   */
  const brute = parametres.suite;
  const suite = destinationSure(typeof brute === 'string' ? brute : '');

  // Déjà connecté : créer un second compte n'est pas ce qu'on cherche à
  // faire en arrivant ici depuis une page privée.
  if (await lireSession()) redirect(suite);

  const cheminConnexion = `${CHEMINS.connexion}?suite=${encodeURIComponent(suite)}`;

  return (
    <main className={styles.page} id="contenu">
      <p className={styles.retour}>
        <Link href={CHEMINS.accueil}>Artisans.ma</Link>
      </p>

      <header className={styles.ouverture}>
        <h1 className={styles.titre}>Créer un compte</h1>
        <p className={styles.chapeau}>
          Deux parcours, parce que les deux côtés du service ne se ressemblent
          pas&nbsp;: un particulier décrit un chantier, un artisan déclare ses
          métiers et la zone où il se déplace.
        </p>
      </header>

      <Choix courant="client" suite={suite} />

      <Carte balise="section" className={styles.panneau} padding="lg">
        <h2 className={styles.titrePanneau}>Je cherche un artisan</h2>
        <p className={styles.chapeauPanneau}>
          Vous décrirez votre chantier après&nbsp;: le compte ne demande ni
          adresse ni budget, qui appartiennent au chantier et non à vous.
        </p>

        <FormulaireClient suite={suite} />
      </Carte>

      <p className={styles.bascule}>
        Vous avez déjà un compte&nbsp;? <Link href={cheminConnexion}>Se connecter</Link>
      </p>
    </main>
  );
}
