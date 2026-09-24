/**
 * Lógica pura por trás do componente `ProductVideo` (vídeos de produto na
 * home): escolha de formato mobile/desktop e disparo único do evento de
 * analytics. Extraída do componente pra poder ser testada sem DOM/vídeo real.
 */

/** Acima desse valor (em px) o vídeo servido é o 16:9 (desktop); igual ou
 * abaixo, o 9:16 (mobile). Mesmo corte usado no CSS do componente. */
export const VIDEO_MOBILE_MAX_WIDTH = 767;

/**
 * @param {number} width Largura da viewport em px.
 * @returns {'mobile'|'desktop'}
 */
export function pickVideoFormat(width) {
  return Number(width) <= VIDEO_MOBILE_MAX_WIDTH ? 'mobile' : 'desktop';
}

/**
 * Caminhos do MP4 e do poster (.webp) pra um vídeo de produto + formato.
 * Só MP4 (H.264) é servido; o .webm foi descartado por ficar maior.
 * @param {string} name
 * @param {'mobile'|'desktop'} format
 */
export function videoAssetPaths(name, format) {
  const base = `/videos/landing/${name}-${format}`;
  return {
    src: `${base}.mp4`,
    poster: `${base}.webp`,
  };
}

/**
 * Dedupe de "já tocou uma vez". Cada instância do componente cria a sua
 * (uma por vídeo por pageview); o vídeo pode reemitir `playing` a cada loop,
 * e o evento não deve ser reenviado.
 * @returns {(name: string) => boolean} true na primeira chamada por nome, false depois.
 */
export function createStartedOnceTracker() {
  const started = new Set();
  return function markStarted(name) {
    if (started.has(name)) return false;
    started.add(name);
    return true;
  };
}
