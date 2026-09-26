// Movimento do Design System Zelo traduzido para uma timeline GSAP pausada
// (o contrato do HyperFrames). As molas são as do app: vendor/spring.js é cópia
// de src/lib/motion/spring.js e os presets (SHAPE, LEAD, TRAIL, ENTER, EXIT,
// COUNT, POP) viram eases do GSAP com a duração de assentamento da própria mola.
//
// Toda função recebe a timeline e um tempo absoluto; nada depende de relógio
// real, então o HyperFrames pode buscar qualquer quadro em qualquer ordem.
import {
  springEasing, springSettleTime, liquidEdgeSprings,
  SPRING_SHAPE, SPRING_LEAD, SPRING_TRAIL, SPRING_ENTER, SPRING_EXIT, SPRING_COUNT, SPRING_POP
} from './vendor/spring.js';

const gsap = window.gsap;

/** Preset de mola → { duration, ease } para um tween GSAP. */
export const spring = (p) => ({ duration: springSettleTime(p.omega, p.zeta), ease: springEasing(p.omega, p.zeta) });
export const S = {
  shape: spring(SPRING_SHAPE), lead: spring(SPRING_LEAD), trail: spring(SPRING_TRAIL),
  enter: spring(SPRING_ENTER), exit: spring(SPRING_EXIT), count: spring(SPRING_COUNT), pop: spring(SPRING_POP)
};
export { liquidEdgeSprings, SPRING_LEAD, SPRING_TRAIL };

// blurSwap (src/lib/motion/transitions.js): a saída leva ~90% em 70 ms
// (opacidade → 0, blur → 8 px, escala → 1,02); a entrada começa 70 ms depois
// (blur 8 → 0, escala 0,96 → 1). Nunca se sobrepõem.
const SWAP_BLUR = 8;
const SWAP_ENTER_DELAY = 0.07;

// Texto e números mudam por plugin, não por onUpdate/call: o HyperFrames busca
// quadros com suppressEvents, que cala callbacks, mas o render de plugin roda sempre.
// O formatador vai por id: o GSAP trata funções dentro de vars como valores
// "function-based" e as chamaria com (índice, alvo) antes de chegar ao plugin.
const FORMATTERS = [];
const fmtId = (fn) => FORMATTERS.push(fn) - 1;
gsap.registerPlugin({
  name: 'zText',
  init(target, spec) {
    this.target = target;
    this.spec = spec; // { from, to, fmt: id em FORMATTERS }
    this.last = null;
  },
  render(ratio, data) {
    const { from = 0, to = 1, fmt } = data.spec;
    const text = FORMATTERS[fmt](from + (to - from) * ratio);
    if (text !== data.last) { data.target.textContent = text; data.last = text; }
  }
});

/** Anima o texto de `el` de `from` a `to`, formatando cada valor intermediário. */
export function text(tl, el, from, to, fmt, t, timing) {
  tl.to(el, { zText: { from, to, fmt: fmtId(fmt) }, ...timing }, t);
}

export const brl = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function enter(tl, els, t, { y = 0, stagger = 0 } = {}) {
  tl.set(els, { opacity: 0, filter: `blur(${SWAP_BLUR}px)`, scale: 0.96, y }, t);
  tl.to(els, { opacity: 1, filter: 'blur(0px)', scale: 1, y: 0, stagger, ...S.enter }, t + SWAP_ENTER_DELAY);
}
export function exit(tl, els, t) {
  tl.to(els, { opacity: 0, filter: `blur(${SWAP_BLUR}px)`, scale: 1.02, ...S.exit }, t);
}
export function swap(tl, outEl, inEl, t, opts) {
  exit(tl, outEl, t);
  enter(tl, inEl, t, opts);
}

/** Aperto: escala 0,965 e volta com a mola de forma. */
export function press(tl, el, t) {
  tl.to(el, { scale: 0.965, duration: 0.08, ease: 'power2.out' }, t);
  tl.to(el, { scale: 1, ...S.shape }, t + 0.08);
}

/** Selo/elemento que surge com um pequeno overshoot (SPRING_POP). */
export function pop(tl, el, t) {
  tl.set(el, { scale: 0.4, opacity: 0 }, t);
  tl.to(el, { opacity: 1, duration: 0.08, ease: 'none' }, t);
  tl.to(el, { scale: 1, ...S.pop }, t);
}

/** Barra/cartão que sobe de baixo (rise). */
export function rise(tl, el, t, dist = 40) {
  tl.set(el, { y: dist, opacity: 0 }, t);
  tl.to(el, { y: 0, ...S.shape }, t);
  tl.to(el, { opacity: 1, ...S.enter }, t);
}

/** Números contam (SPRING_COUNT, sem overshoot: um total nunca passa do valor). */
export function count(tl, el, from, to, t, fmt = brl) {
  text(tl, el, from, to, fmt, t, S.count);
}

/** Digitação: um caractere por vez, em ritmo linear. */
export function type(tl, el, str, t0, t1, prefix = '') {
  text(tl, el, 0, str.length, (v) => prefix + str.slice(0, Math.round(v)), t0, { duration: t1 - t0, ease: 'none' });
}

/**
 * Indicador líquido: a borda que lidera (direção do movimento) usa a mola rígida,
 * a que segue usa a macia — estica e alcança. Posições em px (left/right do trilho).
 */
export function liquid(tl, el, from, to, t) {
  const edges = liquidEdgeSprings(from.left, from.right, to.left, to.right);
  tl.to(el, { left: to.left, ...spring(edges.left) }, t);
  tl.to(el, { right: to.right, ...spring(edges.right) }, t);
}

/**
 * Toque do dedo no celular: ponto que aparece, aperta e some (coordenadas da tela).
 * O elemento tocado recebe o aperto.
 */
export function tap(tl, touch, x, y, t, target) {
  tl.set(touch, { left: x, top: y, scale: 1.25, opacity: 0 }, t - 0.22);
  tl.to(touch, { opacity: 1, scale: 1, duration: 0.14, ease: 'power2.out' }, t - 0.22);
  tl.to(touch, { scale: 0.8, duration: 0.08, ease: 'power2.out' }, t);
  tl.to(touch, { opacity: 0, scale: 1.1, duration: 0.2, ease: 'power2.in' }, t + 0.12);
  if (target) press(tl, target, t);
}

/**
 * MorphButton: botão → círculo com spinner → check (→ opcionalmente, pílula de resultado).
 * `mb` precisa ter .mb-shape, .mb-idle, .mb-spin, .mb-check e, se `done`, .mb-done.
 */
export function morph(tl, mb, { loading, check, done = null, width, height }) {
  const shape = mb.querySelector('.mb-shape');
  const inset = width / 2 - height / 2;
  tl.to(shape, { left: inset, right: inset, borderRadius: height / 2, ...S.shape }, loading);
  swap(tl, mb.querySelector('.mb-idle'), mb.querySelector('.mb-spin'), loading);
  // spinner: gira em ritmo constante (860 ms por volta, como o CSS do componente)
  const turns = (check - loading) / 0.86;
  tl.fromTo(mb.querySelector('.mb-spin svg'), { rotation: -90 }, { rotation: -90 + 360 * turns, duration: check - loading, ease: 'none', immediateRender: false }, loading);
  swap(tl, mb.querySelector('.mb-spin'), mb.querySelector('.mb-check'), check);
  const path = mb.querySelector('.mb-check path');
  tl.set(path, { strokeDashoffset: 30 }, check);
  tl.to(path, { strokeDashoffset: 0, ...S.count }, check + 0.11); // drawStroke: ω 16, ζ 1 = SPRING_COUNT
  if (done) {
    tl.to(shape, { left: done.inset ?? 0, right: done.inset ?? 0, borderRadius: done.radius ?? height / 2, ...S.shape }, done.t);
    swap(tl, mb.querySelector('.mb-check'), mb.querySelector('.mb-done'), done.t);
  }
}

/** Sheet inferior: sobe com a mola de forma; o fundo escurece com ease-out. */
export function sheetOpen(tl, sheet, scrim, t) {
  tl.to(sheet, { yPercent: 0, ...S.shape }, t);
  tl.to(scrim, { opacity: 1, duration: 0.22, ease: 'power2.out' }, t);
}
export function sheetClose(tl, sheet, scrim, t) {
  tl.to(sheet, { yPercent: 105, ...S.enter }, t);
  tl.to(scrim, { opacity: 0, duration: 0.22, ease: 'power2.in' }, t + 0.05);
}

