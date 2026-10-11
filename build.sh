#!/bin/sh
# Gera js/totem.js e js/painel.js a partir de src/ (precisa de: npm i firebase@11 xlsx esbuild)
set -e
cd "$(dirname "$0")"
NODE_PATH=${NODE_PATH:-node_modules}
npx esbuild src/totem.js src/painel.js --bundle --minify --format=esm --target=es2020 --outdir=js --legal-comments=none
# Atualiza a versão do cache offline para os tablets baixarem a nova versão.
sed -i "s/const VERSAO = '[^']*'/const VERSAO = 'v$(date +%Y%m%d%H%M%S)'/" sw.js
