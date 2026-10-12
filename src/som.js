// Sons sintetizados na hora (Web Audio): funcionam offline e não pesam no app.
let ctx = null; let mestre = null;
const audio = () => ctx; const saida = () => mestre;
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

// Ronco de moto: cada explosão do motor é um "estalo" de ruído filtrado (escapamento), no ritmo da rotação,
// com um corpo grave por baixo e saturação leve. Marcha lenta -> acelerada -> segura -> alivia.
const ondas = new WeakMap();
export function motor(t, ctx = audio(), mestre = saida()) {
  const dur = 2.0;
  let ondaPulso = ondas.get(ctx);
  if (!ondaPulso) {
    const n = 40; const re = new Float32Array(n); const im = new Float32Array(n); const duty = 0.18;
    for (let k = 1; k < n; k++) re[k] = (2 * Math.sin(Math.PI * k * duty)) / (Math.PI * k); // trem de pulsos estreitos
    ondaPulso = ctx.createPeriodicWave(re, im, { disableNormalization: false }); ondas.set(ctx, ondaPulso);
  }
  const rpm = (param, mult = 1) => {
    param.setValueAtTime(26 * mult, t);
    param.linearRampToValueAtTime(30 * mult, t + 0.22);          // marcha lenta
    param.exponentialRampToValueAtTime(88 * mult, t + 0.62);     // acelera
    param.linearRampToValueAtTime(92 * mult, t + 0.95);          // segura
    param.exponentialRampToValueAtTime(48 * mult, t + 1.7);      // alivia
    param.linearRampToValueAtTime(44 * mult, t + dur);
  };
  // explosões: ruído modulado pelos pulsos do motor
  const len = Math.floor(ctx.sampleRate * dur); const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const ruidoSrc = ctx.createBufferSource(); ruidoSrc.buffer = buf;
  const pulsos = ctx.createOscillator(); pulsos.setPeriodicWave(ondaPulso); rpm(pulsos.frequency);
  const irregular = ctx.createOscillator(); const irrG = ctx.createGain(); irregular.frequency.value = 9; irrG.gain.value = 1.6; // motor não é metrônomo
  irregular.connect(irrG); irrG.connect(pulsos.frequency);
  const am = ctx.createGain(); am.gain.value = 0; pulsos.connect(am.gain);
  const escap = ctx.createBiquadFilter(); escap.type = 'bandpass'; escap.Q.value = 1.1;
  escap.frequency.setValueAtTime(300, t); escap.frequency.exponentialRampToValueAtTime(850, t + 0.62); escap.frequency.exponentialRampToValueAtTime(480, t + 1.7);
  ruidoSrc.connect(am); am.connect(escap);
  // corpo do motor: harmônicos da rotação (2x), bem filtrado
  const corpo = ctx.createOscillator(); corpo.type = 'sawtooth'; rpm(corpo.frequency, 2);
  const corpoF = ctx.createBiquadFilter(); corpoF.type = 'lowpass'; corpoF.Q.value = 0.7;
  corpoF.frequency.setValueAtTime(260, t); corpoF.frequency.exponentialRampToValueAtTime(620, t + 0.62); corpoF.frequency.exponentialRampToValueAtTime(380, t + 1.7);
  const corpoG = ctx.createGain(); corpoG.gain.value = 0.55; corpo.connect(corpoF); corpoF.connect(corpoG);
  // mistura + saturação leve (dá o "rasgado" do escapamento)
  const soma = ctx.createGain(); soma.gain.value = 1;
  const escapG = ctx.createGain(); escapG.gain.value = 1.4; escap.connect(escapG); escapG.connect(soma); corpoG.connect(soma);
  const sat = ctx.createWaveShaper(); const curva = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curva[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
  sat.curve = curva;
  const corteAgudo = ctx.createBiquadFilter(); corteAgudo.type = 'lowpass'; corteAgudo.frequency.value = 2400;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t); env.gain.exponentialRampToValueAtTime(0.28, t + 0.05);
  env.gain.linearRampToValueAtTime(0.36, t + 0.62); env.gain.linearRampToValueAtTime(0.32, t + 1.3); env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  soma.connect(sat); sat.connect(corteAgudo); corteAgudo.connect(env); env.connect(mestre);
  [ruidoSrc, pulsos, irregular, corpo].forEach((n) => { n.start(t); n.stop(t + dur + 0.05); });
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
  vrum: (t) => motor(t),
  digita: (t) => tom(1400 + Math.random() * 300, t, 0.03, { tipo: 'square', vol: 0.03 }),
};

export function tocar(nome) {
  if (!ligado || !somEvento || !ctx || ctx.state !== 'running') return;
  try { SONS[nome]?.(ctx.currentTime + 0.01); } catch { /* ignora */ }
}
