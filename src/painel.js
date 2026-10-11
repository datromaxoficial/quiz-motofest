import { utils, writeFile } from 'xlsx';
import {
  modoDemo, DEFAULT_CONFIG, observarConfig, salvarConfig, observarStats, zerarChopps,
  observarLeads, observarLogin, entrar, sair, marcarEntregue, limparTudo, recuperarSenha,
} from './data.js';
import { normalizarRegras, validarRegras, validarPergunta } from './regras.js';
import { BANCO_PADRAO } from './banco.js';
import { criarEgonMini } from './egon-mini.js';

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
  const b = $('#form-login button[type="submit"]'); b.disabled = true; b.textContent = 'Entrando...';
  try { await entrar($('#l-email').value.trim(), $('#l-senha').value); egonLogin?.acao('comemorar', 900); egonLogin?.expressao('estrela'); } catch (err) { $('#l-erro').textContent = mensagemLogin(err); egonLogin?.acao('triste', 1600); egonLogin?.expressao('triste'); egonLogin?.gesto('susto'); }
  b.disabled = false; b.textContent = 'Entrar';
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
$('#l-esqueci').addEventListener('click', async () => {
  const email = $('#l-email').value.trim();
  if (!email) { $('#l-erro').textContent = 'Digite seu e-mail acima e toque de novo em "Esqueci minha senha".'; return; }
  try { await recuperarSenha(email); $('#l-erro').textContent = ''; toast('Enviamos um link para criar uma nova senha. Confira o e-mail (e o spam).'); }
  catch (err) { $('#l-erro').textContent = mensagemLogin(err); }
});

// ---------- abas ----------
document.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-aba]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.aba').forEach((a) => { a.hidden = a.id !== `aba-${b.dataset.aba}`; });
}));

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
  const entregues = leads.filter((l) => l.ganhouChopp && l.entregue).length;
  const assoc = leads.filter((l) => l.associado).length;
  const resp = leads.flatMap((l) => l.respostas || []);
  const acertos = resp.filter((r) => r.acertou).length;
  const repetidas = [...placasCache.values()].filter((ls) => ls.length > 1);
  const prospects = leads.filter(ehProspect).length;
  const semPlaca = leads.filter((l) => !l.placa).length;
  return { total, unicos, chopps, entregues, pendentes: chopps - entregues, assoc, naoAssoc: total - assoc, acertoMedio: pct(acertos, resp.length),
    placasRepetidas: repetidas.length, prospects, semPlaca, desistencias: incompletos.length };
}

function render() {
  placasCache = mapaPlacas();
  const m = metricas();
  $('#k-prospects').textContent = m.prospects;
  $('#k-prospects-n').textContent = `não associados com veículo · ${m.semPlaca} sem placa`;
  $('#k-repetidas').textContent = m.placasRepetidas;
  $('#k-desist').textContent = m.desistencias;
  $('#cont-part').textContent = m.total;
  $('#k-total').textContent = m.total;
  $('#k-unicos').textContent = `${m.unicos} ${m.unicos === 1 ? 'pessoa' : 'pessoas'}`;
  const limite = Number(config.limiteChopps) || 0;
  const entregues = Math.max(stats.chopps, 0);
  $('#k-chopps').textContent = entregues;
  $('#k-estoque').textContent = limite ? `de ${limite} · restam ${Math.max(limite - entregues, 0)}` : 'sem limite';
  $('#k-barra').style.width = limite ? `${Math.min(pct(entregues, limite), 100)}%` : '0';
  $('#k-assoc').textContent = `${pct(m.assoc, m.total)}%`;
  $('#k-assoc-n').textContent = `${m.assoc} associados · ${m.naoAssoc} não`;
  $('#k-entregues').textContent = m.entregues;
  $('#k-pendentes').textContent = m.pendentes ? `${m.pendentes} ${m.pendentes === 1 ? 'cupom aguardando' : 'cupons aguardando'} no balcão` : 'nenhum cupom pendente';
  $('#k-acerto').textContent = `${m.acertoMedio}%`;
  $('#c-ganhos').textContent = entregues;
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
  el.innerHTML = estatisticaPerguntas().map((e) => {
    const v = pct(e.ok, e.n);
    return `<div class="bh ${e.dec > e.n / 2 ? 'chopp' : ''}"><b>#${e.pos >= 0 ? e.pos + 1 : '?'}</b><div class="trilho"><i style="width:${v}%"></i></div><span class="valor">${v}% <small>(${e.n})</small></span><span class="rotulo">${esc(e.texto)}</span></div>`;
  }).join('') + '<div class="legenda"><span>% de acerto · (vezes respondida)</span><span><i style="background:var(--azul)"></i>Mais usada no aquecimento</span><span><i style="background:var(--ouro)"></i>Mais usada valendo chopp</span></div>';
}

function graficoHoras() {
  const el = $('#g-horas');
  if (!leads.length) { el.innerHTML = '<p class="sem-dados">Sem participações ainda.</p>'; return; }
  const por = new Map();
  leads.forEach((l) => { const d = new Date(l.clientTime); const k = `${d.toDateString()}|${d.getHours()}`; por.set(k, (por.get(k) || 0) + 1); });
  const chaves = [...por.keys()].sort((a, b) => new Date(a.split('|')[0]) - new Date(b.split('|')[0]) || a.split('|')[1] - b.split('|')[1]).slice(-14);
  const max = Math.max(...chaves.map((k) => por.get(k)));
  const dias = new Set(chaves.map((k) => k.split('|')[0])).size;
  el.innerHTML = chaves.map((k) => {
    const [dia, h] = k.split('|'); const v = por.get(k);
    const rot = dias > 1 ? `${new Date(dia).getDate()}/${h}h` : `${h}h`;
    return `<div class="bv"><b>${v}</b><i style="height:${(v / max) * 100}%"></i><span>${rot}</span></div>`;
  }).join('');
}

// ---------- tabela ----------
$('#busca').addEventListener('input', tabela);
$('#filtro').addEventListener('change', tabela);
function filtrados() {
  const q = $('#busca').value.trim().toLowerCase();
  const f = $('#filtro').value;
  const base = f === 'incompletos' ? incompletos : leads;
  return base.filter((l) => {
    if (f === 'prospects' && !ehProspect(l)) return false;
    if (f === 'placa-repetida' && vezesPlaca(l) < 2) return false;
    if (f === 'sem-placa' && l.placa) return false;
    if (f === 'chopp' && !l.ganhouChopp) return false;
    if (f === 'pendente' && !(l.ganhouChopp && !l.entregue)) return false;
    if (f === 'assoc' && !l.associado) return false;
    if (f === 'nao-assoc' && l.associado) return false;
    if (!q) return true;
    const qd = q.replace(/\D/g, '');
    return [l.nome, l.placa, l.codigo].some((v) => String(v || '').toLowerCase().includes(q))
      || (qd.length >= 3 && String(l.whatsapp || '').includes(qd));
  }).sort((a, b) => b.clientTime - a.clientTime);
}
function tabela() {
  const ls = filtrados();
  $('#vazio').hidden = ls.length > 0;
  $('#tabela').innerHTML = ls.map((l) => {
    const incompleto = l.status === 'incompleto';
    const msg = incompleto
      ? `Olá, ${(l.nome || '').split(' ')[0]}! Aqui é da Exclusive Gold. Vimos que você começou nosso quiz no Motofest. Quer terminar e concorrer ao chopp?`
      : `Olá, ${(l.nome || '').split(' ')[0]}! Aqui é da Exclusive Gold. Obrigado por participar do nosso quiz no Motofest!`;
    const vezes = vezesPlaca(l);
    const placaCel = l.placa
      ? `<span class="placa-mini">${esc(l.placa)}</span>${vezes > 1 ? `<span class="tag alerta" title="Placa usada em ${vezes} participações">repetida ×${vezes}</span>` : ''}`
      : `<span class="tag">${esc(STATUS_PLACA[statusPlaca(l)] || '—')}</span>`;
    if (incompleto) {
      return `<tr class="linha-incompleta">
      <td>${dataHora(l.clientTime)}</td>
      <td>${l.nome ? esc(l.nome) : '<i class="sub-tab">sem autorização LGPD</i>'}<span class="tag alerta">desistiu</span></td>
      <td>${l.whatsapp ? `<a href="${linkWhats(l.whatsapp, msg)}" target="_blank" rel="noopener">${fmtWhats(l.whatsapp)}</a>` : '—'}</td>
      <td>${placaCel}</td>
      <td>${l.associado ? '<span class="tag sim">Sim</span>' : 'Não'}</td>
      <td colspan="3"><small class="sub-tab">Parou em: ${esc(l.etapa || '')} · ${esc(fmtMotivo(l.motivo))}</small></td>
    </tr>`;
    }
    return `<tr>
      <td>${dataHora(l.clientTime)}</td>
      <td>${esc(l.nome)}${l.repetido ? '<span class="tag">jogou de novo</span>' : ''}${ehProspect(l) ? '<span class="tag prospect" title="Não associado e com veículo">prospect</span>' : ''}</td>
      <td><a href="${linkWhats(l.whatsapp, msg)}" target="_blank" rel="noopener">${fmtWhats(l.whatsapp)}</a></td>
      <td>${placaCel}</td>
      <td>${l.associado ? '<span class="tag sim">Sim</span>' : 'Não'}</td>
      <td><b>${acertosDec(l)}/${totalDec(l)}</b> <small class="sub-tab">valendo chopp</small><br><small class="sub-tab">aquec. ${acertosAq(l)}/${totalAq(l)}</small></td>
      <td>${l.ganhouChopp ? `<span class="tag chopp">🍺 Ganhou</span>${l.codigo ? `<span class="cupom">${esc(l.codigo)}</span>` : ''}` : l.choppEsgotado ? 'Acertou (esgotado)' : '-'}</td>
      <td>${l.ganhouChopp ? (l.entregue
    ? `<button class="tag sim entregue" data-entregar="${esc(l.id)}" data-v="0" title="Toque para desfazer">✓ Entregue ${l.entregueEm ? new Date(l.entregueEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''}</button>`
    : `<button class="btn primario mini" data-entregar="${esc(l.id)}" data-v="1">Entregar</button>`) : ''}</td>
    </tr>`;
  }).join('');
}

$('#tabela').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-entregar]'); if (!b) return;
  const sim = b.dataset.v === '1';
  const l = leads.find((x) => x.id === b.dataset.entregar);
  if (!sim && !confirm(`Desfazer a entrega do chopp de ${l?.nome || 'participante'}?`)) return;
  b.disabled = true;
  try { await marcarEntregue(b.dataset.entregar, sim); toast(sim ? 'Chopp marcado como entregue.' : 'Entrega desfeita.'); } catch { b.disabled = false; toast('Não foi possível salvar. Verifique a conexão.'); }
});

// ---------- Excel ----------
function exportar() {
  const linhas = [...leads].sort((a, b) => a.clientTime - b.clientTime).map((l) => {
    const d = new Date(l.clientTime);
    const linha = {
      Data: d.toLocaleDateString('pt-BR'), Hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      Nome: l.nome, WhatsApp: fmtWhats(l.whatsapp), 'Link WhatsApp': linkWhats(l.whatsapp),
      'Associado EG': l.associado ? 'Sim' : 'Não', Placa: l.placa || '',
      'Situação da placa': l.placa ? 'informada' : (STATUS_PLACA[statusPlaca(l)] || ''),
      'Placa usada (vezes)': l.placa ? vezesPlaca(l) : '',
      'Placa confirmada como repetida': l.placaRepetida ? 'Sim' : '',
      Prospect: ehProspect(l) ? 'Sim' : '',
      'Acertos aquecimento': `${acertosAq(l)}/${totalAq(l)}`,
      'Acertos valendo chopp': `${acertosDec(l)}/${totalDec(l)}`,
      'Ganhou chopp': l.ganhouChopp ? 'Sim' : l.choppEsgotado ? 'Acertou (esgotado)' : 'Não',
      'Código do cupom': l.codigo || '',
      'Chopp entregue': l.ganhouChopp ? (l.entregue ? 'Sim' : 'Não') : '',
      'Entregue em': l.entregue && l.entregueEm ? new Date(l.entregueEm).toLocaleString('pt-BR') : '',
      'Jogou de novo': l.repetido ? 'Sim' : 'Não',
      'Aceite LGPD': l.lgpd ? 'Sim' : 'Não',
      'Perguntas sorteadas': (l.perguntasIds || (l.respostas || []).map(idResposta)).join(', '),
    };
    (l.respostas || []).forEach((r, i) => {
      const etapa = r.valeChopp ? 'Chopp' : 'Aquecimento';
      linha[`P${i + 1}`] = `${r.acertou ? '✓' : '✗'} [${etapa}] ${r.texto} | Marcou: ${r.resposta ?? '-'}${r.acertou ? '' : ` | Certa: ${r.respostaCorreta ?? '-'}`}`;
    });
    return linha;
  });
  const ws = utils.json_to_sheet(linhas.length ? linhas : [{ Aviso: 'Sem participações ainda' }]);
  ws['!cols'] = Object.keys(linhas[0] || { Aviso: 1 }).map((k) => ({ wch: ['Nome', 'Link WhatsApp', 'Perguntas sorteadas'].includes(k) ? 30 : /^P\d+$/.test(k) ? 60 : 16 }));
  const m = metricas(); const r = normalizarRegras(config);
  const resumo = utils.aoa_to_sheet([
    ['Quiz Exclusive Gold · Motofest'],
    [`Regra: ${r.totalPerguntas} perguntas (${r.aquecimento} de aquecimento + ${r.decisivas} valendo chopp). Ganha quem acerta ${r.acertosParaGanhar} de ${r.decisivas}.`], [],
    ['Participações', m.total], ['Pessoas diferentes', m.unicos], ['Chopps ganhos', stats.chopps],
    ['Chopps entregues', m.entregues], ['Cupons aguardando entrega', m.pendentes],
    ['Associados EG', `${m.assoc} (${pct(m.assoc, m.total)}%)`], ['Não associados', m.naoAssoc], ['Acerto médio', `${m.acertoMedio}%`],
    ['Prospects (não associados com placa)', m.prospects], ['Participações sem placa', m.semPlaca], ['Placas usadas por mais de uma pessoa', m.placasRepetidas], ['Desistências', m.desistencias], [],
    ['Pergunta', 'Acerto', 'Vezes respondida'],
    ...estatisticaPerguntas().map((e) => [`#${e.pos >= 0 ? e.pos + 1 : '?'} ${e.texto}`, `${pct(e.ok, e.n)}%`, e.n]),
  ]);
  resumo['!cols'] = [{ wch: 80 }, { wch: 12 }, { wch: 16 }];
  const repetidas = [...placasCache.entries()].filter(([, ls]) => ls.length > 1).sort((a, b) => b[1].length - a[1].length)
    .map(([placa, ls]) => ({ Placa: placa, Vezes: ls.length, Nomes: ls.map((l) => l.nome).join(' / '), WhatsApps: ls.map((l) => fmtWhats(l.whatsapp)).join(' / '), 'Algum associado?': ls.some((l) => l.associado) ? 'Sim' : 'Não' }));
  const prospects = leads.filter(ehProspect).sort((a, b) => a.clientTime - b.clientTime)
    .map((l) => ({ Data: new Date(l.clientTime).toLocaleString('pt-BR'), Nome: l.nome, WhatsApp: fmtWhats(l.whatsapp), 'Link WhatsApp': linkWhats(l.whatsapp), Placa: l.placa, 'Placa usada (vezes)': vezesPlaca(l), 'Ganhou chopp': l.ganhouChopp ? 'Sim' : 'Não' }));
  const desist = [...incompletos].sort((a, b) => a.clientTime - b.clientTime)
    .map((l) => ({ Data: new Date(l.clientTime).toLocaleString('pt-BR'), 'Parou em': l.etapa || '', Motivo: fmtMotivo(l.motivo), Nome: l.nome || '', WhatsApp: fmtWhats(l.whatsapp), Placa: l.placa || '', 'Situação da placa': l.placa ? 'informada' : (STATUS_PLACA[l.placaStatus] || ''), 'Associado EG': l.associado ? 'Sim' : 'Não', 'Autorizou LGPD': l.lgpd ? 'Sim' : 'Não' }));
  const aba = (linhas, aviso) => utils.json_to_sheet(linhas.length ? linhas : [{ Aviso: aviso }]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Participantes');
  utils.book_append_sheet(wb, resumo, 'Resumo');
  utils.book_append_sheet(wb, aba(prospects, 'Nenhum não associado com placa ainda'), 'Prospects');
  utils.book_append_sheet(wb, aba(repetidas, 'Nenhuma placa repetida'), 'Placas repetidas');
  utils.book_append_sheet(wb, aba(desist, 'Nenhuma desistência'), 'Desistências');
  const hoje = new Date().toISOString().slice(0, 10);
  writeFile(wb, `quiz-exclusive-gold-${hoje}.xlsx`);
}
document.querySelectorAll('[data-exportar]').forEach((b) => b.addEventListener('click', exportar));

$('#btn-resumo').addEventListener('click', () => {
  const m = metricas();
  const txt = [
    '*Quiz Exclusive Gold · Motofest*',
    `Participações: ${m.total} (${m.unicos} pessoas)`,
    `Chopps ganhos: ${stats.chopps}${Number(config.limiteChopps) ? ` de ${config.limiteChopps}` : ''}`,
    `Chopps entregues: ${m.entregues} (aguardando: ${m.pendentes})`,
    `Associados EG: ${m.assoc} (${pct(m.assoc, m.total)}%)`,
    `Não associados: ${m.total - m.assoc}`,
    `Prospects (não associados com placa): ${m.prospects}`,
    `Placas repetidas: ${m.placasRepetidas}`,
    `Desistências: ${m.desistencias}`,
    `Acerto médio: ${m.acertoMedio}%`,
    '',
    `Painel: ${location.href.split('#')[0]}`,
  ].join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
});

// ---------- configurações ----------
const clonar = (o) => JSON.parse(JSON.stringify(o));
const REGRAS_CAMPOS = { totalPerguntas: '#c-total', aquecimento: '#c-aquec', decisivas: '#c-decis', acertosParaGanhar: '#c-acertos' };

function carregarRascunho() {
  rascunho = clonar(config);
  $('#c-pausado').checked = !!rascunho.pausado;
  $('#c-som').checked = rascunho.som !== false;
  $('#c-limite').value = rascunho.limiteChopps ?? 0;
  const r = normalizarRegras(rascunho);
  Object.entries(REGRAS_CAMPOS).forEach(([k, sel]) => { $(sel).value = r[k]; });
  $('#c-sorteio').checked = r.sorteio;
  renderPerguntas(); conferirRegras();
  marcar(false);
}
function marcar(sujo) { editando = sujo; $('#c-msg').textContent = sujo ? 'Alterações não salvas' : ''; }

const ativas = () => rascunho.banco.filter((p) => p.ativa !== false);
function conferirRegras() {
  const r = normalizarRegras(rascunho);
  const erros = validarRegras(r, ativas().length);
  const el = $('#c-regras-erro');
  el.innerHTML = erros.length ? erros.map((e) => `<li>${esc(e)}</li>`).join('')
    : `<li class="ok">Partida com ${r.totalPerguntas} perguntas: ${r.aquecimento} de aquecimento e ${r.decisivas} valendo chopp. Ganha quem acertar ${r.acertosParaGanhar >= r.decisivas ? `as ${r.decisivas}` : `${r.acertosParaGanhar} de ${r.decisivas}`}.</li>`;
  el.classList.toggle('tem-erro', erros.length > 0);
  $('#c-banco-info').textContent = `${rascunho.banco.length} perguntas no banco · ${ativas().length} ativas · ${r.sorteio
    ? `cada partida sorteia ${r.totalPerguntas} perguntas diferentes e embaralha as alternativas.`
    : `sem sorteio: o totem usa as ${r.totalPerguntas} primeiras perguntas ativas, nesta ordem.`}`;
  return erros;
}
Object.entries(REGRAS_CAMPOS).forEach(([k, sel]) => $(sel).addEventListener('input', () => {
  rascunho[k] = parseInt($(sel).value, 10); conferirRegras(); renderPerguntas(); marcar(true);
}));
$('#c-sorteio').addEventListener('change', (e) => { rascunho.sorteio = e.target.checked; conferirRegras(); renderPerguntas(); marcar(true); });

function papelSemSorteio(i) {
  const r = normalizarRegras(rascunho);
  if (r.sorteio || rascunho.banco[i].ativa === false) return '';
  const pos = rascunho.banco.slice(0, i + 1).filter((p) => p.ativa !== false).length - 1;
  if (pos < r.aquecimento) return '<span class="tag">Aquecimento</span>';
  if (pos < r.totalPerguntas) return '<span class="tag chopp">🍺 Vale chopp</span>';
  return '<span class="tag">Fora da partida</span>';
}

function renderPerguntas() {
  const box = $('#c-perguntas');
  box.innerHTML = rascunho.banco.map((p, i) => {
    const problema = validarPergunta(p);
    return `
    <div class="pergunta ${p.ativa === false ? 'inativa' : ''}" data-i="${i}">
      <div class="p-topo">
        <b>#${i + 1}</b>
        <input type="text" class="p-tag" data-campo="tag" value="${esc(p.tag || '')}" placeholder="Tema">
        ${papelSemSorteio(i)}
        <label class="p-ativa"><input type="checkbox" data-campo="ativa" ${p.ativa !== false ? 'checked' : ''}> Ativa</label>
        <button class="link" data-remover>Remover</button>
      </div>
      <textarea data-campo="texto" rows="2" placeholder="Enunciado">${esc(p.texto)}</textarea>
      ${p.opcoes.map((o, k) => `
        <div class="opc">
          <input type="radio" name="certa-${i}" data-certa="${k}" ${p.correta === k ? 'checked' : ''} title="Resposta certa">
          <input type="text" data-opcao="${k}" value="${esc(o)}" placeholder="Alternativa ${'ABCD'[k]}">
          ${p.opcoes.length > 2 ? `<button class="link" data-tirar="${k}" title="Remover alternativa">×</button>` : ''}
        </div>`).join('')}
      ${p.opcoes.length < 4 ? '<button class="link add-opc" data-add-opc>+ alternativa</button>' : ''}
      ${problema && p.ativa !== false ? `<p class="p-aviso">Atenção: ${esc(problema)}.</p>` : ''}
    </div>`;
  }).join('');
}

$('#c-perguntas').addEventListener('input', (e) => {
  const card = e.target.closest('.pergunta'); if (!card) return;
  const p = rascunho.banco[+card.dataset.i];
  if (e.target.dataset.campo === 'texto') p.texto = e.target.value;
  if (e.target.dataset.campo === 'tag') p.tag = e.target.value;
  if (e.target.dataset.opcao) p.opcoes[+e.target.dataset.opcao] = e.target.value;
  marcar(true);
});
$('#c-perguntas').addEventListener('change', (e) => {
  const card = e.target.closest('.pergunta'); if (!card) return;
  const p = rascunho.banco[+card.dataset.i];
  if (e.target.dataset.campo === 'ativa') { p.ativa = e.target.checked; renderPerguntas(); conferirRegras(); }
  if (e.target.dataset.certa) p.correta = +e.target.dataset.certa;
  if (e.target.dataset.campo === 'texto' || e.target.dataset.opcao) renderPerguntas();
  marcar(true);
});
$('#c-perguntas').addEventListener('click', (e) => {
  const card = e.target.closest('.pergunta'); if (!card) return;
  const i = +card.dataset.i; const p = rascunho.banco[i];
  if (e.target.matches('[data-remover]')) {
    if (!confirm(`Remover a pergunta #${i + 1} do banco? (Para só tirar do sorteio, desmarque "Ativa".)`)) return;
    rascunho.banco.splice(i, 1);
  } else if (e.target.dataset.tirar) {
    const k = +e.target.dataset.tirar; p.opcoes.splice(k, 1);
    if (p.correta === k) p.correta = 0; else if (p.correta > k) p.correta -= 1;
  } else if (e.target.matches('[data-add-opc]')) {
    p.opcoes.push('');
  } else return;
  renderPerguntas(); conferirRegras(); marcar(true);
});
$('#c-add').addEventListener('click', () => {
  rascunho.banco.push({ id: `nova-${Date.now().toString(36)}`, tag: '', texto: '', opcoes: ['', '', ''], correta: 0, ativa: true });
  renderPerguntas(); conferirRegras(); marcar(true);
  $('#c-perguntas').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('#c-limite').addEventListener('input', () => { rascunho.limiteChopps = Math.max(0, parseInt($('#c-limite').value, 10) || 0); marcar(true); });
$('#c-restaurar').addEventListener('click', () => {
  if (!confirm('Voltar o banco para as 20 perguntas padrão (5 do briefing + 15 novas)? Perguntas criadas aqui serão removidas.')) return;
  rascunho.banco = clonar(BANCO_PADRAO); renderPerguntas(); conferirRegras(); marcar(true);
});

// Pausar vale na hora, sem precisar salvar.
$('#c-pausado').addEventListener('change', async (e) => {
  try {
    await salvarConfig({ ...config, pausado: e.target.checked });
    rascunho.pausado = e.target.checked;
    toast(e.target.checked ? 'Quiz pausado no totem.' : 'Quiz reativado no totem.');
  } catch { e.target.checked = !e.target.checked; toast('Não foi possível alterar. Verifique a conexão.'); }
});

// Som do totem também vale na hora.
$('#c-som').addEventListener('change', async (e) => {
  try {
    await salvarConfig({ ...config, som: e.target.checked });
    rascunho.som = e.target.checked;
    toast(e.target.checked ? 'Sons do totem ligados.' : 'Sons do totem desligados.');
  } catch { e.target.checked = !e.target.checked; toast('Não foi possível alterar. Verifique a conexão.'); }
});

$('#c-salvar').addEventListener('click', async () => {
  const erros = conferirRegras();
  if (erros.length) { toast(erros[0]); $('#c-regras').scrollIntoView({ behavior: 'smooth' }); return; }
  rascunho.banco.forEach((p) => { p.texto = String(p.texto || '').trim(); p.tag = String(p.tag || '').trim(); p.opcoes = p.opcoes.map((o) => String(o || '').trim()); });
  const ruim = rascunho.banco.findIndex((p) => p.ativa !== false && validarPergunta(p));
  if (ruim >= 0) { renderPerguntas(); return toast(`Pergunta #${ruim + 1}: ${validarPergunta(rascunho.banco[ruim])}.`); }
  const r = normalizarRegras(rascunho);
  const { perguntas, ...semAntigo } = rascunho; void perguntas;
  try {
    await salvarConfig({ ...semAntigo, ...r, pausado: config.pausado, som: config.som });
    marcar(false); toast('Configurações salvas. O totem já está usando.');
  } catch { toast('Não foi possível salvar. Verifique a conexão.'); }
});

// Limpar tudo (para apagar os testes antes do evento). Senha 123 + confirmação, para não apagar sem querer.
const SENHA_LIMPAR = '123';
function abrirLimpeza() {
  $('#limpar-senha').value = ''; $('#limpar-ciente').checked = false; $('#limpar-erro').textContent = '';
  $('#limpar-resumo').textContent = `${leads.length} participações, ${incompletos.length} desistências e ${Math.max(stats.chopps, 0)} chopps no contador.`;
  $('#dlg-limpar').hidden = false; setTimeout(() => $('#limpar-senha').focus(), 50);
}
$('#c-limpar').addEventListener('click', abrirLimpeza);
$('#limpar-cancelar').addEventListener('click', () => { $('#dlg-limpar').hidden = true; });
$('#limpar-excel').addEventListener('click', exportar);
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

$('#c-zerar').addEventListener('click', async () => {
  if (!confirm('Zerar o contador de chopps ganhos? As participações continuam salvas.')) return;
  try { await zerarChopps(); toast('Contador zerado.'); } catch { toast('Não foi possível zerar.'); }
});

// ---------- início ----------
observarLogin((u) => {
  desligar.forEach((f) => f()); desligar = [];
  $('#login').hidden = !!u; $('#app').hidden = !u;
  if (!u) ligarEgonLogin();
  $('#btn-sair').hidden = !u || modoDemo; $('#ao-vivo').hidden = !u || modoDemo;
  if (!u) return;
  desligar.push(observarLeads((l) => { todosLeads = l; separarLeads(); render(); }));
  desligar.push(observarStats((s) => { stats = s; render(); }));
  desligar.push(observarConfig((c) => { config = c; if (!editando) carregarRascunho(); separarLeads(); render(); }));
});
