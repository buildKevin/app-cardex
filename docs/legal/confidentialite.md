# Politique de confidentialité — CarDex

*Dernière mise à jour : 3 août 2026*

CarDex est une application de collection de voitures : tu photographies une voiture,
l'application l'identifie et l'ajoute à ton garage. Cette page décrit exactement
quelles données cela implique, où elles vont, et ce que tu peux exiger.

Éditeur : **Kevin Stacchetti**, développeur indépendant.
Contact : **<EMAIL_DE_CONTACT>**

---

## Ce que CarDex collecte

### Ton compte

Si tu te connectes avec **Sign in with Apple**, nous recevons d'Apple un identifiant
utilisateur opaque et une adresse e-mail. Si tu as choisi « Masquer mon adresse »,
cette adresse est un relais privé Apple et nous ne connaissons jamais la vraie.

Nous stockons également le **pseudo** que tu choisis dans ton profil. Il est visible
de toi seul : CarDex n'a ni flux public, ni classement, ni fonction sociale.

Tu peux utiliser CarDex **sans compte**. Dans ce cas, ton garage reste sur ton
téléphone et rien n'est envoyé à nos serveurs, à l'exception des appels
d'identification décrits plus bas.

### Tes photos de voitures

Les photos que tu prends dans l'application sont :

1. **envoyées à un service d'identification** (OpenAI) pour reconnaître la voiture ;
2. **stockées sur nos serveurs**, dans un espace privé propre à ton compte, si tu es
   connecté — c'est ce qui te permet de retrouver ton garage après une réinstallation.

Si tu utilises la fonction de **restylage** (mise en scène de ta photo dans un décor),
la photo concernée est en plus envoyée à Google (Gemini) pour produire le rendu. La
photo d'origine n'est jamais écrasée : les deux versions coexistent et tu peux revenir
à l'originale.

Aucune de ces photos n'est visible par un autre utilisateur.

### Ta photo de profil

Elle **ne quitte jamais ton téléphone**. Elle n'est ni envoyée, ni stockée sur nos
serveurs.

### Mesure d'usage

Nous mesurons l'usage de l'application (écrans ouverts, scans lancés, achats,
erreurs) via **PostHog**, hébergé dans l'Union européenne. Ces événements sont
rattachés à ton identifiant de compte, jamais à ton nom ni à ton e-mail.

Nous ne faisons **aucun suivi publicitaire**, aucun pistage entre applications, et
nous n'utilisons pas l'IDFA. Rien n'est vendu ni cédé à un courtier en données.

### Abonnement

Les abonnements CarDex Pro sont gérés par **RevenueCat**, qui reçoit ton identifiant
de compte et l'état de ton abonnement. Le paiement lui-même est traité par Apple :
**nous ne voyons jamais tes coordonnées bancaires**, et nous n'y avons aucun accès.

---

## Voitures découvertes hors catalogue

Quand tu scannes une voiture absente de notre catalogue, une fiche est créée
(marque, modèle, année, puissance, rareté) et servie ensuite à tous les joueurs qui
scannent la même voiture. **Cette fiche décrit la voiture, jamais toi** : elle ne
contient ni ta photo, ni ton pseudo, ni aucune donnée qui te concerne. Ton
identifiant y est conservé uniquement pour éviter qu'une même personne valide deux
fois la même fiche.

---

## Où vivent ces données

| Prestataire | Rôle | Localisation |
| --- | --- | --- |
| Supabase | Base de données, comptes, stockage des photos | Union européenne (Irlande) |
| OpenAI | Identification de la voiture sur la photo | États-Unis |
| Google (Gemini) | Restylage de la photo | États-Unis |
| PostHog | Mesure d'usage | Union européenne |
| RevenueCat | Gestion des abonnements | États-Unis |
| Apple | Authentification, paiement | selon Apple |

Les transferts vers les États-Unis reposent sur les clauses contractuelles types de
la Commission européenne, telles que prévues par les conditions de ces prestataires.

---

## Combien de temps

- Les photos et les entrées de ton garage : **jusqu'à ce que tu les supprimes**, ou
  jusqu'à la suppression de ton compte.
- Les événements de mesure d'usage : **12 mois**.
- Les fiches de voitures découvertes : sans limite, puisqu'elles décrivent un modèle
  de voiture et non une personne.

---

## Tes droits

Tu peux **supprimer ton compte depuis l'application** : Profil → Supprimer mon
compte. C'est une suppression réelle et immédiate — compte, garage, photos. Elle est
irréversible et nous ne conservons pas de copie.

Le RGPD te donne par ailleurs un droit d'accès, de rectification, d'effacement,
de limitation, d'opposition et de portabilité. Écris à **<EMAIL_DE_CONTACT>** et nous
répondons sous 30 jours. Tu peux également saisir la CNIL (`cnil.fr`).

## Mineurs

CarDex est classée 4+ et ne collecte volontairement aucune donnée d'enfant au-delà
de ce qui est décrit ci-dessus. Nous ne demandons ni âge, ni école, ni contacts.

## Modifications

Toute évolution de cette page est datée en haut de document. Un changement
substantiel sera signalé dans l'application.
