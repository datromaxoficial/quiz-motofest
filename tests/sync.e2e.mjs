// Simulação do evento com a nuvem de verdade (emulador oficial do Firebase, com as regras do firestore.rules):
// tablet online, tablet sem internet, tablet desligado e religado, painel recebendo ao vivo, entrega e limpeza.
// Rodar: (1) firebase emulators:start --project demo-quiz --only firestore,auth  (com o firestore.rules usando painel@teste.com)
//        (2) npm run test:sync
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = process.env.PLAYWRIGHT_CORE ? await import(pathToFileURL(path.join(process.env.PLAYWRIGHT_CORE, 'index.mjs')).href) : await import('playwright-core');
const { chromium } = pw;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((c) => existsSync(c));
const EMU = '127.0.0.1';
const PROJETO = 'demo-quiz';
const ADMIN = { email: 'painel@teste.com', senha: 'senha-teste-123' };
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json' };

let servidor; let base; let navegador;
const CONFIG_TESTE = `window.FIREBASE_CONFIG_TESTE = { apiKey: 'chave-de-teste', projectId: '${PROJETO}', authDomain: '${PROJETO}.firebaseapp.com', appId: '1:1:web:1' }; window.FIREBASE_EMULADOR = '${EMU}';`;

before(async () => {
  // zera o banco do emulador e cria o login do painel
  await fetch(`http://${EMU}:8080/emulator/v1/projects/${PROJETO}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://${EMU}:9099/emulator/v1/projects/${PROJETO}/accounts`, { method: 'DELETE' });
  const r = await fetch(`http://${EMU}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=chave-de-teste`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: ADMIN.email, password: ADMIN.senha, returnSecureToken: true }) });
  assert.equal(r.status, 200, 'criar usuário do painel no emulador');
  servidor = http.createServer(async (req, res) => {
    const arq = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    try { const dados = await readFile(arq.endsWith(path.sep) ? path.join(arq, 'index.html') : arq); res.writeHead(200, { 'content-type': TIPOS[path.extname(arq)] || 'application/octet-stream' }); res.end(dados); } catch { res.writeHead(404); res.end(); }
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${servidor.address().port}`;
  navegador = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
});
after(async () => { await navegador?.close(); servidor?.close(); });

async function novoContexto(viewport = { width: 1280, height: 800 }) {
  const ctx = await navegador.newContext({ viewport });
  await ctx.addInitScript(CONFIG_TESTE);
  return ctx;
}
async function abrirTotem(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => window.__egon && !document.body.classList.contains('carregando'));
  return page;
}
async function abrirPainel() {
  const ctx = await novoContexto({ width: 1400, height: 900 });
  const page = await ctx.newPage();
  await page.goto(`${base}/painel.html`);
  await page.waitForSelector('#login:not([hidden])');
  await page.fill('#l-email', ADMIN.email); await page.fill('#l-senha', ADMIN.senha);
  await page.click('#form-login button[type="submit"]');
  await page.waitForSelector('#app:not([hidden])');
  return { ctx, page };
}
const contagem = (painel) => painel.evaluate(() => Number(document.getElementById('k-total').textContent));

async function jogar(page, plano, whats) {
  await page.click('#tela-descanso', { position: { x: 200, y: 600 } });
  await page.waitForSelector('#tela-cadastro.ativa');
  await page.fill('#f-nome', `Pessoa ${whats.slice(-4)}`); await page.fill('#f-whats', whats);
  await page.fill('#f-placa', `ABC${whats.slice(-4, -3)}D${whats.slice(-2)}`.replace(/[^A-Z0-9]/g, '0').slice(0, 7));
  await page.click('#f-assoc [data-v="nao"]'); await page.click('.lgpd'); await page.click('#btn-comecar');
  await page.waitForSelector('#modal:not([hidden]), #tela-quiz.ativa', { timeout: 10000 });
  if (await page.isVisible('#modal')) await page.click('#modal-ok');
  const total = await page.waitForFunction(() => window.__quiz.partida().length).then((h) => h.jsonValue());
  for (let i = 0; i < total; i++) {
    await page.waitForFunction((k) => document.querySelector('#tela-quiz.ativa') && document.querySelector('#q-num').textContent === String(k + 1).padStart(2, '0')
      && document.querySelectorAll('#q-opcoes .opcao').length && !document.querySelector('#aviso-chopp.mostra'), i, { timeout: 20000 });
    await page.waitForTimeout(800);
    const q = await page.evaluate((k) => window.__quiz.partida()[k], i);
    await page.click(`#q-opcoes .opcao:nth-child(${(plano[i] ? q.correta : (q.correta + 1) % q.opcoes.length) + 1})`);
  }
  await page.waitForSelector('#tela-resultado.ativa', { timeout: 20000 });
  return page.evaluate(() => JSON.parse(localStorage.getItem('eg_leads')).at(-1));
}

test('evento completo: online, sem internet, desligado, painel ao vivo, entrega e limpeza', async () => {
  const painel = await abrirPainel();
  assert.equal(await contagem(painel.page), 0);

  // 1) tablet com internet: ganha o chopp e o painel recebe na hora
  const tablet = await novoContexto();
  let totem = await abrirTotem(tablet);
  const l1 = await jogar(totem, [1, 1, 1, 1, 1], '11900000001');
  assert.equal(l1.ganhouChopp, true);
  await painel.page.waitForFunction(() => Number(document.getElementById('k-total').textContent) === 1, null, { timeout: 15000 });
  await painel.page.waitForFunction(() => Number(document.getElementById('k-chopps').textContent) === 1, null, { timeout: 15000 });

  // 2) tablet sem internet: a participação fica guardada e aparece como pendente
  await totem.click('#tela-resultado [data-acao="inicio"]'); await totem.waitForSelector('#tela-descanso.ativa');
  await tablet.setOffline(true);
  const l2 = await jogar(totem, [1, 1, 1, 0, 1], '11900000002');
  assert.equal(l2.ganhouChopp, false);
  await totem.waitForTimeout(2500);
  assert.equal(await contagem(painel.page), 1, 'sem internet o painel ainda não recebeu');
  assert.ok(await totem.evaluate(() => JSON.parse(localStorage.getItem('eg_leads')).filter((l) => !l._sync).length) >= 1, 'pendente no tablet');

  // 3) volta a internet: sincroniza sozinho
  await tablet.setOffline(false);
  await painel.page.waitForFunction(() => Number(document.getElementById('k-total').textContent) === 2, null, { timeout: 30000 });
  await totem.waitForFunction(() => JSON.parse(localStorage.getItem('eg_leads')).every((l) => l._sync), null, { timeout: 30000 });

  // 4) sem internet + tablet desligado (página fechada) antes de sincronizar; religa com internet
  await totem.click('#tela-resultado [data-acao="inicio"]'); await totem.waitForSelector('#tela-descanso.ativa');
  await tablet.setOffline(true);
  await jogar(totem, [0, 0, 0, 0, 0], '11900000003');
  await totem.close();
  await tablet.setOffline(false);
  totem = await abrirTotem(tablet);
  await painel.page.waitForFunction(() => Number(document.getElementById('k-total').textContent) === 3, null, { timeout: 40000 });

  // 5) balcão entrega o chopp; reenvio do tablet nunca desfaz a entrega
  await painel.page.click('[data-aba="participantes"]');
  await painel.page.selectOption('#filtro', 'pendente');
  await painel.page.click('[data-entregar][data-v="1"]');
  await painel.page.waitForFunction(() => document.querySelectorAll('#tabela tr').length === 0, null, { timeout: 10000 });
  await totem.evaluate(() => { const ls = JSON.parse(localStorage.getItem('eg_leads')); ls.forEach((l) => { l._sync = false; }); localStorage.setItem('eg_leads', JSON.stringify(ls)); });
  await totem.reload(); await totem.waitForFunction(() => window.__egon);
  await totem.waitForTimeout(8000); // reenvio automático acontece 5 s depois de abrir
  await painel.page.click('[data-aba="visao"]');
  assert.equal(await painel.page.textContent('#k-entregues'), '1', 'entrega continua registrada');

  // 6) limpeza dos testes: senha errada não apaga; com senha 123 apaga painel e totens
  await painel.page.click('[data-aba="config"]');
  await painel.page.click('#c-limpar');
  await painel.page.fill('#limpar-senha', '999'); await painel.page.check('#limpar-ciente'); await painel.page.click('#limpar-confirmar');
  assert.match(await painel.page.textContent('#limpar-erro'), /senha incorreta/i);
  assert.equal(await contagem(painel.page), 3);
  // um tablet que ficou offline com um teste antigo na fila...
  const tablet2 = await novoContexto(); const totem2 = await abrirTotem(tablet2);
  await tablet2.setOffline(true);
  await jogar(totem2, [1, 1, 1, 1, 1], '11900000004');
  await painel.page.fill('#limpar-senha', '123'); await painel.page.click('#limpar-confirmar');
  await painel.page.waitForSelector('#dlg-limpar[hidden]', { state: 'attached', timeout: 20000 });
  await painel.page.click('[data-aba="visao"]');
  await painel.page.waitForFunction(() => Number(document.getElementById('k-total').textContent) === 0 && Number(document.getElementById('k-chopps').textContent) === 0, null, { timeout: 15000 });
  await totem.waitForFunction(() => JSON.parse(localStorage.getItem('eg_leads') || '[]').length === 0, null, { timeout: 15000 });
  // ...volta a internet depois da limpeza: o teste antigo chega, mas é ignorado
  await tablet2.setOffline(false);
  await totem2.waitForTimeout(12000);
  assert.equal(await contagem(painel.page), 0, 'teste anterior à limpeza não volta ao painel');

  // 7) depois da limpeza, participação nova entra normalmente
  await totem.click('#tela-descanso', { position: { x: 200, y: 600 } }).catch(() => {});
  await totem.goto(`${base}/index.html`); await totem.waitForFunction(() => window.__egon && !document.body.classList.contains('carregando'));
  await jogar(totem, [1, 1, 1, 1, 1], '11900000005');
  await painel.page.waitForFunction(() => Number(document.getElementById('k-total').textContent) === 1, null, { timeout: 15000 });

  await painel.ctx.close(); await tablet.close(); await tablet2.close();
});
