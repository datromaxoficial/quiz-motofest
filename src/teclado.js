// Teclado próprio do quiz (modo tablet), nas cores da Exclusive Gold.
// Nome: só letras e espaço (acentos segurando a vogal ou o C, como no celular) · WhatsApp: só números · Placa: letras e números.
// Nenhum campo abre o teclado do sistema: no tablet os campos ficam somente leitura (readonly) e só este teclado escreve neles.
const LAYOUTS = {
  nome: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
    ['␣', '→'],
  ],
  whats: [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['⌫', '0', '→'],
  ],
  placa: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
    ['✓'],
  ],
};
// segurar a tecla abre o balão com as variações
const ACENTOS = { A: ['Á', 'Â', 'Ã', 'À'], E: ['É', 'Ê'], I: ['Í'], O: ['Ó', 'Ô', 'Õ'], U: ['Ú'], C: ['Ç'] };
const ESPECIAIS = { '⌫': 'apagar', '␣': 'espaco', '→': 'prox', '✓': 'prox' };
const ROTULO = { '⌫': 'Apagar', '␣': 'Espaço', '→': 'Próximo', '✓': 'Pronto' };
const TEXTO = { '␣': 'espaço', '→': 'Próximo', '✓': 'Pronto' };
const SEGURAR_MS = 380;

// Nome: a primeira letra de cada palavra sai maiúscula, o resto minúscula.
const letraNome = (atual, k) => ((!atual || atual.endsWith(' ')) ? k : k.toLocaleLowerCase('pt-BR'));

export function criarTeclado({ campos, aoProximo, aoAbrir, aoFechar, tocar }) {
  const el = document.createElement('div');
  el.className = 'teclado'; el.hidden = true; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Teclado');
  el.innerHTML = `<div class="tec-topo"><span class="tec-titulo"></span><button type="button" class="tec-fechar" data-k="fechar" aria-label="Fechar teclado"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    <div class="tec-teclas"></div><div class="tec-previa" hidden></div><div class="tec-acentos" hidden></div>`;
  document.body.appendChild(el);
  const previa = el.querySelector('.tec-previa'); const balao = el.querySelector('.tec-acentos');
  let alvo = null; let tipo = null;

  campos.forEach(([inp, t]) => {
    // somente leitura + sem "tel": nenhum navegador (nem o da Huawei) abre o teclado do sistema
    if (inp.type === 'tel') inp.type = 'text';
    inp.readOnly = true;
    inp.setAttribute('inputmode', 'none'); inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('spellcheck', 'false'); inp.setAttribute('autocapitalize', 'off');
    inp.addEventListener('focus', () => abrir(inp, t));
    inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== alvo) fechar(); }, 60));
  });

  function desenhar() {
    el.dataset.tipo = tipo;
    el.querySelector('.tec-titulo').textContent = alvo?.closest('.campo')?.querySelector('.campo-rotulo')?.textContent || (tipo === 'placa' ? 'Placa' : '');
    el.querySelector('.tec-teclas').innerHTML = LAYOUTS[tipo].map((linha) => `<div class="tec-linha">${linha.map((k) => {
      const esp = ESPECIAIS[k]; const ac = tipo === 'nome' && ACENTOS[k];
      return `<button type="button" class="tec${esp ? ` tec-${esp}` : ''}${ac ? ' tec-acento' : ''}" data-k="${k}" aria-label="${ROTULO[k] || k}">${
        k === '⌫' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h10a2 2 0 012 2v10a2 2 0 01-2 2H9l-6-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9.5l5 5M17 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
          : TEXTO[k] ? `${TEXTO[k]}${k === '→' ? ' <span aria-hidden="true">→</span>' : k === '✓' ? ' <span aria-hidden="true">✓</span>' : ''}` : k}</button>`;
    }).join('')}</div>`).join('');
  }
  function abrir(inp, t) {
    const mudou = tipo !== t; alvo = inp; tipo = t;
    if (mudou || el.hidden) desenhar();
    if (el.hidden || !el.classList.contains('aberto')) { el.hidden = false; requestAnimationFrame(() => { if (alvo) el.classList.add('aberto'); }); }
    aoAbrir?.(el, t);
  }
  function fechar() {
    if (el.hidden) return;
    fecharBalao(); el.classList.remove('aberto'); alvo = null;
    setTimeout(() => { if (!alvo) el.hidden = true; }, 220);
    aoFechar?.();
  }
  function digitar(k) {
    const inp = alvo; if (!inp) return;
    let v = inp.value;
    if (k === '⌫') v = v.slice(0, -1);
    else if (inp.maxLength > 0 && v.length >= inp.maxLength) return;
    else if (k === '␣') { if (v && !v.endsWith(' ')) v += ' '; }
    else if (tipo === 'nome') v += letraNome(v, k);
    else v += k;
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------- balão da tecla (prévia ao tocar) e balão de acentos (ao segurar) ----------
  const relativo = (b) => { const r = b.getBoundingClientRect(); const t = el.getBoundingClientRect(); return { x: r.left - t.left, y: r.top - t.top, w: r.width, h: r.height }; };
  function mostrarPrevia(b) {
    const k = b.dataset.k; if (ESPECIAIS[k] || tipo === 'whats') return;
    const r = relativo(b);
    previa.textContent = tipo === 'nome' ? letraNome(alvo?.value || '', k) : k;
    previa.style.cssText = `left:${r.x + r.w / 2}px;top:${r.y}px;--lk:${r.w}px`;
    previa.hidden = false;
  }
  const esconderPrevia = () => { previa.hidden = true; };
  let opcaoAtiva = null;
  function abrirBalao(b) {
    const k = b.dataset.k; const ops = ACENTOS[k]; if (!ops) return;
    esconderPrevia();
    const r = relativo(b);
    balao.innerHTML = ops.map((o) => `<button type="button" class="tec-op" data-op="${o}">${letraNome(alvo?.value || '', o)}</button>`).join('');
    balao.hidden = false;
    const bw = balao.offsetWidth; const tw = el.clientWidth;
    const x = Math.max(8, Math.min(tw - bw - 8, r.x + r.w / 2 - bw / 2));
    balao.style.left = `${x}px`; balao.style.top = `${r.y - balao.offsetHeight - 6}px`;
    marcarOpcao(balao.querySelector('.tec-op'));
    tocar?.('toque');
  }
  function marcarOpcao(o) { opcaoAtiva = o; balao.querySelectorAll('.tec-op').forEach((x) => x.classList.toggle('ativa', x === o)); }
  function fecharBalao() { balao.hidden = true; balao.innerHTML = ''; opcaoAtiva = null; }

  // tocar numa tecla nunca tira o foco do campo
  el.addEventListener('mousedown', (e) => e.preventDefault());
  let segurar = null; let segurou = false; let repete = null; let teclaAtual = null;
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const op = e.target.closest('.tec-op');
    if (op) { marcarOpcao(op); return; }
    if (!balao.hidden) fecharBalao();
    const b = e.target.closest('.tec[data-k]'); if (!b) return;
    teclaAtual = b; segurou = false;
    b.classList.add('apertada'); mostrarPrevia(b);
    clearTimeout(segurar); clearInterval(repete);
    if (tipo === 'nome' && ACENTOS[b.dataset.k]) segurar = setTimeout(() => { segurou = true; b.classList.remove('apertada'); abrirBalao(b); }, SEGURAR_MS);
    if (b.dataset.k === '⌫') { const t0 = Date.now(); repete = setInterval(() => { if (Date.now() - t0 > 450) { segurou = true; digitar('⌫'); } }, 70); }
  });
  el.addEventListener('pointermove', (e) => {
    if (balao.hidden) return;
    const o = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.tec-op');
    if (o) marcarOpcao(o);
  });
  const soltar = (e) => {
    clearTimeout(segurar); clearInterval(repete); esconderPrevia();
    teclaAtual?.classList.remove('apertada'); teclaAtual = null;
    // soltou com o balão de acentos aberto: digita a opção marcada (arrastando o dedo ou tocando nela)
    if (!balao.hidden && e?.type === 'pointerup') {
      const o = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.tec-op') || (segurou ? opcaoAtiva : null);
      if (o) { digitar(o.dataset.op); tocar?.('toque'); fecharBalao(); segurou = true; }
    }
  };
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);
  el.addEventListener('click', (e) => {
    if (segurou) { segurou = false; return; } // foi um "segurar": a letra já saiu pelo balão (ou foi o apagar contínuo)
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k; tocar?.('toque');
    if (k === 'fechar') { alvo?.blur(); fechar(); return; }
    if (k === '→' || k === '✓') { aoProximo?.(alvo, tipo); return; }
    digitar(k);
  });

  return {
    el,
    get aberto() { return !el.hidden; },
    topo() { return el.hidden ? innerHeight : innerHeight - el.offsetHeight; },
    fechar() { alvo?.blur(); fechar(); },
  };
}
