// Teste de ponta a ponta no navegador (totem + painel, modo demonstração).
// Rodar: npm run test:e2e   (precisa do pacote playwright-core e do Google Chrome instalado)
// Variáveis opcionais: CHROME=caminho do navegador, PLAYWRIGHT_CORE=caminho do pacote, PRINTS=pasta para salvar capturas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = process.env.PLAYWRIGHT_CORE ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href) : await import('playwright-core');
const { chromium } = pw;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((c) => existsSync(c));
const PRINTS = process.env.PRINTS || '';
if (PRINTS) mkdirSync(PRINTS, { recursive: true });

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };
let servidor; let base; let navegador;

before(async () => {
  servidor = http.createServer(async (req, res) => {
    const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try { const dados = await readFile(arq.endsWith(path.sep) ? path.join(arq, 'index.html') : arq); res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' }); res.end(dados); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
  navegador = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--autoplay-policy=no-user-gesture-required'] });
});
after(async () => { await navegador?.close(); servidor?.close(); });

async function abrirTotem(viewport, config) {
  const ctx = await navegador.newContext({ viewport });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text()); });
  await page.goto(`${base}/index.html`);
  await page.evaluate((c) => { localStorage.clear(); if (c) localStorage.setItem('eg_config', JSON.stringify(c)); }, config || null);
  await page.reload();
  await page.waitForFunction(() => window.__egon && !document.body.classList.contains('carregando'));
  return { ctx, page, erros };
}

// Joga uma partida inteira. plano[i] = true acerta, false erra (pela partida sorteada).
async function jogar(page, plano, nome = 'Maria Teste', prints) {
  await page.click('#tela-descanso', { position: { x: 200, y: 600 } });
  await page.waitForSelector('#tela-cadastro.ativa');
  await page.fill('#f-nome', nome);
  await page.fill('#f-whats', `119${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`);
  await page.fill('#f-placa', 'ABC1D23');
  await page.click('#f-assoc [data-v="sim"]');
  await page.click('.lgpd');
  if (prints) await page.screenshot({ path: `${prints}-1-cadastro.png` });
  await page.click('#btn-comecar');
  // quem repete placa ou WhatsApp vê o aviso "você já jogou" e segue
  await page.waitForSelector('#modal:not([hidden]), #tela-quiz.ativa', { timeout: 8000 });
  if (await page.isVisible('#modal')) await page.click('#modal-ok');
  const total = await page.waitForFunction(() => window.__quiz.partida().length).then((h) => h.jsonValue());
  for (let i = 0; i < total; i++) {
    await page.waitForFunction((k) => document.querySelector('#tela-quiz.ativa') && document.querySelector('#q-num').textContent === String(k + 1).padStart(2, '0')
      && document.querySelectorAll('#q-opcoes .opcao').length > 0 && !document.querySelector('#aviso-chopp.mostra'), i, { timeout: 15000 });
    await page.waitForTimeout(900); // espera as alternativas entrarem
    const q = await page.evaluate((k) => window.__quiz.partida()[k], i);
    const alvo = plano[i] ? q.correta : (q.correta + 1) % q.opcoes.length;
    if (prints && i === total - 1) await page.screenshot({ path: `${prints}-2-pergunta-chopp.png` });
    await page.click(`#q-opcoes .opcao:nth-child(${alvo + 1})`);
  }
  await page.waitForSelector('#tela-resultado.ativa', { timeout: 15000 });
  await page.waitForTimeout(1600);
  if (prints) await page.screenshot({ path: `${prints}-3-resultado.png` });
  return page.evaluate(() => ({ partida: window.__quiz.partida(), leads: JSON.parse(localStorage.getItem('eg_leads') || '[]') }));
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 1194, height: 834 }]) {
  const tam = `${viewport.width}x${viewport.height}`;

  test(`${tam} · casos 1 e 12: acerta tudo, ganha cupom com código e tela de vitória`, async () => {
    const { ctx, page, erros } = await abrirTotem(viewport);
    const { partida, leads } = await jogar(page, [1, 1, 1, 1, 1], 'Maria Teste', PRINTS && path.join(PRINTS, `${tam}-vitoria`));
    assert.deepEqual(partida.map((q) => q.etapa), ['aquecimento', 'aquecimento', 'decisiva', 'decisiva', 'decisiva']);
    assert.equal(new Set(partida.map((q) => q.id)).size, 5);
    assert.match(await page.textContent('#r-titulo'), /ganhou/i);
    assert.equal(await page.isVisible('#r-premio'), true);
    assert.equal(await page.isVisible('#r-revisao'), false);
    const codigo = await page.textContent('#r-voucher-codigo');
    assert.match(codigo, /^[A-HJ-NP-Z2-9]{4}$/);
    assert.equal(leads.length, 1);
    const l = leads[0];
    assert.equal(l.ganhouChopp, true); assert.equal(l.codigo, codigo); assert.equal(l.entregue, false);
    assert.equal(l.acertosDecisivas, 3); assert.equal(l.acertosAquecimento, 2);
    assert.deepEqual(l.perguntasIds, partida.map((q) => q.id));
    l.respostas.forEach((r) => { assert.ok(Array.isArray(r.opcoes)); assert.ok(r.resposta); assert.ok(r.respostaCorreta); });
    assert.deepEqual(erros, []);
    await ctx.close();
  });

  test(`${tam} · casos 2, 6, 10, 11: acerta o aquecimento, erra uma decisiva, não ganha e vê a correção`, async () => {
    const { ctx, page, erros } = await abrirTotem(viewport);
    const { partida, leads } = await jogar(page, [1, 1, 1, 0, 1], 'João Teste', PRINTS && path.join(PRINTS, `${tam}-derrota`));
    assert.match(await page.textContent('#r-titulo'), /não foi dessa vez/i);
    assert.equal(await page.isVisible('#r-premio'), false);
    assert.match(await page.textContent('#r-msg'), /acertou 2 de 3 perguntas que valiam chopp/i);
    const itens = await page.$$eval('#r-revisao li', (lis) => lis.map((li) => ({ cls: li.className, txt: li.textContent.replace(/\s+/g, ' ') })));
    assert.equal(itens.length, 3);
    assert.deepEqual(itens.map((i) => i.cls), ['ok', 'erro', 'ok']);
    const errada = partida[3];
    const marcada = errada.opcoes[(errada.correta + 1) % errada.opcoes.length];
    assert.ok(itens[1].txt.includes(errada.texto));
    assert.ok(itens[1].txt.includes(`Você respondeu: ${marcada}`));
    assert.ok(itens[1].txt.includes(`Resposta certa: ${errada.opcoes[errada.correta]}`));
    const l = leads[0];
    assert.equal(l.ganhouChopp, false); assert.equal(l.codigo, ''); assert.equal(l.acertosAquecimento, 2); assert.equal(l.acertosDecisivas, 2);
    assert.deepEqual(erros, []);
    await ctx.close();
  });
}

test('casos 3, 4 e 5: 2, 1 ou 0 acertos nas decisivas não ganham', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  for (const [plano, acertos] of [[[0, 0, 1, 1, 0], 2], [[1, 1, 0, 1, 0], 1], [[1, 1, 0, 0, 0], 0]]) {
    const { leads } = await jogar(page, plano);
    const l = leads.at(-1);
    assert.equal(l.acertosDecisivas, acertos); assert.equal(l.ganhouChopp, false); assert.equal(l.codigo, '');
    assert.match(await page.textContent('#r-msg'), new RegExp(`acertou ${acertos} de 3`));
    await page.click('#tela-resultado [data-acao="inicio"]');
    await page.waitForSelector('#tela-descanso.ativa');
    await page.waitForTimeout(600);
  }
  await ctx.close();
});

test('caso 13: painel registra a entrega, desfaz e filtra cupons aguardando', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  await jogar(page, [1, 1, 1, 1, 1], 'Ana Ganhadora');
  await page.goto(`${base}/painel.html`);
  await page.click('[data-aba="participantes"]');
  await page.selectOption('#filtro', 'pendente');
  assert.equal(await page.locator('#tabela tr').count(), 1);
  page.on('dialog', (d) => d.accept());
  await page.click('[data-entregar][data-v="1"]');
  await page.waitForFunction(() => document.querySelectorAll('#tabela tr').length === 0);
  let l = await page.evaluate(() => JSON.parse(localStorage.getItem('eg_leads'))[0]);
  assert.equal(l.entregue, true); assert.ok(l.entregueEm);
  await page.selectOption('#filtro', 'chopp');
  await page.click('button.entregue'); // desfazer (confirmação aceita)
  await page.waitForSelector('[data-entregar][data-v="1"]');
  l = await page.evaluate(() => JSON.parse(localStorage.getItem('eg_leads'))[0]);
  assert.equal(l.entregue, false);
  await page.click('[data-aba="visao"]');
  assert.equal(await page.textContent('#k-entregues'), '0');
  await ctx.close();
});

test('caso 14: painel valida e salva as regras, e o totem passa a usar', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  await page.goto(`${base}/painel.html`);
  await page.click('[data-aba="config"]');
  // soma errada: não salva
  await page.fill('#c-decis', '2');
  await page.click('#c-salvar');
  assert.match(await page.textContent('#c-regras-erro'), /precisa ser igual ao total/);
  assert.equal(await page.evaluate(() => localStorage.getItem('eg_config')), null);
  // regra nova válida: 6 perguntas, 2 aquecimento, 4 valendo, ganha com 3
  await page.fill('#c-total', '6'); await page.fill('#c-aquec', '2'); await page.fill('#c-decis', '4'); await page.fill('#c-acertos', '3');
  await page.click('#c-salvar');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('eg_config') || '{}').totalPerguntas === 6);
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => window.__egon && !document.body.classList.contains('carregando'));
  const { partida, leads } = await jogar(page, [0, 0, 1, 1, 1, 0]);
  assert.equal(partida.length, 6); assert.equal(partida.filter((q) => q.valeChopp).length, 4);
  assert.equal(leads.at(-1).ganhouChopp, true, '3 de 4 ganha com a regra salva');
  await ctx.close();
});
