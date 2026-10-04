# Le paiement

Une place de marché ne vend rien : elle met en relation, et prend une
commission au passage. L'argent va du client à l'artisan, et il ne doit
**jamais** nous appartenir — encaisser sur notre compte puis reverser à la
main ferait de nous un établissement de paiement, ce qui demande un agrément.

Stripe Connect fait circuler l'argent sans qu'il nous appartienne.

---

## Le montage retenu : destination charge

Trois montages existent. Celui-ci encaisse sur notre compte, prélève la
commission (`application_fee_amount`), et transfère le reste au compte connecté
de l'artisan dans la même opération.

**Ce qu'il coûte, et qu'il faut savoir dire.** C'est nous qui apparaissons sur
le relevé bancaire du client, et c'est nous qui portons le risque d'impayé :
une contestation de carte nous est reprochée, pas à l'artisan. Le montage
*direct charge*, où l'artisan encaisse en son nom, inverse les deux.

Pour une place de marché naissante, porter le risque est le prix de la
confiance du client — il connaît la plateforme, pas l'artisan.

---

## Les trois choses qui doivent être vraies

### 1. Le montant ne traverse jamais le navigateur

C'est la faille la plus répandue des places de marché : le prix part au client,
revient modifié, et la commande est encaissée au tarif que l'acheteur a choisi.

Ici il n'a **aucun chemin** pour revenir. La mutation GraphQL n'offre pas de
champ de montant, et l'interface du prestataire (`paiement.port.ts`) n'en
accepte pas non plus. Le montant est lu sur la réservation, qui l'a figé à
l'acceptation du devis — dans la même transaction qui a refusé les concurrents.

La garantie ne vient pas d'un contrôle qu'on pourrait oublier d'écrire : elle
vient de ce que le chemin n'existe pas. Un test le prouve en **demandant** le
champ : la requête est refusée par la validation du schéma, avant toute
exécution.

### 2. La notification est vérifiée

Le point d'entrée `/paiement/notification` est **public**, et il doit l'être :
ce n'est pas un utilisateur qui appelle, c'est Stripe. Sans vérification de
signature, n'importe qui peut annoncer « paiement réussi » sur une réservation
qui ne l'est pas, et obtenir une prestation gratuite.

La signature couvre le corps entier. Un test modifie **un seul champ** après
signature : la notification est refusée.

Sans `STRIPE_SECRET_NOTIFICATION`, les notifications sont **refusées** plutôt
qu'acceptées sans contrôle.

### 3. Elle est rejouable

Stripe renvoie ses notifications — c'est documenté et voulu : il préfère
livrer deux fois que risquer de ne pas livrer. La seconde doit donc être sans
effet **et sans erreur**.

`enregistrerPaiement` filtre sur `statut: A_PAYER` : le second passage ne
trouve rien à modifier, et renvoie la réservation telle quelle. Ce n'est pas un
échec, c'est « l'état voulu est déjà atteint ».

---

## Pourquoi le point d'entrée répond 200 à presque tout

Un prestataire de paiement réessaie quand il reçoit autre chose qu'un 2xx,
pendant des heures, puis **désactive le point d'entrée**.

Répondre en erreur pour un événement qu'on ne sait pas traiter — un type qui ne
nous concerne pas, une réservation supprimée — ferait donc réessayer
indéfiniment une notification qui ne réussira jamais, et finirait par couper le
flux de celles qui, elles, comptent.

Les deux seuls refus sont ceux où la requête n'est pas légitime : signature
absente ou invalide.

> Ce comportement était écrit en commentaire avant d'être écrit en code : une
> réservation disparue remontait un 404. Un test l'a trouvé. Une promesse
> qu'aucune ligne ne tient est pire qu'une promesse absente.

---

## Le refus d'encaisser ce qu'on ne saura pas reverser

Un artisan peut ouvrir son compte et abandonner avant d'avoir fourni ses
pièces. Le compte existe, et **aucun versement n'est possible**.

`preparerPaiement` refuse tant que `charges_enabled` **et** `payouts_enabled`
ne sont pas tous deux vrais. Les deux, parce qu'un compte peut accepter des
paiements sans pouvoir recevoir de virement — l'argent reste alors bloqué chez
Stripe.

Encaisser quand même ferait porter au client le risque d'un artisan qui ne
termine jamais son inscription, et ferait de la plateforme le dépositaire de
fonds d'autrui.

---

## Deux pièges payés comptant

**Le corps brut.** La signature est calculée sur les octets exacts. NestJS
analyse le JSON par défaut, et la suite d'octets d'origine est alors perdue —
la ré-encoder avec `JSON.stringify` ne la retrouve pas : l'ordre des clés, les
espaces, les échappements peuvent différer. D'où `rawBody: true`, et la lecture
de `req.rawBody` plutôt que `@Body()`.

Le symptôme est cruel : la signature échoue **toujours**, le code paraît juste,
et l'on cherche la faute dans le secret ou dans l'horloge.

**La configuration qui diverge entre production et tests.** `rawBody: true`
était posé dans `main.ts`, que le montage de test n'emprunte pas : les huit
tests de notification échouaient en 400. Toute option qui change le
comportement doit être posée aux **deux** endroits, sinon les tests éprouvent
une application qui n'est pas celle qu'on déploie.

---

## Sans clé Stripe

L'application démarre avec un **prestataire factice**, et le parcours reste
jouable de bout en bout. C'est ce qui permet à quiconque clone le dépôt de voir
fonctionner la place de marché sans ouvrir de compte chez un prestataire.

Le faux n'est pas complaisant — un faux qui réussit toujours ne mesure rien :

| Il imite | Pour éprouver |
|---|---|
| une signature HMAC réelle | que le refus d'une signature fausse est testé |
| un compte **inactif** à la création | le refus d'encaisser avant les pièces |
| l'idempotence par clé | qu'un double clic ne crée pas deux intentions |

**Ce que ces 16 tests prouvent, et ce qu'ils ne prouvent pas.** Ils prouvent que
*notre* code se comporte bien. Ils ne prouvent pas que Stripe se comporte comme
on le croit — seul un essai en mode test contre leur serveur le dirait, et il
faut une clé pour cela.

Le danger du faux est qu'une clé oubliée en production passerait inaperçue.
Deux garde-fous : un avertissement nommant la variable manquante au démarrage,
et l'interface qui **dit à l'écran** que les paiements ne sont pas réels — le
dire dans un journal que personne ne lit ne suffirait pas.

---

## Mettre en service

```bash
STRIPE_CLE_SECRETE=sk_test_…
STRIPE_SECRET_NOTIFICATION=whsec_…
URL_PUBLIQUE=https://votre-service.onrender.com
```

Le point d'entrée à déclarer chez Stripe :
`https://votre-service.onrender.com/paiement/notification`, événement
`payment_intent.succeeded`.

Pour essayer en local :

```bash
stripe listen --forward-to localhost:3000/paiement/notification
```

Cette commande affiche le `whsec_…` à poser dans `STRIPE_SECRET_NOTIFICATION`.

> Stripe n'ouvre pas, à ce jour, de comptes connectés au Maroc. La
> démonstration déclare donc la France à la création du compte. C'est écrit
> dans `stripe.adaptateur.ts` plutôt que caché : un lecteur qui connaît le
> dossier le verrait tout de suite, et ne pas le dire décrédibiliserait le
> reste.
