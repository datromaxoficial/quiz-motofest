# Quiz Exclusive Gold · Motofest

Quiz de segurança no trânsito para totem (tablet em paisagem) com captação de leads e painel online.

- **Totem:** `index.html`. Tela de descanso com o EGon em 3D, cadastro, quiz e resultado.
  O EGon é montado em código (Three.js) com rosto de LED no visor: olha para onde a pessoa toca, caminha, reage a toques, cócegas, abraço (segurar) e pode ser arrastado pela tela.
- **Painel:** `painel.html`. Métricas ao vivo, participantes (quem ganhou e o código do cupom), Excel, resumo no WhatsApp e configurações simples (pausar o quiz, sons, limite de chopps e limpar dados de teste).

## Regra do chopp

- Padrão: **5 perguntas** por partida. As **2 primeiras são de aquecimento** e não contam para o prêmio. As **3 últimas valem chopp** e é preciso **acertar as 3** para ganhar.
- O resultado do prêmio usa só as perguntas que valem chopp. Acertar o aquecimento não compensa um erro na etapa decisiva, e errar o aquecimento não tira o prêmio.
- Quem ganha recebe um cupom com código de 4 caracteres, mostrado no totem e na lista do painel. Ganhou = chopp registrado, sem etapa extra de entrega.
- Quem não ganha vê a correção das perguntas que valiam chopp: o que marcou e qual era a certa.
- A regra e o banco de perguntas são **fixos no sistema** (`src/regras.js` e `src/banco.js`): o painel não altera, para nada mudar sem querer durante o evento.

## Banco de perguntas e sorteio

O banco padrão tem 20 perguntas: as 5 do briefing do Motofest (PDF) e mais 15. Com o **sorteio** ligado, cada partida:

- sorteia perguntas diferentes do banco, sem repetir na mesma partida;
- coloca o aquecimento primeiro e as que valem chopp no fim;
- embaralha as alternativas. A certa é identificada pela alternativa, não pela posição;
- evita repetir os conjuntos de perguntas usados recentemente naquele tablet.


Cada participação guarda: cadastro, data e hora, IDs das perguntas, alternativas mostradas, resposta escolhida, resposta certa, acertos no aquecimento, acertos valendo chopp, regras usadas, resultado e código do cupom.

## Como funciona o modo híbrido

O totem grava cada participação no próprio tablet e no Firestore. Sem internet, o Firestore guarda na fila e envia sozinho quando a conexão volta. O app também abre sem internet depois da primeira vez, por causa do cache offline (`sw.js`). Há ainda um backup local de todas as participações no navegador do tablet.

Sem o `config.js` preenchido, tudo roda em **modo demonstração**: os dados ficam só naquele navegador e **não** são sincronizados entre aparelhos.

## Configurar o Firebase (uma vez)

1. No [console do Firebase](https://console.firebase.google.com), crie um projeto.
2. Em **Firestore Database**, crie o banco no modo produção.
3. Em **Authentication > Método de login**, ative **E-mail/senha**. Em **Usuários**, crie o login do painel.
4. Em **Configurações do projeto > Seus apps**, adicione um app **Web** e copie o `firebaseConfig` para o `config.js`. Esses valores são públicos por natureza; a proteção vem das regras do passo 5.
5. Em **Firestore > Regras**, cole o conteúdo de `firestore.rules`, confira se o e-mail do painel (hoje `quiz.exclusivegold@gmail.com`) é o mesmo criado no passo 3 e publique.
6. Em **Authentication > Configurações > Domínios autorizados**, confira se o domínio do GitHub Pages (`datromaxoficial.github.io`) está na lista.

Storage do Firebase não é usado.

## No tablet

1. Abra o endereço do totem no Chrome, com internet, uma vez.
2. No menu do Chrome, escolha **Adicionar à tela inicial**. Abrindo pelo ícone, ele já entra em tela cheia.
3. Toque na tela para começar. O totem entra em tela cheia e mantém a tela ligada.
4. **Status escondido:** toque 5 vezes rápido no logo para ver a conexão, os envios pendentes, ligar/desligar o som e sair da tela cheia.

## Roteiro do evento

**Antes de abrir o Stand**
1. Faça algumas partidas de teste em cada tablet (ganhando e perdendo).
2. No painel, confira se elas apareceram. Depois vá em **Configurações > Limpar todos os dados**, baixe o Excel se quiser, digite a senha **123**, marque a confirmação e apague. Faça isso com os tablets ligados e com internet: eles apagam a cópia local sozinhos.
3. Defina o limite de chopps, se houver.

**Durante o evento (3 dias)**
- O totem funciona com ou sem internet. Sem internet, cada participação fica guardada no tablet e é enviada sozinha quando a conexão volta (e o totem tenta de novo a cada minuto).
- Se a tela fechar ou o tablet reiniciar no meio de uma partida, ao abrir de novo ele continua de onde parou (até 5 minutos; o cupom do resultado fica disponível por 3 minutos).
- No status escondido, **Aguardando envio** mostra quantas participações ainda não chegaram na nuvem. Ao fim de cada dia, ligue a internet até esse número ficar em 0.
- **Nunca** limpe os dados do navegador do tablet nem desinstale o Chrome durante o evento: é ali que ficam as participações que ainda não foram enviadas.

**Depois do evento**
- No painel, **Baixar Excel** traz tudo: participantes, resumo, prospects (não associados com placa), placas repetidas e desistências.

## Desenvolvimento

O código fica em `src/`:
- `regras.js`: sorteio, embaralhamento, correção e cupom, sem tela nem banco de dados;
- `banco.js`: perguntas padrão e migração de configurações antigas;
- `egon3d.js`: o boneco; `palco.js`: a cena 3D; `fx.js`: os efeitos; `som.js`: os sons;
- `totem.js` e `painel.js`: as telas; `data.js`: Firebase e modo demonstração.

```sh
npm i firebase@11 exceljs@4.4.0 three@0.169.0 esbuild
sh build.sh          # roda os testes de regra e gera js/
npm test             # testes de regra (sem dependências)
npm i playwright-core && npm run test:e2e   # totem + painel no Chrome (1280x800, 1194x834 e celular)
npm run test:sync    # evento simulado com a nuvem: online, offline, tablet desligado, reenvio sem duplicar e limpeza
```

O `test:sync` usa o emulador oficial do Firebase (`firebase emulators:start --project demo-quiz --only firestore,auth`, precisa de Java) com o `firestore.rules` do projeto, trocando o e-mail do painel por `painel@teste.com`.
