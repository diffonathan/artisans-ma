/**
 * /connexion
 *
 * ── Pourquoi cette page ne monte PAS l'enveloppe ──────────────────────────
 * `app/layout.tsx` ne rend que <html> et <body> ; l'en-tête, la navigation et
 * le pied sont montés par `app/page.tsx`, qui porte dans son en-tête la dette
 * à régler : les faire remonter dans la disposition racine. Tant que ce n'est
 * pas fait, une page qui monte `<Enveloppe>` elle-même en hériterait DEUX
 * fois le jour où quelqu'un le fera.
 *
 * Et il y a une raison qui vaut même après : l'enveloppe porte un bouton
 * « Aide » qui émet une intention sur `window`, écoutée par `<VisiteGuidee />`
 * — montée une seule fois, par l'accueil. Sur cette route, l'enveloppe
 * afficherait donc un bouton qui ne fait rien.
 *
 * Ces trois écrans se suffisent à eux-mêmes, comme `app/not-found.tsx` qui le
 * dit pour les mêmes raisons : un retour vers l'accueil en haut, et l'autre
 * porte d'entrée en bas. Un formulaire d'authentification sans navigation est
 * de toute façon l'usage — il n'y a rien à explorer au milieu d'une
 * connexion.
 *
 * ── Ce que la page lit, et pourquoi elle est dynamique ────────────────────
 * `searchParams` pour la destination de retour, et le cookie de session pour
 * ne pas montrer un formulaire de connexion à quelqu'un qui est déjà
 * connecté. Les deux sont des lectures de requête : cette route n'est pas
 * prérendue, et elle n'a aucune raison de l'être.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Carte } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import { destinationSure } from '@/lib/destination';
import { lireSession } from '@/lib/session';
import { FormulaireConnexion } from './Formulaire';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Se connecter',
  description:
    'Accédez à vos chantiers, vos devis et vos réservations sur Artisans.ma.',
  // Une page de connexion n'a rien à apporter à un moteur de recherche, et
  // tout à perdre à être indexée avec ses paramètres de retour.
  robots: { index: false, follow: true },
};

export default async function PageConnexion(props: PageProps<'/connexion'>) {
  // `searchParams` est asynchrone en Next 16 : l'accès synchrone est
  // supprimé, pas déprécié.
  const parametres = await props.searchParams;

  /*
   * `suite` arrive de `exigerSession`, qui l'a encodée, mais aussi de
   * n'importe quel lien qu'on nous envoie. `destinationSure` est appliquée
   * ICI parce que la valeur ressort dans deux `href` de cette page — le lien
   * vers l'inscription la transporte — et qu'on ne recopie pas dans une URL à
   * nous une chaîne qu'on n'a pas contrôlée. La Server Action la revalide
   * ensuite, le champ caché étant modifiable depuis le navigateur.
   */
  const brute = parametres.suite;
  const suite = destinationSure(typeof brute === 'string' ? brute : '');

  /*
   * Déjà connecté : on l'emmène où il allait, au lieu de lui demander de
   * s'identifier une seconde fois. `lireSession` et non `exigerSession` —
   * c'est l'inverse qui est voulu ici.
   *
   * Le jeton n'est pas vérifié (voir `lib/session.ts`) : un cookie fabriqué
   * ferait donc sauter cette page pour une autre dont chaque requête serait
   * refusée par l'API. C'est sans conséquence, et c'est pourquoi aucune
   * décision d'habilitation ne se prend ici.
   */
  if (await lireSession()) redirect(suite);

  const cheminInscription = `${CHEMINS.inscription}?suite=${encodeURIComponent(suite)}`;

  return (
    <main className={styles.page} id="contenu">
      <p className={styles.retour}>
        <Link href={CHEMINS.accueil}>Artisans.ma</Link>
      </p>

      <Carte balise="section" className={styles.panneau} padding="lg">
        <h1 className={styles.titre}>Se connecter</h1>
        <p className={styles.chapeau}>
          Vos chantiers, les devis reçus et vos réservations sont derrière cette
          page.
        </p>

        <FormulaireConnexion suite={suite} />
      </Carte>

      <p className={styles.bascule}>
        Pas encore de compte&nbsp;?{' '}
        <Link href={cheminInscription}>Créer un compte</Link>
      </p>
    </main>
  );
}
