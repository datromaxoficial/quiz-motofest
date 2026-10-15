// Cache offline do totem: CACHE PRIMEIRO. Depois da primeira abertura com internet, o totem abre instantâneo,
// com ou sem rede. Versão nova (build.sh troca a VERSAO): o navegador instala tudo de novo em segundo plano,
// apaga o cache antigo e o totem recarrega sozinho quando volta para a tela inicial.
// O painel continua "rede primeiro" (precisa dos dados ao vivo). Firebase não passa por aqui.
const VERSAO = 'v20261015111126';
const ARQUIVOS = [
  './', './index.html', './config.js', './manifest.json', './css/totem.css', './js/totem.js',
  './assets/logo-branco.svg', './assets/icone.png', './assets/motofest-2026.png',
  './assets/fonts/archivo-latin-500-normal.woff2', './assets/fonts/archivo-latin-700-normal.woff2',
  './assets/fonts/archivo-latin-800-normal.woff2', './assets/fonts/archivo-latin-900-normal.woff2',
  './assets/fonts/archivo-latin-800-italic.woff2', './assets/fonts/archivo-latin-900-italic.woff2',
];
const DO_TOTEM = new Set(ARQUIVOS.map((a) => new URL(a, self.location).pathname));

self.addEventListener('install', (e) => {
  // cache: 'reload' = baixa da rede de verdade (não do cache HTTP), para a versão nova vir inteira
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS.map((a) => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const totem = DO_TOTEM.has(url.pathname) || (e.request.mode === 'navigate' && /\/(index\.html)?$/.test(url.pathname));
  if (totem) {
    // cache primeiro (os arquivos do totem são da mesma versão do sw.js); rede só se faltar algo
    e.respondWith(caches.open(VERSAO).then((c) => c.match(e.request, { ignoreSearch: true })
      .then((r) => r || fetch(e.request).then((resp) => { if (resp.ok) c.put(e.request, resp.clone()); return resp; }))));
    return;
  }
  // painel e o resto: rede primeiro, cache se estiver offline
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
