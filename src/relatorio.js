// Relatórios do painel: planilha Excel (para imprimir e arquivar depois do evento) e resumo para o WhatsApp.
// O Excel é o registro que fica quando o site sair do ar, então ele precisa se explicar sozinho.
import ExcelJS from 'exceljs';
import { BANCO_PADRAO } from './banco.js';

const EVENTO = 'Gravatá Motofest 2026';
const COR = { marinho: 'FF00142F', ouro: 'FFFFAB02', ouroClaro: 'FFFFF3D1', zebra: 'FFF3F6FB', borda: 'FFD5DDEA', texto: 'FF0B1A33', cinza: 'FF5B6B85', verde: 'FF1E8E50', verdeClaro: 'FFE3F6EA', vermelho: 'FFC23B3B', vermelhoClaro: 'FFFBE6E6', azul: 'FF1557D0', branco: 'FFFFFFFF' };

const doisDig = (n) => String(n).padStart(2, '0');
// Tudo no horário do evento (Gravatá-PE), igual ao cupom, independente do fuso do aparelho.
export const FUSO = 'America/Recife';
const fmtPartes = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const partes = (t) => { const o = {}; fmtPartes.formatToParts(new Date(t)).forEach((p) => { o[p.type] = p.value; }); return { ano: +o.year, mes: +o.month, dia: +o.day, hora: +o.hour % 24, min: +o.minute }; };
const dataBR = (t) => new Date(t).toLocaleDateString('pt-BR', { timeZone: FUSO });
export const horaBR = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const chaveDia = (t) => { const p = partes(t); return `${p.ano}-${doisDig(p.mes)}-${doisDig(p.dia)}`; };

// ---------- números por dia e por hora (usados no gráfico, no Excel e no resumo) ----------
export function porDiaHora(leads) {
  const dias = new Map();
  leads.forEach((l) => {
    const d = new Date(l.clientTime); const k = chaveDia(l.clientTime);
    const dia = dias.get(k) || { chave: k, rotulo: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO }), semana: d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: FUSO }).replace('.', ''), total: 0, chopps: 0, assoc: 0, prospects: 0, pessoas: new Set(), horas: new Map() };
    dia.total += 1; if (l.ganhouChopp) dia.chopps += 1; if (l.associado) dia.assoc += 1; if (!l.associado && l.placa) dia.prospects += 1;
    dia.pessoas.add(l.whatsapp);
    const h = partes(l.clientTime).hora; dia.horas.set(h, (dia.horas.get(h) || 0) + 1);
    dias.set(k, dia);
  });
  return [...dias.values()].sort((a, b) => a.chave.localeCompare(b.chave)).map((d, i) => {
    const hs = [...d.horas.keys()];
    const de = Math.min(...hs); const ate = Math.max(...hs);
    const horas = []; for (let h = de; h <= ate; h++) horas.push({ h, n: d.horas.get(h) || 0 });
    const pico = horas.reduce((m, x) => (x.n > m.n ? x : m), { h: de, n: 0 });
    return { ...d, numero: i + 1, pessoas: d.pessoas.size, horas, pico };
  });
}

// ---------- resumo para o WhatsApp ----------
export function textoWhats(c) {
  const m = c.metricas(); const dias = porDiaHora(c.leads);
  const limite = Number(c.config.limiteChopps) || 0; const ganhos = Math.max(c.stats.chopps, 0);
  const picoGeral = dias.flatMap((d) => d.horas.map((h) => ({ ...h, dia: d }))).reduce((a, b) => (b.n > (a?.n || 0) ? b : a), null);
  const agora = new Date();
  const L = [
    '*QUIZ EXCLUSIVE GOLD*',
    `_${dataBR(agora)} · ${horaBR(agora)}_`,
    '',
    `Participações: *${m.total}*`,
    `Chopps ganhos: *${ganhos}*${limite ? ` de ${limite}` : ''}`,
    `Desistências: *${m.desistencias}*`,
    '',
    `Associados: *${m.assoc}*`,
    `Não associados: *${m.naoAssoc}*`,
    `Prospects: *${m.prospects}*`,
    '',
    `Acerto médio: *${m.acertoMedio}%*`,
    ...(picoGeral ? [`Pico: *${doisDig(picoGeral.h)}h*${dias.length > 1 ? ` (${picoGeral.dia.rotulo})` : ''}`] : []),
  ];
  if (dias.length > 1) {
    L.push('');
    dias.forEach((d) => L.push(`Dia ${d.numero}: *${d.total}* participações · *${d.chopps}* chopps`));
  }
  if (location.protocol === 'https:') L.push('', `${location.origin}${location.pathname}`);
  return L.join('\n');
}

// ---------- Excel ----------
const borda = { style: 'thin', color: { argb: COR.borda } };
const bordas = { top: borda, left: borda, bottom: borda, right: borda };

// Cabeçalho padrão de cada aba: faixa da marca com título, subtítulo e a linha de colunas (repetida na impressão).
function prepararAba(wb, nome, titulo, colunas, { paisagem = true, descricao = '' } = {}) {
  const ws = wb.addWorksheet(nome, { properties: { defaultRowHeight: 18 }, views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] });
  ws.columns = colunas.map((c) => ({ key: c.chave, width: c.largura || 14 }));
  const n = colunas.length;
  ws.mergeCells(1, 1, 1, n); ws.mergeCells(2, 1, 2, n); ws.mergeCells(3, 1, 3, n);
  const t = ws.getCell(1, 1); t.value = `QUIZ EXCLUSIVE GOLD  ·  ${titulo.toUpperCase()}`;
  t.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COR.branco } };
  t.alignment = { vertical: 'middle', indent: 1 };
  const s = ws.getCell(2, 1); s.value = `${EVENTO}  ·  gerado em ${dataBR(Date.now())} às ${horaBR(Date.now())}`;
  s.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COR.ouro } }; s.alignment = { vertical: 'middle', indent: 1 };
  const d = ws.getCell(3, 1); d.value = descricao;
  d.font = { name: 'Calibri', size: 9, italic: true, color: { argb: COR.cinza } }; d.alignment = { vertical: 'middle', indent: 1, wrapText: true };
  [1, 2].forEach((r) => { for (let c = 1; c <= n; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.marinho } }; });
  ws.getRow(1).height = 32; ws.getRow(2).height = 18; ws.getRow(3).height = descricao ? 22 : 6;
  const cab = ws.getRow(4); cab.height = 30;
  colunas.forEach((c, i) => {
    const cel = cab.getCell(i + 1); cel.value = c.titulo;
    cel.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COR.marinho } };
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.ouro } };
    cel.alignment = { vertical: 'middle', horizontal: c.alinhar || 'left', wrapText: true, indent: c.alinhar === 'center' ? 0 : 1 };
    cel.border = bordas;
  });
  ws.pageSetup = { paperSize: 9, orientation: paisagem ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, horizontalCentered: true,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 }, printTitlesRow: '1:4' };
  ws.headerFooter = { oddFooter: `&L&8Quiz Exclusive Gold · ${EVENTO}&C&8${nome}&R&8Página &P de &N` };
  return ws;
}

// Linhas de dados com zebra, bordas finas, alinhamento e destaques.
function preencher(ws, colunas, linhas, { destaque, filtro = true } = {}) {
  linhas.forEach((dados, i) => {
    const row = ws.addRow(colunas.map((c) => dados[c.chave] ?? ''));
    row.height = 20;
    const realce = destaque?.(dados);
    row.eachCell({ includeEmpty: true }, (cel, col) => {
      const c = colunas[col - 1]; if (!c) return;
      cel.border = bordas;
      cel.font = { name: 'Calibri', size: 10, color: { argb: COR.texto }, ...(c.negrito ? { bold: true } : {}) };
      cel.alignment = { vertical: 'middle', horizontal: c.alinhar || 'left', wrapText: !!c.quebrar, indent: c.alinhar === 'center' ? 0 : 1 };
      const fundo = realce || (i % 2 ? COR.zebra : COR.branco);
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fundo } };
      if (c.formato) cel.numFmt = c.formato;
      if (c.link && dados[`${c.chave}_link`]) { cel.value = { text: String(dados[c.chave]), hyperlink: dados[`${c.chave}_link`] }; cel.font = { ...cel.font, color: { argb: COR.azul }, underline: true }; }
      const cor = dados[`${c.chave}_cor`]; if (cor) cel.font = { ...cel.font, bold: true, color: { argb: cor } };
    });
    if (colunas.some((c) => c.quebrar)) {
      const maior = Math.max(...colunas.filter((c) => c.quebrar).map((c) => Math.ceil(String(dados[c.chave] || '').length / Math.max(8, (c.largura || 14) * 1.05))));
      row.height = Math.max(20, maior * 14 + 6);
    }
  });
  if (!linhas.length) {
    const r = ws.addRow([]); ws.mergeCells(r.number, 1, r.number, colunas.length);
    const cel = ws.getCell(r.number, 1); cel.value = 'Nenhum registro.'; cel.font = { italic: true, color: { argb: COR.cinza } }; cel.alignment = { horizontal: 'center' };
    r.height = 26;
  } else if (filtro) {
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + linhas.length, column: colunas.length } };
  }
}

// Data/hora como valor de verdade (ordena e filtra no Excel), já no horário local.
// data/hora para o Excel (que não tem fuso): os números do horário do evento
const dataLocal = (t) => { const p = partes(t); return new Date(Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.min)); };

export async function gerarExcel(c) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Painel do Quiz Exclusive Gold'; wb.created = new Date(); wb.title = `Quiz Exclusive Gold · ${EVENTO}`;
  const m = c.metricas(); const dias = porDiaHora(c.leads);
  const leads = [...c.leads].sort((a, b) => a.clientTime - b.clientTime);
  const num = new Map(leads.map((l, i) => [l.id, i + 1]));
  const limite = Number(c.config.limiteChopps) || 0; const ganhos = Math.max(c.stats.chopps, 0);
  const caixa = '☐';

  // ===== Contatos: a base de dados captada (uma linha por pessoa) =====
  {
    const pessoas = new Map();
    leads.forEach((l) => {
      const p = pessoas.get(l.whatsapp) || { l, vezes: 0, chopps: 0, cupons: [], primeira: l.clientTime, ultima: l.clientTime, placas: new Set(), assoc: false };
      p.vezes += 1; if (l.ganhouChopp) { p.chopps += 1; if (l.codigo) p.cupons.push(l.codigo); }
      p.primeira = Math.min(p.primeira, l.clientTime); p.ultima = Math.max(p.ultima, l.clientTime);
      if (l.placa) p.placas.add(l.placa); p.assoc = p.assoc || !!l.associado; p.l = l; // dados mais recentes
      pessoas.set(l.whatsapp, p);
    });
    // quem desistiu e autorizou o contato também é contato captado
    c.incompletos.filter((l) => l.whatsapp && l.lgpd && !pessoas.has(l.whatsapp)).forEach((l) => {
      pessoas.set(l.whatsapp, { l, vezes: 0, chopps: 0, cupons: [], primeira: l.clientTime, ultima: l.clientTime, placas: new Set(l.placa ? [l.placa] : []), assoc: !!l.associado, desistiu: true });
    });
    const cols = [
      { chave: 'n', titulo: 'Nº', largura: 6, alinhar: 'center' },
      { chave: 'nome', titulo: 'Nome completo', largura: 32, negrito: true, quebrar: true },
      { chave: 'whats', titulo: 'WhatsApp', largura: 18, link: true },
      { chave: 'placa', titulo: 'Placa do veículo', largura: 14, alinhar: 'center' },
      { chave: 'assoc', titulo: 'Associado Exclusive Gold', largura: 13, alinhar: 'center' },
      { chave: 'perfil', titulo: 'Perfil', largura: 14 },
      { chave: 'vezes', titulo: 'Partidas', largura: 9, alinhar: 'center' },
      { chave: 'chopp', titulo: 'Chopp', largura: 16 },
      { chave: 'data', titulo: 'Cadastro', largura: 16, alinhar: 'center', formato: 'dd/mm/yyyy hh:mm' },
      { chave: 'lgpd', titulo: 'Autorizou contato (LGPD)', largura: 13, alinhar: 'center' },
      { chave: 'contato', titulo: 'Contato feito', largura: 9, alinhar: 'center' },
      { chave: 'anot', titulo: 'Anotações', largura: 30 },
    ];
    const ws = prepararAba(wb, 'Contatos', 'Base de contatos captados', cols, { descricao: 'Uma linha por pessoa. Toque no WhatsApp para conversar.' });
    const lista = [...pessoas.values()].sort((a, b) => a.primeira - b.primeira);
    preencher(ws, cols, lista.map((p, i) => {
      const l = p.l; const placas = [...p.placas];
      return {
        n: i + 1, nome: l.nome || '(não informado)', whats: c.fmtWhats(l.whatsapp), whats_link: c.linkWhats(l.whatsapp),
        placa: placas.length ? placas.join(' / ') : c.statusPlacaTxt(l),
        assoc: p.assoc ? 'Sim' : 'Não',
        perfil: p.assoc ? 'Associado' : placas.length ? 'Prospect' : 'Não associado', perfil_cor: p.assoc ? COR.azul : placas.length ? COR.verde : '',
        vezes: p.desistiu ? 'Desistiu' : p.vezes,
        chopp: p.chopps ? `Ganhou${p.cupons.length ? ` (${p.cupons.join(', ')})` : ''}` : (p.desistiu ? '-' : 'Não ganhou'), chopp_cor: p.chopps ? COR.verde : COR.cinza,
        data: dataLocal(p.primeira), lgpd: l.lgpd ? 'Sim' : 'Não', contato: caixa, anot: '', _ganhou: p.chopps > 0,
      };
    }), { destaque: (d) => (d._ganhou ? COR.ouroClaro : null) });
  }

  // ===== Participantes =====
  {
    const cols = [
      { chave: 'n', titulo: 'Nº', largura: 6, alinhar: 'center' },
      { chave: 'data', titulo: 'Data', largura: 11, alinhar: 'center', formato: 'dd/mm/yyyy' },
      { chave: 'hora', titulo: 'Hora', largura: 8, alinhar: 'center', formato: 'hh:mm' },
      { chave: 'nome', titulo: 'Nome', largura: 30, negrito: true, quebrar: true },
      { chave: 'whats', titulo: 'WhatsApp', largura: 17, link: true },
      { chave: 'assoc', titulo: 'Associado EG', largura: 11, alinhar: 'center' },
      { chave: 'placa', titulo: 'Placa', largura: 11, alinhar: 'center' },
      { chave: 'perfil', titulo: 'Perfil', largura: 14 },
      { chave: 'aq', titulo: 'Aquec.', largura: 8, alinhar: 'center' },
      { chave: 'dec', titulo: 'Valendo chopp', largura: 10, alinhar: 'center' },
      { chave: 'res', titulo: 'Resultado', largura: 16 },
      { chave: 'cupom', titulo: 'Cupom', largura: 9, alinhar: 'center' },
      { chave: 'obs', titulo: 'Observações', largura: 26, quebrar: true },
      { chave: 'contato', titulo: 'Contato feito', largura: 9, alinhar: 'center' },
      { chave: 'anot', titulo: 'Anotações', largura: 28 },
    ];
    const ws = prepararAba(wb, 'Participações', 'Todas as participações', cols, { descricao: 'Cada partida jogada, por horário. Ganhadores em destaque.' });
    preencher(ws, cols, leads.map((l) => {
      const vezes = c.vezesPlaca(l);
      return {
        n: num.get(l.id), data: dataLocal(l.clientTime), hora: dataLocal(l.clientTime), nome: l.nome,
        whats: c.fmtWhats(l.whatsapp), whats_link: c.linkWhats(l.whatsapp),
        assoc: l.associado ? 'Sim' : 'Não', placa: l.placa || c.statusPlacaTxt(l),
        perfil: l.associado ? 'Associado' : l.placa ? 'Prospect' : 'Não associado', perfil_cor: l.associado ? COR.azul : l.placa ? COR.verde : '',
        aq: `${c.acertosAq(l)}/${c.totalAq(l)}`, dec: `${c.acertosDec(l)}/${c.totalDec(l)}`,
        res: l.ganhouChopp ? 'GANHOU CHOPP' : l.choppEsgotado ? 'Acertou (esgotado)' : 'Não ganhou', res_cor: l.ganhouChopp ? COR.verde : l.choppEsgotado ? COR.azul : COR.cinza,
        cupom: l.codigo || '', cupom_cor: l.codigo ? COR.marinho : '',
        obs: [l.repetido ? 'Jogou de novo' : '', vezes > 1 ? `Placa de ${vezes} pessoas` : '', l.placaRepetida ? 'Confirmou placa já usada' : ''].filter(Boolean).join(' · '),
        contato: caixa, anot: '',
        _ganhou: l.ganhouChopp,
      };
    }), { destaque: (d) => (d._ganhou ? COR.ouroClaro : null) });
  }

  // ===== Ganhadores (conferência dos cupons) =====
  {
    const cols = [
      { chave: 'n', titulo: 'Nº', largura: 6, alinhar: 'center' },
      { chave: 'cupom', titulo: 'Cupom', largura: 11, alinhar: 'center', negrito: true },
      { chave: 'nome', titulo: 'Nome', largura: 34, negrito: true, quebrar: true },
      { chave: 'whats', titulo: 'WhatsApp', largura: 18, link: true },
      { chave: 'data', titulo: 'Data', largura: 11, alinhar: 'center', formato: 'dd/mm/yyyy' },
      { chave: 'hora', titulo: 'Hora', largura: 8, alinhar: 'center', formato: 'hh:mm' },
      { chave: 'assoc', titulo: 'Associado EG', largura: 12, alinhar: 'center' },
      { chave: 'conf', titulo: 'Conferido', largura: 10, alinhar: 'center' },
      { chave: 'anot', titulo: 'Anotações', largura: 30 },
    ];
    const ws = prepararAba(wb, 'Ganhadores', 'Ganhadores de chopp', cols, { descricao: 'Cupons para conferir no Stand.' });
    preencher(ws, cols, leads.filter((l) => l.ganhouChopp).map((l, i) => ({
      n: i + 1, cupom: l.codigo || '-', nome: l.nome, whats: c.fmtWhats(l.whatsapp), whats_link: c.linkWhats(l.whatsapp),
      data: dataLocal(l.clientTime), hora: dataLocal(l.clientTime), assoc: l.associado ? 'Sim' : 'Não', conf: caixa, anot: '',
    })));
  }

  // ===== Prospects (comercial) =====
  {
    const cols = [
      { chave: 'n', titulo: 'Nº', largura: 6, alinhar: 'center' },
      { chave: 'nome', titulo: 'Nome', largura: 32, negrito: true, quebrar: true },
      { chave: 'whats', titulo: 'WhatsApp', largura: 18, link: true },
      { chave: 'placa', titulo: 'Placa', largura: 12, alinhar: 'center' },
      { chave: 'vezes', titulo: 'Pessoas com a placa', largura: 11, alinhar: 'center' },
      { chave: 'ganhou', titulo: 'Ganhou chopp', largura: 11, alinhar: 'center' },
      { chave: 'data', titulo: 'Data', largura: 11, alinhar: 'center', formato: 'dd/mm/yyyy' },
      { chave: 'contato', titulo: 'Contato feito', largura: 10, alinhar: 'center' },
      { chave: 'anot', titulo: 'Interesse / Anotações', largura: 36 },
    ];
    const ws = prepararAba(wb, 'Prospects', 'Prospects (contato comercial)', cols, { descricao: 'Não associados com veículo. Autorizaram contato.' });
    preencher(ws, cols, leads.filter(c.ehProspect).map((l, i) => ({
      n: i + 1, nome: l.nome, whats: c.fmtWhats(l.whatsapp), whats_link: c.linkWhats(l.whatsapp), placa: l.placa, vezes: c.vezesPlaca(l),
      ganhou: l.ganhouChopp ? 'Sim' : 'Não', data: dataLocal(l.clientTime), contato: caixa, anot: '',
    })));
  }

  // ===== Placas repetidas =====
  {
    const cols = [
      { chave: 'placa', titulo: 'Placa', largura: 12, alinhar: 'center', negrito: true },
      { chave: 'vezes', titulo: 'Pessoas', largura: 8, alinhar: 'center' },
      { chave: 'nomes', titulo: 'Nomes', largura: 46, quebrar: true },
      { chave: 'whats', titulo: 'WhatsApps', largura: 34, quebrar: true },
      { chave: 'assoc', titulo: 'Algum associado?', largura: 14, alinhar: 'center' },
    ];
    const ws = prepararAba(wb, 'Placas repetidas', 'Placas usadas por mais de uma pessoa', cols, { descricao: 'Mesma placa usada por pessoas diferentes.' });
    // uma entrada por pessoa (WhatsApp); só entra placa usada por pessoas diferentes
    const porPessoa = (ls) => [...new Map(ls.map((l) => [l.whatsapp, l])).values()];
    preencher(ws, cols, [...c.placas.entries()].map(([placa, ls]) => [placa, porPessoa(ls), ls]).filter(([, ps]) => ps.length > 1)
      .sort((a, b) => b[1].length - a[1].length).map(([placa, ps, ls]) => ({
        placa, vezes: ps.length, nomes: ps.map((l) => l.nome).join(' / '), whats: ps.map((l) => c.fmtWhats(l.whatsapp)).join(' / '), assoc: ls.some((l) => l.associado) ? 'Sim' : 'Não',
      })));
  }

  // ===== Desistências =====
  {
    const cols = [
      { chave: 'n', titulo: 'Nº', largura: 6, alinhar: 'center' },
      { chave: 'data', titulo: 'Data', largura: 11, alinhar: 'center', formato: 'dd/mm/yyyy' },
      { chave: 'hora', titulo: 'Hora', largura: 8, alinhar: 'center', formato: 'hh:mm' },
      { chave: 'nome', titulo: 'Nome', largura: 28, negrito: true, quebrar: true },
      { chave: 'whats', titulo: 'WhatsApp', largura: 17, link: true },
      { chave: 'etapa', titulo: 'Parou em', largura: 12 },
      { chave: 'motivo', titulo: 'Motivo', largura: 22 },
      { chave: 'placa', titulo: 'Placa', largura: 12, alinhar: 'center' },
      { chave: 'assoc', titulo: 'Associado EG', largura: 11, alinhar: 'center' },
      { chave: 'lgpd', titulo: 'Autorizou contato', largura: 11, alinhar: 'center' },
      { chave: 'contato', titulo: 'Contato feito', largura: 10, alinhar: 'center' },
    ];
    const ws = prepararAba(wb, 'Desistências', 'Desistências', cols, { descricao: 'Não terminaram. Só chame quem autorizou contato.' });
    preencher(ws, cols, [...c.incompletos].sort((a, b) => a.clientTime - b.clientTime).map((l, i) => ({
      n: i + 1, data: dataLocal(l.clientTime), hora: dataLocal(l.clientTime), nome: l.nome || '(não informado)',
      whats: l.whatsapp ? c.fmtWhats(l.whatsapp) : '', whats_link: l.whatsapp && l.lgpd ? c.linkWhats(l.whatsapp) : '',
      etapa: l.etapa || '', motivo: c.fmtMotivo(l.motivo), placa: l.placa || c.statusPlacaTxt(l), assoc: l.associado ? 'Sim' : 'Não',
      lgpd: l.lgpd ? 'Sim' : 'Não', lgpd_cor: l.lgpd ? '' : COR.vermelho, contato: l.lgpd ? caixa : '-',
    })));
  }

  // ===== Respostas (detalhe de cada pergunta) =====
  {
    const cols = [
      { chave: 'n', titulo: 'Nº part.', largura: 7, alinhar: 'center' },
      { chave: 'nome', titulo: 'Participante', largura: 24, quebrar: true },
      { chave: 'ordem', titulo: 'Pergunta', largura: 8, alinhar: 'center' },
      { chave: 'etapa', titulo: 'Etapa', largura: 13 },
      { chave: 'tema', titulo: 'Tema', largura: 16 },
      { chave: 'texto', titulo: 'Enunciado', largura: 44, quebrar: true },
      { chave: 'marcou', titulo: 'Respondeu', largura: 30, quebrar: true },
      { chave: 'certa', titulo: 'Resposta certa', largura: 30, quebrar: true },
      { chave: 'ok', titulo: 'Resultado', largura: 10, alinhar: 'center' },
    ];
    const ws = prepararAba(wb, 'Respostas', 'Respostas de cada participação', cols, { descricao: 'Cada pergunta respondida. As 3 últimas valiam chopp.' });
    const linhas = [];
    leads.forEach((l) => (l.respostas || []).forEach((r, i) => {
      const tema = BANCO_PADRAO.find((b) => b.id === r.id)?.tag || '';
      linhas.push({ n: num.get(l.id), nome: l.nome, ordem: `${i + 1}ª`, etapa: r.valeChopp ? 'Valendo chopp' : 'Aquecimento', etapa_cor: r.valeChopp ? 'FFB07800' : '', tema, texto: r.texto,
        marcou: r.resposta ?? '(sem resposta)', certa: r.respostaCorreta ?? '', ok: r.acertou ? '✔ Acertou' : '✘ Errou', ok_cor: r.acertou ? COR.verde : COR.vermelho, _ok: r.acertou });
    }));
    preencher(ws, cols, linhas);
  }

  // ===== Resumo =====
  {
    const colsR = [
      { chave: 'a', titulo: 'Indicador', largura: 36, negrito: true }, { chave: 'b', titulo: 'Valor', largura: 14, alinhar: 'center', negrito: true }, { chave: 'c', titulo: 'Detalhe', largura: 58, quebrar: true },
    ];
    const ws = prepararAba(wb, 'Resumo', 'Resumo do evento', colsR, { paisagem: false, descricao: 'Regra: 5 perguntas. Ganha quem acerta as 3 últimas.' });
    const picoGeral = dias.flatMap((d) => d.horas.map((h) => ({ ...h, dia: d }))).reduce((a, b) => (b.n > (a?.n || 0) ? b : a), null);
    const semPlaca = { 'nao-lembra': 0, 'sem-veiculo': 0, 'nao-informar': 0 };
    leads.forEach((l) => { if (!l.placa && semPlaca[l.placaStatus] !== undefined) semPlaca[l.placaStatus] += 1; });
    preencher(ws, colsR, [
      { a: 'Participações', b: m.total, c: `${m.unicos} ${m.unicos === 1 ? 'pessoa' : 'pessoas'}` },
      { a: 'Chopps ganhos', b: ganhos, c: limite ? `de ${limite}` : '', b_cor: COR.verde },
      { a: 'Taxa de ganho', b: `${pct(m.chopps, m.total)}%`, c: '' },
      { a: 'Associados Exclusive Gold', b: m.assoc, c: `${pct(m.assoc, m.total)}%` },
      { a: 'Não associados', b: m.naoAssoc, c: `${pct(m.naoAssoc, m.total)}%` },
      { a: 'Prospects', b: m.prospects, c: 'Ver aba Prospects', b_cor: COR.azul },
      { a: 'Sem placa informada', b: m.semPlaca, c: `${semPlaca['nao-lembra']} não lembra · ${semPlaca['sem-veiculo']} sem veículo · ${semPlaca['nao-informar']} não informou` },
      { a: 'Placas repetidas', b: m.placasRepetidas, c: 'Ver aba Placas repetidas' },
      { a: 'Desistências', b: m.desistencias, c: 'Ver aba Desistências' },
      { a: 'Acerto médio', b: `${m.acertoMedio}%`, c: '' },
      { a: 'Horário de pico', b: picoGeral ? `${doisDig(picoGeral.h)}h` : '-', c: picoGeral ? `${picoGeral.n} participações${dias.length > 1 ? ` no dia ${picoGeral.dia.rotulo}` : ''}` : '' },
    ], { filtro: false });

    // Por dia
    ws.addRow([]);
    const tituloSecao = (texto) => {
      const r = ws.addRow([texto]); ws.mergeCells(r.number, 1, r.number, 3);
      const cel = ws.getCell(r.number, 1); cel.font = { bold: true, size: 12, color: { argb: COR.marinho } };
      cel.border = { bottom: { style: 'medium', color: { argb: COR.ouro } } }; r.height = 24; cel.alignment = { vertical: 'bottom' };
    };
    tituloSecao('Por dia do evento');
    const cabDia = ws.addRow(['Dia', 'Participações', 'Chopps · Associados · Prospects · Pico']);
    cabDia.eachCell((cel) => { cel.font = { bold: true, size: 10, color: { argb: COR.marinho } }; cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.ouroClaro } }; cel.border = bordas; cel.alignment = { vertical: 'middle', indent: 1 }; });
    dias.forEach((d, i) => {
      const r = ws.addRow([`Dia ${d.numero} · ${d.semana} ${d.rotulo}`, d.total, `${d.chopps} chopps · ${d.assoc} associados · ${d.prospects} prospects · pico às ${doisDig(d.pico.h)}h (${d.pico.n})`]);
      r.eachCell((cel, col) => { cel.border = bordas; cel.font = { size: 10, bold: col === 2 }; cel.alignment = { vertical: 'middle', horizontal: col === 2 ? 'center' : 'left', indent: col === 2 ? 0 : 1 }; if (i % 2) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.zebra } }; });
    });
    if (!dias.length) ws.addRow(['Sem participações ainda']);

    // Perguntas
    ws.addRow([]);
    tituloSecao('Desempenho por pergunta');
    const cabP = ws.addRow(['Pergunta', '% de acerto', 'Respondida · Acertos · Mais usada como']);
    cabP.eachCell((cel) => { cel.font = { bold: true, size: 10, color: { argb: COR.marinho } }; cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.ouroClaro } }; cel.border = bordas; cel.alignment = { vertical: 'middle', indent: 1 }; });
    const ini = ws.rowCount + 1;
    c.estatisticaPerguntas().forEach((e, i) => {
      const r = ws.addRow([`#${e.pos >= 0 ? e.pos + 1 : '?'}  ${e.texto}`, e.n ? e.ok / e.n : 0, `${e.n} ${e.n === 1 ? 'vez' : 'vezes'} · ${e.ok} ${e.ok === 1 ? 'acerto' : 'acertos'} · ${e.dec > e.n / 2 ? 'valendo chopp' : 'aquecimento'}`]);
      r.getCell(2).numFmt = '0%';
      r.eachCell((cel, col) => { cel.border = bordas; cel.font = { size: 10, bold: col === 2 }; cel.alignment = { vertical: 'middle', horizontal: col === 2 ? 'center' : 'left', wrapText: col === 1, indent: col === 2 ? 0 : 1 }; if (i % 2) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR.zebra } }; });
      r.height = Math.max(20, Math.ceil(String(e.texto || '').length / 38) * 14 + 6);
    });
    const fim = ws.rowCount;
    if (fim >= ini) {
      ws.addConditionalFormatting({ ref: `B${ini}:B${fim}`, rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: COR.ouro }, gradient: false }] });
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  const agora = new Date();
  const pa = partes(agora); const nome = `quiz-exclusive-gold-${chaveDia(agora)}-${doisDig(pa.hora)}h${doisDig(pa.min)}.xlsx`;
  return { blob: new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nome };
}

export function baixarArquivo(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
