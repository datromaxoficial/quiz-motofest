#!/bin/sh
# Gera js/totem.js e js/painel.js a partir de src/ (precisa de: npm i firebase@11 xlsx three@0.169.0 esbuild)
set -e
cd "$(dirname "$0")"
NODE_PATH=${NODE_PATH:-node_modules}
node --test tests/*.test.mjs
npx esbuild src/totem.js src/painel.js --bundle --minify --format=esm --target=es2020 --outdir=js --legal-comments=none
# Nova versão: o cache offline e o navegador dos tablets baixam os arquivos novos.
V=$(date +%Y%m%d%H%M%S)
sed -i "s/const VERSAO = '[^']*'/const VERSAO = 'v$V'/" sw.js
sed -i -E "s#(href=\"css/(totem|painel)\.css)(\?v=[0-9]+)?\"#\1?v=$V\"#; s#(src=\"js/(totem|painel)\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#" index.html painel.html
sed -i -E "s#(src=\"config\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#" index.html painel.html
