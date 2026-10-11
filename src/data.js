// Camada de dados compartilhada entre o totem e o painel.
// Com window.FIREBASE_CONFIG preenchido (config.js) usa Firestore com cache offline
// (modo híbrido: grava no tablet e sincroniza quando a internet voltar).
// Sem config, roda em modo demonstração usando só o localStorage deste navegador.
import { initializeApp } from 'firebase/app';
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  doc, setDoc, updateDoc, onSnapshot, collection, query, orderBy, increment, serverTimestamp,
} from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';

export const DEFAULT_CONFIG = {
  pausado: false,
  som: true,
  limiteChopps: 0,
  perguntas: [
    {
      tag: 'Conscientização',
      texto: 'Qual é o principal motivo de acidentes causados pelo uso do celular ao volante?',
      opcoes: ['Distração visual e de atenção', 'Aumento do consumo de combustível', 'Desgaste dos freios'],
      correta: 0, valeChopp: false,
    },
    {
      tag: 'Distância de segurança',
      texto: 'Em pistas molhadas ou em dias de chuva, o que deve ser feito em relação à distância do veículo da frente?',
      opcoes: ['Manter a mesma distância', 'Dobrar a distância de segurança', 'Colar no veículo para evitar derrapagens'],
      correta: 1, valeChopp: false,
    },
    {
      tag: 'Descanso',
      texto: 'Em viagens longas de moto ou carro, qual é o tempo máximo recomendado antes de fazer uma pausa para descanso?',
      opcoes: ['A cada 2 horas ou 200 km', 'Apenas quando o combustível acabar', 'A cada 5 horas ininterruptas'],
      correta: 0, valeChopp: true,
    },
    {
      tag: 'Prioridade',
      texto: 'No trânsito urbano, de quem é a prioridade máxima segundo o Código de Trânsito?',
      opcoes: ['Dos veículos de grande porte', 'Dos pedestres e ciclistas', 'De quem circula na via principal'],
      correta: 1, valeChopp: true,
    },
    {
      tag: 'Capacete',
      texto: 'Pilotar moto sem capacete com viseira ou óculos de proteção, ou com o capacete desatado, gera qual tipo de infração?',
      opcoes: ['Infração leve com advertência', 'Infração gravíssima, com multa e retenção da habilitação', 'Não é infração em vias urbanas'],
      correta: 1, valeChopp: true,
    },
  ],
};

const cfg = typeof window !== 'undefined' ? window.FIREBASE_CONFIG : null;
export const modoDemo = !(cfg && cfg.apiKey && cfg.projectId);

let db = null;
let auth = null;
if (!modoDemo) {
  const app = initializeApp(cfg);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager() }),
  });
  auth = getAuth(app);
}

// ---------- utilidades locais ----------
const LS = { leads: 'eg_leads', config: 'eg_config', stats: 'eg_stats' };
const ler = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cheio ou bloqueado */ } };

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Regra do chopp: valem chopp sempre as 3 últimas perguntas, e para ganhar é preciso acertar as 3.
export const PERGUNTAS_CHOPP = 3;
export const aplicarRegraChopp = (ps) => ps.map((p, i) => ({ ...p, valeChopp: i >= ps.length - PERGUNTAS_CHOPP }));
const mesclarConfig = (c) => ({
  ...DEFAULT_CONFIG, ...(c || {}),
  perguntas: aplicarRegraChopp((c && c.perguntas && c.perguntas.length) ? c.perguntas : DEFAULT_CONFIG.perguntas),
});

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
    (s) => cb(mesclarConfig(s.exists() ? s.data() : null)),
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
// Backup local de tudo que o totem capturou (nunca é apagado pelo app).
export const leadsLocais = () => ler(LS.leads, []);

export function jaJogou(whatsapp, placa) {
  return leadsLocais().some((l) => (whatsapp && l.whatsapp === whatsapp) || (placa && l.placa === placa));
}

export function pendentes() {
  return leadsLocais().filter((l) => !l._sync).length;
}

function marcarSincronizado(id) {
  const ls = leadsLocais();
  const l = ls.find((x) => x.id === id);
  if (l) { l._sync = true; gravar(LS.leads, ls); }
}

export function salvarLead(lead) {
  const ls = leadsLocais();
  ls.push({ ...lead, _sync: modoDemo });
  gravar(LS.leads, ls);
  if (modoDemo) {
    if (lead.ganhouChopp) gravar(LS.stats, { chopps: (ler(LS.stats, { chopps: 0 }).chopps || 0) + 1 });
    avisar();
    return;
  }
  // Sem await: offline o Firestore guarda na fila e envia quando a conexão voltar.
  setDoc(doc(db, 'leads', lead.id), { ...lead, createdAt: serverTimestamp() })
    .then(() => marcarSincronizado(lead.id))
    .catch((e) => console.warn('lead não enviado', e));
  if (lead.ganhouChopp) {
    setDoc(doc(db, 'stats', 'main'), { chopsGiven: increment(1) }, { merge: true })
      .catch((e) => console.warn('contador não enviado', e));
  }
}

// Reenvia leads que ficaram só no backup local (ex.: cache do navegador limpo antes de sincronizar).
export function reenviarPendentes() {
  if (modoDemo) return;
  leadsLocais().filter((l) => !l._sync).forEach((l) => {
    const { _sync, ...dados } = l;
    setDoc(doc(db, 'leads', l.id), { ...dados, createdAt: serverTimestamp() }, { merge: true })
      .then(() => marcarSincronizado(l.id))
      .catch(() => {});
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

export function observarLeads(cb) {
  if (modoDemo) {
    const f = () => cb(leadsLocais().map(({ _sync, ...l }) => l));
    f(); ouvintes.add(f);
    return () => ouvintes.delete(f);
  }
  return onSnapshot(query(collection(db, 'leads'), orderBy('clientTime', 'desc')),
    (s) => cb(s.docs.map((d) => d.data())),
    (e) => { console.error(e); cb([]); });
}

// ---------- login do painel ----------
export function observarLogin(cb) {
  if (modoDemo) { cb({ email: 'demo' }); return () => {}; }
  return onAuthStateChanged(auth, cb);
}
export const entrar = (email, senha) => signInWithEmailAndPassword(auth, email, senha);
export const sair = () => (modoDemo ? Promise.resolve() : signOut(auth));
