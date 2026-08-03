# Ce qu'il reste à faire — App Store

État au 31 juillet 2026. Vérifie à tout moment avec :

```bash
npm run verify:release
```

Il sort en code 1 tant qu'il reste un bloquant, donc il peut garder un pipeline.

---

## 0. La todo, dans l'ordre

Découpée par qui peut la faire. Les sections suivantes donnent le détail et le
pourquoi de chaque ligne.

### A — Toi seul, et ça débloque tout le reste

**Prérequis de facturation**

- [x] **A1.** ✅ Business → contrat **Apps payantes** actif, coordonnées bancaires
      et infos fiscales complètes. Confirmé le 03/08/2026. Tant que ce n'est pas
      vert, aucun produit ne peut être soumis, quel que soit le travail fait
      ailleurs.

**RevenueCat — l'ordre compte, chaque étape débloque la suivante**

- [ ] **A2.** Ouvrir un des produits Test Store et **lire l'identifiant de son
      entitlement**. S'il vaut `cardex_pro`, on le réutilise. Sinon, me le dire :
      soit on renomme, soit je change `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT`.
      À faire *avant* A5, sinon tout se branche sur du vide sans lever d'erreur.
- [ ] **A3.** App Store Connect → Utilisateurs et accès → Intégrations → **Achats
      intégrés** → générer une clé `.p8`. **Différente** de `AuthKey_ZNF6FFWLYV.p8`
      qui sert à eas.
- [ ] **A4.** RevenueCat → Apps → ajouter une app **App Store** (pas Test Store) :
      bundle `com.buildkevin.cardex`, et y déposer la clé de A3.
- [ ] **A5.** RevenueCat → Products → importer les trois ids
      `com.buildkevin.cardex.pro.{monthly,yearly,lifetime}` et les rattacher à
      l'entitlement de A2. **Les trois**, lifetime compris.
- [ ] **A6.** RevenueCat → Offerings → `default`, trois **packages intégrés**
      (`$rc_monthly`, `$rc_annual`, `$rc_lifetime`), et marquer l'offering
      **current**. Vérifier qu'on voit bien trois lignes : `readPlans()` ignore
      silencieusement un package absent, un oubli ne lève aucune erreur.
- [ ] **A7.** RevenueCat → API keys → copier la clé publique iOS `appl_…` → me la
      donner.
- [ ] **A8.** RevenueCat → Integrations → Webhooks → URL
      `https://ykqdkadtdsdxujgqnbmp.supabase.co/functions/v1/revenuecat-webhook`,
      header `Authorization` = le secret **brut, sans `Bearer`**.
- [ ] **A9.** Retirer `EXPO_PUBLIC_REVENUECAT_TEST_KEY` de `.env` avant de tester
      les vrais prix : elle a priorité au runtime, sinon tu continueras à voir
      US$99,99.

**Pages légales — il reste une chose**

- [ ] **A10.** Remplacer `<EMAIL_DE_CONTACT>` dans les trois pages Notion
      (6 occurrences). Me donner l'adresse et je la substitue dans `docs/legal/`.

**Fiche App Store — attention, deux jeux de captures différents**

- [ ] **A11.** **Capture de review par produit** (les trois, la même image
      convient) : le paywall avec les vrais prix en euros et les liens
      *Conditions · Confidentialité* visibles. À prendre depuis TestFlight sur
      iPhone, une fois A7 câblé — le simulateur ne charge pas les produits
      sandbox de façon fiable.
- [ ] **A12.** **Captures marketing 6,7″** pour la fiche App Store
      (iPhone 15/16/17 Pro Max). Obligatoires, et sans rapport avec A11.
- [ ] **A13.** Nom, sous-titre, description, mots-clés, catégorie.
- [ ] **A14.** Classification d'âge — 4+ convient.
- [ ] **A15.** **App Privacy** : photos/caméra (fonctionnalité, non liée à
      l'identité), identifiants si PostHog est actif. **Ne pas** déclarer de suivi
      publicitaire, il n'y en a pas.
- [ ] **A16.** Note pour la review : préciser que l'app fonctionne hors compte, et
      fournir un compte de test.

**Deux décisions et une vérification à l'œil**

- [ ] **A17.** Les 22 logos constructeurs — voir § 1.1. À trancher avant la review
      publique, pas avant TestFlight interne.
- [ ] **A18.** Anonymous sign-in sur le projet hébergé — voir § 1.2.
- [ ] **A19.** Regarder `assets/splash-icon.png` de tes yeux : s'il est resté le
      gabarit Expo, ça se voit au lancement.

### B — Moi, dès que tu me donnes les valeurs

- [ ] **B1.** Câbler la clé `appl_…` de A7 dans `eas.json` profil `production`
- [ ] **B2.** Substituer l'adresse de A10 dans `docs/legal/`
- [ ] **B3.** Committer la feature restyle, non commitée alors que la fonction est
      déjà déployée — l'archive actuelle n'est pas reproductible
- [ ] **B4.** `npm run verify:release`, puis build local et upload TestFlight

### C — À vérifier sur le build réel, avec moi

Aucun dashboard ne confirme ces points, et c'est là que ça casse.

- [ ] **C1.** Le paywall affiche **trois** plans, en euros, aux bons prix
- [ ] **C2.** Les liens *Conditions* et *Confidentialité* s'ouvrent
- [ ] **C3.** Un achat sandbox aboutit
- [ ] **C4.** `users.is_pro` passe à `true` en Postgres — c'est le webhook A8 qui
      le fait, et sans lui un abonné est refusé au 11ᵉ scan
- [ ] **C5.** Un 11ᵉ scan passe une fois Pro actif
- [ ] **C6.** Un scan réel atterrit dans `garage` sous ton `user_id`, photo dans
      le bucket `scans`
- [ ] **C7.** Désinstaller / réinstaller / Apple Sign-In → le garage revient
- [ ] **C8.** Un restylage aboutit, et l'original reste récupérable

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
| Entitlement | `cardex_pro` (surchargeable par `EXPO_PUBLIC_REVENUECAT_ENTITLEMENT`) |
| Offering | celui marqué **current**, sinon `default` |
| Produits | `lifetime`, `yearly`, `monthly` |

Il faut créer les produits **dans App Store Connect** d'abord, puis les rattacher
dans RevenueCat. Ensuite donne-moi la clé publique iOS (`appl_…`) pour `eas.json`.

**Webhook — déjà déployé et testé.** Il maintient `users.is_pro` à jour, ce dont
`begin_scan()` a besoin : sans lui, un abonné payant serait quand même refusé au
11ᵉ scan. Dans RevenueCat → Integrations → Webhooks :

| Champ | Valeur |
| --- | --- |
| URL | `https://ykqdkadtdsdxujgqnbmp.supabase.co/functions/v1/revenuecat-webhook` |
| Authorization | le secret fourni en fin de session (**valeur brute, sans `Bearer`**) |

Vérifié en conditions réelles : `INITIAL_PURCHASE` passe `is_pro` à `true`,
`EXPIRATION` le repasse à `false`, et un appel sans secret ou avec un mauvais
secret est refusé en 401.

**Pour tester les achats sans App Store Connect**, RevenueCat fournit une clé
Test Store (`test_…`) à mettre dans `EXPO_PUBLIC_REVENUECAT_TEST_KEY`. Elle prend
le pas sur les clés de store, et `verify:release` refuse de builder la production
avec elle.

### ~~2.3 Trois pages web à héberger~~ ✅ faite

Publiées sur Notion Sites (`playful-text-ba5.notion.site`) et câblées dans `eas.json`,
profil `production` : `EXPO_PUBLIC_TERMS_URL`, `EXPO_PUBLIC_PRIVACY_URL`,
`EXPO_PUBLIC_SUPPORT_URL`. Le texte source vit dans `docs/legal/` — c'est lui qu'on
modifie, Notion n'en est que le rendu.

Les liens **se cachent tout seuls** si ces variables sont vides : pas de lien mort,
mais pas de lien du tout — et Apple les exige sur un écran qui vend.

Deux pièges vus ici :

- Le lien du bouton *Copier le lien* (`app.notion.com/p/…`) est **interne** : un
  reviewer non connecté tombe sur l'écran de login. Seul un lien `notion.site`,
  obtenu après *Partager → Publier*, est public.
- L'API `getPublicPageData` de Notion répond `publicAccessRole: "none"` même sur une
  page correctement publiée via Sites, et le HTML servi ne porte que le shell
  générique — les deux sont des **faux négatifs**. Pour vérifier qu'une page est
  publique, il faut la charger dans un navigateur déconnecté et regarder le titre.

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

Passer par **TestFlight** avant de soumettre, et y tester l'abonnement CarDex Pro en sandbox —
c'est le point qui casse le plus souvent en conditions réelles.

---

## Déjà fait, pour mémoire

- Suppression de compte in-app (5.1.1(v)) via l'edge function `delete-account`
- Sign in with Apple **natif**, bouton officiel non restylé (4.8)
- Onboarding **sautable** (5.1.1(i))
- Liens Conditions/Confidentialité prêts, câblés sur le paywall et le profil
- Le mode simulé **ne peut plus partir en production** — `identifyCar` échoue au lieu
  d'inventer une voiture
- Synchro du garage vers Supabase, photos incluses : un abonné Pro qui réinstalle
  retrouve sa collection
- Backend hébergé opérationnel : 25 collections, 125 voitures, 29 badges, les deux
  edge functions déployées, clé OpenAI en secret serveur
- RLS vérifiée en conditions réelles : lecture croisée vide, insertion usurpée en 403,
  suppression d'autrui sans effet, photos cloisonnées par dossier
- `ios.buildNumber`, profils EAS preview/production

## État actuel du contrôle

```
✗ 1 bloquant
  1. EXPO_PUBLIC_REVENUECAT_IOS_KEY absente

! 1 avertissement
  1. 22 logos de constructeurs embarqués (5.2.5)
```

Le bloquant restant est exactement le point 2.2 ci-dessus, et il est le seul long :
il faut créer les produits dans App Store Connect avant de pouvoir récupérer la clé.

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
