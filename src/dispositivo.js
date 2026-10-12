// Qual aparelho está rodando o totem.
// Tablet Android/HarmonyOS (ex.: Huawei MatePad SE 11) liga o "modo tablet": 3D leve, sem desfoques e teclado próprio do quiz.
// Celular e computador ficam como estão. Para testar: ?tablet=1 força o modo tablet, ?tablet=0 desliga.
const q = new URLSearchParams(location.search);
const ua = navigator.userAgent || '';
const toque = (navigator.maxTouchPoints || 0) > 0 || matchMedia('(pointer: coarse)').matches;
const menorLado = Math.min(screen.width || 0, screen.height || 0);

function detectar() {
  if (q.has('tablet')) return q.get('tablet') !== '0';
  if (!toque) return false;
  const android = /Android|HarmonyOS|HUAWEI|Huawei|HMSCore/i.test(ua);
  // tablet Android não traz "Mobile" no navegador; o MatePad também pode abrir como "site para computador" (Linux)
  if (android && (!/Mobile/i.test(ua) || menorLado >= 600)) return true;
  if (/Linux/i.test(ua) && !/Windows|Macintosh|CrOS/i.test(ua) && menorLado >= 600) return true;
  return false;
}

export const modoTablet = detectar();
// modo leve acompanha o tablet; ?leve=1 / ?leve=0 só para testes
export const modoLeve = q.has('leve') ? q.get('leve') !== '0' : modoTablet;
