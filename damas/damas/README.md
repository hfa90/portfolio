# Jogos ♟️🏎️ — Damas e Corrida (PWA estilo app nativo iOS)

A tela inicial mostra os dois jogos. Tudo funciona como um único app instalável.

## Damas

Damas brasileiras (captura obrigatória, lei da maioria, dama voadora) com:

- **Contra a máquina** — Fácil, Médio e Difícil (IA minimax em Web Worker, não trava a interface)
- **Desafiar um amigo** — online por **link de convite** (ou QR Code). Sem banco de dados: conexão direta P2P (WebRTC/PeerJS)
- **Chat durante a partida** — apagado ao fim da partida ou quando alguém sai da sala
- **Recarregar a página não perde nada** — a partida e as mensagens continuam de onde pararam e a conexão se refaz sozinha
- **Dois jogadores** no mesmo aparelho
- Arrastar e soltar ou tocar-e-tocar, animações com mola, sons de madeira sintetizados, háptico (iOS 18+ e Android)
- Sem zoom, sem arrastar a tela, sem seleção de texto, safe areas do iPhone, instalável como PWA

## Rodar localmente

Precisa ser servido por HTTP (não abra o index.html direto):

```bash
cd damas
python -m http.server 8080
# ou: npx serve .
```

Abra http://localhost:8080

## Publicar (necessário para jogar online e instalar no iPhone)

PWA e convites exigem **HTTPS** e uma URL pública. Qualquer hospedagem estática serve:

- **Netlify Drop**: arraste a pasta `damas` em https://app.netlify.com/drop
- **Vercel**: `npx vercel` dentro da pasta
- **GitHub Pages**: suba a pasta num repositório e ative Pages

## Instalar no iPhone

Abra o link no **Safari** → botão Compartilhar → **Adicionar à Tela de Início**. Ele abre em tela cheia, sem barra do navegador.

## Como funciona o online

1. Você toca em *Desafiar um amigo* → *Criar convite* e envia o link (WhatsApp, iMessage…).
2. Seu amigo abre o link, escolhe um nome e entra — a partida começa na hora.
3. Os dois aparelhos se conectam direto. O servidor público do PeerJS só faz a apresentação inicial.
4. Revanche troca as cores. Se alguém sair da sala, o outro vence e o chat é apagado.

Se em alguma rede específica (corporativa/NAT restrito) a conexão não fechar, adicione um servidor TURN em `js/config.js`.

## Corrida 3D 🏎️

- **4 pistas/cenários**: Costa Dourada (praia ao pôr do sol), Avenida Neon (cidade à noite), Pico Gelado (neve com nevasca) e Cânion Vermelho (deserto)
- **Corrida rápida** contra 3 pilotos da máquina (Fácil, Médio, Difícil)
- **Online até 4 jogadores**: crie a sala, envie o link/QR; vagas livres podem ser completadas pela máquina; revanche volta para a sala
- Drift com turbo (segure DRIFT na curva e solte), placas de turbo na pista, colisões, contramão, volta final, recorde de volta
- Controles: botões na tela ou **inclinar o aparelho**, acelerar automático; teclado no computador (↑ ↓ ← → / WASD, Espaço = drift)
- Câmera cinematográfica na largada, semáforo, fumaça dos pneus, chamas do turbo, sons de motor sintetizados, háptico
- Recarregar a página durante a corrida retoma de onde parou e reconecta à sala

Gráficos com [Three.js](https://threejs.org) (carregado do CDN e guardado em cache pelo service worker).

## Estrutura

```
index.html            telas, sheets e alertas
css/app.css           visual iOS + tabuleiro de madeira
js/engine.js          regras brasileiras + IA
js/ai-worker.js       IA em segundo plano
js/app.js             interface, animações, persistência, chat, online
js/net.js             conexão P2P com reconexão automática
js/fx.js              sons (Web Audio) e háptico
js/config.js          servidores STUN/TURN
sw.js                 cache offline
manifest.webmanifest  PWA
corrida/index.html    telas da corrida (menu, sala, pista, resultado)
corrida/race.css      HUD, controles touch e lobby
corrida/js/tracks.js  pistas e cenários
corrida/js/physics.js física arcade, drift, voltas e IA
corrida/js/world.js   mundo 3D, carros e efeitos
corrida/js/audio.js   motor, pneus e efeitos sonoros
corrida/js/net.js     sala online em estrela (até 4)
corrida/js/main.js    fluxo do jogo, HUD, entrada, online
```

Ao alterar arquivos depois de publicado, mude `VERSION` em `sw.js` para os aparelhos baixarem a versão nova.
