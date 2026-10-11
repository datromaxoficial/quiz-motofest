// Palco 3D: câmera, luzes, o EGon, posicionamento pelas âncoras do layout, toque e balão de fala.
import {
  WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, PointLight, Color, Vector2, Vector3,
  Raycaster, PMREMGenerator, Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, AdditiveBlending,
  NeutralToneMapping, MathUtils, Plane,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Egon } from './egon3d.js';

const { clamp } = MathUtils;
const ALTURA_EGON = 2.15; // altura do boneco em unidades do mundo (com os chifres)

// Mola criticamente amortecida (estilo SmoothDamp).
function amortecer(atual, alvo, velObj, chave, tempo, dt, max = Infinity) {
  const omega = 2 / Math.max(0.0001, tempo); const x = omega * dt; const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  let mudanca = atual - alvo; const maxMud = max * tempo; mudanca = clamp(mudanca, -maxMud, maxMud);
  const alvoAj = atual - mudanca; const v = velObj[chave] || 0;
  const temp = (v + omega * mudanca) * dt; velObj[chave] = (v - omega * temp) * exp;
  let saida = alvoAj + (mudanca + temp) * exp;
  if ((alvo - atual > 0) === (saida > alvo)) { saida = alvo; velObj[chave] = (saida - alvo) / dt; }
  return saida;
}

function texturaAnel() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  const g = c.createRadialGradient(128, 128, 30, 128, 128, 128);
  g.addColorStop(0, 'rgba(60,170,255,0)'); g.addColorStop(0.62, 'rgba(60,170,255,.0)'); g.addColorStop(0.78, 'rgba(90,210,255,.55)');
  g.addColorStop(0.84, 'rgba(160,235,255,.9)'); g.addColorStop(0.9, 'rgba(90,210,255,.35)'); g.addColorStop(1, 'rgba(60,170,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  const g2 = c.createRadialGradient(128, 128, 0, 128, 128, 110); g2.addColorStop(0, 'rgba(60,160,255,.35)'); g2.addColorStop(1, 'rgba(60,160,255,0)');
  c.fillStyle = g2; c.fillRect(0, 0, 256, 256);
  c.strokeStyle = 'rgba(160,230,255,.6)'; c.lineWidth = 3; c.setLineDash([10, 14]); c.beginPath(); c.arc(128, 128, 92, 0, Math.PI * 2); c.stroke();
  const t = new CanvasTexture(cv); t.colorSpace = SRGBColorSpace; return t;
}
function texturaSombra() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d');
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(0,4,20,.75)'); g.addColorStop(0.6, 'rgba(0,4,20,.3)'); g.addColorStop(1, 'rgba(0,4,20,0)');
  c.fillStyle = g; c.fillRect(0, 0, 128, 128); const t = new CanvasTexture(cv); return t;
}

export class Palco {
  constructor(canvas, balao) {
    this.canvas = canvas; this.balao = balao; this.balaoTexto = balao.querySelector('span');
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = NeutralToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.cena = new Scene();
    this.camera = new PerspectiveCamera(26, 1, 1, 100); this.camera.position.set(0, 0, 22);
    const pm = new PMREMGenerator(this.renderer);
    this.cena.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

    this.cena.add(new HemisphereLight(0xCFE4FF, 0x0A1430, 0.9));
    const chave = new DirectionalLight(0xFFFFFF, 2.0); chave.position.set(4, 6, 9); this.cena.add(chave);
    this.contraA = new DirectionalLight(0x3D8BFF, 2.4); this.contraA.position.set(-6, 3, -4); this.cena.add(this.contraA);
    this.contraB = new DirectionalLight(0x38D5FF, 1.6); this.contraB.position.set(6, 1, -5); this.cena.add(this.contraB);
    this.luzPeito = new PointLight(0x55E6FF, 1.2, 3); this.cena.add(this.luzPeito);

    this.egon = new Egon(); this.cena.add(this.egon.raiz);
    this.anel = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: texturaAnel(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.anel.rotation.x = -Math.PI / 2; this.cena.add(this.anel);
    this.sombra = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: texturaSombra(), transparent: true, depthWrite: false }));
    this.sombra.rotation.x = -Math.PI / 2; this.cena.add(this.sombra);

    // estado
    this.ancora = null; this.opcAncora = {};
    this.pos = new Vector3(0, -2, 0); this.vel = {}; this.escala = 1; this.chao = new Vector3();
    this.voando = false; this.livre = null; // posição livre (voos coreografados)
    this.acaoBase = 'idle'; this.exprBase = 'normal';
    this.ponteiro = null; this.ultimoPonteiro = -10; this.olharTela = null;
    this.ray = new Raycaster(); this.plano = new Plane(new Vector3(0, 0, 1), 0);
    this.arrasto = null; this.combo = 0; this.ultimoToque = 0;
    this.modoOuro = 0;
    this.t = 0;
    this.redimensionar();
    addEventListener('resize', () => this.redimensionar());
    this.ligarToque();
    this.ultimoT = performance.now();
    const loop = (now) => { const dt = Math.max(0, Math.min(0.05, (now - this.ultimoT) / 1000)); this.ultimoT = now; if (dt > 0) this.quadro(dt); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  redimensionar() {
    const w = innerWidth; const h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
    this.pxPorUnidade = h / (2 * this.camera.position.z * Math.tan(MathUtils.degToRad(this.camera.fov / 2)));
  }

  // ---------- conversões tela <-> mundo (plano z = 0) ----------
  telaParaMundo(x, y, z = 0) {
    const v = new Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    this.plano.constant = -z; const p = new Vector3(); this.ray.ray.intersectPlane(this.plano, p); return p;
  }
  mundoParaTela(v) { const p = v.clone().project(this.camera); return { x: (p.x + 1) / 2 * this.w, y: (1 - p.y) / 2 * this.h }; }

  // ---------- API usada pelas telas ----------
  // Leva o EGon até uma âncora do layout. A base da âncora é o chão; a altura dela é a altura dele.
  irPara(el, opc = {}) { this.ancora = el; this.opcAncora = opc; this.livre = null; this.deslocPx = 0; if (opc.instantaneo) this.calcAlvo(true); }
  // Caminha alguns pixels para o lado da âncora (0 = volta ao lugar).
  passear(px) { this.deslocPx = px; }
  // Gestos espontâneos quando ninguém está interagindo. lista = null desliga.
  espontaneo(lista) { this.fidgets = lista; this.proxFidget = 3 + Math.random() * 3; }
  // Posição livre em pixels (pés), no ar: ele fica voando até voltar para uma âncora.
  voarPara(x, y, alturaPx, acao = 'voar') { this.livre = { x, y, alturaPx, acao }; if (this.voando) this.egon.setAcao(acao); }
  acao(nome) { this.acaoBase = nome; if (!this.temp && !this.voando && !this.andando) this.egon.setAcao(nome); }
  acaoVoo() { return this.livre?.acao || 'voar'; }
  expressao(nome) { this.exprBase = nome; if (!this.tempExpr) this.egon.setExpressao(nome); }
  acaoTemp(nome, ms = 1600) {
    clearTimeout(this.temp); this.egon.setAcao(nome);
    this.temp = setTimeout(() => { this.temp = null; this.egon.setAcao(this.voando ? this.acaoVoo() : this.andando ? 'andar' : this.acaoBase); }, ms);
  }
  expressaoTemp(nome, ms = 1600) {
    clearTimeout(this.tempExpr); this.egon.setExpressao(nome);
    this.tempExpr = setTimeout(() => { this.tempExpr = null; this.egon.setExpressao(this.exprBase); }, ms);
  }
  gesto(nome) { this.egon.gesto(nome); }
  olharPara(x, y, ms = 1800) { this.olharTela = { x, y, ate: performance.now() + ms }; }
  apontarPara(x, y, ms = 2200) {
    const ombro = this.mundoParaTela(new Vector3(this.pos.x, this.pos.y + 1.45 * this.escala, 0));
    const dx = x - ombro.x; const dy = y - ombro.y;
    this.egon.anguloApontar = Math.atan2(dx, dy); // ângulo a partir do braço caído
    this.olharPara(x, y, ms); this.acaoTemp('apontar', ms);
  }
  caneca(sim, nivel) { this.egon.segurarCaneca(sim, nivel); }
  nivelCaneca(n) { this.egon.nivelCaneca(n); }
  ouro(ligado) { this.modoOuroAlvo = ligado ? 1 : 0; }

  falar(texto, ms = 2800) {
    clearTimeout(this.tFala); clearInterval(this.tDigita);
    const b = this.balao; const s = this.balaoTexto;
    b.classList.remove('mostra'); void b.offsetWidth; b.classList.add('mostra');
    // efeito de digitação
    const letras = [...texto]; let i = 0; s.textContent = '';
    s.style.minWidth = ''; b.style.setProperty('--largura', `${Math.min(30, letras.length + 1)}ch`);
    this.tDigita = setInterval(() => { i += 2; s.textContent = letras.slice(0, i).join(''); if (i >= letras.length) clearInterval(this.tDigita); }, 28);
    if (ms > 0) this.tFala = setTimeout(() => this.calar(), ms);
  }
  calar() { clearInterval(this.tDigita); this.balao.classList.remove('mostra'); }

  // ---------- toque ----------
  acertou(x, y) {
    const v = new Vector2((x / this.w) * 2 - 1, -(y / this.h) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    return this.ray.intersectObject(this.egon.alvoToque, false).length > 0;
  }
  ligarToque() {
    const interativo = (el) => el.closest('button, input, label, a, select, textarea, .modal-caixa, .status-caixa');
    document.addEventListener('pointermove', (e) => {
      this.ponteiro = { x: e.clientX, y: e.clientY }; this.ultimoPonteiro = performance.now();
      if (this.arrasto && e.pointerId === this.arrasto.id) {
        const a = this.arrasto; const dist = Math.hypot(e.clientX - a.x0, e.clientY - a.y0);
        if (!a.movendo && dist > 14) { a.movendo = true; this.comecarArrasto(); }
        if (a.movendo) { a.x = e.clientX; a.y = e.clientY; }
      }
    }, { passive: true });
    document.addEventListener('pointerdown', (e) => {
      this.ponteiro = { x: e.clientX, y: e.clientY }; this.ultimoPonteiro = performance.now();
      if (interativo(e.target) || !this.acertou(e.clientX, e.clientY) || this.bloqueado) return;
      e.stopPropagation(); e.preventDefault();
      this.toqueEgon = performance.now();
      this.arrasto = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), movendo: false };
      this.tLongo = setTimeout(() => { if (this.arrasto && !this.arrasto.movendo) { this.arrasto.longo = true; this.aoAbraco?.(); } }, 650);
    }, true);
    const soltar = (e) => {
      const a = this.arrasto; if (!a || e.pointerId !== a.id) return;
      clearTimeout(this.tLongo); this.arrasto = null; this.toqueEgon = performance.now();
      if (a.movendo) this.soltarArrasto(); else if (!a.longo) this.tocado(e.clientX, e.clientY); else this.fimAbraco?.();
    };
    document.addEventListener('pointerup', soltar, true);
    document.addEventListener('pointercancel', soltar, true);
  }
  // true se o último toque foi no EGon (para a tela não tratar como "toque para jogar")
  tocouEgonAgora() { return performance.now() - (this.toqueEgon || 0) < 450 || !!this.arrasto; }

  tocado(x, y) {
    const agora = performance.now();
    this.combo = agora - this.ultimoToque < 900 ? this.combo + 1 : 1; this.ultimoToque = agora;
    this.aoTocar?.(this.combo, x, y);
  }
  comecarArrasto() { this.arrastando = true; this.aoArrastar?.(); }
  soltarArrasto() { this.arrastando = false; this.aoSoltar?.(); }

  // ---------- quadro ----------
  calcAlvo(instantaneo) {
    let px; let py; let alt;
    if (this.arrasto?.movendo) {
      px = this.arrasto.x; alt = this.alturaAtualPx || 300; py = this.arrasto.y + alt * 0.55;
    } else if (this.livre) {
      ({ x: px, y: py, alturaPx: alt } = this.livre);
    } else if (this.ancora) {
      const r = this.ancora.getBoundingClientRect();
      if (!r.width && !r.height) return;
      px = r.left + r.width / 2 + (this.deslocPx || 0); py = r.bottom; alt = r.height;
    } else return;
    this.alturaAtualPx = alt;
    const alvo = this.telaParaMundo(px, py);
    const escala = alt / (ALTURA_EGON * this.pxPorUnidade);
    this.alvo = { pos: alvo, escala };
    if (instantaneo) { this.pos.copy(alvo); this.escala = escala; this.vel = {}; }
  }

  quadro(dt) {
    this.t += dt;
    const eg = this.egon;
    this.calcAlvo(false);
    if (this.alvo) {
      const a = this.alvo; const antes = this.pos.clone();
      const dist = antes.distanceTo(a.pos);
      const arrastando = this.arrasto?.movendo;
      const limiar = 0.9 * this.escala;
      // distâncias curtas no chão: ele caminha
      const dy = Math.abs(a.pos.y - this.pos.y);
      if (!this.voando && !this.andando && !arrastando && !this.livre && dist > limiar * 0.3 && dist < 2.4 * this.escala && dy < 0.3 * this.escala) { this.andando = true; eg.setAcao('andar'); }
      if (this.andando && (dist > 2.8 * this.escala || arrastando)) this.andando = false;
      if (this.andando && dist < 0.03 * this.escala) { this.andando = false; eg.setAcao(this.temp ? eg.acao : this.acaoBase); }
      const tempo = arrastando ? 0.08 : this.voando ? 0.42 : this.andando ? 0.5 : 0.28;
      const vmax = arrastando ? 200 : this.andando ? 1.5 * this.escala : 24;
      this.pos.x = amortecer(this.pos.x, a.pos.x, this.vel, 'x', tempo, dt, vmax);
      this.pos.y = amortecer(this.pos.y, a.pos.y, this.vel, 'y', tempo, dt, vmax);
      this.escala = amortecer(this.escala, a.escala, this.vel, 's', 0.35, dt);
      // voo automático quando a distância é grande
      if (!this.voando && !this.andando && dist > limiar * 1.6 && !arrastando) { this.voando = true; clearTimeout(this.temp); this.temp = null; eg.setAcao(this.acaoVoo()); }
      if (this.livre && !this.voando && !arrastando) { this.voando = true; eg.setAcao(this.livre.acao); }
      if (this.voando && !this.livre && dist < limiar * 0.25 && Math.hypot(this.vel.x || 0, this.vel.y || 0) < 1.2) {
        this.voando = false; eg.setAcao(this.temp ? eg.acao : this.acaoBase); eg.gesto('aterrissa'); this.aoPousar?.();
      }
      const vx = this.vel.x || 0; const vy = this.vel.y || 0;
      eg.inclVooZ = clamp(-vx * 0.035, -0.45, 0.45);
      eg.inclVooX = clamp(Math.abs(vx) * 0.02 - vy * 0.01, -0.2, 0.35);
      const viraAlvo = (this.voando || arrastando) ? clamp(vx * 0.06, -0.9, 0.9) : this.andando && Math.abs(vx) > 0.05 ? Math.sign(vx) * 0.8 : 0;
      eg.raiz.rotation.y += (viraAlvo - eg.raiz.rotation.y) * (1 - Math.exp(-5 * dt));
    }
    eg.raiz.position.copy(this.pos); eg.raiz.scale.setScalar(this.escala);
    this.gestosEspontaneos(dt);

    // para onde olhar: dedo recente > ponto pedido pela tela > pessoa em frente
    const agora = performance.now();
    let alvoTela = null;
    if (this.olharTela && agora < this.olharTela.ate) alvoTela = this.olharTela;
    else if (this.ponteiro && agora - this.ultimoPonteiro < 2500) alvoTela = this.ponteiro;
    if (alvoTela) {
      const w = this.telaParaMundo(alvoTela.x, alvoTela.y); w.z = 9; eg.olharAlvo.lerp(w, 1 - Math.exp(-8 * dt));
    } else {
      const passeio = new Vector3(this.pos.x + Math.sin(this.t * 0.4) * 3, this.pos.y + 1.6 * this.escala + Math.sin(this.t * 0.27) * 1.2, 12);
      eg.olharAlvo.lerp(passeio, 1 - Math.exp(-2 * dt));
    }

    eg.atualizar(dt, this.camera);

    // sombra e anel no chão (somem quando ele sobe)
    const alturaPes = Math.max(0, eg.corpo.position.y) * this.escala;
    const noChao = this.voando || this.livre || this.arrasto?.movendo ? 0 : 1;
    this.chaoAlpha = (this.chaoAlpha ?? 0) + (noChao - (this.chaoAlpha ?? 0)) * (1 - Math.exp(-6 * dt));
    const fade = clamp(1 - alturaPes / (0.9 * this.escala), 0, 1) * this.chaoAlpha;
    this.sombra.position.set(this.pos.x, this.pos.y + 0.01, 0.2 * this.escala);
    this.sombra.scale.set(1.5 * this.escala * (0.6 + 0.4 * fade), 0.9 * this.escala * (0.6 + 0.4 * fade), 1);
    this.sombra.material.opacity = 0.85 * fade;
    this.anel.position.set(this.pos.x, this.pos.y, 0);
    this.anel.scale.setScalar(1.75 * this.escala * (1 + Math.sin(this.t * 2) * 0.03));
    this.anel.rotation.z = this.t * 0.4;
    this.anel.material.opacity = (this.opcAncora.semAnel ? 0 : 0.95) * this.chaoAlpha;

    // luz do peito acompanha
    eg.emblema.getWorldPosition(this.luzPeito.position); this.luzPeito.position.z += 0.5 * this.escala;
    this.luzPeito.distance = 3 * this.escala;

    // modo dourado (fase do chopp)
    this.modoOuro = this.modoOuro + ((this.modoOuroAlvo || 0) - this.modoOuro) * (1 - Math.exp(-3 * dt));
    this.contraA.color.copy(new Color(0x3D8BFF).lerp(new Color(0xFFB627), this.modoOuro));
    this.contraB.color.copy(new Color(0x38D5FF).lerp(new Color(0xFFD86B), this.modoOuro));

    this.posicionarBalao();
    this.renderer.render(this.cena, this.camera);
  }

  // Pequenas ações sozinho para ele nunca ficar parado.
  gestosEspontaneos(dt) {
    if (!this.fidgets?.length) return;
    const livre = !this.temp && !this.tempExpr && !this.voando && !this.andando && !this.arrasto && this.acaoBase === 'idle'
      && performance.now() - (this.ultimoToque || 0) > 3500 && !this.balao.classList.contains('mostra');
    if (!livre) { this.proxFidget = Math.max(this.proxFidget, 1.5); return; }
    this.proxFidget -= dt; if (this.proxFidget > 0) return;
    this.proxFidget = 4.5 + Math.random() * 4;
    const g = this.fidgets[(Math.random() * this.fidgets.length) | 0];
    const w = this.w; const h = this.h;
    if (g === 'olhar') { this.expressaoTemp('curioso', 2200); this.olharPara(w * 0.08, h * 0.35, 1000); setTimeout(() => this.olharPara(w * 0.95, h * 0.3, 1100), 1000); }
    if (g === 'alongar') { this.acaoTemp('alongar', 1800); this.expressaoTemp('feliz', 1800); }
    if (g === 'pulinho') { this.gesto('pulo'); this.expressaoTemp('risada', 800); }
    if (g === 'acenar') { this.acaoTemp('acenar', 1500); this.expressaoTemp('piscar', 1500); }
    if (g === 'passear') { const u = this.alturaAtualPx / 48; const lado = (this.deslocPx || 0) === 0 ? (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 5) * u : 0; this.passear(lado); }
    if (g === 'coracao') { this.expressaoTemp('coracao', 1500); this.gesto('cocega'); }
  }

  posicionarBalao() {
    const b = this.balao; if (!b.classList.contains('mostra')) return;
    const cabeca = new Vector3(); this.egon.cabeca.getWorldPosition(cabeca);
    const p = this.mundoParaTela(cabeca);
    const raioPx = 0.55 * this.escala * this.pxPorUnidade;
    const lado = this.opcAncora.balao || (p.x > this.w * 0.55 ? 'esq' : 'dir');
    const bw = b.offsetWidth; const bh = b.offsetHeight;
    let x; let y;
    if (lado === 'cima') { x = p.x - bw / 2; y = p.y - raioPx * 1.05 - bh - 14; } else if (lado === 'esq') { x = p.x - raioPx - bw - 10; y = p.y - raioPx * 1.1 - bh * 0.35; } else { x = p.x + raioPx + 10; y = p.y - raioPx * 1.1 - bh * 0.35; }
    x = clamp(x, 16, this.w - bw - 16); y = clamp(y, 12, this.h - bh - 12);
    b.dataset.lado = lado;
    b.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  }
}
