// EGon em 3D: modelo montado com formas simples, rosto de LED no visor e animação procedural.
// Cada ação descreve uma pose-alvo; as juntas seguem o alvo com suavização, então trocar de ação
// sempre gera uma transição natural.
import {
  Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, MeshBasicMaterial, SphereGeometry, CylinderGeometry,
  ConeGeometry, CapsuleGeometry, TorusGeometry, PlaneGeometry, CircleGeometry, CanvasTexture, SRGBColorSpace,
  AdditiveBlending, DoubleSide, Vector3, Quaternion, MathUtils,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const { clamp, lerp } = MathUtils;
const TAU = Math.PI * 2;
const suave = (atual, alvo, k, dt) => atual + (alvo - atual) * (1 - Math.exp(-k * dt));

// Cinemática inversa de 2 ossos (ombro-cotovelo-mão ou quadril-joelho-pé).
// (dx,dy,dz) = alvo a partir da junta; pref = para onde o cotovelo/joelho deve apontar.
// Devolve os ângulos no formato das juntas do EGon: x/z da junta e a dobra do meio.
function ik2(dx, dy, dz, L1, L2, pref) {
  let d = Math.hypot(dx, dy, dz) || 1e-4;
  const dir = [dx / d, dy / d, dz / d];
  d = clamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const alfa = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const dobra = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  const pd = pref[0] * dir[0] + pref[1] * dir[1] + pref[2] * dir[2];
  let perp = [pref[0] - dir[0] * pd, pref[1] - dir[1] * pd, pref[2] - dir[2] * pd];
  const pl = Math.hypot(...perp) || 1; perp = perp.map((v) => v / pl);
  const U = dir.map((v, i) => v * Math.cos(alfa) + perp[i] * Math.sin(alfa));
  return { x: Math.atan2(-U[2], -U[1]), z: Math.asin(clamp(U[0], -1, 1)), dobra };
}

// ---------- materiais ----------
const MAT = {
  branco: new MeshPhysicalMaterial({ color: 0xEEF2F8, roughness: 0.34, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 0.7 }),
  azul: new MeshPhysicalMaterial({ color: 0x0F5BE8, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 0.45 }),
  azulEsc: new MeshPhysicalMaterial({ color: 0x1450BF, roughness: 0.3, clearcoat: 0.8 }),
  grafite: new MeshPhysicalMaterial({ color: 0x2B303B, roughness: 0.5, clearcoat: 0.3 }),
  visor: new MeshPhysicalMaterial({ color: 0x03060D, roughness: 0.06, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 }),
  ciano: new MeshBasicMaterial({ color: 0x55E6FF, toneMapped: false }),
};

const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new Mesh(geo, mat); m.position.set(x, y, z); return m; };
const pivo = (x = 0, y = 0, z = 0) => { const g = new Group(); g.position.set(x, y, z); return g; };

// ---------- rosto de LED ----------
const COLS = 44; const ROWS = 22;
class Rosto {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 256;
    this.ctx = this.cv.getContext('2d');
    this.grid = document.createElement('canvas'); this.grid.width = COLS; this.grid.height = ROWS;
    this.g = this.grid.getContext('2d', { willReadFrequently: true });
    this.tex = new CanvasTexture(this.cv); this.tex.colorSpace = SRGBColorSpace;
    this.expr = 'normal'; this.olhar = { x: 0, y: 0 }; this.piscada = 1; this.t = 0;
    this.proxPiscada = 2; this.acc = 0;
  }

  atualizar(dt) {
    this.t += dt; this.acc += dt;
    // piscar sozinho
    this.proxPiscada -= dt;
    if (this.proxPiscada <= 0) { this.piscando = 0.16; this.proxPiscada = 2 + Math.random() * 3.5; if (Math.random() < 0.18) this.proxPiscada = 0.25; }
    if (this.piscando > 0) { this.piscando -= dt; this.piscada = Math.abs(Math.cos((1 - this.piscando / 0.16) * Math.PI)); } else this.piscada = 1;
    if (this.acc < 1 / 30) return; // o visor é redesenhado a 30 qps
    this.acc = 0;
    this.desenhar();
  }

  desenhar() {
    const g = this.g; const t = this.t;
    g.clearRect(0, 0, COLS, ROWS);
    g.fillStyle = '#fff'; g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
    const ox = this.olhar.x * 3.2; const oy = this.olhar.y * 2.2;
    const E = [{ x: 14 + ox, y: 9.5 + oy }, { x: 30 + ox, y: 9.5 + oy }];
    const b = this.piscada;
    const elipse = (c, rx, ry) => { g.beginPath(); g.ellipse(c.x, c.y, rx, Math.max(0.35, ry), 0, 0, TAU); g.fill(); };
    const arco = (c, r, cima = true, w = 1.7) => { g.lineWidth = w; g.beginPath(); g.arc(c.x, c.y + (cima ? r * 0.45 : -r * 0.45), r, cima ? Math.PI * 1.08 : Math.PI * 0.08, cima ? Math.PI * 1.92 : Math.PI * 0.92); g.stroke(); };
    const boca = (tipo) => {
      const m = { x: 22 + ox * 0.5, y: 17 + oy * 0.4 };
      g.lineWidth = 1.5; g.beginPath();
      if (tipo === 'sorriso') { g.arc(m.x, m.y - 2.2, 3, Math.PI * 0.2, Math.PI * 0.8); g.stroke(); }
      if (tipo === 'aberta') { g.arc(m.x, m.y - 1.2, 3.2, 0, Math.PI); g.closePath(); g.fill(); }
      if (tipo === 'o') { g.ellipse(m.x, m.y, 1.6, 2, 0, 0, TAU); g.stroke(); }
      if (tipo === 'triste') { g.arc(m.x, m.y + 2.4, 2.8, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); }
      if (tipo === 'reta') { g.moveTo(m.x - 2, m.y); g.lineTo(m.x + 2, m.y); g.stroke(); }
      if (tipo === 'onda') { g.moveTo(m.x - 3.5, m.y); for (let i = 0; i <= 7; i++) g.lineTo(m.x - 3.5 + i, m.y + (i % 2 ? -0.8 : 0.8)); g.stroke(); }
    };
    const coracao = (c, s) => {
      g.save(); g.translate(c.x, c.y); g.scale(s, s); g.beginPath();
      g.moveTo(0, 3.6); g.bezierCurveTo(-5.5, -0.5, -3.2, -5.2, 0, -2.2); g.bezierCurveTo(3.2, -5.2, 5.5, -0.5, 0, 3.6); g.fill(); g.restore();
    };
    const estrela = (c, r, rot) => {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5 - Math.PI / 2; const rr = i % 2 ? r * 0.45 : r; g.lineTo(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr); }
      g.closePath(); g.fill();
    };
    const espiral = (c, rot) => {
      g.lineWidth = 1.2; g.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.25) { const r = 0.35 * a; g.lineTo(c.x + Math.cos(a + rot) * r, c.y + Math.sin(a + rot) * r); }
      g.stroke();
    };
    const sobrancelhaCorte = (c, lado, ang) => { // apaga um triângulo para dar emoção ao olho
      g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath();
      g.moveTo(c.x - 5, c.y - 5 + (lado > 0 ? ang : -ang) * 2.4); g.lineTo(c.x + 5, c.y - 5 - (lado > 0 ? ang : -ang) * 2.4); g.lineTo(c.x + 5, c.y - 9); g.lineTo(c.x - 5, c.y - 9); g.fill(); g.restore();
    };

    switch (this.expr) {
      case 'feliz': E.forEach((c) => arco(c, 3.6)); boca('sorriso'); break;
      case 'risada': E.forEach((c) => arco(c, 3.6)); boca('aberta'); break;
      case 'piscar': elipse(E[0], 3, 4.2 * b); arco(E[1], 3.6); boca('sorriso'); break;
      case 'surpreso': g.lineWidth = 1.6; E.forEach((c) => { g.beginPath(); g.arc(c.x, c.y, 4.2, 0, TAU); g.stroke(); elipse(c, 1.3, 1.3); }); boca('o'); break;
      case 'coracao': E.forEach((c) => coracao(c, 1.05 + Math.sin(t * 9) * 0.12)); boca('sorriso'); break;
      case 'estrela': E.forEach((c, i) => estrela(c, 5 + Math.sin(t * 8 + i) * 0.4, t * 1.5)); boca('aberta'); break;
      case 'tonto': E.forEach((c, i) => espiral(c, t * 7 * (i ? -1 : 1))); boca('onda'); break;
      case 'triste': E.forEach((c, i) => { elipse(c, 3, 3.8 * b); sobrancelhaCorte(c, i ? 1 : -1, 1.2); }); boca('triste'); break;
      case 'pensando': {
        const up = E.map((c) => ({ x: c.x - 1.2, y: c.y - 1.2 }));
        up.forEach((c) => elipse(c, 3, 3.2 * b)); boca('reta');
        for (let i = 0; i < 3; i++) { const on = Math.floor(t * 3) % 4 > i; if (on) { g.beginPath(); g.arc(33 + i * 3, 17.5, 0.95, 0, TAU); g.fill(); } }
        break;
      }
      case 'curioso': elipse(E[0], 2.6, 3.2 * b); elipse(E[1], 3.6, 4.8 * b); boca('o'); break;
      case 'focado': E.forEach((c, i) => { elipse(c, 3.2, 3.6 * b); sobrancelhaCorte(c, i ? -1 : 1, 1.1); }); boca('reta'); break;
      case 'dormindo': E.forEach((c) => arco(c, 3.2, false)); boca('o'); break;
      default: E.forEach((c) => elipse(c, 3, 4.2 * b)); boca('sorriso');
    }

    // grade -> pontos de LED
    const px = g.getImageData(0, 0, COLS, ROWS).data;
    const ctx = this.ctx; const W = this.cv.width; const H = this.cv.height;
    ctx.clearRect(0, 0, W, H);
    const cw = W / COLS; const ch = H / ROWS; const r = Math.min(cw, ch) * 0.36;
    ctx.fillStyle = '#5BE8FF';
    ctx.beginPath();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const a = px[(y * COLS + x) * 4 + 3];
        if (a > 70) { const cx = (x + 0.5) * cw; const cy = (y + 0.5) * ch; ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU); }
      }
    }
    ctx.fill();
    // brilho suave em volta dos pontos
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.filter = 'blur(7px)'; ctx.globalAlpha = 0.85; ctx.drawImage(this.cv, 0, 0); ctx.restore();
    this.tex.needsUpdate = true;
  }
}

// ---------- emblema do peito ----------
function texturaEmblema() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const hex = (r) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i * Math.PI) / 3 + Math.PI / 6; c.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } c.closePath(); };
  c.shadowColor = '#3FD9FF'; c.shadowBlur = 26;
  hex(96); c.fillStyle = 'rgba(40,190,255,.35)'; c.fill();
  c.lineWidth = 12; c.strokeStyle = '#7FEFFF'; c.stroke();
  // escudo com "E"
  c.lineWidth = 11; c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = '#E8FDFF';
  c.beginPath(); c.moveTo(128, 70); c.lineTo(172, 88); c.lineTo(172, 128); c.quadraticCurveTo(170, 168, 128, 188); c.quadraticCurveTo(86, 168, 84, 128); c.lineTo(84, 88); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(148, 106); c.lineTo(110, 106); c.lineTo(110, 154); c.lineTo(148, 154); c.moveTo(110, 130); c.lineTo(140, 130); c.stroke();
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
}

function texturaRadial(cor, forca = 1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const c = cv.getContext('2d'); const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, cor); gr.addColorStop(0.45 * forca, cor.replace(/[\d.]+\)$/, '0.35)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
}

// ---------- caneca de chopp 3D ----------
function criarCaneca() {
  const g = new Group();
  const vidro = new MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.28, clearcoat: 1, side: DoubleSide, depthWrite: false });
  const cerveja = new MeshStandardMaterial({ color: 0xFFB21F, emissive: 0x8A4A00, emissiveIntensity: 0.55, roughness: 0.25 });
  const espumaMat = new MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.6, emissive: 0x333333 });
  const liquido = new Group(); // escala y = nível
  const liq = mesh(new CylinderGeometry(0.15, 0.14, 0.34, 28), cerveja, 0, 0.17, 0);
  liquido.add(liq); liquido.position.y = -0.18;
  const espuma = new Group();
  [[0, 0, 0, 0.1], [0.08, 0.02, 0.03, 0.075], [-0.08, 0.01, -0.02, 0.08], [0.02, 0.03, -0.08, 0.07], [-0.03, 0.02, 0.08, 0.07]].forEach(([x, y, z, r]) => espuma.add(mesh(new SphereGeometry(r, 16, 12), espumaMat, x, y, z)));
  const copo = mesh(new CylinderGeometry(0.17, 0.16, 0.4, 28, 1, true), vidro, 0, 0, 0);
  const fundo = mesh(new CylinderGeometry(0.16, 0.16, 0.03, 28), vidro, 0, -0.19, 0);
  const alca = mesh(new TorusGeometry(0.1, 0.03, 10, 24, Math.PI), vidro, 0.17, 0, 0); alca.rotation.z = -Math.PI / 2;
  g.add(liquido, espuma, copo, fundo, alca);
  g.userData = { liquido, espuma, nivel: 1, nivelAlvo: 1 };
  g.atualizar = (dt, t) => {
    const u = g.userData; u.nivel = suave(u.nivel, u.nivelAlvo, 3, dt);
    liquido.scale.y = Math.max(0.001, u.nivel); liquido.visible = u.nivel > 0.02;
    espuma.position.y = -0.18 + 0.34 * u.nivel + 0.03; espuma.scale.setScalar(clamp(u.nivel * 1.6 - 0.5, 0, 1) * (1 + Math.sin(t * 6) * 0.03));
    espuma.visible = u.nivel > 0.35;
  };
  return g;
}

// ---------- o boneco ----------
export class Egon {
  constructor() {
    this.raiz = new Group();      // posição no mundo e direção
    this.corpo = pivo();          // pulo, inclinação, escala
    this.raiz.add(this.corpo);
    this.rosto = new Rosto();
    this.t = 0;
    this.acao = 'idle'; this.tAcao = 0;
    this.efeitos = [];            // gestos curtos: pulo, giro, susto
    this.olharAlvo = new Vector3(0, 1.5, 10); this.olharAtual = { x: 0, y: 0 };
    this.voando = 0; this.vel = new Vector3();
    this.montar();
    this.j = {};                  // valores atuais das juntas
  }

  montar() {
    const c = this.corpo;
    // quadril e pernas
    this.quadril = pivo(0, 0.74, 0); c.add(this.quadril);
    const pelve = mesh(new SphereGeometry(0.27, 32, 20), MAT.azul, 0, 0.02, 0); pelve.scale.set(1.05, 0.62, 0.85); this.quadril.add(pelve);
    this.pernas = [-1, 1].map((s) => {
      const quadril = pivo(s * 0.15, -0.04, 0); this.quadril.add(quadril);
      quadril.add(mesh(new CapsuleGeometry(0.105, 0.14, 8, 16), MAT.branco, 0, -0.13, 0));
      const joelho = pivo(0, -0.28, 0.01); quadril.add(joelho);
      joelho.add(mesh(new SphereGeometry(0.115, 20, 16), MAT.azul, 0, 0, 0.015));
      joelho.add(mesh(new CapsuleGeometry(0.105, 0.08, 8, 16), MAT.branco, 0, -0.12, 0));
      const bota = mesh(new RoundedBoxGeometry(0.25, 0.22, 0.36, 4, 0.08), MAT.azul, 0, -0.33, 0.04); joelho.add(bota);
      bota.add(mesh(new RoundedBoxGeometry(0.26, 0.07, 0.37, 3, 0.03), MAT.grafite, 0, -0.085, 0));
      bota.add(mesh(new RoundedBoxGeometry(0.2, 0.08, 0.1, 3, 0.035), MAT.branco, 0, 0.02, 0.15));
      // chama do jato
      const chama = new Group(); chama.position.set(0, -0.44, 0.04); joelho.add(chama);
      const fogo = mesh(new ConeGeometry(0.09, 0.42, 16, 1, true), new MeshBasicMaterial({ color: 0xFFB13B, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 0, -0.2, 0);
      fogo.rotation.x = Math.PI; chama.add(fogo);
      const nucleo = mesh(new ConeGeometry(0.05, 0.24, 12, 1, true), new MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 0, -0.11, 0);
      nucleo.rotation.x = Math.PI; chama.add(nucleo);
      chama.scale.setScalar(0.001);
      return { quadril, joelho, chama };
    });

    // tronco
    this.cintura = pivo(0, 0.82, 0); c.add(this.cintura);
    this.cintura.add(mesh(new CylinderGeometry(0.2, 0.22, 0.12, 24), MAT.grafite, 0, 0, 0));
    this.tronco = pivo(0, 0.04, 0); this.cintura.add(this.tronco);
    const peito = mesh(new RoundedBoxGeometry(0.66, 0.46, 0.44, 5, 0.17), MAT.azul, 0, 0.21, 0); this.tronco.add(peito);
    const placa = mesh(new RoundedBoxGeometry(0.46, 0.4, 0.1, 5, 0.05), MAT.branco, 0, 0.21, 0.19); this.tronco.add(placa);
    this.emblema = mesh(new PlaneGeometry(0.27, 0.27), new MeshBasicMaterial({ map: texturaEmblema(), transparent: true, toneMapped: false, depthWrite: false }), 0, 0.22, 0.245);
    this.tronco.add(this.emblema);
    const brilhoPeito = mesh(new PlaneGeometry(0.7, 0.7), new MeshBasicMaterial({ map: texturaRadial('rgba(70,210,255,.9)'), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 0, 0.22, 0.25);
    brilhoPeito.renderOrder = 2; this.brilhoPeito = brilhoPeito; this.tronco.add(brilhoPeito);
    this.tronco.add(mesh(new CylinderGeometry(0.12, 0.13, 0.1, 20), MAT.grafite, 0, 0.47, 0));

    // braços
    this.bracos = [-1, 1].map((s) => {
      const ombro = pivo(s * 0.4, 0.34, 0); this.tronco.add(ombro);
      const almofada = mesh(new SphereGeometry(0.15, 24, 18), MAT.azul, 0, 0, 0); almofada.scale.set(1, 0.95, 1.05); ombro.add(almofada);
      ombro.add(mesh(new CapsuleGeometry(0.085, 0.12, 8, 16), MAT.branco, 0, -0.16, 0));
      const cotovelo = pivo(0, -0.29, 0); ombro.add(cotovelo);
      cotovelo.add(mesh(new SphereGeometry(0.083, 16, 12), MAT.grafite));
      cotovelo.add(mesh(new CapsuleGeometry(0.095, 0.1, 8, 16), MAT.azul, 0, -0.12, 0));
      cotovelo.add(mesh(new CylinderGeometry(0.1, 0.1, 0.04, 20), MAT.branco, 0, -0.2, 0));
      const mao = pivo(0, -0.27, 0); cotovelo.add(mao);
      const palma = mesh(new SphereGeometry(0.1, 20, 16), MAT.grafite, 0, -0.04, 0); palma.scale.set(0.95, 1.05, 0.8); mao.add(palma);
      const polegar = mesh(new CapsuleGeometry(0.035, 0.06, 6, 10), MAT.grafite, -s * 0.085, -0.01, 0.04); polegar.rotation.z = -s * 0.7; mao.add(polegar);
      return { ombro, cotovelo, mao, s };
    });

    // cabeça
    this.pescoco = pivo(0, 0.52, 0); this.tronco.add(this.pescoco);
    this.cabeca = pivo(0, 0.36, 0); this.pescoco.add(this.cabeca);
    const casco = new Group(); casco.scale.set(1.0, 0.84, 0.9); this.cabeca.add(casco);
    casco.add(mesh(new SphereGeometry(0.5, 48, 32), MAT.branco));
    casco.add(mesh(new SphereGeometry(0.507, 48, 16, 0, TAU, 0, 0.78), MAT.azul));
    casco.add(mesh(new SphereGeometry(0.505, 48, 8, Math.PI / 2 - 1.18, 2.36, 2.12, 0.5), MAT.azul));
    const visor = mesh(new SphereGeometry(0.512, 48, 24, Math.PI / 2 - 1.08, 2.16, 1.0, 1.1), MAT.visor); casco.add(visor);
    this.telaRosto = mesh(new SphereGeometry(0.516, 48, 24, Math.PI / 2 - 0.98, 1.96, 1.07, 0.98),
      new MeshBasicMaterial({ map: this.rosto.tex, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    casco.add(this.telaRosto);
    // borda do visor
    // orelhas
    [-1, 1].forEach((s) => {
      const fone = mesh(new CylinderGeometry(0.17, 0.17, 0.14, 32), MAT.azul, s * 0.47, -0.02, 0); fone.rotation.z = Math.PI / 2; this.cabeca.add(fone);
      const anel = mesh(new CylinderGeometry(0.12, 0.12, 0.16, 32), MAT.branco, s * 0.48, -0.02, 0); anel.rotation.z = Math.PI / 2; this.cabeca.add(anel);
      const luz = mesh(new CircleGeometry(0.07, 24), MAT.ciano, s * 0.565, -0.02, 0); luz.rotation.y = s * Math.PI / 2; this.cabeca.add(luz);
      const chifre = mesh(new ConeGeometry(0.085, 0.36, 24), MAT.azul, s * 0.33, 0.42, -0.02); chifre.rotation.z = -s * 0.52; this.cabeca.add(chifre);
    });

    // caneca (aparece quando ele segura)
    this.caneca = criarCaneca(); this.caneca.visible = false; this.caneca.scale.setScalar(0.001);
    this.bracos[1].mao.add(this.caneca); this.caneca.position.set(0.02, -0.12, 0.12);

    // área de toque generosa
    this.alvoToque = mesh(new CylinderGeometry(0.62, 0.55, 2.3, 12), new MeshBasicMaterial({ visible: false }), 0, 1.12, 0);
    this.corpo.add(this.alvoToque);
  }

  // ---------- API ----------
  setAcao(nome) { if (this.acao !== nome) { this.acao = nome; this.tAcao = 0; } }
  setExpressao(nome) { this.rosto.expr = nome; }
  gesto(nome, dur) { this.efeitos.push({ nome, t: 0, dur: dur || { pulo: 0.7, giro: 0.9, susto: 0.5, aterrissa: 0.45, cocega: 0.5, montar: 0.42 }[nome] || 0.6 }); }
  segurarCaneca(sim, nivel = 1) {
    this.comCaneca = sim; this.caneca.visible = true; this.caneca.userData.nivelAlvo = nivel;
    if (sim && this.caneca.userData.nivel > nivel) this.caneca.userData.nivel = nivel;
  }
  nivelCaneca(n) { this.caneca.userData.nivelAlvo = n; }

  // pose-alvo da ação atual
  poseAlvo(t) {
    const p = {
      y: Math.sin(t * 2.2) * 0.025, inclX: 0, inclZ: Math.sin(t * 1.1) * 0.02, giro: 0,
      troncoX: Math.sin(t * 2.2 + 1) * 0.025, troncoY: 0, troncoZ: 0,
      cabX: 0, cabY: 0, cabZ: Math.sin(t * 0.9) * 0.04,
      b: [{ x: 0.05, z: -0.16, ex: -0.25, ez: 0 }, { x: 0.05, z: 0.16, ex: -0.25, ez: 0 }],
      p: [{ x: 0, z: -0.03, j: 0 }, { x: 0, z: 0.03, j: 0 }],
      olhar: 1, jato: 0,
    };
    const ta = this.tAcao; const sn = Math.sin;
    switch (this.acao) {
      case 'acenar': {
        p.b[1].z = 2.5 + sn(t * 9) * 0.32; p.b[1].x = -0.15; p.b[1].ex = -0.5; p.b[1].ez = sn(t * 9 + 0.6) * 0.35;
        p.inclZ = -0.06; p.cabZ = -0.12; break;
      }
      case 'chamar': { // "vem cá"
        p.b[1].x = -1.35; p.b[1].z = 0.3; p.b[1].ex = -1.2 - (sn(t * 7) * 0.5 + 0.5) * 0.9; p.inclX = 0.06; p.cabZ = 0.1; break;
      }
      case 'apontar': {
        const a = this.anguloApontar ?? 1.6; const lado = a >= 0 ? 1 : 0;
        p.b[lado].z = a; p.b[lado].x = -0.35; p.b[lado].ex = -0.08;
        p.troncoY = (a >= 0 ? 1 : -1) * 0.18; p.cabY = (a >= 0 ? 1 : -1) * 0.3; p.olhar = 0.2; break;
      }
      case 'joinha': {
        p.b[1].x = -1.0; p.b[1].z = 0.45; p.b[1].ex = -1.5; p.b[1].ez = 0.2; p.cabZ = -0.08; p.inclZ = -0.04; break;
      }
      case 'pensar': {
        p.b[1].x = -1.25; p.b[1].z = 0.25; p.b[1].ex = -2.25; p.b[1].ez = -0.25;
        p.b[0].x = -0.55; p.b[0].z = -0.35; p.b[0].ex = -1.55; p.b[0].ez = 0.45;
        p.cabZ = 0.14 + sn(t * 1.3) * 0.04; p.cabX = -0.12; p.troncoZ = -0.04; p.olhar = 0.35; break;
      }
      case 'comemorar': {
        const f = t * 7.5; const pulo = Math.abs(sn(f));
        p.y = pulo * 0.38; p.b[0].z = -2.55 - sn(f) * 0.25; p.b[1].z = 2.55 + sn(f) * 0.25; p.b[0].ex = p.b[1].ex = -0.25;
        p.p[0].x = p.p[1].x = -0.35 * (1 - pulo); p.p[0].j = p.p[1].j = 0.7 * (1 - pulo); p.cabX = -0.15; p.olhar = 0.4; break;
      }
      case 'dancar': {
        const f = t * 6;
        p.y = Math.abs(sn(f)) * 0.08; p.inclZ = sn(f / 2) * 0.12; p.giro = sn(f / 4) * 0.35; p.troncoZ = sn(f / 2) * 0.1;
        p.b[0].z = -1.4 - sn(f / 2) * 1.1; p.b[1].z = 1.4 - sn(f / 2) * 1.1; p.b[0].ex = p.b[1].ex = -1.1;
        p.p[0].x = sn(f / 2) > 0 ? -0.5 : 0; p.p[0].j = sn(f / 2) > 0 ? 0.9 : 0; p.p[1].x = sn(f / 2) < 0 ? -0.5 : 0; p.p[1].j = sn(f / 2) < 0 ? 0.9 : 0;
        p.cabZ = sn(f / 2) * -0.15; p.cabX = sn(f) * 0.06; break;
      }
      case 'triste': {
        p.y = -0.05; p.troncoX = 0.18; p.cabX = 0.32; p.cabZ = 0.1; p.b[0].z = -0.05; p.b[1].z = 0.05; p.b[0].x = p.b[1].x = 0.12;
        p.b[0].ex = p.b[1].ex = -0.05; p.p[0].j = p.p[1].j = 0.15; p.olhar = 0.15; break;
      }
      case 'tonto': {
        p.inclZ = sn(t * 5) * 0.16; p.inclX = Math.cos(t * 5) * 0.08; p.cabZ = sn(t * 5 + 1) * 0.25; p.cabX = Math.cos(t * 5 + 1) * 0.15;
        p.b[0].z = -0.9 + sn(t * 4) * 0.3; p.b[1].z = 0.9 + Math.cos(t * 4) * 0.3; p.olhar = 0; break;
      }
      case 'voar': {
        p.y = sn(t * 3) * 0.06; p.b[0].x = p.b[1].x = 0.75; p.b[0].z = -0.45; p.b[1].z = 0.45; p.b[0].ex = p.b[1].ex = -0.3;
        p.p[0].x = 0.4; p.p[1].x = 0.15; p.p[0].j = 0.45; p.p[1].j = 0.3; p.jato = 1; p.troncoX = 0.1; break;
      }
      case 'super': { // voo com o punho para a frente
        p.y = sn(t * 3) * 0.05; p.b[1].z = 2.9; p.b[1].x = -0.2; p.b[1].ex = 0; p.b[0].x = 0.7; p.b[0].z = -0.4; p.b[0].ex = -0.6;
        p.p[0].x = 0.3; p.p[1].x = 0.05; p.p[0].j = 0.6; p.p[1].j = 0.1; p.jato = 1; p.inclZ = -0.35; p.cabZ = 0.25; break;
      }
      case 'arrastado': {
        const f = t * 14;
        p.b[0].z = -2.3 + sn(f) * 0.5; p.b[1].z = 2.3 + sn(f + 1) * 0.5; p.b[0].ex = p.b[1].ex = -0.4;
        p.p[0].x = sn(f) * 0.6; p.p[1].x = -sn(f) * 0.6; p.p[0].j = 0.5 + sn(f) * 0.4; p.p[1].j = 0.5 - sn(f) * 0.4; p.jato = 0.4; p.olhar = 0.5; break;
      }
      case 'segurar': {
        p.b[1].x = -0.95; p.b[1].z = 0.18; p.b[1].ex = -0.75; p.b[0].z = -0.25; p.b[0].x = -0.15; p.b[0].ex = -0.5; p.cabX = 0.05; break;
      }
      case 'brinde': {
        const up = ta < 0.5 ? ta / 0.5 : 1;
        p.b[1].x = -1.5 * up - 0.4; p.b[1].z = 0.3; p.b[1].ex = -0.4; p.b[0].z = -1.8; p.b[0].ex = -0.8;
        p.y = Math.abs(sn(t * 6)) * 0.08; p.cabX = -0.12; break;
      }
      case 'andar': {
        const f = t * 9.5; const a = Math.sin(f); const b = Math.sin(f + Math.PI);
        p.y = Math.abs(Math.cos(f)) * 0.045; p.inclZ = Math.sin(f) * 0.03; p.troncoY = a * 0.08;
        p.p[0].x = a * 0.5; p.p[1].x = b * 0.5; p.p[0].j = Math.max(0, -a) * 0.9 + 0.08; p.p[1].j = Math.max(0, -b) * 0.9 + 0.08;
        p.b[0].x = b * 0.45; p.b[1].x = a * 0.45; p.b[0].ex = p.b[1].ex = -0.45; p.cabZ = Math.sin(f) * 0.04; break;
      }
      case 'alongar': {
        const k = Math.min(1, ta / 0.5);
        p.b[0].z = -2.9 * k; p.b[1].z = 2.9 * k; p.b[0].x = p.b[1].x = -0.15; p.b[0].ex = p.b[1].ex = -0.15;
        p.y = 0.04 * k; p.troncoX = -0.1 * k; p.cabX = -0.25 * k; p.inclZ = Math.sin(t * 2) * 0.05; p.olhar = 0.2; break;
      }
      case 'pilotar': { // sentado no banco, mãos nas manoplas e pés nas pedaleiras (encaixe por cinemática inversa)
        const a = this.apoios || { mao: [0.46, 1.5, 0.58], pe: [0.3, 0.7, 0.28], assentoY: 0.985 };
        const vib = Math.sin(t * 55) * 0.003;
        const y = a.assentoY - 0.593; const tx = 0.2;
        p.y = y + vib; p.inclX = 0; p.inclZ = 0; p.giro = 0; p.troncoX = tx; p.troncoY = 0; p.troncoZ = 0; p.cabX = -0.12; p.olhar = 0.7;
        const ty = 0.86 + y; const c = Math.cos(tx); const sn = Math.sin(tx);
        [-1, 1].forEach((s, i) => {
          // braço: alvo levado para o referencial do tronco inclinado
          const vy = a.mao[1] - ty; const vz = a.mao[2];
          const ly = vy * c + vz * sn - 0.34; const lz = -vy * sn + vz * c;
          const b = ik2(s * a.mao[0] - s * 0.4, ly, lz, 0.29, 0.31, [0, -1, -0.35]);
          p.b[i] = { x: b.x, z: b.z, ex: -b.dobra, ez: 0 };
          // perna: do quadril até a pedaleira
          const l = ik2(s * a.pe[0] - s * 0.15, a.pe[1] - (0.7 + y), a.pe[2], 0.28, 0.33, [0, 0.35, 1]);
          p.p[i] = { x: l.x, z: l.z, j: l.dobra };
        });
        break;
      }
      case 'dormir': {
        p.y = -0.04; p.troncoX = 0.1 + sn(t * 1.2) * 0.03; p.cabX = 0.28 + sn(t * 1.2) * 0.04; p.cabZ = 0.22;
        p.b[0].z = -0.05; p.b[1].z = 0.05; p.olhar = 0; break;
      }
      case 'abraco': {
        p.b[0].x = p.b[1].x = -1.2; p.b[0].z = -0.6; p.b[1].z = 0.6; p.b[0].ex = p.b[1].ex = -1.3; p.b[0].ez = 0.8; p.b[1].ez = -0.8;
        p.inclZ = sn(t * 3) * 0.08; p.cabZ = sn(t * 3) * 0.12; break;
      }
      default: { // idle: respira e balança os braços de leve
        p.b[0].z += sn(t * 2.2) * 0.04; p.b[1].z -= sn(t * 2.2) * 0.04;
      }
    }
    return p;
  }

  atualizar(dt, cam) {
    this.t += dt; this.tAcao += dt;
    const t = this.t;
    const p = this.poseAlvo(t);

    // gestos curtos por cima da pose
    let extraY = 0; let giro = 0; let sx = 1; let sy = 1; let tremor = 0;
    this.efeitos = this.efeitos.filter((e) => {
      e.t += dt; const k = clamp(e.t / e.dur, 0, 1);
      if (e.nome === 'pulo') { extraY += Math.sin(k * Math.PI) * 0.55; const sq = k < 0.15 ? k / 0.15 : k > 0.85 ? (1 - k) / 0.15 : 0; sy -= sq * 0.12; sx += sq * 0.08; }
      if (e.nome === 'giro') giro += TAU * (1 - (1 - k) ** 3);
      if (e.nome === 'susto') { sy += Math.sin(k * Math.PI) * 0.12; sx -= Math.sin(k * Math.PI) * 0.06; extraY += Math.sin(k * Math.PI) * 0.15; }
      if (e.nome === 'aterrissa') { const s = Math.sin(k * Math.PI) * (1 - k); sy -= s * 0.25; sx += s * 0.16; }
      if (e.nome === 'montar') { extraY += Math.sin(k * Math.PI) * 0.22; const sq = k > 0.8 ? (1 - k) / 0.2 : 0; sy -= sq * 0.08; sx += sq * 0.05; }
      if (e.nome === 'cocega') { tremor += Math.sin(k * 40) * (1 - k) * 0.12; sy += Math.sin(k * Math.PI) * 0.05; }
      return e.t < e.dur;
    });

    // suaviza as juntas
    const j = this.j; const K = 10;
    const s = (nome, alvo, k = K) => { j[nome] = suave(j[nome] ?? alvo, alvo, k, dt); return j[nome]; };
    this.corpo.position.y = s('y', p.y) + extraY;
    this.corpo.rotation.x = s('inclX', p.inclX + this.inclVooX);
    this.corpo.rotation.z = s('inclZ', p.inclZ + this.inclVooZ) + tremor;
    this.corpo.rotation.y = s('giro', p.giro) + giro;
    this.corpo.scale.set(sx, sy, sx);
    this.tronco.rotation.set(s('tX', p.troncoX), s('tY', p.troncoY), s('tZ', p.troncoZ));

    // cabeça olha para o alvo (pessoa ou dedo)
    const olhar = s('olharPeso', p.olhar, 4);
    const cp = new Vector3(); this.cabeca.getWorldPosition(cp);
    const d = this.olharAlvo.clone().sub(cp);
    const escala = this.raiz.scale.x || 1;
    const yaw = clamp(Math.atan2(d.x, Math.max(0.5, d.z)), -0.75, 0.75) - this.raiz.rotation.y;
    const pitch = clamp(-Math.atan2(d.y, Math.max(0.5, d.z)) * 0.8, -0.45, 0.45);
    this.olharAtual.x = suave(this.olharAtual.x, yaw * olhar, 7, dt); this.olharAtual.y = suave(this.olharAtual.y, pitch * olhar, 7, dt);
    this.cabeca.rotation.set(s('cX', p.cabX) + this.olharAtual.y * 0.75, s('cY', p.cabY) + this.olharAtual.x * 0.85, s('cZ', p.cabZ));
    this.rosto.olhar.x = clamp(this.olharAtual.x * 1.4, -1, 1) * (olhar > 0.1 ? 1 : 0);
    this.rosto.olhar.y = clamp(this.olharAtual.y * 1.6, -1, 1) * (olhar > 0.1 ? 1 : 0);
    void escala;

    this.bracos.forEach((b, i) => {
      const a = p.b[i]; const n = i ? 'D' : 'E';
      b.ombro.rotation.set(s(`o${n}x`, a.x), 0, s(`o${n}z`, a.z));
      b.cotovelo.rotation.set(s(`c${n}x`, a.ex), 0, s(`c${n}z`, a.ez || 0));
    });
    this.pernas.forEach((l, i) => {
      const a = p.p[i]; const n = i ? 'D' : 'E';
      l.quadril.rotation.set(s(`q${n}x`, a.x), 0, s(`q${n}z`, a.z));
      l.joelho.rotation.x = s(`j${n}`, a.j);
      const jato = s(`jato${n}`, p.jato, 8);
      l.chama.scale.set(jato * (0.9 + Math.random() * 0.2), jato * (0.8 + Math.random() * 0.4), jato * (0.9 + Math.random() * 0.2));
      l.chama.visible = jato > 0.02;
    });

    // caneca: sempre de pé, aparece e some com mola
    const cs = s('canecaEsc', this.comCaneca ? 1 : 0, 9);
    this.caneca.scale.setScalar(Math.max(0.001, cs)); this.caneca.visible = cs > 0.01;
    if (this.caneca.visible) {
      const qm = new Quaternion(); this.bracos[1].mao.getWorldQuaternion(qm);
      const qr = new Quaternion(); this.raiz.getWorldQuaternion(qr);
      this.caneca.quaternion.copy(qm.invert().multiply(qr));
      this.caneca.atualizar(dt, t);
    }

    // brilho do peito pulsando
    this.brilhoPeito.material.opacity = 0.55 + Math.sin(t * 2.6) * 0.25;
    this.rosto.atualizar(dt);
    void cam; void lerp;
  }
}
Egon.prototype.inclVooX = 0;
Egon.prototype.inclVooZ = 0;
