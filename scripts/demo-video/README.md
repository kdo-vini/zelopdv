# Vídeo demonstrativo do ZeloPDV — "Um dia de loja"

Vídeo vertical (1080×1920, 30 fps, 48 s) para redes sociais, com a UI do
**Design System Zelo** (branch `claude/admiring-thompson-1jk0tr`, ainda atrás da
flag): navy `#011F4A` e branco, Geist + Geist Mono, molas do app.

Feito com **HyperFrames** (composição HTML + timeline GSAP pausada), renderizado
pelo Chromium do **Playwright**, codificado com **ffmpeg**, trilha sintetizada em **JS**.

```bash
cd scripts/demo-video
npm install
export HYPERFRAMES_NO_TELEMETRY=1
# Chromium do Playwright (no ambiente remoto já existe; em outro lugar: npx hyperframes browser ensure)
export HYPERFRAMES_BROWSER_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell
npm run build        # gera assets/audio.wav e out/zelopdv-demo.mp4
npm run check        # lint + runtime + layout + contraste do HyperFrames
npx hyperframes snapshot --at 8.6,20.9   # quadros de revisão em snapshots/
```

## Roteiro (tempos em `timeline.js`)

| Tempo | Capítulo | O que aparece |
| --- | --- | --- |
| 0–4,5 s | 08:00 · abertura | "Abrir caixa" vira spinner, check e "Caixa aberto" (o `MorphButton`) |
| 4,5–13,5 s | 12:30 · venda no balcão | toques nos produtos, "Ver comanda", sheet, Pix, Confirmar → check, toast, estoque 12 → 10 |
| 13,5–23,5 s | 20:10 · Mesas | mapa de mesas, comanda da Mesa 02, enviar à cozinha, fechar com 10% + couvert, dividir por 3 |
| 23,5–31 s | 22:40 · financeiro | nova despesa (digitação, categoria), linha entra na lista, fechar caixa → "Caixa fechado" |
| 31–37 s | 22:55 · relatórios | Hoje → Semana (indicador líquido), faturamento conta, gráfico se desenha, lucro |
| 37–43,8 s | Sáb 08:30 · Zelinho Gerente | "como foi ontem?", resposta com números, pedido de mudança de preço com confirmação |
| 43,8–48 s | cartão final | o celular vira a tela navy da marca: 14 dias grátis, sem cartão, R$ 59/mês |

Os números fecham entre si: 34 vendas somam R$ 2.418,00 (ticket médio R$ 71,12); a
Mesa 02 dá R$ 168,30 + 10% + couvert − já pago = R$ 149,13, ou R$ 49,71 por pessoa.
Preço e trial seguem `src/lib/pricing.js`, e o Módulo Mesas aparece como módulo.
O Zelinho só faz o que as ferramentas dele fazem (resumo de vendas, estoque e
alteração de preço, que pede confirmação).

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `timeline.js` | Fonte única dos tempos. A composição e a trilha leem daqui. |
| `index.html` | Composição HyperFrames: tokens do DS, telas do celular e sheets. O CSS do celular vem do mockup aprovado `docs/design-system/reference/zelopdv-app-mobile.html` (branch do DS). |
| `scenes.js` | Monta a timeline: mede o layout final, aplica os estados iniciais e escreve os tweens capítulo a capítulo. |
| `motion.js` | Movimento do DS em GSAP: `blurSwap`, aperto 0,965, `pop`, `rise`, indicador líquido, números que contam, `MorphButton`, sheets. |
| `vendor/spring.js` | Cópia sem alteração de `src/lib/motion/spring.js` (branch do DS, commit `eba838c`). Os presets SHAPE/LEAD/TRAIL/ENTER/EXIT/COUNT/POP viram eases do GSAP. Quando o DS entrar na main, dá para importar direto de `src/lib/motion/`. |
| `audio.mjs` | Trilha: piano elétrico FM, groove a 120 BPM e efeitos de interface. Usa `scripts/video-kit/synth.mjs`, o mesmo kit do vídeo de lançamento. |
| `fonts/` | Geist e Geist Mono (OFL, `fonts/OFL.txt`), copiadas de `static/fonts` da branch do DS. |
| Ícones | Lucide (ISC), inline em `index.html`, com traço 1,75 como manda o DS. |

## Pegadinhas (ver comentários no código)

- **Texto que muda precisa de plugin, não de callback.** O HyperFrames busca os
  quadros com `totalTime(t, suppressEvents)`, e isso cala `onUpdate` e `tl.call`.
  Por isso números e digitação usam o plugin `zText` (`motion.js`), cujo `render`
  roda sempre.
- **Não passe funções dentro de `vars` do GSAP.** O GSAP as trata como valores
  "function-based" e as chama com `(índice, alvo)`. O formatador do `zText` vai por id.
- **Uma timeline GSAP tem `.then()`.** Num `page.evaluate` do Playwright, devolver
  a timeline (por exemplo, `tl.totalTime(t)`) trava à espera de uma promessa que nunca resolve.
- `.seg .knob` precisa de `position: absolute` com especificidade maior que `.seg span`.
- O `check` do HyperFrames aponta `content_overlap` nas camadas empilhadas de
  propósito (legendas, telas, dígitos que trocam) e sob os sheets. Na última revisão,
  as 78 apontadas tinham uma das camadas invisível ou coberta no quadro.

Telemetria do HyperFrames: desligada com `HYPERFRAMES_NO_TELEMETRY=1`. Nenhum
`hyperframes feedback` foi enviado, porque esse comando publica num canal público.
