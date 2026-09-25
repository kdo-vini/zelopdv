# Vídeo de lançamento do ZeloPDV

Vídeo vertical (1080×1920, 30 fps, 34,5 s) no estilo "anúncio de feature".
Só JavaScript, Playwright e ffmpeg: nenhum editor de vídeo, nenhum banco de áudio.

```bash
cd scripts/launch-video
npm install
npm run build          # gera out/audio.wav e out/zelopdv-launch.mp4
npm run stills -- 8.6,12.4   # PNGs de pré-visualização em out/
```

Requer `ffmpeg` com `libx264` no PATH. No ambiente remoto, o Chromium do
Playwright já vem em `/opt/pw-browsers`; em outro lugar, `npx playwright install chromium`
(ou aponte `CHROMIUM_PATH` para um Chromium existente).

## Como funciona

| Arquivo | Papel |
| --- | --- |
| `timeline.js` | Fonte única dos tempos (cenas, toques, dings, impactos). Cena e trilha leem daqui. |
| `scene.html` | As 10 cenas em HTML/CSS. `window.render(t)` posiciona tudo em função de `t`: sem CSS transition, sem relógio real, então cada quadro é determinístico. |
| `render.mjs` | Abre a cena no Chromium, chama `render(i / fps)` quadro a quadro e envia JPEGs por pipe ao ffmpeg (H.264 + AAC). |
| `audio.mjs` | Sintetiza a trilha em JS (bumbo, palmas, baixo, pads aditivos, cordas Karplus-Strong, reverb Freeverb, sidechain) e grava `out/audio.wav`. O único sample é `static/sounds/ifood-arrival.mp3`, do próprio app. |

Roteiro: cold open "Sexta-feira, 20h47" → caos do caderninho → revelação →
venda em 3 toques → fiado → offline → fila de pedidos (ZeloMenu) → lucro real →
Zelinho → 14 dias grátis.

Os números e as promessas do vídeo seguem `src/lib/pricing.js` (R$ 59, trial de
14 dias) e `src/lib/data/productFacts.js` (offline, fiado, estoque, pedidos via ZeloMenu).
Se o preço ou o trial mudar, atualize o cartão final em `scene.html`.
