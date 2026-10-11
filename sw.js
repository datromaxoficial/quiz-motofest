// Cache offline do totem: depois da primeira abertura com internet, o quiz abre sem rede.
const VERSAO = 'v20261011203032';
const ARQUIVOS = [
  './', './index.html', './config.js', './manifest.json', './css/totem.css', './js/totem.js',
  './assets/logo-branco.svg', './assets/icone.png', './assets/motofest-2026.png',
  './assets/fonts/archivo-latin-500-normal.woff2', './assets/fonts/archivo-latin-700-normal.woff2',
  './assets/fonts/archivo-latin-800-normal.woff2', './assets/fonts/archivo-latin-900-normal.woff2',
  './assets/fonts/archivo-latin-800-italic.woff2', './assets/fonts/archivo-latin-900-italic.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Rede primeiro (pega atualizações), cache se estiver offline. Firebase não passa por aqui.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
