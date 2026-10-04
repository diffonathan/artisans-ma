# Artisans.ma

Mise en relation entre particuliers et artisans du bâtiment, au Maroc.
Un client décrit son chantier, les artisans du secteur chiffrent, le client
choisit. Les avis affichés viennent de prestations réellement payées.

API GraphQL en **NestJS / MongoDB**. 74 tests automatisés contre un vrai
serveur MongoDB en replica set.

---

## Le problème

Faire venir un plombier chez soi, au Maroc, passe par le bouche-à-oreille et
un numéro recopié sur un bout de papier. Trois choses manquent, et ce sont
toujours les mêmes.

**On ne sait pas qui accepte de venir.** Un artisan n'a pas une zone, il a un
rayon — et ce rayon est propre à chacun. Le menuisier du village voisin ne se
déplace pas à 15 km ; le peintre d'Essaouira fait 170 km sans discuter.
Chercher « les artisans près de moi » ne répond donc pas à la bonne question.

**On ne sait pas combien ça coûte.** Il faut appeler trois personnes, expliquer
trois fois, et comparer de mémoire des prix annoncés au téléphone.

**On ne sait pas à qui faire confiance.** Et c'est là que la plupart des
places de marché trichent : elles affichent des étoiles sans pouvoir dire d'où
elles viennent.

---

## Ce que l'application fait

- un client publie un **besoin** : métier, description, adresse, budget ;
- les artisans dont le rayon couvre l'adresse le voient et proposent un
  **devis** — un seul devis vivant par artisan et par besoin ;
- le client en accepte un : les autres sont refusés, le besoin est attribué,
  une **réservation** naît avec le montant figé ;
- après paiement puis déclaration de fin par l'artisan, le client peut
  déposer **un avis, et un seul** ;
- la note de l'artisan est recalculée dans la même écriture que l'avis ;
- la recherche classe les artisans par note, puis par distance.

---

## La contrainte intéressante : garantir un avis sans clé étrangère

La promesse faite au visiteur est : *cet avis vient d'un client qui a
réellement payé cette prestation*. Il faut donc pouvoir répondre à quelqu'un
qui demande comment on l'empêche d'en inventer un.

### Ce que PostgreSQL ferait

Une clé étrangère `avis.reservation → reservations(id)`, et la base refuserait
physiquement un avis dont la réservation n'existe pas. Un déclencheur pourrait
même refuser l'insertion si la réservation n'est pas terminée.

### Ce que MongoDB n'a pas

Rien de tout cela. Pas de clé étrangère, pas de contrainte référentielle, pas
de déclencheur. `avis.reservation` est un champ de douze octets ; la base ne
sait pas qu'il désigne autre chose.

Dire « la base refuse » serait donc faux. Ce projet ne le dit pas.

### Ce qu'on met à la place, et qui tient

**1. Le droit d'avis est un jeton, consommé par comparaison-et-échange.**

La réservation porte un champ `avisDeposeA`, à `null` tant que personne n'a
noté. Déposer un avis ne commence pas par lire la réservation puis décider :
ça commence par l'écrire, en exigeant **dans le filtre** que le champ valait
`null`, que le statut est `TERMINEE`, et que le demandeur est bien le client.

```ts
const reservation = await this.reservations.findOneAndUpdate(
  { _id: entree.reservation, client, statut: TERMINEE, avisDeposeA: null },
  { $set: { avisDeposeA: new Date() } },
  { session, returnDocument: 'after' },
);
if (!reservation) throw new ConflictException(/* … */);
```

La vérification et la réservation du droit sont la **même écriture**, donc
indivisibles, sans verrou applicatif. Un `if (reservation.avisDeposeA === null)`
suivi d'une écriture laisserait passer deux avis déposés dans la même
milliseconde.

**2. Un index unique sur `reservation`** dans la collection des avis. Deuxième
barrière, redondante avec la première — volontairement : si un futur chemin de
code oublie de consommer le jeton, l'index refuse quand même.

**3. La transaction.** L'avis, le jeton consommé et la note moyenne de
l'artisan forment une seule écriture. Jamais d'avis sans jeton consommé,
jamais de note qui ne corresponde pas aux avis.

### Ce qui reste non garanti

Quelqu'un qui écrit **directement dans la base** — pas à travers l'API — peut
insérer un avis pointant vers une réservation inexistante. MongoDB
l'acceptera. En PostgreSQL, non.

La contrainte est donc remplacée par un **contrôle**, pas par une garantie :

```bash
npm run verifier-integrite
```

recense les avis orphelins, les réservations sans devis, les devis sans
artisan, et les notes moyennes qui ne correspondent plus aux avis. Il sort en
erreur s'il trouve quelque chose, ce qui permet de le brancher sur une tâche
planifiée.

C'est strictement plus faible qu'une contrainte, et un test le constate
explicitement : [`avis-verifie.spec.ts`](api/test/avis-verifie.spec.ts) insère
un avis orphelin, vérifie que MongoDB l'accepte, et vérifie que le contrôle le
voit.

---

## La recherche géographique

La question n'est pas « quels artisans sont à moins de 25 km ? » mais « quels
artisans acceptent de venir **ici** ? ». Le seuil change à chaque document.

`$geoNear` ne sait filtrer que sur **une** distance maximale, la même pour
tous : `maxDistance` est une constante du pipeline, elle ne peut pas lire
`$rayonKm`. D'où deux étages :

```ts
{ $geoNear: { near: …, distanceField: 'distanceMetres',
              maxDistance: PLAFOND_METRES, spherical: true,
              query: { metiers: metier, actif: true } } },
{ $match: { $expr: { $lte: ['$distanceMetres',
                            { $multiply: ['$rayonKm', 1000] }] } } },
```

Deux contraintes de `$geoNear` se paient comptant : il doit être le **premier**
étage du pipeline — d'où son paramètre `query` pour les filtres ordinaires — et
il **exige** l'index 2dsphere, sans se dégrader en balayage complet. Un test
supprime l'index et vérifie que la requête échoue avec un message explicite,
plutôt que de ralentir silencieusement.

Le test qui compte est celui-ci : **c'est le plus loin qui doit sortir.**

| artisan | distance de Marrakech | son rayon | retenu ? |
|---|---|---|---|
| Plomberie de Tahannaout | 30 km | 10 km | non |
| Plomberie d'Essaouira | 170 km | 200 km | **oui** |

Un `maxDistance` unique ne peut pas produire ce résultat : réglé à 30 km il
garderait le mauvais, réglé à 200 km il garderait les deux.

---

## Les preuves

Les garanties ci-dessus ne sont pas affirmées, elles sont mesurées.

### Deux avis simultanés : exactement un passe

```
Promise.allSettled([ deposer(5, …), deposer(1, …) ])
  → 1 réussi, 1 refusé, 1 avis en base, note de l'artisan = note de cet avis
```

Le test est **déterministe**, et ne « tente » pas de provoquer une collision en
espérant avoir de la chance. MongoDB n'a que trois manières de traiter deux
écritures sur le même document, et les trois mènent au même résultat :

- elles se sérialisent, et la seconde ne trouve plus `avisDeposeA: null` ;
- la seconde heurte l'écriture non validée de la première : MongoDB refuse
  immédiatement avec un conflit **étiqueté transitoire**, le pilote rejoue la
  transaction, et le rejeu retombe sur le cas précédent ;
- l'index unique refuse l'insertion.

C'est une différence de fond avec PostgreSQL, qui mérite d'être sue : en
PostgreSQL la seconde transaction **attend** sur le verrou de ligne puis
réévalue ; en MongoDB elle **échoue** tout de suite et c'est le pilote qui
rejoue. Le résultat observable est le même ; le rejeu automatique est
précisément ce qui fait tenir la comparaison-et-échange.

### Le N+1, compté et non affirmé

Dire « DataLoader évite le N+1 » ne prouve rien : c'est sa documentation. Le
test écoute l'événement `commandStarted` du pilote et **compte les commandes
réellement envoyées** sur la même requête GraphQL :

| | commandes MongoDB |
|---|---|
| 20 artisans, résolveur naïf | **21** |
| 20 artisans, chargeur groupé | **2** |
| 20 artisans, chargeur mal utilisé (`await` en boucle) | **21** |

La troisième ligne est écrite exprès. Le gain vient du regroupement **dans le
même tour de boucle d'événements** — `Promise.all`, pas `for await`. Avec un
`await` par élément, le chargeur est là et ne sert à rien. C'est l'erreur la
plus facile à commettre, et la plus silencieuse.

Un quatrième test demande les identifiants **à rebours** de l'ordre où l'index
les rendra. DataLoader associe les valeurs aux clés *par position* : rendre le
résultat brut d'un `$in` attribuerait le nom de Fatima au devis de Karim, sans
aucune erreur. Un test écrit avec deux documents insérés dans l'ordre croissant
ne le verrait jamais.

### L'indivisibilité, prouvée par l'échec

Accepter un devis fait quatre écritures : besoin attribué, devis accepté,
concurrents refusés, réservation créée. Le test fait **échouer la quatrième**
(une réservation occupe déjà l'index unique) et vérifie que les trois premières
sont annulées. Sans transaction, le besoin resterait attribué à un devis
accepté qui ne donne droit à aucune prestation — et les concurrents resteraient
refusés pour rien.

Le symétrique est testé sur l'avis : si l'insertion échoue, le droit d'avis
consommé à l'étape précédente est rendu. Sinon le client perdrait son droit
sans que l'avis existe, et rien n'expliquerait pourquoi.

### Le reste

- un montant **figé** : modifier le devis après acceptation ne change pas la
  réservation ;
- l'index unique **partiel** : un artisan ne peut pas déposer deux devis sur
  un besoin, mais peut en déposer un nouveau après avoir retiré le sien — ce
  qu'un index unique ordinaire interdirait pour toujours ;
- le **paiement rejouable** : la même notification reçue deux fois ne change
  rien et ne lève pas ; une notification portant une *autre* référence sur une
  réservation déjà payée lève, parce que ce n'est plus un doublon ;
- les **mots de passe** : deux écritures Unicode du même mot de passe se
  vérifient (`é` précomposé ou `e` + accent combinant — sinon un changement de
  clavier interdit la connexion) ; le même message d'erreur pour un e-mail
  inconnu et un mot de passe faux, avec le même temps de réponse ;
- le **parcours complet par HTTP** : dix étapes, de l'inscription à l'avis, en
  passant par les rôles et les jetons.

---

## Un défaut trouvé en construisant les écrans

Au moment de dresser l'inventaire des pages, le schéma a révélé un trou : la
requête `besoin(id)` était marquée **publique**. Elle rendait un `Besoin` dont
le champ `adresse` était exposé et dont `demandeur` résolvait un `Compte`
entier — e-mail et téléphone compris.

N'importe qui, sans jeton, pouvait donc lire les coordonnées d'un client en
connaissant un identifiant. Le commentaire de `besoinsPourMoi`, dans le même
fichier, promettait pourtant que l'adresse n'était visible que des artisans du
secteur. Le code disait le contraire de ce que le commentaire affirmait.

Deux corrections, et la seconde est la vraie.

**Exiger un compte** était nécessaire et très insuffisant : un compte se crée
en dix secondes, et aurait suffi à moissonner les coordonnées de tous les
clients.

**Déplacer la donnée** est ce qui règle le problème. L'adresse est désormais
**recopiée sur la réservation** à l'acceptation du devis, exactement comme le
montant. L'artisan retenu l'a parce qu'elle est chez lui ; les autres ne l'ont
pas parce qu'elle n'y est pas.

| Qui regarde | Sur le besoin | Sur sa réservation |
|---|---|---|
| personne (anonyme) | refusé | — |
| le client propriétaire | adresse + ses coordonnées | idem |
| un autre client | `null` | — |
| un artisan qui n'a pas gagné | `null`, et « Fatima B. » | — |
| **l'artisan retenu** | `null` sur le besoin | **adresse + téléphone** |

L'intérêt de ce détour n'est pas d'économiser un `if`. C'est qu'il n'y a plus
de `if` à oublier : un contrôle d'habilitation sur `Besoin.adresse` obligerait,
pour chaque besoin affiché, à demander « existe-t-il une réservation dont
l'artisan est le lecteur ? » — une question à reposer à chaque champ, à chaque
écran, et qu'un futur développeur peut omettre. La copie supprime la question.
C'est la même mécanique que les garanties du domaine : faire porter la règle
par la forme des données plutôt que par la vigilance du code.

Accessoirement, c'est aussi le modèle d'affaires : les coordonnées
n'apparaissent qu'avec la réservation, donc après que la commission est
acquise.

Le nom d'usage — « Fatima B. » — est réduit **côté serveur**. Une troncature
faite à l'affichage laisserait le patronyme entier traverser le réseau, où il
se lit dans n'importe quel outil de développement.

Douze tests dans
[`confidentialite.spec.ts`](api/test/confidentialite.spec.ts) vérifient les
**deux sens** de chaque règle : ce qui est refusé, et ce qui doit rester
accessible. Un test qui ne vérifie que le refus laisse passer une correction
trop large, qui casse le parcours.

Trois lectures manquaient par ailleurs, et trois écrans étaient impossibles à
écrire correctement sans elles : `artisan(id)` pour ouvrir une fiche hors
recherche, `Reservation.chantier` pour que le client sache **de quel chantier**
parle une ligne à 450 DH, et `mesDevis` + `Devis.chantier` pour qu'un artisan
retrouve ce qu'il a chiffré. Elles passent toutes par les chargeurs groupés :
vingt réservations avec leur chantier et leur client coûtent **trois** requêtes,
pas quarante-et-une.

---

## Les choix, et ce qu'ils coûtent

### Un replica set à un seul nœud

MongoDB n'autorise les transactions multi-documents que sur un replica set. En
nœud unique classique, `session.startTransaction()` échoue.

Ce n'est pas un détail d'infrastructure : c'est ce qui décide si le domaine
peut garantir quoi que ce soit. D'où un replica set à un membre — le coût
d'exploitation d'un nœud, les garanties transactionnelles d'un cluster.

### La note moyenne est dupliquée

`artisan.noteMoyenne` est une copie de ce qu'on sait recalculer. Sans elle,
trier 400 artisans par note demanderait d'agréger leurs avis à chaque
recherche.

La contrepartie d'une donnée dupliquée est qu'elle peut mentir. Elle est donc
recalculée **dans la transaction** de l'avis qui la change, par une agrégation
sur la source — jamais par une moyenne glissante, qui dériverait au premier
avis supprimé ou modéré sans que rien ne le signale. Et le contrôle
d'intégrité vérifie l'égalité.

### Un seul module pour tout le domaine

Les six entités forment une chaîne : besoin → devis → réservation → avis.
Chaque transaction en touche plusieurs. Six modules obligeraient chacun à
importer la plupart des autres, et produiraient exactement les dépendances
circulaires que le découpage prétend éviter — `forwardRef` partout, ce qui est
l'aveu que la frontière est fausse.

La frontière utile est ailleurs : entre le **noyau** (configuration, base,
domaine) et le **transport** (GraphQL). Elle est réelle — la majorité des
tests démarrent le noyau seul, sans serveur GraphQL. Si une règle du domaine
cessait d'être vérifiable sans transport, c'est qu'elle aurait glissé dans un
résolveur.

### scrypt plutôt que bcrypt ou argon2

Les deux autres sont d'excellents choix, et des modules **natifs** : ils se
compilent à l'installation, et cette compilation échoue régulièrement selon la
machine. scrypt est dans la bibliothèque standard de Node, normalisé
(RFC 7914), et memory-hard comme les deux autres.

Son coût est réglable par l'environnement, et les tests l'abaissent — la suite
crée une soixantaine de comptes, soit treize secondes de calcul dont aucun
test n'éprouve la solidité. C'est sûr parce que l'empreinte **porte ses propres
paramètres** (`scrypt$N$r$p$sel$empreinte`) : une empreinte calculée à un coût
se vérifie sous un autre réglage. Et un test exerce explicitement le coût de
production, sinon l'abaissement serait un contournement.

---

## Les pièges rencontrés

Ils sont documentés à l'endroit du code qui les subit. Les quatre qui ont
coûté le plus :

**`Model.create` avec un objet seul perd la session.** Et ne se contente pas
de la perdre : il prend l'objet d'options **pour un second document à
insérer**. Sur un schéma avec des champs obligatoires, le résultat mesuré est
une `ValidationError` qui énumère tous les champs d'un document que personne
n'a écrit, sans mentionner ni la session, ni la transaction. Pendant ce temps
l'autre document a déjà été écrit hors transaction, et survit à l'annulation.
Mongoose avertit pour la session — une fois par processus, dans les journaux de
démarrage. Mesuré dans
[`unite-de-travail.spec.ts`](api/test/unite-de-travail.spec.ts).

**`directConnection=true` est obligatoire depuis l'hôte.** Le replica set
s'annonce sous le nom de ses membres — `localhost:27017`, vu de l'intérieur du
conteneur. Le pilote découvre la topologie, lit ce nom, et va s'y connecter.
Depuis l'hôte, où le port est publié sur 27018, cette adresse ne répond pas.
Les transactions continuent de fonctionner : c'est l'appartenance du nœud au
replica set qui les autorise, pas la façon dont le client s'y connecte.

**Un type-only import que `emitDecoratorMetadata` préserve casse le binaire
compilé — et seulement lui.** Le projet est en modules ES, mongoose est en
CommonJS. Node sait en tirer `Types`, `Model`, `Schema` ; il ne voit pas
`Connection`. Normalement l'import serait effacé, puisqu'il ne sert que comme
type — mais `emitDecoratorMetadata`, indispensable à l'injection de NestJS, a
besoin des types des paramètres de constructeur **pour les écrire** dans la
métadonnée, et préserve donc l'import. Les tests ne le voient pas : Vite fait
lui-même l'interop et sert l'export manquant. La suite passe au vert sur un
code qui ne démarre pas une fois construit.

**La « liste blanche » du `ValidationPipe` n'est pas le schéma GraphQL.** Elle
est faite des propriétés qui portent un décorateur de class-validator. Un
champ déclaré avec `@Field()` mais sans validateur est, selon le réglage,
silencieusement retiré de l'entrée ou refusé par un « Bad Request Exception »
qui ne nomme pas le champ coupable. D'où la règle tenue partout ici : chaque
champ d'entrée porte un décorateur, même quand GraphQL contraint déjà son type.

Deux autres sont documentés dans le code : l'ordre GeoJSON
`[longitude, latitude]`, qui ne provoque aucune erreur quand on l'inverse —
seulement une liste vide ; et l'impossibilité pour une transaction de créer
une collection, dont l'erreur parle de transaction et jamais de collection
manquante.

---

## Lancer le projet

Il faut Docker et Node 20 ou plus.

```bash
docker compose up -d
cd api && npm install
npm run semer     # construit, puis remplit la base d'un jeu de données jouable
npm run start:dev
```

L'API et son bac à sable sont sur <http://localhost:3000/graphql>.

```bash
npm run verifier            # types + 74 tests
npm run verifier-integrite  # contrôle référentiel
```

Les tests tournent contre le MongoDB du `docker-compose`, chacun dans sa
propre base. Pas de base simulée : la moitié de ce qui est testé n'existe que
dans un vrai serveur — transactions, index uniques partiels, `$geoNear`. Une
base simulée rendrait les tests verts sans rien prouver, ce qui est pire que
pas de test.

### Comptes de démonstration

Mot de passe commun : `demonstration-2026`

| rôle | adresse | état |
|---|---|---|
| client | `fatima.benjelloun@exemple.ma` | a déposé un avis |
| client | `leila.amrani@exemple.ma` | 2 besoins ouverts |
| artisan | `karim.plomberie@exemple.ma` | noté 5/5 |
| artisan | `said.electricite@exemple.ma` | 1 devis en attente |

Les coordonnées du jeu de données sont **réelles** — Marrakech, Tahannaout,
Essaouira, Casablanca, Agadir. Les distances calculées par la recherche sont
donc vérifiables sur une carte. Deux artisans ont un rayon choisi exprès pour
montrer l'effet du rayon propre à chacun.

---

## Ce que la base garantit, et par quel moyen

| règle | moyen | où |
|---|---|---|
| un e-mail, un compte | index unique | `compte.schema.ts` |
| un compte, un profil artisan | index unique | `artisan.schema.ts` |
| un devis vivant par (besoin, artisan) | index unique **partiel** | `devis.schema.ts` |
| un devis accepté, une réservation | index unique | `reservation.schema.ts` |
| une réservation, un avis | index unique | `avis.schema.ts` |
| avis seulement si prestation terminée et non notée | comparaison-et-échange dans une transaction | `avis.service.ts` |
| un seul devis accepté par besoin | comparaison-et-échange sur `statut: OUVERT` | `devis.service.ts` |
| la note = la moyenne des avis | recalcul dans la transaction + contrôle | `avis.service.ts` |
| l'avis référence une réservation réelle | **rien** — contrôle périodique | `verifier-integrite.ts` |
| l'adresse n'est lue que par le client et l'artisan retenu | l'adresse est **recopiée** sur la réservation, et les réservations ne sont atteignables que par leurs deux parties | `reservation.schema.ts` |
| les coordonnées du client ne fuient pas avant la réservation | `Besoin.demandeur` réservé au propriétaire ; les autres lisent `nomDemandeur` | `besoins.resolver.ts` |

La dernière ligne est la seule que MongoDB ne sait pas tenir. Elle est écrite
comme telle.

---

## Pile technique

| | |
|---|---|
| API | NestJS 12, GraphQL (Apollo Server 4), TypeScript 6 |
| Base | MongoDB 8 en replica set, Mongoose 9 |
| Tests | vitest, supertest, contre un vrai MongoDB |
| Authentification | JWT, scrypt (bibliothèque standard de Node) |
| Infrastructure | Docker Compose, Redis 8 |

---

## État et suite

**Fait** — le domaine complet (comptes, artisans, besoins, devis,
réservations, avis), l'API GraphQL avec rôles et chargeurs groupés, la
recherche géographique, le contrôle d'intégrité, le jeu de données, 74 tests.

**Reste** — l'interface web (Next.js), et le paiement par Stripe Connect en
mode test : le passage à `PAYEE` est aujourd'hui déclenché par une mutation,
alors qu'en production il viendrait de la notification signée du prestataire.
C'est écrit dans la description de cette mutation plutôt que caché : une démo
qui laisse croire que le client déclare lui-même ses paiements est une démo
trompeuse.

**Une transparence sur les tests** — sur une dizaine d'exécutions complètes de
la suite, une a échoué au démarrage d'un fichier sans que la cause soit
identifiée, et ne s'est pas reproduite depuis. C'est noté ici plutôt que passé
sous silence.
