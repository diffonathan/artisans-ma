# Artisans.ma — interface web

Front Next.js 16 (App Router, Turbopack) de l'API GraphQL qui vit dans
[`../api`](../api). Le domaine, les garanties et le vocabulaire sont décrits
dans [`../README.md`](../README.md) ; les couleurs, dans [`CHARTE.md`](CHARTE.md).
Ce fichier ne redit ni l'un ni l'autre.

---

## Lancer

L'API doit tourner d'abord — le navigateur n'appelle jamais l'API
directement, le jeton est dans un cookie `httpOnly` et toute lecture passe par
un composant serveur ou une Server Action.

```bash
# dans ../api, une fois
docker compose up -d
npm install && npm run semer && npm run start:dev   # API sur :3000

# ici
cp .env.example .env.local      # API_GRAPHQL=http://localhost:3000/graphql
npm install
PORT=3100 npm run dev           # front sur :3100
```

**`PORT=3100` n'est pas décoratif.** Sans lui, Next voit le 3000 occupé par
l'API et glisse silencieusement sur 3001 ; `API_GRAPHQL` désigne alors encore
le bon service, mais les cookies et les redirections ne parlent plus du même
hôte que ce que vous lisez dans la barre d'adresse. L'API garde 3000 : le
README racine, les tests et le bac à sable Apollo y pointent.

```bash
npx tsc --noEmit    # types
npm run build       # construction (Turbopack ; aucun drapeau à ajouter)
```

`next lint` n'existe plus en Next 16 ; il n'y a pas de script `lint`.

Comptes de démonstration et mot de passe commun : voir
[`../README.md`](../README.md), ou le bouton **Aide** de l'en-tête, qui ouvre
la visite guidée (dernière étape).

---

## Ce qui est fait

| | |
|---|---|
| Socle visuel | `app/globals.css` — jetons de la charte, verre, champs, nuit seule |
| Polices | `app/layout.tsx` — DM Sans (texte) et Azeret Mono (**nombres seulement**) |
| Marque | `brand/` — le poinçon, et son raisonnement dans `brand/README.md` |
| Appels à l'API | `lib/graphql.ts` — `appelerGraphQLAvecSession` joint le jeton du cookie |
| Session | `lib/session.ts` — cookie `httpOnly`, `exigerSession`, `exigerRole` |
| Erreurs | `lib/erreurs.ts` — `phraseDErreur` rend le message de l'API, jamais un texte maison |
| Authentification | `app/actions/authentification.ts` — inscription client/artisan, connexion, déconnexion |
| Primitives | `components/` — `Carte`, `Bouton`, `Champ`, `Etiquette`, `Montant`, `Note`, `Distance` |
| Enveloppe | `components/Enveloppe.tsx` — en-tête, navigation par rôle, pied |
| Chemins | `components/chemins.ts` — `CHEMINS`, **hors** de l'enveloppe : lire la valeur d'un module `'use client'` depuis une page serveur rend `undefined` (voir l'en-tête du fichier) |
| Visite guidée | `components/visite-guidee/` — 6 étapes, ouverte par l'événement `artisans:ouvrir-aide` |
| Accueil, 404, erreur | `app/page.tsx`, `app/not-found.tsx`, `app/error.tsx` |

---

## Ce qui reste

Toutes les routes de `CHEMINS` (`components/chemins.ts`) sauf `/`, plus la
page `/artisan` vers laquelle pointe la seconde entrée de l'accueil :

- `/recherche`, `/artisan`, `/connexion`, `/inscription`, `/inscription/artisan` ;
- côté client : `/mes-besoins`, `/publier-un-besoin`, `/mes-reservations`, `/mon-compte` ;
- côté artisan : `/chantiers`, `/mes-devis`, `/mon-planning`.

**Ces chemins ne sont pas typés.** Un `href` vers une route inexistante ne
lève aucune erreur de compilation, seulement un 404 à l'exécution. Importez
`CHEMINS` depuis `@/components/chemins` — et non depuis `@/components/Enveloppe`,
qui ne l'expose plus — plutôt que de recopier un littéral.

Deux dettes à solder dès la deuxième route écrite :

1. **`<Enveloppe>` et `<VisiteGuidee />` sont montés par `app/page.tsx`**, pas
   par `app/layout.tsx`. C'était le seul endroit possible quand l'accueil était
   la seule page. Ils doivent remonter dans la disposition racine —
   `<><Enveloppe …>{children}</Enveloppe><VisiteGuidee /></>` — sans quoi
   chaque nouvelle page naîtra sans en-tête, et deux instances de la visite se
   disputeraient le focus. L'en-tête de `app/page.tsx` le redit sur place.
2. **Pas de `proxy.ts`.** Aucune protection de routes au niveau du bord : la
   garde est celle de l'API, et `exigerSession` / `exigerRole` côté page. Si
   l'on en veut une, elle s'appelle `proxy.ts` (plus `middleware.ts` en
   Next 16), exporte une fonction nommée `proxy`, et peut lire le cookie
   `artisans_jeton` — mais sans jamais traiter le contenu du JWT comme une
   autorisation : seule l'API en vérifie la signature.

Côté produit, le paiement reste la mutation `payerReservation` ; Stripe
Connect en mode test n'est pas branché. C'est dit dans la description de la
mutation et répété dans la visite guidée, parce qu'une démonstration où le
client déclare lui-même ses paiements serait trompeuse.

---

## Les trois règles qui cassent le plus souvent

**Next 16, pas Next 15.** `cookies()`, `headers()`, `params` et `searchParams`
sont asynchrones — l'accès synchrone est supprimé, pas déprécié.
`middleware.ts` est devenu `proxy.ts`. `revalidateTag` exige un second
argument ; pour relire ses propres écritures après une mutation, c'est
`updateTag(tag)`, et `refresh()` pour rafraîchir le routeur client. La
frontière d'erreur reçoit `retry`, **pas** `reset`. `PageProps<'/route'>` et
`LayoutProps<'/'>` sont des types globaux générés par `npx next typegen`. En
cas de doute, la doc de la version installée est dans
`node_modules/next/dist/docs/01-app/` — pas en ligne.

**Aucune couleur hors de `CHARTE.md`.** Dans le code, `var(--…)` uniquement.
Seules exceptions, et elles sont forcées : `app/globals.css` (qui définit les
jetons), `brand/*.svg` et l'icône d'onglet — un document chargé comme image ne
résout aucune `var()`.

**Azeret Mono est réservée aux nombres.** Montants, distances, notes,
compteurs. La classe globale `.nombre` pour un nombre nu, `.montant` pour un
dirham (elle porte déjà la couleur `--or`, ne la réécrivez pas par-dessus).
Jamais sur de la prose, et pas non plus sur un extrait de code : celui-ci
prend la monospace du système.

## Les conventions tenues entre agents

Elles sont ici, et non dans [`AGENTS.md`](AGENTS.md) — qui ne porte que le bloc
que `next dev` y réécrit, sur Next 16 lui-même. Les en-têtes des fichiers
concernés les redisent sur place, avec la mesure qui les justifie.

**Le défaut est serveur.** Pas de `'use client'` sur un composant qui n'a ni
état ni gestionnaire d'événement. Une primitive sans directive est *partagée* :
un composant client qui l'importe l'emporte dans son graphe et peut lui passer
un `onClick`, un composant serveur l'utilise sans envoyer une ligne de
JavaScript. Poser la directive forcerait le second cas à devenir le premier —
voir l'en-tête de `components/Bouton.tsx`.

**Pas de fichier barillet.** Aucun `index.ts` qui ré-exporte : on importe par
chemin. Plusieurs agents écrivent en parallèle et s'y marcheraient dessus. Et
un ré-export depuis un module `'use client'` reste une référence client, donc
le piège décrit dans l'en-tête de `components/chemins.ts`.

**Pas de thème clair.** Aucun `prefers-color-scheme`, aucun basculeur, aucune
variante claire d'un jeton. Le socle est nuit, et c'est une règle de
[`CHARTE.md`](CHARTE.md), pas une préférence : la moitié des mesures de
contraste du projet ne tiennent que sur fond sombre.

**Le texte réservé aux lecteurs d'écran** est la classe globale
`.lecture-seule` de `app/globals.css`, jamais une copie dans un module.
