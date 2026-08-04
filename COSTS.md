# Coûts — ce qu'on paie, et les trois façons d'arrêter de le payer

Chiffré le 03/08/2026. **Tranché et implémenté le 04/08/2026** — voir la
décision ci-dessous. Les sections 1 à 3 restent le relevé de ce qu'on payait ;
elles n'ont pas été réécrites au passé, parce que les leviers 3.1 à 3.4 sont
toujours à prendre et que les chiffres sont la seule raison de les prendre.

## La décision, et ce qui est construit

Le détourage sur l'appareil n'est plus « la troisième voie » : **c'est le
sticker par défaut de chaque voiture**, gratuit et illimité, et l'appel IA
devient l'option payante derrière un bouton « Embellir » réservé à Pro.

| | Gratuit | Payant |
|---|---|---|
| Quoi | die-cut détouré sur l'appareil | redessin IA complet |
| Où | `modules/cardex-diecut` (Swift, Vision + Core Image) | `restyle-photo` (edge function, OpenAI) |
| Quand | automatiquement, à la fin de chaque scan | sur demande, bouton « Embellir » |
| Coût | 0 $, toujours | ~0,13 $ |
| Latence | ~200 ms | ~30 s |
| Stocké | jamais — dérivé de `photo_path` | `styled_photo_path` |
| Champ | `diecutUri`, local uniquement | `styledPhotoUri` |

Ce que ça change au-delà du coût :

- **iOS uniquement.** Android n'est pas au programme, donc aucun repli à écrire.
  Sous iOS 17, `isAvailable()` répond faux et la voiture garde sa photo — la
  même dégradation que tout service absent dans cette app.
- **`p_free_limit` passe de 1 à 0.** Le paywall ne vend plus l'existence d'un
  sticker, il vend le meilleur des deux, sur une voiture que le joueur a déjà
  sous les yeux. C'est une comparaison au lieu d'un compteur.
- **Les 30 secondes disparaissent de l'onboarding**, qui ne fait plus aucun
  appel image. Effet de bord à connaître : la restauration du garage se cachait
  derrière cette attente, elle est maintenant attendue explicitement.
- **Les 125 assets de catalogue de [`STICKERS.md`](STICKERS.md) sont
  abandonnés.** Voir §6.

Complément de [`STICKERS.md`](STICKERS.md), qui traitait *une* des trois voies
possibles (les assets de catalogue) et laissait ouverte la question du coût réel.
Ce document la ferme : les chiffres ci-dessous sont relevés sur les tarifs
officiels OpenAI et les réglages effectivement déployés, pas estimés au doigt
mouillé.

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

Ce tableau a servi à trancher, mais la ligne qui a décidé n'y figure pas : **«
c'est *ma* voiture » ne se compare pas à « uniformité de la grille » sur la même
échelle.** La colonne de droite a gagné pour le gratuit et la colonne de gauche
reste ce que Pro vend. La colonne du milieu est abandonnée — voir §6.

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

**Option B — `react-native-subject-lift` : cul-de-sac, et pas pour la raison
qu'on croyait.** Ce document a d'abord écrit « VisionKit iOS + ML Kit Android,
une heure pour essayer » et se trompait. La lib (0.2.0, mars 2026, un seul
auteur) enveloppe `VisionKit.ImageAnalysisInteraction` — l'UI Live Text d'Apple,
celle qui exige un **appui long de l'utilisateur** — et non
`Vision.VNGenerateForegroundInstanceMaskRequest`. Ses propres types l'admettent :
*« VisionKit does not guarantee the bitmap exists at `shouldBeginAt` »*. Il n'y a
aucune API impérative, donc rien qui puisse tourner tout seul à la fin d'un scan.
Les deux noms se ressemblent et désignent deux API différentes ; c'est le piège à
retenir. Le module Swift n'était pas le plan B, c'était le seul plan.

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

C'est exactement l'argument de `STICKERS.md`, et c'est ce qui reste à vendre :

- **L'uniformité.** Un détourage **garde la photo** : ciel gris, reflets de
  trottoir mouillé dans la carrosserie, flou de bougé, et un bout de poubelle
  coupé au bord du masque. Vingt détourages côte à côte, ce sont vingt photos de
  téléphone avec un liseré blanc — pas une collection. Le redessin, lui, épingle
  la lumière, le vernis et la marge, et c'est *pour ça* que la grille se tient.
  **Cette objection avait tort sur un point, et c'est ce qui a débloqué la
  décision :** elle comparait au mauvais terme. Une grille de free user,
  aujourd'hui, ce n'est pas vingt redessins — c'est **un** sticker et dix-neuf
  photos brutes dans des plaques grises. Vingt die-cuts sont strictement plus
  homogènes que ça. Le détourage ne concurrence pas le redessin, il remplace le
  snapshot ; et ce qui reste de l'objection est précisément l'argument de vente
  d'« Embellir ». Deux choses la rendent moins forte qu'écrit ici : la géométrie
  est identique sur toutes les vignettes (même canevas, même bord, même marge),
  et elle est *exacte* alors que le prompt ne pouvait que la demander.
- **Le bon sujet.** Un passant à côté de la voiture, un rétroviseur ou un aileron
  rognés, un halo sur un fond chargé. Le modèle est plus indulgent. En pratique
  c'est la seule vraie erreur du détourage, elle est comptée dans
  `diecut_failed` avec `reason: 'no_subject'`, et la voiture garde sa photo.
- **Android**, et **iOS 16 et en dessous**. Sans objet ici : Android n'est pas au
  programme, et iOS 16 dégrade en no-op.

---

## 6. La décision prise, et pourquoi le catalogue tombe

Ce document recommandait d'abord de garder l'asset de catalogue comme défaut et
de réserver le détourage aux voitures hors catalogue — deux voies
complémentaires. **Ce n'est pas ce qui a été retenu, et le raisonnement mérite
d'être gardé** parce que l'argument qui l'a emporté n'était pas le coût.

Le détourage a été promu **défaut pour toutes les voitures**, et les 125 assets
pré-générés sont abandonnés. Trois raisons :

1. **Le paywall change de nature.** L'ancien modèle donnait un sticker puis
   opposait un compteur vide : « ton sticker offert est utilisé ». Le nouveau
   donne un sticker à chaque voiture, pour toujours, et vend l'écart de qualité
   sur une voiture que le joueur regarde déjà. Une comparaison convertit mieux
   qu'une rareté, et surtout elle ne peut pas frustrer.
2. **Un asset canonique n'est pas *ta* voiture.** C'est précisément ce que le
   détourage fait mieux que les deux autres voies, et ce que la §4 mesurait sans
   en tirer la conclusion. Un rendu canonique en couleur de catalogue est un
   objet de catalogue ; un die-cut est la voiture photographiée dans la rue.
3. **Les 30 secondes sortent du chemin critique de tout le monde**, pas
   seulement du premier découvreur d'une voiture inconnue. C'était le vrai motif
   depuis le début (§1), et le catalogue ne le réglait que pour 125 modèles.

Ce que le catalogue aurait apporté et qu'on n'a pas : une grille parfaitement
homogène. C'est le prix payé, il est assumé, et c'est exactement ce que Pro vend.

Reste à faire :

| # | Quoi | Effet | Effort |
|---|---|---|---|
| 0 | Logger `usage` sur `restyle_delivered` (§2) | mesure exacte | 1 h, sans build |
| 1 | A/B `detail: 'low'` sur la vision (§3.1) | −90 % par scan | 1 ligne + un A/B |
| 2 | Essayer `quality: 'medium'` (§3.3) | −75 % par sticker embelli | 1 secret, réversible |
| 3 | WebP + le bug d'extension (§3.4) | −70 % stockage/egress | 30 min |
| ✅ | Le module de détourage (§5), par défaut sur toutes les voitures | tue l'attente et le coût variable du gratuit | fait le 04/08/2026 |
| ❌ | Le script des 125 assets ([`STICKERS.md`](STICKERS.md) §1–3) | abandonné, voir ci-dessus | — |

Les étapes 0 à 3 restent à faire quoi qu'il arrive : elles ne coûtent rien, ne
changent pas le produit, et elles portent maintenant sur le seul poste qui
grossit encore, c'est-à-dire ce que Pro consomme.

Une chose n'a pas été tranchée et n'est pas construite : **la paire avant/après
sur l'écran « Embellir »**, sur une voiture d'exemple. C'est ce qui remplace la
démonstration que le sticker gratuit à vie faisait. Sans elle, le paywall promet
un écart de qualité au lieu de le montrer.

---

## 7. Où on arrive

| | Coût d'un free user à vie | Coût d'un sticker |
|---|---|---|
| Avant le 04/08 | ~0,19 $ | 0,13 $ |
| **Aujourd'hui** (détourage par défaut, `p_free_limit` = 0) | **~0,04 $** | **0 $** pour le gratuit, 0,13 $ pour un embelli Pro |
| Après les étapes 0–3 | ~0,004 $ | 0,034 $ pour un embelli Pro |

Le coût du gratuit ne croît plus du tout : plus d'appel image, plus de stockage,
plus d'egress — le die-cut est dérivé de la photo et refabriqué à la demande.

Ne restent alors que les scans, qui sont le seul poste qu'on veuille garder
payant : c'est celui que Pro vend.
