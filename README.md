# Quiz Exclusive Gold · Motofest

Quiz de segurança no trânsito para totem (tablet em paisagem) com captação de leads e painel online.

- **Totem:** `index.html`. Tela de descanso com o EGon em 3D, cadastro, 5 perguntas (as 3 últimas valem chopp) e resultado.
  O EGon é montado em código (Three.js) com rosto de LED no visor: olha para onde a pessoa toca, reage a toques, cócegas, abraço (segurar) e pode ser arrastado pela tela.
- **Painel:** `painel.html`. Métricas ao vivo, lista de participantes, Excel, resumo no WhatsApp e configurações (perguntas, limite de chopps e pausa).

## Como funciona o modo híbrido

O totem grava cada participação no próprio tablet e no Firestore. Sem internet, o Firestore guarda na fila e envia sozinho quando a conexão volta. O app também abre sem internet depois da primeira vez, por causa do cache offline (`sw.js`). Há ainda um backup local de todas as participações no navegador do tablet.

Sem o `config.js` preenchido, tudo roda em **modo demonstração**: os dados ficam só naquele navegador.

## Configurar o Firebase (uma vez)

1. No [console do Firebase](https://console.firebase.google.com), crie um projeto.
2. Em **Firestore Database**, crie o banco no modo produção.
3. Em **Authentication > Método de login**, ative **E-mail/senha**. Em **Usuários**, crie o login do painel.
4. Em **Configurações do projeto > Seus apps**, adicione um app **Web** e copie o `firebaseConfig` para o `config.js`.
5. Em **Firestore > Regras**, cole o conteúdo de `firestore.rules`, troque `SEU_EMAIL_DO_PAINEL@exemplo.com` pelo e-mail criado no passo 3 e publique.
6. Em **Authentication > Configurações > Domínios autorizados**, confira se o domínio do GitHub Pages (`seuusuario.github.io`) está na lista.

Storage do Firebase não é usado.

## No tablet

1. Abra o endereço do totem no Chrome, com internet, uma vez.
2. No menu do Chrome, escolha **Adicionar à tela inicial**. Abrindo pelo ícone, ele já entra em tela cheia.
3. Toque na tela para começar. O totem entra em tela cheia e mantém a tela ligada.
4. **Status escondido:** toque 5 vezes rápido no logo para ver a conexão, os envios pendentes e o botão para sair da tela cheia.

## Desenvolvimento

O código fica em `src/` (`egon3d.js` é o boneco, `palco.js` a cena 3D, `fx.js` os efeitos, `som.js` os sons). Para gerar `js/`:

```sh
npm i firebase@11 xlsx three@0.169.0 esbuild
sh build.sh
```
