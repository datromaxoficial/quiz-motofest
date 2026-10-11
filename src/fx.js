// Efeitos 2D: fundo com luzes (bokeh) e partículas por cima de tudo (confete, faíscas, corações, ondas de toque).

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// ---------- fundo ----------
function sprite(r, g, b) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
  const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.35, `rgba(${r},${g},${b},.35)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  c.fillStyle = gr; c.fillRect(0, 0, 64, 64); return cv;
}

export class Fundo {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.ouro = 0; this.ouroAlvo = 0; this.warp = 0; this.warpAlvo = 0; this.px = 0; this.py = 0;
    this.redim(); addEventListener('resize', () => this.redim());
    addEventListener('pointermove', (e) => { this.px = e.clientX / innerWidth - 0.5; this.py = e.clientY / innerHeight - 0.5; }, { passive: true });
    this.sprAzul = sprite(80, 170, 255); this.sprOuro = sprite(255, 196, 80);
    this.luzes = Array.from({ length: 46 }, () => this.novaLuz(true));
    let ult = performance.now();
    const loop = (t) => { const dt = Math.max(0, Math.min(0.05, (t - ult) / 1000)); ult = t; this.quadro(dt, t / 1000); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  redim() {
    this.dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.w = innerWidth; this.h = innerHeight;
    this.cv.width = this.w * this.dpr; this.cv.height = this.h * this.dpr;
  }
  novaLuz(inicio) {
    const z = rnd(0.15, 1); // profundidade: perto = maior, mais rápido
    return { x: Math.random(), y: inicio ? Math.random() : 1.1, z, r: rnd(2, 9) * (0.4 + z), fase: rnd(0, TAU), tipo: Math.random() < 0.22 ? 1 : 0 };
  }
  pulsoWarp(ms = 900) { this.warpAlvo = 1; clearTimeout(this.tw); this.tw = setTimeout(() => { this.warpAlvo = 0; }, ms); }
  setOuro(sim) { this.ouroAlvo = sim ? 1 : 0; }
  quadro(dt, t) {
    const { ctx, w, h, dpr } = this;
    this.ouro += (this.ouroAlvo - this.ouro) * (1 - Math.exp(-2.5 * dt));
    this.warp += (this.warpAlvo - this.warp) * (1 - Math.exp(-(this.warpAlvo ? 6 : 2.5) * dt));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const cx = w * 0.5; const cy = h * 0.42;
    for (const l of this.luzes) {
      const vel = (0.012 + l.z * 0.03) * (1 + this.warp * 14);
      l.y -= vel * dt;
      if (l.y < -0.1) Object.assign(l, this.novaLuz(false));
      let x = l.x * w + this.px * -40 * l.z; let y = l.y * h + this.py * -25 * l.z;
      x += Math.sin(t * 0.3 + l.fase) * 12 * l.z;
      const brilho = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.2 + l.fase))) * (0.25 + l.z * 0.55);
      const spr = l.tipo ? this.sprOuro : this.sprAzul;
      if (this.warp > 0.05) { // rastro de velocidade saindo do centro
        const dx = x - cx; const dy = y - cy; const len = this.warp * 90 * l.z;
        const d = Math.hypot(dx, dy) || 1;
        ctx.strokeStyle = l.tipo || this.ouro > 0.5 ? `rgba(255,200,90,${brilho * this.warp})` : `rgba(90,175,255,${brilho * this.warp})`;
        ctx.lineWidth = l.r * 0.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (dx / d) * len, y + (dy / d) * len); ctx.stroke();
      }
      const r = l.r * 2.2;
      ctx.globalAlpha = brilho * (l.tipo ? 1 : 1 - this.ouro); ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
      if (!l.tipo && this.ouro > 0.01) { ctx.globalAlpha = brilho * this.ouro; ctx.drawImage(this.sprOuro, x - r, y - r, r * 2, r * 2); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------- partículas ----------
const CORES_FESTA = ['#FFC531', '#FF9F1C', '#1D6CF0', '#4FD8FF', '#FFFFFF', '#2BD67B', '#FF5C8A'];

export class Efeitos {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d'); this.ps = []; this.rodando = false;
    this.redim(); addEventListener('resize', () => this.redim());
  }
  redim() { this.dpr = Math.min(devicePixelRatio || 1, 1.5); this.w = innerWidth; this.h = innerHeight; this.cv.width = this.w * this.dpr; this.cv.height = this.h * this.dpr; }
  add(p) { this.ps.push(p); if (!this.rodando) { this.rodando = true; this.ult = performance.now(); requestAnimationFrame((t) => this.quadro(t)); } }

  onda(x, y, cor = 'rgba(120,200,255,') { this.add({ tipo: 'onda', x, y, vida: 0, dur: 0.55, cor }); }
  explosao(x, y, opc = {}) {
    const { n = 24, tipos = ['faisca', 'estrela'], cores = ['#FFE27A', '#FFFFFF', '#6FE3FF'], forca = 1 } = opc;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, TAU); const v = rnd(180, 520) * forca;
      this.add({ tipo: pick(tipos), x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * forca, g: 520, atrito: 2.2, vida: 0, dur: rnd(0.6, 1.1), cor: pick(cores), r: rnd(5, 11), rot: rnd(0, TAU), vr: rnd(-6, 6) });
    }
  }
  coracoes(x, y, n = 8) {
    for (let i = 0; i < n; i++) this.add({ tipo: 'coracao', x: x + rnd(-40, 40), y: y + rnd(-20, 20), vx: rnd(-50, 50), vy: rnd(-220, -120), g: -30, atrito: 0.8, vida: 0, dur: rnd(1.1, 1.8), cor: pick(['#FF5C8A', '#FF8FB1', '#FFFFFF']), r: rnd(10, 18), rot: rnd(-0.4, 0.4), vr: rnd(-1, 1) });
  }
  zzz(x, y) { this.add({ tipo: 'z', x, y, vx: rnd(10, 30), vy: -45, g: 0, atrito: 0, vida: 0, dur: 2.4, cor: '#9FD8FF', r: rnd(18, 28), rot: rnd(-0.3, 0.1), vr: 0.2 }); }
  bolhas(n = 30) {
    for (let i = 0; i < n; i++) this.add({ tipo: 'bolha', x: rnd(0, this.w), y: this.h + rnd(0, 200), vx: rnd(-10, 10), vy: rnd(-320, -160), g: 0, atrito: 0, vida: 0, dur: rnd(2.2, 3.6), cor: '#FFE6A0', r: rnd(4, 14), fase: rnd(0, TAU) });
  }
  canhao(lado, n = 70) { // confete saindo dos cantos de baixo
    const x = lado < 0 ? 0 : this.w; const y = this.h;
    for (let i = 0; i < n; i++) {
      const a = (lado < 0 ? -Math.PI / 2 + rnd(0.15, 0.75) : -Math.PI / 2 - rnd(0.15, 0.75)); const v = rnd(700, 1250);
      this.add(this.confete(x, y, Math.cos(a) * v, Math.sin(a) * v));
    }
  }
  chuva(n = 120) { for (let i = 0; i < n; i++) this.add(this.confete(rnd(0, this.w), rnd(-this.h * 0.6, -20), rnd(-40, 40), rnd(60, 220))); }
  confete(x, y, vx, vy) {
    return { tipo: Math.random() < 0.25 ? 'fita' : 'confete', x, y, vx, vy, g: 900, atrito: 1.6, vida: 0, dur: rnd(3.5, 5.5), cor: pick(CORES_FESTA), r: rnd(7, 13), rot: rnd(0, TAU), vr: rnd(-9, 9), giro: rnd(0, TAU), vgiro: rnd(6, 14) };
  }
  fogos(x, y) {
    const cor = pick([['#FFD45C', '#FFFFFF'], ['#6FE3FF', '#FFFFFF'], ['#2BD67B', '#E8FFF0'], ['#FF8FB1', '#FFFFFF']]);
    for (let i = 0; i < 46; i++) { const a = (i / 46) * TAU; const v = rnd(260, 420); this.add({ tipo: 'faisca', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 260, atrito: 1.8, vida: 0, dur: rnd(0.9, 1.4), cor: pick(cor), r: rnd(6, 10), rot: 0, vr: 0 }); }
    this.onda(x, y, 'rgba(255,230,150,');
  }
  limpar() { this.ps = []; }

  quadro(t) {
    const dt = Math.max(0, Math.min(0.05, (t - this.ult) / 1000)); this.ult = t;
    const { ctx, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, this.w, this.h);
    this.ps = this.ps.filter((p) => {
      p.vida += dt; const k = p.vida / p.dur; if (k >= 1) return false;
      if (p.vx !== undefined) {
        const at = Math.exp(-(p.atrito || 0) * dt); p.vx *= at; p.vy = p.vy * at + (p.g || 0) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += (p.vr || 0) * dt;
      }
      const a = k > 0.75 ? (1 - k) / 0.25 : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(p.x, p.y); ctx.rotate(p.rot || 0);
      switch (p.tipo) {
        case 'onda': { ctx.restore(); ctx.save(); const r = Math.max(1, 12 + k * 70); ctx.strokeStyle = `${p.cor}${(1 - k) * 0.9})`; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke(); break; }
        case 'faisca': { ctx.globalCompositeOperation = 'lighter'; const v = Math.hypot(p.vx, p.vy); const ang = Math.atan2(p.vy, p.vx); ctx.rotate(-p.rot + ang); ctx.strokeStyle = p.cor; ctx.lineWidth = p.r * 0.35; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-Math.min(40, v * 0.06), 0); ctx.stroke(); break; }
        case 'estrela': { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = p.cor; ctx.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? p.r * 0.28 : p.r; const an = (i * Math.PI) / 4; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); } ctx.closePath(); ctx.fill(); break; }
        case 'coracao': { const s = p.r / 10; ctx.scale(s, s); ctx.fillStyle = p.cor; ctx.beginPath(); ctx.moveTo(0, 6); ctx.bezierCurveTo(-11, -2, -6, -11, 0, -5); ctx.bezierCurveTo(6, -11, 11, -2, 0, 6); ctx.fill(); break; }
        case 'confete': { p.giro += p.vgiro * dt; ctx.scale(1, Math.cos(p.giro)); ctx.fillStyle = p.cor; ctx.fillRect(-p.r / 2, -p.r * 0.32, p.r, p.r * 0.64); break; }
        case 'fita': { p.giro += p.vgiro * dt; ctx.strokeStyle = p.cor; ctx.lineWidth = 3.5; ctx.beginPath(); for (let i = 0; i <= 6; i++) ctx.lineTo(i * 3 - 9, Math.sin(p.giro + i) * 4); ctx.stroke(); break; }
        case 'bolha': { ctx.restore(); ctx.save(); ctx.globalAlpha = a * 0.75; const x = p.x + Math.sin(p.vida * 3 + p.fase) * 8; ctx.strokeStyle = p.cor; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, TAU); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(x - p.r * 0.35, p.y - p.r * 0.35, p.r * 0.25, 0, TAU); ctx.fill(); break; }
        case 'z': { ctx.fillStyle = p.cor; ctx.font = `900 italic ${p.r}px Archivo, sans-serif`; ctx.fillText('z', 0, 0); break; }
        default:
      }
      ctx.restore();
      return true;
    });
    if (this.ps.length) requestAnimationFrame((tt) => this.quadro(tt));
    else { this.rodando = false; ctx.clearRect(0, 0, this.w, this.h); }
  }
}
