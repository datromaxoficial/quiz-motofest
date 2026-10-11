// Regras do jogo, sem tela e sem banco de dados: sorteio, embaralhamento, avaliação e cupom.
// O totem e o painel usam este arquivo, e os testes automáticos também (tests/regras.test.mjs).

// Regra padrão do Motofest: 5 perguntas, 2 de aquecimento, 3 valendo chopp, precisa acertar as 3.
export const REGRAS_PADRAO = { totalPerguntas: 5, aquecimento: 2, decisivas: 3, acertosParaGanhar: 3, sorteio: true };

const inteiro = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null ? Math.trunc(Number(v)) : d);

export function normalizarRegras(c = {}) {
  return {
    totalPerguntas: inteiro(c.totalPerguntas, REGRAS_PADRAO.totalPerguntas),
    aquecimento: inteiro(c.aquecimento, REGRAS_PADRAO.aquecimento),
    decisivas: inteiro(c.decisivas, REGRAS_PADRAO.decisivas),
    acertosParaGanhar: inteiro(c.acertosParaGanhar, REGRAS_PADRAO.acertosParaGanhar),
    sorteio: c.sorteio !== false,
  };
}

// Lista de problemas (vazia = pode salvar).
export function validarRegras(r, perguntasAtivas) {
  const erros = [];
  if (r.totalPerguntas < 1) erros.push('O total de perguntas precisa ser pelo menos 1.');
  if (r.aquecimento < 0) erros.push('O aquecimento não pode ser negativo.');
  if (r.decisivas < 1) erros.push('Precisa de pelo menos 1 pergunta valendo chopp.');
  if (r.aquecimento + r.decisivas !== r.totalPerguntas) erros.push(`Aquecimento (${r.aquecimento}) + valendo chopp (${r.decisivas}) precisa ser igual ao total (${r.totalPerguntas}).`);
  if (r.acertosParaGanhar < 1 || r.acertosParaGanhar > r.decisivas) erros.push(`Os acertos para ganhar precisam estar entre 1 e ${Math.max(1, r.decisivas)}.`);
  if (perguntasAtivas !== undefined && perguntasAtivas < r.totalPerguntas) erros.push(`O banco tem ${perguntasAtivas} perguntas ativas, menos que as ${r.totalPerguntas} de uma partida.`);
  return erros;
}

export function validarPergunta(p) {
  if (!String(p.texto || '').trim()) return 'falta o enunciado';
  if (!Array.isArray(p.opcoes) || p.opcoes.length < 2) return 'precisa de pelo menos 2 alternativas';
  if (p.opcoes.some((o) => !String(o || '').trim())) return 'há alternativa em branco';
  if (new Set(p.opcoes.map((o) => String(o).trim().toLowerCase())).size !== p.opcoes.length) return 'há alternativas repetidas';
  if (!(p.correta >= 0 && p.correta < p.opcoes.length)) return 'falta marcar a resposta certa';
  return '';
}

export function embaralhar(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export const chaveConjunto = (ids) => [...ids].sort().join('|');

// Prepara uma pergunta para a tela: alternativas embaralhadas e o índice da certa recalculado.
// A certa é identificada pelo índice ORIGINAL guardado em `ordem`, nunca pela posição na tela.
export function apresentar(p, etapa, rng = Math.random, embaralharOpcoes = true) {
  const ordem = embaralharOpcoes ? embaralhar(p.opcoes.map((_, i) => i), rng) : p.opcoes.map((_, i) => i);
  return {
    id: p.id, tag: p.tag || '', texto: p.texto, etapa, valeChopp: etapa === 'decisiva',
    opcoes: ordem.map((i) => p.opcoes[i]),
    ordem,                                  // ordem[k] = índice original da alternativa mostrada na posição k
    correta: ordem.indexOf(p.correta),      // posição da certa na tela
    corretaOriginal: p.correta,
    respostaCorreta: p.opcoes[p.correta],
  };
}

// Sorteia uma partida: perguntas diferentes, aquecimento primeiro e as que valem chopp no fim.
// `recentes` = chaves de conjuntos usados há pouco; tenta não repetir enquanto houver alternativa.
export function sortearPartida(banco, regras, { recentes = [], rng = Math.random, tentativas = 60 } = {}) {
  const r = normalizarRegras(regras);
  const ativas = banco.filter((p) => p.ativa !== false && !validarPergunta(p));
  const n = Math.min(r.totalPerguntas, ativas.length);
  let escolhidas;
  if (!r.sorteio) {
    escolhidas = ativas.slice(0, n);
  } else {
    const usados = new Set(recentes);
    for (let t = 0; t < tentativas; t++) {
      escolhidas = embaralhar(ativas, rng).slice(0, n);
      if (!usados.has(chaveConjunto(escolhidas.map((p) => p.id)))) break;
    }
  }
  const qtdAquec = Math.max(0, Math.min(r.aquecimento, n - 1));
  return escolhidas.map((p, i) => apresentar(p, i < qtdAquec ? 'aquecimento' : 'decisiva', rng, r.sorteio));
}

// Quantos conjuntos recentes guardar sem impedir o sorteio (nunca todos os possíveis).
export function limiteRecentes(tamanhoBanco, porPartida) {
  let comb = 1;
  for (let i = 0; i < porPartida; i++) comb = (comb * (tamanhoBanco - i)) / (i + 1);
  return Math.max(0, Math.min(50, Math.floor(comb) - 1));
}

// Corrige uma partida a partir das escolhas (posição na tela de cada pergunta).
// O resultado do prêmio usa SÓ as perguntas decisivas.
export function avaliar(partida, escolhas, regras) {
  const r = normalizarRegras(regras);
  const respostas = partida.map((q, i) => {
    const escolha = escolhas[i];
    const respondeu = Number.isInteger(escolha) && escolha >= 0 && escolha < q.opcoes.length;
    const acertou = respondeu && q.ordem[escolha] === q.corretaOriginal;
    return {
      pergunta: i + 1, id: q.id, etapa: q.etapa, valeChopp: q.valeChopp, texto: q.texto,
      opcoes: q.opcoes, escolha: respondeu ? escolha : null, resposta: respondeu ? q.opcoes[escolha] : null,
      correta: q.correta, respostaCorreta: q.respostaCorreta, acertou,
    };
  });
  const aquec = respostas.filter((x) => x.etapa === 'aquecimento');
  const decis = respostas.filter((x) => x.etapa === 'decisiva');
  const acertosDecisivas = decis.filter((x) => x.acertou).length;
  const necessarios = Math.min(r.acertosParaGanhar, decis.length);
  return {
    respostas,
    acertos: respostas.filter((x) => x.acertou).length,
    total: respostas.length,
    acertosAquecimento: aquec.filter((x) => x.acertou).length,
    totalAquecimento: aquec.length,
    acertosDecisivas,
    totalDecisivas: decis.length,
    acertosNecessarios: necessarios,
    cumpriuRegra: decis.length > 0 && acertosDecisivas >= necessarios && respostas.every((x) => x.escolha !== null),
  };
}

const LETRAS_CUPOM = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0 e I/1, que confundem
export function gerarCodigo(rng) {
  const n = rng ? Array.from({ length: 4 }, () => Math.floor(rng() * 2 ** 32))
    : Array.from(crypto.getRandomValues(new Uint32Array(4)));
  return n.map((v) => LETRAS_CUPOM[v % LETRAS_CUPOM.length]).join('');
}
