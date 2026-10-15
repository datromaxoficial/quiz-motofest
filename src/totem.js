import {
  modoDemo, observarConfig, observarStats, salvarLead, jaJogou, placaJaRegistrada, uid,
  pendentes, reenviarPendentes, leadsLocais, aplicarLimpeza,
} from './data.js';
import { Palco } from './palco.js';
import { modoTablet, modoLeve } from './dispositivo.js';
import { criarTeclado } from './teclado.js';
import { Fundo, Efeitos } from './fx.js';
import { tocar, destravarAudio, alternarSom, somLigado, somDoEvento } from './som.js';
import { normalizarRegras, sortearPartida, avaliar, gerarCodigo, chaveConjunto, limiteRecentes } from './regras.js';

const $ = (s) => document.querySelector(s);
document.body.classList.toggle('tablet', modoTablet);
document.body.classList.toggle('leve', modoLeve);
const LETRAS = 'ABCD';
const INATIVIDADE_MS = 150000;   // sem toques por 2,5 min: pergunta "Ainda está aí?"
const AVISO_S = 30;               // e espera mais 30 s antes de voltar ao início
const RETOMAR_MS = 5 * 60000;     // fechou ou recarregou a tela: retoma de onde parou por até 5 min
const RETOMAR_RESULTADO_MS = 3 * 60000;
const VOLTA_RESULTADO_S = 60; // tela final: 60 s para mostrar no balcão (ou toque em "Começar de novo")
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sorteio = (arr) => arr[(Math.random() * arr.length) | 0];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
// Hora do cupom sempre no horário do evento (Gravatá-PE), mesmo que o relógio/fuso do tablet esteja errado.
const horaDoEvento = () => { try { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' }); } catch { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } };

let config = null;
let stats = { chopps: 0 };
let jogador = null;
let atual = 0;
let travado = false;

// ---------- unidades estáveis (o teclado virtual não encolhe o layout) ----------
const base = { w: innerWidth, h: innerHeight };
// Paisagem: palco de 128 x 80 unidades. Retrato (celular ou tablet em pé): 80 unidades de largura
// e a altura que couber; as telas viram coluna e o EGon ocupa o espaço da âncora no fluxo.
function medidas() {
  // A altura só fica "congelada" enquanto o teclado virtual está aberto (campo em foco);
  // em qualquer outro caso (janela, tela cheia, barra do navegador, rotação) acompanha a tela.
  const digitando = document.activeElement?.tagName === 'INPUT' && document.activeElement.type !== 'checkbox';
  if (!digitando || Math.abs(innerWidth - base.w) > 2) { base.w = innerWidth; base.h = innerHeight; } else if (innerHeight > base.h) base.h = innerHeight;
  const retrato = base.h > base.w * 1.05;
  const larg = retrato ? 80 : 128;
  const u = retrato ? Math.min(base.w / 80, base.h / 118) : Math.min(base.w / 128, base.h / 80);
  const alt = retrato ? base.h / u : 80;
  const r = document.documentElement.style;
  r.setProperty('--u', `${u}px`);
  r.setProperty('--larg', larg); r.setProperty('--alt', alt.toFixed(2));
  r.setProperty('--ox', `${(base.w - u * larg) / 2}px`);
  r.setProperty('--oy', `${(base.h - u * alt) / 2}px`);
  const mudou = document.body.classList.contains('retrato') !== retrato;
  document.body.classList.toggle('retrato', retrato);
  if (mudou) requestAnimationFrame(() => { ajustarManchete(); if (window.__egon) window.__egon.calcAlvo(true); });
}

// A manchete da tela inicial nunca passa de 3 linhas: diminui a letra até caber.
function ajustarManchete() {
  const el = document.getElementById('frase-descanso'); if (!el || !el.textContent) return;
  el.style.fontSize = '';
  const base = parseFloat(getComputedStyle(el).fontSize);
  const limite = base * 0.96 * 3 + 2;
  let k = 1;
  while (k > 0.55) {
    const h = [...el.querySelectorAll('.w')].reduce((m, w) => Math.max(m, w.offsetTop + w.offsetHeight), 0) - (el.querySelector('.w')?.offsetTop || 0);
    if (h <= limite * k) break;
    k -= 0.05; el.style.fontSize = `${base * k}px`;
  }
}
medidas();
addEventListener('resize', medidas);
document.addEventListener('fullscreenchange', () => setTimeout(medidas, 60));
document.addEventListener('focusout', () => setTimeout(medidas, 400));

// ---------- camadas ----------
function criarPalco() {
  try { return new Palco($('#palco'), $('#balao'), { leve: modoLeve }); } catch (e) {
    console.warn('EGon 3D indisponível neste aparelho; o quiz segue sem ele.', e);
    $('#palco').hidden = true;
    const nada = () => {}; const vazio = { x: 0, y: 0 };
    const egon = { cabeca: { getWorldPosition: (v) => v }, olharAlvo: { clone: () => ({}) } };
    return new Proxy({ egon, pos: {}, pilotando: false, motoEstacionada: false, arrastando: false, ultimoToque: 0 }, {
      get: (alvo, k) => (k in alvo ? alvo[k] : k === 'tocouEgonAgora' ? () => false : k === 'mundoParaTela' ? () => vazio : nada),
      set: (alvo, k, v) => { alvo[k] = v; return true; },
    });
  }
}
const palco = criarPalco();
const fundo = new Fundo($('#fx-fundo'), { leve: modoLeve });
const fx = new Efeitos($('#fx'), { leve: modoLeve });
window.__egon = palco; // ajuda na manutenção pelo console e nos testes automáticos
window.__quiz = { partida: () => partida, escolhas: () => escolhas, regras: () => regras, cena: (i) => { cenaToken += 1; aplicarCena(CENAS[i]); }, estado: () => ({ cenaToken, cenaLonga, telaAtual }) };

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
function mostrar(nome, { deMoto = false } = {}) {
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
  const opcAncora = { semAnel: nome === 'quiz' || nome === 'cadastro', balao: nome === 'descanso' ? undefined : 'cima' };
  if (deMoto && !palco.arrastando) { palco.irDeMoto($(ANCORAS[nome]), opcAncora); tocar('vrum'); } else { palco.desmontarMoto(); palco.irPara($(ANCORAS[nome]), opcAncora); }
  if (antes !== nova) palco.entrarPeloLado();
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
  if (palco.pilotando) { palco.expressaoTemp(combo > 2 ? 'risada' : 'piscar', 1200); palco.falar(sorteio(['Bi-bi! 🏍️', 'Olha o piloto aqui!', 'Segura firme!']), 1400); tocar('vrum'); return; }
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
// Textos que dependem das regras salvas no painel.
const regrasAtuais = () => normalizarRegras(config || {});
const frasePremio = (r) => (r.acertosParaGanhar >= r.decisivas ? `As ${r.decisivas} últimas valem chopp!` : `Acerte ${r.acertosParaGanhar} das ${r.decisivas} últimas e ganhe chopp!`);
function atualizarTextosRegra() {
  const r = regrasAtuais();
  $('#passo-perguntas').innerHTML = `${r.totalPerguntas} perguntas<br>de trânsito`;
  $('#passo-chopp').innerHTML = r.acertosParaGanhar >= r.decisivas ? `Acertou as ${r.decisivas} finais?<br>Chopp na mão!` : `Acertou ${r.acertosParaGanhar} das ${r.decisivas} finais?<br>Chopp na mão!`;
  CENAS[0].sub = `${r.totalPerguntas} perguntas rápidas sobre trânsito. ${frasePremio(r)}`;
  CENAS[5].frase = `${r.acertosParaGanhar} acertos finais = <span class="ouro">1 chopp</span>`;
}
const CENAS = [
  { frase: 'Acerte e ganhe um <span class="ouro">chopp gelado</span>', sub: '5 perguntas rápidas sobre trânsito. As 3 últimas valem chopp!',
    egon: () => { palco.acaoTemp('acenar', 2600); palco.expressaoTemp('piscar', 2600); palco.falar('Oi! Eu sou o EGon! 👋', 3000); } },
  { frase: 'No trânsito e na vida, <span class="ouro">cuidar é proteger</span>', sub: 'Teste o que você sabe e ainda leva um brinde.',
    egon: async () => { voo([[0.62, 0.3], [0.42, 0.18], [0.7, 0.12]], 'voar', 900); await espera(2800); apontarCTA('Toca aqui pra jogar!'); } },
  { frase: 'Você sabe <span class="ouro">pilotar seguro?</span>', sub: 'Responda o quiz do EGon e descubra agora.',
    egon: () => { palco.acaoTemp('pensar', 4200); palco.expressaoTemp('pensando', 4200); palco.falar('Hmm... será que você acerta tudo?', 3800); } },
  { frase: 'Pode ir, <span class="ouro">estaremos lá!</span>', sub: 'Exclusive Gold. Proteção veicular de verdade.',
    egon: async () => { voo([[0.95, 0.2], [0.4, 0.14], [0.75, 0.24]], 'super', 1000); await espera(3300); palco.acaoTemp('joinha', 2200); palco.expressaoTemp('piscar', 2200); palco.falar('Exclusive Gold sempre com você!', 2600); } },
  { frase: 'Bora pro <span class="ouro">Motofest!</span>', sub: 'Vem pro Stand da Exclusive Gold testar o que você sabe.',
    egon: () => cenaMoto() },
  { frase: '3 acertos finais = <span class="ouro">1 chopp</span>', sub: 'É rapidinho. Toque na tela para começar.',
    egon: async () => { palco.caneca(true, 0); palco.acao('segurar'); palco.expressao('coracao'); await espera(400); palco.nivelCaneca(1); palco.falar('Chopp gelado te esperando! 🍺', 3200); await espera(3600); palco.acaoTemp('brinde', 1600); await espera(1700); palco.caneca(false); palco.acao('idle'); palco.expressao('normal'); } },
];
let cenaIdx = 0; let cenaTimer = null; let cenaToken = 0; let cenaLonga = false; // cena longa (moto) segura a troca automática

function voo(pontos, acao, passo) { // pontos em fração da tela; volta para a âncora no fim
  const token = cenaToken;
  const alt = $('#ancora-descanso').getBoundingClientRect().height * 0.62;
  pontos.forEach(([fx_, fy], i) => setTimeout(() => { if (token === cenaToken && telaAtual === 'descanso' && !palco.arrastando) palco.voarPara(innerWidth * fx_, innerHeight * fy + alt, alt, acao); }, i * passo));
  setTimeout(() => { if (token === cenaToken && telaAtual === 'descanso') palco.irPara($('#ancora-descanso')); }, pontos.length * passo);
}
// O EGon chama a moto, caminha até ela, sobe, acelera para fora da tela e volta pelo outro lado.
async function cenaMoto() {
  cenaLonga = true;
  try { await rodarCenaMoto(); } finally {
    cenaLonga = false;
    // se algo interrompeu no meio (toque, arrasto), ele volta para o lugar e desce da moto
    if (telaAtual === 'descanso' && (palco.pilotando || palco.motoEstacionada) && !palco.motoChegada) palco.irDeMoto($('#ancora-descanso'));
  }
}
async function rodarCenaMoto() {
  const token = cenaToken; const ok = () => token === cenaToken && telaAtual === 'descanso' && !palco.arrastando;
  const ancora = $('#ancora-descanso'); const u = ancora.getBoundingClientRect().height / 47;
  const xTela = () => palco.mundoParaTela(palco.pos).x;
  const esperarAte = async (cond, max) => { const t0 = performance.now(); while (!cond() && performance.now() - t0 < max) { await espera(100); if (!ok()) return; } };
  palco.expressaoTemp('surpreso', 1000); palco.falar('Peraí... vou chamar a minha moto! 🏍️', 2400); tocar('chopp');
  await espera(900); if (!ok()) return;
  await new Promise((resolve) => { palco.chamarMoto(-6 * u, resolve); setTimeout(resolve, 9000); });
  if (!ok() || !palco.pilotando) return;
  palco.expressaoTemp('feliz', 2400); tocar('vrum'); palco.falar('Segura que lá vou eu!', 2000);
  await espera(1800); if (!ok()) return;
  // sai devagar pela direita...
  palco.dirigirPara(innerWidth + 60 * u);
  await esperarAte(() => xTela() > innerWidth + 30 * u, 9000); if (!ok()) return;
  await espera(700); if (!ok()) return;
  // ...e volta pelo mesmo lado, sem passar por cima dos textos
  tocar('vrum');
  await new Promise((res) => {
    palco.irDeMoto(ancora, {}, () => { res(); if (telaAtual !== 'descanso') return; palco.acaoTemp('joinha', 2000); palco.expressaoTemp('piscar', 2000); palco.falar('Capacete sempre afivelado! 😎', 2600); });
    setTimeout(res, 12000);
  });
  await espera(2400);
}

function apontarCTA(fala) {
  const r = $('#cta').getBoundingClientRect();
  palco.apontarPara(r.left + r.width * 0.6, r.top + r.height / 2, 2400); palco.expressaoTemp('feliz', 2400); palco.falar(fala, 2600);
}

function aplicarCena(c, primeira) {
  const h = $('#frase-descanso');
  const entrar = () => { palavras(h, c.frase, 0, 70); ajustarManchete(); h.classList.remove('sai'); h.classList.remove('entra'); void h.offsetWidth; h.classList.add('entra'); };
  if (primeira) entrar(); else { h.classList.remove('entra'); h.classList.add('sai'); setTimeout(entrar, 380); }
  const s = $('#sub-descanso'); s.classList.add('troca'); setTimeout(() => { s.textContent = c.sub; s.classList.remove('troca'); }, primeira ? 0 : 380);
  // se alguém está brincando com o EGon agora, ele não interrompe a brincadeira
  if (performance.now() - (palco.ultimoToque || 0) > 4000 && !palco.arrastando && !palco.pilotando && !palco.motoEstacionada) c.egon();
}
function iniciarDescanso() {
  pararDescanso();
  cenaIdx = 0; palco.acao('idle'); palco.expressao('normal'); palco.caneca(false);
  setTimeout(() => { if (telaAtual === 'descanso') aplicarCena(CENAS[0], true); }, 500);
  cenaTimer = setInterval(() => { if (cenaLonga || palco.pilotando || palco.motoEstacionada) return; cenaToken += 1; cenaIdx = (cenaIdx + 1) % CENAS.length; palco.acao('idle'); palco.expressao('normal'); aplicarCena(CENAS[cenaIdx]); }, 8000);
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
let placaStatus = 'vazia'; // 'informada' | 'nao-lembra' | 'sem-veiculo' | 'nao-informar'
let restaurando = false;   // repondo um cadastro salvo: sem falas nem sons
const MOTIVOS_PLACA = { 'nao-lembra': 'Não lembro', 'sem-veiculo': 'Sem veículo', 'nao-informar': 'Não informada' };
const valido = { nome: false, whats: false, placa: false, assoc: false, lgpd: false };
const perguntou = {};

function novoJogo() {
  jogador = null; atual = 0; associado = null;
  $('#form').reset(); $('#f-lgpd').checked = false;
  fAssoc.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', 'false'));
  delete fAssoc.dataset.v;
  document.querySelectorAll('.invalido, .campo.ok').forEach((e) => e.classList.remove('invalido', 'ok'));
  Object.keys(valido).forEach((k) => { valido[k] = false; perguntou[k] = false; });
  limparSemPlaca(); placaStatus = 'vazia';
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
  if (ok && !antes && !restaurando) { tocar('escolha'); comemorarCampo(campo); }
}
function comemorarCampo(campo) {
  if (campo === 'nome') { clearTimeout(marcar.tNome); marcar.tNome = setTimeout(() => { if (!valido.nome) return; palco.gesto('pulo'); palco.expressaoTemp('feliz', 1800); palco.falar(`Prazer, ${capitalizar(primeiroNome(fNome.value))}! 😄`, 2200); }, 700); }
  if (campo === 'whats') { palco.acaoTemp('joinha', 1600); palco.expressaoTemp('piscar', 1600); palco.falar('Anotado! 📱', 1800); }
  if (campo === 'placa') { palco.gesto('pulo'); palco.expressaoTemp('estrela', 1500); palco.falar('Placa anotada! 🏍️', 1800); }
}

// Sem placa: não lembra, não tem veículo ou prefere não informar. Conta como campo resolvido.
function definirSemPlaca(motivo) {
  placaStatus = motivo; fPlaca.value = '';
  const c = fPlaca.closest('.campo'); c.classList.add('sem-placa', 'ok'); c.classList.remove('invalido');
  $('#placa-motivo').textContent = MOTIVOS_PLACA[motivo];
  $('#placa-sem-txt').textContent = 'Tenho a placa, quero digitar';
  valido.placa = true; atualizarMedidor(); salvarSessao();
  if (restaurando) return;
  tocar('escolha');
  if (motivo === 'nao-lembra') { palco.expressaoTemp('piscar', 2000); palco.falar('Sem problema! A gente confere depois 😉', 2600); }
  if (motivo === 'sem-veiculo') { palco.acaoTemp('joinha', 1800); palco.expressaoTemp('feliz', 2000); palco.falar('Quando tiver, já sabe quem protege! 🛡️', 2800); }
  if (motivo === 'nao-informar') { palco.expressaoTemp('feliz', 1800); palco.falar('Tranquilo, sem pressão!', 2200); }
}
function limparSemPlaca() {
  const c = fPlaca.closest('.campo'); const estava = c.classList.contains('sem-placa');
  c.classList.remove('sem-placa'); $('#placa-sem-txt').textContent = 'Não sei a placa / não tenho veículo';
  if (estava) { placaStatus = 'vazia'; c.classList.remove('ok'); valido.placa = false; atualizarMedidor(); }
}
$('#placa-sem').addEventListener('click', () => {
  if (fPlaca.closest('.campo').classList.contains('sem-placa')) { limparSemPlaca(); fPlaca.focus(); return; }
  document.activeElement?.blur(); $('#folha-placa').hidden = false; tocar('toque');
  palco.olharPara(innerWidth / 2, innerHeight / 2, 2500);
});
$('#folha-placa').addEventListener('click', (e) => {
  const b = e.target.closest('[data-motivo]');
  if (b) { $('#folha-placa').hidden = true; definirSemPlaca(b.dataset.motivo); return; }
  if (e.target.closest('#folha-voltar') || e.target === $('#folha-placa')) { $('#folha-placa').hidden = true; limparSemPlaca(); fPlaca.focus(); }
});
fPlaca.addEventListener('focus', () => limparSemPlaca());
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
fPlaca.addEventListener('input', () => {
  fPlaca.value = fPlaca.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
  const ok = PLACA_OK.test(fPlaca.value); placaStatus = ok ? 'informada' : 'vazia';
  marcar('placa', ok, fPlaca.closest('.campo'));
});
$('#f-lgpd').addEventListener('change', (e) => {
  valido.lgpd = e.target.checked; atualizarMedidor(); $('.lgpd').classList.remove('invalido'); salvarSessao();
  if (e.target.checked && !restaurando) { tocar('escolha'); palco.acaoTemp('joinha', 1400); palco.expressaoTemp('feliz', 1400); palco.falar('Combinado! 🤝', 1600); }
});
// Tablet: teclado próprio do quiz (o do sistema não abre). "Próximo" passa para o campo seguinte.
const teclado = modoTablet ? criarTeclado({
  campos: [[fNome, 'nome'], [fWhats, 'whats'], [fPlaca, 'placa']],
  tocar,
  // Teclado aberto: o cartão fica compacto lá em cima e o EGon, menor, vai inteiro para o canto.
  aoAbrir: () => {
    document.body.classList.add('tec-aberto');
    if (!palco.mudo) { palco.calar(); palco.mudo = true; }
    if (telaAtual === 'cadastro' && palco.ancora !== $('#ancora-teclado')) palco.irPara($('#ancora-teclado'), { semAnel: true, balao: 'dir' });
    requestAnimationFrame(ajustarTeclado);
  },
  aoFechar: () => {
    document.body.classList.remove('tec-aberto'); palco.mudo = false;
    if (telaAtual === 'cadastro') palco.irPara($('#ancora-cadastro'), { semAnel: true, balao: 'cima' });
    setTimeout(ajustarTeclado, 30);
  },
  aoProximo: (inp, tipo) => {
    if (tipo === 'nome') fWhats.focus();
    else if (tipo === 'whats' && !fPlaca.closest('.campo').classList.contains('sem-placa') && !valido.placa) fPlaca.focus();
    else teclado.fechar();
  },
}) : null;
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
  const antes = valido.assoc; valido.assoc = true; atualizarMedidor(); salvarSessao();
  if (restaurando) return;
  if (!antes) tocar('escolha');
  if (associado === 'sim') { palco.expressaoTemp('coracao', 2000); palco.acaoTemp('abraco', 1400); palco.falar('Que bom ter você com a gente! 💙', 2200); const r = b.getBoundingClientRect(); fx.coracoes(r.left + r.width / 2, r.top, 6); }
  else { palco.expressaoTemp('piscar', 1800); palco.acaoTemp('joinha', 1600); palco.falar('Bora conhecer a Exclusive Gold! 😉', 2200); }
});

// Com o teclado aberto, sobe o cartão para o campo em foco ficar visível.
function ajustarTeclado() {
  const form = $('#form'); const el = document.activeElement;
  const vv = window.visualViewport; const alturaVisivel = teclado?.aberto ? teclado.topo() : (vv ? vv.height : innerHeight);
  // Desloca pela margem (a animação de entrada da tela trava o transform do cartão).
  if (!el || el.tagName !== 'INPUT' || telaAtual !== 'cadastro') { form.style.marginTop = ''; return; }
  // margem "natural" do cartão (a do CSS, sem deslocamento nosso)
  if (!form.style.marginTop) form.dataset.mtBase = parseFloat(getComputedStyle(form).marginTop) || 0;
  const base = Number(form.dataset.mtBase) || 0;
  const mt = parseFloat(getComputedStyle(form).marginTop) || 0; // margem atual (pode estar no meio da animação)
  // WhatsApp e placa: a linha inteira, para o "Não sei a placa" também ficar visível
  const r = (teclado?.aberto && el.closest('.linha') || el).getBoundingClientRect();
  const margem = 24; const limite = alturaVisivel - margem;
  const nova = Math.min(base, mt - (r.bottom - limite)); // margem que deixa o fundo do bloco no limite
  form.dataset.desloc = Math.round(base - nova); form.style.marginTop = nova < base - 0.5 ? `${Math.round(nova)}px` : '';
}
window.visualViewport?.addEventListener('resize', ajustarTeclado);
document.addEventListener('focusout', () => setTimeout(ajustarTeclado, 120));

$('#form').addEventListener('submit', (e) => {
  e.preventDefault();
  const nome = fNome.value.trim().replace(/\s+/g, ' ').slice(0, 120);
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
  const comPlaca = placaStatus === 'informada';
  jogador = {
    nome, whatsapp: whats, placa: comPlaca ? placa : '', placaStatus: comPlaca ? 'informada' : placaStatus, placaRepetida: false,
    associado: associado === 'sim', lgpd: $('#f-lgpd').checked, repetido: jaJogou(whats),
  };
  palco.acaoTemp('comemorar', 1200); palco.expressaoTemp('estrela', 1200); palco.falar('Bora pro quiz! 🚀', 1400); tocar('certo');
  const checaPlaca = comPlaca && !jogador.repetido ? placaJaRegistrada(placa) : Promise.resolve(false);
  Promise.all([checaPlaca, espera(1100)]).then(([placaUsada]) => {
    if (telaAtual !== 'cadastro') return;
    if (jogador.repetido) {
      palco.expressaoTemp('surpreso', 1600); palco.falar('Você de novo? Que bom! 😄', 2200);
      abrirModal(`Você já jogou, ${capitalizar(primeiroNome(nome))}!`, 'Pode jogar de novo. Boa sorte nessa rodada!', () => iniciarQuiz());
    } else if (placaUsada) {
      // Placa de amigo ou familiar pode: só confirmamos. O painel marca essas placas para a Exclusive Gold.
      palco.expressaoTemp('curioso', 2600); palco.falar('Hmm, essa placa já passou por aqui!', 2600); tocar('suspense');
      abrirModal('Essa placa já foi registrada', `A placa ${placa} já apareceu em outra participação. Pode ser de um amigo ou familiar, tudo bem! Ela é mesmo a do veículo que você usa?`,
        () => { jogador.placaRepetida = true; iniciarQuiz(); },
        { ok: 'Sim, é essa placa', cancelar: 'Corrigir a placa', aoCancelar: () => { fPlaca.focus(); fPlaca.select(); palco.falar('Beleza, corrige aí!', 1800); } });
    } else iniciarQuiz();
  });
});

function abrirModal(titulo, texto, aoFechar, { ok = 'Bora jogar', cancelar = '', aoCancelar } = {}) {
  $('#modal-titulo').textContent = titulo; $('#modal-texto').textContent = texto;
  $('#modal-ok-txt').textContent = ok;
  const bc = $('#modal-cancelar'); bc.hidden = !cancelar; bc.textContent = cancelar;
  const m = $('#modal'); m.hidden = false;
  $('#modal-ok').onclick = () => { m.hidden = true; tocar('escolha'); aoFechar?.(); };
  bc.onclick = () => { m.hidden = true; tocar('toque'); aoCancelar?.(); };
}

// ---------- quiz ----------
// A partida é sorteada no início (regras.js): aquecimento primeiro, perguntas que valem chopp no fim,
// alternativas embaralhadas. O resultado do prêmio é calculado só no final, a partir das escolhas.
let partida = []; let escolhas = []; let regras = normalizarRegras();
const perguntas = () => partida;
let dicaTimer = null; let choppPerdido = false; let faseChopp = false; let errosDecisivas = 0;

function modoOuro(sim) { faseChopp = sim; document.body.classList.toggle('fase-ouro', sim); fundo.setOuro(sim); palco.ouro(sim); }

const RECENTES = 'eg_conjuntos_recentes';
function lerRecentes() { try { return JSON.parse(localStorage.getItem(RECENTES)) || []; } catch { return []; } }
function guardarRecente(ids) {
  const limite = limiteRecentes(config.banco.filter((p) => p.ativa !== false).length, ids.length);
  const lista = [chaveConjunto(ids), ...lerRecentes()].slice(0, limite);
  try { localStorage.setItem(RECENTES, JSON.stringify(lista)); } catch { /* sem storage */ }
}

function iniciarQuiz() {
  regras = normalizarRegras(config);
  partida = sortearPartida(config.banco, regras, { recentes: lerRecentes() });
  guardarRecente(partida.map((q) => q.id));
  escolhas = []; atual = 0; choppPerdido = false; errosDecisivas = 0; finalizado = false; modoOuro(false);
  montarProgresso();
  palco.acao('pensar'); palco.expressao('pensando');
  mostrar('quiz', { deMoto: true });
  salvarSessao();
  $('#q-texto').innerHTML = ''; $('#q-opcoes').innerHTML = '';
  setTimeout(renderPergunta, 350);
}
function montarProgresso() {
  const ol = $('#progresso'); ol.innerHTML = '';
  partida.forEach((p, i) => {
    const li = document.createElement('li'); li.textContent = i + 1;
    if (p.valeChopp) { li.classList.add('chopp'); li.insertAdjacentHTML('beforeend', '<svg class="mini-chopp"><use href="#i-chopp"/></svg>'); }
    if (escolhas[i] !== undefined) li.classList.add(escolhas[i] === p.correta ? 'certo' : 'errado');
    ol.appendChild(li);
  });
}

function renderPergunta() {
  const ps = perguntas(); const p = ps[atual];
  travado = false;
  $('#progresso').querySelectorAll('li').forEach((li, i) => { li.classList.toggle('atual', i === atual); li.classList.toggle('passou', i < atual); });
  $('#q-num').textContent = String(atual + 1).padStart(2, '0'); $('#q-de').textContent = `/${String(ps.length).padStart(2, '0')}`;
  $('#q-tag').textContent = p.tag || 'Trânsito';
  $('#q-etapa').textContent = p.valeChopp ? `Valendo chopp · ${ps.filter((q) => q.valeChopp).indexOf(p) + 1} de ${regras.decisivas}` : `Aquecimento · ${atual + 1} de ${regras.aquecimento}`;
  $('#q-etapa').classList.toggle('tag-chopp', p.valeChopp);
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
  if (travado || telaAtual !== 'quiz') return; travado = true;
  clearTimeout(dicaTimer); armarInatividade();
  const p = perguntas()[atual];
  escolhas[atual] = i; salvarSessao();
  const ok = i === p.correta; // só para a reação na tela; o prêmio é calculado em avaliar()
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
  if (!ok && p.valeChopp) errosDecisivas += 1;
  const perdeuAgora = p.valeChopp && !choppPerdido && errosDecisivas > regras.decisivas - regras.acertosParaGanhar;
  if (ok) {
    tocar('certo');
    fx.explosao(c.r.right - c.r.height * 0.6, c.y, { n: 30, cores: p.valeChopp ? ['#FFE27A', '#FFFFFF', '#FFB627'] : ['#2BD67B', '#FFFFFF', '#6FE3FF'] });
    palco.gesto('pulo'); palco.expressaoTemp('estrela', 1600);
    if (p.valeChopp && !choppPerdido) { palco.acaoTemp('brinde', 1500); palco.falar(sorteio(['Isso! O chopp tá chegando! 🍺', 'Mandou bem! Saúde! 🍻', 'Acertou! Gelado te esperando!']), 1900); fx.bolhas(14); }
    else { palco.acaoTemp('comemorar', 1500); palco.falar(sorteio(['Isso aí! ✓', 'Mandou bem!', 'Acertou em cheio!']), 1800); }
  } else {
    tocar('errado');
    palco.acaoTemp('triste', 2200); palco.expressaoTemp('triste', 2200);
    if (perdeuAgora) {
      choppPerdido = true; palco.nivelCaneca(0);
      palco.falar(`Ah não, derramou o chopp! Era a ${LETRAS[p.correta]}.`, 2600);
      setTimeout(() => palco.caneca(false), 1500);
    } else palco.falar(`Quase! A certa era a ${LETRAS[p.correta]}.`, 2400);
  }
  setTimeout(proxima, ok ? 2000 : 2900);
}

async function proxima() {
  if (telaAtual !== 'quiz') return;
  const ps = perguntas();
  atual += 1;
  if (atual >= ps.length) { finalizar(); return; }
  if (ps[atual].valeChopp && !ps[atual - 1]?.valeChopp) await avisoChopp();
  if (telaAtual === 'quiz') renderPergunta();
}

const textoRegra = (r) => (r.acertosParaGanhar >= r.decisivas
  ? `Acerte ${r.decisivas > 1 ? `as ${r.decisivas}` : 'esta'} e o chopp é seu`
  : `Acerte ${r.acertosParaGanhar} de ${r.decisivas} e o chopp é seu`);

// Interlúdio: a tela fica dourada e o EGon aparece com a caneca enchendo.
async function avisoChopp() {
  $('#aviso-qtd').textContent = regras.decisivas;
  $('#aviso-sub').textContent = textoRegra(regras);
  const a = $('#aviso-chopp'); a.classList.add('mostra');
  modoOuro(true); tocar('chopp'); fundo.pulsoWarp(600);
  palco.irPara($('#ancora-aviso'), { semAnel: false, balao: 'dir' });
  palco.caneca(true, 0); palco.acao('segurar'); palco.expressao('coracao');
  const segue = () => telaAtual === 'quiz';
  await espera(700); if (!segue()) { a.classList.remove('mostra'); return; } palco.nivelCaneca(1); fx.bolhas(36);
  palco.falar('Agora vale chopp!! 🍺', 2400);
  await espera(1500); if (!segue()) { a.classList.remove('mostra'); return; } palco.acaoTemp('brinde', 1400);
  await espera(1600);
  a.classList.remove('mostra');
  if (!segue()) return;
  palco.irPara($('#ancora-quiz'), { semAnel: true, balao: 'cima' });
  await espera(250);
}

// ---------- resultado ----------
let contagemTimer = null; let fogosTimer = null; let finalizado = false; let ganhouAgora = false;
function finalizar() {
  if (finalizado) return; // nunca grava a mesma partida duas vezes nem gera dois cupons
  finalizado = true;
  const av = avaliar(partida, escolhas, regras);
  const limite = Number(config.limiteChopps) || 0;
  const esgotado = limite > 0 && stats.chopps >= limite;
  const ganhou = av.cumpriuRegra && !esgotado;
  const codigo = ganhou ? gerarCodigo() : '';

  const lead = {
    id: uid(),
    codigo,
    ...jogador,
    perguntasIds: partida.map((q) => q.id),
    respostas: av.respostas,
    acertos: av.acertos,
    total: av.total,
    acertosAquecimento: av.acertosAquecimento,
    totalAquecimento: av.totalAquecimento,
    acertosDecisivas: av.acertosDecisivas,
    acertosChopp: av.acertosDecisivas,
    totalDecisivas: av.totalDecisivas,
    acertosNecessarios: av.acertosNecessarios,
    regras: { ...regras },
    ganhouChopp: ganhou,
    choppEsgotado: av.cumpriuRegra && esgotado,
    entregue: false,
    clientTime: Date.now(),
    device: deviceId(),
  };
  salvarLead(lead);
  if (ganhou) stats.chopps += 1; // otimista, o snapshot corrige
  const dados = { av, ganhou, esgotado, codigo, nomeCompleto: jogador.nome, hora: horaDoEvento() };
  salvarSessao({ dados });
  mostrarResultado(dados);
}

function mostrarResultado({ av, ganhou, esgotado, codigo, nomeCompleto, hora }, retomado = false) {
  const nome = capitalizar(primeiroNome(nomeCompleto));
  const tela = $('#tela-resultado');
  tela.classList.toggle('vitoria', av.cumpriuRegra);
  tela.classList.toggle('derrota', !av.cumpriuRegra);
  $('#r-total').textContent = av.totalDecisivas;
  $('#r-premio').hidden = !ganhou;
  $('#r-revisao').hidden = av.cumpriuRegra;
  if (!ganhou) modoOuro(false);
  if (ganhou) {
    $('#r-titulo').innerHTML = 'Parabéns, você ganhou <span class="ouro">um chopp!</span>';
    $('#r-msg').textContent = '';
    // Primeiro e último nome (sem "de/da/dos"); se ainda não couber, a fonte diminui até caber.
    const partes = nomeCompleto.split(/\s+/).filter((p) => p && !/^(d[aeo]s?|e)$/i.test(p));
    const vNome = $('#r-voucher-nome');
    vNome.textContent = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : (partes[0] || nomeCompleto);
    vNome.style.fontSize = '';
    requestAnimationFrame(() => { for (let k = 0; k < 6 && vNome.scrollWidth > vNome.clientWidth + 1; k++) vNome.style.fontSize = `${parseFloat(getComputedStyle(vNome).fontSize) * 0.9}px`; });
    $('#r-voucher-hora').textContent = hora;
    $('#r-voucher-codigo').textContent = codigo;
  } else if (av.cumpriuRegra && esgotado) {
    $('#r-titulo').textContent = `Mandou bem, ${nome}!`;
    $('#r-msg').textContent = 'Você acertou as perguntas que valiam chopp, mas os chopps desta ação já acabaram. Nossa equipe vai falar com você!';
  } else {
    $('#r-titulo').textContent = 'Ops, não foi dessa vez!';
    const erros = av.totalDecisivas - av.acertosDecisivas;
    $('#r-msg').textContent = erros === 1 ? 'Confira a resposta certa:' : 'Confira as respostas certas:'; // o EGon já comenta o resultado no balão
    renderRevisao(av.respostas.filter((x) => x.valeChopp));
  }
  $('#r-acertos').textContent = '0';
  mostrar('resultado');

  // placar das perguntas que valiam chopp sobe contando
  let n = 0; const sobe = setInterval(() => { n += 1; if (n > av.acertosDecisivas) { clearInterval(sobe); return; } $('#r-acertos').textContent = n; tocar('digita'); }, 220);

  palco.aoPousar = null;
  if (ganhou) {
    if (ganhou) modoOuro(true);
    palco.caneca(true, 1); palco.acao('dancar'); palco.expressao('estrela');
    setTimeout(() => { tocar('vitoria'); fx.canhao(-1); fx.canhao(1); palco.falar(retomado ? `Seu cupom continua aqui, ${nome}! 🍻` : `Saúde, ${nome}! 🍻`, 3200); }, 650);
    setTimeout(() => fx.chuva(140), 1300);
    setTimeout(() => { palco.acao('brinde'); }, 4200);
    let k = 0; clearInterval(fogosTimer);
    fogosTimer = setInterval(() => { if (++k > 5) { clearInterval(fogosTimer); return; } fx.fogos(innerWidth * (0.06 + Math.random() * 0.38), innerHeight * (0.12 + Math.random() * 0.18)); }, 900); // fogos do lado do EGon, longe do título e do cupom
  } else if (av.cumpriuRegra && esgotado) {
    palco.caneca(false); palco.acao('joinha'); palco.expressao('feliz');
    setTimeout(() => { tocar('fim'); fx.chuva(70); palco.falar('Mandou bem demais!', 2800); }, 650);
  } else {
    palco.caneca(false); palco.acao('idle'); palco.expressao('feliz'); palco.espontaneo(['pulinho', 'acenar', 'alongar']);
    setTimeout(() => { tocar('fim'); palco.acaoTemp('acenar', 2400); palco.falar(av.acertosDecisivas === av.totalDecisivas - 1 ? 'Foi por pouquinho! Na próxima vai!' : `Valeu por jogar, ${nome}!`, 2800); }, 650);
  }
  ganhouAgora = ganhou;
  $('#r-msg').hidden = !$('#r-msg').textContent;

  let s = VOLTA_RESULTADO_S;
  const anel = $('#r-anel');
  const desenhar = () => { $('#r-contagem').textContent = s; anel.style.strokeDashoffset = String(106.8 * (1 - s / VOLTA_RESULTADO_S)); };
  desenhar();
  clearInterval(contagemTimer);
  contagemTimer = setInterval(() => { s -= 1; desenhar(); if (s <= 0) voltarInicio(); }, 1000);
}

// Correção das perguntas que valiam chopp: enunciado, o que a pessoa marcou e a resposta certa.
function renderRevisao(decisivas) {
  $('#r-revisao').innerHTML = decisivas.map((r, i) => `
    <li class="${r.acertou ? 'ok' : 'erro'}" style="--i:${i}">
      <span class="rev-icone"><svg><use href="#${r.acertou ? 'i-check' : 'i-x'}"/></svg></span>
      <div>
        <p class="rev-pergunta">${esc(r.texto)}</p>
        ${r.acertou
    ? `<p class="rev-linha certa">Você respondeu: <b>${esc(r.resposta)}</b></p>`
    : `<p class="rev-linha errada">Você respondeu: <b>${esc(r.resposta ?? 'sem resposta')}</b></p><p class="rev-linha certa">Resposta certa: <b>${esc(r.respostaCorreta)}</b></p>`}
      </div>
    </li>`).join('');
}

function voltarInicio() {
  limparSessao(); fecharAviso();
  clearInterval(contagemTimer); clearInterval(fogosTimer); clearTimeout(dicaTimer);
  fx.limpar(); modoOuro(false);
  $('#modal').hidden = true; $('#folha-placa').hidden = true; $('#aviso-chopp').classList.remove('mostra');
  document.activeElement?.blur();
  palco.caneca(false);
  mostrar('descanso', { deMoto: telaAtual === 'resultado' });
}
document.querySelectorAll('[data-acao="inicio"]').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation(); if (telaAtual === 'descanso') return; tocar('toque');
  if (telaAtual === 'cadastro' || telaAtual === 'quiz') registrarAbandono('cancelou');
  // Quem ganhou confirma antes de sair: a tela com o cupom não volta depois.
  if (telaAtual === 'resultado' && ganhouAgora) {
    abrirModal('Já mostrou seu cupom?', 'Mostre esta tela no balcão do Stand antes de sair. Depois de começar de novo, ela não volta.', voltarInicio, { ok: 'Sim, começar de novo', cancelar: 'Voltar ao cupom' });
    return;
  }
  voltarInicio();
}));

// ---------- sessão: retomar de onde parou (tela fechada, recarregada ou saiu sem querer) ----------
const SESSAO = 'eg_sessao';
function fotoSessao() {
  if (telaAtual === 'cadastro') return { tela: 'cadastro', form: { nome: fNome.value, whats: fWhats.value, placa: fPlaca.value, placaStatus, assoc: associado, lgpd: $('#f-lgpd').checked } };
  if (telaAtual === 'quiz' && partida.length && !finalizado) return { tela: 'quiz', jogador, partida, escolhas, atual, regras, choppPerdido, errosDecisivas };
  return null;
}
function salvarSessao(extra) {
  try {
    const foto = extra?.dados ? { tela: 'resultado', dados: extra.dados } : fotoSessao();
    if (foto) localStorage.setItem(SESSAO, JSON.stringify({ ...foto, ts: Date.now() }));
  } catch { /* sem storage */ }
}
function lerSessao() { try { return JSON.parse(localStorage.getItem(SESSAO)); } catch { return null; } }
function limparSessao() { try { localStorage.removeItem(SESSAO); } catch { /* sem storage */ } }
function marcarAtividade() { const s = lerSessao(); if (s) { s.ts = Date.now(); try { localStorage.setItem(SESSAO, JSON.stringify(s)); } catch { /* sem storage */ } } }
$('#form').addEventListener('input', () => { clearTimeout(salvarSessao.t); salvarSessao.t = setTimeout(salvarSessao, 300); });

// Quem desiste no meio também vai para o painel (sem dados pessoais se não autorizou a LGPD).
function registrarAbandono(motivo, foto = fotoSessao()) {
  if (!foto || (foto.tela !== 'cadastro' && foto.tela !== 'quiz')) return;
  const f = foto.form; const j = foto.jogador;
  const temAlgo = f ? (f.nome?.trim() || soDigitos(f.whats || '') || f.placa) : true;
  if (!temAlgo) { limparSessao(); return; }
  const lgpd = f ? !!f.lgpd : !!j?.lgpd;
  const respostas = foto.tela === 'quiz' ? (foto.escolhas || []).map((e, i) => {
    if (e === undefined || e === null) return null; const q = foto.partida[i];
    return { pergunta: i + 1, id: q.id, etapa: q.etapa, valeChopp: q.valeChopp, texto: q.texto, resposta: q.opcoes[e], respostaCorreta: q.respostaCorreta, acertou: e === q.correta };
  }).filter(Boolean) : [];
  const placaStatusAb = f ? (f.placaStatus === 'vazia' ? (f.placa ? 'incompleta' : 'vazia') : f.placaStatus) : j?.placaStatus;
  salvarLead({
    id: uid(), status: 'incompleto', motivo,
    etapa: foto.tela === 'quiz' ? `quiz (respondeu ${respostas.length} de ${foto.partida.length})` : 'cadastro',
    nome: lgpd ? (f ? f.nome.trim().replace(/\s+/g, ' ') : j.nome).slice(0, 120) : '',
    whatsapp: lgpd ? (f ? soDigitos(f.whats || '') : j.whatsapp).slice(0, 15) : '',
    placa: lgpd ? ((f ? (f.placaStatus === 'informada' ? f.placa : '') : j.placa) || '').slice(0, 8) : '',
    placaStatus: placaStatusAb || '', associado: f ? f.assoc === 'sim' : !!j?.associado, lgpd,
    respostas, ganhouChopp: false, clientTime: Date.now(), device: deviceId(),
  });
  limparSessao();
}

function retomarSessao() {
  const s = lerSessao(); if (!s) return false;
  const idade = Date.now() - (s.ts || 0);
  const limite = s.tela === 'resultado' ? RETOMAR_RESULTADO_MS : RETOMAR_MS;
  if (idade > limite) { registrarAbandono('saiu da tela', s); limparSessao(); return false; }
  if (s.tela === 'cadastro') {
    novoJogo(); restaurando = true;
    const f = s.form;
    fNome.value = f.nome || ''; fNome.dispatchEvent(new Event('input'));
    fWhats.value = f.whats || ''; fWhats.dispatchEvent(new Event('input'));
    if (f.placaStatus && MOTIVOS_PLACA[f.placaStatus]) definirSemPlaca(f.placaStatus); else { fPlaca.value = f.placa || ''; fPlaca.dispatchEvent(new Event('input')); }
    if (f.assoc) fAssoc.querySelector(`[data-v="${f.assoc}"]`)?.click();
    if (f.lgpd) { $('#f-lgpd').checked = true; $('#f-lgpd').dispatchEvent(new Event('change')); }
    restaurando = false; salvarSessao();
    palco.aoPousar = () => { palco.aoPousar = null; palco.acaoTemp('acenar', 1800); palco.expressaoTemp('feliz', 1800); palco.falar('Que bom, você voltou! Vamos continuar 😉', 3000); };
    return true;
  }
  if (s.tela === 'quiz') {
    ({ jogador, partida, regras, choppPerdido, errosDecisivas } = s); escolhas = s.escolhas || []; atual = s.atual || 0; finalizado = false;
    if (escolhas[atual] !== undefined && escolhas[atual] !== null) atual += 1; // a resposta dessa pergunta já tinha sido dada
    montarProgresso();
    if (atual >= partida.length) { mostrar('quiz'); finalizar(); return true; }
    const p = partida[atual];
    modoOuro(!!p.valeChopp); if (p.valeChopp && !choppPerdido) palco.caneca(true, 1);
    mostrar('quiz'); salvarSessao();
    setTimeout(() => { renderPergunta(); palco.falar(`Bem-vindo de volta! Seguimos na pergunta ${atual + 1} 😉`, 2800); }, 450);
    return true;
  }
  if (s.tela === 'resultado') { mostrarResultado(s.dados, true); return true; }
  return false;
}

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
let inatTimer = null; let avisoTimer = null;
function armarInatividade() {
  clearTimeout(inatTimer); fecharAviso();
  if (telaAtual === 'cadastro' || telaAtual === 'quiz') { inatTimer = setTimeout(mostrarAviso, INATIVIDADE_MS); marcarAtividade(); }
}
function mostrarAviso() {
  let s = AVISO_S; $('#ainda-ai-seg').textContent = s; $('#ainda-ai').hidden = false;
  tocar('suspense'); palco.acaoTemp('chamar', 2400); palco.expressaoTemp('curioso', 3000); palco.falar('Ei! Ainda está aí? 👀', 3000);
  clearInterval(avisoTimer);
  avisoTimer = setInterval(() => {
    s -= 1; $('#ainda-ai-seg').textContent = s;
    if (s <= 0) { fecharAviso(); registrarAbandono('inatividade'); voltarInicio(); }
  }, 1000);
}
function fecharAviso() { clearInterval(avisoTimer); avisoTimer = null; $('#ainda-ai').hidden = true; }
$('#ainda-ai-ok').addEventListener('click', () => { armarInatividade(); palco.falar('Oba! Bora continuar!', 1800); });
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
    ['Chopps ganhos', `${stats.chopps}${Number(config.limiteChopps) ? ` de ${config.limiteChopps}` : ''}`],
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
let pausando = false;
observarConfig((c) => {
  const primeira = !config;
  config = c;
  somDoEvento(c.som !== false);
  // limpeza feita no painel (dados de teste): apaga a cópia local e o histórico de sorteio
  if (aplicarLimpeza(c.limpezaEm)) { try { localStorage.removeItem('eg_conjuntos_recentes'); } catch { /* sem storage */ } }
  atualizarTextosRegra();
  if (c.pausado) {
    // tela final fica até acabar (o fim dela já vai para a pausa); cadastro/quiz em andamento vira desistência
    if (telaAtual === 'resultado') return;
    if ((telaAtual === 'cadastro' || telaAtual === 'quiz') && !pausando) { pausando = true; try { registrarAbandono('pausa'); } finally { pausando = false; } }
    if (pausando) return; // salvar a desistência avisa a config de novo; a primeira chamada termina o serviço
    if (telaAtual !== 'pausa') { limparSessao(); teclado?.fechar(); $('#modal').hidden = true; $('#folha-placa').hidden = true; $('#aviso-chopp').classList.remove('mostra'); fecharAviso(); document.activeElement?.blur(); }
    mostrar('pausa');
  } else if (telaAtual === 'pausa' || primeira) {
    if (primeira) { palco.irPara($(ANCORAS.descanso), { instantaneo: true }); if (retomarSessao()) return; }
    mostrar('descanso');
  }
});
window.addEventListener('online', reenviarPendentes);
setTimeout(reenviarPendentes, 5000);
setInterval(() => { if (navigator.onLine) reenviarPendentes(); }, 60000); // garantia extra durante o evento
(document.fonts?.ready || Promise.resolve()).then(() => setTimeout(() => document.body.classList.remove('carregando'), 150));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const tinhaVersao = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    setInterval(() => { if (navigator.onLine) reg.update().catch(() => {}); }, 20 * 60000); // totem ligado o dia todo pega a versão nova
  }).catch(() => {});
  // Chegou versão nova: recarrega só quando ninguém está jogando (tela inicial, sem sessão em andamento).
  let atualizar = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinhaVersao) atualizar = true; });
  setInterval(() => { if (atualizar && telaAtual === 'descanso' && !document.querySelector('.modal:not([hidden]), .status:not([hidden])')) location.reload(); }, 5000);
}
