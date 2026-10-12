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
  await ctx.addInitScript('window.FORCAR_DEMO = true;'); // nunca grava no Firebase de produção
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
  await page.waitForSelector('#modal:not([hidden]), #tela-quiz.ativa', { timeout: 20000 });
  if (await page.isVisible('#modal')) await page.click('#modal-ok');
  const total = await page.waitForFunction(() => window.__quiz.partida().length).then((h) => h.jsonValue());
  for (let i = 0; i < total; i++) {
    await page.waitForFunction((k) => document.querySelector('#tela-quiz.ativa') && document.querySelector('#q-num').textContent === String(k + 1).padStart(2, '0')
      && document.querySelectorAll('#q-opcoes .opcao').length > 0 && !document.querySelector('#aviso-chopp.mostra'), i, { timeout: 30000 })
      .catch(async (e) => { if (process.env.DEPURAR) { await page.screenshot({ path: process.env.DEPURAR }); console.log('ESTADO', await page.evaluate(() => ({ tela: document.querySelector('.tela.ativa')?.id, num: document.querySelector('#q-num').textContent, modal: !document.querySelector('#modal').hidden, modalTxt: document.querySelector('#modal-titulo').textContent, aviso: !!document.querySelector('#aviso-chopp.mostra'), opcoes: document.querySelectorAll('#q-opcoes .opcao').length }))); } throw e; });
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

for (const viewport of [{ width: 1280, height: 800 }, { width: 1194, height: 834 }, { width: 390, height: 844 }]) {
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
    assert.equal(await page.textContent('#r-acertos'), '2'); assert.equal(await page.textContent('#r-total'), '3'); // placar: 2 de 3 valendo chopp
    assert.match(await page.textContent('#r-msg'), /confira a resposta certa/i);
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
    await page.waitForFunction((n) => document.getElementById('r-acertos').textContent === String(n), acertos);
    assert.match(await page.textContent('#r-msg'), acertos === 2 ? /confira a resposta certa/i : /confira as respostas certas/i);
    await page.click('#tela-resultado [data-acao="inicio"]'); if (await page.isVisible('#modal')) await page.click('#modal-ok');
    await page.waitForSelector('#tela-descanso.ativa');
    await page.waitForTimeout(600);
  }
  await ctx.close();
});

test('caso 13: painel mostra quem ganhou com o cupom, sem etapa de entrega', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  await jogar(page, [1, 1, 1, 1, 1], 'Ana Ganhadora');
  // a tela final fica 60 s (tempo de mostrar no balcão); quem ganhou confirma antes de começar de novo
  await page.waitForTimeout(25000);
  assert.ok(await page.isVisible('#tela-resultado.ativa'), 'tela final continua depois de 25 s');
  const resta = Number(await page.textContent('#r-contagem'));
  assert.ok(resta > 25 && resta <= 36, `contagem de 60 s (restam ${resta})`);
  await page.click('#tela-resultado [data-acao="inicio"]');
  await page.waitForSelector('#modal:not([hidden])');
  await page.click('#modal-cancelar');
  assert.ok(await page.isVisible('#tela-resultado.ativa'), 'voltar ao cupom mantém a tela final');
  await page.click('#tela-resultado [data-acao="inicio"]'); await page.click('#modal-ok');
  await page.waitForSelector('#tela-descanso.ativa');
  await jogar(page, [1, 1, 1, 0, 1], 'Bruno Perdeu');
  const codigo = await page.evaluate(() => JSON.parse(localStorage.getItem('eg_leads')).find((l) => l.ganhouChopp).codigo);
  await page.goto(`${base}/painel.html`);
  await page.waitForFunction(() => document.getElementById('k-chopps').textContent === '1' && document.getElementById('k-total').textContent === '2');
  await page.click('[data-aba="participantes"]');
  assert.equal(await page.locator('#tabela tr').count(), 2);
  assert.equal(await page.locator('[data-entregar]').count(), 0, 'não existe mais botão de entregar');
  await page.selectOption('#filtro', 'chopp');
  assert.equal(await page.locator('#tabela tr').count(), 1);
  assert.match(await page.textContent('#tabela'), new RegExp(`Ana Ganhadora[\\s\\S]*Ganhou[\\s\\S]*${codigo}`));
  await page.fill('#busca', codigo);
  assert.equal(await page.locator('#tabela tr').count(), 1, 'busca pelo código do cupom');
  await ctx.close();
});

test('painel: relatório no WhatsApp pede o número de quem recebe; participante abre conversa sem mensagem pronta', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  await ctx.route(/wa\.me|whatsapp\.com/, (r) => r.fulfill({ contentType: 'text/html', body: 'ok' })); // não sai para a internet
  await jogar(page, [1, 1, 1, 1, 1], 'Carla Contato');
  const whats = await page.evaluate(() => JSON.parse(localStorage.getItem('eg_leads'))[0].whatsapp);
  await page.goto(base + '/painel.html');
  await page.waitForFunction(() => document.getElementById('k-total').textContent === '1');
  await page.click('[data-aba="participantes"]');
  assert.equal(await page.getAttribute('#tabela .btn-whats', 'href'), 'https://wa.me/55' + whats, 'conversa direta, sem texto pronto');
  await page.click('[data-aba="visao"]');
  await page.click('#btn-resumo');
  await page.fill('#env-whats', '8199');
  await page.click('#env-resumo');
  assert.match(await page.textContent('#env-erro'), /DDD/);
  await page.fill('#env-whats', '81 98888-7777');
  assert.equal(await page.inputValue('#env-whats'), '(81) 98888-7777');
  const [aba] = await Promise.all([ctx.waitForEvent('page'), page.click('#env-resumo')]);
  await aba.waitForURL(/wa\.me/);
  assert.match(aba.url(), /^https:\/\/(wa\.me|api\.whatsapp\.com)\/.*5581988887777/);
  await aba.close();
  // lembra o número para a próxima vez
  await page.click('#btn-resumo');
  assert.equal(await page.inputValue('#env-whats'), '(81) 98888-7777');
  const [download] = await Promise.all([page.waitForEvent('download'), ctx.waitForEvent('page'), page.click('#env-excel')]);
  assert.match(download.suggestedFilename(), /^quiz-exclusive-gold-.*\.xlsx$/);
  await ctx.close();
});

test('caso 14: configurações simples (pausar, limite) valem no totem e as regras ficam fixas', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  // regra antiga salva por engano não muda o jogo: continua 5 perguntas, 3 valendo chopp
  await page.evaluate(() => localStorage.setItem('eg_config', JSON.stringify({ totalPerguntas: 6, aquecimento: 2, decisivas: 4, acertosParaGanhar: 1 })));
  const painel = await ctx.newPage();
  await painel.goto(`${base}/painel.html`);
  await painel.click('[data-aba="config"]');
  assert.equal(await painel.locator('#c-total').count(), 0, 'sem campos de regra no painel');
  // limite de 1 chopp
  await painel.fill('#c-limite', '1'); await painel.click('#c-limite-salvar');
  await painel.waitForFunction(() => JSON.parse(localStorage.getItem('eg_config') || '{}').limiteChopps === 1);
  await page.reload(); await page.waitForFunction(() => window.__egon && !document.body.classList.contains('carregando'));
  const { partida, leads } = await jogar(page, [1, 1, 1, 1, 1]);
  assert.equal(partida.length, 5); assert.equal(partida.filter((q) => q.valeChopp).length, 3);
  assert.equal(leads.at(-1).ganhouChopp, true, 'primeiro chopp dentro do limite');
  await page.click('#tela-resultado [data-acao="inicio"]'); if (await page.isVisible('#modal')) await page.click('#modal-ok'); await page.waitForSelector('#tela-descanso.ativa');
  const r2 = await jogar(page, [1, 1, 1, 1, 1], 'Segunda Pessoa');
  assert.equal(r2.leads.at(-1).ganhouChopp, false, 'limite atingido: sem cupom');
  assert.equal(r2.leads.at(-1).choppEsgotado, true);
  // pausar no painel -> totem mostra "Já voltamos!"
  await painel.click('label:has(#c-pausado)');
  await page.waitForSelector('#tela-pausa.ativa', { timeout: 10000 });
  await painel.click('label:has(#c-pausado)');
  await page.waitForSelector('#tela-descanso.ativa', { timeout: 10000 });
  await ctx.close();
});

test('tablet: modo leve e teclado próprio (nome só letras, WhatsApp só números, placa letras e números)', async () => {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript('window.FORCAR_DEMO = true;');
  const page = await ctx.newPage(); const erros = []; page.on('pageerror', (e) => erros.push(String(e)));
  await page.goto(`${base}/index.html?tablet=1`); await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.waitForFunction(() => window.__egon && !document.body.classList.contains('carregando'));
  assert.ok(await page.evaluate(() => document.body.classList.contains('leve') && window.__egon.renderer.getContextAttributes().antialias), 'modo leve no tablet, com bordas suaves');
  await page.tap('#tela-descanso', { position: { x: 200, y: 600 } }); await page.waitForSelector('#tela-cadastro.ativa');
  assert.equal(await page.getAttribute('#f-nome', 'inputmode'), 'none', 'teclado do sistema não abre');
  const tecla = (k) => page.tap(`.teclado [data-k="${k}"]`);
  const acima = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().bottom <= innerHeight - document.querySelector('.teclado').offsetHeight, sel);
  await page.tap('#f-nome'); await page.waitForSelector('.teclado.aberto');
  assert.equal(await page.locator('.teclado [data-k="1"]').count(), 0, 'nome não tem números');
  for (const k of ['J', 'O', 'S', 'É', '␣', 'L', 'I', 'M', 'A']) await tecla(k);
  assert.equal(await page.inputValue('#f-nome'), 'José Lima');
  await tecla('→'); await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-whats');
  assert.equal(await page.locator('.teclado [data-k="A"]').count(), 0, 'WhatsApp só números');
  for (const k of '81988887777') await tecla(k);
  assert.equal(await page.inputValue('#f-whats'), '(81) 98888-7777');
  assert.ok(await acima('#f-whats'), 'campo do WhatsApp visível acima do teclado');
  await tecla('→'); await page.waitForTimeout(700);
  for (const k of 'QWE1R23') await tecla(k);
  assert.equal(await page.inputValue('#f-placa'), 'QWE1R23');
  assert.ok(await acima('#f-placa'), 'campo da placa visível acima do teclado');
  await tecla('✓'); await page.waitForTimeout(500);
  assert.ok(await page.evaluate(() => document.querySelector('.teclado').hidden), 'teclado fecha no Pronto');
  await page.tap('#f-assoc [data-v="sim"]'); await page.tap('.lgpd'); await page.tap('#btn-comecar');
  await page.waitForSelector('#modal:not([hidden]), #tela-quiz.ativa', { timeout: 20000 });
  assert.deepEqual(erros, []);
  await ctx.close();
});

test('placa: "não sei a placa" conta como resolvido e vai para o relatório', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  await page.click('#tela-descanso', { position: { x: 200, y: 600 } });
  await page.waitForSelector('#tela-cadastro.ativa');
  await page.fill('#f-nome', 'Sem Placa Teste'); await page.fill('#f-whats', '11955550000');
  await page.click('#placa-sem'); await page.waitForSelector('#folha-placa:not([hidden])');
  await page.click('[data-motivo="nao-lembra"]');
  assert.match(await page.textContent('#placa-motivo'), /não lembro/i);
  await page.click('#f-assoc [data-v="nao"]'); await page.click('.lgpd');
  assert.equal(await page.textContent('#btn-comecar-txt'), 'Começar o quiz');
  await page.click('#btn-comecar');
  await page.waitForFunction(() => window.__quiz.partida().length && document.querySelector('#tela-quiz.ativa'));
  await page.click('#tela-quiz [data-acao="inicio"]'); // desiste no quiz
  const l = await page.evaluate(() => JSON.parse(localStorage.getItem('eg_leads'))[0]);
  assert.equal(l.status, 'incompleto'); assert.equal(l.placa, ''); assert.equal(l.placaStatus, 'nao-lembra'); assert.equal(l.motivo, 'cancelou');
  await ctx.close();
});

test('placa já registrada: pede confirmação, permite corrigir e marca a participação', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  await page.evaluate(() => localStorage.setItem('eg_leads', JSON.stringify([{ id: 'a', nome: 'Amigo', whatsapp: '11911112222', placa: 'ABC1D23', respostas: [], clientTime: Date.now(), _sync: true }])));
  await page.click('#tela-descanso', { position: { x: 200, y: 600 } });
  await page.waitForSelector('#tela-cadastro.ativa');
  await page.fill('#f-nome', 'Outra Pessoa'); await page.fill('#f-whats', '11933334444'); await page.fill('#f-placa', 'ABC1D23');
  await page.click('#f-assoc [data-v="sim"]'); await page.click('.lgpd'); await page.click('#btn-comecar');
  await page.waitForSelector('#modal:not([hidden])');
  assert.match(await page.textContent('#modal-titulo'), /placa já foi registrada/i);
  await page.click('#modal-cancelar'); // corrigir
  assert.equal(await page.evaluate(() => document.activeElement.id), 'f-placa');
  await page.click('#btn-comecar'); await page.waitForSelector('#modal:not([hidden])');
  await page.click('#modal-ok'); // confirma que é essa placa
  await page.waitForFunction(() => window.__quiz.partida().length && document.querySelector('#tela-quiz.ativa'));
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem('eg_sessao')));
  assert.equal(sess.jogador.placaRepetida, true);
  await ctx.close();
});

test('retoma de onde parou depois de recarregar a página (cadastro e quiz)', async () => {
  const { ctx, page } = await abrirTotem({ width: 1280, height: 800 });
  await page.click('#tela-descanso', { position: { x: 200, y: 600 } });
  await page.waitForSelector('#tela-cadastro.ativa');
  await page.fill('#f-nome', 'Volta Depois'); await page.fill('#f-whats', '11966667777');
  await page.waitForTimeout(500);
  await page.reload(); await page.waitForSelector('#tela-cadastro.ativa');
  assert.equal(await page.inputValue('#f-nome'), 'Volta Depois');
  await page.fill('#f-placa', 'XYZ9A88'); await page.click('#f-assoc [data-v="nao"]'); await page.click('.lgpd'); await page.click('#btn-comecar');
  await page.waitForFunction(() => document.querySelector('#tela-quiz.ativa') && document.querySelectorAll('#q-opcoes .opcao').length);
  await page.waitForTimeout(900);
  const q = await page.evaluate(() => window.__quiz.partida()[0]);
  await page.click(`#q-opcoes .opcao:nth-child(${q.correta + 1})`);
  await page.waitForTimeout(600);
  const antes = await page.evaluate(() => window.__quiz.partida().map((x) => x.id));
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#tela-quiz.ativa') && document.querySelector('#q-num').textContent === '02', null, { timeout: 15000 });
  assert.deepEqual(await page.evaluate(() => window.__quiz.partida().map((x) => x.id)), antes);
  assert.equal(await page.evaluate(() => document.querySelector('#progresso li').className.includes('certo')), true);
  await ctx.close();
});
