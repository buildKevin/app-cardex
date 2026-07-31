#!/bin/zsh
#
# Build App Store en local (gratuit, aucun crédit EAS) puis upload TestFlight.
#
#   ./scripts/build-ios-production.sh          # build seul
#   ./scripts/build-ios-production.sh --submit  # build + upload
#
# Interactif exprès : la création du certificat de distribution ne peut pas se
# faire en mode non-interactif (eas-cli ne l'implémente pas), et si la limite de
# 2 certificats Apple est atteinte, la CLI propose d'en révoquer un — ça se lit
# avant de répondre.
#
# CocoaPods exige un locale UTF-8 sur cette machine, sinon le build casse sur
# « Unicode Normalization not appropriate for ASCII-8BIT ».

set -e
cd "$(dirname "$0")/.."

export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

if [[ -f .env.asc ]]; then
  source .env.asc
  echo "Clé App Store Connect chargée (key $EXPO_ASC_KEY_ID) — pas de mot de passe Apple à saisir."
else
  echo "⚠  .env.asc absent : Apple demandera un identifiant interactivement."
fi

npm run verify:release || echo "⚠  verify:release signale des points — le build continue, voir TESTFLIGHT.md."

eas build --platform ios --profile production --local

if [[ "$1" == "--submit" ]]; then
  # `--latest` ne marche pas ici : un build --local n'est jamais enregistré sur
  # les serveurs EAS (c'est ce qui le rend gratuit), donc eas submit ne le voit
  # pas. Il faut lui passer le chemin de l'archive, la plus récente à la racine.
  IPA=$(ls -t build-*.ipa 2>/dev/null | head -1)
  if [[ -z "$IPA" ]]; then
    echo "✖ Aucune archive build-*.ipa trouvée à la racine."
    exit 1
  fi
  echo "Upload de $IPA"
  eas submit --platform ios --path "$IPA"
fi
