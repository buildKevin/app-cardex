# Les trois images de la démo d'onboarding

Le step `demo` de `app/onboarding.tsx` montre la boucle complète — photo → sticker
découpé → sticker embelli — **avant** que le joueur donne sa propre voiture. Rien
n'est calculé à ce moment-là : il n'y a pas encore de photo à détourer, aucun
appel modèle n'est fait, aucun scan n'est facturé. Les trois images sont donc des
assets livrés dans le bundle, et c'est volontaire.

Une seule voiture, la même sur les trois : c'est la comparaison qui est le
propos. Deux voitures différentes ne démontrent rien.

| Fichier            | Ce que c'est                                        | Format                     |
| ------------------ | --------------------------------------------------- | -------------------------- |
| `demo-photo.jpg`   | La photographie, telle qu'un joueur la prendrait    | ~4/5, ≥1024 de haut        |
| `demo-diecut.png`  | Le sticker gratuit, détouré sur l'appareil          | 1024×1024, **alpha**       |
| `demo-redraw.png`  | Le sticker payant, redessiné par l'IA               | 1024×1024, **alpha**       |

## État actuel : deux placeholders

- **`demo-photo.jpg` — à remplacer.** C'est un recadrage de la capture marketing
  `marketing/source/ChatGPT Image 4 août 2026, 10_33_31.png`, donc les crochets
  du viseur et les icônes de l'écran de scan sont incrustés dedans. Il faut une
  vraie photo de rue, propre : voiture entière dans le cadre, de face ou de trois
  quarts, sans texte ni surimpression.
- **`demo-redraw.png` — à remplacer.** Généré mécaniquement depuis le die-cut
  (saturation + contraste poussés) pour que les deux phases de la démo soient
  visiblement différentes en dev. Ça n'a pas l'aspect d'un vrai redraw : c'est le
  die-cut, en plus saturé. Tant qu'il est là, la démo sous-vend exactement ce
  qu'elle est censée vendre.
- **`demo-diecut.png` — bon.** Produit par le vrai algorithme (voir ci-dessous),
  y compris sur la photo placeholder : Vision a détaché la voiture et a laissé le
  viseur au fond, donc le sticker est propre même si la photo ne l'est pas.

## Comment les régénérer

### Le die-cut

Jamais à la main : il doit sortir de la même arithmétique que celle de l'app
(canvas 1024, bord blanc 30 px, marge 48 px), sinon la démo montre un sticker qui
n'a pas le format de tous les autres.

```sh
swift scripts/diecut-asset.swift assets/onboarding/demo-photo.jpg \
                                 assets/onboarding/demo-diecut.png
```

Ce script est un portage assumé de `modules/cardex-diecut/ios/CardexDiecutModule.swift` ;
après avoir touché aux constantes du module, relancer et committer l'asset.

### Le redraw

C'est un appel image, donc il se fait une fois, à la main, et le résultat est
committé. Le prompt doit être **exactement** celui que `supabase/functions/restyle-photo/index.ts`
construit (`buildPrompt('transparent')`), sinon l'asset promet un rendu que la
feature ne produit pas. À l'identique, avec `demo-photo.jpg` en entrée :

```
Redraw the car in this photograph as a single die-cut collectible sticker.

Absolute rule: it must stay the same car. Same body shape and proportions,
same paint colour, same wheels, same badges and trim, same viewing angle as
the photograph. Do not modernise it, do not idealise the shape, do not
substitute a similar model. Read the car off the pixels.

Style: clean glossy product illustration, smooth even studio lighting from
the front and above, crisp specular highlights on the paint, dark glass,
legible wheels. Remove every trace of the original surroundings — no road,
no sky, no buildings, no reflections of the street in the paintwork, no
ground shadow.

Output the car alone on a fully transparent background, with a smooth even white die-cut border about 3% of the image width following its silhouette.

The whole car is visible and centred, filling most of the frame with a small
even margin on every side. Leave any licence plate blank. No text, no
watermark, no people, no other vehicles, no props.
```

Réglages du modèle, eux aussi ceux de la fonction : `gpt-image-1.5`,
`input_fidelity: high`, `quality: high`, `background: transparent`,
`output_format: png`, sortie carrée 1024².

## La voiture montrée

Le libellé, la rareté et l'XP affichés sur la carte de démo vivent dans
`src/data/onboardingDemo.ts`, pas ici. En changer la voiture veut dire changer
les trois images **et** cette constante — et choisir une voiture du catalogue,
pour que la fiche annoncée existe vraiment.
