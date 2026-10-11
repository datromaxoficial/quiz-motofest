import {
  modoDemo, observarConfig, observarStats, salvarLead, jaJogou, uid,
  pendentes, reenviarPendentes, leadsLocais,
} from './data.js';

const $ = (s) => document.querySelector(s);
const EGON = (n) => `assets/egon/${n}.webp`;
const LETRAS = 'ABCD';
const INATIVIDADE_MS = 60000;
const VOLTA_RESULTADO_S = 20;

let config = null;
let stats = { chopps: 0 };
let jogador = null;
let respostas = [];
let atual = 0;
let travado = false;

// ---------- telas ----------
let telaAtual = 'descanso';
function mostrar(nome) {
  if (config?.pausado && nome !== 'pausa') nome = 'pausa';
  document.querySelectorAll('.tela').forEach((t) => t.classList.toggle('ativa', t.id === `tela-${nome}`));
  telaAtual = nome;
  if (nome === 'descanso') iniciarDescanso(); else pararDescanso();
  armarInatividade();
}

function trocarPose(el, pose, efeito) {
  const img = el.querySelector('img');
  const src = EGON(pose);
  if (efeito) { el.classList.remove('pula', 'treme'); void el.offsetWidth; el.classList.add(efeito); }
  if (img.getAttribute('src') === src) return;
  img.classList.add('troca');
  setTimeout(() => { img.src = src; img.classList.remove('troca'); }, 180);
}

// ---------- tela de descanso (quiosque) ----------
const CENAS = [
  { frase: 'Acerte e ganhe um <span class="ouro">chopp gelado</span>', sub: '5 perguntas rápidas. As 3 últimas valem chopp!', pose: 'xau', balao: 'Bora testar seus conhecimentos?', x: 0 },
  { frase: 'No trânsito e na vida, <span class="ouro">cuidar é proteger</span>', sub: 'Teste o que você sabe sobre segurança no trânsito.', pose: 'apontando', balao: 'Toca aqui na tela!', x: -6 },
  { frase: 'Você sabe <span class="ouro">pilotar seguro?</span>', sub: 'Responda o quiz do EGon e descubra.', pose: 'pensando', balao: 'Hmm... será que você acerta tudo?', x: 4 },
  { frase: 'Pode ir, <span class="ouro">estaremos lá!</span>', sub: 'Exclusive Gold. Proteção veicular de verdade.', pose: 'super', balao: 'Exclusive Gold sempre com você!', x: -3 },
  { frase: '3 acertos finais = <span class="ouro">1 chopp</span>', sub: 'É rapidinho. Toque na tela para começar.', pose: 'like', balao: 'Topa o desafio?', x: 2 },
];
let cenaIdx = 0;
let cenaTimer = null;

function aplicarCena(c) {
  const h = $('#frase-descanso');
  h.innerHTML = c.frase; h.classList.remove('entra'); void h.offsetWidth; h.classList.add('entra');
  $('#sub-descanso').textContent = c.sub;
  const b = $('#balao-descanso');
  b.textContent = c.balao; b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  const eg = $('#egon-descanso');
  eg.style.transform = `translateX(${c.x}vw)`;
  trocarPose(eg, c.pose, 'pula');
}
function iniciarDescanso() {
  pararDescanso();
  cenaIdx = 0; aplicarCena(CENAS[0]);
  cenaTimer = setInterval(() => { cenaIdx = (cenaIdx + 1) % CENAS.length; aplicarCena(CENAS[cenaIdx]); }, 6500);
}
function pararDescanso() { clearInterval(cenaTimer); cenaTimer = null; }

$('#tela-descanso').addEventListener('click', () => {
  entrarTelaCheia();
  novoJogo();
});

// ---------- tela cheia e tela sempre ligada ----------
let wakeLock = null;
async function entrarTelaCheia() {
  const el = document.documentElement;
  try {
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen && !document.webkitFullscreenElement) el.webkitRequestFullscreen();
  } catch { /* navegador recusou; segue normal */ }
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* sem suporte */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && document.fullscreenElement) entrarTelaCheia(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ---------- cadastro ----------
const fNome = $('#f-nome'); const fWhats = $('#f-whats'); const fPlaca = $('#f-placa'); const fAssoc = $('#f-assoc');
let associado = null;

function novoJogo() {
  jogador = null; respostas = []; atual = 0; associado = null;
  $('#form').reset(); $('#f-lgpd').checked = true;
  fAssoc.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', 'false'));
  document.querySelectorAll('.invalido').forEach((e) => e.classList.remove('invalido'));
  $('#form-erro').textContent = '';
  mostrar('cadastro');
}

const soDigitos = (v) => v.replace(/\D/g, '');
function mascaraWhats(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
fWhats.addEventListener('input', () => { fWhats.value = mascaraWhats(fWhats.value); fWhats.classList.remove('invalido'); });
fPlaca.addEventListener('input', () => { fPlaca.value = fPlaca.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); fPlaca.classList.remove('invalido'); });
fNome.addEventListener('input', () => fNome.classList.remove('invalido'));
$('#form').addEventListener('input', () => { $('#form-erro').textContent = ''; });
fNome.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fWhats.focus(); } });
fWhats.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fPlaca.focus(); } });
fPlaca.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fPlaca.blur(); } });
fAssoc.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  associado = b.dataset.v;
  $('#form-erro').textContent = '';
  fAssoc.classList.remove('invalido');
  fAssoc.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
});

const PLACA_OK = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = fNome.value.trim().replace(/\s+/g, ' ');
  const whats = soDigitos(fWhats.value);
  const placa = fPlaca.value.trim();
  const erros = [];
  if (nome.length < 3) { fNome.classList.add('invalido'); erros.push('nome'); }
  if (whats.length < 10 || whats.length > 11) { fWhats.classList.add('invalido'); erros.push('WhatsApp'); }
  if (!PLACA_OK.test(placa)) { fPlaca.classList.add('invalido'); erros.push('placa'); }
  if (!associado) { fAssoc.classList.add('invalido'); erros.push('associado'); }
  if (erros.length) { $('#form-erro').textContent = `Confira: ${erros.join(', ')}.`; return; }
  document.activeElement?.blur();
  jogador = { nome, whatsapp: whats, placa, associado: associado === 'sim', lgpd: $('#f-lgpd').checked, repetido: jaJogou(whats, placa) };
  if (jogador.repetido) {
    abrirModal(`Você já jogou, ${primeiroNome(nome)}!`, 'Pode jogar de novo. Boa sorte nessa rodada!', () => iniciarQuiz());
  } else iniciarQuiz();
});
const primeiroNome = (n) => n.split(' ')[0];

function abrirModal(titulo, texto, aoFechar) {
  $('#modal-titulo').textContent = titulo; $('#modal-texto').textContent = texto;
  const m = $('#modal'); m.hidden = false;
  $('#modal-ok').onclick = () => { m.hidden = true; aoFechar?.(); };
}

// ---------- quiz ----------
const perguntas = () => config.perguntas;

function iniciarQuiz() {
  respostas = []; atual = 0;
  const ol = $('#progresso'); ol.innerHTML = '';
  perguntas().forEach((p, i) => { const li = document.createElement('li'); li.textContent = i + 1; if (p.valeChopp) li.classList.add('chopp'); ol.appendChild(li); });
  mostrar('quiz');
  renderPergunta();
}

function renderPergunta() {
  const ps = perguntas(); const p = ps[atual];
  travado = false;
  $('#progresso').querySelectorAll('li').forEach((li, i) => li.classList.toggle('atual', i === atual));
  $('#q-num').textContent = `Pergunta ${atual + 1} de ${ps.length}`;
  $('#q-chopp').hidden = !p.valeChopp;
  const t = $('#q-texto'); t.textContent = p.texto; t.classList.remove('entra'); void t.offsetWidth; t.classList.add('entra');
  $('#q-feedback').textContent = ''; $('#q-feedback').className = 'feedback';
  const box = $('#q-opcoes'); box.innerHTML = '';
  p.opcoes.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opcao'; b.type = 'button';
    b.innerHTML = `<span class="letra">${LETRAS[i]}</span><span></span>`;
    b.lastChild.textContent = o;
    b.addEventListener('click', () => responder(i));
    box.appendChild(b);
  });
  $('#balao-quiz').textContent = p.valeChopp ? 'Essa vale chopp! 🍺' : ['Pensa bem...', 'Essa é fácil!', 'Confio em você!'][atual % 3];
  trocarPose($('#egon-quiz'), p.valeChopp ? 'encantamento' : 'pensando');
}

function responder(i) {
  if (travado) return; travado = true;
  armarInatividade();
  const p = perguntas()[atual];
  const ok = i === p.correta;
  respostas.push({ pergunta: atual + 1, texto: p.texto, resposta: p.opcoes[i], escolha: i, correta: p.correta, acertou: ok, valeChopp: !!p.valeChopp });
  const bts = $('#q-opcoes').querySelectorAll('.opcao');
  bts.forEach((b, k) => {
    if (k === p.correta) b.classList.add('certo');
    else if (k === i) b.classList.add('errado');
    else b.classList.add('apagada');
  });
  $('#progresso').children[atual].classList.add(ok ? 'certo' : 'errado');
  const fb = $('#q-feedback');
  if (ok) {
    fb.textContent = ['Isso aí! ✓', 'Mandou bem! ✓', 'Acertou! ✓'][atual % 3]; fb.className = 'feedback ok';
    $('#balao-quiz').textContent = 'Boa! 🎉';
    trocarPose($('#egon-quiz'), 'comemorando', 'pula');
  } else {
    fb.textContent = `Quase! A certa é a ${LETRAS[p.correta]}.`; fb.className = 'feedback nao';
    $('#balao-quiz').textContent = 'Ops! Essa não...';
    trocarPose($('#egon-quiz'), 'duvida', 'treme');
  }
  setTimeout(proxima, ok ? 1700 : 2600);
}

function proxima() {
  const ps = perguntas();
  atual += 1;
  if (atual >= ps.length) return finalizar();
  // Interlúdio quando entra a primeira pergunta que vale chopp.
  if (ps[atual].valeChopp && !ps[atual - 1].valeChopp) {
    const qtd = ps.filter((p) => p.valeChopp).length;
    $('#aviso-chopp small').textContent = `Acerte as próximas ${qtd} perguntas`;
    const a = $('#aviso-chopp'); a.classList.add('mostra');
    setTimeout(() => { a.classList.remove('mostra'); renderPergunta(); }, 2200);
  } else renderPergunta();
}

// ---------- resultado ----------
let contagemTimer = null;
function finalizar() {
  const total = respostas.length;
  const acertos = respostas.filter((r) => r.acertou).length;
  const valendo = respostas.filter((r) => r.valeChopp);
  const acertouChopp = valendo.length > 0 && valendo.every((r) => r.acertou);
  const limite = Number(config.limiteChopps) || 0;
  const esgotado = limite > 0 && stats.chopps >= limite;
  const ganhou = acertouChopp && !esgotado;

  const lead = {
    id: uid(),
    ...jogador,
    respostas,
    acertos,
    total,
    acertosChopp: valendo.filter((r) => r.acertou).length,
    ganhouChopp: ganhou,
    choppEsgotado: acertouChopp && esgotado,
    clientTime: Date.now(),
    device: deviceId(),
  };
  salvarLead(lead);
  if (ganhou) stats.chopps += 1; // otimista, o snapshot corrige

  $('#r-acertos').textContent = acertos; $('#r-total').textContent = total;
  const nome = primeiroNome(jogador.nome);
  $('#r-premio').hidden = !ganhou;
  if (ganhou) {
    $('#r-titulo').textContent = `Parabéns, ${nome}!`;
    $('#r-msg').textContent = 'Você acertou as perguntas que valiam chopp.';
    trocarPose($('#egon-res'), 'comemorando', 'pula');
    confete(true);
  } else if (acertouChopp && esgotado) {
    $('#r-titulo').textContent = `Mandou bem, ${nome}!`;
    $('#r-msg').textContent = 'Você acertou tudo, mas os chopps desta ação já acabaram. Nossa equipe vai falar com você!';
    trocarPose($('#egon-res'), 'like', 'pula');
    confete(false);
  } else {
    $('#r-titulo').textContent = acertos >= total - 1 ? `Foi por pouco, ${nome}!` : `Valeu, ${nome}!`;
    $('#r-msg').textContent = 'Não foi dessa vez, mas obrigado por jogar! Nossa equipe vai falar com você pelo WhatsApp.';
    trocarPose($('#egon-res'), 'xau_animado', 'pula');
  }
  mostrar('resultado');
  let s = VOLTA_RESULTADO_S;
  $('#r-contagem').textContent = s;
  clearInterval(contagemTimer);
  contagemTimer = setInterval(() => { s -= 1; $('#r-contagem').textContent = s; if (s <= 0) voltarInicio(); }, 1000);
}

function voltarInicio() {
  clearInterval(contagemTimer); pararConfete();
  $('#modal').hidden = true;
  document.activeElement?.blur();
  mostrar('descanso');
}
document.querySelectorAll('[data-acao="inicio"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); voltarInicio(); }));

function deviceId() {
  try {
    let d = localStorage.getItem('eg_device');
    if (!d) { d = `totem-${Math.random().toString(36).slice(2, 7)}`; localStorage.setItem('eg_device', d); }
    return d;
  } catch { return 'totem'; }
}

// ---------- inatividade ----------
let inatTimer = null;
function armarInatividade() {
  clearTimeout(inatTimer);
  if (telaAtual === 'cadastro' || telaAtual === 'quiz') inatTimer = setTimeout(voltarInicio, INATIVIDADE_MS);
}
['pointerdown', 'keydown', 'input'].forEach((ev) => document.addEventListener(ev, armarInatividade, { passive: true }));

// ---------- confete ----------
let confeteRaf = null;
function confete(chuva) {
  const cv = $('#confete'); const ctx = cv.getContext('2d');
  cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio;
  const cores = ['#FFC531', '#FF9F1C', '#1164FF', '#38D5FF', '#FFFFFF', '#2BD67B'];
  const n = chuva ? 220 : 90;
  const ps = Array.from({ length: n }, () => ({
    x: Math.random() * cv.width, y: -Math.random() * cv.height * (chuva ? 1 : .4),
    w: (6 + Math.random() * 8) * devicePixelRatio, h: (10 + Math.random() * 10) * devicePixelRatio,
    vy: (2 + Math.random() * 4) * devicePixelRatio, vx: (Math.random() - .5) * 2 * devicePixelRatio,
    r: Math.random() * 6, vr: (Math.random() - .5) * .2, c: cores[(Math.random() * cores.length) | 0],
  }));
  const t0 = performance.now();
  pararConfete();
  const passo = (t) => {
    ctx.clearRect(0, 0, cv.width, cv.height);
    let vivos = 0;
    for (const p of ps) {
      p.y += p.vy; p.x += p.vx + Math.sin((t + p.r * 100) / 400) * devicePixelRatio; p.r += p.vr;
      if (p.y < cv.height + 20) vivos++;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    }
    if (vivos && t - t0 < 9000) confeteRaf = requestAnimationFrame(passo); else ctx.clearRect(0, 0, cv.width, cv.height);
  };
  confeteRaf = requestAnimationFrame(passo);
}
function pararConfete() { cancelAnimationFrame(confeteRaf); const cv = $('#confete'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }

// ---------- status escondido: 5 toques no logo ----------
let toques = 0; let toqueTimer = null;
document.querySelectorAll('.logo-topo, .logo-barra, .logo-pausa').forEach((l) => l.addEventListener('click', (e) => {
  e.stopPropagation();
  toques += 1; clearTimeout(toqueTimer); toqueTimer = setTimeout(() => { toques = 0; }, 1500);
  if (toques >= 5) { toques = 0; abrirStatus(); }
}));
function abrirStatus() {
  const pend = pendentes();
  const itens = [
    ['Modo', modoDemo ? 'Demonstração (só neste tablet)' : 'Online + offline (Firebase)'],
    ['Internet', navigator.onLine ? 'Conectado' : 'Sem conexão'],
    ['Participações neste tablet', leadsLocais().length],
    ['Aguardando envio', modoDemo ? '-' : pend],
    ['Chopps entregues', `${stats.chopps}${Number(config.limiteChopps) ? ` de ${config.limiteChopps}` : ''}`],
    ['Quiz', config.pausado ? 'Pausado' : 'Ativo'],
  ];
  $('#status-lista').innerHTML = itens.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('#status').hidden = false;
}
$('#st-fechar').onclick = () => { $('#status').hidden = true; };
$('#st-reload').onclick = () => location.reload();
$('#st-sync').onclick = () => { reenviarPendentes(); setTimeout(abrirStatus, 1500); };
$('#st-sair').onclick = () => { document.exitFullscreen?.().catch(() => {}); $('#status').hidden = true; };

// ---------- início ----------
observarStats((s) => { stats = s; });
observarConfig((c) => {
  const primeira = !config;
  config = c;
  if (c.pausado) mostrar('pausa');
  else if (telaAtual === 'pausa' || primeira) mostrar('descanso');
});
window.addEventListener('online', reenviarPendentes);
setTimeout(reenviarPendentes, 5000);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
