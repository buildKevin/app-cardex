# Coûts — ce qu'on paie, et les trois façons d'arrêter de le payer

État au 03/08/2026. **Rien de ce document n'est commencé.** C'est un plan.

Complément de [`STICKERS.md`](STICKERS.md), qui traite déjà *une* des trois voies
possibles (les assets de catalogue) et laisse ouverte la question du coût réel.
Ce document la ferme : les chiffres ci-dessous sont relevés sur les tarifs
officiels OpenAI et les réglages effectivement déployés, pas estimés au doigt
mouillé. Il ajoute aussi la voie que `STICKERS.md` n'envisage pas — le détourage
sur l'appareil, sans aucun modèle.

---

## 1. Ce qu'on paie aujourd'hui

Réglages en production : `gpt-image-1.5` en `quality: high`, 1024², via
`/v1/images/edits`, et `gpt-4o-mini` pour la vision (`VISION_MODEL` non défini,
donc c'est le défaut du code).

| Poste | Calcul | Coût |
|---|---|---|
| **1 sticker** | 4 160 tokens de sortie × 32 $/M | **0,133 $** |
| ↳ entrée du même appel | ~350 tokens de prompt (5 $/M) + l'image en `input_fidelity: high` (8 $/M) | ~0,01–0,05 $ |
| **1 scan** | ~25 000 tokens d'image × 0,15 $/M + 200 tokens de sortie | **~0,004 $** |
| 1 fiche de voiture inconnue | ~500 tokens, sans image, `temperature: 0` | ~0,0002 $ |
| Supabase | ~3,5 Mo stockés par joueur, ~11 invocations | < 0,001 $ |

**Un free user coûte donc ~0,19 $ sur toute sa vie**, dont **75 % pour son unique
sticker**. Plafond d'abus atteint (`p_call_ceiling` = 40 appels vision au lieu de
10 scans) : ~0,29 $.

Deux choses valent d'être notées :

**Le scan coûte étonnamment peu.** `gpt-4o-mini` facture une image ~33× plus de
tokens que `gpt-4o` pour arriver au même prix en dollars — d'où les 25 000 tokens
pour une photo de 1024 px. Malgré ça, dix scans gratuits coûtent 0,04 $, soit un
tiers d'un seul sticker. Le rationnement est au bon endroit.

**Le rapport à ce qu'on vend est très sain.** Un mois d'abonnement à 4,99 €
couvre ~25 free users à vie ; le lifetime à 69,99 € en couvre ~350. Autrement dit
4 % de conversion à un seul mois paie toute la cohorte gratuite. **Le coût n'est
pas un problème de survie** — c'est un problème de plafond : il croît avec le
nombre de joueurs, et c'est ça qu'on veut casser, pas la facture d'aujourd'hui.

Et le vrai motif reste celui de `STICKERS.md` : **les 30 secondes d'attente.**
Dans un jeu de collection, la récompense doit tomber tout de suite.

---

## 2. Le trou de mesure, à combler avant tout le reste

`identify-car` remonte `prompt_tokens` / `completion_tokens` sur `vision_called`,
et le commentaire au-dessus dit pourquoi : *« tokens are what the bill is
denominated in »*. Mais `restyle_delivered` ne remonte que des octets et une
durée — alors que c'est l'appel à 0,13 $.

L'API images renvoie un objet `usage` (tokens d'entrée, de sortie, et le détail
des tokens d'image en entrée). Deux lignes dans
`supabase/functions/restyle-photo/index.ts` et la fourchette « 0,01–0,05 $ »
ci-dessus devient un chiffre exact **par sticker**, segmentable par joueur dans
PostHog. C'est aussi la seule façon de mesurer honnêtement les leviers de la
section suivante.

À faire en premier, sans build natif, en une heure.

---

## 3. Les leviers gratuits (aucun changement d'architecture)

Tous réversibles, tous mesurables, aucun ne touche à la forme du produit.

### 3.1 `detail: 'low'` sur l'appel vision — ~9× sur les scans

L'appel n'envoie pas de `detail`, donc OpenAI traite la photo en haute
définition : ~25 000 tokens. En `low`, c'est un forfait de 85 tokens côté
`gpt-4o` — soit ~2 800 sur mini, **0,0004 $ au lieu de 0,0038 $.**

Le risque est réel : une voiture petite dans le cadre devient illisible. Mais il
est **mesurable sans deviner** — `identify-car` remonte déjà `matched`, donc un
A/B sur le taux d'identification tranche en quelques jours. À essayer sur une
fraction des scans, pas sur tous.

### 3.2 Attention à `MAX_WIDTH` si on veut réduire l'image en entrée

Dans `src/services/photo.ts`, `preparePhoto()` produit **un seul** rendu à 1024 px
et le sert deux fois : le `base64` part au modèle de vision, et l'`uri` est la
photo stockée — qui est aussi **l'entrée du sticker**. Réduire `MAX_WIDTH` pour
économiser sur la vision dégraderait donc la source du sticker, où la finesse est
exactement ce qui rend la voiture reconnaissable.

S'il faut réduire, il faut deux rendus : un petit pour le modèle, le 1024 px pour
le disque. Sinon on paie l'économie sur l'autre poste.

### 3.3 `quality: 'medium'` sur le sticker — 0,133 $ → 0,034 $

−75 % sur le poste le plus lourd, un seul secret à changer (`IMAGE_QUALITY` est
déjà lu depuis l'environnement, donc **sans redéploiement de code**).

À faire les yeux ouverts : `AGENTS.md` consigne que `quality: low` a été une
erreur, parce que les détails qui rendent une voiture reconnaissable — jantes,
calandre, ligne d'épaule — sont les premiers que perd un rendu basse qualité, et
que le bord d'un die-cut *est* l'objet. `medium` n'a jamais été essayé. Ça se
juge sur une dizaine de voitures côte à côte, pas sur une.

### 3.4 PNG → WebP — sur le stockage et l'egress

`background: transparent` accepte **png ou webp**, et un webp avec alpha fait
typiquement 3 à 5× moins lourd qu'un png 1024². Ça ne touche pas la facture
modèle, seulement les deux postes qui grossissent avec le nombre de joueurs.

Piège : `persistStyledPhoto()` fait `remotePath?.endsWith('.png') ? 'png' : 'jpg'`
— un webp serait donc écrit en `.jpg` sur le disque. `expo-image` renifle le
contenu et l'afficherait quand même, mais l'extension mentirait. À corriger dans
le même geste.

### 3.5 Gemini est déjà câblé

`IMAGE_PROVIDER=gemini` bascule sans toucher au code, et coûte une fraction
d'OpenAI par image. Le prix consigné dans `AGENTS.md` : Gemini **ne sait pas
découper** — pas de canal alpha, donc on lui demande un fond blanc plat, ce qui
« lit comme un die-cut sur notre canvas blanc et nulle part ailleurs ». Tant que
le sticker ne sort pas de l'app, c'est tenable ; le jour où on veut un partage
sur fond quelconque, ça casse.

---

## 4. Les trois architectures possibles

|  | **Par photo, IA** (aujourd'hui) | **Catalogue pré-généré** ([`STICKERS.md`](STICKERS.md)) | **Détourage sur l'appareil** |
|---|---|---|---|
| Coût par sticker | 0,13 $ | 0 $ (une fois par *modèle*, ~17 $ pour les 125) | **0 $, toujours** |
| Latence | ~30 s | téléchargement, puis cache disque | **~200 ms** |
| Hors ligne | non | après le premier affichage | **oui, natif** |
| Uniformité de la grille | bonne (prompt épinglé) | **parfaite** (même lot) | **mauvaise** (garde la lumière de la photo) |
| « c'est *ma* voiture » | oui | non (couleur canonique) | **oui, littéralement** |
| Plafond de coût | croît avec les joueurs | **fixe** | **nul** |
| Effort | fait | script + relecture des 125 | module natif Swift + build |
| Marche pour une voiture hors catalogue | oui | non (il faut la générer) | **oui, sans rien générer** |

Les deux dernières lignes sont celles qui décident, et elles ne pointent pas dans
le même sens — ce qui suggère que ce n'est pas un choix unique. Voir la
recommandation en section 6.

---

## 5. Le détourage sur l'appareil, en détail

C'est ce que fait « détourer la voiture, contour blanc, et hop ». Ce n'est pas de
l'IA au sens d'un appel facturé : c'est une API système.

### 5.1 Ce que fournit iOS

`VNGenerateForegroundInstanceMaskRequest` (framework Vision, **iOS 17+**) : c'est
exactement le *lift subject* de l'app Photos quand on appuie longuement sur un
objet pour le décoller du fond. Sur l'appareil, ~100–300 ms, gratuit, hors ligne,
aucune permission nouvelle à déclarer.

L'observation renvoyée (`VNInstanceMaskObservation`) donne deux choses :

- `generateMaskedImage(ofInstances:from:croppedToInstancesExtent:)` — le sujet
  déjà découpé, si on ne veut rien faire de plus.
- `generateScaledMaskForImage(forInstances:from:)` — **le masque seul**, qui est
  ce qu'il faut pour dessiner le bord blanc soi-même.

En dessous d'iOS 17 il n'y a pas d'API : c'est un repli, pas un bug. On retombe
sur le redessin serveur, ou on n'offre rien — la même propriété que le reste de
l'app, où chaque service absent dégrade en no-op.

### 5.2 Le bord découpé blanc

Le masque en main, tout se fait en Core Image, en quelques passes :

1. **Dilater** le masque — `CIMorphologyMaximum`, rayon proportionnel à la
   largeur de l'image (~3 %, la même valeur que le prompt actuel demande).
2. **Lisser** l'arête — un petit `CIGaussianBlur` puis un seuillage, sinon le
   contour est en escalier là où le masque l'était.
3. **Composer** — le blanc masqué par le masque dilaté (`CIBlendWithMask`), puis
   le sujet par-dessus (`CISourceOverCompositing`).
4. **Cadrer** — canevas carré 1024², sujet centré avec une marge égale de tous
   les côtés.

L'étape 4 mérite d'être remarquée : c'est la règle de cadrage que le prompt
*demande* aujourd'hui (« centred, filling most of the frame with a small even
margin »). Faite en code, elle devient **exacte** au lieu d'être espérée. C'est
un des rares endroits où on gagne en qualité en enlevant le modèle.

### 5.3 Le module React Native

**Option A — un module Expo local. Recommandée.**

```
npx create-expo-module --local cardex-diecut
```

Ça crée `modules/cardex-diecut/` avec le côté Swift et le shim JS typé. Une seule
fonction async à exposer :

```swift
// modules/cardex-diecut/ios/CardexDiecutModule.swift — esquisse.
// Vérifier les signatures exactes contre la doc Vision au moment de coder.
AsyncFunction("cutOut") { (uri: String, promise: Promise) in
  guard #available(iOS 17.0, *) else { return promise.reject("unsupported", "iOS 17+") }

  let input = CIImage(contentsOf: URL(string: uri)!)!
  let request = VNGenerateForegroundInstanceMaskRequest()
  try VNImageRequestHandler(ciImage: input).perform([request])

  guard let observation = request.results?.first else {
    return promise.reject("no_subject", "aucun sujet détecté")
  }
  let mask = try observation.generateScaledMaskForImage(
    forInstances: observation.allInstances, from: handler
  )
  // → dilate, lisse, compose sur blanc, cadre en 1024², écrit un PNG/WebP
  promise.resolve(["uri": outputURL.absoluteString])
}
```

~150 lignes de Swift, une demi-journée avec les allers-retours de cadrage.
**Impose un build natif** — ce qui est déjà le mode de travail ici
(`./scripts/build-ios-production.sh`, local et gratuit), mais qui veut dire que
la feature n'existe pas dans Expo Go et que `AGENTS.md` demande un chargement
paresseux pour tout module natif (`require()` dans un `try/catch`, comme
`expo-image-picker` et les modules d'achat).

**Option B — `react-native-subject-lift`** (0.2.0, mars 2026, VisionKit iOS +
ML Kit Android). Une heure pour essayer, et ça donne Android en prime. Mais c'est
une 0.2.0 d'un seul auteur pour porter une feature centrale, et le bord blanc
resterait à dessiner de toute façon. Bon pour un prototype d'une soirée, pas pour
la version qui part sur l'App Store.

**Option C — `@shopify/react-native-skia`** pour le bord, si le masque vient
d'ailleurs. Inutile si le module Swift compose déjà : autant ne pas ajouter une
dépendance lourde pour une dilatation.

### 5.4 Comment ça se branche sur ce qui existe

C'est la bonne nouvelle : **presque rien à construire.**

- `styled_photo_path` / `styledPhotoUri` existent déjà sur la ligne et dans le
  store. `src/lib/photo.ts` est déjà le seul endroit qui décide quelle image un
  écran affiche, et `isSticker()` y pilote déjà le `contentFit: 'contain'` et la
  suppression de la plaque grise. Un détourage local, c'est un
  `setStyledPhoto(entry.id, uri, null)` et **aucun écran à toucher.**
- Le `null` en troisième argument est le point à décider : sans
  `styled_photo_path`, le sticker ne remonte pas au serveur et disparaît à la
  réinstallation. Deux réponses possibles, et la seconde est plus élégante :
  soit on l'upload dans le bucket `scans` (le client sait déjà le faire,
  `uploadPhoto()` dans `sync.ts`), soit **on ne stocke rien et on le
  re-fabrique à la demande** — c'est gratuit et instantané, donc le stockage et
  l'egress disparaissent aussi du tableau des coûts. Un sticker dérivable n'a pas
  besoin d'être archivé.
- La comptabilité ne bouge pas. `begin_restyle` / `commit_restyle` /
  `restyle_calls` continuent de garder **l'appel payant**. Le détourage ne passe
  jamais par la fonction edge, donc il n'a ni quota ni plafond à respecter, et la
  règle d'`AGENTS.md` (« refuser avant de payer, ne facturer que sur un résultat
  stocké ») reste vraie là où il y a quelque chose à payer.
- Analytics : **ne pas créer de nouveaux noms d'événements.** La règle est
  explicite — renommer un événement vivant coupe chaque funnel existant en deux.
  On garde `restyle_started` / `restyle_succeeded` et on ajoute une propriété
  `method: 'diecut' | 'redraw'`.

### 5.5 Ce que le détourage ne saura jamais faire

À lire avant de s'enthousiasmer, parce que c'est exactement l'argument de
`STICKERS.md` :

- **L'uniformité.** Un détourage **garde la photo** : ciel gris, reflets de
  trottoir mouillé dans la carrosserie, flou de bougé, et un bout de poubelle
  coupé au bord du masque. Vingt détourages côte à côte, ce sont vingt photos de
  téléphone avec un liseré blanc — pas une collection. Le redessin, lui, épingle
  la lumière, le vernis et la marge, et c'est *pour ça* que la grille se tient.
  Regarder vingt vignettes du concurrent, pas une seule, avant de trancher.
- **Le bon sujet.** Un passant à côté de la voiture, un rétroviseur ou un aileron
  rognés, un halo sur un fond chargé. Le modèle est plus indulgent.
- **Android**, et **iOS 16 et en dessous**.

---

## 6. La recommandation

`STICKERS.md` a raison sur le fond : **l'asset de catalogue reste le défaut.**
C'est la seule voie qui donne une grille parfaitement homogène, un coût
totalement plafonné, et l'instantané dès le premier affichage. Rien ici ne
change ça.

Mais le détourage résout précisément le point 4 de ce plan, qui est son maillon
faible. Aujourd'hui une voiture hors catalogue impose au premier découvreur ~30 s
d'attente et un appel d'image complet. Un détourage local lui donne son sticker
en 200 ms, gratuitement, sans rien générer et sans rien stocker — et « c'est
littéralement ta voiture, celle que personne n'avait encore trouvée » est un
meilleur trophée qu'un rendu canonique. **Les deux voies sont
complémentaires, pas concurrentes :** le catalogue pour les 125 voitures
connues, le détourage pour tout le reste.

Ordre à suivre :

| # | Quoi | Effet | Effort |
|---|---|---|---|
| 0 | Logger `usage` sur `restyle_delivered` (§2) | mesure exacte | 1 h, sans build |
| 1 | A/B `detail: 'low'` sur la vision (§3.1) | −90 % par scan | 1 ligne + un A/B |
| 2 | Essayer `quality: 'medium'` (§3.3) | −75 % par sticker | 1 secret, réversible |
| 3 | WebP + le bug d'extension (§3.4) | −70 % stockage/egress | 30 min |
| 4 | Le script des 125 assets ([`STICKERS.md`](STICKERS.md) §1–3) | plafonne le coût, tue l'attente | script + une session de relecture |
| 5 | Le module de détourage (§5) pour les voitures hors catalogue | tue la dernière attente et le dernier coût variable | une demi-journée + build natif |

Les étapes 0 à 3 sont à faire quoi qu'il arrive : elles ne coûtent rien, ne
changent pas le produit, et divisent la facture actuelle par ~4 avant même
d'avoir touché à l'architecture.

---

## 7. Où on arrive

| | Coût d'un free user à vie | Coût d'un sticker |
|---|---|---|
| Aujourd'hui | ~0,19 $ | 0,13 $ |
| Après les étapes 0–3 | **~0,04 $** | 0,034 $ |
| Après l'étape 4 (catalogue) | ~0,004 $ | **0 $** (amorti sur ~17 $ une fois) |
| Après l'étape 5 (détourage) | **~0,004 $, et plus rien qui croisse** | **0 $** |

Ne restent alors que les scans, qui sont le seul poste qu'on veuille garder
payant : c'est celui que Pro vend.
