// Teclado próprio do quiz (modo tablet), nas cores da Exclusive Gold.
// Nome: só letras (com acento) e espaço · WhatsApp: só números · Placa: letras e números.
// O teclado do sistema não abre (inputmode="none"), sem sugestões nem corretor.
const LAYOUTS = {
  nome: [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ç'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
    ['Á', 'Â', 'Ã', 'À', 'É', 'Ê', 'Í', 'Ó', 'Ô', 'Õ', 'Ú'],
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
const ROTULO = { '⌫': 'Apagar', '␣': 'Espaço', '→': 'Próximo', '✓': 'Pronto' };

// Nome com inicial maiúscula em cada palavra ("maria da silva" -> "Maria Da Silva" fica a cargo de quem digita: só a 1ª letra de cada palavra sobe)
const letraNome = (atual, k) => ((!atual || atual.endsWith(' ')) ? k : k.toLocaleLowerCase('pt-BR'));

export function criarTeclado({ campos, aoProximo, aoAbrir, aoFechar, tocar }) {
  const el = document.createElement('div');
  el.className = 'teclado'; el.hidden = true; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Teclado');
  el.innerHTML = '<div class="tec-topo"><span class="tec-titulo"></span><button type="button" class="tec-fechar" data-k="fechar">Fechar ✕</button></div><div class="tec-teclas"></div>';
  document.body.appendChild(el);
  let alvo = null; let tipo = null;

  campos.forEach(([inp, t]) => {
    inp.setAttribute('inputmode', 'none'); inp.setAttribute('autocomplete', 'off'); inp.setAttribute('autocorrect', 'off');
    inp.setAttribute('spellcheck', 'false'); inp.setAttribute('autocapitalize', 'off');
    inp.addEventListener('focus', () => abrir(inp, t));
    inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== alvo) fechar(); }, 60));
  });

  function desenhar() {
    el.dataset.tipo = tipo;
    el.querySelector('.tec-titulo').textContent = alvo?.closest('.campo')?.querySelector('.campo-rotulo')?.textContent || (tipo === 'placa' ? 'Placa' : '');
    el.querySelector('.tec-teclas').innerHTML = LAYOUTS[tipo].map((linha) => `<div class="tec-linha">${linha.map((k) => {
      const especial = ROTULO[k];
      return `<button type="button" class="tec${especial ? ` tec-${{ '⌫': 'apagar', '␣': 'espaco', '→': 'prox', '✓': 'prox' }[k]}` : ''}" data-k="${k}" aria-label="${especial || k}">${k === '␣' ? 'espaço' : k === '→' ? 'Próximo →' : k === '✓' ? 'Pronto ✓' : k}</button>`;
    }).join('')}</div>`).join('');
  }
  function abrir(inp, t) {
    const mudou = tipo !== t; alvo = inp; tipo = t;
    if (mudou || el.hidden) desenhar();
    if (el.hidden) { el.hidden = false; requestAnimationFrame(() => el.classList.add('aberto')); }
    aoAbrir?.(el);
  }
  function fechar() {
    if (el.hidden) return;
    el.classList.remove('aberto'); alvo = null;
    setTimeout(() => { if (!alvo) el.hidden = true; }, 220);
    aoFechar?.();
  }
  function digitar(k) {
    const inp = alvo; if (!inp) return;
    let v = inp.value;
    if (k === '⌫') v = v.slice(0, -1);
    else if (k === '␣') { if (v && !v.endsWith(' ')) v += ' '; }
    else if (tipo === 'nome') v += letraNome(v, k);
    else v += k;
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* sem cursor */ }
  }
  // tocar numa tecla não tira o foco do campo
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); });
  el.addEventListener('mousedown', (e) => e.preventDefault());
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k]'); if (!b) return;
    const k = b.dataset.k; tocar?.('toque');
    b.classList.remove('apertou'); void b.offsetWidth; b.classList.add('apertou');
    if (k === 'fechar') { alvo?.blur(); fechar(); return; }
    if (k === '→' || k === '✓') { const inp = alvo; aoProximo?.(inp, tipo); return; }
    digitar(k);
  });
  // segurar o apagar apaga em sequência
  let repete = null;
  el.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-k="⌫"]'); if (!b) return;
    clearInterval(repete); const t0 = Date.now();
    repete = setInterval(() => { if (Date.now() - t0 > 450) digitar('⌫'); }, 70);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => el.addEventListener(ev, () => clearInterval(repete)));

  return {
    el,
    get aberto() { return !el.hidden; },
    topo() { return el.hidden ? innerHeight : innerHeight - el.offsetHeight; },
    fechar() { alvo?.blur(); fechar(); },
  };
}
