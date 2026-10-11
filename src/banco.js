// Banco de perguntas padrão. `correta` é o índice da alternativa certa ANTES do embaralhamento.
// As 5 primeiras são as do briefing do Motofest (PDF); as outras 15 foram acrescentadas depois.
import { REGRAS_PADRAO, normalizarRegras } from './regras.js';

const q = (id, tag, texto, opcoes, correta = 0) => ({ id, tag, texto, opcoes, correta, ativa: true });

export const BANCO_PADRAO = [
  q('pdf-1', 'Conscientização', 'Qual é o principal motivo de acidentes causados pelo uso do celular ao volante?',
    ['Distração visual e de atenção', 'Aumento do consumo de combustível', 'Desgaste dos freios'], 0),
  q('pdf-2', 'Distância de segurança', 'Em pistas molhadas ou em dias de chuva, o que deve ser feito em relação à distância do veículo da frente?',
    ['Manter a mesma distância', 'Dobrar a distância de segurança', 'Colar no veículo para evitar derrapagens'], 1),
  q('pdf-3', 'Descanso', 'Em viagens longas ou pilotagem contínua de moto ou carro, qual é o tempo máximo recomendado antes de fazer uma pausa para descanso?',
    ['A cada 2 horas ou 200 km', 'Apenas quando o combustível acabar', 'A cada 5 horas ininterruptas'], 0),
  q('pdf-4', 'Prioridade', 'No trânsito urbano, de quem é a prioridade máxima segundo o Código de Trânsito?',
    ['Dos veículos de grande porte', 'Dos pedestres e ciclistas', 'De quem circula na via principal'], 1),
  q('pdf-5', 'Capacete', 'Pilotar moto sem capacete com viseira ou óculos de proteção adequados, ou utilizar o capacete desatado, gera qual tipo de infração?',
    ['Infração leve com advertência', 'Infração gravíssima, com multa e retenção da habilitação', 'Não é considerado infração em vias urbanas'], 1),
  q('extra-01', 'Equipamento', 'Qual equipamento é obrigatório para pilotar moto?', ['Capacete afivelado', 'Boné', 'Óculos escuros']),
  q('extra-02', 'Semáforo', 'O que significa o sinal amarelo do semáforo?', ['Atenção: pare se for seguro', 'Acelere para passar', 'Siga sem cuidado']),
  q('extra-03', 'Álcool', 'Beber e dirigir é:', ['Proibido, com multa e suspensão da habilitação', 'Permitido se for pouco', 'Proibido só à noite']),
  q('extra-04', 'Mudança de faixa', 'Antes de mudar de faixa, o que fazer?', ['Dar seta e olhar os retrovisores', 'Buzinar', 'Frear forte']),
  q('extra-05', 'Cinto de segurança', 'Para que serve o cinto de segurança?', ['Proteger os ocupantes em caso de batida', 'Deixar o banco confortável', 'Só serve em viagem']),
  q('extra-06', 'Pedestres', 'Na faixa de pedestres sem semáforo, quem tem a preferência?', ['O pedestre', 'A moto', 'Quem chegar primeiro']),
  q('extra-07', 'Crianças', 'Onde a criança pequena deve viajar no carro?', ['No banco de trás, na cadeirinha adequada', 'No colo, no banco da frente', 'Em pé, segurando no banco']),
  q('extra-08', 'Sono', 'O que fazer ao sentir sono ao volante?', ['Parar em local seguro e descansar', 'Abrir a janela e seguir', 'Aumentar a velocidade para chegar logo']),
  q('extra-09', 'Farol', 'Pilotar moto com o farol aceso, inclusive de dia, é:', ['Obrigatório nas situações previstas na legislação', 'Proibido', 'Só obrigatório na chuva']),
  q('extra-10', 'Pneus', 'Qual o perigo do pneu careca?', ['Perde aderência e pode derrapar', 'Gasta menos combustível', 'Nenhum perigo']),
  q('extra-11', 'Emergência', 'Ao ver uma ambulância com a sirene ligada, você deve:', ['Abrir passagem com segurança', 'Seguir colado atrás dela', 'Ignorar']),
  q('extra-12', 'Atenção', 'Usar fone de ouvido enquanto pilota ou dirige:', ['Atrapalha ouvir o trânsito e é proibido nas situações previstas na legislação', 'Ajuda a concentrar', 'É sempre permitido']),
  q('extra-13', 'Sinalização', 'A placa vermelha octogonal "PARE" significa:', ['Parada obrigatória', 'Reduza um pouco', 'Local de estacionamento']),
  q('extra-14', 'Velocidade', 'O excesso de velocidade aumenta:', ['A distância de frenagem e a gravidade dos acidentes', 'A segurança', 'A economia de combustível']),
  q('extra-15', 'Revisão', 'Antes de pegar a estrada, é importante revisar:', ['Pneus, freios e luzes', 'Só o som', 'Só o tanque cheio']),
];

const clonar = (o) => JSON.parse(JSON.stringify(o));

// Junta a configuração salva com os padrões. As regras do jogo e o banco de perguntas são FIXOS
// (5 perguntas: 2 de aquecimento + 3 valendo chopp, ganha quem acertar as 3, sorteio entre as 20):
// mesmo que exista algo antigo salvo na nuvem, o totem sempre usa o padrão. Do painel só vêm pausa, som e limite.
export function migrarConfig(c) {
  const salvo = c || {};
  const { perguntas, banco, totalPerguntas, aquecimento, decisivas, acertosParaGanhar, sorteio, ...resto } = salvo;
  void perguntas; void banco; void totalPerguntas; void aquecimento; void decisivas; void acertosParaGanhar; void sorteio;
  return { pausado: false, som: true, limiteChopps: 0, ...resto, ...normalizarRegras(REGRAS_PADRAO), banco: clonar(BANCO_PADRAO) };
}
