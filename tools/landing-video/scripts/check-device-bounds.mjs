// check-device-bounds.mjs — duas verificacoes automatizadas pedidas pela
// revisao de arte:
//   1) bounding box do device (celular/browser) EM CADA FRAME das 6
//      composicoes — falha se o device invadir a faixa/coluna de legenda ou
//      for cortado pela borda do quadro.
//   2) AnswerCard x EndCard nunca tem opacidade > 0 ao mesmo tempo (bug real
//      encontrado na revisao: o EndCard entrava por cima do AnswerCard ainda
//      opaco, logo sobreposto ao numero).
// As duas reusam a MESMA implementacao que a renderizacao usa (geometria,
// camera, curvas de opacidade dos cartoes) — nao re-derivam a conta noutro
// lugar, entao um "OK" aqui reflete o que realmente vai pra tela.
//
// Uso: node scripts/check-device-bounds.mjs
import { FLOWS } from '../src/data/flows.js';
import { getTiming } from '../src/data/timing.js';
import { getDeviceGeometry, DESKTOP_CAPTION_LEFT, DESKTOP_CAPTION_WIDTH } from '../src/deviceGeometry.js';
import { buildCameraKeyframes, useCameraFrame, clampDeviceBox } from '../src/components/camera.js';
import { answerCardOpacity, endCardOpacity } from '../src/cardTiming.js';

const COMPOSITIONS = [
  ['venda', 'mobile'],
  ['venda', 'desktop'],
  ['fiado', 'mobile'],
  ['fiado', 'desktop'],
  ['zelinho', 'mobile'],
  ['zelinho', 'desktop'],
];

const EPS = 0.5; // tolerancia de arredondamento (px)

let failures = 0;
let totalFramesChecked = 0;

for (const [flow, format] of COMPOSITIONS) {
  const data = FLOWS[flow][format];
  const timing = getTiming(flow, format);
  const geom = getDeviceGeometry(flow, format, data);
  const keyframes = buildCameraKeyframes({ events: data.events, timing, viewport: data.viewport, format });

  let worst = { margin: Infinity, frame: null, side: null };
  let compFailures = 0;

  for (let frame = 0; frame < timing.totalFrames; frame += 1) {
    const { originX, originY, zoom } = useCameraFrame(frame, keyframes, timing.fps);
    const { box } = clampDeviceBox({
      zoom,
      originX,
      originY,
      frameWidth: geom.frameWidth,
      frameHeight: geom.frameHeight,
      baseLeft: geom.baseLeft,
      baseTop: geom.baseTop,
      safeLeft: geom.safeLeft,
      safeRight: geom.safeRight,
      safeTop: geom.safeTop,
      safeBottom: geom.safeBottom,
    });

    const margins = [
      { side: 'top (faixa/coluna de legenda)', margin: box.top - geom.safeTop },
      { side: 'bottom (borda do quadro)', margin: geom.safeBottom - box.bottom },
      { side: 'left (legenda/borda)', margin: box.left - geom.safeLeft },
      { side: 'right (borda do quadro)', margin: geom.safeRight - box.right },
    ];

    for (const m of margins) {
      if (m.margin < -EPS) {
        compFailures += 1;
        failures += 1;
      }
      if (m.margin < worst.margin) {
        worst = { margin: m.margin, frame, side: m.side };
      }
    }
    totalFramesChecked += 1;
  }

  const status = compFailures === 0 ? 'OK' : `FALHA (${compFailures} violacoes)`;
  console.log(
    `${`${flow}-${format}`.padEnd(16)} ${status.padEnd(20)} pior margem: ${worst.margin.toFixed(1)}px ` +
      `no frame ${worst.frame} (${worst.side})`,
  );
}

console.log(`\n${totalFramesChecked} frames verificados em ${COMPOSITIONS.length} composicoes.`);
if (failures > 0) {
  console.error(`FALHOU: ${failures} violacoes de bounding box (legenda ou borda do quadro).`);
  process.exit(1);
}
console.log('OK: device nunca invade a faixa de legenda nem sai do quadro em nenhum frame.');
console.log(`(referencia: coluna de legenda desktop termina em ${DESKTOP_CAPTION_LEFT + DESKTOP_CAPTION_WIDTH}px)`);

// --- 2) AnswerCard x EndCard: nunca ambos com opacidade > 0 -----------------
// Espelha a decisao de montagem de FlowVideo.jsx: AnswerCard so e renderizado
// pro fluxo zelinho (e substitui o EndCard, com o logo embutido — ver
// src/cardTiming.js); EndCard e renderizado pros outros fluxos. Se essa
// decisao mudar em FlowVideo.jsx, atualize aqui tambem.
console.log('\n--- AnswerCard x EndCard (sobreposicao) ---');
let cardFailures = 0;
for (const [flow, format] of COMPOSITIONS) {
  const timing = getTiming(flow, format);
  const rendersAnswerCard = flow === 'zelinho';
  const rendersEndCard = flow !== 'zelinho';
  let compCardFailures = 0;

  for (let frame = 0; frame < timing.totalFrames; frame += 1) {
    const aOpacity = rendersAnswerCard ? answerCardOpacity(frame - timing.answerStartFrame) : 0;
    const eOpacity = rendersEndCard ? endCardOpacity(frame - timing.outroStartFrame) : 0;
    if (aOpacity > 0 && eOpacity > 0) {
      compCardFailures += 1;
      cardFailures += 1;
    }
  }

  const status = compCardFailures === 0 ? 'OK' : `FALHA (${compCardFailures} frames com os dois visiveis)`;
  console.log(`${`${flow}-${format}`.padEnd(16)} ${status}`);
}

if (cardFailures > 0) {
  console.error(`\nFALHOU: ${cardFailures} frames com AnswerCard e EndCard visiveis ao mesmo tempo.`);
  process.exit(1);
}
console.log('OK: AnswerCard e EndCard nunca tem opacidade > 0 ao mesmo tempo em nenhuma composicao.');
