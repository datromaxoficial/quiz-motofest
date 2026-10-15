import {
  modoDemo, DEFAULT_CONFIG, observarConfig, salvarConfig, observarStats,
  observarLeads, observarLogin, entrar, sair, limparTudo,
} from './data.js';
import { normalizarRegras } from './regras.js';
import { BANCO_PADRAO } from './banco.js';
import { criarEgonMini } from './egon-mini.js';
import { gerarExcel, textoWhats, porDiaHora, baixarArquivo } from './relatorio.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtWhats = (d) => (d?.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d?.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d || '');
const linkWhats = (d, texto) => `https://wa.me/55${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
const dataHora = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

let leads = [];        // participações completas (base de todas as métricas)
let incompletos = [];  // desistências: preencheu algo e não terminou
let todosLeads = [];
// Participações feitas antes da última limpeza (testes) nunca contam, mesmo que um tablet offline as envie depois.
function separarLeads() {
  const corte = Number(config.limpezaEm) || 0;
  const validos = todosLeads.filter((x) => (x.clientTime || 0) >= corte);
  leads = validos.filter((x) => x.status !== 'incompleto');
  incompletos = validos.filter((x) => x.status === 'incompleto');
}
let config = DEFAULT_CONFIG;
let stats = { chopps: 0 };
let rascunho = null;      // cópia editável da config
let editando = false;
let desligar = [];

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------- login ----------
$('#badge-demo').hidden = !modoDemo;
$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault(); $('#l-erro').textContent = '';
  if (!$('#l-email').value.trim() || !$('#l-senha').value) { $('#l-erro').textContent = 'Preencha o e-mail e a senha.'; return; }
  const b = $('#form-login button[type="submit"]'); const bt = b.querySelector('span'); b.disabled = true; bt.textContent = 'Entrando...';
  try { await entrar($('#l-email').value.trim(), $('#l-senha').value); egonLogin?.acao('comemorar', 900); egonLogin?.expressao('estrela'); } catch (err) { $('#l-erro').textContent = mensagemLogin(err); egonLogin?.acao('triste', 1600); egonLogin?.expressao('triste'); egonLogin?.gesto('susto'); }
  b.disabled = false; bt.textContent = 'Entrar';
});
$('#btn-sair').onclick = () => { if (confirm('Sair do painel neste aparelho?')) sair(); };

// EGon 3D no login: acena, olha o campo em foco, tapa o visor na senha, reage ao resultado.
let egonLogin = null;
function ligarEgonLogin() {
  if (egonLogin || modoDemo) return;
  egonLogin = criarEgonMini($('#login-egon')); if (!egonLogin) return;
  const olharCampo = (el) => { const r = el.getBoundingClientRect(); egonLogin.olharPara(r.left + r.width / 2, r.top + r.height / 2); };
  $('#l-email').addEventListener('focus', (e) => { egonLogin.acao('idle'); egonLogin.expressao('curioso'); olharCampo(e.target); });
  $('#l-email').addEventListener('input', (e) => olharCampo(e.target));
  $('#l-senha').addEventListener('focus', () => { egonLogin.acao('tapar'); egonLogin.expressao('dormindo'); });
  $('#l-senha').addEventListener('blur', () => { egonLogin.acao('idle'); egonLogin.expressao('normal'); });
}
function mensagemLogin(err) {
  const c = err?.code || '';
  if (c.includes('network')) return 'Sem internet. Conecte e tente de novo.';
  if (c.includes('too-many-requests')) return 'Muitas tentativas. Espere alguns minutos e tente de novo.';
  if (c.includes('invalid-email')) return 'Confira o e-mail digitado.';
  return 'E-mail ou senha incorretos.';
}


// ---------- abas ----------
function moverPilula() {
  const b = document.querySelector('[data-aba][aria-selected="true"]'); const p = document.querySelector('.abas-pilula');
  if (!b || !p || !b.offsetWidth) return;
  p.style.width = `${b.offsetWidth}px`; p.style.transform = `translateX(${b.offsetLeft}px)`;
}
document.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-aba]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.aba').forEach((a) => { a.hidden = a.id !== `aba-${b.dataset.aba}`; });
  moverPilula();
  if (b.dataset.aba === 'visao') { graficoPerguntas(); graficoHoras(); }
}));
addEventListener('resize', moverPilula);
document.fonts?.ready.then(moverPilula);

// Números contam até o valor novo (e dão um pulinho quando mudam ao vivo).
function contar(el, valor, sufixo = '') {
  const de = Number(el.dataset.v ?? NaN);
  el.dataset.v = valor;
  if (!Number.isFinite(de) || de === valor) { el.textContent = `${valor}${sufixo}`; return; }
  el.classList.remove('mudou'); void el.offsetWidth; el.classList.add('mudou');
  const t0 = performance.now(); const dur = 700;
  const passo = (t) => {
    if (Number(el.dataset.v) !== valor) return;
    const k = Math.min(1, (t - t0) / dur); const e = 1 - (1 - k) ** 3;
    el.textContent = `${Math.round(de + (valor - de) * e)}${sufixo}`;
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

// ---------- participação ----------
const decisivas = (l) => (l.respostas || []).filter((r) => r.valeChopp);
const acertosDec = (l) => l.acertosDecisivas ?? l.acertosChopp ?? decisivas(l).filter((r) => r.acertou).length;
const totalDec = (l) => l.totalDecisivas ?? decisivas(l).length;
const acertosAq = (l) => l.acertosAquecimento ?? (l.respostas || []).filter((r) => !r.valeChopp && r.acertou).length;
const totalAq = (l) => l.totalAquecimento ?? (l.respostas || []).filter((r) => !r.valeChopp).length;
const idResposta = (r) => r.id || (BANCO_PADRAO.find((b) => b.texto.slice(0, 40) === String(r.texto || '').slice(0, 40))?.id) || `txt:${r.texto}`;

// ---------- placas (nicho de seguro: placas repetidas e não associados com veículo) ----------
const STATUS_PLACA = { 'nao-lembra': 'não lembra', 'sem-veiculo': 'sem veículo', 'nao-informar': 'não informou', incompleta: 'incompleta', vazia: '—' };
const statusPlaca = (l) => (l.placa ? 'informada' : (l.placaStatus || 'vazia'));
function mapaPlacas() {
  const m = new Map();
  leads.forEach((l) => { if (l.placa) m.set(l.placa, [...(m.get(l.placa) || []), l]); });
  return m;
}
let placasCache = new Map();
const vezesPlaca = (l) => (l.placa ? (placasCache.get(l.placa) || []).length : 0);
const ehProspect = (l) => !l.associado && !!l.placa;
const fmtMotivo = (m) => ({ inatividade: 'ficou sem tocar', cancelou: 'tocou em cancelar/sair', 'saiu da tela': 'fechou ou saiu da tela' }[m] || m || '');

// ---------- métricas ----------
function metricas() {
  const total = leads.length;
  const unicos = new Set(leads.map((l) => l.whatsapp)).size;
  const chopps = leads.filter((l) => l.ganhouChopp).length;
  const assoc = leads.filter((l) => l.associado).length;
  const resp = leads.flatMap((l) => l.respostas || []);
  const acertos = resp.filter((r) => r.acertou).length;
  const repetidas = [...placasCache.values()].filter((ls) => ls.length > 1);
  const prospects = leads.filter(ehProspect).length;
  const semPlaca = leads.filter((l) => !l.placa).length;
  return { total, unicos, chopps, assoc, naoAssoc: total - assoc, acertoMedio: pct(acertos, resp.length),
    placasRepetidas: repetidas.length, prospects, semPlaca, desistencias: incompletos.length };
}

function render() {
  placasCache = mapaPlacas();
  const m = metricas();
  contar($('#k-prospects'), m.prospects);
  $('#k-prospects-n').textContent = 'não associados com veículo';
  contar($('#k-repetidas'), m.placasRepetidas);
  contar($('#k-desist'), m.desistencias);
  $('#cont-part').textContent = m.unicos;
  contar($('#k-total'), m.total);
  $('#k-unicos').textContent = `${m.unicos} ${m.unicos === 1 ? 'pessoa' : 'pessoas'}`;
  const limite = Number(config.limiteChopps) || 0;
  const ganhos = Math.max(stats.chopps, 0);
  contar($('#k-chopps'), ganhos);
  $('#k-estoque').textContent = limite ? `de ${limite} · restam ${Math.max(limite - ganhos, 0)}` : 'sem limite';
  $('#k-barra').style.width = limite ? `${Math.min(pct(ganhos, limite), 100)}%` : '0';
  $('#k-barra').parentElement.hidden = !limite;
  contar($('#k-assoc'), pct(m.assoc, m.total), '%');
  $('#k-assoc-n').textContent = `${m.assoc} de ${m.total}`;
  $('#k-assoc-barra').style.width = `${pct(m.assoc, m.total)}%`;
  contar($('#k-acerto'), m.acertoMedio, '%');
  $('#c-ganhos').textContent = ganhos;
  moverPilula();
  graficoPerguntas(); graficoHoras(); tabela();
}

// Acerto por pergunta do banco (com o sorteio, cada partida usa perguntas diferentes).
function estatisticaPerguntas() {
  const por = new Map();
  leads.forEach((l) => (l.respostas || []).forEach((r) => {
    const k = idResposta(r); const e = por.get(k) || { n: 0, ok: 0, dec: 0, texto: r.texto };
    e.n += 1; if (r.acertou) e.ok += 1; if (r.valeChopp) e.dec += 1; por.set(k, e);
  }));
  const ordem = (config.banco || []).map((b) => b.id);
  return [...por.entries()].map(([id, e]) => ({ id, ...e, texto: (config.banco || []).find((b) => b.id === id)?.texto || e.texto, pos: ordem.indexOf(id) }))
    .sort((a, b) => (a.pos < 0 ? 999 : a.pos) - (b.pos < 0 ? 999 : b.pos));
}
function graficoPerguntas() {
  const el = $('#g-perguntas');
  if (!leads.length) { el.innerHTML = '<p class="sem-dados">Os gráficos aparecem com as primeiras participações.</p>'; return; }
  el.innerHTML = estatisticaPerguntas().map((e, i) => {
    const v = pct(e.ok, e.n);
    return `<div class="bh ${e.dec > e.n / 2 ? 'chopp' : ''}" style="--i:${i}"><span class="rotulo"><b>#${e.pos >= 0 ? e.pos + 1 : '?'}</b><span title="${esc(e.texto)}">${esc(e.texto)}</span></span><div class="trilho"><i data-w="${v}"></i></div><span class="valor">${v}% <small>(${e.n})</small></span></div>`;
  }).join('') + '<div class="legenda"><span>% de acerto · (vezes respondida)</span><span><i style="background:var(--azul-claro)"></i>Mais usada no aquecimento</span><span><i style="background:var(--ouro)"></i>Mais usada valendo chopp</span></div>';
  requestAnimationFrame(() => requestAnimationFrame(() => el.querySelectorAll('[data-w]').forEach((b) => { b.style.width = `${b.dataset.w}%`; })));
}

let diaGrafico = null;
function graficoHoras() {
  const el = $('#g-horas');
  if (!leads.length) { el.innerHTML = '<p class="sem-dados">Sem participações ainda.</p>'; return; }
  const dias = porDiaHora(leads);
  const d = dias.find((x) => x.chave === diaGrafico) || dias[dias.length - 1]; diaGrafico = d.chave;
  const max = Math.max(1, ...d.horas.map((h) => h.n));
  const passo = max <= 4 ? 1 : Math.ceil(max / 4);
  const topo = Math.ceil(max / passo) * passo;
  const linhas = []; for (let v = topo; v >= 0; v -= passo) linhas.push(v);
  const media = (d.total / d.horas.length).toFixed(1).replace('.', ',').replace(',0', '');
  const hh = (h) => `${String(h).padStart(2, '0')}h`;
  el.innerHTML = `
    ${dias.length > 1 ? `<div class="dias" role="tablist">${dias.map((x) => `<button type="button" data-dia="${x.chave}" aria-selected="${x === d}">Dia ${x.numero}<small>${x.semana} ${x.rotulo}</small></button>`).join('')}</div>` : ''}
    <div class="horas-resumo">
      <span><b>${d.total}</b> ${d.total === 1 ? 'participação' : 'participações'}${dias.length === 1 ? ` em ${d.rotulo}` : ''}</span>
      <span>Pico <b class="ouro">${hh(d.pico.h)}</b> · ${d.pico.n}</span>
      <span>Média <b>${media}</b> por hora</span>
    </div>
    <div class="horas-graf" style="--linhas:${linhas.length - 1}">
      <div class="eixo">${linhas.map((v) => `<span>${v}</span>`).join('')}</div>
      <div class="colunas">${d.horas.map((h, i) => `<div class="bv${h.h === d.pico.h && h.n ? ' pico' : ''}${h.n ? '' : ' zero'}" title="${hh(h.h)}: ${h.n} ${h.n === 1 ? 'participação' : 'participações'}"><i style="height:${(h.n / topo) * 100}%;--i:${i}">${h.n ? `<b>${h.n}</b>` : ''}</i><span>${hh(h.h)}</span></div>`).join('')}</div>
    </div>`;
}
$('#g-horas').addEventListener('click', (e) => { const b = e.target.closest('[data-dia]'); if (b) { diaGrafico = b.dataset.dia; graficoHoras(); } });

// ---------- tabela ----------
$('#busca').addEventListener('input', tabela);
$('#filtro').addEventListener('change', tabela);
// A lista do painel é a base de CONTATOS: uma linha por pessoa (pelo WhatsApp), juntando as partidas dela.
function agruparPessoas(base) {
  const m = new Map();
  base.forEach((l) => {
    const k = l.whatsapp || l.id;
    const p = m.get(k) || { id: k, partidas: [], placas: new Set(), cupons: [], assoc: false, primeira: l.clientTime, ultima: l.clientTime };
    p.partidas.push(l); if (l.placa) p.placas.add(l.placa); if (l.ganhouChopp && l.codigo) p.cupons.push(l.codigo);
    p.assoc = p.assoc || !!l.associado; p.primeira = Math.min(p.primeira, l.clientTime); p.ultima = Math.max(p.ultima, l.clientTime);
    m.set(k, p);
  });
  return [...m.values()].map((p) => {
    const ordem = [...p.partidas].sort((x, y) => y.clientTime - x.clientTime);
    const recente = ordem[0];
    const melhor = ordem.find((l) => l.ganhouChopp) || [...ordem].sort((x, y) => acertosDec(y) - acertosDec(x))[0];
    return { ...p, nome: recente.nome, whatsapp: recente.whatsapp, recente, melhor, chopps: ordem.filter((l) => l.ganhouChopp).length, placas: [...p.placas] };
  });
}
function filtrados() {
  const q = $('#busca').value.trim().toLowerCase();
  const f = $('#filtro').value;
  const pessoas = agruparPessoas(f === 'incompletos' ? incompletos : leads);
  return pessoas.filter((p) => {
    if (f === 'prospects' && !(!p.assoc && p.placas.length)) return false;
    if (f === 'placa-repetida' && !p.placas.some((x) => (placasCache.get(x) || []).length > 1)) return false;
    if (f === 'sem-placa' && p.placas.length) return false;
    if (f === 'chopp' && !p.chopps) return false;
    if (f === 'assoc' && !p.assoc) return false;
    if (f === 'nao-assoc' && p.assoc) return false;
    if (!q) return true;
    const qd = q.replace(/\D/g, '');
    return [p.nome, ...p.placas, ...p.cupons].some((v) => String(v || '').toLowerCase().includes(q))
      || (qd.length >= 3 && String(p.whatsapp || '').includes(qd));
  }).sort((a, b) => b.ultima - a.ultima);
}
const iniciais = (n) => String(n || '?').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?';
const quando = (t) => {
  const d = new Date(t); const hoje = new Date();
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje.toDateString() ? `hoje, ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
};
// Bolinhas de acerto: verde no aquecimento, dourado valendo chopp (vazia = errou).
function pontos(l) {
  const rs = l.respostas || [];
  if (!rs.length) return '';
  return `<span class="pontos" title="Verde: aquecimento · Dourado: valendo chopp">${rs.map((r) => `<i class="${r.acertou ? 'ok' : ''} ${r.valeChopp ? 'vale' : ''}"></i>`).join('')}</span>`;
}
function tabela() {
  const ls = filtrados();
  const desist = $('#filtro').value === 'incompletos';
  $('#vazio').hidden = ls.length > 0;
  $('#lista-info').textContent = desist
    ? `${ls.length} ${ls.length === 1 ? 'desistência' : 'desistências'}`
    : `${ls.length} ${ls.length === 1 ? 'contato' : 'contatos'}`;
  $('#tabela').innerHTML = ls.map((p, i) => {
    const l = p.recente;
    const placaCel = `<div class="placa-cel">${p.placas.length
      ? p.placas.map((x) => { const v = (placasCache.get(x) || []).length; return `<span class="placa-mini">${esc(x)}</span>${v > 1 ? `<span class="tag alerta" title="Placa usada em ${v} participações">repetida ×${v}</span>` : ''}`; }).join('')
      : `<span class="tag">${esc(STATUS_PLACA[statusPlaca(l)] || 'sem placa')}</span>`}</div>`;
    const whats = p.whatsapp ? `<a class="btn-whats" href="${linkWhats(p.whatsapp)}" target="_blank" rel="noopener" title="Abrir conversa no WhatsApp"><svg><use href="#p-whats"/></svg>${fmtWhats(p.whatsapp)}</a>` : '<span class="sub-tab">—</span>';
    const assoc = p.assoc ? '<span class="tag sim">Sim</span>' : '<span class="tag">Não</span>';
    const tags = [
      !desist && !p.assoc && p.placas.length ? '<span class="tag prospect" title="Não associado e com veículo">prospect</span>' : '',
      p.partidas.length > 1 ? `<span class="tag">jogou ${p.partidas.length}x</span>` : '',
      desist ? '<span class="tag alerta">desistiu</span>' : '',
    ].join('');
    const pessoa = `<div class="pessoa"><span class="avatar ${p.chopps ? 'ouro' : desist ? 'cinza' : ''}">${esc(iniciais(p.nome))}</span><span class="pessoa-txt"><b>${p.nome ? esc(p.nome) : 'Sem autorização LGPD'}</b><span class="tags">${tags}</span></span></div>`;
    const inicio = `<td class="c-pessoa">${pessoa}</td><td class="c-whats">${whats}</td><td class="c-placa">${placaCel}</td><td class="c-assoc">${assoc}</td>`;
    if (desist) {
      return `<tr class="linha-incompleta" style="--i:${Math.min(i, 20)}">${inicio}
      <td class="c-motivo" colspan="2"><small class="sub-tab">Parou em: ${esc(l.etapa || '')} · ${esc(fmtMotivo(l.motivo))}${l.lgpd ? '' : ' · não autorizou contato'}</small></td>
      <td class="c-quando"><span class="quando">${quando(p.primeira)}</span></td></tr>`;
    }
    const m = p.melhor;
    return `<tr style="--i:${Math.min(i, 20)}">${inicio}
      <td class="c-acertos"><div class="acertos">${pontos(m)}<small>${acertosDec(m)}/${totalDec(m)} valendo chopp</small></div></td>
      <td class="c-chopp">${p.chopps ? `<span class="ganhou"><span class="selo-chopp"><svg><use href="#p-chopp"/></svg>Ganhou</span>${p.cupons.map((c) => `<span class="cupom" title="Código do cupom">${esc(c)}</span>`).join('')}</span>` : `<span class="nao-ganhou">${m.choppEsgotado ? 'Acertou (esgotado)' : 'Não ganhou'}</span>`}</td>
      <td class="c-quando"><span class="quando">${quando(p.primeira)}</span></td>
    </tr>`;
  }).join('');
}

// ---------- relatórios (Excel e resumo do WhatsApp ficam em relatorio.js) ----------
const contexto = () => ({
  leads, incompletos, stats, config, metricas, estatisticaPerguntas, placas: placasCache, vezesPlaca, ehProspect,
  statusPlacaTxt: (l) => (l.placa ? l.placa : ({ 'nao-lembra': 'Não lembra', 'sem-veiculo': 'Sem veículo', 'nao-informar': 'Não informou', incompleta: 'Incompleta' }[l.placaStatus] || '—')),
  fmtWhats, linkWhats, acertosAq, totalAq, acertosDec, totalDec, fmtMotivo,
});
async function exportar() {
  const { blob, nome } = await gerarExcel(contexto());
  baixarArquivo(blob, nome); return nome;
}
document.querySelectorAll('[data-exportar]').forEach((b) => b.addEventListener('click', async () => {
  b.disabled = true;
  try { await exportar(); toast('Excel baixado.'); } catch (e) { console.error(e); toast('Não foi possível gerar o Excel.'); }
  b.disabled = false;
}));
const textoResumo = () => textoWhats(contexto());

// ---------- enviar relatório no WhatsApp: pede o número de quem vai receber ----------
const DESTINOS = 'eg_painel_destinos';
const lerDestinos = () => { try { return JSON.parse(localStorage.getItem(DESTINOS) || '[]').filter((d) => /^\d{10,11}$/.test(d)); } catch { return []; } };
function guardarDestino(d) {
  const lista = [d, ...lerDestinos().filter((x) => x !== d)].slice(0, 4);
  try { localStorage.setItem(DESTINOS, JSON.stringify(lista)); } catch { /* sem storage: só não lembra */ }
}
function mascararWhats(v) {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
function abrirEnvio() {
  const recentes = lerDestinos();
  $('#env-whats').value = recentes[0] ? mascararWhats(recentes[0]) : '';
  $('#env-erro').textContent = '';
  $('#env-recentes').innerHTML = recentes.map((d) => `<button type="button" class="chip" data-destino="${d}"><svg><use href="#p-whats"/></svg>${fmtWhats(d)}</button>`).join('');
  $('#env-recentes').hidden = !recentes.length;
  $('#dlg-enviar').hidden = false;
  setTimeout(() => { const i = $('#env-whats'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 60);
}
function destinoValido() {
  const d = $('#env-whats').value.replace(/\D/g, '');
  if (!/^[1-9]\d9?\d{8}$/.test(d) || (d.length === 11 && d[2] !== '9')) {
    $('#env-erro').textContent = 'Digite o WhatsApp com DDD de quem vai receber, ex.: (81) 99999-9999.'; $('#env-whats').focus(); return null;
  }
  guardarDestino(d); return d;
}
$('#btn-resumo').addEventListener('click', abrirEnvio);
$('#env-cancelar').addEventListener('click', () => { $('#dlg-enviar').hidden = true; });
$('#env-whats').addEventListener('input', (e) => { e.target.value = mascararWhats(e.target.value); $('#env-erro').textContent = ''; });
$('#env-whats').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#env-resumo').click(); } });
$('#env-recentes').addEventListener('click', (e) => { const b = e.target.closest('[data-destino]'); if (b) { $('#env-whats').value = mascararWhats(b.dataset.destino); $('#env-erro').textContent = ''; } });
$('#env-resumo').addEventListener('click', () => {
  const d = destinoValido(); if (!d) return;
  window.open(linkWhats(d, textoResumo()), '_blank', 'noopener');
  $('#dlg-enviar').hidden = true; toast('Resumo pronto na conversa. É só tocar em enviar.');
});
$('#env-excel').addEventListener('click', async () => {
  const d = destinoValido(); if (!d) return;
  const texto = `*Relatório em Excel do Quiz Exclusive Gold* segue em anexo. 📎\n\n${textoResumo()}`;
  const celular = matchMedia('(pointer: coarse)').matches && !!navigator.canShare;
  // Computador: abre a conversa já no clique (o navegador não bloqueia) e baixa o arquivo para anexar.
  if (!celular) window.open(linkWhats(d, texto), '_blank', 'noopener');
  try {
    const { blob, nome } = await gerarExcel(contexto());
    if (celular) {
      const arquivo = new File([blob], nome, { type: blob.type });
      if (navigator.canShare({ files: [arquivo] })) {
        try { await navigator.share({ files: [arquivo], text: texto }); $('#dlg-enviar').hidden = true; toast('Escolha a conversa no WhatsApp para enviar o Excel.'); return; } catch (e) { if (e?.name === 'AbortError') return; }
      }
      window.open(linkWhats(d, texto), '_blank', 'noopener');
    }
    baixarArquivo(blob, nome);
    $('#dlg-enviar').hidden = true; toast('Excel baixado. Na conversa do WhatsApp, toque no clipe e anexe o arquivo.');
  } catch (e) { console.error(e); $('#env-erro').textContent = 'Não foi possível gerar o Excel. Tente de novo.'; }
});

// ---------- configurações (só o que se usa no evento; regras e perguntas são fixas no sistema) ----------
function carregarRascunho() {
  $('#c-pausado').checked = !!config.pausado;
  $('#c-som').checked = config.som !== false;
  if (document.activeElement !== $('#c-limite')) $('#c-limite').value = config.limiteChopps ?? 0;
}

// Pausar e som valem na hora, sem precisar salvar.
async function alternar(campo, el, msgSim, msgNao) {
  try { await salvarConfig({ ...config, [campo]: el.checked }); toast(el.checked ? msgSim : msgNao); }
  catch { el.checked = !el.checked; toast('Não foi possível alterar. Verifique a conexão.'); }
}
$('#c-pausado').addEventListener('change', (e) => alternar('pausado', e.target, 'Quiz pausado no totem.', 'Quiz reativado no totem.'));
$('#c-som').addEventListener('change', (e) => alternar('som', e.target, 'Sons do totem ligados.', 'Sons do totem desligados.'));

async function salvarLimite() {
  const v = Math.max(0, parseInt($('#c-limite').value, 10) || 0);
  $('#c-limite').value = v;
  try { await salvarConfig({ ...config, limiteChopps: v }); toast(v ? `Limite salvo: ${v} chopps.` : 'Sem limite de chopps.'); }
  catch { toast('Não foi possível salvar. Verifique a conexão.'); }
}
$('#c-limite-salvar').addEventListener('click', salvarLimite);
$('#c-limite').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); salvarLimite(); } });

// Limpar tudo (para apagar os testes antes do evento). Senha 123 + confirmação, para não apagar sem querer.
const SENHA_LIMPAR = '123';
function abrirLimpeza() {
  $('#limpar-senha').value = ''; $('#limpar-ciente').checked = false; $('#limpar-erro').textContent = '';
  $('#limpar-resumo').textContent = `${leads.length} participações, ${incompletos.length} desistências e ${Math.max(stats.chopps, 0)} chopps no contador.`;
  $('#dlg-limpar').hidden = false; setTimeout(() => $('#limpar-senha').focus(), 50);
}
$('#c-limpar').addEventListener('click', abrirLimpeza);
$('#limpar-cancelar').addEventListener('click', () => { $('#dlg-limpar').hidden = true; });
$('#limpar-excel').addEventListener('click', () => exportar().catch(() => toast('Não foi possível gerar o Excel.')));
$('#limpar-confirmar').addEventListener('click', async () => {
  const erro = $('#limpar-erro');
  if ($('#limpar-senha').value !== SENHA_LIMPAR) { erro.textContent = 'Senha incorreta.'; $('#limpar-senha').select(); return; }
  if (!$('#limpar-ciente').checked) { erro.textContent = 'Marque a confirmação de que entende que tudo será apagado.'; return; }
  const b = $('#limpar-confirmar'); b.disabled = true; b.textContent = 'Apagando...';
  try {
    const n = await limparTudo(config);
    $('#dlg-limpar').hidden = true; toast(`Pronto: ${n} registros apagados. Os totens também vão limpar a cópia local.`);
  } catch (e) { console.error(e); erro.textContent = 'Não foi possível apagar. Verifique a conexão e tente de novo.'; }
  b.disabled = false; b.textContent = 'Apagar tudo';
});


// ---------- início ----------
observarLogin((u) => {
  desligar.forEach((f) => f()); desligar = [];
  $('#login').hidden = !!u; $('#app').hidden = !u; $('#topo').hidden = !u;
  if (!u) ligarEgonLogin();
  $('#btn-sair').hidden = !u || modoDemo; $('#ao-vivo').hidden = !u || modoDemo;
  if (!u) return;
  requestAnimationFrame(moverPilula);
  const ligarLeads = () => {
    const parar = observarLeads((l) => { $('#aviso-nuvem').hidden = true; todosLeads = l; separarLeads(); render(); }, () => {
      $('#aviso-nuvem').hidden = false;
      const t = setTimeout(ligarLeads, 120000); desligar.push(() => clearTimeout(t));
    });
    desligar.push(() => parar());
  };
  ligarLeads();
  desligar.push(observarStats((s) => { stats = s; render(); }));
  desligar.push(observarConfig((c) => { config = c; if (!editando) carregarRascunho(); separarLeads(); render(); }));
});
