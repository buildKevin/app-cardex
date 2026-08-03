# Stickers de catalogue — supprimer l'attente et le coût par joueur

État au 03/08/2026. **Rien de ce document n'est commencé.** C'est un plan, pas un
compte rendu. À reprendre quand on voudra baisser les coûts d'image.

---

## Ce qui existe aujourd'hui

La génération se fait **par photo et par joueur**, dans
`supabase/functions/restyle-photo/index.ts` (déployée) :

- Le client envoie un id d'entrée, jamais une image. La fonction lit la photo
  dans le bucket `scans`, vérifie la propriété sur `garage`, construit le prompt.
- OpenAI `gpt-image-1.5`, `background: transparent`, `output_format: png`,
  `input_fidelity: high`, `quality: high`, sortie carrée 1024².
- Comptabilité en deux temps autour de l'appel : `begin_restyle()` refuse avant
  de payer, `commit_restyle()` ne facture que sur un résultat stocké. Gratuit :
  **un sticker à vie**. Pro : 30 par mois.
- Le résultat va dans `styled_photo_path`, et `src/lib/photo.ts` est le seul
  endroit qui décide quelle image un écran affiche (`displayPhoto`,
  `originalPhoto`, `isSticker`).

Les deux conséquences qui motivent ce document :

1. **~30 secondes d'attente** entre le clic et le sticker.
2. **Un coût variable sur l'expérience centrale** : chaque sticker de chaque
   joueur est un appel d'image facturé.

---

## Ce que fait la concurrence, et comment on le sait

Leur sticker apparaît **instantanément**. Ce n'est pas une IA plus rapide : leur
sticker n'appartient pas à la photo du joueur, il appartient **au modèle de
voiture**. Trois indices dans leurs propres captures :

- Les stickers sont tous en 3/4 avant, même lumière, même vernis. Impossible à
  obtenir de photos de rue prises au hasard.
- Les carrosseries sont parfaites : aucun reflet de trottoir, aucune saleté.
- Leur numérotation trahit l'architecture : `#1166` et `#5400` sont des numéros
  nus, tandis que `#D001` et `#D002` portent un préfixe **D** *et* une couronne.
  D comme *Discovered* — les voitures hors de leur catalogue, ajoutées après
  coup. C'est exactement la séparation `cars` / `discovered_cars` qu'on a déjà.

Leur boucle : scan → identification du modèle → affichage de **l'asset déjà
rendu**. Instantané parce que c'est un téléchargement, pas une génération. Il y a
bien eu de l'IA (ou de la 3D, ou de l'illustration achetée), mais **une fois par
voiture à la fabrication**, pas une fois par joueur et par photo.

---

## La recommandation

### Le sticker de catalogue devient le défaut

Pas d'abord pour le coût — pour le rythme du jeu. Le sticker est la récompense du
scan ; dans un jeu de collection la récompense doit tomber tout de suite. Le
reste suit : le coût cesse de croître avec le nombre de joueurs, l'uniformité
devient gratuite puisque tout sort du même lot, et c'est la seule version qui
marche hors ligne — ce qui compte pour une app qu'on utilise dans la rue.

### La génération depuis la photo ne devient PAS le perk Pro

C'était la première idée, et elle est mauvaise, pour deux raisons :

- **Elle vend le produit le moins beau.** Un rendu de catalogue propre bat presque
  toujours le redessin d'une photo mal éclairée. Faire payer pour la sortie la
  plus laide déçoit précisément les joueurs qui paient.
- **Elle colle un coût variable au paywall.** Chaque abonné coûterait plus cher à
  mesure qu'il en profite. C'est la forme qu'on ne veut pas sur un abonnement.

Pro vend déjà la chose sur laquelle les joueurs butent réellement : les scans
illimités. Dans un jeu de collection, la limite de 10 scans **est** le mur. Mieux
vaut un argument qui mord que deux tièdes — et si le paywall a besoin d'une
seconde ligne, qu'elle ait un coût marginal nul.

### La couleur canonique est le prix à payer, et il est acceptable

Une 488 bleue et une 488 rouge auront la même vignette. C'est le prix de la
netteté, la concurrence le paie aussi, et leur grille est superbe. Si ça devient
gênant : du par-modèle-par-couleur sur les seuls modèles populaires.

---

## L'ordre à suivre

### 1. Le script de génération des 125 voitures du catalogue

Un script hors ligne, dans `scripts/`, qui lit `src/data/cars.ts` et produit un
PNG par `carId`.

**Piège central : il n'y a pas de photo source.** Ça change deux choses :

- C'est `/v1/images/generations`, pas `/v1/images/edits`. Donc ni `input_fidelity`
  ni `background: transparent` sur un fichier d'entrée — mais `background` existe
  aussi sur `generations`, à vérifier contre la spec OpenAPI au moment de coder
  (`https://raw.githubusercontent.com/openai/openai-openapi/master/openapi.yaml`,
  schéma `CreateImageRequest`).
- **Ça inverse la règle « ne jamais nommer la voiture »** d'`AGENTS.md`. Cette
  règle existe parce qu'on avait des pixels à copier et qu'une étiquette poussait
  le modèle à dessiner *son* idée d'une 488. Sans photo, son idée d'une 488 est
  exactement ce qu'on veut. À écrire noir sur blanc dans les conventions, sinon
  quelqu'un « corrigera » le script en enlevant le nom.

Le prompt doit verrouiller ce qui fait la collection : un seul angle (3/4 avant),
une seule lumière, un seul vernis, une marge constante dans le cadre, fond
transparent, bord découpé blanc. Réutiliser le vocabulaire de `buildPrompt()` dans
la fonction edge pour rester cohérent avec les stickers déjà générés.

### 2. La passe de relecture — c'est le vrai travail

125 rendus, c'est 125 chances de sortir une voiture fausse. **Un asset de
catalogue est vu par tout le monde : un raté n'est pas la déception d'un joueur,
c'est un bug pour tous.** Il faut les regarder un par un et régénérer les mauvais.
Compter une session dédiée, pas un coup d'œil.

### 3. Le service, avec repli

Un bucket **public**, indexé par `carId`. Pas dans le binaire : 125 PNG
alourdiraient une app de 33 Mo, et ajouter une voiture demanderait une release.
Le cache disque de `expo-image` donne l'instantané après le premier affichage et
l'offline ensuite.

**Le repli est ce qui permet de livrer progressivement** : quand l'asset n'existe
pas, on affiche la photo. 20 voitures faites, 105 encore en photo, rien de cassé.
Le point d'entrée est `src/lib/photo.ts` — c'est déjà le seul endroit qui décide
quelle image un écran montre, et `isSticker()` y pilote déjà le `contentFit`.

### 4. Les voitures hors catalogue

Génération **une fois** à la première découverte, stockée sur la ligne
`discovered_cars`, servie verbatim à tout le monde ensuite. C'est la règle qui
existe déjà pour la rareté de ces voitures, appliquée au sticker. Le premier
découvreur attend ~30 s, et cette attente devient un moment valorisant plutôt
qu'une latence : il est le premier à l'avoir trouvée.

### 5. Le paywall, après, avec les chiffres

Ne pas trancher à l'aveugle sur un levier de revenu. PostHog enregistre déjà
`restyle_started`, `restyle_succeeded` et `restyle_blocked_by_limit` : on saura
combien de joueurs s'en sont réellement servis avant de retirer quoi que ce soit.

Si le paywall du sticker disparaît, garder `begin_restyle` / `commit_restyle` /
`restyle_calls` en place plutôt que les arracher — c'est la même dépense contre le
même paywall si on revient en arrière, et renommer un événement vivant coupe
chaque funnel existant en deux.

---

## Les décisions ouvertes

- **Guideline 5.2.5.** 125 voitures de marques réelles livrées comme assets de
  l'app, c'est une surface plus large que les logos que `npm run verify:release`
  signale déjà. Pas bloquant, mais à décider les yeux ouverts.
- **Le coût unitaire réel** de la génération n'a pas encore été mesuré. La
  télémétrie serveur enregistre la latence et les octets, pas le prix. À relever
  sur la facture OpenAI après les premières générations, pour chiffrer les 125.
- **La couleur canonique** : acceptée ci-dessus, à rouvrir si les retours
  joueurs portent là-dessus.
