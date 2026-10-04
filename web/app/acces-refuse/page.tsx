/**
 * « Cette page n'est pas pour votre compte. »
 *
 * ── Pourquoi cet écran existe ─────────────────────────────────────────────
 * Parce que « non authentifié » et « non autorisé » sont deux refus
 * différents, et que les confondre fabrique une boucle : un client renvoyé
 * vers `/connexion` parce qu'il a ouvert `/mon-planning` se reconnecterait
 * avec le même compte, serait ramené sur `/mon-planning` par le paramètre
 * `suite`, et repartirait vers la connexion. Sans rien pour expliquer.
 *
 * ── Comment on y arrive ───────────────────────────────────────────────────
 * Par la RÉÉCRITURE de `proxy.ts`, jamais par un lien. L'adresse affichée
 * reste donc celle qui a été demandée — `/mon-planning` et non
 * `/acces-refuse` — ce qui garde le bouton « précédent » utile et laisse
 * l'URL partageable.
 *
 * Elle reste atteignable à la main (`/acces-refuse` sans paramètre), et c'est
 * sans conséquence : sans `route` ni `role`, elle dit la même chose en plus
 * général.
 *
 * ── Ce qu'elle N'EST PAS ──────────────────────────────────────────────────
 * Une garantie. Le refus réel est celui de l'API, et celui de l'`exigerRole`
 * de chaque page privée. Cet écran est la phrase qui remplace une page vide.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Alerte } from '@/components/Alerte';
import { BoutonLien } from '@/components/Bouton';
import { Carte } from '@/components/Carte';
import { CHEMINS } from '@/components/chemins';
import { ROLES, type Role } from '@/lib/domaine';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Page réservée à un autre type de compte',
  description: "Cette page appartient à l'autre côté du service.",
  /*
   * Les moteurs n'ont rien à indexer ici : la page est le symptôme d'une
   * navigation, pas un contenu. Sans cela, `/acces-refuse` finirait dans les
   * résultats de recherche à la place de la page réellement demandée.
   */
  robots: { index: false, follow: false },
};

/**
 * La sortie proposée, selon le côté du service où l'on se trouve.
 *
 * Elle n'est pas décorative : quelqu'un qui tombe ici s'est trompé de côté,
 * et le seul geste utile est de lui montrer SON côté. Un simple « retour à
 * l'accueil » le laisserait chercher.
 */
function sortie(role: Role | null): { chemin: string; libelle: string } {
  if (role === 'ARTISAN') {
    return { chemin: CHEMINS.chantiers, libelle: 'Voir les chantiers à chiffrer' };
  }
  if (role === 'CLIENT' || role === 'ADMIN') {
    return { chemin: CHEMINS.mesBesoins, libelle: 'Voir mes chantiers' };
  }
  return { chemin: CHEMINS.accueil, libelle: "Revenir à l'accueil" };
}

/** Comment le compte se nomme dans une phrase. */
const NOM_DU_ROLE: Record<Role, string> = {
  CLIENT: 'un compte de particulier',
  ARTISAN: "un compte d'artisan",
  ADMIN: 'un compte administrateur',
};

/** La première valeur d'un paramètre : `?role=A&role=B` est une URL valide. */
const premiere = (valeur: string | string[] | undefined): string =>
  (Array.isArray(valeur) ? valeur[0] : valeur) ?? '';

export default async function PageAccesRefuse(
  props: PageProps<'/acces-refuse'>,
): Promise<ReactNode> {
  // `searchParams` est une promesse en Next 16 : l'accès synchrone est
  // supprimé, pas déprécié.
  const parametres = await props.searchParams;

  const roleBrut = premiere(parametres.role);
  // Un rôle inconnu est traité comme une absence : le paramètre vient de
  // l'URL, donc n'importe qui peut y écrire n'importe quoi, et l'afficher tel
  // quel mettrait du texte étranger dans une phrase française.
  const role = (ROLES as readonly string[]).includes(roleBrut) ? (roleBrut as Role) : null;

  /*
   * La route demandée n'est AFFICHÉE que si elle est un chemin interne. Elle
   * vient de la chaîne de requête : sans ce contrôle, `?route=https://…`
   * écrirait une adresse étrangère dans notre page, ce qui est la moitié d'un
   * hameçonnage. Et elle n'est jamais rendue comme un lien.
   */
  const routeBrute = premiere(parametres.route);
  const route = /^\/[\w\-/[\]]*$/.test(routeBrute) ? routeBrute : null;

  const issue = sortie(role);

  return (
    <div className={styles.page}>
      <Carte className={styles.bloc} padding="lg">
        <p className={styles.surtitre}>Accès refusé</p>
        <h1 className={styles.titre}>Cette page n&apos;est pas pour votre compte</h1>

        <Alerte ton="or" titre="Vous êtes bien connecté">
          <p>
            Ce n&apos;est pas un problème de connexion : se reconnecter ne changerait rien.{' '}
            {route ? (
              <>
                La page <span className={styles.route}>{route}</span> appartient à
              </>
            ) : (
              <>Cette page appartient à</>
            )}{' '}
            l&apos;autre côté du service.
          </p>
        </Alerte>

        <div className={styles.explication}>
          <p>
            Artisans.ma a deux côtés qui ne partagent aucun écran. Un particulier publie un
            chantier et choisit un devis&nbsp;; un artisan chiffre des chantiers et tient son
            planning. {role ? `Vous avez ${NOM_DU_ROLE[role]}.` : null}
          </p>
          <p>
            Pour passer de l&apos;un à l&apos;autre, il faut un second compte&nbsp;: un même
            compte ne porte qu&apos;un rôle, parce que l&apos;API en décide à chaque opération.
          </p>
        </div>

        <div className={styles.issues}>
          <BoutonLien href={issue.chemin}>{issue.libelle}</BoutonLien>
          <BoutonLien variante="fantome" href={CHEMINS.monCompte}>
            Mon compte
          </BoutonLien>
        </div>
      </Carte>
    </div>
  );
}
