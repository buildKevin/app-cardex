# Fiche App Store — brouillons à coller

Tout ce qui se remplit dans App Store Connect. Les limites de caractères sont
celles d'Apple, et les compteurs ci-dessous sont vérifiés.

---

## A13 — Nom, sous-titre, mots-clés, description

### Nom (30 max) — déjà posé

```
CarDex - Car Spotting
```

21 caractères. Le nom affiché sous l'icône vient de `app.json` (`CarDex`) et reste
indépendant : le suffixe ne se voit pas sur le téléphone, il ne sert qu'au
référencement dans l'App Store.

### Sous-titre (30 max)

```
Chaque voiture est une carte
```

28 caractères sur 30. Il dit la promesse plutôt que la fonction — c'est la ligne
que lit un joueur qui ne connaît pas l'app.

Deux variantes tenant dans la limite :

```
Repère, scanne, collectionne          (28)
Ton garage de voitures croisées       (30)
```

### Mots-clés (100 max, séparés par des virgules, **sans espaces**)

```
auto,car,spotting,collection,scanner,identifier,supercar,garage,marque,modele,tuning,jeu,quiz,photo
```

99 caractères. Trois règles qui gouvernent ce champ :

- **Ne répète pas** les mots du nom ni du sous-titre : Apple les indexe déjà, les
  redoubler gâche des caractères.
- **Pas d'espace après les virgules**, chacun compte.
- **Pas de nom de marque** — « ferrari », « porsche » dans les mots-clés, c'est
  du référencement sur marque déposée, et c'est un motif de rejet autrement plus
  net que les logos.

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

TES PHOTOS, EN STUDIO

Le restylage rejoue la photo de ton garage dans un décor — circuit, garage,
bord de mer. L'originale n'est jamais écrasée, tu peux revenir en arrière quand
tu veux.

CARDEX PRO

La version gratuite donne 10 scans et un restylage. CarDex Pro lève la limite de
scans et donne 30 restylages par mois.

- Mensuel 4,99 €
- Annuel 29,99 €
- À vie 69,99 €, paiement unique

Un scan qui échoue, ou une voiture que nous ne savons pas identifier, ne t'est
jamais compté.

SANS COMPTE SI TU VEUX

CarDex fonctionne sans créer de compte : ton garage reste sur ton téléphone. Avec
un compte, il est sauvegardé et te suit d'un appareil à l'autre.

Pas de publicité. Pas de suivi publicitaire. Jamais.

---

L'identification repose sur un modèle d'intelligence artificielle : elle se
trompe, en particulier sur les générations proches. Les caractéristiques
affichées sont indicatives et n'ont aucune valeur d'expertise.
```

### Catégorie

**Primaire : Style de vie. Secondaire : Jeux.**

Le réflexe est de mettre Jeux en primaire, puisque c'est un jeu de collection.
C'est un mauvais calcul de visibilité : Jeux est la catégorie la plus disputée de
l'App Store, et CarDex y serait invisible entre deux studios. Style de vie est
peuplé d'apps utilitaires, et « car spotting » y a une vraie place. Jeux en
secondaire garde la découverte par le loisir.

À noter : choisir Jeux en primaire **oblige** à renseigner deux sous-catégories
de jeu, ce qui te range explicitement face aux jeux mobiles.

C'est éditable dans *Informations sur l'app* sans nouveau binaire, donc ce n'est
pas un choix définitif.

---

## A16 — Notes pour la vérification

**Le point critique** : le scan passe **uniquement par l'appareil photo**, il n'y a
pas d'import depuis la photothèque (`ImagePicker` ne sert qu'à l'avatar). Un
testeur d'App Review est assis dans un bureau, sans voiture à portée d'objectif.
Sans instruction explicite, il ne peut pas essayer la fonction principale de
l'app — et « impossible à vérifier » est un motif de rejet à part entière.

La parade est gratuite et légitime : lui dire de viser une photo de voiture
affichée sur un écran. Ça fonctionne, le modèle identifie la voiture sur l'image.

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
vie. Les trois débloquent le même accès. Les tarifs affichés viennent de
StoreKit.

CONFIDENTIALITÉ
Les photos prises sont envoyées à un service d'identification tiers, et pour la
fonction de restylage à un service de génération d'images. C'est décrit dans la
politique de confidentialité, accessible depuis le paywall et depuis le profil.
La photo de profil, elle, ne quitte jamais l'appareil.

Nous restons disponibles pour toute question.
```

### Compte de test

À fournir **seulement** si tu veux qu'ils testent la synchronisation. Sinon,
« Sign-in not required » suffit, puisque l'app est intégralement utilisable sans
compte — et c'est un argument en ta faveur.

Si tu en fournis un, ne donne pas ton compte personnel : crée un compte Apple
dédié, ou utilise un utilisateur sandbox.
