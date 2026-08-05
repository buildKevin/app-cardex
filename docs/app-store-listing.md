# App Store Connect — le parcours complet, champ par champ

Organisé par **écran**, dans l'ordre où les remplir. Les libellés sont ceux de
l'interface française. Les limites de caractères sont celles d'Apple, et les
compteurs annoncés ici sont vérifiés.

Deux réflexes valables partout :

- **Enregistrer** est en haut à droite et ne se déclenche jamais tout seul. Un
  champ modifié sans enregistrement est perdu au changement de page.
- Un produit rattaché à un **brouillon de soumission** a ses métadonnées gelées.
  Si un champ est en lecture seule, c'est ça — retire le produit du brouillon, ou
  passe par l'API.

---

## Écran 1 — Général → Informations sur l'app

Ce sont les données de l'app, pas de la version : elles ne changent pas à chaque
mise à jour.

| Champ | Valeur |
| --- | --- |
| Nom | `CarDex - Car Spotting` (21/30) |
| Sous-titre | `Chaque voiture est une carte` (28/30) |
| URL de la politique de confidentialité | `https://playful-text-ba5.notion.site/Politique-de-confidentialit-CarDex-3b1b30ab770480a1bd2ccc8be82d98a2` |
| Catégorie primaire | **Style de vie** |
| Catégorie secondaire | **Jeux** |
| Droits sur le contenu | *Ne contient pas, n'affiche pas ou n'accède pas à du contenu tiers* |

Deux variantes de sous-titre tenant dans la limite, si celui-là ne te plaît pas :

```
Repère, scanne, collectionne     (28)
Ton garage de voitures croisées  (30)
```

**Pourquoi Style de vie en primaire et pas Jeux.** Le réflexe est de mettre Jeux,
puisque c'est un jeu de collection. C'est un mauvais calcul de visibilité : Jeux
est la catégorie la plus disputée de l'App Store et CarDex y serait noyé entre
deux studios. Style de vie est peuplé d'utilitaires, et « car spotting » y a une
place réelle. Choisir Jeux en primaire **oblige** en plus à renseigner deux
sous-catégories de jeu, ce qui te range explicitement face aux jeux mobiles.
C'est éditable ensuite sans nouveau binaire.

### Classification par âge

Même écran, section **Classification par âge** → **Modifier**. Un questionnaire
s'ouvre. Les réponses pour CarDex :

- Violence, contenu sexuel, nudité, langage grossier, thèmes d'horreur, alcool,
  tabac, drogues, jeux d'argent, contenu médical → **Aucun** partout
- Accès web non restreint → **Non**. L'app n'ouvre que tes trois pages Notion,
  dans un navigateur in-app, jamais une adresse arbitraire
- Contenu généré par les utilisateurs → **Non**. Il n'y a ni chat, ni profil
  public, ni flux : aucun joueur ne voit le contenu d'un autre
- Contrôles parentaux → sans objet

Résultat attendu : **4+**.

Un point à connaître sur la dernière réponse : les fiches de voitures découvertes
circulent bien entre joueurs, mais elles ne contiennent aucun texte écrit par un
utilisateur — seulement des caractéristiques de voiture produites par un modèle.
Ce n'est pas de l'UGC au sens d'Apple.

---

## Écran 2 — App Store → Confiance et sécurité → Confidentialité de l'app

Le questionnaire le plus long, et celui où une erreur se paie cher. Six types de
données à déclarer, et **jamais de suivi**.

Pour chaque type, trois questions reviennent : à quoi ça sert, est-ce lié à
l'identité, est-ce utilisé pour le suivi.

| Type de donnée | Utilisation | Liée à l'identité | Suivi |
| --- | --- | --- | --- |
| **Coordonnées → Adresse e-mail** | Fonctionnalité de l'app | Oui | **Non** |
| **Contenu utilisateur → Photos ou vidéos** | Fonctionnalité de l'app | Oui | **Non** |
| **Contenu utilisateur → Autre contenu** (le pseudo) | Fonctionnalité de l'app | Oui | **Non** |
| **Identifiants → ID utilisateur** | Fonctionnalité de l'app, Analyses | Oui | **Non** |
| **Utilisation → Interaction avec le produit** | Analyses | Oui | **Non** |
| **Diagnostics → Données de plantage et de performance** | Analyses | Oui | **Non** |
| **Achats → Historique d'achat** | Fonctionnalité de l'app, Analyses | Oui | **Non** |

Ce qu'il faut **ne pas** déclarer, parce que l'app ne le fait pas :

- **Aucune localisation**, ni précise ni approximative — `expo-location` n'est
  même pas installé
- **Aucune donnée publicitaire**, aucun IDFA, aucun courtier en données
- **Aucun contact**, aucun carnet d'adresses
- **Aucune donnée financière** — Apple traite le paiement, nous ne voyons jamais
  de coordonnées bancaires

**« Suivi » veut dire une chose précise chez Apple** : relier les données à
d'autres apps ou sites pour de la publicité ou du courtage. CarDex ne le fait
nulle part. Répondre « oui » par excès de prudence déclencherait l'obligation
d'App Tracking Transparency et une popup de consentement pour rien.

Deux précisions honnêtes sur ce tableau :

- L'adresse e-mail est déclarée parce que Supabase la stocke à la connexion
  Apple. Elle n'est **jamais** envoyée à PostHog — `identify()` ne pose que le
  fournisseur et un booléen `has_email`.
- La photo de profil, elle, n'est pas déclarée : elle ne quitte jamais l'appareil.
  Ce qui reste sur le téléphone n'est pas une collecte.

C'est toi qui signes cette déclaration, donc relis-la plutôt que de me faire
confiance les yeux fermés. Elle décrit ce que fait le code aujourd'hui.

---

## Écran 3 — Distribution → App iOS → 1.0

La page de la version. C'est ici que se joue l'essentiel.

### Captures d'écran

Onglet **iPhone 6,7"** — obligatoire. `supportsTablet` est à `false` dans
`app.json`, donc **aucune capture iPad n'est demandée**.

- Dimensions : **1290 × 2796** (ou 1284 × 2778)
- Minimum 3, maximum 10
- Pas de coins arrondis à ajouter, Apple ne les applique pas ici

Les cinq écrans qui vendent CarDex, dans cet ordre :

1. Le garage rempli — c'est la promesse en une image
2. Le scanner en visée sur une voiture
3. La révélation d'une voiture rare, avec ses XP
4. L'onglet Collections et ses marques
5. Un sticker « Embellir », avant / après si tu peux le composer

### Les champs texte

| Champ | Limite | Valeur |
| --- | --- | --- |
| Texte promotionnel | 170 | `Nouveau : chaque voiture scannée devient un sticker, détouré automatiquement sur ton téléphone. Et « Embellir » le redessine en illustration de collection.` |
| Mots-clés | 100 | voir ci-dessous |
| URL de support | — | `https://playful-text-ba5.notion.site/Support-CarDex-3b1b30ab77048015aa85efbd94fcd82f` |
| URL marketing | — | facultatif, laisse vide |
| Copyright | — | `2026 Kevin Stacchetti` |

Le **texte promotionnel** est le seul champ modifiable **sans passer par une
review**. Garde-le pour ce qui bouge : une nouveauté, une opération. Ne mets pas
là ce qui doit être dans la description.

**Mots-clés** — 99 caractères, séparés par des virgules, **sans espaces** :

```
auto,car,spotting,collection,scanner,identifier,supercar,garage,marque,modele,tuning,jeu,quiz,photo
```

Trois règles qui gouvernent ce champ :

- **Ne répète pas** les mots du nom ni du sous-titre, Apple les indexe déjà
- **Pas d'espace après les virgules**, chacun compte
- **Aucun nom de marque.** « ferrari », « porsche » dans les mots-clés, c'est du
  référencement sur marque déposée. Contrairement aux logos, ce n'est pas une
  zone grise : c'est un motif de rejet net

### Description (4000 max)

```
Chaque voiture croisée dans la rue est une carte à collectionner.

Tu photographies une voiture, CarDex l'identifie, et elle rejoint ton garage.
Une citadine rapporte peu. Une supercar rapporte gros. Une voiture que personne
n'avait encore trouvée rapporte plus encore.

COMMENT ÇA MARCHE

Pointe l'appareil photo sur une voiture et déclenche. L'identification reconnaît
la marque, le modèle, la génération et l'année, puis calcule les points selon la
rareté du modèle.

CE QUE TU COLLECTIONNES

25 marques, 125 voitures au catalogue, et 29 badges à débloquer. Chaque marque a
sa progression : complète Ferrari, complète Porsche, et regarde ton garage se
remplir. Les badges se calculent tout seuls à partir de ce que tu possèdes.

LES VOITURES HORS CATALOGUE

Tu tombes sur une Pagani ? Elle n'est pas dans le catalogue, et pourtant elle est
notée : une fiche est créée, et elle vaudra la même chose pour tout le monde. Ta
découverte enrichit le jeu de tous les joueurs.

TES VOITURES, EN STICKERS

Chaque voiture scannée est détourée automatiquement, directement sur ton
téléphone : ton garage est une planche de stickers, pas une pellicule photo.
Et « Embellir » va plus loin — ta photo est redessinée en illustration de
collection. L'originale n'est jamais écrasée, tu peux revenir en arrière quand
tu veux.

CARDEX PRO

La version gratuite donne 10 scans, et le sticker découpé sur chaque voiture.
CarDex Pro lève la limite de scans et débloque « Embellir », 30 par mois.

- Mensuel — 4,99 € par mois, abonnement à renouvellement automatique
- Annuel — 29,99 € par an, abonnement à renouvellement automatique
- À vie — 69,99 €, paiement unique, sans renouvellement

Un scan qui échoue, ou une voiture que nous ne savons pas identifier, ne t'est
jamais compté.

CONDITIONS D'ABONNEMENT

Le paiement est débité sur le compte Apple à la confirmation de l'achat. Un
abonnement se renouvelle automatiquement, au même tarif, sauf résiliation au
moins 24 heures avant la fin de la période en cours ; le compte est débité dans
les 24 heures qui précèdent le renouvellement. La gestion et la résiliation se
font après l'achat dans les réglages du compte Apple.

Conditions d'utilisation (EULA) : https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Conditions d'utilisation CarDex : https://playful-text-ba5.notion.site/Conditions-d-utilisation-CarDex-3b1b30ab77048020aa36c37e0107cf7e
Politique de confidentialité : https://playful-text-ba5.notion.site/Politique-de-confidentialit-CarDex-3b1b30ab770480a1bd2ccc8be82d98a2

SANS COMPTE SI TU VEUX

CarDex fonctionne sans créer de compte : ton garage reste sur ton téléphone. Avec
un compte, il est sauvegardé et te suit d'un appareil à l'autre.

Pas de publicité. Pas de suivi publicitaire. Jamais.

---

L'identification repose sur un modèle d'intelligence artificielle : elle se
trompe, en particulier sur les générations proches. Les caractéristiques
affichées sont indicatives et n'ont aucune valeur d'expertise.
```

**Le bloc « CONDITIONS D'ABONNEMENT » n'est pas décoratif, et il a coûté un
rejet.** La 1.0.0 (14) a été refusée le 5 août 2026 sous **3.1.2 Business:
Payments - Subscriptions**, par un contrôle automatique : *« offers
auto-renewable subscriptions but does not include a functional link to the Terms
of Use (EULA) in the app's metadata »*. Les liens dans le paywall ne comptent
pas — Apple exige que la **description** porte elle-même un lien vers les
conditions, en plus de l'in-app. Trois choses à savoir :

- **Le lien vers l'EULA standard d'Apple est celui que le contrôle cherche.**
  Nos CGU sont ajoutées à côté : ce sont des conditions de service, elles ne
  remplacent pas l'EULA. L'autre voie — coller un EULA personnalisé dans
  *Informations sur l'app → Contrat de licence* — fait relire le texte entier et
  ouvre un second motif de rejet, pour un champ que personne n'a demandé.
- **La durée est écrite à côté du prix.** La même règle exige titre, durée et
  prix par unité ; « Mensuel 4,99 € » les mélangeait.
- **C'est une correction de métadonnées, pas de binaire.** Le build 14 est
  toujours valable : on modifie la description de la version refusée et on
  soumet à nouveau.

### Build

Section **Build**, bouton `+`. Il n'apparaît qu'une fois l'`.ipa` traité par
Apple — 5 à 15 minutes après l'upload, statut « En cours de traitement » d'abord.

### Informations pour la vérification de l'app

| Champ | Valeur |
| --- | --- |
| Prénom / Nom | Kevin Stacchetti |
| Téléphone | ton numéro, avec l'indicatif `+33` |
| E-mail | `kevinstacchett@gmail.com` |
| Connexion requise | **décoché** |

Décocher *Connexion requise* est important et c'est un argument en ta faveur :
l'app est intégralement utilisable sans compte, donc tu n'as aucun compte de test
à fournir. Si tu voulais quand même en donner un, ne donne pas ton compte
personnel.

**Notes** — c'est la note de review de l'**app**, différente de celles des
produits :

```
Bonjour, et merci pour votre temps.

COMMENT TESTER LE SCAN SANS VOITURE
CarDex identifie une voiture depuis l'appareil photo. Il n'est pas nécessaire
d'avoir une vraie voiture devant vous : affichez la photo d'une voiture sur un
écran (ordinateur, autre téléphone, ou une simple recherche d'images) et visez-la
avec l'appareil photo depuis l'onglet Scanner. L'identification fonctionne
normalement sur une photo d'écran.

Pour de meilleurs résultats, choisissez une photo de trois quarts avant, cadrée
sur toute la voiture. Une berline courante et une supercar donnent des scores
différents, ce qui permet de voir le calcul de rareté.

AUCUN COMPTE N'EST NÉCESSAIRE
L'onboarding est sautable. « Continuer sans compte » donne accès à l'intégralité
de l'app, avec un garage stocké localement. La connexion par Sign in with Apple
sert uniquement à sauvegarder et restaurer la collection.

SUPPRESSION DE COMPTE
Profil → Supprimer mon compte. Suppression immédiate et définitive du compte, du
garage et des photos, conformément à 5.1.1(v).

ACHATS INTÉGRÉS
Le paywall est accessible depuis Profil → CarDex Pro, ou après le 10e scan.
Trois produits : abonnement mensuel, abonnement annuel, et un non-consommable à
vie. Les trois débloquent le même accès.

CONFIDENTIALITÉ
Les photos prises sont envoyées à un service d'identification tiers, et — pour
la fonction « Embellir », réservée aux abonnés — à un service de génération
d'images. Le sticker détouré affiché après chaque scan est, lui, fabriqué sur
l'appareil, sans envoi. C'est décrit dans la politique de confidentialité,
accessible depuis le paywall et depuis le profil. La photo de profil, elle, ne
quitte jamais l'appareil.

Nous restons disponibles pour toute question.
```

**Le premier paragraphe est le plus important de toute la fiche.** Le scan passe
uniquement par l'appareil photo — `ImagePicker` ne sert qu'à l'avatar — et un
vérificateur assis à un bureau n'a pas de voiture à portée d'objectif. Sans cette
instruction, il ne peut pas essayer la fonction principale, et « impossible à
vérifier » est un motif de rejet à part entière.

### Diffusion de la version

Choisis **Diffuser cette version manuellement**. Tu contrôles le moment du
lancement au lieu de partir dès l'approbation, parfois en pleine nuit.

---

## Écran 4 — Monétisation, avant de soumettre

### Les deux abonnements

Rien à faire, tout est en place et vérifié via l'API : localisations, prix sur
175 territoires, notes de vérification, captures, `privacy_policy_url`.

Ils affichent **« Finaliser avant soumission »** et resteront ainsi : la bannière
d'App Store Connect le dit — *« Votre premier abonnement avec renouvellement
automatique doit être soumis avec une nouvelle version de l'app. »* Le statut
bascule à la soumission, pas avant. Ne le chasse pas.

Sur la page de la version, section **Achats intégrés et abonnements**, ajoute les
trois produits à la soumission. C'est aussi ce que fait le bouton
**« Ajouter pour vérification »** depuis la fiche d'un produit.

### Le « à vie »

**Monétisation → Achats intégrés → CarDex Pro à vie.** Quatre choses à vérifier,
c'est un non-consommable et ses exigences diffèrent d'un abonnement :

- **Localisations App Store** → Français (France), nom + description (45 max)
- **Informations de vérification** → capture d'écran **et** notes
- **Tarification** → 69,99 €
- **Catégorie d'imposition** → renseignée, ou *Faire correspondre à l'app parente*

---

## Écran 5 — Soumettre

Dans l'ordre :

1. Le build est sélectionné
2. Les trois produits sont attachés à la soumission
3. **Ajouter pour vérification** → **Soumettre à l'examen**

Ce qui va se passer ensuite, pour ne pas t'inquiéter : les produits restent en
« Prêt à soumettre » jusqu'à l'approbation de la version, puisqu'ils partent en
review **attachés au binaire**. En sandbox TestFlight ils fonctionnent déjà, donc
tu peux tester l'achat de bout en bout sans attendre l'approbation.

---

## Ce qui reste hors App Store Connect

- **A18** — anonymous sign-in sur le projet Supabase, activé ou non. Sans lui,
  « Continuer sans compte » reste purement local et un joueur qui saute la
  connexion n'a pas de garage synchronisé
- Régénérer la clé secrète RevenueCat, passée en clair dans une conversation
- `EXPO_PUBLIC_REVENUECAT_TEST_KEY` dans `.env` : sans effet sur la production,
  mais elle masque les vrais prix en local tant qu'elle y est
