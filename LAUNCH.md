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

- [x] **A2.** ✅ L'identifiant de l'entitlement est littéralement **`CarDex Pro`**,
      espace et majuscules comprises, et il est immuable — `update-entitlement`
      n'édite que `display_name`, et créer un `cardex_pro` à côté échoue en 409
      (unicité vérifiée sur la forme normalisée). Le code a donc été aligné
      dessus, côté client **et** côté webhook, dans `a6b6c90`. Rien à faire de
      plus, et surtout **ne pas** rattacher les produits à un autre entitlement.
- [x] **A3.** ✅ Clé In-App Purchase `SubscriptionKey_SJB33RW6Q2.p8`, à la racine
      et couverte par `*.p8` dans `.gitignore`.
- [x] **A4.** ✅ App `CarDex (App Store)` — `app62957df0c2`, bundle
      `com.buildkevin.cardex`, `subscription_key_configured: true`.
- [x] **A5.** ✅ Les trois produits créés et rattachés à `CarDex Pro`.
      L'entitlement porte donc six produits : les trois de l'App Store et les
      trois de la Test Store, ce qui est voulu — les deux stores partagent
      l'accès.
- [x] **A6.** ✅ Offering `default`, `is_current: true`, les trois packages
      intégrés portant chacun deux produits (App Store + Test Store).
- [x] **A7.** ✅ `appl_lbhtthoDUeGUbsfKtceaCPHnoAn`, câblée dans `eas.json`.
- [x] **A8.** ✅ Intégration `CarDex Supabase` (`whintgre8d887a7b3`), sur **tous**
      les environnements et tous les types d'événement — sandbox inclus, ce qui
      est nécessaire pour tester depuis TestFlight. Le secret a été régénéré des
      deux côtés à cette occasion. Authentification vérifiée en conditions
      réelles : bon secret → 200, mauvais secret → 401, header absent → 401.
- [ ] **A9.** `EXPO_PUBLIC_REVENUECAT_TEST_KEY` est encore dans `.env`. Elle n'a
      **aucun effet sur la production** — `eas.json` ne la porte pas et
      `verify:release` le vérifie — mais elle a priorité en local, donc un test
      sur simulateur continuera d'afficher US$99,99. À retirer seulement le jour
      où tu veux voir les vrais prix en dev.

**Pages légales — il reste une chose**

- [x] **A10.** ✅ Les trois pages sont publiées et l'adresse de contact est en
      place côté Notion. **`docs/legal/` porte encore `<EMAIL_DE_CONTACT>`** :
      donne-moi l'adresse pour que la source du repo cesse de diverger du rendu.

**Fiche App Store — attention, deux jeux de captures différents**

- [ ] **A11.** **Remplacer la capture de review des produits.** Il y en a déjà
      une sur les trois, mais elle montre les prix Test Store en dollars. À
      reprendre depuis TestFlight, une fois le build en ligne — le simulateur ne
      charge pas les produits sandbox de façon fiable.
- [ ] **A12.** **Captures marketing en 1320 × 2868** (emplacement 6,9″), 3 mini,
      5 conseillées. Sans rapport avec A11. **Un iPhone 17 Pro sort du
      1206 × 2622 et Apple le refuse** — c'est le Pro Max qui donne la bonne
      taille, vérifié sur cette machine. Un redimensionnement `sips` suffit, les
      deux rapports d'aspect sont identiques à 0,06 %.
- [x] **A13.** ✅ *Informations sur l'app* (nom, sous-titre, catégories Style de
      vie / Jeux, droits sur le contenu) **et** page de la version 1.0
      (description, mots-clés, texte promo, URL de support, copyright).
- [x] **A14.** ✅ Classification d'âge : questionnaire 7 étapes rempli, 4+.
- [x] **A15.** ✅ **App Privacy publiée**, 7 types déclarés — e-mail, photos,
      autre contenu (le pseudo), ID utilisateur, historique d'achats, interaction
      produit, données de pannes. Tous liés à l'identité, **aucun** utilisé pour
      le suivi. Ni localisation, ni donnée publicitaire, ni IDFA. La photo de
      profil est volontairement absente : elle ne quitte jamais l'appareil, donc
      ce n'est pas une collecte. Les *données de performance* le sont aussi —
      PostHog capture des exceptions, pas des temps de chargement.
      L'URL de la politique est sur cette page, pas sur *Informations sur l'app*.
- [x] **A16.** ✅ Note de review de l'app en place, *Connexion requise* décoché.
      Son premier paragraphe porte tout le poids : le scan est **caméra
      uniquement**, donc sans l'instruction de viser une photo sur un écran, un
      vérificateur en bureau ne peut pas essayer la fonction principale — et
      « impossible à vérifier » est un motif de rejet à part entière.

**Deux décisions et une vérification à l'œil**

- [x] **A17.** ✅ **Décision : on garde les 22 logos pour la v1**, et *Droits
      relatifs au contenu* a été renseigné en conséquence. Le repli
      monogramme reste prêt — `<BrandLogo>` le fait déjà pour Mercedes-Benz, Alfa
      Romeo et Land Rover — et se déclenche en vidant `BRAND_LOGO_PATHS`, soit un
      commit. Le raisonnement : se tromper est réversible par une mise à jour,
      retirer préventivement est un coût certain payé au lancement. Corollaire
      non négociable : **aucun nom de marque dans les mots-clés App Store**.
- [ ] **A18.** ⚠️ **Décidé (option A), reste un interrupteur à toi** : Supabase →
      Authentication → Providers → **Anonymous → Enable**. Le code est fait
      (`eb0cece`) : « Continuer sans compte » crée désormais un vrai utilisateur
      anonyme. **Sans l'interrupteur, le repli local s'applique et le scan
      échoue** — c'était le bug : `identify-car` répond 401 à tout ce qui n'est
      pas un jeton d'utilisateur, donc l'unique parcours annoncé comme sans
      compte était le seul incapable de scanner, alors que la note de review dit
      au vérificateur d'appuyer sur ce bouton.
- [x] **A20.** ✅ Le « à vie » est en *Ready to Submit* : sa localisation, sa
      capture, son prix et sa catégorie fiscale sont donc complets. Les deux
      abonnements restent en *Missing Metadata* avec les **mêmes** métadonnées —
      ce n'est pas un champ manquant, c'est la règle du premier abonnement à
      renouvellement automatique, qui doit être soumis avec le binaire. Statut
      d'attente, pas erreur ; il basculera à la soumission.
- [x] **A19.** ✅ `icon.png` et `splash-icon.png` identiques : voulu, même marque
      au lancement. L'avertissement de `verify:release` est donc attendu.

### B — Moi, dès que tu me donnes les valeurs

- [x] **B1.** ✅ Clé `appl_…` câblée dans `eas.json` profil `production`
- [x] **B2.** ✅ `kevinstacchett@gmail.com` substituée dans `docs/legal/`
      (5 occurrences) — la source du repo et les pages Notion concordent
- [x] **B3.** ✅ La feature restyle est commitée (`7e87144`), l'arbre est propre
- [~] **B4.** `buildNumber 10` construit en local et **uploadé sur TestFlight**
      le 03/08/2026. Il sert à tester les achats et à prendre la capture A11 —
      **il ne contient pas le correctif A18**, compilé après. Un `buildNumber 11`
      est nécessaire avant l'examen.
      Note pour la prochaine fois : l'upload a d'abord échoué sur
      `getaddrinfo ENOTFOUND api.expo.dev`, purement transitoire. Le build était
      déjà signé — inutile de le refaire, il suffit de relancer
      `eas submit --platform ios --profile production --path build-<ts>.ipa`.
- [ ] **B5.** Localisation du groupe d'abonnements : l'écran *Créer une
      soumission* refuse avec « votre abonnement doit être envoyé avec
      l'abonnement groupé associé ». C'est bien un blocage, contrairement à ce
      que j'avais conclu plus tôt. Monétisation → Abonnements → **le nom du
      groupe** `CarDex Pro` → Localisations → Français (France).

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
✓ 0 bloquant

! 2 avertissements
  1. icon.png et splash-icon.png sont identiques octet pour octet
  2. 22 logos de constructeurs embarqués (5.2.5)
```

Plus rien ne bloque techniquement la soumission. Les deux avertissements sont les
deux décisions A19 et A17 — le contrôle ne peut pas les trancher à ta place.

Ce qui reste avant de soumettre est du contenu, pas de la plomberie : l'adresse de
contact (A10), les captures (A11, A12), la fiche (A13 à A16), puis le build et la
série de vérifications C1 à C8 sur un vrai appareil.

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
