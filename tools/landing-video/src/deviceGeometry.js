// Geometria do device (celular/browser) compartilhada entre FlowVideo.jsx
// (renderizacao) e scripts/check-device-bounds.mjs (verificacao automatizada
// de bounding box por frame). Fonte unica dos numeros de layout — mudar o
// tamanho/posicao do device ou a faixa reservada pra legenda deve acontecer
// SO aqui.
import { FORMATS } from './canvasSizes.js';

export const MOBILE_SCREEN_WIDTH = 580;
export const MOBILE_DEVICE_TOP = 385;

// Desktop: janela ocupando ~70% da largura do canvas (era ~52%, ilegivel no
// still de revisao) com legenda em coluna propria a esquerda. Ver README.md
// "Notas de arte" pra o raciocinio completo.
export const DESKTOP_CONTENT_WIDTH = 1344;
export const DESKTOP_RIGHT_MARGIN = 64;
export const DESKTOP_CAPTION_LEFT = 64;
export const DESKTOP_CAPTION_WIDTH = 340;
const DESKTOP_CAPTION_GAP = 20; // respiro entre a coluna de legenda e a janela

// Faixa superior reservada pra legenda no mobile (~16% do quadro, pedido da
// revisao) — o device (inclusive zoom/pan/entrada) nunca pode invadir essa
// faixa. +margem de respiro abaixo da linha dos 16%.
export const CAPTION_SAFE_TOP_FRACTION = 0.16;
const MOBILE_CAPTION_MARGIN = 8;

// Margem de seguranca genérica pras bordas do canvas (todas as composicoes).
export const SAFE_EDGE_MARGIN = 32;

export function getCanvasSize(format) {
  return FORMATS[format];
}

// Devolve a geometria "de repouso" (zoom=1, sem entrada/spring) do device: o
// tamanho da moldura (com bezel/barra) e a posicao base no canvas, mais os
// limites seguros [safeLeft,safeRight,safeTop,safeBottom] que a camera
// (clampDeviceBox, em components/camera.js) nunca pode deixar a caixa
// escalada ultrapassar.
export function getDeviceGeometry(flow, format, data) {
  const canvas = getCanvasSize(format);
  const isMobile = format === 'mobile';
  const screenWidth = isMobile ? MOBILE_SCREEN_WIDTH : DESKTOP_CONTENT_WIDTH;
  const screenHeight = Math.round(screenWidth * (data.viewport.height / data.viewport.width));

  if (isMobile) {
    const bezel = Math.round(screenWidth * 0.028);
    const frameWidth = screenWidth + bezel * 2;
    const frameHeight = screenHeight + bezel * 2;
    const baseLeft = (canvas.width - frameWidth) / 2;
    const baseTop = MOBILE_DEVICE_TOP;
    return {
      screenWidth,
      screenHeight,
      frameWidth,
      frameHeight,
      baseLeft,
      baseTop,
      safeLeft: SAFE_EDGE_MARGIN,
      safeRight: canvas.width - SAFE_EDGE_MARGIN,
      safeTop: canvas.height * CAPTION_SAFE_TOP_FRACTION + MOBILE_CAPTION_MARGIN,
      safeBottom: canvas.height - SAFE_EDGE_MARGIN,
    };
  }

  const barHeight = Math.round(screenHeight * 0.062);
  const frameWidth = screenWidth;
  const frameHeight = screenHeight + barHeight;
  const baseLeft = canvas.width - DESKTOP_RIGHT_MARGIN - frameWidth;
  const baseTop = (canvas.height - frameHeight) / 2;
  return {
    screenWidth,
    screenHeight,
    frameWidth,
    frameHeight,
    baseLeft,
    baseTop,
    safeLeft: DESKTOP_CAPTION_LEFT + DESKTOP_CAPTION_WIDTH + DESKTOP_CAPTION_GAP,
    safeRight: canvas.width - SAFE_EDGE_MARGIN,
    safeTop: SAFE_EDGE_MARGIN,
    safeBottom: canvas.height - SAFE_EDGE_MARGIN,
  };
}
