# API Artisans.ma

Le pourquoi des choix, les preuves et les pièges rencontrés sont dans le
[README à la racine](../README.md). Ici, seulement comment s'en servir.

## Lancer

```bash
docker compose up -d        # depuis la racine du dépôt
npm install
npm run semer               # construit, puis remplit la base
npm run start:dev
```

API et bac à sache Apollo : <http://localhost:3000/graphql>

## Commandes

| commande | effet |
|---|---|
| `npm run verifier` | types (`tsc --noEmit`) puis les 62 tests |
| `npm test` | les tests seuls |
| `npm run test:watch` | les tests en continu |
| `npm run semer` | vide la base et la remplit d'un jeu jouable |
| `npm run verifier-integrite` | contrôle référentiel ; sort en erreur s'il trouve une anomalie |
| `npm run lint` | oxlint, avec analyse de types |
| `npm run build` | compile dans `dist/` |

## Organisation

```
src/
  noyau.module.ts        configuration + base + domaine, sans transport
  app.module.ts          le noyau + GraphQL
  configuration/         variables d'environnement, validées au démarrage
  base-de-donnees/
    unite-de-travail.ts  exécute un travail « tout ou rien »
    preparation-collections.ts   crée collections et index avant tout trafic
  commun/
    types.ts             Position GeoJSON, métiers, rôles
    chargeurs.ts         DataLoader par requête
    authentification.ts  garde JWT, décorateurs de rôle
    identifiants.ts      conversion sûre d'un ObjectId reçu de l'extérieur
  domaine/
    comptes/ artisans/ besoins/ devis/ reservations/ avis/
  outils/
    semer.ts             jeu de données, via les services du domaine
    verifier-integrite.ts
test/
  base-d-essai.ts        démarre l'application sur une base dédiée
  transpileur-typescript.ts   voir le README racine (swc inutilisable ici)
```

`schema.graphql` est produit au démarrage **et versionné** : un champ
nouvellement exposé doit apparaître dans un diff.

## Une note sur l'outillage

Deux binaires natifs refusent de se charger sur la machine de développement,
et les deux ont été remplacés plutôt que contournés.

**swc**, que `unplugin-swc` utilise pour produire `emitDecoratorMetadata` dans
les tests, refuse de matérialiser son binaire :

```
SWC native addon: validate cache root C:\Users\...\AppData\Local\swc:
DACL grants replacement rights 0x1f01ff to SID S-1-15-3-...
```

Il vérifie les droits du dossier où il recopie son binaire et remonte la
chaîne des parents. Déplacer le cache ne change rien : le contrôle remonte
jusqu'à `C:\`, dont les droits sont ceux de Windows. `SWC_NATIVE_BINDING_CACHE`
n'y peut rien. Remplacé par `ts.transpileModule`, en pur JavaScript — voir
[`test/transpileur-typescript.ts`](test/transpileur-typescript.ts).

**`tsgolint`**, que `oxlint --type-aware` lance, ne peut pas être exécuté du
tout (`spawnSync … UNKNOWN`). Le script `lint` se limite donc à oxlint, qui
passe sans remarque. La vérification des types n'est pas perdue pour autant :
`npm run verifier` lance `tsc --noEmit`, qui est plus strict que ce que le
linter type-aware aurait dit.
