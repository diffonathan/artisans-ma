/**
 * Le contenu de la visite guidée, séparé du composant qui l'affiche.
 *
 * Séparé pour une raison précise : ce fichier n'est PAS marqué 'use client'.
 * Les constantes ci-dessous restent donc importables des deux côtés, là où les
 * exports d'un module 'use client' deviennent des références client et ne se
 * lisent plus depuis le serveur.
 *
 * L'en-tête, lui, redéclare `EVENEMENT_AIDE` au lieu de l'importer d'ici, et
 * ce n'est pas un oubli : l'importer tirerait les six étapes de prose de ce
 * fichier dans le paquet client de l'en-tête, donc sur toutes les pages. Le
 * raisonnement complet est dans `components/Enveloppe.tsx`. Le prix en est
 * qu'un renommage de l'événement se fasse aux deux endroits.
 */

/** Une étape : du texte, rien que du texte. Pas de HTML à interpréter. */
export interface EtapeVisite {
  titre: string;
  /** Un paragraphe par élément. */
  paragraphes: string[];
  /** Encadré optionnel : ce qu'il reste si on oublie le reste. */
  aRetenir?: string;
  /**
   * Comptes de démonstration, pour la dernière étape seulement. Une liste et
   * non de la prose : une adresse e-mail noyée dans un paragraphe ne se
   * sélectionne pas d'un double-clic.
   */
  comptes?: { role: string; adresse: string; etat: string }[];
}

/**
 * La clé de mémoire. Préfixée par le domaine parce que le navigateur partage
 * localStorage entre tout ce qui tourne sur la même origine — en
 * développement, c'est localhost:3100 (voir `.env.example` : le front déménage
 * sur 3100, l'API garde 3000). Un « visite-vue » nu serait lu par le voisin
 * qui prendrait ce port un jour.
 */
export const CLE_VISITE_VUE = 'artisans.ma:visite-vue';

/**
 * L'événement que l'en-tête émet sur `window` quand on clique sur « Aide ».
 *
 * Un événement et non une prop : la visite est montée une fois dans
 * l'enveloppe, le bouton « Aide » vit dans l'en-tête, et les deux peuvent se
 * trouver à n'importe quelle profondeur l'un de l'autre sans qu'on fasse
 * descendre un rappel à travers des composants serveur — qui ne savent pas en
 * transporter.
 *
 *     window.dispatchEvent(new Event(EVENEMENT_AIDE));
 */
export const EVENEMENT_AIDE = 'artisans:ouvrir-aide';

/**
 * L'attribut de repli, si l'en-tête préfère un bouton déclaratif à un
 * gestionnaire de clic : `<button data-aide>Aide</button>`. La visite écoute
 * les clics au niveau du document et reconnaît l'attribut.
 *
 * Deux contrats pour la même intention, parce qu'aucun des deux ne doit
 * obliger l'autre agent à rendre son en-tête client juste pour ouvrir une
 * modale.
 */
export const ATTRIBUT_AIDE = 'data-aide';

/**
 * Six étapes, et la première ne parle pas de l'écran.
 *
 * C'est la règle structurante de cette visite, et elle est contre-intuitive :
 * on a envie de commencer par « voici le menu ». Mais quelqu'un qui ne sait
 * pas POURQUOI l'outil existe ne retient pas comment il marche — il n'a nulle
 * part où ranger ce qu'on lui dit. Donc le problème d'abord, l'interface
 * ensuite.
 *
 * Le registre est descriptif : ce qui se passe quand on clique, et ce que le
 * serveur fait de la donnée. Pas de « simple », pas de « puissant » — un
 * adjectif de ce genre demande au lecteur de nous croire, alors qu'une phrase
 * qui décrit se vérifie en trois clics.
 */
export const ETAPES: EtapeVisite[] = [
  {
    titre: 'Pourquoi ce site existe',
    paragraphes: [
      "Faire venir un plombier chez soi, au Maroc, passe par le bouche-à-oreille et un numéro recopié sur un bout de papier. On appelle, on explique son chantier, on retient un prix de tête. Puis on recommence avec le deuxième nom qu'on a obtenu, et on compare de mémoire.",
      "Trois choses manquent, et ce sont toujours les mêmes. On ne sait pas qui accepte de se déplacer jusque chez soi : un artisan n'a pas une zone, il a un rayon, et ce rayon lui est propre. On ne sait pas combien ça coûte, faute d'avoir trois prix écrits côte à côte. Et on ne sait pas à qui faire confiance, parce que les étoiles affichées ailleurs ne disent jamais d'où elles viennent.",
      "Ce site répond à ces trois questions, et à rien d'autre.",
    ],
    aRetenir:
      "« Les artisans près de moi » n'est pas la bonne question. La bonne est : « qui accepte de venir ici ? » — et la réponse dépend de chaque artisan, pas d'une distance choisie par le site.",
  },
  {
    titre: 'Décrire son chantier',
    paragraphes: [
      "Vous publiez un besoin : le métier concerné, une description, l'adresse du chantier et, si vous voulez, un budget indicatif. C'est écrit une fois.",
      "Le besoin part ensuite vers les artisans de ce métier dont le rayon d'intervention couvre cette adresse. Les autres ne le voient pas — ni celui qui est trop loin pour lui, ni le carreleur quand vous cherchez un électricien.",
    ],
    aRetenir:
      "Votre adresse et vos coordonnées restent chez vous. Elles ne partent qu'à l'artisan dont vous acceptez le devis, et au moment où vous l'acceptez.",
  },
  {
    titre: 'Comparer les devis, en accepter un',
    paragraphes: [
      "Les artisans intéressés répondent par un devis : un montant, un créneau, un mot sur ce qu'ils comptent faire. Chacun n'en a qu'un à la fois sur votre besoin, donc la liste que vous lisez est bien la liste de vos options.",
      "Quand vous en acceptez un, quatre choses se produisent ensemble : le devis passe à « accepté », les devis concurrents passent à « refusé » sans que vous ayez à les décliner un par un, le besoin est marqué attribué, et une réservation naît avec le créneau convenu.",
      "Le montant de cette réservation est recopié depuis le devis, pas lu dedans. Si l'artisan modifie son devis ensuite, votre réservation ne change pas.",
    ],
    aRetenir:
      "Accepter un devis refuse les autres et fige le montant. C'est aussi le moment où les coordonnées circulent : l'artisan retenu reçoit votre adresse, les autres ne l'ont jamais eue.",
  },
  {
    titre: 'Les avis, et ce qui les rend vérifiables',
    paragraphes: [
      "Un avis n'apparaît ici que s'il vient d'une prestation payée, puis déclarée terminée par l'artisan. Il n'existe aucun formulaire d'avis ouvert : le droit de noter naît de la réservation, il appartient au client de cette réservation, et il ne sert qu'une fois.",
      "La note affichée sur la fiche d'un artisan est recalculée à partir de ses avis, dans la même écriture que l'avis qui la change. Elle ne peut donc pas s'écarter de ce que disent les avis que vous lisez juste en dessous.",
    ],
    aRetenir:
      "On ne peut pas noter un artisan chez qui on n'a rien fait faire. C'est la seule raison pour laquelle une note de 5 sur 5 veut dire quelque chose ici.",
  },
  {
    titre: 'Côté artisan',
    paragraphes: [
      "Un artisan déclare ses métiers, son adresse d'attache et son rayon d'intervention. Il voit ensuite les chantiers ouverts dans SON rayon — celui qu'il a choisi, et non une distance décidée par le site.",
      "La différence se mesure. Depuis un chantier à Marrakech, un plombier de Tahannaout à 30 km qui n'accepte que 10 km n'est pas sollicité ; un plombier d'Essaouira à 170 km qui accepte 200 km l'est. Un rayon unique de 25 km retiendrait le premier et oublierait le second.",
      "Il chiffre ce qui l'intéresse, retire son devis s'il change d'avis, et retrouve ses interventions acceptées dans son planning.",
    ],
  },
  {
    titre: 'Essayer avec les comptes de démonstration',
    paragraphes: [
      "Les personnes de cette démonstration sont inventées, mais les adresses sont réelles — Marrakech, Tahannaout, Essaouira, Casablanca, Agadir. Les distances affichées par la recherche se vérifient donc sur une carte.",
      "Connectez-vous avec l'un des comptes ci-dessous. Le mot de passe est le même pour tous : demonstration-2026",
      "Pour voir le parcours en entier, ouvrez un compte client et un compte artisan dans deux fenêtres : publiez un besoin d'un côté, il apparaît de l'autre si le rayon le couvre.",
    ],
    comptes: [
      { role: 'client', adresse: 'leila.amrani@exemple.ma', etat: '2 besoins ouverts' },
      { role: 'client', adresse: 'fatima.benjelloun@exemple.ma', etat: 'a déposé un avis' },
      { role: 'artisan', adresse: 'karim.plomberie@exemple.ma', etat: 'noté 5 sur 5' },
      { role: 'artisan', adresse: 'said.electricite@exemple.ma', etat: '1 devis en attente' },
    ],
    aRetenir:
      "Le passage au statut « payée » est déclenché ici par un bouton. En production il viendrait de la notification signée du prestataire de paiement : c'est écrit plutôt que caché, parce qu'une démonstration où le client déclare lui-même ses paiements serait trompeuse.",
  },
];
