// Camada de dados compartilhada entre o totem e o painel.
// Com window.FIREBASE_CONFIG preenchido (config.js) usa Firestore com cache offline
// (modo híbrido: grava no tablet e sincroniza quando a internet voltar).
// Sem config, roda em modo demonstração usando só o localStorage deste navegador.
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator,
  doc, setDoc, updateDoc, getDoc, getDocs, writeBatch, onSnapshot, collection, query, orderBy, increment, serverTimestamp,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut, connectAuthEmulator } from 'firebase/auth';

import { migrarConfig } from './banco.js';

// Configuração padrão: regras do jogo (5 perguntas, 2 de aquecimento, 3 valendo chopp, acertar as 3) e banco com 20 perguntas.
export const DEFAULT_CONFIG = migrarConfig(null);

// Nos testes automáticos a nuvem é o emulador oficial do Firebase (window.FIREBASE_CONFIG_TESTE).
// window.FORCAR_DEMO: testes automáticos que não podem tocar no Firebase de produção.
// No computador (localhost) com ?demo na URL: prévia para aprovar, só neste navegador, sem gravar na nuvem.
if (typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('demo')) window.FORCAR_DEMO = true;
const cfg = typeof window !== 'undefined' && !window.FORCAR_DEMO ? (window.FIREBASE_CONFIG_TESTE || window.FIREBASE_CONFIG) : null;
export const modoDemo = !(cfg && cfg.apiKey && cfg.projectId);

let db = null;
let auth = null;
if (!modoDemo) {
  const app = initializeApp(cfg);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  auth = getAuth(app);
  if (window.FIREBASE_EMULADOR) {
    connectFirestoreEmulator(db, window.FIREBASE_EMULADOR, 8080);
    connectAuthEmulator(auth, `http://${window.FIREBASE_EMULADOR}:9099`, { disableWarnings: true });
  }
}

// ---------- utilidades locais ----------
const LS = { leads: 'eg_leads', config: 'eg_config', stats: 'eg_stats', limpeza: 'eg_limpeza' };
const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

const mesclarConfig = (c) => migrarConfig(c);

// Avisa ouvintes da mesma página e de outras abas (modo demo).
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());
if (typeof window !== 'undefined') window.addEventListener('storage', avisar);

// ---------- configuração do quiz ----------
export function observarConfig(cb) {
  if (modoDemo) {
    const f = () => cb(mesclarConfig(ler(LS.config, null)));
    f(); ouvintes.add(f);
    return () => ouvintes.delete(f);
  }
  return onSnapshot(doc(db, 'config', 'quiz'),
    (s) => { const d = s.exists() ? s.data() : null; if (d) gravar(LS.config, d); cb(mesclarConfig(d || ler(LS.config, null))); },
    () => cb(mesclarConfig(ler(LS.config, null))));
}

export async function salvarConfig(c) {
  gravar(LS.config, c);
  if (modoDemo) { avisar(); return; }
  await setDoc(doc(db, 'config', 'quiz'), c);
}

// ---------- contador de chopps ----------
export function observarStats(cb) {
  if (modoDemo) {
    const f = () => cb({ chopps: ler(LS.stats, { chopps: 0 }).chopps || 0 });
    f(); ouvintes.add(f);
    return () => ouvintes.delete(f);
  }
  return onSnapshot(doc(db, 'stats', 'main'),
    (s) => cb({ chopps: (s.exists() && s.data().chopsGiven) || 0 }),
    () => cb({ chopps: 0 }));
}

export async function zerarChopps() {
  gravar(LS.stats, { chopps: 0 });
  if (modoDemo) { avisar(); return; }
  await setDoc(doc(db, 'stats', 'main'), { chopsGiven: 0 });
}

// ---------- leads ----------
// Backup local de tudo que o totem capturou. Enquanto não chega na nuvem fica completo;
// depois de confirmado, vira um resumo pequeno (para o tablet não lotar a memória em 3 dias de evento).
export const leadsLocais = () => ler(LS.leads, []);
const resumoLocal = (l) => ({ id: l.id, status: l.status, whatsapp: l.whatsapp, placa: l.placa, nome: l.nome, ganhouChopp: l.ganhouChopp, clientTime: l.clientTime, _sync: true });

const completos = () => leadsLocais().filter((l) => l.status !== 'incompleto');
// Participação vale depois da limpeza se o tablet já tinha aplicado essa limpeza (marca) ou se foi feita depois dela
// (relógio). Assim um tablet com relógio atrasado não perde participações reais.
export const depoisDaLimpeza = (l, corte) => !corte || (Number(l.limpeza) || 0) >= corte || (Number(l.clientTime) || 0) >= corte;

// Mesmo WhatsApp já terminou uma partida neste tablet.
export function jaJogou(whatsapp) {
  return completos().some((l) => whatsapp && l.whatsapp === whatsapp);
}

// Placa já usada por outra participação (neste tablet ou, com a nuvem ligada, em qualquer totem).
// Na nuvem só existe um contador por placa: nenhum dado pessoal é lido pelo totem.
export async function placaJaRegistrada(placa) {
  if (!placa) return false;
  if (completos().some((l) => l.placa === placa)) return true;
  if (modoDemo) return false;
  try {
    const s = await Promise.race([getDoc(doc(db, 'placas', placa)), new Promise((_, rej) => setTimeout(rej, 1800))]);
    return s.exists() && (s.data().n || 0) > 0;
  } catch { return false; }
}

export function pendentes() {
  return leadsLocais().filter((l) => !l._sync).length;
}

function marcarSincronizado(id) {
  const ls = leadsLocais();
  const i = ls.findIndex((x) => x.id === id);
  if (i >= 0) { ls[i] = resumoLocal(ls[i]); gravar(LS.leads, ls); }
}

export function salvarLead(lead) {
  lead = { ...lead, limpeza: Number(ler(LS.limpeza, 0)) || 0 };
  const ls = leadsLocais();
  ls.push({ ...lead, _sync: modoDemo });
  if (!gravar(LS.leads, ls) && !modoDemo) {
    // memória do navegador cheia: compacta o que já está na nuvem e tenta de novo
    gravar(LS.leads, ls.map((l) => (l._sync ? resumoLocal(l) : l)));
  }
  if (modoDemo) {
    if (lead.ganhouChopp) gravar(LS.stats, { chopps: (ler(LS.stats, { chopps: 0 }).chopps || 0) + 1 });
    avisar();
    return;
  }
  // Sem await: offline o Firestore guarda na fila (no próprio tablet) e envia quando a conexão voltar.
  enviando.add(lead.id);
  setDoc(doc(db, 'leads', lead.id), { ...lead, createdAt: serverTimestamp() })
    .then(() => marcarSincronizado(lead.id))
    .catch((e) => console.warn('lead não enviado', e))
    .finally(() => enviando.delete(lead.id));
  if (lead.placa && lead.status !== 'incompleto') {
    setDoc(doc(db, 'placas', lead.placa), { n: increment(1) }, { merge: true }).catch(() => {});
  }
  if (lead.ganhouChopp) {
    setDoc(doc(db, 'stats', 'main'), { chopsGiven: increment(1) }, { merge: true })
      .catch((e) => console.warn('contador não enviado', e));
  }
}

// Reenvia o que ainda não teve confirmação da nuvem (ex.: tablet desligado antes de sincronizar).
// Nunca reenvia a situação da entrega: quem manda nisso é o balcão (painel).
// Cada participação tem no máximo um envio em andamento: sem internet o Firestore já guarda o envio na fila
// do próprio tablet, então repetir a cada minuto só gastaria cota de gravação quando a conexão voltasse.
const enviando = new Set();
export function reenviarPendentes() {
  if (modoDemo) return;
  const corte = Number(ler(LS.limpeza, 0)) || 0;
  leadsLocais().filter((l) => !l._sync && !enviando.has(l.id) && depoisDaLimpeza(l, corte)).forEach((l) => {
    const { _sync, entregue, entregueEm, ...dados } = l;
    enviando.add(l.id);
    setDoc(doc(db, 'leads', l.id), dados, { merge: true })
      .then(() => marcarSincronizado(l.id))
      .catch(() => {})
      .finally(() => enviando.delete(l.id));
  });
}

// Balcão: marca (ou desmarca) que o chopp do cupom já foi entregue.
export async function marcarEntregue(id, entregue) {
  const dados = { entregue, entregueEm: entregue ? Date.now() : null };
  const ls = leadsLocais(); const l = ls.find((x) => x.id === id);
  if (l) { Object.assign(l, dados); gravar(LS.leads, ls); }
  if (modoDemo) { avisar(); return; }
  await updateDoc(doc(db, 'leads', id), dados);
}

export function observarLeads(cb, aoErro) {
  if (modoDemo) {
    const f = () => cb(leadsLocais().map(({ _sync, ...l }) => l));
    f(); ouvintes.add(f);
    return () => ouvintes.delete(f);
  }
  return onSnapshot(query(collection(db, 'leads'), orderBy('clientTime', 'desc')), { includeMetadataChanges: false },
    (s) => cb(s.docs.map((d) => d.data())),
    // Erro (sem internet demais ou limite do plano): mantém o que já está na tela e avisa; o painel tenta de novo.
    (e) => { console.error(e); aoErro?.(e); });
}

// ---------- limpar dados de teste (painel, com senha) ----------
// Apaga participações, contador de chopps e contador de placas, e avisa os totens (config.limpezaEm)
// para apagarem também a cópia local. Participações feitas antes da limpeza que chegarem depois
// (tablet que estava offline) são ignoradas pelo painel e não são reenviadas pelos totens.
export async function limparTudo(configAtual) {
  const limpezaEm = Date.now();
  if (modoDemo) {
    const n = leadsLocais().length;
    gravar(LS.leads, []); gravar(LS.stats, { chopps: 0 }); gravar(LS.limpeza, limpezaEm);
    gravar(LS.config, { ...ler(LS.config, {}), limpezaEm });
    avisar();
    return n;
  }
  let apagados = 0;
  for (const nome of ['leads', 'placas']) {
    const snap = await getDocs(collection(db, nome));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const lote = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
      await lote.commit();
    }
    if (nome === 'leads') apagados = snap.size;
  }
  await setDoc(doc(db, 'stats', 'main'), { chopsGiven: 0 });
  await salvarConfig({ ...configAtual, limpezaEm });
  return apagados;
}

// Totem: aplica uma limpeza feita no painel (uma vez por limpeza).
export function aplicarLimpeza(limpezaEm) {
  if (!limpezaEm || Number(ler(LS.limpeza, 0)) >= limpezaEm) return false;
  gravar(LS.leads, leadsLocais().filter((l) => (Number(l.clientTime) || 0) >= limpezaEm));
  gravar(LS.limpeza, limpezaEm);
  if (modoDemo) gravar(LS.stats, { chopps: 0 });
  return true;
}

// ---------- login do painel ----------
export function observarLogin(cb) {
  if (modoDemo) { cb({ email: 'demo' }); return () => {}; }
  return onAuthStateChanged(auth, cb);
}
export const entrar = (email, senha) => signInWithEmailAndPassword(auth, email, senha);
export const sair = () => (modoDemo ? Promise.resolve() : signOut(auth));
