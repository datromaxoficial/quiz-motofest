// Sons sintetizados na hora (Web Audio): funcionam offline e não pesam no app.
let ctx = null; let mestre = null;
let ligado = (() => { try { return localStorage.getItem('eg_som') !== '0'; } catch { return true; } })();

let somEvento = true; // chave geral vinda das configurações do painel
export function somDoEvento(sim) { somEvento = sim; }
export function somLigado() { return ligado && somEvento; }
export function alternarSom() { ligado = !ligado; try { localStorage.setItem('eg_som', ligado ? '1' : '0'); } catch { /* sem storage */ } return ligado; }

// O navegador só libera áudio depois de um toque.
export function destravarAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC(); mestre = ctx.createGain(); mestre.gain.value = 0.32;
    const comp = ctx.createDynamicsCompressor(); mestre.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
}

function tom(freq, ini, dur, { tipo = 'sine', vol = 0.5, ate = null, ataque = 0.008 } = {}) {
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = tipo; o.frequency.setValueAtTime(freq, ini);
  if (ate) o.frequency.exponentialRampToValueAtTime(ate, ini + dur);
  g.gain.setValueAtTime(0.0001, ini); g.gain.exponentialRampToValueAtTime(vol, ini + ataque); g.gain.exponentialRampToValueAtTime(0.0001, ini + dur);
  o.connect(g); g.connect(mestre); o.start(ini); o.stop(ini + dur + 0.02);
}
function ruido(ini, dur, { vol = 0.3, de = 400, ate = 4000 } = {}) {
  const n = ctx.sampleRate * dur; const buf = ctx.createBuffer(1, n, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(de, ini); f.frequency.exponentialRampToValueAtTime(ate, ini + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ini); g.gain.exponentialRampToValueAtTime(vol, ini + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, ini + dur);
  src.connect(f); f.connect(g); g.connect(mestre); src.start(ini); src.stop(ini + dur);
}

const SONS = {
  toque: (t) => tom(880, t, 0.08, { tipo: 'triangle', vol: 0.18, ate: 1320 }),
  escolha: (t) => { tom(520, t, 0.1, { tipo: 'triangle', vol: 0.25 }); tom(780, t + 0.05, 0.12, { tipo: 'triangle', vol: 0.2 }); },
  suspense: (t) => { for (let i = 0; i < 4; i++) tom(300 + i * 60, t + i * 0.12, 0.1, { tipo: 'square', vol: 0.06 }); },
  certo: (t) => { [659, 831, 988, 1319].forEach((f, i) => tom(f, t + i * 0.075, 0.28, { tipo: 'triangle', vol: 0.28 })); tom(1975, t + 0.3, 0.4, { vol: 0.08 }); },
  errado: (t) => { tom(220, t, 0.22, { tipo: 'sawtooth', vol: 0.12, ate: 150 }); tom(165, t + 0.18, 0.32, { tipo: 'sawtooth', vol: 0.12, ate: 110 }); },
  whoosh: (t) => ruido(t, 0.45, { vol: 0.22, de: 300, ate: 3200 }),
  pulo: (t) => tom(300, t, 0.18, { tipo: 'sine', vol: 0.3, ate: 900 }),
  cocega: (t) => { for (let i = 0; i < 5; i++) tom(900 + Math.random() * 500, t + i * 0.05, 0.06, { tipo: 'triangle', vol: 0.12 }); },
  boing: (t) => tom(180, t, 0.4, { tipo: 'sine', vol: 0.35, ate: 520 }),
  tonto: (t) => { for (let i = 0; i < 6; i++) tom(700 - i * 60, t + i * 0.07, 0.09, { tipo: 'sine', vol: 0.15 }); },
  chopp: (t) => { ruido(t, 0.9, { vol: 0.12, de: 2000, ate: 6000 }); [523, 659, 784, 1047].forEach((f, i) => tom(f, t + 0.2 + i * 0.09, 0.4, { tipo: 'triangle', vol: 0.22 })); },
  vitoria: (t) => {
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tom(f, t + i * 0.11, i === 6 ? 0.9 : 0.22, { tipo: 'triangle', vol: 0.26 }));
    [262, 330, 392].forEach((f) => tom(f, t + 0.66, 0.9, { tipo: 'sine', vol: 0.12 }));
  },
  fim: (t) => { [392, 523, 659].forEach((f, i) => tom(f, t + i * 0.12, 0.35, { tipo: 'triangle', vol: 0.2 })); },
  digita: (t) => tom(1400 + Math.random() * 300, t, 0.03, { tipo: 'square', vol: 0.03 }),
};

export function tocar(nome) {
  if (!ligado || !somEvento || !ctx || ctx.state !== 'running') return;
  try { SONS[nome]?.(ctx.currentTime + 0.01); } catch { /* ignora */ }
}
