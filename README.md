# CarDex

Scanne les voitures que tu croises dans la rue, complète ton garage, complète tes collections.
Un Pokédex automobile — une seule boucle, répétée : **voir → scanner → débloquer → progresser**.

## Démarrer

```bash
npm install
```

```bash
npx expo start
```

L'app tourne **sans aucune clé d'API**. Dans ce mode démo les scans sont simulés
(l'IA renvoie une voiture plausible du catalogue) et l'achat Founder est débloquable
via un lien de dev sur le paywall. Tout le reste — XP, niveaux, collections, badges,
vitrine — fonctionne pour de vrai, en local.

Pour un build natif complet (caméra réelle + RevenueCat) :

```bash
npx expo run:ios
```

## Stack

| Rôle | Choix |
| --- | --- |
| App | Expo SDK 57 · React Native 0.86 · TypeScript strict |
| Navigation | expo-router (4 onglets + modales) |
| État | zustand + AsyncStorage (persistance locale) |
| Animations | react-native-reanimated 4 |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Vision | OpenAI Vision via edge function (Gemini interchangeable) |
| Achats | RevenueCat |
| Analytics | PostHog |

Chaque service externe est derrière un adaptateur dans `src/services/` et se
désactive proprement quand sa clé est absente. Aucun écran ne casse.

## Configuration

```bash
cp .env.example .env
```

Toutes les clés sont optionnelles, et chacune active une brique :

| Variable | Débloque |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Auth Apple/Google, edge function d'identification, limite de scans côté serveur |
| `EXPO_PUBLIC_OPENAI_API_KEY` | Identification directe, **dev uniquement** (une clé dans le bundle est lisible par tous) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` | Paywall Founder réel |
| `EXPO_PUBLIC_POSTHOG_KEY` | Funnel analytics |

### Supabase

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
```

```bash
node scripts/generate-seed.mjs && psql "$DATABASE_URL" -f supabase/seed.sql
```

Puis l'edge function, qui garde la clé OpenAI côté serveur :

```bash
supabase secrets set OPENAI_API_KEY=sk-... && supabase functions deploy identify-car
```

Relance `generate-seed.mjs` après chaque modification de `src/data/` — il
regénère `supabase/seed.sql` depuis le catalogue TypeScript, qui reste la source
de vérité.

### RevenueCat

1. Produit non-consommable `cardex_founder_lifetime` à 9,99 € (App Store + Play).
2. Entitlement `founder`.
3. Offering `founder` avec le package **Lifetime**.

Les identifiants sont centralisés en haut de `src/services/purchases.ts`.

## Architecture

```
app/                       Routes (expo-router)
  _layout.tsx              Polices, providers, init des services
  index.tsx                Gate : onboarding ou garage
  onboarding.tsx           3 écrans → compte Apple/Google
  paywall.tsx              Offre Founder (onboarding · limite · profil)
  (tabs)/
    index.tsx              Garage — stats, bouton scanner, découvertes
    collections.tsx        Les 25 marques et leur progression
    scan.tsx               Caméra + identification
    profile.tsx            Pseudo, niveau, vitrine, badges
  reveal.tsx               Animation « nouvelle carte débloquée »
  car/[entryId].tsx        Fiche complète
  collection/[brandId].tsx Les 5 slots d'une marque
  showcase.tsx             Choix des 3 voitures de la vitrine

src/
  theme/                   Tokens : couleurs, type, espacements, motion
  components/              21 composants réutilisables, aucun écran-spécifique
  data/                    Catalogue (25 marques × 5 voitures) et badges
  lib/                     Rareté, niveaux, formatage, matching, stats
  services/                Supabase, vision, achats, analytics, photo, auth
  store/                   useGameStore — la seule source de vérité

supabase/
  schema.sql               5 tables + RLS + bucket + comptage des scans + match_car_id
  seed.sql                 Généré depuis src/data
  functions/identify-car/  Edge function vision
```

### Ce que l'IA renvoie

Le modèle ne renvoie **que** ceci :

```json
{ "make": "Ferrari", "model": "488 GTB", "generation": "Type F142M", "year": 2018, "confidence": 0.91 }
```

Tout le reste — puissance, pays, prix neuf, rareté, XP — vient de
`src/data/cars.ts`. Cela garantit des fiches cohérentes et une rareté qu'on
contrôle, au lieu de valeurs inventées à chaque scan.

Le matching (`src/lib/match.ts`) normalise accents et ponctuation, puis prend
l'alias le plus long qui correspond, pour que « golf gti » gagne sur « golf ».
Une voiture non catalogée rejoint quand même le garage — elle ne compte
simplement dans aucune collection.

### Économie du jeu

| Rareté | XP |
| --- | --- |
| Common | 10 |
| Rare | 25 |
| Epic | 75 |
| Legendary | 200 |

Niveaux purement cosmétiques, courbe douce au début (`src/lib/level.ts`).
Version gratuite : **10 scans**, puis paywall. La limite est appliquée deux fois —
côté client pour l'UX, et côté base pour qu'elle ne soit pas contournable.

Côté serveur c'est en deux phases : `begin_scan()` avant l'appel au modèle (on
refuse tôt, sans jamais payer une requête qu'on allait rejeter), puis
`commit_scan()` **seulement si le résultat correspond au catalogue**. Une voiture
absente du catalogue est notre lacune, pas celle du joueur : elle rejoint son
garage, rapporte des XP, et ne lui coûte pas de scan. Un plafond séparé
(`vision_calls`, 40 par défaut) borne le coût des ratés répétés.

Une voiture reconnue mais non catalogée hérite de la **rareté médiane de sa
marque** : une Ferrari inconnue vaut `legendary`, une Dacia inconnue `common`.
Retomber sur `common` punissait exactement le meilleur moment du jeu.

Badges : un par marque (5/5) plus 100 voitures, 10 Legendary, 50 scans, 1000 XP.
Ils sont **dérivés** de l'état du garage, jamais stockés, donc jamais désynchronisés.

## Direction artistique

Noir `#000000`, dark mode uniquement, presque aucune couleur. La seule action
primaire est blanche sur noir. La rareté est le seul accent chromatique, et
seulement sur un point et un liseré. Inter, tracking négatif sur les grandes
tailles. Beaucoup de vide. Animations discrètes : fondus, un léger scale au
press, un halo radial au reveal — jamais de rebond, jamais d'effet « gaming ».

Les tokens sont dans `src/theme/index.ts`. Aucune valeur brute ne devrait
apparaître dans un écran.

## Avant de publier

- [ ] **Sign in with Apple natif** (`expo-apple-authentication`). L'OAuth web via
      Supabase fonctionne, mais Apple exige le bouton natif pour la review.
- [ ] Remplacer icône et splash dans `assets/`.
- [ ] Vérifier les produits RevenueCat en sandbox sur les deux stores.
- [ ] Synchroniser la vitrine et le garage vers Supabase (aujourd'hui local-first,
      le schéma est prêt).
- [ ] Étendre le catalogue au-delà de 25 marques — c'est le levier de rétention
      le plus direct. Les événements `scan_succeeded` avec `matched: false`
      portent `raw_make`/`raw_model` : c'est la liste de ce qu'il faut ajouter.

## Hors périmètre, volontairement

Pas de social, d'amis, de commentaires, de classement, de marketplace, de GPS,
de feed, de quêtes, d'événements. Le MVP valide une seule question : est-ce que
sortir son téléphone pour scanner une voiture est assez satisfaisant pour qu'on
le refasse ?
