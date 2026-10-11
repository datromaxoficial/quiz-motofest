import {
  modoDemo, observarConfig, observarStats, salvarLead, jaJogou, uid,
  pendentes, reenviarPendentes, leadsLocais,
} from './data.js';
import { Palco } from './palco.js';
import { Fundo, Efeitos } from './fx.js';
import { tocar, destravarAudio, alternarSom, somLigado, somDoEvento } from './som.js';

const $ = (s) => document.querySelector(s);
const LETRAS = 'ABCD';
const INATIVIDADE_MS = 60000;
const VOLTA_RESULTADO_S = 20;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sorteio = (arr) => arr[(Math.random() * arr.length) | 0];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let config = null;
let stats = { chopps: 0 };
let jogador = null;
let respostas = [];
let atual = 0;
let travado = false;

// ---------- unidades estáveis (o teclado virtual não encolhe o layout) ----------
const base = { w: innerWidth, h: innerHeight };
function medidas() {
  if (Math.abs(innerWidth - base.w) > 2) { base.w = innerWidth; base.h = innerHeight; } else if (innerHeight > base.h) base.h = innerHeight;
  const u = Math.min(base.w / 128, base.h / 80);
  const r = document.documentElement.style;
  r.setProperty('--u', `${u}px`);
  r.setProperty('--ox', `${(base.w - u * 128) / 2}px`);
  r.setProperty('--oy', `${(base.h - u * 80) / 2}px`);
}
medidas();
addEventListener('resize', medidas);

// ---------- camadas ----------
const palco = new Palco($('#palco'), $('#balao'));
const fundo = new Fundo($('#fx-fundo'));
const fx = new Efeitos($('#fx'));
window.__egon = palco; // ajuda na manutenção pelo console

// ---------- texto animado palavra por palavra ----------
function palavras(el, html, inicio = 0, passo = 60) {
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  const out = []; let i = 0;
  const andar = (no, ouro) => no.childNodes.forEach((n) => {
    if (n.nodeType === 3) n.textContent.split(/\s+/).filter(Boolean).forEach((w) => out.push(`<span class="w${ouro ? ' ouro' : ''}"><i style="--d:${inicio + (i++) * passo}ms">${esc(w)}</i></span>`));
    else andar(n, ouro || n.classList?.contains('ouro'));
  });
  andar(tmp, false);
  el.innerHTML = out.join(' ');
  return i;
}

// ---------- telas ----------
let telaAtual = 'descanso';
const ESPONTANEO = {
  descanso: ['olhar', 'alongar', 'pulinho', 'acenar', 'passear', 'passear', 'coracao'],
  cadastro: ['olhar', 'alongar'],
};
const ANCORAS = { descanso: '#ancora-descanso', cadastro: '#ancora-cadastro', quiz: '#ancora-quiz', resultado: '#ancora-resultado', pausa: '#ancora-pausa' };
function mostrar(nome) {
  if (config?.pausado && nome !== 'pausa') nome = 'pausa';
  const antes = document.querySelector('.tela.ativa');
  const nova = $(`#tela-${nome}`);
  if (antes !== nova) {
    if (antes) { antes.classList.remove('ativa'); antes.classList.add('saindo'); setTimeout(() => antes.classList.remove('saindo'), 450); }
    nova.classList.add('ativa');
    $('#cortina').classList.remove('passa'); void $('#cortina').offsetWidth; $('#cortina').classList.add('passa');
    fundo.pulsoWarp(700); tocar('whoosh');
  }
  telaAtual = nome;
  palco.calar();
  palco.irPara($(ANCORAS[nome]), { semAnel: nome === 'quiz' || nome === 'cadastro', balao: nome === 'descanso' ? undefined : 'cima' });
  if (nome === 'descanso') iniciarDescanso(); else pararDescanso();
  if (nome === 'pausa') iniciarSono(); else pararSono();
  palco.espontaneo(ESPONTANEO[nome] || null);
  armarInatividade();
}

// ---------- personalidade do EGon (toque, cócegas, arrasto, abraço) ----------
const REACOES = [
  () => { palco.gesto('pulo'); palco.expressaoTemp('risada', 1400); palco.falar(sorteio(['Hihi! Cócegas!', 'Ei, isso faz cócegas!', 'Hahaha!']), 1600); tocar('cocega'); },
  () => { palco.acaoTemp('acenar', 1600); palco.expressaoTemp('piscar', 1600); palco.falar(sorteio(['Oi, oi! 👋', 'E aí, tudo certo?', 'Opa! Bem-vindo!']), 1700); tocar('pulo'); },
  () => { palco.gesto('susto'); palco.expressaoTemp('surpreso', 1100); palco.falar('Opa! Que susto!', 1400); tocar('boing'); },
  () => { palco.expressaoTemp('coracao', 1800); palco.acaoTemp('abraco', 1500); palco.falar('Gostei de você! 💙', 1800); tocar('escolha'); },
];
palco.aoTocar = (combo, x, y) => {
  fx.explosao(x, y, { n: 14, forca: 0.6, cores: ['#FFFFFF', '#6FE3FF', '#FFE27A'] });
  armarInatividade();
  if (telaAtual === 'quiz' && !travado && combo === 1 && Math.random() < 0.5) {
    palco.gesto('pulo'); palco.expressaoTemp('piscar', 1200); palco.falar(sorteio(['Psiu! Foca na pergunta 😜', 'Eu sei a resposta... mas não conto!', 'Sem cola, hein! 😄']), 1900); tocar('cocega'); return;
  }
  if (combo >= 8) { palco.acaoTemp('dancar', 3000); palco.expressaoTemp('estrela', 3000); palco.falar('Tá bom, vou dançar! 🕺', 2600); tocar('vitoria'); return; }
  if (combo >= 5) { palco.acaoTemp('tonto', 2600); palco.expressaoTemp('tonto', 2600); palco.falar('Calma! Tô ficando tonto...', 2400); tocar('tonto'); return; }
  if (combo === 3) { palco.gesto('giro'); palco.expressaoTemp('estrela', 1300); palco.falar('Uhuuul!', 1300); tocar('whoosh'); return; }
  if (combo > 1) { palco.gesto('pulo'); palco.expressaoTemp('risada', 900); tocar('cocega'); return; }
  sorteio(REACOES)();
};
palco.aoArrastar = () => { palco.acaoTemp('arrastado', 600000); palco.expressaoTemp('risada', 600000); palco.falar('Uhuuul, tô voando!', 1600); tocar('whoosh'); armarInatividade(); };
palco.aoSoltar = () => {
  palco.acaoTemp('voar', 50); palco.expressaoTemp('feliz', 1500); tocar('pulo');
  palco.aoPousar = () => { palco.aoPousar = null; palco.falar(sorteio(['Voltei! 😄', 'Pousei certinho!', 'De novo, de novo!']), 1500); };
};
palco.aoAbraco = () => { palco.acaoTemp('abraco', 600000); palco.expressaoTemp('coracao', 600000); palco.falar('Awn, um abraço! 💙', 1800); const p = palco.mundoParaTela(palco.egon.cabeca.getWorldPosition(palco.egon.olharAlvo.clone())); fx.coracoes(p.x, p.y, 10); tocar('escolha'); };
palco.fimAbraco = () => { palco.acaoTemp('idle', 10); palco.expressaoTemp('feliz', 1200); };

// onda de luz em qualquer toque + libera o som
document.addEventListener('pointerdown', (e) => {
  destravarAudio();
  if (!palco.tocouEgonAgora()) fx.onda(e.clientX, e.clientY);
}, { passive: true });

// ---------- tela de descanso ----------
const CENAS = [
  { frase: 'Acerte e ganhe um <span class="ouro">chopp gelado</span>', sub: '5 perguntas rápidas sobre trânsito. As 3 últimas valem chopp!',
    egon: () => { palco.acaoTemp('acenar', 2600); palco.expressaoTemp('piscar', 2600); palco.falar('Oi! Eu sou o EGon! 👋', 3000); } },
  { frase: 'No trânsito e na vida, <span class="ouro">cuidar é proteger</span>', sub: 'Teste o que você sabe e ainda leva um brinde.',
    egon: async () => { voo([[0.62, 0.3], [0.42, 0.18], [0.7, 0.12]], 'voar', 900); await espera(2800); apontarCTA('Toca aqui pra jogar!'); } },
  { frase: 'Você sabe <span class="ouro">pilotar seguro?</span>', sub: 'Responda o quiz do EGon e descubra agora.',
    egon: () => { palco.acaoTemp('pensar', 4200); palco.expressaoTemp('pensando', 4200); palco.falar('Hmm... será que você acerta tudo?', 3800); } },
  { frase: 'Pode ir, <span class="ouro">estaremos lá!</span>', sub: 'Exclusive Gold. Proteção veicular de verdade.',
    egon: async () => { voo([[0.95, 0.2], [0.4, 0.14], [0.75, 0.24]], 'super', 1000); await espera(3300); palco.acaoTemp('joinha', 2200); palco.expressaoTemp('piscar', 2200); palco.falar('Exclusive Gold sempre com você!', 2600); } },
  { frase: '3 acertos finais = <span class="ouro">1 chopp</span>', sub: 'É rapidinho. Toque na tela para começar.',
    egon: async () => { palco.caneca(true, 0); palco.acao('segurar'); palco.expressao('coracao'); await espera(400); palco.nivelCaneca(1); palco.falar('Chopp gelado te esperando! 🍺', 3200); await espera(3600); palco.acaoTemp('brinde', 1600); await espera(1700); palco.caneca(false); palco.acao('idle'); palco.expressao('normal'); } },
];
let cenaIdx = 0; let cenaTimer = null; let cenaToken = 0;

function voo(pontos, acao, passo) { // pontos em fração da tela; volta para a âncora no fim
  const token = cenaToken;
  const alt = $('#ancora-descanso').getBoundingClientRect().height * 0.62;
  pontos.forEach(([fx_, fy], i) => setTimeout(() => { if (token === cenaToken && telaAtual === 'descanso' && !palco.arrastando) palco.voarPara(innerWidth * fx_, innerHeight * fy + alt, alt, acao); }, i * passo));
  setTimeout(() => { if (token === cenaToken && telaAtual === 'descanso') palco.irPara($('#ancora-descanso')); }, pontos.length * passo);
}
function apontarCTA(fala) {
  const r = $('#cta').getBoundingClientRect();
  palco.apontarPara(r.left + r.width * 0.6, r.top + r.height / 2, 2400); palco.expressaoTemp('feliz', 2400); palco.falar(fala, 2600);
}

function aplicarCena(c, primeira) {
  const h = $('#frase-descanso');
  const entrar = () => { palavras(h, c.frase, 0, 70); h.classList.remove('sai'); h.classList.remove('entra'); void h.offsetWidth; h.classList.add('entra'); };
  if (primeira) entrar(); else { h.classList.remove('entra'); h.classList.add('sai'); setTimeout(entrar, 380); }
  const s = $('#sub-descanso'); s.classList.add('troca'); setTimeout(() => { s.textContent = c.sub; s.classList.remove('troca'); }, primeira ? 0 : 380);
  // se alguém está brincando com o EGon agora, ele não interrompe a brincadeira
  if (performance.now() - (palco.ultimoToque || 0) > 4000 && !palco.arrastando) c.egon();
}
function iniciarDescanso() {
  pararDescanso();
  cenaIdx = 0; palco.acao('idle'); palco.expressao('normal'); palco.caneca(false);
  setTimeout(() => { if (telaAtual === 'descanso') aplicarCena(CENAS[0], true); }, 500);
  cenaTimer = setInterval(() => { cenaToken += 1; cenaIdx = (cenaIdx + 1) % CENAS.length; palco.acao('idle'); palco.expressao('normal'); aplicarCena(CENAS[cenaIdx]); }, 8000);
}
function pararDescanso() { clearInterval(cenaTimer); cenaTimer = null; cenaToken += 1; }

$('#tela-descanso').addEventListener('click', () => {
  if (palco.tocouEgonAgora() || telaAtual !== 'descanso') return;
  entrarTelaCheia(); tocar('escolha');
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
const PLACA_OK = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
const soDigitos = (v) => v.replace(/\D/g, '');
const primeiroNome = (n) => n.trim().split(' ')[0];
const capitalizar = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
let associado = null;
const valido = { nome: false, whats: false, placa: false, assoc: false, lgpd: false };
const perguntou = {};

function novoJogo() {
  jogador = null; respostas = []; atual = 0; associado = null;
  $('#form').reset(); $('#f-lgpd').checked = false;
  fAssoc.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', 'false'));
  delete fAssoc.dataset.v;
  document.querySelectorAll('.invalido, .campo.ok').forEach((e) => e.classList.remove('invalido', 'ok'));
  Object.keys(valido).forEach((k) => { valido[k] = false; perguntou[k] = false; });
  atualizarMedidor();
  $('#form').style.transform = '';
  palco.acao('idle'); palco.expressao('normal'); palco.caneca(false);
  mostrar('cadastro');
  palco.aoPousar = () => { palco.aoPousar = null; if (telaAtual !== 'cadastro') return; palco.acaoTemp('acenar', 1800); palco.expressaoTemp('feliz', 1800); palco.falar('Antes, me conta quem é você!', 3200); };
}

function mascaraWhats(v) {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function marcar(campo, ok, el) {
  const antes = valido[campo]; valido[campo] = ok;
  el?.classList.toggle('ok', ok); el?.classList.remove('invalido');
  atualizarMedidor();
  if (ok && !antes) { tocar('escolha'); comemorarCampo(campo); }
}
function comemorarCampo(campo) {
  if (campo === 'nome') { clearTimeout(marcar.tNome); marcar.tNome = setTimeout(() => { if (!valido.nome) return; palco.gesto('pulo'); palco.expressaoTemp('feliz', 1800); palco.falar(`Prazer, ${capitalizar(primeiroNome(fNome.value))}! 😄`, 2200); }, 700); }
  if (campo === 'whats') { palco.acaoTemp('joinha', 1600); palco.expressaoTemp('piscar', 1600); palco.falar('Anotado! 📱', 1800); }
  if (campo === 'placa') { palco.gesto('pulo'); palco.expressaoTemp('estrela', 1500); palco.falar('Placa anotada! 🏍️', 1800); }
}
function atualizarMedidor() {
  const n = Object.values(valido).filter(Boolean).length;
  $('#medidor').querySelectorAll('i').forEach((i, k) => i.classList.toggle('on', k < n));
  const b = $('#btn-comecar');
  const total = Object.keys(valido).length;
  b.classList.toggle('falta', n < total); b.classList.toggle('pronto', n === total);
  $('#btn-comecar-txt').textContent = n === total ? 'Começar o quiz' : `Faltam ${total - n}`;
}

fNome.addEventListener('input', () => marcar('nome', fNome.value.trim().replace(/\s+/g, ' ').length >= 3, fNome.closest('.campo')));
fWhats.addEventListener('input', () => { fWhats.value = mascaraWhats(fWhats.value); const n = soDigitos(fWhats.value).length; marcar('whats', n >= 10 && n <= 11, fWhats.closest('.campo')); });
fPlaca.addEventListener('input', () => { fPlaca.value = fPlaca.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7); marcar('placa', PLACA_OK.test(fPlaca.value), fPlaca.closest('.campo')); });
$('#f-lgpd').addEventListener('change', (e) => {
  valido.lgpd = e.target.checked; atualizarMedidor(); $('.lgpd').classList.remove('invalido');
  if (e.target.checked) { tocar('escolha'); palco.acaoTemp('joinha', 1400); palco.expressaoTemp('feliz', 1400); palco.falar('Combinado! 🤝', 1600); }
});
fNome.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fWhats.focus(); } });
fWhats.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fPlaca.focus(); } });
fPlaca.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fPlaca.blur(); } });

const FALAS_CAMPO = { nome: 'Como você se chama?', whats: 'Qual é o seu WhatsApp?', placa: 'E a placa da sua moto ou carro?' };
[[fNome, 'nome'], [fWhats, 'whats'], [fPlaca, 'placa']].forEach(([inp, k]) => inp.addEventListener('focus', () => {
  const r = inp.getBoundingClientRect(); palco.olharPara(r.left + r.width / 2, r.top + r.height / 2, 4000);
  if (!perguntou[k] && !valido[k]) { perguntou[k] = true; palco.falar(FALAS_CAMPO[k], 2400); }
  setTimeout(ajustarTeclado, 350);
}));

fAssoc.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  associado = b.dataset.v; fAssoc.dataset.v = associado;
  fAssoc.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  $('.campo-assoc').classList.remove('invalido');
  const antes = valido.assoc; valido.assoc = true; atualizarMedidor(); if (!antes) tocar('escolha');
  if (associado === 'sim') { palco.expressaoTemp('coracao', 2000); palco.acaoTemp('abraco', 1400); palco.falar('Que bom ter você com a gente! 💙', 2200); const r = b.getBoundingClientRect(); fx.coracoes(r.left + r.width / 2, r.top, 6); }
  else { palco.expressaoTemp('piscar', 1800); palco.acaoTemp('joinha', 1600); palco.falar('Bora conhecer a Exclusive Gold! 😉', 2200); }
});

// Com o teclado aberto, sobe o cartão para o campo em foco ficar visível.
function ajustarTeclado() {
  const form = $('#form'); const el = document.activeElement;
  const vv = window.visualViewport; const alturaVisivel = vv ? vv.height : innerHeight;
  if (!el || el.tagName !== 'INPUT' || telaAtual !== 'cadastro') { form.style.transform = ''; return; }
  const atualDesloc = Number(form.dataset.desloc || 0);
  const r = el.getBoundingClientRect(); const fundoCampo = r.bottom + atualDesloc;
  const margem = 24; const desloc = Math.max(0, fundoCampo - (alturaVisivel - margem));
  form.dataset.desloc = desloc; form.style.transform = desloc ? `translateY(${-desloc}px)` : '';
}
window.visualViewport?.addEventListener('resize', ajustarTeclado);
document.addEventListener('focusout', () => setTimeout(ajustarTeclado, 120));

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = fNome.value.trim().replace(/\s+/g, ' ');
  const whats = soDigitos(fWhats.value);
  const placa = fPlaca.value.trim();
  const faltando = [];
  if (!valido.nome) faltando.push(['nome', fNome.closest('.campo'), 'seu nome']);
  if (!valido.whats) faltando.push(['whats', fWhats.closest('.campo'), 'o WhatsApp']);
  if (!valido.placa) faltando.push(['placa', fPlaca.closest('.campo'), 'a placa']);
  if (!valido.assoc) faltando.push(['assoc', $('.campo-assoc'), 'dizer se é associado']);
  if (!valido.lgpd) faltando.push(['lgpd', $('.lgpd'), 'autorizar o contato (LGPD)']);
  if (faltando.length) {
    faltando.forEach(([, el]) => { el.classList.remove('invalido'); void el.offsetWidth; el.classList.add('invalido'); });
    const [, el, rotulo] = faltando[0]; const r = el.getBoundingClientRect();
    palco.apontarPara(r.left + 40, r.top + r.height / 2, 2200); palco.expressaoTemp('surpreso', 2000);
    palco.falar(`Opa! Falta ${rotulo}.`, 2600); tocar('errado');
    return;
  }
  document.activeElement?.blur();
  jogador = { nome, whatsapp: whats, placa, associado: associado === 'sim', lgpd: $('#f-lgpd').checked, repetido: jaJogou(whats, placa) };
  palco.acaoTemp('comemorar', 1200); palco.expressaoTemp('estrela', 1200); palco.falar('Bora pro quiz! 🚀', 1400); tocar('certo');
  setTimeout(() => {
    if (jogador.repetido) {
      palco.expressaoTemp('surpreso', 1600); palco.falar('Você de novo? Que bom! 😄', 2200);
      abrirModal(`Você já jogou, ${capitalizar(primeiroNome(nome))}!`, 'Pode jogar de novo. Boa sorte nessa rodada!', () => iniciarQuiz());
    } else iniciarQuiz();
  }, 1100);
});

function abrirModal(titulo, texto, aoFechar) {
  $('#modal-titulo').textContent = titulo; $('#modal-texto').textContent = texto;
  const m = $('#modal'); m.hidden = false;
  $('#modal-ok').onclick = () => { m.hidden = true; tocar('escolha'); aoFechar?.(); };
}

// ---------- quiz ----------
const perguntas = () => config.perguntas;
let dicaTimer = null; let choppPerdido = false; let faseChopp = false;

function modoOuro(sim) { faseChopp = sim; document.body.classList.toggle('ouro', sim); fundo.setOuro(sim); palco.ouro(sim); }

function iniciarQuiz() {
  respostas = []; atual = 0; choppPerdido = false; modoOuro(false);
  const ol = $('#progresso'); ol.innerHTML = '';
  perguntas().forEach((p, i) => {
    const li = document.createElement('li'); li.textContent = i + 1;
    if (p.valeChopp) { li.classList.add('chopp'); li.insertAdjacentHTML('beforeend', '<svg class="mini-chopp"><use href="#i-chopp"/></svg>'); }
    ol.appendChild(li);
  });
  palco.acao('pensar'); palco.expressao('pensando');
  mostrar('quiz');
  $('#q-texto').innerHTML = ''; $('#q-opcoes').innerHTML = '';
  setTimeout(renderPergunta, 350);
}

function renderPergunta() {
  const ps = perguntas(); const p = ps[atual];
  travado = false;
  $('#progresso').querySelectorAll('li').forEach((li, i) => { li.classList.toggle('atual', i === atual); li.classList.toggle('passou', i < atual); });
  $('#q-num').textContent = String(atual + 1).padStart(2, '0'); $('#q-de').textContent = `/${String(ps.length).padStart(2, '0')}`;
  $('#q-tag').textContent = p.tag || 'Trânsito';
  $('#q-chopp').hidden = !p.valeChopp;
  const n = palavras($('#q-texto'), esc(p.texto), 80, 32);
  const box = $('#q-opcoes'); box.innerHTML = '';
  const iniOpc = 300 + n * 32;
  p.opcoes.forEach((o, i) => {
    const b = document.createElement('button');
    b.className = 'opcao'; b.type = 'button'; b.style.setProperty('--d', `${iniOpc + i * 110}ms`);
    b.innerHTML = `<span class="letra">${LETRAS[i]}</span><span class="texto"></span><span class="icone-res"><svg><use href="#i-check"/></svg></span>`;
    b.querySelector('.texto').textContent = o;
    b.addEventListener('click', () => responder(i, b));
    box.appendChild(b);
  });
  // EGon: pensa junto (na fase do chopp ele segura a caneca)
  if (p.valeChopp && !choppPerdido) { palco.acao('segurar'); palco.expressao('focado'); } else { palco.acao('pensar'); palco.expressao('pensando'); }
  const falas = p.valeChopp ? ['Essa vale chopp! 🍺', 'Foco total agora!', 'Última! Valendo o chopp!'] : ['Pensa bem...', 'Essa é tranquila!', 'Confio em você!'];
  const ehUltima = atual === ps.length - 1;
  setTimeout(() => { if (!travado) palco.falar(ehUltima && p.valeChopp ? falas[2] : falas[atual % 2], 2400); }, 500);
  clearTimeout(dicaTimer);
  dicaTimer = setTimeout(() => { if (!travado && telaAtual === 'quiz') { palco.acaoTemp('chamar', 1800); palco.falar(sorteio(['Sem pressa! Lê com calma 😉', 'Toca na resposta que você acha certa!']), 2600); } }, 11000);
}

function centro(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, r }; }

async function responder(i, botao) {
  if (travado) return; travado = true;
  clearTimeout(dicaTimer); armarInatividade();
  const p = perguntas()[atual];
  const ok = i === p.correta;
  respostas.push({ pergunta: atual + 1, texto: p.texto, resposta: p.opcoes[i], escolha: i, correta: p.correta, acertou: ok, valeChopp: !!p.valeChopp });
  const bts = [...$('#q-opcoes').querySelectorAll('.opcao')];
  botao.classList.add('escolhida'); tocar('suspense');
  const c = centro(botao);
  palco.olharPara(c.x, c.y, 1200); palco.expressaoTemp('surpreso', 900); palco.calar();
  await espera(950);
  bts.forEach((b, k) => {
    b.classList.remove('escolhida');
    if (k === p.correta) b.classList.add('certo');
    else if (k === i) { b.classList.add('errado'); b.querySelector('use').setAttribute('href', '#i-x'); } else b.classList.add('apagada');
  });
  $('#progresso').children[atual].classList.add(ok ? 'certo' : 'errado');
  if (ok) {
    tocar('certo');
    fx.explosao(c.r.right - c.r.height * 0.6, c.y, { n: 30, cores: p.valeChopp ? ['#FFE27A', '#FFFFFF', '#FFB627'] : ['#2BD67B', '#FFFFFF', '#6FE3FF'] });
    palco.gesto('pulo'); palco.expressaoTemp('estrela', 1600);
    if (p.valeChopp && !choppPerdido) { palco.acaoTemp('brinde', 1500); palco.falar(sorteio(['Isso! O chopp tá chegando! 🍺', 'Mandou bem! Saúde! 🍻', 'Acertou! Gelado te esperando!']), 1900); fx.bolhas(14); }
    else { palco.acaoTemp('comemorar', 1500); palco.falar(sorteio(['Isso aí! ✓', 'Mandou bem!', 'Acertou em cheio!']), 1800); }
  } else {
    tocar('errado');
    palco.acaoTemp('triste', 2200); palco.expressaoTemp('triste', 2200);
    if (p.valeChopp && !choppPerdido) {
      choppPerdido = true; palco.nivelCaneca(0);
      palco.falar(`Ah não, derramou o chopp! Era a ${LETRAS[p.correta]}.`, 2600);
      setTimeout(() => palco.caneca(false), 1500);
    } else palco.falar(`Quase! A certa era a ${LETRAS[p.correta]}.`, 2400);
  }
  setTimeout(proxima, ok ? 2000 : 2900);
}

async function proxima() {
  const ps = perguntas();
  atual += 1;
  if (atual >= ps.length) { finalizar(); return; }
  if (ps[atual].valeChopp && !ps[atual - 1].valeChopp) await avisoChopp(ps.filter((p) => p.valeChopp).length);
  renderPergunta();
}

// Interlúdio: a tela fica dourada e o EGon aparece com a caneca enchendo.
async function avisoChopp(qtd) {
  $('#aviso-qtd').textContent = qtd;
  $('#aviso-sub').textContent = qtd > 1 ? `Acerte as ${qtd} e o chopp é seu` : 'Acerte e o chopp é seu';
  const a = $('#aviso-chopp'); a.classList.add('mostra');
  modoOuro(true); tocar('chopp'); fundo.pulsoWarp(600);
  palco.irPara($('#ancora-aviso'), { semAnel: false, balao: 'dir' });
  palco.caneca(true, 0); palco.acao('segurar'); palco.expressao('coracao');
  await espera(700); palco.nivelCaneca(1); fx.bolhas(36);
  palco.falar('Agora vale chopp!! 🍺', 2400);
  await espera(1500); palco.acaoTemp('brinde', 1400);
  await espera(1600);
  a.classList.remove('mostra');
  palco.irPara($('#ancora-quiz'), { semAnel: true, balao: 'cima' });
  await espera(250);
}

// ---------- resultado ----------
let contagemTimer = null; let fogosTimer = null;
function finalizar() {
  const total = respostas.length;
  const acertos = respostas.filter((r) => r.acertou).length;
  const valendo = respostas.filter((r) => r.valeChopp);
  const acertouChopp = valendo.length > 0 && valendo.every((r) => r.acertou);
  const limite = Number(config.limiteChopps) || 0;
  const esgotado = limite > 0 && stats.chopps >= limite;
  const ganhou = acertouChopp && !esgotado;

  const codigo = ganhou ? codigoCupom() : '';
  const lead = {
    id: uid(),
    codigo,
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

  const nome = capitalizar(primeiroNome(jogador.nome));
  $('#r-total').textContent = total;
  $('#r-premio').hidden = !ganhou;
  $('#tela-resultado').classList.toggle('vitoria', ganhou || acertouChopp);
  if (!ganhou) modoOuro(false);
  if (ganhou) {
    $('#r-titulo').textContent = `Parabéns, ${nome}!`;
    $('#r-msg').textContent = 'Você acertou as perguntas que valiam chopp.';
    $('#r-voucher-nome').textContent = jogador.nome.split(' ').slice(0, 2).join(' ');
    $('#r-voucher-hora').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('#r-voucher-codigo').textContent = codigo;
  } else if (acertouChopp && esgotado) {
    $('#r-titulo').textContent = `Mandou bem, ${nome}!`;
    $('#r-msg').textContent = 'Você acertou tudo, mas os chopps desta ação já acabaram. Nossa equipe vai falar com você!';
  } else {
    $('#r-titulo').textContent = acertos >= total - 1 ? `Foi por pouco, ${nome}!` : `Valeu, ${nome}!`;
    const ac = valendo.filter((r) => r.acertou).length;
    $('#r-msg').textContent = `Você acertou ${ac} de ${valendo.length} perguntas que valiam chopp. Para ganhar, precisa acertar as ${valendo.length}. Obrigado por jogar!`;
  }
  $('#r-acertos').textContent = '0';
  mostrar('resultado');

  // placar sobe contando
  let n = 0; const sobe = setInterval(() => { n += 1; if (n > acertos) { clearInterval(sobe); return; } $('#r-acertos').textContent = n; tocar('digita'); }, 160);

  palco.aoPousar = null;
  if (ganhou) {
    palco.caneca(true, 1); palco.acao('dancar'); palco.expressao('estrela');
    setTimeout(() => { tocar('vitoria'); fx.canhao(-1); fx.canhao(1); palco.falar(`Saúde, ${nome}! 🍻`, 3200); }, 650);
    setTimeout(() => fx.chuva(140), 1300);
    setTimeout(() => { palco.acao('brinde'); }, 4200);
    let k = 0; clearInterval(fogosTimer);
    fogosTimer = setInterval(() => { if (++k > 5) { clearInterval(fogosTimer); return; } fx.fogos(innerWidth * (k % 2 ? 0.08 + Math.random() * 0.3 : 0.6 + Math.random() * 0.35), innerHeight * (0.08 + Math.random() * 0.1)); }, 900);
  } else if (acertouChopp && esgotado) {
    palco.caneca(false); palco.acao('joinha'); palco.expressao('feliz');
    setTimeout(() => { tocar('fim'); fx.chuva(70); palco.falar('Mandou bem demais!', 2800); }, 650);
  } else {
    palco.caneca(false); palco.acao('idle'); palco.expressao('feliz'); palco.espontaneo(['pulinho', 'acenar', 'alongar']);
    setTimeout(() => { tocar('fim'); palco.acaoTemp('acenar', 2400); palco.falar(acertos >= total - 1 ? 'Foi por pouquinho!' : `Valeu por jogar, ${nome}!`, 2800); }, 650);
  }

  let s = VOLTA_RESULTADO_S;
  const anel = $('#r-anel');
  const desenhar = () => { $('#r-contagem').textContent = s; anel.style.strokeDashoffset = String(106.8 * (1 - s / VOLTA_RESULTADO_S)); };
  desenhar();
  clearInterval(contagemTimer);
  contagemTimer = setInterval(() => { s -= 1; desenhar(); if (s <= 0) voltarInicio(); }, 1000);
}

// Código curto para conferir o cupom no balcão (sem letras que confundem, como O e 0).
function codigoCupom() {
  const L = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = crypto.getRandomValues ? crypto.getRandomValues(new Uint32Array(4)) : [0, 0, 0, 0].map(() => Math.random() * 2 ** 32);
  return Array.from(n, (v) => L[v % L.length]).join('');
}

function voltarInicio() {
  clearInterval(contagemTimer); clearInterval(fogosTimer); clearTimeout(dicaTimer);
  fx.limpar(); modoOuro(false);
  $('#modal').hidden = true; $('#aviso-chopp').classList.remove('mostra');
  document.activeElement?.blur();
  palco.caneca(false);
  mostrar('descanso');
}
document.querySelectorAll('[data-acao="inicio"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); tocar('toque'); voltarInicio(); }));

function deviceId() {
  try {
    let d = localStorage.getItem('eg_device');
    if (!d) { d = `totem-${Math.random().toString(36).slice(2, 7)}`; localStorage.setItem('eg_device', d); }
    return d;
  } catch { return 'totem'; }
}

// ---------- pausa: o EGon dorme ----------
let sonoTimer = null;
function iniciarSono() {
  pararSono(); palco.acao('dormir'); palco.expressao('dormindo'); palco.caneca(false);
  sonoTimer = setInterval(() => { const p = palco.mundoParaTela(palco.egon.cabeca.getWorldPosition(palco.egon.olharAlvo.clone())); fx.zzz(p.x + 40, p.y - 40); }, 1300);
}
function pararSono() { clearInterval(sonoTimer); sonoTimer = null; }

// ---------- inatividade ----------
let inatTimer = null;
function armarInatividade() {
  clearTimeout(inatTimer);
  if (telaAtual === 'cadastro' || telaAtual === 'quiz') inatTimer = setTimeout(voltarInicio, INATIVIDADE_MS);
}
['pointerdown', 'keydown', 'input'].forEach((ev) => document.addEventListener(ev, armarInatividade, { passive: true }));

// ---------- status escondido: 5 toques no logo ----------
let toques = 0; let toqueTimer = null;
document.querySelectorAll('.logo-secreto').forEach((l) => l.addEventListener('click', (e) => {
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
  $('#st-som').textContent = `Som: ${somLigado() ? 'ligado' : 'desligado'}`;
  $('#status').hidden = false;
}
$('#st-fechar').onclick = () => { $('#status').hidden = true; };
$('#st-reload').onclick = () => location.reload();
$('#st-sync').onclick = () => { reenviarPendentes(); setTimeout(abrirStatus, 1500); };
$('#st-som').onclick = () => { alternarSom(); $('#st-som').textContent = `Som: ${somLigado() ? 'ligado' : 'desligado'}`; };
$('#st-sair').onclick = () => { document.exitFullscreen?.().catch(() => {}); $('#status').hidden = true; };

// ---------- início ----------
observarStats((s) => { stats = s; });
observarConfig((c) => {
  const primeira = !config;
  config = c;
  somDoEvento(c.som !== false);
  if (c.pausado) mostrar('pausa');
  else if (telaAtual === 'pausa' || primeira) {
    if (primeira) { palco.irPara($(ANCORAS.descanso), { instantaneo: true }); }
    mostrar('descanso');
  }
});
window.addEventListener('online', reenviarPendentes);
setTimeout(reenviarPendentes, 5000);
(document.fonts?.ready || Promise.resolve()).then(() => setTimeout(() => document.body.classList.remove('carregando'), 150));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
