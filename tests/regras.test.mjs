// Testes das regras do quiz. Rodar com: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REGRAS_PADRAO, normalizarRegras, validarRegras, sortearPartida, avaliar, apresentar, chaveConjunto, limiteRecentes, gerarCodigo,
} from '../src/regras.js';
import { BANCO_PADRAO, migrarConfig } from '../src/banco.js';

// gerador previsível para os testes
function semente(s) { return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

// escolhe a resposta certa (true) ou uma errada (false) em cada pergunta, pela posição na tela
const escolher = (partida, plano) => partida.map((q, i) => (plano[i] ? q.correta : (q.correta + 1) % q.opcoes.length));
const partidaPadrao = (s = 1) => sortearPartida(BANCO_PADRAO, REGRAS_PADRAO, { rng: semente(s) });

test('banco tem as 5 perguntas do PDF + 15 novas, sem ids ou enunciados repetidos', () => {
  assert.equal(BANCO_PADRAO.length, 20);
  assert.equal(new Set(BANCO_PADRAO.map((p) => p.id)).size, 20);
  assert.equal(new Set(BANCO_PADRAO.map((p) => p.texto.toLowerCase())).size, 20);
  assert.deepEqual(BANCO_PADRAO.slice(0, 5).map((p) => p.correta), [0, 1, 0, 1, 1]);
  BANCO_PADRAO.slice(5).forEach((p) => assert.equal(p.correta, 0, `${p.id}: a primeira alternativa é a certa`));
});

test('partida padrão: 5 perguntas, 2 de aquecimento primeiro e 3 valendo chopp no fim', () => {
  const p = partidaPadrao();
  assert.equal(p.length, 5);
  assert.deepEqual(p.map((q) => q.etapa), ['aquecimento', 'aquecimento', 'decisiva', 'decisiva', 'decisiva']);
  assert.deepEqual(p.map((q) => q.valeChopp), [false, false, true, true, true]);
});

test('caso 1: acerta o aquecimento e as 3 decisivas -> ganha', () => {
  const p = partidaPadrao(2); const r = avaliar(p, escolher(p, [1, 1, 1, 1, 1]), REGRAS_PADRAO);
  assert.equal(r.acertosDecisivas, 3); assert.equal(r.cumpriuRegra, true);
});

test('caso 2: erra uma pergunta decisiva -> não ganha', () => {
  for (const plano of [[1, 1, 0, 1, 1], [1, 1, 1, 0, 1], [1, 1, 1, 1, 0]]) {
    const p = partidaPadrao(3); assert.equal(avaliar(p, escolher(p, plano), REGRAS_PADRAO).cumpriuRegra, false);
  }
});

test('caso 3: acerta só 2 decisivas -> não ganha no padrão', () => {
  const p = partidaPadrao(4); const r = avaliar(p, escolher(p, [1, 1, 1, 1, 0]), REGRAS_PADRAO);
  assert.equal(r.acertosDecisivas, 2); assert.equal(r.cumpriuRegra, false);
});

test('caso 4: acerta só 1 decisiva -> não ganha', () => {
  const p = partidaPadrao(5); const r = avaliar(p, escolher(p, [1, 1, 0, 1, 0]), REGRAS_PADRAO);
  assert.equal(r.acertosDecisivas, 1); assert.equal(r.cumpriuRegra, false);
});

test('caso 5: erra as 3 decisivas -> não ganha', () => {
  const p = partidaPadrao(6); const r = avaliar(p, escolher(p, [1, 1, 0, 0, 0]), REGRAS_PADRAO);
  assert.equal(r.acertosDecisivas, 0); assert.equal(r.cumpriuRegra, false);
});

test('caso 6: acerta todo o aquecimento mas erra uma decisiva -> não ganha; e errar o aquecimento não tira o prêmio', () => {
  const p = partidaPadrao(7);
  const r = avaliar(p, escolher(p, [1, 1, 1, 0, 1]), REGRAS_PADRAO);
  assert.equal(r.acertosAquecimento, 2); assert.equal(r.cumpriuRegra, false);
  const r2 = avaliar(p, escolher(p, [0, 0, 1, 1, 1]), REGRAS_PADRAO);
  assert.equal(r2.acertosAquecimento, 0); assert.equal(r2.cumpriuRegra, true);
});

test('caso 7: embaralhar alternativas não muda qual é a certa', () => {
  const rng = semente(8);
  for (const orig of BANCO_PADRAO) {
    for (let k = 0; k < 10; k++) {
      const q = apresentar(orig, 'decisiva', rng);
      assert.equal(q.opcoes[q.correta], orig.opcoes[orig.correta]);
      assert.equal(q.respostaCorreta, orig.opcoes[orig.correta]);
      assert.deepEqual([...q.opcoes].sort(), [...orig.opcoes].sort());
    }
  }
  // e alguma vez a certa sai de posição (o embaralhamento acontece de verdade)
  const posicoes = new Set(Array.from({ length: 30 }, () => apresentar(BANCO_PADRAO[5], 'decisiva', rng).correta));
  assert.ok(posicoes.size > 1);
});

test('acerto depende da alternativa, não da posição: escolher a posição antiga da certa não conta', () => {
  const orig = BANCO_PADRAO[5]; // certa era a posição 0
  const rng = semente(9); let q; do q = apresentar(orig, 'decisiva', rng); while (q.correta === 0);
  const r = avaliar([q], [0], { ...REGRAS_PADRAO, totalPerguntas: 1, aquecimento: 0, decisivas: 1, acertosParaGanhar: 1 });
  assert.equal(r.respostas[0].acertou, false);
});

test('caso 8: sorteio sem repetir pergunta na mesma partida', () => {
  for (let s = 1; s <= 200; s++) {
    const p = partidaPadrao(s); assert.equal(new Set(p.map((q) => q.id)).size, p.length);
  }
});

test('caso 9: evita repetir conjuntos recentes enquanto há combinações', () => {
  const rng = semente(10); const recentes = [];
  const limite = limiteRecentes(BANCO_PADRAO.length, 5);
  for (let i = 0; i < 40; i++) {
    const chave = chaveConjunto(sortearPartida(BANCO_PADRAO, REGRAS_PADRAO, { recentes, rng }).map((q) => q.id));
    assert.ok(!recentes.includes(chave), `conjunto repetido na partida ${i + 1}`);
    recentes.unshift(chave); recentes.length = Math.min(recentes.length, limite);
  }
  // banco pequeno: com só 1 combinação possível, o sorteio não trava
  const pequeno = BANCO_PADRAO.slice(0, 5);
  assert.equal(limiteRecentes(5, 5), 0);
  const chave = chaveConjunto(pequeno.map((p) => p.id));
  assert.equal(chaveConjunto(sortearPartida(pequeno, REGRAS_PADRAO, { recentes: [chave], rng }).map((q) => q.id)), chave);
});

test('caso 12: cupom só para quem cumpre a regra, com código de 4 caracteres sem letras confusas', () => {
  const p = partidaPadrao(11);
  for (const [plano, ganha] of [[[1, 1, 1, 1, 1], true], [[1, 1, 1, 1, 0], false], [[0, 0, 0, 0, 0], false]]) {
    const r = avaliar(p, escolher(p, plano), REGRAS_PADRAO);
    const codigo = r.cumpriuRegra ? gerarCodigo(semente(12)) : '';
    assert.equal(Boolean(codigo), ganha);
  }
  const c = gerarCodigo(semente(13)); assert.match(c, /^[A-HJ-NP-Z2-9]{4}$/);
  // pergunta sem resposta (falha de tela) nunca vira vitória
  const r = avaliar(p, [p[0].correta, p[1].correta, p[2].correta, p[3].correta, undefined], REGRAS_PADRAO);
  assert.equal(r.cumpriuRegra, false);
});

test('caso 14: respeita as regras configuradas no painel', () => {
  const regras = { totalPerguntas: 6, aquecimento: 2, decisivas: 4, acertosParaGanhar: 3, sorteio: true };
  assert.deepEqual(validarRegras(normalizarRegras(regras), 20), []);
  const p = sortearPartida(BANCO_PADRAO, regras, { rng: semente(14) });
  assert.equal(p.length, 6); assert.equal(p.filter((q) => q.valeChopp).length, 4);
  assert.equal(avaliar(p, escolher(p, [0, 0, 1, 1, 1, 0]), regras).cumpriuRegra, true);   // 3 de 4 basta
  assert.equal(avaliar(p, escolher(p, [1, 1, 1, 1, 0, 0]), regras).cumpriuRegra, false);  // 2 de 4 não
  // sem sorteio: usa o banco na ordem e não embaralha alternativas
  const fixa = sortearPartida(BANCO_PADRAO, { ...REGRAS_PADRAO, sorteio: false });
  assert.deepEqual(fixa.map((q) => q.id), ['pdf-1', 'pdf-2', 'pdf-3', 'pdf-4', 'pdf-5']);
  assert.deepEqual(fixa.map((q) => q.correta), [0, 1, 0, 1, 1]);
  // perguntas desativadas ficam fora do sorteio
  const banco = BANCO_PADRAO.map((q) => ({ ...q, ativa: !q.id.startsWith('pdf') }));
  for (let s = 1; s < 30; s++) assert.ok(sortearPartida(banco, REGRAS_PADRAO, { rng: semente(s) }).every((q) => q.id.startsWith('extra')));
});

test('validação das configurações antes de salvar', () => {
  assert.ok(validarRegras(normalizarRegras({ totalPerguntas: 5, aquecimento: 2, decisivas: 2, acertosParaGanhar: 2 }), 20).length > 0, 'soma diferente do total');
  assert.ok(validarRegras(normalizarRegras({ totalPerguntas: 5, aquecimento: 2, decisivas: 3, acertosParaGanhar: 4 }), 20).length > 0, 'acertos acima das decisivas');
  assert.ok(validarRegras(normalizarRegras({ totalPerguntas: 5, aquecimento: 2, decisivas: 3, acertosParaGanhar: 3 }), 4).length > 0, 'banco menor que a partida');
  assert.deepEqual(validarRegras(normalizarRegras({}), 20), []);
});

test('configuração antiga (5 perguntas, sem banco) vira banco com 20 e regra padrão', () => {
  const antiga = { pausado: false, limiteChopps: 50, perguntas: BANCO_PADRAO.slice(0, 5).map(({ id, ativa, ...p }) => ({ ...p, valeChopp: true })) };
  const c = migrarConfig(antiga);
  assert.equal(c.banco.length, 20); assert.equal(c.limiteChopps, 50);
  assert.deepEqual(c.banco.slice(0, 5).map((p) => p.id), ['pdf-1', 'pdf-2', 'pdf-3', 'pdf-4', 'pdf-5']);
  assert.equal(c.totalPerguntas, 5); assert.equal(c.aquecimento, 2); assert.equal(c.decisivas, 3); assert.equal(c.acertosParaGanhar, 3);
  assert.equal('perguntas' in c, false);
});
