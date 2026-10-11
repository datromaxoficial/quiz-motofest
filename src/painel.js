import { utils, writeFile } from 'xlsx';
import {
  modoDemo, DEFAULT_CONFIG, aplicarRegraChopp, observarConfig, salvarConfig, observarStats, zerarChopps,
  observarLeads, observarLogin, entrar, sair, marcarEntregue,
} from './data.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtWhats = (d) => (d?.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d?.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d || '');
const linkWhats = (d, texto) => `https://wa.me/55${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
const dataHora = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

let leads = [];
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
  try { await entrar($('#l-email').value.trim(), $('#l-senha').value); } catch { $('#l-erro').textContent = 'E-mail ou senha incorretos.'; }
});
$('#btn-sair').onclick = () => sair();

// ---------- abas ----------
document.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-aba]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  document.querySelectorAll('.aba').forEach((a) => { a.hidden = a.id !== `aba-${b.dataset.aba}`; });
}));

// ---------- métricas ----------
function metricas() {
  const total = leads.length;
  const unicos = new Set(leads.map((l) => l.whatsapp)).size;
  const chopps = leads.filter((l) => l.ganhouChopp).length;
  const entregues = leads.filter((l) => l.ganhouChopp && l.entregue).length;
  const assoc = leads.filter((l) => l.associado).length;
  const resp = leads.flatMap((l) => l.respostas || []);
  const acertos = resp.filter((r) => r.acertou).length;
  return { total, unicos, chopps, entregues, pendentes: chopps - entregues, assoc, naoAssoc: total - assoc, acertoMedio: pct(acertos, resp.length) };
}

function render() {
  const m = metricas();
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

function graficoPerguntas() {
  const el = $('#g-perguntas');
  const ps = config.perguntas;
  if (!leads.length) { el.innerHTML = '<p class="sem-dados">Os gráficos aparecem com as primeiras participações.</p>'; return; }
  el.innerHTML = ps.map((p, i) => {
    const rs = leads.map((l) => (l.respostas || []).find((r) => r.pergunta === i + 1)).filter(Boolean);
    const v = pct(rs.filter((r) => r.acertou).length, rs.length);
    return `<div class="bh ${p.valeChopp ? 'chopp' : ''}"><b>P${i + 1}</b><div class="trilho"><i style="width:${v}%"></i></div><span class="valor">${v}%</span><span class="rotulo">${esc(p.texto)}</span></div>`;
  }).join('') + '<div class="legenda"><span><i style="background:var(--azul)"></i>Aquecimento</span><span><i style="background:var(--ouro)"></i>Valendo chopp</span></div>';
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
  return leads.filter((l) => {
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
    const msg = `Olá, ${l.nome.split(' ')[0]}! Aqui é da Exclusive Gold. Obrigado por participar do nosso quiz no Motofest!`;
    return `<tr>
      <td>${dataHora(l.clientTime)}</td>
      <td>${esc(l.nome)}${l.repetido ? '<span class="tag">jogou de novo</span>' : ''}</td>
      <td><a href="${linkWhats(l.whatsapp, msg)}" target="_blank" rel="noopener">${fmtWhats(l.whatsapp)}</a></td>
      <td>${esc(l.placa)}</td>
      <td>${l.associado ? '<span class="tag sim">Sim</span>' : 'Não'}</td>
      <td>${l.acertos}/${l.total || (l.respostas || []).length}</td>
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
  const ps = config.perguntas;
  const linhas = [...leads].sort((a, b) => a.clientTime - b.clientTime).map((l) => {
    const d = new Date(l.clientTime);
    const linha = {
      Data: d.toLocaleDateString('pt-BR'), Hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      Nome: l.nome, WhatsApp: fmtWhats(l.whatsapp), 'Link WhatsApp': linkWhats(l.whatsapp),
      'Associado EG': l.associado ? 'Sim' : 'Não', Placa: l.placa,
      Acertos: `${l.acertos}/${l.total || (l.respostas || []).length}`,
      'Ganhou chopp': l.ganhouChopp ? 'Sim' : l.choppEsgotado ? 'Acertou (esgotado)' : 'Não',
      'Código do cupom': l.codigo || '',
      'Chopp entregue': l.ganhouChopp ? (l.entregue ? 'Sim' : 'Não') : '',
      'Entregue em': l.entregue && l.entregueEm ? new Date(l.entregueEm).toLocaleString('pt-BR') : '',
      'Jogou de novo': l.repetido ? 'Sim' : 'Não',
      'Aceite LGPD': l.lgpd ? 'Sim' : 'Não',
    };
    const n = Math.max(ps.length, (l.respostas || []).length);
    for (let i = 0; i < n; i++) {
      const r = (l.respostas || []).find((x) => x.pergunta === i + 1);
      linha[`P${i + 1}`] = r ? `${r.acertou ? '✓' : '✗'} ${r.resposta ?? ''}`.trim() : '';
    }
    return linha;
  });
  const ws = utils.json_to_sheet(linhas.length ? linhas : [{ Aviso: 'Sem participações ainda' }]);
  ws['!cols'] = Object.keys(linhas[0] || { Aviso: 1 }).map((k) => ({ wch: ['Nome', 'Link WhatsApp'].includes(k) ? 30 : k.startsWith('P') && k.length <= 3 ? 34 : 14 }));
  const m = metricas();
  const resumo = utils.aoa_to_sheet([
    ['Quiz Exclusive Gold · Motofest'], [],
    ['Participações', m.total], ['Pessoas diferentes', m.unicos], ['Chopps ganhos', stats.chopps],
    ['Chopps entregues', m.entregues], ['Cupons aguardando entrega', m.pendentes],
    ['Associados EG', `${m.assoc} (${pct(m.assoc, m.total)}%)`], ['Não associados', m.naoAssoc], ['Acerto médio', `${m.acertoMedio}%`], [],
    ['Pergunta', 'Acertos'],
    ...ps.map((p, i) => {
      const rs = leads.map((l) => (l.respostas || []).find((r) => r.pergunta === i + 1)).filter(Boolean);
      return [`P${i + 1}. ${p.texto}`, `${pct(rs.filter((r) => r.acertou).length, rs.length)}%`];
    }),
  ]);
  resumo['!cols'] = [{ wch: 70 }, { wch: 16 }];
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Participantes');
  utils.book_append_sheet(wb, resumo, 'Resumo');
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
    `Acerto médio: ${m.acertoMedio}%`,
    '',
    `Painel: ${location.href.split('#')[0]}`,
  ].join('\n');
  window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, '_blank', 'noopener');
});

// ---------- configurações ----------
const clonar = (o) => JSON.parse(JSON.stringify(o));
function carregarRascunho() {
  rascunho = clonar(config);
  $('#c-pausado').checked = !!rascunho.pausado;
  $('#c-som').checked = rascunho.som !== false;
  $('#c-limite').value = rascunho.limiteChopps ?? 0;
  renderPerguntas();
  marcar(false);
}
function marcar(sujo) { editando = sujo; $('#c-msg').textContent = sujo ? 'Alterações não salvas' : ''; }

function renderPerguntas() {
  const box = $('#c-perguntas');
  box.innerHTML = rascunho.perguntas.map((p, i) => `
    <div class="pergunta ${p.valeChopp ? 'vale' : ''}" data-i="${i}">
      <div class="p-topo">
        <b>Pergunta ${i + 1}</b>
        ${p.valeChopp ? '<span class="tag chopp">🍺 Vale chopp</span>' : '<span class="tag">Aquecimento</span>'}
        <button class="link" data-remover>Remover</button>
      </div>
      <textarea data-campo="texto" rows="2">${esc(p.texto)}</textarea>
      ${p.opcoes.map((o, k) => `
        <div class="opc">
          <input type="radio" name="certa-${i}" data-certa="${k}" ${p.correta === k ? 'checked' : ''} title="Resposta certa">
          <input type="text" data-opcao="${k}" value="${esc(o)}" placeholder="Opção ${'ABCD'[k]}">
          ${p.opcoes.length > 2 ? `<button class="link" data-tirar="${k}" title="Remover opção">×</button>` : ''}
        </div>`).join('')}
      ${p.opcoes.length < 4 ? '<button class="link add-opc" data-add-opc>+ opção</button>' : ''}
    </div>`).join('');
}

$('#c-perguntas').addEventListener('input', (e) => {
  const card = e.target.closest('.pergunta'); if (!card) return;
  const p = rascunho.perguntas[+card.dataset.i];
  if (e.target.dataset.campo === 'texto') p.texto = e.target.value;
  if (e.target.dataset.opcao) p.opcoes[+e.target.dataset.opcao] = e.target.value;
  marcar(true);
});
$('#c-perguntas').addEventListener('change', (e) => {
  const card = e.target.closest('.pergunta'); if (!card) return;
  const p = rascunho.perguntas[+card.dataset.i];
  if (e.target.dataset.certa) p.correta = +e.target.dataset.certa;
  marcar(true);
});
$('#c-perguntas').addEventListener('click', (e) => {
  const card = e.target.closest('.pergunta'); if (!card) return;
  const i = +card.dataset.i; const p = rascunho.perguntas[i];
  if (e.target.matches('[data-remover]')) {
    if (rascunho.perguntas.length <= 1) return toast('O quiz precisa de pelo menos 1 pergunta.');
    if (!confirm(`Remover a pergunta ${i + 1}?`)) return;
    rascunho.perguntas.splice(i, 1);
    rascunho.perguntas = aplicarRegraChopp(rascunho.perguntas);
  } else if (e.target.dataset.tirar) {
    const k = +e.target.dataset.tirar; p.opcoes.splice(k, 1);
    if (p.correta === k) p.correta = 0; else if (p.correta > k) p.correta -= 1;
  } else if (e.target.matches('[data-add-opc]')) {
    p.opcoes.push('');
  } else return;
  renderPerguntas(); marcar(true);
});
$('#c-add').addEventListener('click', () => {
  rascunho.perguntas = aplicarRegraChopp([...rascunho.perguntas, { tag: '', texto: '', opcoes: ['', '', ''], correta: 0 }]);
  renderPerguntas(); marcar(true);
});
$('#c-limite').addEventListener('input', () => { rascunho.limiteChopps = Math.max(0, parseInt($('#c-limite').value, 10) || 0); marcar(true); });
$('#c-restaurar').addEventListener('click', () => {
  if (!confirm('Voltar para as 5 perguntas originais do briefing?')) return;
  rascunho.perguntas = clonar(DEFAULT_CONFIG.perguntas); renderPerguntas(); marcar(true);
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
  const ps = rascunho.perguntas;
  const ruim = ps.findIndex((p) => !p.texto.trim() || p.opcoes.some((o) => !o.trim()));
  if (ruim >= 0) return toast(`Preencha o texto e todas as opções da pergunta ${ruim + 1}.`);
  ps.forEach((p) => { p.texto = p.texto.trim(); p.opcoes = p.opcoes.map((o) => o.trim()); });
  rascunho.perguntas = aplicarRegraChopp(ps);
  try {
    await salvarConfig({ ...rascunho, pausado: config.pausado, som: config.som });
    marcar(false); toast('Configurações salvas. O totem já está usando.');
  } catch { toast('Não foi possível salvar. Verifique a conexão.'); }
});

$('#c-zerar').addEventListener('click', async () => {
  if (!confirm('Zerar o contador de chopps entregues? As participações continuam salvas.')) return;
  try { await zerarChopps(); toast('Contador zerado.'); } catch { toast('Não foi possível zerar.'); }
});

// ---------- início ----------
observarLogin((u) => {
  desligar.forEach((f) => f()); desligar = [];
  $('#login').hidden = !!u; $('#app').hidden = !u;
  $('#btn-sair').hidden = !u || modoDemo; $('#ao-vivo').hidden = !u || modoDemo;
  if (!u) return;
  desligar.push(observarLeads((l) => { leads = l; render(); }));
  desligar.push(observarStats((s) => { stats = s; render(); }));
  desligar.push(observarConfig((c) => { config = c; if (!editando) carregarRascunho(); render(); }));
});
