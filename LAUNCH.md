# Ce qu'il reste à faire — App Store

État au 31 juillet 2026. Vérifie à tout moment avec :

```bash
npm run verify:release
```

Il sort en code 1 tant qu'il reste un bloquant, donc il peut garder un pipeline.

---

## 1. Décisions — elles bloquent le reste

### 1.1 Les logos de marques ⚠️ le plus risqué

`src/data/brandLogos.ts` embarque **22 logos de constructeurs** (Ferrari, Porsche, BMW…)
depuis Simple Icons. Simple Icons est CC0 **pour le dessin**, ce qui ne cède aucun droit
de marque — leur propre documentation le dit. Guideline **5.2.5** interdit l'usage de
matériel tiers protégé sans autorisation, et Ferrari est notoirement procédurier.

*Je ne suis pas juriste. C'est un risque à arbitrer, pas un fait juridique.*

| Option | Effort | Risque |
| --- | --- | --- |
| **a)** Revenir aux monogrammes (« MB », « AM »…) | 10 min | nul |
| **b)** Marques géométriques neutres, une par marque | ~1 h | nul |
| **c)** Garder tel quel | 0 | réel, en review et en dehors |

**→ À trancher.** Ça conditionne le design de l'onglet Collections.

### 1.2 Connexion anonyme sur le projet hébergé

Aujourd'hui **désactivée** — je ne l'ai pas activée sur ta prod, c'est un arbitrage.

- **Activée** : « Continuer sans compte » crée un vrai utilisateur Supabase, donc la
  synchro et le compteur de scans serveur fonctionnent même sans compte social.
- **Désactivée** : « Continuer sans compte » reste purement local, sans sauvegarde
  serveur. Vecteur d'abus nul.

Dashboard → Authentication → Providers → Anonymous.

---

## 2. Configuration externe

### 2.1 Providers OAuth Supabase

Dashboard → Authentication → Providers, sur le projet `ykqdkadtdsdxujgqnbmp`.

**Apple — 30 secondes, faisable tout de suite.** Comme on utilise le flux **natif**
(`signInWithIdToken`), un seul champ est nécessaire :

> **Client IDs** = `com.buildkevin.cardex`

Pas de Team ID, pas de Services ID, pas de clé `.p8` : ceux-là ne servent qu'au flux
web/OAuth, qu'on n'utilise plus pour Apple. La doc Supabase le dit explicitement —
« Register all of the App IDs that will be using your Supabase project […] under
Client IDs ».

Côté Apple, la capability « Sign In with Apple » sur l'App ID est posée
**automatiquement par EAS** au premier build (« EAS Build will use iOS capabilities
signing to enable the required capabilities before building »). Xcode ne serait requis
que sans EAS. Rien à générer à la main, et rien qui bloque la config Supabase.

**Google — le seul qui demande du travail.** Client ID + secret depuis Google Cloud
Console, parce que Google passe encore par le flux web (`signInWithOAuth`). Si tu veux
t'en passer au lancement, Apple + « Continuer sans compte » suffisent : Apple est le
seul obligatoire sur iOS.

Sans provider configuré, seul « Continuer sans compte » aboutit contre l'hébergé.

### 2.2 RevenueCat

Le code attend **exactement** ces identifiants (`src/services/purchases.ts`) :

| Élément | Valeur attendue |
| --- | --- |
| Produit (non-consommable) | `cardex_founder_lifetime` à 9,99 € |
| Entitlement | `founder` |
| Offering | `founder`, avec le package **Lifetime** |

Il faut créer le produit **dans App Store Connect** d'abord, puis le rattacher dans
RevenueCat. Ensuite donne-moi la clé publique iOS (`appl_…`).

### 2.3 Deux pages web à héberger

Une page Notion publique ou GitHub Pages suffit — Apple veut juste des URLs joignables.

- Conditions d'utilisation
- Politique de confidentialité (doit mentionner : photos prises par l'utilisateur,
  identification via un service tiers, mesure d'usage)
- Une page de support est aussi demandée par App Store Connect

Puis ces trois URLs vont dans `eas.json`, profil `production` :

```json
"EXPO_PUBLIC_TERMS_URL": "https://…",
"EXPO_PUBLIC_PRIVACY_URL": "https://…",
"EXPO_PUBLIC_SUPPORT_URL": "https://…"
```

Les liens **se cachent tout seuls** si ces variables sont vides : pas de lien mort,
mais pas de lien du tout — et Apple les exige sur un écran qui vend.

### 2.4 Icône et écran de lancement

`assets/icon.png` et `assets/splash-icon.png` sont **encore ceux du template Expo**.
Icône : 1024×1024, sans transparence, sans coins arrondis (Apple les applique).

---

## 3. Ce que je fais quand tu me dis go

- [ ] Retirer ou remplacer les logos (selon ta décision en 1.1)
- [ ] Brancher PostHog si tu veux le funnel dès le lancement
- [ ] Build natif de test pour valider Sign in with Apple sur simulateur/appareil
- [ ] Tout ajustement de design que tu veux avant de figer

---

## 4. Build et soumission

```bash
npm run verify:release
```

```bash
npx eas build --platform ios --profile production
```

```bash
npx eas submit --platform ios --profile production
```

Puis dans **App Store Connect** :

- [ ] **App Privacy** — à déclarer : photos/caméra (fonctionnalité de l'app, non liée à
      l'identité), identifiants si PostHog est actif. Ne pas déclarer de suivi
      publicitaire : il n'y en a pas.
- [ ] **Captures d'écran** — 6,7″ obligatoire (iPhone 15/16/17 Pro Max)
- [ ] Nom, sous-titre, description, mots-clés
- [ ] Classification d'âge (4+ convient : pas de contenu sensible, pas de social)
- [ ] Conformité export — déjà déclarée dans `app.json`
      (`ITSAppUsesNonExemptEncryption: false`)
- [ ] **Note pour la review** : indiquer que l'app fonctionne hors compte, et fournir
      un compte de test si tu configures Apple/Google

Passer par **TestFlight** avant de soumettre, et y tester l'achat Founder en sandbox —
c'est le point qui casse le plus souvent en conditions réelles.

---

## Déjà fait, pour mémoire

- Suppression de compte in-app (5.1.1(v)) via l'edge function `delete-account`
- Sign in with Apple **natif**, bouton officiel non restylé (4.8)
- Onboarding **sautable** (5.1.1(i))
- Liens Conditions/Confidentialité prêts, câblés sur le paywall et le profil
- Le mode simulé **ne peut plus partir en production** — `identifyCar` échoue au lieu
  d'inventer une voiture
- Synchro du garage vers Supabase, photos incluses : un Founder qui réinstalle
  retrouve sa collection
- Backend hébergé opérationnel : 25 collections, 125 voitures, 29 badges, les deux
  edge functions déployées, clé OpenAI en secret serveur
- RLS vérifiée en conditions réelles : lecture croisée vide, insertion usurpée en 403,
  suppression d'autrui sans effet, photos cloisonnées par dossier
- `ios.buildNumber`, profils EAS preview/production

## État actuel du contrôle

```
✗ 2 bloquants
  1. EXPO_PUBLIC_TERMS_URL / EXPO_PUBLIC_PRIVACY_URL absentes
  2. EXPO_PUBLIC_REVENUECAT_IOS_KEY absente

! 2 avertissements
  1. Pas d'EXPO_PUBLIC_SUPPORT_URL
  2. 22 logos de constructeurs embarqués (5.2.5)
```

Les deux bloquants sont exactement les points 2.2 et 2.3 ci-dessus.

---

## Aide-mémoire

```bash
npm run verify:release      # contrôle avant soumission
npm run verify:matchers     # les matchers TS et SQL sont-ils d'accord (Docker requis)
npm run seed                # regénère supabase/seed.sql depuis src/data
npx tsc --noEmit            # typecheck
```

Build natif iOS sur cette machine — la locale UTF-8 est obligatoire, sinon CocoaPods
échoue avec une erreur trompeuse :

```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 npx expo run:ios
```
