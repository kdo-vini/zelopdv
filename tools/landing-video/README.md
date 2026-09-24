# Landing video (Remotion)

Projeto Remotion **isolado** do app principal (SvelteKit), usado só para
gerar os vídeos de produto da landing (`static/videos/landing/`). Não é
importado pelo app, não entra no `npm run build`/`npm run check`/`vitest` da
raiz (confira `jsconfig.json` — allowlist que não referencia `tools/` — e
`vite.config.js` — `test.include: ['tests/**/*.test.js']`).

## Setup

```bash
cd tools/landing-video
npm install
```

Licença Remotion: grátis para empresas com até 3 funcionários (é o caso do
ZeloPDV) — ver [remotion.dev/license](https://www.remotion.dev/license).
Versão travada em `package.json` (`remotion` / `@remotion/cli`); confira no
[npm](https://www.npmjs.com/package/remotion) antes de atualizar.

Se o Chrome headless do Remotion falhar no Windows:

```bash
npx remotion browser ensure
```

## Estrutura

```
src/
  Root.jsx          composições registradas (6 = 3 fluxos × 2 formatos)
  FlowVideo.jsx      composição principal (monta device+camera+legendas+EndCard)
  deviceGeometry.js  tamanho/posição do device + faixa segura de legenda (fonte única — ver "Legenda vs. device")
  theme.js           paleta/fonte copiadas de src/themes/base.css do app
  data/
    flows.js         eventos de toque/scroll/wait + legendas + trechos "mortos" por fluxo×formato
    timing.js         orçamento de frames (intro/video/answer/outro) + segmentação de taxa por composição
  components/
    Background.jsx    fundo escuro com gradiente + grão
    PhoneFrame.jsx     moldura de celular (CSS puro, sem marca copiada)
    BrowserFrame.jsx   janela de navegador minimalista
    camera.js          gera keyframes de zoom/pan a partir dos eventos + clampDeviceBox (clamp de câmera)
    TapRipple.jsx      indicador de toque (círculo + ripple)
    Caption.jsx        legenda cinética (entrada palavra a palavra)
    AnswerCard.jsx     cartão de número animado (fecho do fluxo Zelinho)
    EndCard.jsx        cartão final com logo
public/
  captures/            vídeos fonte (gitignored — ver "Como recapturar")
  logo-horizontal-cropped.webp   (mesmo asset de static/ do app, versionado)
scripts/
  render-all.mjs       renderiza os 6 vídeos + posters e publica em static/videos/landing/
  probe.mjs            confere duração/resolução/codec/tamanho dos finais
  extract-frames.mjs   extrai frames de QC dos MP4 finais pra conferir texto pós-compressão
  check-device-bounds.mjs  verificação automatizada: bounding box do device por frame nunca invade a faixa de legenda nem sai do quadro (ver "Legenda vs. device")
  print-capture-events.mjs  imprime eventos/duração prontos pra colar em flows.js quando um clipe é recapturado (ver "Como recapturar só um fluxo")
capture/
  capture.mjs, capture-mobile.mjs, capture-desktop-events.mjs, cut-videos.mjs
  (cópias sanitizadas dos scripts de captura — ver "Como recapturar")
```

## Comandos

```bash
npm run studio          # Remotion Studio (preview interativo)
npm run still           # npx remotion still <entry> <comp-id> <out.png> --frame=N
npm run render          # npx remotion render <entry> <comp-id> <out.mp4> [flags]
npm run build-all       # renderiza os 6 vídeos + posters finais (scripts/render-all.mjs)
npm run probe           # confere os arquivos finais em static/videos/landing/
npm run frames          # extrai frames de QC dos MP4 finais (scripts/extract-frames.mjs)
node scripts/check-device-bounds.mjs        # verifica bounding box do device por frame (legenda/bordas)
node scripts/print-capture-events.mjs venda # imprime eventos/duração pra recapturar um fluxo
```

As 6 composições: `venda-mobile`, `venda-desktop`, `fiado-mobile`,
`fiado-desktop`, `zelinho-mobile`, `zelinho-desktop`.

## Pipeline de encode

`remotion render` com `--codec=h264` sai como `yuvj420p` (full-range) porque
a fonte é screenshot RGB do Chromium. `render-all.mjs` reencoda o master
(crf24) com `ffmpeg -pix_fmt yuv420p -color_range tv -movflags +faststart`
(crf22) pra sair no `yuv420p` (limited-range) que os players esperam, sem
perda perceptível. O `.webm` (VP9) sai direto do `remotion render`. O poster
`.webp` vem de um frame específico de cada fluxo (não o primeiro, que é só o
fundo antes do device entrar — ver `POSTER_FRAME` em `render-all.mjs`).

Orçamento de tamanho: ≤ 1.5 MB mobile, ≤ 2.5 MB desktop (mp4). Com crf24 no
master, todos os 6 vídeos ficam bem abaixo do teto (0.8–2 MB) — há folga pra
baixar o CRF (mais qualidade) se algum recorte de conteúdo mudar.

## Legenda vs. device (faixa segura + clamp de câmera)

Revisão de arte (2026-09-24) pediu pra legenda nunca encostar/sobrepor o
device, e o device nunca ser cortado pela borda do quadro (aconteceu antes
com "Pergunta do seu jeito."/"Quem deve." no mobile e com a janela do
venda-desktop sendo empurrada pra fora do quadro no zoom de "Recebe no
Pix"). A correção tem duas partes, ambas em cima de uma fonte única de
geometria (`src/deviceGeometry.js`):

1. **Faixa reservada pra legenda** — os primeiros `CAPTION_SAFE_TOP_FRACTION`
   (16%) do quadro mobile são reservados só pra legenda (container
   `display:flex; align-items:center` nessa faixa, uma linha só, quebra em 2
   se for longa, margem lateral de 90px — acima do mínimo de 64px pedido). No
   desktop a legenda vive numa coluna própria à esquerda
   (`DESKTOP_CAPTION_LEFT`/`DESKTOP_CAPTION_WIDTH`), separada da janela por
   um respiro (`DESKTOP_CAPTION_GAP`).
2. **Clamp de câmera** (`clampDeviceBox` em `components/camera.js`) —
   calcula, a cada frame, a caixa do device DEPOIS do zoom/pan (que pode
   ultrapassar a faixa segura quando a câmera aproxima um ponto perto da
   borda do viewport fonte) e desloca (translate, sem encolher) o device de
   volta pra dentro dos limites seguros (`safeLeft/safeRight/safeTop/
   safeBottom`, vindos de `getDeviceGeometry`). Aplicado nas 6 composições
   (mobile e desktop) — não é um fix pontual do venda-desktop.

`scripts/check-device-bounds.mjs` verifica isso automaticamente: itera todos
os frames das 6 composições reusando a MESMA `getDeviceGeometry` +
`buildCameraKeyframes`/`useCameraFrame`/`clampDeviceBox` que a renderização
usa (nenhuma conta duplicada) e falha (`exit 1`) se algum frame invadir a
faixa de legenda ou ultrapassar os limites do quadro. Rode depois de mexer em
`ZOOM_LEVELS`, `MOBILE_DEVICE_TOP`, `DESKTOP_CONTENT_WIDTH` ou eventos de um
fluxo:

```bash
node scripts/check-device-bounds.mjs
```

O desktop também ganhou uma janela maior (`DESKTOP_CONTENT_WIDTH` ~70% da
largura do canvas, era ~52% — texto ilegível no still de revisão) e
`ZOOM_LEVELS.desktop` mais conservador (era o mesmo raciocínio de antes, só
que com menos folga agora que a janela ocupa mais quadro).

## Trechos parados (loading) acelerados

Revisão de arte pediu pra qualquer trecho com a tela parada > 1s (e
especialmente o indicador "Pensando..."/"Consultando os seus dados..." do
Zelinho, que segundo a gravação real dura 4s no mobile e **7.4s no
desktop**) ficar com espera percebida ≤ 0.8s, sem cortar ações. Isso é
`deadZones` em `src/data/flows.js`: uma lista de `{startMs, endMs,
outputFrames}` (tempos relativos ao início do vídeo FONTE) que
`src/data/timing.js` (`getTiming`/`buildSourceSegments`) usa pra fatiar o
clipe em segmentos — os normais tocam numa taxa uniforme (`baseRate`), os
"mortos" tocam bem mais rápido, num orçamento FIXO e curto de frames de
saída (`outputFrames`, tipicamente 12-22 frames ⇒ 0.4-0.73s a 30fps).
`FlowVideo.jsx` (`VideoLayer`) renderiza um `<Sequence trimBefore/trimAfter/
playbackRate>` por segmento — nada é cortado, só reproduzido mais rápido.

Os trechos parados foram medidos comparando frames extraídos do clipe fonte
a cada 0.2s (`ffmpeg -vf fps=5` + diff de pixels) — não dá pra confiar só no
filtro `freezedetect` do ffmpeg aqui, porque um spinner/indicador sutil
anima o suficiente pra mascarar um trecho que É visualmente "morto" pra
quem assiste. Trechos parados aplicados: `zelinho` (mobile e desktop, o
"Pensando.../Consultando..."), `venda` e `fiado` (mobile e desktop — o
"carrinho vazio"/"extrato rolado" parado no fim do clipe, depois da última
ação). `fiado-desktop` não tem `deadZones`: o trecho final lá tem menos de
1s de tela parada antes de um pequeno ajuste visual no saldo, então foi
deixado como está.

Como esse orçamento de frames muda ONDE o tempo de vídeo vai, mas não muda
`totalFrames` (o orçamento por composição em `timing.js` continua fixo), o
conteúdo "normal" (fora dos trechos mortos) acaba tocando um pouco mais
devagar do que antes — sobra mais frame pra ele porque o trecho morto não
"gasta" mais o orçamento todo. Isso é bom pra legibilidade (ex. digitação no
Zelinho fica com cadência mais humana), não é um efeito colateral
indesejado.

## Como recapturar só um fluxo (ex.: venda)

Pra trocar só a captura de UM fluxo (ex.: o modal de pagamento do venda
passou a mostrar "R$ 44,00" em vez de "R$ 44.00") sem mexer nos outros 5:

1. Grave de novo só esse fluxo (`capture-mobile.mjs` e
   `capture-desktop-events.mjs` já suportam gravar fluxos avulsos — veja as
   flags de cada script) e copie o `.mp4` + `.events.json` novos por cima de
   `public/captures/{mobile,desktop}/<flow>.mp4` / `<flow>.events.json`.
2. Rode `node scripts/print-capture-events.mjs <flow>` — ele confere a
   duração real (ffprobe) e imprime um bloco JS pronto pra colar em
   `src/data/flows.js` (`sourceDurationMs`, `viewport`, `events` já com
   `tMs` no formato certo, sem precisar transcrever timestamp a mão).
3. Cole o bloco no `FLOWS.<flow>.<formato>` correspondente. Confira/ajuste:
   - `captions`: os tempos de início/fim de cada legenda podem precisar de
     um pequeno ajuste pros novos timestamps de evento (a redação
     normalmente não muda).
   - `deadZones`: se o fluxo tem um trecho parado (loading, tela de sucesso
     parada etc.), confirme se `startMs`/`endMs` ainda apontam pro trecho
     certo (ver seção "Trechos parados" acima).
4. Re-renderize só esse fluxo:
   ```bash
   node scripts/render-all.mjs --only=<flow>-mobile,<flow>-desktop
   ```
5. Confira com `node scripts/probe.mjs` (tamanho/duração),
   `node scripts/extract-frames.mjs` (frames de QC) e
   `node scripts/check-device-bounds.mjs` (legenda/bordas) antes de
   considerar pronto.

Isso foi exercitado de verdade em 2026-09-24 pra trocar a captura do venda
(mobile e desktop) depois da correção do modal de pagamento — `vendaMobileEvents`/
`vendaDesktopEvents`, `sourceDurationMs`, `captions` e `deadZones` em
`src/data/flows.js` vieram desse processo.

## Como recapturar os vídeos fonte

Os vídeos em `public/captures/` vieram de gravações reais da conta demo
"Balcão do Zelo" (dados fictícios). Pra regravar:

1. Suba o app localmente (`npm run dev` na raiz do repo) ou aponte
   `ZELOPDV_BASE_URL` pro ambiente que quiser gravar.
2. Exporte as credenciais da conta demo como variáveis de ambiente —
   **nunca** as commite nem as coloque em arquivo do repo:

   ```bash
   export DEMO_EMAIL="..."
   export DEMO_PASSWORD="..."
   export ZELOPDV_BASE_URL="http://localhost:5173"   # opcional, é o default
   ```

3. Rode os scripts de captura (de dentro de `tools/landing-video/capture/`):

   ```bash
   cd tools/landing-video/capture
   node capture-mobile.mjs                # grava video-mobile/{venda,fiado,zelinho}.mp4 + events.json
   node capture-desktop-events.mjs        # grava video/{fiado,zelinho}.mp4 + events.json (+ timeline)
   node capture.mjs                       # fluxo antigo: prints + video-raw/*.webm + timeline.json
   node cut-videos.mjs                    # corta video-raw/*.webm em video/*.mp4 usando timeline.json
   ```

   Cada script escreve sua saída relativa à própria pasta (`capture/video*`,
   `capture/.auth`, etc. — tudo gitignored). `capture.mjs` e
   `capture-desktop-events.mjs` reaproveitam sessão salva em
   `capture/.auth/state.json` entre rodadas; use `--fresh-login` pra ignorá-la.

4. Copie o que for usar para `public/captures/mobile/` e
   `public/captures/desktop/` (mesmos nomes: `venda.mp4`, `fiado.mp4`,
   `zelinho.mp4` + `*.events.json` quando existir).
5. Se os timestamps dos eventos mudarem, ajuste `src/data/flows.js`
   (`*Events`) e `src/data/timing.js` (`BUDGETS`) — este arquivo documenta a
   lógica de conversão ms→frame (`sourceMsToFrame`).
6. Rode `npm run studio` pra conferir visualmente antes de renderizar os
   finais (`npm run build-all`).

## Notas de arte / decisões

- Paleta e fundo vêm de `src/themes/base.css` do app (`--marketing-dark`,
  `--primary` sky-500 etc.) — copiados pra `src/theme.js` porque este
  projeto não importa CSS do app.
- Fonte: a landing não usa Google Font custom (ver `src/routes/+page.svelte`
  linha ~652) — o stack é `'Segoe UI', ui-sans-serif, system-ui, -apple-system,
  sans-serif`. Copiado igual em `theme.js` pra renderizar idêntico ao Chromium
  desta máquina.
- Logo: mesmo asset de `static/logo-horizontal-cropped.webp` do app, num
  cartão de vidro sutil (`EndCard.jsx`) pra garantir contraste no fundo
  escuro do vídeo.
- Zoom/pan da câmera (`components/camera.js`) é gerado a partir dos eventos
  reais de toque/scroll — não é hardcoded por composição. Níveis de zoom são
  mais conservadores no desktop (`ZOOM_LEVELS.desktop`) porque o browser já
  ocupa mais do quadro (~70% da largura, ver "Legenda vs. device"); no mobile
  o device é menor e aguenta mais zoom sem vazar da moldura. Qualquer
  overshoot residual (zoom/pan que ainda ultrapassaria a faixa de legenda ou
  a borda do quadro) é corrigido por `clampDeviceBox` — ver "Legenda vs.
  device" acima.
- `AnswerCard` (fluxo Zelinho) trava o número no valor exato pouco antes do
  fim da contagem — o spring é *overdamped* de propósito (sem "quique"), mas
  por isso demora a convergir; sem essa trava o poster ou um frame tardio
  podia mostrar um valor intermediário. O valor vem de `data.answerValue`
  (`FLOWS.zelinho.<formato>.answerValue` em `data/flows.js`) — é **por
  formato**, não um valor único: a gravação mobile mostra `R$ 16.589,00` e a
  desktop `R$ 16.677,00` porque são duas gravações/estados de dados
  diferentes da conta demo. Não invente um valor novo; leia do frame final
  real de cada gravação.
- Bug real encontrado nesta revisão: `BrowserFrame.jsx` faltava
  `position: relative` no div que envolve o vídeo (`PhoneFrame.jsx` já tinha
  o equivalente certo). Sem isso, o `<AbsoluteFill>` do vídeo (dentro de
  `VideoLayer`, em `FlowVideo.jsx`) não tinha esse div como *containing
  block* e acabava preenchendo o wrapper `scale(zoom)` INTEIRO — que por ter
  `transform` também vira containing block, por spec CSS — inclusive a
  altura da barra do navegador. O vídeo saía mais alto que deveria e
  `object-fit: cover` cortava uma fatia da direita pra manter a proporção
  (sintoma visível: "Enter envia" cortado no zelinho-desktop, mesmo em
  frames sem zoom). Corrigido; qualquer novo componente de "moldura" tem que
  ter `position: relative` no container que recebe o vídeo.
- Segunda rodada de revisão (mesmo dia) pegou 3 problemas de loop/transição:
  1. **AnswerCard x EndCard sobrepostos**: o EndCard entrava (fade-in de 10
     frames) por cima do AnswerCard ainda opaco (sem fade-out próprio) — por
     ~10 frames os dois ficavam visíveis, logo sobre o número. Fix: o
     AnswerCard virou o PRÓPRIO cartão final do fluxo Zelinho (ganhou o logo
     pequeno embaixo, fade-in tardio) e o `<EndCard>` genérico não é mais
     renderizado pra esse fluxo — os dois nunca coexistem. Ver
     `src/cardTiming.js` (curvas de opacidade compartilhadas entre os
     componentes e o check automatizado) e `scripts/check-device-bounds.mjs`
     (verifica isso frame a frame nas 6 composições).
  2. **Primeiro frame vazio (pisca no loop)**: a moldura (Phone/BrowserFrame)
     ficava com o fundo liso por todo o intro (spring de entrada, ~10-12
     frames) porque o `<Sequence>` do vídeo só começa em `videoStartFrame` —
     antes disso não tinha nada renderizado dentro da moldura. Como o vídeo é
     loop, isso piscava a cada volta. Fix: `VideoLayer` (FlowVideo.jsx) ganhou
     um `<Sequence from={0}>` de "pre-roll" que SEGURA (Freeze) o primeiro
     frame útil do clipe (mesmo trimBefore/trimAfter/playbackRate do primeiro
     segmento real) durante todo o intro — a moldura nasce com o conteúdo já
     visível, sem soco quando o vídeo "de verdade" assume.
  3. **zelinho-desktop começava no skeleton do briefing**: os primeiros
     ~150ms do clipe fonte mostram "Boa tarde." com caixas vazias antes do
     briefing carregar de verdade (medido via diff de frames a cada 50ms).
     Como esse fluxo roda em ~0.37x (baseRate — ver "Trechos parados" acima),
     150ms reais viravam ~400ms perceptíveis no vídeo final. Fix:
     `sourceStartMs: 160` em `FLOWS.zelinho.desktop` (ver `data/timing.js` —
     `buildSourceSegments` aceita pular um trecho do INÍCIO do clipe, não só
     do meio). `zelinho-mobile` foi conferido e não tem esse problema (chat
     fechado já mostra a página carregada desde o frame 0).
