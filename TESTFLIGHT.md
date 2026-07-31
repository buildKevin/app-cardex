# TestFlight — la todo

État au 31/07/2026. Vérifié avec `npm run verify:release`, `npx expo-doctor`,
`npm run typecheck` et l'inspection de `eas.json` / `app.json`.

Un build TestFlight est **autonome** : ni Metro, ni tunnel, ni dev client.
Le problème de « searching for a dev server » disparaît de lui-même ici.

---

## Bloquant — sans ça, pas d'upload

### ~~1. La fiche app dans App Store Connect~~ ✅ faite
Nom App Store : **CarDex - Car Spotting**. Bundle ID `com.buildkevin.cardex`.
Le nom affiché sous l'icône vient de `app.json` (`CarDex`) et reste indépendant
du nom App Store — le suffixe ne se voit pas sur le téléphone.

### ~~2. Une clé API App Store Connect~~ ✅ faite
`AuthKey_ZNF6FFWLYV.p8` à la racine, key ID `ZNF6FFWLYV`, issuer ID renseigné.
Les trois valeurs sont dans `.env.asc`.

Vérifié : `*.p8` (ligne 16) et `.env*` (ligne 45) sont dans `.gitignore`, ni l'un
ni l'autre n'est suivi par git, et aucun `.p8` n'a jamais été commité.

### 3. Lancer le build — une seule commande

```bash
./scripts/build-ios-production.sh --submit
```

Le script charge `.env.asc` (clé ASC), force le locale UTF-8 que CocoaPods exige
sur cette machine, joue `verify:release`, construit en local (gratuit, aucun
crédit EAS) puis upload. Sans `--submit`, il construit seulement.

**Il doit tourner en interactif, et ce n'est pas contournable.** Dans eas-cli,
`credentials/ios/actions/SetUpDistributionCertificate.js` a un chemin
non-interactif qui est un stub (`// TODO: implement validation`) : il ne crée
jamais de certificat et lève `MissingCredentialsNonInteractiveError`. Aucune
variable d'environnement ne change ça — la clé ASC sert à l'authentification
Apple et aux provisioning profiles, pas à la création du certificat.

Ce qu'on te demandera :

- de confirmer la création d'un **certificat de distribution App Store**,
  distinct du certificat ad hoc déjà présent — les deux coexistent
- si la limite Apple de 2 certificats de distribution est atteinte, la CLI
  proposera d'en **révoquer** un : lis avant de répondre, une révocation casse
  les builds signés avec

Aucun mot de passe Apple à saisir : la clé ASC s'en charge.

---

## Après l'upload

Le build apparaît dans App Store Connect → TestFlight en 5 à 15 min, d'abord en
« Processing ».

Pas de question d'export compliance à traiter : `ITSAppUsesNonExemptEncryption:
false` est déjà dans `app.json`, Apple ne redemandera rien.

Pour l'installer : TestFlight → Internal Testing → créer un groupe → t'ajouter
avec l'Apple ID du compte. **Aucune review**, dispo tout de suite. L'app arrive
via l'app TestFlight — plus de Metro, plus de tunnel, plus de dev client.

## Bloquant à la *review*, pas à l'upload

Ces deux points laissent passer un build TestFlight interne. Ils font refuser
l'app en review, et en interne ils rendent le paywall inerte.

### 4. Les 3 URLs légales
`verify:release` les signale. À ajouter dans `eas.json`, profil `production` :

```json
"EXPO_PUBLIC_TERMS_URL": "https://…/cgu",
"EXPO_PUBLIC_PRIVACY_URL": "https://…/confidentialite",
"EXPO_PUBLIC_SUPPORT_URL": "https://…/support"
```

Sans elles, `src/config/release.ts` masque les liens — et Apple exige que les CGU
et la politique de confidentialité soient atteignables depuis le paywall.
Trois pages statiques suffisent (Notion public, GitHub Pages, n'importe quoi de
joignable en HTTPS).

### 5. La clé RevenueCat iOS
`EXPO_PUBLIC_REVENUECAT_IOS_KEY` (`appl_…`), même endroit dans `eas.json`.
Prérequis dans l'ordre :

1. créer les 3 produits dans App Store Connect — `lifetime`, `yearly`, `monthly`
   (identifiants attendus par `src/services/purchases.ts`)
2. les lier dans RevenueCat, sur l'entitlement `cardex_pro`
3. les mettre dans l'offering `default`
4. copier la clé publique iOS du dashboard RevenueCat

Ne **jamais** mettre `EXPO_PUBLIC_REVENUECAT_TEST_KEY` dans le profil production :
elle a priorité au runtime et l'app vendrait des abonnements simulés.
`verify:release` refuse déjà de passer si elle est là.

### 6. Le webhook RevenueCat
Sans lui, un abonné est refusé au scan 11 : `begin_scan()` lit `users.is_pro` en
Postgres et le client n'a pas le droit d'écrire cette colonne.

RevenueCat → Integrations → Webhooks :

- URL : `https://ykqdkadtdsdxujgqnbmp.supabase.co/functions/v1/revenuecat-webhook`
- Authorization header : le secret brut, **sans** préfixe `Bearer`
  (la fonction compare le header entier)

La fonction est déployée et testée (`INITIAL_PURCHASE` → `is_pro=true`,
`EXPIRATION` → `false`, 401 sur mauvais secret).

---

## Décisions qui t'appartiennent

### 7. Les 22 logos constructeurs
`src/data/brandLogos.ts` embarque 22 marques Simple Icons. La licence CC0 couvre
le dessin, **pas la marque déposée** — Guideline 5.2.5. Trois options :

- monogrammes partout (`<BrandLogo>` sait déjà le faire, 3 marques l'utilisent)
- marques géométriques neutres
- garder tel quel en assumant le risque

C'est un refus possible mais pas systématique. À trancher avant la review
publique, pas avant TestFlight interne.

### 8. Icône et splash
`assets/icon.png` a l'air custom (393 ko). `assets/splash-icon.png` (17 ko) est à
vérifier de tes yeux — s'il reste le gabarit Expo, ça se voit au lancement.

### 9. Anonymous sign-in sur le projet hébergé
Laissé **désactivé** exprès : c'est ton appel. Conséquence actuelle — pas de
parcours invité en production, Apple Sign-In est la seule entrée.
Guideline 5.1.1(i) demande que la connexion soit sautable si l'app est utilisable
sans compte ; l'onboarding est déjà sautable côté client, mais sans anonymous
sign-in un utilisateur qui saute n'a pas de garage synchronisé.

---

## Reste à vérifier sur un vrai build

Jamais confirmé de bout en bout, à faire dès le premier build TestFlight :

- [ ] un scan réel atterrit dans `garage` sous ton `user_id`, photo dans le
      bucket `scans`
- [ ] désinstaller / réinstaller / Apple Sign-In → le garage revient

Déjà vérifié : Apple Sign-In sur device réel (`provider=apple` dans
`auth.users`), le push garage (201), l'isolation cross-user (403 / `[]`),
le webhook, et l'équivalence des deux matchers (515 sondes).

---

## L'ordre que je recommande

1. ~~fiche App Store Connect~~ ✅ *CarDex - Car Spotting*, ASC App ID `6796820993`
2. ~~clé API `.p8`~~ ✅
3. ~~build + upload~~ ✅ **build 1.0.0 (4) « En cours de test »** sur TestFlight
   interne depuis le 01/08/2026
4. tester sur TestFlight : Apple Sign-In, scans OpenAI réels, sync garage ← ici
5. puis seulement : URLs légales, produits IAP + clé RevenueCat, webhook, logos

TestFlight **interne** (jusqu'à 100 testeurs de l'équipe) ne passe **aucune
review**. TestFlight **externe** (jusqu'à 10 000) en passe une, et là les points
4 à 7 ci-dessus comptent.

**Ne pas cliquer « Soumettre à l'examen »** sur la version App Store tant que les
blockers sont là : pas de captures d'écran, pas de description, paywall inerte.
Le statut « Prêt à soumettre » de la version 1.0.0 est sans rapport avec
TestFlight — il signifie juste que le build a été traité et rattaché.

Repères de ce build, vérifiés dans l'`.ipa` :

| | |
| --- | --- |
| Team ID | `3C4LML65K2` (Individual, extrait des provisioning profiles locaux) |
| `beta-reports-active` | `true` → profil App Store, distribuable TestFlight |
| `com.apple.developer.applesignin` | `["Default"]` → entitlement présent |
| `get-task-allow` | `false` → vrai build release |
| Taille | 32,5 MB |
