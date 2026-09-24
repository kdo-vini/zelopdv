import { Easing, interpolate } from 'remotion';
import { sourceMsToFrame } from '../data/timing.js';

// Niveis de zoom por formato — o device mobile ocupa uma fatia menor do
// canvas (pode zoomar mais sem estourar a moldura); o browser desktop ja
// ocupa boa parte da largura, entao o zoom precisa ser mais comedido pra
// nunca cobrir a coluna de legenda nem vazar da tela.
// Desktop foi reduzido (1.18->1.10 etc.) porque o browser agora ocupa ~70-75%
// da largura do quadro (ver src/deviceGeometry.js) — menos folga antes de
// bater na coluna de legenda ou na borda direita, entao o "punch" de zoom
// precisa ser mais comedido pra reduzir o quanto o clamp (clampDeviceBox)
// precisa empurrar a janela pra dentro do quadro a cada frame.
export const ZOOM_LEVELS = {
  mobile: { base: 1.0, tap: 1.18, wait: 1.13, scroll: 1.16 },
  desktop: { base: 1.0, tap: 1.06, wait: 1.02, scroll: 1.04 },
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// Constroi uma lista esparsa de keyframes {frame, ox, oy, zoom} (ox/oy em %
// do viewport) a partir dos eventos de toque/scroll/wait do fluxo. A Camera
// interpola entre eles com easing suave (ver useCameraFrame). Regra: cada tap
// da um "punch" de zoom no ponto tocado e volta pro plano geral; scrolls
// consecutivos viram um pan continuo; wait segura um zoom mais suave.
export function buildCameraKeyframes({ events, timing, viewport, format = 'mobile' }) {
  const { base: BASE_ZOOM, tap: TAP_ZOOM, wait: WAIT_ZOOM, scroll: SCROLL_ZOOM } = ZOOM_LEVELS[format];
  const kf = [];
  const push = (frame, ox, oy, zoom) => kf.push({ frame, ox, oy, zoom });
  // oy comprimido pra 20-78 (era 16-84): eventos perto do topo/rodape do
  // viewport fonte (ex. barra inferior de navegacao, campo de mensagem)
  // geravam origem de zoom muito excentrica, o que empurrava a caixa do
  // device pra muito longe do centro depois de escalar (ver clampDeviceBox
  // abaixo, que corrige o resto via translate).
  const toPct = (x, y) => ({
    ox: clamp((x / viewport.width) * 100, 22, 78),
    oy: clamp((y / viewport.height) * 100, 20, 78),
  });

  push(timing.videoStartFrame - 4, 50, 50, BASE_ZOOM);

  let i = 0;
  let lastOrigin = { ox: 50, oy: 50 };
  while (i < events.length) {
    const ev = events[i];
    const frame = sourceMsToFrame(ev.tMs, timing);

    if (ev.type === 'scroll' && ev.x != null) {
      // agrupa a corrida de scrolls consecutivos num pan continuo
      const run = [ev];
      let j = i + 1;
      while (j < events.length && events[j].type === 'scroll') {
        run.push(events[j]);
        j += 1;
      }
      const first = toPct(run[0].x, run[0].y);
      const last = toPct(run[run.length - 1].x, run[run.length - 1].y);
      const firstFrame = sourceMsToFrame(run[0].tMs, timing);
      const lastFrame = sourceMsToFrame(run[run.length - 1].tMs, timing);
      push(firstFrame - 8, lastOrigin.ox, lastOrigin.oy, kf[kf.length - 1].zoom);
      push(firstFrame + 4, first.ox, first.oy, SCROLL_ZOOM);
      push(lastFrame + 10, last.ox, last.oy, SCROLL_ZOOM);
      lastOrigin = last;
      i = j;
      continue;
    }

    if (ev.x == null) {
      i += 1;
      continue;
    }

    const { ox, oy } = toPct(ev.x, ev.y);
    const zoom = ev.type === 'wait' ? WAIT_ZOOM : TAP_ZOOM;
    const hold = ev.type === 'wait' ? 28 : 10;

    push(frame - 5, lastOrigin.ox, lastOrigin.oy, kf[kf.length - 1].zoom);
    push(frame, ox, oy, zoom);
    push(frame + hold, ox, oy, zoom);
    lastOrigin = { ox, oy };
    i += 1;
  }

  push(timing.videoEndFrame - 12, 50, 50, BASE_ZOOM);
  return sanitize(kf);
}

// Garante frames estritamente crescentes (interpolate exige isso) — quando
// eventos reais estao muito próximos, os keyframes gerados podem colidir; em
// vez de eventos brigando por tempo, comprime mantendo a ordem.
function sanitize(kf) {
  const out = [kf[0]];
  for (let i = 1; i < kf.length; i += 1) {
    const prev = out[out.length - 1];
    const cur = kf[i];
    if (cur.frame <= prev.frame) {
      out.push({ ...cur, frame: prev.frame + 1 });
    } else {
      out.push(cur);
    }
  }
  return out;
}

// Desloca um eixo (min/max) pro intervalo seguro [safeMin, safeMax], SEM
// encolher — so translada. Prioriza corrigir o lado que estourou primeiro;
// se a caixa for maior que a area segura (nao deveria acontecer com os
// niveis de zoom deste projeto), o resultado favorece nao cortar o lado
// "max" (ex. nao deixar o device sair pela direita/baixo do quadro).
function clampAxis(lo, hi, safeMin, safeMax) {
  let d = 0;
  if (hi + d > safeMax) d -= hi + d - safeMax;
  if (lo + d < safeMin) d += safeMin - (lo + d);
  return d;
}

// Calcula o deslocamento extra (dx, dy) que mantem a caixa do device (depois
// do zoom/pan da camera) inteiramente dentro dos limites seguros do quadro —
// nunca invadindo a faixa reservada pra legenda (mobile) ou a coluna de
// legenda (desktop), e nunca vazando pelas bordas do canvas. E aplicado como
// um `translate` num wrapper ACIMA do wrapper que escala (zoom), entao o
// "punch" do zoom continua intacto — a cena so desliza de volta pra dentro
// do quadro quando o zoom/pan levaria ela pra fora.
//
// Usado tanto em FlowVideo.jsx (renderizacao) quanto em
// scripts/check-device-bounds.mjs (verificacao automatizada) — mesma
// implementacao, sem duplicar a conta em dois lugares.
export function clampDeviceBox({
  zoom,
  originX,
  originY,
  frameWidth,
  frameHeight,
  baseLeft,
  baseTop,
  safeLeft,
  safeRight,
  safeTop,
  safeBottom,
}) {
  // Backstop: se a caixa JA ESCALADA (frame*zoom) for maior que a propria
  // area segura em algum eixo, nenhum translate resolve (so deslocaria a
  // violacao pro outro lado) — reduz o zoom efetivo o minimo necessario pra
  // caber. So entra em acao perto dos extremos de zoom/pan; no dia a dia o
  // zoom autoral (ZOOM_LEVELS) ja fica dentro da area segura.
  const maxZoomX = (safeRight - safeLeft) / frameWidth;
  const maxZoomY = (safeBottom - safeTop) / frameHeight;
  const safeZoom = Math.min(zoom, maxZoomX, maxZoomY);

  const left = baseLeft + (originX / 100) * frameWidth * (1 - safeZoom);
  const top = baseTop + (originY / 100) * frameHeight * (1 - safeZoom);
  const right = left + frameWidth * safeZoom;
  const bottom = top + frameHeight * safeZoom;
  const dx = clampAxis(left, right, safeLeft, safeRight);
  const dy = clampAxis(top, bottom, safeTop, safeBottom);
  return {
    dx,
    dy,
    zoom: safeZoom,
    box: { left: left + dx, top: top + dy, right: right + dx, bottom: bottom + dy },
  };
}

export function useCameraFrame(frame, keyframes) {
  const ox = interpolateChain(frame, keyframes, (k) => k.ox);
  const oy = interpolateChain(frame, keyframes, (k) => k.oy);
  const zoom = interpolateChain(frame, keyframes, (k) => k.zoom);
  return { originX: ox, originY: oy, zoom };
}

function interpolateChain(frame, keyframes, pick) {
  const frames = keyframes.map((k) => k.frame);
  const values = keyframes.map(pick);
  return interpolate(frame, frames, values, {
    easing: Easing.inOut(Easing.cubic),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}
